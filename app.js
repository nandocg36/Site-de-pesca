/**
 * PWA Horários de Pesca — Open-Meteo + MET Norway + mapa Leaflet.
 */

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const MET_SUN = 'https://api.met.no/weatherapi/sunrise/3.0/sun';
const MET_MOON = 'https://api.met.no/weatherapi/sunrise/3.0/moon';

const MET_HEADERS = {
  'User-Agent': 'PescaPWA/1.0 (https://github.com/nandocg36/Site-de-pesca)',
  Accept: 'application/json',
};

const state = {
  map: null,
  marker: null,
  baseLayers: null,
  reloadTimer: null,
  chart: null,
  /** último resultado detalhado por hora (alinhado com `times`) */
  scoreDetails: null,
  /** @type {{ aligned: object, scores: number[], scoreDetails: object[], dayData: object[], astroByDay: Map, forecast: object, isInland: boolean, placeLabel: string, tz: string } | null} */
  bundle: null,
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

function getWaterContext() {
  return $('waterContext').value === 'inland' ? 'inland' : 'coastal';
}

function isInlandContext() {
  return getWaterContext() === 'inland';
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, cache: 'no-store' });
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
  return { timezone: data.timezone || 'GMT', utc_offset_seconds: data.utc_offset_seconds ?? 0 };
}

async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    'accept-language': 'pt',
  });
  const res = await fetch(`${NOMINATIM_REVERSE}?${params}`, {
    cache: 'no-store',
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

function marineCellSelection() {
  return isInlandContext() ? 'nearest' : 'sea';
}

async function loadMarine(lat, lon, timezone) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'sea_level_height_msl,sea_surface_temperature',
    forecast_days: '8',
    timezone,
    cell_selection: marineCellSelection(),
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
  return {
    sunrise: parseTimeMaybe(sp.sunrise?.time),
    sunset: parseTimeMaybe(sp.sunset?.time),
    solarnoon: parseTimeMaybe(sp.solarnoon?.time),
    moonrise: parseTimeMaybe(mp.moonrise?.time),
    moonset: parseTimeMaybe(mp.moonset?.time),
    moonphase: typeof mp.moonphase === 'number' ? mp.moonphase : null,
  };
}

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

function moonPhaseBoostFromPercent(phasePct) {
  if (phasePct == null || !Number.isFinite(phasePct)) return 0.5;
  const x = phasePct / 100;
  return Math.max(0, Math.min(1, 1 - 2 * Math.abs(x - 0.5)));
}

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

/**
 * Calcula índice horário e componentes normalizados (0–1) para explicar cada hora.
 * @returns {{ scores: number[], details: object[] }}
 */
function computeHourlyScoresDetailed(lat, lon, aligned, astroByDay) {
  const { times, sea, sst, temp, press, isDay } = aligned;
  const n = times.length;
  const tideTurn = new Array(n).fill(0);
  const tideSpeed = new Array(n).fill(0);
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
  const details = [];
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

    const sstS = sst[i] != null ? 0.08 * (sstScore[i] || 0.5) : 0.04;

    const raw =
      0.28 * turnN[i] +
      0.12 * speedSweet[i] +
      0.22 * moonComb +
      0.18 * sunB +
      0.12 * pressScore[i] +
      0.1 * tempScore[i] +
      sstS;

    scores.push(Math.round(Math.max(0, Math.min(100, raw * 100))));
    details.push({
      turnN: turnN[i],
      speedSweet: speedSweet[i],
      moonComb,
      sunB,
      pressScore: pressScore[i],
      tempScore: tempScore[i],
      sstPresent: sst[i] != null && Number.isFinite(sst[i]),
      isDay: id,
      dPress: i === 0 ? 0 : dPress[i],
      dTemp: i === 0 ? 0 : dTemp[i],
    });
  }

  return { scores, details };
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
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function weekdayShort(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function hourFromTimeStr(t) {
  const h = parseInt(t.slice(11, 13), 10);
  return Number.isFinite(h) ? h : 12;
}

function formatHourRange(tStart, tEnd) {
  const a = tStart.slice(11, 16).replace(':', 'h');
  const b = tEnd.slice(11, 16).replace(':', 'h');
  return `${a}–${b}`;
}

function formatHourLabel(isoLocal) {
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) return isoLocal.slice(11, 16);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function hourQualityWords(score) {
  if (score >= 68) return { label: 'Muito boa', cls: 'hour-good', badge: 'b-good' };
  if (score >= 52) return { label: 'Razoável', cls: 'hour-mid', badge: 'b-mid' };
  if (score >= 40) return { label: 'Fraca', cls: 'hour-poor', badge: 'b-poor' };
  return { label: 'Má', cls: 'hour-poor', badge: 'b-poor' };
}

function buildHourExplanations(detail, isInland) {
  const hi = 0.62;
  const lo = 0.38;
  const lines = [];

  if (!isInland) {
    if (detail.turnN >= hi) {
      lines.push('Maré: <strong>viragem ou mudança de fluxo</strong> — hora em que o modelo marca mais movimento no nível do mar (frequentemente janela interessante).');
    } else if (detail.turnN <= lo) {
      lines.push('Maré: <strong>pouca viragem</strong> nesta hora — o índice não é puxado pela maré.');
    } else {
      lines.push('Maré: influência <strong>média</strong> (nem pico nem vale forte no modelo).');
    }
  } else {
    lines.push('Água doce / interior: o sinal de <strong>maré no modelo é pouco fiável</strong> aqui; o índice depende mais de lua, sol e clima.');
  }

  if (detail.moonComb >= hi) {
    lines.push('Lua: <strong>fase ou horário</strong> considerados favoráveis (tradição solunar).');
  } else if (detail.moonComb <= lo) {
    lines.push('Lua: <strong>menos favorável</strong> nesta hora para o critério usado.');
  }

  if (detail.sunB >= hi) {
    lines.push('Sol: <strong>perto do nascer, do pôr ou luz baixa</strong> — “horas douradas”.');
  } else if (detail.sunB <= 0.34) {
    lines.push('Sol: <strong>sol alto ou noite</strong> sem janela de luz tão favorável.');
  }

  if (detail.pressScore >= 0.78) {
    lines.push('Pressão: <strong>sem queda brusca</strong> na última hora — ar mais estável.');
  } else if (detail.pressScore <= 0.48) {
    lines.push('Pressão: <strong>queda ou mudança rápida</strong> — tempo pode instabilizar.');
  }

  if (detail.tempScore >= 0.72) {
    lines.push('Temperatura do ar: <strong>mudou pouco</strong> na última hora.');
  } else if (detail.tempScore <= 0.45) {
    lines.push('Temperatura do ar: <strong>variação forte</strong> na última hora.');
  }

  if (detail.sstPresent) {
    lines.push('Água do mar: há dado de temperatura superficial no modelo para esta grelha.');
  }

  return lines;
}

function renderHourlyList(dateKey, times, scores, scoreDetails, isInland) {
  const el = $('hourlyList');
  if (!el) return;
  const dayIdx = sliceDayIndices(times, dateKey);
  if (!dayIdx.length) {
    el.innerHTML = '';
    return;
  }

  const sortMode = $('hourlySort')?.value || 'best';
  const rows = dayIdx.map((gi) => ({
    gi,
    time: times[gi],
    score: scores[gi],
    detail: scoreDetails[gi],
  }));

  if (sortMode === 'best') {
    rows.sort((a, b) => b.score - a.score || a.time.localeCompare(b.time));
  }

  const bestScore = Math.max(...rows.map((r) => r.score));
  el.innerHTML = '';
  for (const r of rows) {
    const q = hourQualityWords(r.score);
    const expl = buildHourExplanations(r.detail || {}, isInland);
    const isBest = r.score === bestScore && bestScore > 0;
    const row = document.createElement('article');
    row.className = `hourly-row ${q.cls}`;
    row.setAttribute('aria-label', `Hora ${formatHourLabel(r.time)}, índice ${r.score}`);
    const badgeExtra = isBest && sortMode === 'best' ? ' · melhor hora do dia' : '';
    row.innerHTML = `
      <div class="hourly-time">${formatHourLabel(r.time)}</div>
      <div class="hourly-meta">
        <span class="hourly-badge ${q.badge}">${q.label}</span>
        <span class="hourly-score">Índice ${r.score}/100${badgeExtra}</span>
      </div>
      <div class="hourly-why">
        <strong>Porquê:</strong>
        <ul>${expl.map((x) => `<li>${x}</li>`).join('')}</ul>
      </div>
    `;
    el.appendChild(row);
  }
}

/** Períodos do dia em hora local (string API). */
const PERIOD_DEFS = [
  { id: 'madrugada', label: 'Madrugada', match: (h) => h >= 0 && h <= 5 },
  { id: 'manha', label: 'Manhã', match: (h) => h >= 6 && h <= 11 },
  { id: 'tarde', label: 'Tarde', match: (h) => h >= 12 && h <= 17 },
  { id: 'noite', label: 'Noite', match: (h) => h >= 18 && h <= 23 },
];

function gradeLabel(avg) {
  if (avg >= 68) return { text: 'Muito favorável', cls: 'grade-high' };
  if (avg >= 52) return { text: 'Razoável', cls: 'grade-mid' };
  if (avg >= 40) return { text: 'Fraco', cls: 'grade-low' };
  return { text: 'Desfavorável', cls: 'grade-low' };
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sliceDayIndices(times, dateKey) {
  const idx = [];
  for (let i = 0; i < times.length; i++) {
    if (times[i].startsWith(dateKey)) idx.push(i);
  }
  return idx;
}

function findContiguousWindows(dayIndices, scores, predicate) {
  const wins = [];
  let s = null;
  for (let k = 0; k < dayIndices.length; k++) {
    const gi = dayIndices[k];
    const ok = predicate(scores[gi]);
    if (ok && s === null) s = k;
    if (!ok && s !== null) {
      wins.push([s, k - 1]);
      s = null;
    }
  }
  if (s !== null) wins.push([s, dayIndices.length - 1]);
  return wins.map(([a, b]) => ({ a, b, len: b - a + 1, avg: mean(dayIndices.slice(a, b + 1).map((gi) => scores[gi])) }));
}

function renderRecommendations(dateKey, times, scores, dayAvg, isInland) {
  const dayIdx = sliceDayIndices(times, dateKey);
  const intro = $('recIntro');
  const verdict = $('recVerdict');
  const periodsEl = $('recPeriods');
  const windowsEl = $('recWindows');

  if (!dayIdx.length) {
    intro.textContent = '';
    verdict.innerHTML = '';
    periodsEl.innerHTML = '';
    windowsEl.innerHTML = '';
    return;
  }

  intro.textContent = `Para ${weekdayPt(dateKey)}, com base no ponto que marcaste no mapa. O índice vai de 0 a 100 (estimativa, não garantia de peixe).`;

  const periodStats = PERIOD_DEFS.map((pd) => {
    const vals = [];
    for (const i of dayIdx) {
      if (pd.match(hourFromTimeStr(times[i]))) vals.push(scores[i]);
    }
    const avg = vals.length ? Math.round(mean(vals)) : null;
    return { ...pd, avg, n: vals.length };
  }).filter((p) => p.n > 0);

  const bestPeriod = periodStats.reduce(
    (best, p) => (p.avg != null && (best == null || p.avg > best.avg) ? p : best),
    null
  );
  const worstPeriod = periodStats.reduce(
    (worst, p) => (p.avg != null && (worst == null || p.avg < worst.avg) ? p : worst),
    null
  );

  let vClass = 'verdict-mid';
  let vHtml = '';
  if (dayAvg >= 58) {
    vClass = '';
    vHtml = `<strong>Visão geral: boas condições estimadas</strong> para este dia (média ~${dayAvg}/100). `;
  } else if (dayAvg >= 45) {
    vClass = 'verdict-mid';
    vHtml = `<strong>Visão geral: condições médias</strong> (média ~${dayAvg}/100). `;
  } else {
    vClass = 'verdict-low';
    vHtml = `<strong>Visão geral: dia mais difícil</strong> segundo o modelo (média ~${dayAvg}/100). `;
  }

  if (bestPeriod && bestPeriod.avg != null) {
    const g = gradeLabel(bestPeriod.avg);
    vHtml += `O período com melhor nota é a <strong>${bestPeriod.label.toLowerCase()}</strong>, com média de cerca de <strong>${bestPeriod.avg}/100</strong> (${g.text.toLowerCase()}). `;
  }
  if (worstPeriod && worstPeriod.avg != null && worstPeriod.id !== bestPeriod?.id) {
    vHtml += `A <strong>${worstPeriod.label.toLowerCase()}</strong> tende a ser mais fraca (~${worstPeriod.avg}/100). `;
  }
  if (isInland) {
    vHtml +=
      ' <em>Nota:</em> em lago/rio o modelo de maré é menos fiável; dá mais peso ao clima e à lua/sol.';
  }
  verdict.className = 'verdict-box ' + vClass;
  verdict.innerHTML = vHtml;

  periodsEl.innerHTML = '';
  for (const p of periodStats) {
    if (p.avg == null) continue;
    const g = gradeLabel(p.avg);
    const card = document.createElement('div');
    card.className = `period-card ${g.cls}`;
    card.innerHTML = `
      <div class="period-name">${p.label}</div>
      <div class="period-grade">${p.avg}/100 — ${g.text}</div>
      <div class="period-detail">Média das ${p.n} horas deste período</div>
    `;
    periodsEl.appendChild(card);
  }

  const goodThreshold = Math.max(52, dayAvg - 2);
  const goodWins = findContiguousWindows(dayIdx, scores, (s) => s >= goodThreshold)
    .filter((w) => w.len >= 2)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);

  const poorWins = findContiguousWindows(dayIdx, scores, (s) => s < 42)
    .filter((w) => w.len >= 2)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 2);

  windowsEl.innerHTML = '';
  const addHeading = (text) => {
    const h = document.createElement('p');
    h.className = 'muted small';
    h.style.margin = '0 0 0.35rem';
    h.textContent = text;
    windowsEl.appendChild(h);
  };

  if (goodWins.length) {
    addHeading('Janelas contínuas em que o índice se mantém mais alto:');
    for (const w of goodWins) {
      const i0 = dayIdx[w.a];
      const i1 = dayIdx[w.b];
      const line = document.createElement('div');
      line.className = 'window-line';
      line.textContent = `Entre ${formatHourRange(times[i0], times[i1])} — média ~${Math.round(w.avg)}/100 no intervalo.`;
      windowsEl.appendChild(line);
    }
  } else {
    addHeading('Não há blocos longos de horas seguidas muito altas; olha o gráfico para picos isolados.');
  }

  if (poorWins.length) {
    addHeading('Períodos contínuos mais fracos:');
    for (const w of poorWins) {
      const i0 = dayIdx[w.a];
      const i1 = dayIdx[w.b];
      const line = document.createElement('div');
      line.className = 'window-line window-poor';
      line.textContent = `Entre ${formatHourRange(times[i0], times[i1])} — média ~${Math.round(w.avg)}/100.`;
      windowsEl.appendChild(line);
    }
  }
}

function renderSummary(dayData, place, dateKey, astroByDay, marineMeta) {
  const grid = $('summaryGrid');
  grid.innerHTML = '';
  const idx = dayData.findIndex((d) => d.date === dateKey);
  const day = idx >= 0 ? dayData[idx] : dayData[0];
  if (!day) return;

  const gridLat = marineMeta?.latitude != null ? Number(marineMeta.latitude).toFixed(4) : place.lat.toFixed(4);
  const gridLon = marineMeta?.longitude != null ? Number(marineMeta.longitude).toFixed(4) : place.lon.toFixed(4);

  const cells = [
    ['Média do dia', `${day.avgScore}/100`],
    ['Melhor hora (pico)', `${day.maxScore}/100`],
    ['Ponto no mapa', `${place.lat.toFixed(5)}°, ${place.lon.toFixed(5)}°`],
    ['Grelha marinho (modelo)', `${gridLat}°, ${gridLon}°`],
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
    parts.push(`Sol (MET Norway): nascer ${sr} · pôr ${ss}`);
  }

  if (astro && astro.moonphase != null) {
    const mr = astro.moonrise
      ? new Date(astro.moonrise).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const ms = astro.moonset
      ? new Date(astro.moonset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const ev = [mr ? `subida ${mr}` : null, ms ? `por ${ms}` : null].filter(Boolean).join(' · ');
    parts.push(`Lua: ~${astro.moonphase.toFixed(0)}% iluminada${ev ? ` · ${ev}` : ''}`);
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
      <span class="day-name">${weekdayShort(d.date)}</span>
      <span class="score-pill ${pillClass}">média ${d.avgScore}/100</span>
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
            s >= 65 ? 'rgba(62, 224, 168, 0.8)' : s >= 45 ? 'rgba(78, 176, 255, 0.65)' : 'rgba(255, 123, 123, 0.55)'
          ),
          borderRadius: 6,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Maré',
          data: seaNorm,
          borderColor: 'rgba(255, 210, 140, 0.95)',
          borderDash: [5, 5],
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
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14, color: '#8ba3c2' },
          grid: { color: 'rgba(42, 74, 111, 0.45)' },
        },
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: 'Índice', color: '#8ba3c2' },
          ticks: { color: '#8ba3c2' },
          grid: { color: 'rgba(42, 74, 111, 0.45)' },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 1,
          title: { display: true, text: 'Maré', color: '#e8c078' },
          ticks: { display: false },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function sliceDay(times, scores, sea, dateKey) {
  const idx = sliceDayIndices(times, dateKey);
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
    opt.textContent = `${weekdayShort(d.date)} — média ${d.avgScore}/100`;
    sel.appendChild(opt);
  }
  if ([...sel.options].some((o) => o.value === selected)) sel.value = selected;
}

function syncInputsFromLatLng(lat, lon) {
  $('inputLat').value = Number(lat).toFixed(5);
  $('inputLon').value = Number(lon).toFixed(5);
}

function getLatLonFromInputs() {
  const lat = parseFloat($('inputLat').value);
  const lon = parseFloat($('inputLon').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function fishingPinIcon() {
  return L.divIcon({
    className: 'fishing-pin-marker',
    html: '<div class="pin-ring"></div><div class="pin-core"></div>',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -24],
  });
}

function updateMarkerPopup(lat, lon) {
  if (!state.marker) return;
  state.marker.setPopupContent(
    `<p class="map-popup-coords"><strong>Ponto de pesca</strong><br/>${lat.toFixed(5)}°, ${lon.toFixed(5)}°</p>`
  );
}

function initMap() {
  if (state.map || typeof L === 'undefined') return;
  const mapEl = $('map');
  if (!mapEl) return;

  state.map = L.map('map', { zoomControl: true }).setView([40.2, -8.4], 6);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  });

  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    }
  );

  satellite.addTo(state.map);
  state.baseLayers = { Satélite: satellite, Mapa: osm };
  L.control.layers(state.baseLayers, null, { position: 'topright' }).addTo(state.map);

  state.marker = L.marker([40.2, -8.4], {
    draggable: true,
    icon: fishingPinIcon(),
    riseOnHover: true,
    title: 'Ponto de pesca — arrastar ou clicar no mapa para mover',
  }).addTo(state.map);
  state.marker.bindPopup('');
  updateMarkerPopup(40.2, -8.4);

  state.marker.on('dragstart', () => {
    state.marker.closePopup();
  });

  state.marker.on('dragend', () => {
    const ll = state.marker.getLatLng();
    syncInputsFromLatLng(ll.lat, ll.lng);
    updateMarkerPopup(ll.lat, ll.lng);
    state.marker.openPopup();
    scheduleReloadFromMap();
  });

  state.map.on('click', (e) => {
    state.marker.setLatLng(e.latlng);
    syncInputsFromLatLng(e.latlng.lat, e.latlng.lng);
    updateMarkerPopup(e.latlng.lat, e.latlng.lng);
    state.marker.openPopup();
    scheduleReloadFromMap();
  });

  window.addEventListener('resize', () => {
    state.map?.invalidateSize();
  });
  requestAnimationFrame(() => {
    state.map?.invalidateSize();
  });
  setTimeout(() => state.map?.invalidateSize(), 400);
}

function scheduleReloadFromMap() {
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(() => {
    const ll = state.marker.getLatLng();
    loadAtCoordinates(ll.lat, ll.lng, { updateLabel: true });
  }, 550);
}

/**
 * @param {object} opts
 * @param {boolean} [opts.updateLabel] — se true (omissão), tenta reverse geocode quando não há label
 * @param {string} [opts.label] — texto fixo do local
 * @param {string} [opts.timezone] — se já conhecido (ex.: resultado da pesquisa)
 * @param {string} [opts.locationHint] — texto extra sob o label (mapa / pesquisa)
 */
async function loadAtCoordinates(lat, lon, opts = {}) {
  hideError();
  $('loading').classList.remove('hidden');
  $('mainContent').classList.add('hidden');

  const updateLabel = opts.updateLabel !== false;

  try {
    let timezone = opts.timezone;
    let utcPre = 0;
    if (!timezone) {
      const z = await resolveTimezone(lat, lon);
      timezone = z.timezone;
      utcPre = z.utc_offset_seconds;
    }

    const [marine, forecast] = await Promise.all([
      loadMarine(lat, lon, timezone),
      loadForecast(lat, lon, timezone),
    ]);

    let placeLabel = opts.label;
    if (!placeLabel && updateLabel) {
      try {
        const rev = await reverseGeocode(lat, lon);
        if (rev) placeLabel = formatPlace(rev);
      } catch {
        /* ignore */
      }
    }
    if (!placeLabel) placeLabel = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

    const aligned = alignByTime(marine, forecast);
    if (!aligned.times.length) throw new Error('Sem dados horários para este ponto.');

    const offsetStr = formatMetOffset(forecast.utc_offset_seconds ?? utcPre ?? 0);
    const dayKeys = aligned.times.map((t) => t.slice(0, 10));
    const astroByDay = await loadAstroSeries(lat, lon, dayKeys, offsetStr);

    const { scores, details: scoreDetails } = computeHourlyScoresDetailed(lat, lon, aligned, astroByDay);
    const dayData = groupByDay(aligned.times, scores, aligned.sea);
    const inland = isInlandContext();

    state.bundle = {
      aligned,
      scores,
      scoreDetails,
      dayData,
      astroByDay,
      forecast,
      isInland: inland,
      placeLabel,
      tz: timezone,
      lat,
      lon,
      marineMeta: { latitude: marine.latitude, longitude: marine.longitude },
    };
    state.scoreDetails = scoreDetails;

    const today = aligned.times[0].slice(0, 10);
    fillDaySelect(dayData, today);

    const renderForDate = (dateKey) => {
      const dayRow = dayData.find((d) => d.date === dateKey);
      const dayAvg = dayRow?.avgScore ?? 0;
      renderRecommendations(dateKey, aligned.times, scores, dayAvg, inland);
      renderSummary(
        dayData,
        { lat, lon, timezone },
        dateKey,
        astroByDay,
        state.bundle.marineMeta
      );
      const { labels, scores: sc, seaNorm } = sliceDay(aligned.times, scores, aligned.sea, dateKey);
      updateChart(labels, sc, seaNorm);
      renderHourlyList(dateKey, aligned.times, scores, scoreDetails, inland);
    };

    $('daySelect').onchange = () => renderForDate($('daySelect').value);
    renderForDate($('daySelect').value);
    renderForecastList(dayData);

    const hint =
      opts.locationHint ||
      '<span class="muted">Afinar no mapa ou nas coordenadas e «Aplicar» para recalcular.</span>';
    $('locationLabel').innerHTML = `<strong>Ponto ativo:</strong> ${placeLabel}<br/>${hint}`;
    $('mainContent').classList.remove('hidden');
    requestAnimationFrame(() => state.map?.invalidateSize());
  } catch (e) {
    showError(e.message || 'Erro ao carregar dados.');
  } finally {
    $('loading').classList.add('hidden');
  }
}

function selectPlaceFromSearch(place) {
  const lat = place.latitude;
  const lon = place.longitude;
  if (state.map && state.marker) {
    state.map.setView([lat, lon], 12);
    state.marker.setLatLng([lat, lon]);
    updateMarkerPopup(lat, lon);
    state.marker.openPopup();
  }
  syncInputsFromLatLng(lat, lon);
  return loadAtCoordinates(lat, lon, {
    updateLabel: false,
    label: formatPlace(place),
    timezone: place.timezone,
    locationHint:
      '<span class="muted">Arrasta o pin no mapa até ao cais, barco ou margem exata onde vais pescar.</span>',
  });
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
            initMap();
            selectPlaceFromSearch(r);
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
      initMap();
      selectPlaceFromSearch(results[0]);
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
        initMap();
        state.map.setView([lat, lon], 13);
        state.marker.setLatLng([lat, lon]);
        syncInputsFromLatLng(lat, lon);
        updateMarkerPopup(lat, lon);
        state.marker.openPopup();
        await loadAtCoordinates(lat, lon, { updateLabel: true });
      },
      () => showError('Não foi possível obter a localização. Verifique as permissões.'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  $('btnApplyCoords').addEventListener('click', () => {
    const ll = getLatLonFromInputs();
    if (!ll) {
      showError('Latitude e longitude inválidas. Use graus decimais (ex.: -23.03, -43.12).');
      return;
    }
    hideError();
    initMap();
    state.map.setView([ll.lat, ll.lon], 13);
    state.marker.setLatLng([ll.lat, ll.lon]);
    updateMarkerPopup(ll.lat, ll.lon);
    state.marker.openPopup();
    loadAtCoordinates(ll.lat, ll.lon, { updateLabel: true });
  });

  $('waterContext').addEventListener('change', () => {
    if (!state.marker) return;
    const ll = state.marker.getLatLng();
    const b = state.bundle;
    loadAtCoordinates(ll.lat, ll.lng, {
      updateLabel: false,
      label: b?.placeLabel,
      timezone: b?.tz,
      locationHint: b?.placeLabel
        ? '<span class="muted">Tipo de água alterado — dados recalculados para o mesmo ponto.</span>'
        : undefined,
    });
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

$('hourlySort').addEventListener('change', () => {
  const b = state.bundle;
  if (!b) return;
  renderHourlyList($('daySelect').value, b.aligned.times, b.scores, b.scoreDetails, b.isInland);
});

setupSearch();
initMap();
