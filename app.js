/**
 * PWA Horários de Pesca — dados 100% via APIs:
 * Open-Meteo (marinho, meteorologia, geocodificação) + MET Norway Sunrise 3.0 (sol/lua/fase).
 */

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const MET_SUN = 'https://api.met.no/weatherapi/sunrise/3.0/sun';
const MET_MOON = 'https://api.met.no/weatherapi/sunrise/3.0/moon';

/** MET Norway exige User-Agent identificável: https://api.met.no/doc/TermsOfService */
const MET_HEADERS = {
  'User-Agent': 'PescaPWA/1.0 (https://github.com/nandocg36/Site-de-pesca)',
  Accept: 'application/json',
};

const state = {
  place: null,
  marine: null,
  forecast: null,
  astroByDay: null,
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

async function fetchJson(url, init) {
  const res = await fetch(url, init);
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

/** Converte utc_offset_seconds da Open-Meteo para +HH:MM (MET Norway). */
function formatMetOffset(seconds) {
  const totalM = Math.round(seconds / 60);
  const sign = totalM >= 0 ? '+' : '-';
  const abs = Math.abs(totalM);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    headers: { 'Accept-Language': 'pt', 'User-Agent': 'PescaPWA/1.0 (https://github.com/nandocg36/Site-de-pesca)' },
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
    hourly: 'temperature_2m,pressure_msl,is_day',
    forecast_days: '8',
    timezone,
  });
  return fetchJson(`${FORECAST_URL}?${params}`);
}

async function fetchMetSunMoon(lat, lon, dateIso, offsetStr) {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    date: dateIso,
    offset: offsetStr,
  });
  const [sun, moon] = await Promise.all([
    fetchJson(`${MET_SUN}?${q}`, { headers: MET_HEADERS }),
    fetchJson(`${MET_MOON}?${q}`, { headers: MET_HEADERS }),
  ]);
  return { sun, moon };
}

/** Carrega sol/lua MET Norway para cada dia do calendário presente na série. */
async function loadAstroSeries(lat, lon, dayKeys, offsetStr) {
  const unique = [...new Set(dayKeys)].sort();
  const entries = await Promise.all(
    unique.map(async (d) => {
      const { sun, moon } = await fetchMetSunMoon(lat, lon, d, offsetStr);
      return [d, parseAstroDay(sun, moon)];
    })
  );
  return new Map(entries);
}

function parseTimeMaybe(s) {
  if (!s || typeof s !== 'string') return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function parseAstroDay(sunFeature, moonFeature) {
  const sp = sunFeature?.properties || {};
  const mp = moonFeature?.properties || {};
  const sunrise = parseTimeMaybe(sp.sunrise?.time);
  const sunset = parseTimeMaybe(sp.sunset?.time);
  const solarnoon = parseTimeMaybe(sp.solarnoon?.time);
  const moonrise = parseTimeMaybe(mp.moonrise?.time);
  const moonset = parseTimeMaybe(mp.moonset?.time);
  const moonphase = typeof mp.moonphase === 'number' ? mp.moonphase : null;
  return { sunrise, sunset, solarnoon, moonrise, moonset, moonphase };
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
  const isDay = [];
  for (let i = 0; i < mt.length; i++) {
    const t = mt[i];
    const j = idxF.get(t);
    if (j === undefined) continue;
    times.push(t);
    sea.push(marine.hourly.sea_level_height_msl[i]);
    sst.push(marine.hourly.sea_surface_temperature?.[i] ?? null);
    temp.push(forecast.hourly.temperature_2m[j]);
    press.push(forecast.hourly.pressure_msl[j]);
    const id = forecast.hourly.is_day?.[j];
    isDay.push(id === 1 ? 1 : id === 0 ? 0 : null);
  }
  return { times, sea, sst, temp, press, isDay };
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

/** Fase lunar em % (MET): picos em lua nova (~0) e cheia (~100). */
function moonPhaseBoostFromPercent(phasePct) {
  if (phasePct == null || !Number.isFinite(phasePct)) return 0.5;
  const x = phasePct / 100;
  return Math.max(0, Math.min(1, 1 - 2 * Math.abs(x - 0.5)));
}

/** Proximidade a nascer/pôr do sol (dados MET): “horas douradas”. */
function sunEdgeBoost(tMs, sunrise, sunset) {
  if (sunrise == null || sunset == null) return 0.5;
  const h = tMs / 3600000;
  const sr = sunrise / 3600000;
  const ss = sunset / 3600000;
  const before = Math.max(0, sr - h);
  const afterRise = Math.max(0, h - sr);
  const beforeSet = Math.max(0, ss - h);
  const afterSet = Math.max(0, h - ss);
  const distRiseEdge = Math.min(before, afterRise);
  const distSetEdge = Math.min(beforeSet, afterSet);
  const d = Math.min(distRiseEdge, distSetEdge);
  if (d <= 2) return 1;
  if (d <= 3.5) return 0.72;
  if (d <= 5) return 0.5;
  return 0.38;
}

function moonEventBoostFromTimes(moonrise, moonset) {
  const events = [moonrise, moonset].filter((x) => x != null);
  return (tMs) => {
    if (!events.length) return 0;
    let best = 0;
    for (const ev of events) {
      const d = Math.abs(tMs - ev) / 3600000;
      if (d < 1.75) best = Math.max(best, 1 - d / 1.75);
    }
    return best;
  };
}

function computeHourlyScores(lat, lon, aligned, astroByDay) {
  const { times, sea, sst, temp, press, isDay } = aligned;
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
  const moonEvCache = new Map();

  for (let i = 0; i < n; i++) {
    const tStr = times[i];
    const d = new Date(tStr);
    const tMs = d.getTime();
    const dayKey = tStr.slice(0, 10);
    const astro = astroByDay?.get(dayKey);

    const edgeB = astro ? sunEdgeBoost(tMs, astro.sunrise, astro.sunset) : 0.5;
    const id = isDay[i];
    let sunB = edgeB;
    if (id === 0) sunB = Math.max(0.22, edgeB * 0.45);
    else if (id === 1) sunB = Math.max(edgeB, 0.42);

    const moonP = moonPhaseBoostFromPercent(astro?.moonphase);
    if (!moonEvCache.has(dayKey)) {
      const a = astro || {};
      moonEvCache.set(dayKey, moonEventBoostFromTimes(a.moonrise, a.moonset));
    }
    const moonEv = moonEvCache.get(dayKey)(tMs);
    const illum = astro?.moonphase != null ? astro.moonphase / 100 : 0.5;
    const moonComb = Math.min(1, 0.55 * moonP + 0.35 * moonEv + 0.15 * (0.5 + Math.abs(illum - 0.5)));

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

function renderSummary(dayData, place, dateKey, astroByDay) {
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
  const astro = astroByDay?.get(dateKey);
  const parts = [];

  if (astro && (astro.sunrise || astro.sunset)) {
    const sr = astro.sunrise
      ? new Date(astro.sunrise).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '—';
    const ss = astro.sunset
      ? new Date(astro.sunset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '—';
    parts.push(`Sol (API MET Norway): nascer ${sr}, pôr ${ss}`);
  }

  if (astro && astro.moonphase != null) {
    const mr = astro.moonrise
      ? new Date(astro.moonrise).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const ms = astro.moonset
      ? new Date(astro.moonset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const ev = [mr ? `subida ${mr}` : null, ms ? `por ${ms}` : null].filter(Boolean).join(', ');
    parts.push(
      `Lua (API MET Norway): ~${astro.moonphase.toFixed(0)}% iluminada${ev ? ` · ${ev}` : ''}`
    );
  }

  sunRow.innerHTML = parts.length ? parts.join('<br/>') : '—';
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

    const offsetStr = formatMetOffset(forecast.utc_offset_seconds ?? 0);
    const dayKeys = aligned.times.map((t) => t.slice(0, 10));
    const astroByDay = await loadAstroSeries(place.latitude, place.longitude, dayKeys, offsetStr);
    state.astroByDay = astroByDay;

    const scores = computeHourlyScores(place.latitude, place.longitude, aligned, astroByDay);
    const dayData = groupByDay(aligned.times, scores, aligned.sea);

    const today = aligned.times[0].slice(0, 10);
    fillDaySelect(dayData, today);

    const renderForDate = (dateKey) => {
      renderSummary(dayData, { lat: place.latitude, lon: place.longitude, timezone: place.timezone }, dateKey, astroByDay);
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
