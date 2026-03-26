/**
 * PWA Horários de Pesca — dados Open-Meteo (marinho + meteorologia) + SunCalc (sol/lua).
 */

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

const state = {
  place: null,
  marine: null,
  forecast: null,
  chart: null,
};

const $ = (id) => document.getElementById(id);

function showError(msg) {
  const el = $('errorBox');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  $('errorBox').classList.add('hidden');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pedido falhou (${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(data.reason || 'Erro na API');
  return data;
}

async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=10&language=pt`;
  const data = await fetchJson(url);
  return data.results || [];
}

function formatPlace(r) {
  if (r.display_name) return r.display_name;
  const parts = [r.name, r.admin1, r.country].filter(Boolean);
  return parts.join(', ');
}

async function resolveTimezone(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m',
    forecast_days: '1',
    timezone: 'auto',
  });
  const data = await fetchJson(`${FORECAST_URL}?${params}`);
  return data.timezone || 'GMT';
}

async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    'accept-language': 'pt',
  });
  const res = await fetch(`${NOMINATIM_REVERSE}?${params}`, {
    headers: { 'Accept-Language': 'pt', 'User-Agent': 'PescaPWA/1.0 (educational; contact: none)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const a = data.address || {};
  const name = a.village || a.town || a.city || a.municipality || a.county || a.state || 'Local';
  const admin = a.state || a.region;
  const country = a.country;
  return {
    name,
    admin1: admin,
    country,
    latitude: lat,
    longitude: lon,
    display_name: data.display_name,
  };
}

async function loadMarine(lat, lon, timezone) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'sea_level_height_msl,sea_surface_temperature',
    forecast_days: '8',
    timezone,
    cell_selection: 'sea',
  });
  return fetchJson(`${MARINE_URL}?${params}`);
}

async function loadForecast(lat, lon, timezone) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m,pressure_msl',
    daily: 'sunrise,sunset',
    forecast_days: '8',
    timezone,
  });
  return fetchJson(`${FORECAST_URL}?${params}`);
}

/** Alinha séries horárias pelo campo time (ISO local). */
function alignByTime(marine, forecast) {
  const mt = marine?.hourly?.time || [];
  const ft = forecast?.hourly?.time || [];
  const idxF = new Map(ft.map((t, i) => [t, i]));
  const times = [];
  const sea = [];
  const sst = [];
  const temp = [];
  const press = [];
  for (let i = 0; i < mt.length; i++) {
    const t = mt[i];
    const j = idxF.get(t);
    if (j === undefined) continue;
    times.push(t);
    sea.push(marine.hourly.sea_level_height_msl[i]);
    sst.push(marine.hourly.sea_surface_temperature?.[i] ?? null);
    temp.push(forecast.hourly.temperature_2m[j]);
    press.push(forecast.hourly.pressure_msl[j]);
  }
  return { times, sea, sst, temp, press };
}

function normalize(arr, invert = false) {
  const valid = arr.filter((v) => v != null && Number.isFinite(v));
  if (!valid.length) return arr.map(() => 0.5);
  let min = Math.min(...valid);
  let max = Math.max(...valid);
  if (max - min < 1e-6) return arr.map(() => 0.5);
  return arr.map((v) => {
    if (v == null || !Number.isFinite(v)) return 0.5;
    let x = (v - min) / (max - min);
    if (invert) x = 1 - x;
    return Math.max(0, Math.min(1, x));
  });
}

/** Fase lunar: 1 em lua nova/cheia, 0 nos quartos. */
function moonPhaseBoost(phase) {
  return (Math.cos(4 * Math.PI * phase) + 1) / 2;
}

function hourAngleBoost(altitudeRad) {
  const deg = (altitudeRad * 180) / Math.PI;
  // Crepúsculo / horas douradas: sol pouco acima do horizonte
  if (deg >= -8 && deg <= 15) return 1;
  if (deg > 15 && deg < 35) return 0.55;
  if (deg >= -16 && deg < -8) return 0.75;
  return 0.25;
}

function moonEventBoost(date, lat, lon) {
  const SC = globalThis.SunCalc;
  if (!SC) return () => 0;
  try {
    const mt = SC.getMoonTimes(date, lat, lon);
    const events = [mt.rise, mt.set].filter(Boolean);
    return (tMs) => {
      let best = 0;
      for (const ev of events) {
        const d = Math.abs(tMs - ev.getTime()) / 3600000;
        if (d < 1.5) best = Math.max(best, 1 - d / 1.5);
      }
      return best;
    };
  } catch {
    return () => 0;
  }
}

function computeHourlyScores(lat, lon, aligned) {
  const { times, sea, sst, temp, press } = aligned;
  const n = times.length;
  const tideSpeed = new Array(n).fill(0);
  const tideTurn = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const h = sea[i];
    if (h == null || !Number.isFinite(h)) continue;
    const hm = i > 0 ? sea[i - 1] : h;
    const hp = i < n - 1 ? sea[i + 1] : h;
    tideSpeed[i] = (hp - hm) / 2;
    if (i > 0 && i < n - 1) {
      const a = sea[i] - sea[i - 1];
      const b = sea[i + 1] - sea[i];
      tideTurn[i] = Math.abs(a - b);
    }
  }
  const turnN = normalize(tideTurn);
  const speedAbs = tideSpeed.map((v) => Math.abs(v));
  const speedN = normalize(speedAbs);
  const speedSweet = speedN.map((v) => 1 - Math.abs(v - 0.45) * 1.8).map((x) => Math.max(0, Math.min(1, x)));

  const dPress = press.map((p, i) => (i === 0 ? 0 : p - press[i - 1]));
  const pressScore = dPress.map((dp) => {
    if (dp < -2.5) return 0.2;
    if (dp < -1.2) return 0.45;
    if (dp > 2) return 0.55;
    return 0.85;
  });

  const dTemp = temp.map((t, i) => (i === 0 ? 0 : Math.abs(t - temp[i - 1])));
  const tempScore = dTemp.map((dt) => Math.max(0, Math.min(1, 1 - dt / 4)));

  const sstScore = normalize(
    sst.map((v) => (v == null ? null : v)),
    false
  );

  const scores = [];
  const moonBoostFnCache = new Map();

  for (let i = 0; i < n; i++) {
    const tStr = times[i];
    const d = new Date(tStr);
    const tMs = d.getTime();

    const SC = globalThis.SunCalc;
    const sun = SC ? SC.getPosition(d, lat, lon) : { altitude: 0 };
    const sunB = hourAngleBoost(sun.altitude);

    const moonIll = SC
      ? SC.getMoonIllumination(d)
      : { phase: 0.25, fraction: 0.5 };
    const moonP = moonPhaseBoost(moonIll.phase);
    const moonFrac = moonIll.fraction;

    const dayKey = tStr.slice(0, 10);
    if (!moonBoostFnCache.has(dayKey)) {
      const noon = new Date(`${dayKey}T12:00:00`);
      moonBoostFnCache.set(dayKey, moonEventBoost(noon, lat, lon));
    }
    const moonEv = moonBoostFnCache.get(dayKey)(tMs);

    const moonComb = Math.min(1, 0.55 * moonP + 0.35 * moonEv + 0.15 * (0.5 + Math.abs(moonFrac - 0.5)));

    let sstS = sst[i] != null ? 0.08 * (sstScore[i] || 0.5) : 0.04;

    const raw =
      0.28 * turnN[i] +
      0.12 * speedSweet[i] +
      0.22 * moonComb +
      0.18 * sunB +
      0.12 * pressScore[i] +
      0.1 * tempScore[i] +
      sstS;

    scores.push(Math.round(Math.max(0, Math.min(100, raw * 100))));
  }

  return scores;
}

function groupByDay(times, scores, sea) {
  const days = new Map();
  for (let i = 0; i < times.length; i++) {
    const day = times[i].slice(0, 10);
    if (!days.has(day)) days.set(day, { scores: [], sea: [] });
    const g = days.get(day);
    g.scores.push(scores[i]);
    if (sea[i] != null) g.sea.push(sea[i]);
  }
  const out = [];
  for (const [date, g] of days) {
    const avg = g.scores.reduce((a, b) => a + b, 0) / g.scores.length;
    const mx = Math.max(...g.scores);
    out.push({ date, avgScore: Math.round(avg), maxScore: mx, hours: g.scores.length });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function weekdayPt(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderSummary(dayData, place, dailyForecast, dateKey) {
  const grid = $('summaryGrid');
  grid.innerHTML = '';
  const idx = dayData.findIndex((d) => d.date === dateKey);
  const day = idx >= 0 ? dayData[idx] : dayData[0];
  if (!day) return;

  const cells = [
    ['Média do dia', String(day.avgScore) + '/100'],
    ['Melhor hora', String(day.maxScore) + '/100'],
    ['Coordenadas', `${place.lat.toFixed(3)}°, ${place.lon.toFixed(3)}°`],
    ['Fuso', place.timezone || '—'],
  ];
  for (const [label, value] of cells) {
    const div = document.createElement('div');
    div.className = 'summary-cell';
    div.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    grid.appendChild(div);
  }

  const sunRow = $('moonRow');
  const sunDaily = dailyForecast?.daily;
  const di = sunDaily?.time?.indexOf(dateKey) ?? -1;
  let sunText = '';
  if (di >= 0 && sunDaily.sunrise?.[di] && sunDaily.sunset?.[di]) {
    sunText = `Nascer do sol: ${fmtTime(sunDaily.sunrise[di])} · Pôr do sol: ${fmtTime(sunDaily.sunset[di])}`;
  }
  const noon = new Date(`${dateKey}T12:00:00`);
  const SC = globalThis.SunCalc;
  const moonIll = SC ? SC.getMoonIllumination(noon) : { fraction: 0.5 };
  const phasePct = Math.round(moonIll.fraction * 100);
  const moonLine = `Lua: ~${phasePct}% iluminada (fase astronómica para o dia).`;
  sunRow.innerHTML = [sunText, moonLine].filter(Boolean).join('<br/>');
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function renderForecastList(dayData) {
  const list = $('forecastList');
  list.innerHTML = '';
  for (const d of dayData) {
    if (d.hours < 20) continue;
    const row = document.createElement('div');
    row.className = 'forecast-item';
    const pillClass = d.avgScore >= 62 ? 'score-high' : d.avgScore >= 45 ? 'score-mid' : 'score-low';
    row.innerHTML = `
      <span class="day-name">${weekdayPt(d.date)}</span>
      <span class="score-pill ${pillClass}">média ${d.avgScore}</span>
    `;
    list.appendChild(row);
  }
}

function updateChart(labels, scores, seaNorm) {
  const canvas = $('dayChart');
  const ctx = canvas.getContext('2d');
  if (state.chart) state.chart.destroy();

  state.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Índice',
          data: scores,
          backgroundColor: scores.map((s) =>
            s >= 65 ? 'rgba(61, 214, 140, 0.75)' : s >= 45 ? 'rgba(61, 156, 245, 0.65)' : 'rgba(240, 107, 107, 0.55)'
          ),
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Maré (rel.)',
          data: seaNorm,
          borderColor: 'rgba(255, 200, 120, 0.9)',
          borderDash: [4, 4],
          tension: 0.35,
          pointRadius: 0,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y;
              if (ctx.datasetIndex === 0) return `Índice: ${v}`;
              return `Maré (norm.): ${v?.toFixed ? v.toFixed(2) : v}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
            color: '#8fa3c4',
          },
          grid: { color: 'rgba(42, 63, 107, 0.5)' },
        },
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: 'Índice', color: '#8fa3c4' },
          ticks: { color: '#8fa3c4' },
          grid: { color: 'rgba(42, 63, 107, 0.5)' },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 1,
          title: { display: true, text: 'Nível mar', color: '#c9a227' },
          ticks: { display: false },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function sliceDay(times, scores, sea, dateKey) {
  const idx = [];
  for (let i = 0; i < times.length; i++) {
    if (times[i].startsWith(dateKey)) idx.push(i);
  }
  const labels = idx.map((i) => times[i].slice(11, 16));
  const sc = idx.map((i) => scores[i]);
  const se = idx.map((i) => sea[i]);
  const seaSlice = se.filter((v) => v != null && Number.isFinite(v));
  let seaNorm = se.map(() => 0.5);
  if (seaSlice.length) {
    const mn = Math.min(...seaSlice);
    const mx = Math.max(...seaSlice);
    const span = mx - mn || 1;
    seaNorm = se.map((v) => (v != null && Number.isFinite(v) ? (v - mn) / span : null));
  }
  return { labels, scores: sc, seaNorm };
}

function fillDaySelect(dayData, selected) {
  const sel = $('daySelect');
  sel.innerHTML = '';
  for (const d of dayData) {
    if (d.hours < 4) continue;
    const opt = document.createElement('option');
    opt.value = d.date;
    opt.textContent = `${weekdayPt(d.date)} — média ${d.avgScore}`;
    sel.appendChild(opt);
  }
  if ([...sel.options].some((o) => o.value === selected)) sel.value = selected;
}

async function selectPlace(place) {
  state.place = place;
  hideError();
  $('loading').classList.remove('hidden');
  $('mainContent').classList.add('hidden');

  try {
    const [marine, forecast] = await Promise.all([
      loadMarine(place.latitude, place.longitude, place.timezone),
      loadForecast(place.latitude, place.longitude, place.timezone),
    ]);
    state.marine = marine;
    state.forecast = forecast;

    const aligned = alignByTime(marine, forecast);
    if (!aligned.times.length) throw new Error('Sem dados horários para esta localização.');

    const scores = computeHourlyScores(place.latitude, place.longitude, aligned);
    const dayData = groupByDay(aligned.times, scores, aligned.sea);

    const today = aligned.times[0].slice(0, 10);
    fillDaySelect(dayData, today);

    const renderForDate = (dateKey) => {
      renderSummary(dayData, { lat: place.latitude, lon: place.longitude, timezone: place.timezone }, forecast, dateKey);
      const { labels, scores: sc, seaNorm } = sliceDay(aligned.times, scores, aligned.sea, dateKey);
      updateChart(labels, sc, seaNorm);
    };

    $('daySelect').onchange = () => renderForDate($('daySelect').value);
    renderForDate($('daySelect').value);
    renderForecastList(dayData);

    $('locationLabel').textContent = formatPlace(place);
    $('mainContent').classList.remove('hidden');
  } catch (e) {
    showError(e.message || 'Erro ao carregar dados.');
  } finally {
    $('loading').classList.add('hidden');
  }
}

function setupSearch() {
  const input = $('placeQuery');
  const sug = $('suggestions');
  let timer;

  const hideSug = () => {
    sug.classList.add('hidden');
    sug.innerHTML = '';
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value;
    timer = setTimeout(async () => {
      try {
        const results = await searchPlaces(v);
        sug.innerHTML = '';
        if (!results.length) {
          hideSug();
          return;
        }
        for (const r of results) {
          const li = document.createElement('li');
          li.tabIndex = 0;
          li.textContent = formatPlace(r);
          li.addEventListener('click', () => {
            input.value = formatPlace(r);
            hideSug();
            selectPlace(r);
          });
          li.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') li.click();
          });
          sug.appendChild(li);
        }
        sug.classList.remove('hidden');
      } catch {
        hideSug();
      }
    }, 280);
  });

  $('btnSearch').addEventListener('click', async () => {
    hideSug();
    try {
      const results = await searchPlaces(input.value);
      if (!results.length) {
        showError('Nenhum local encontrado. Tente outro nome.');
        return;
      }
      await selectPlace(results[0]);
    } catch (e) {
      showError(e.message || 'Falha na pesquisa.');
    }
  });

  $('btnGeo').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showError('O seu dispositivo não suporta geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        hideError();
        try {
          const tz = await resolveTimezone(lat, lon);
          let place = {
            name: 'Aqui',
            latitude: lat,
            longitude: lon,
            timezone: tz,
            country: '',
            admin1: '',
          };
          try {
            const rev = await reverseGeocode(lat, lon);
            if (rev) place = { ...rev, timezone: tz };
          } catch {
            /* mantém nome genérico */
          }
          input.value = formatPlace(place);
          await selectPlace(place);
        } catch (e) {
          showError(e.message || 'Falha ao resolver fuso horário.');
        }
      },
      () => showError('Não foi possível obter a localização. Verifique as permissões.'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) hideSug();
  });
}

$('metricsToggle').addEventListener('click', () => {
  const panel = $('metricsPanel');
  const open = panel.classList.toggle('hidden');
  $('metricsToggle').setAttribute('aria-expanded', String(!open));
});

setupSearch();
