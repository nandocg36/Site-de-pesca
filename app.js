/**
 * PWA Pesca — Plataforma Norte, Balneário Rincão (ponto fixo).
 * Open-Meteo + MET Norway.
 */

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MET_SUN = 'https://api.met.no/weatherapi/sunrise/3.0/sun';
const MET_MOON = 'https://api.met.no/weatherapi/sunrise/3.0/moon';
/** Tábua EPAGRI (Balneário Rincão) extraída do PDF oficial — extremos por dia. */
const EPAGRI_TIDES_URL = './data/epagri-tides-2026.json';

/** Ponto de venda — Plataforma Norte, Balneário Rincão (usuário: -28,82718  -49,21348) */
const FIXED_LAT = -28.82718;
const FIXED_LON = -49.21348;
const FIXED_PLACE_LABEL = 'Plataforma Norte, Balneário Rincão, SC';

const MET_HEADERS = {
  'User-Agent': 'PescaPlataformaNorte/1.0 (https://github.com/nandocg36/Site-de-pesca)',
  Accept: 'application/json',
};

const state = {
  chart: null,
  scoreDetails: null,
  /** @type {number | null} */
  liveWeatherTimer: null,
  /** @type {{ aligned: object, scores: number[], scoreDetails: object[], dayData: object[], astroByDay: Map, forecast: object, isInland: boolean, placeLabel: string, tz: string, lat: number, lon: number } | null} */
  bundle: null,
};

/** Atualização do bloco “tempo agora” (modelo ~15 min + nova leitura). */
const LIVE_WEATHER_REFRESH_MS = 10 * 60 * 1000;

const $ = (id) => document.getElementById(id);

function showError(msg) {
  const el = $('errorBox');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  $('errorBox').classList.add('hidden');
}

/** Sempre costa / célula mar — app exclusivo da plataforma. */
function isInlandContext() {
  return false;
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  if (!res.ok) throw new Error(`A solicitação falhou (${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(data.reason || 'Erro na API');
  return data;
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

async function loadMarine(lat, lon, timezone) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'sea_level_height_msl,sea_surface_temperature,wave_height',
    past_days: '3',
    forecast_days: '8',
    timezone,
    cell_selection: 'sea',
  });
  return fetchJson(`${MARINE_URL}?${params}`);
}

async function loadForecast(lat, lon, timezone) {
  const hourly = [
    'temperature_2m',
    'apparent_temperature',
    'pressure_msl',
    'is_day',
    'wind_speed_10m',
    'wind_gusts_10m',
    'wind_direction_10m',
    'precipitation',
    'precipitation_probability',
    'relative_humidity_2m',
    'cloud_cover',
    'weather_code',
    'cape',
  ].join(',');
  const current = [
    'temperature_2m',
    'relative_humidity_2m',
    'apparent_temperature',
    'precipitation',
    'rain',
    'showers',
    'weather_code',
    'cloud_cover',
    'pressure_msl',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'is_day',
  ].join(',');
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly,
    current,
    past_days: '3',
    forecast_days: '8',
    timezone,
    wind_speed_unit: 'kmh',
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
    highMoon: parseTimeMaybe(mp.high_moon?.time),
    lowMoon: parseTimeMaybe(mp.low_moon?.time),
    moonAltHigh: typeof mp.high_moon?.disc_centre_elevation === 'number' ? mp.high_moon.disc_centre_elevation : null,
    moonAltLow: typeof mp.low_moon?.disc_centre_elevation === 'number' ? mp.low_moon.disc_centre_elevation : null,
  };
}

function addDaysIso(isoDate, n) {
  const [Y, M, D] = isoDate.split('-').map(Number);
  const dt = new Date(Y, M - 1, D + n);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Curva contínua (linear entre extremos) para interpolar nível hora a hora. */
function buildEpagriCurveForDay(dateKey, byDate) {
  if (!byDate || typeof byDate !== 'object') return null;
  const cur = byDate[dateKey];
  if (!cur || cur.length < 2) return null;
  const prevKey = addDaysIso(dateKey, -1);
  const nextKey = addDaysIso(dateKey, 1);
  const prev = byDate[prevKey];
  const next = byDate[nextKey];
  const pts = [];
  const pushDay = (dk, e) => {
    const ms = new Date(`${dk}T${e.t}:00`).getTime();
    if (Number.isFinite(ms)) pts.push({ ms, h: e.h_m });
  };
  if (prev?.length) {
    const sortedP = [...prev].sort((a, b) => a.t.localeCompare(b.t));
    pushDay(prevKey, sortedP[sortedP.length - 1]);
  }
  for (const e of [...cur].sort((a, b) => a.t.localeCompare(b.t))) pushDay(dateKey, e);
  if (next?.length) {
    const sortedN = [...next].sort((a, b) => a.t.localeCompare(b.t));
    pushDay(nextKey, sortedN[0]);
  }
  pts.sort((a, b) => a.ms - b.ms);
  return pts.length >= 2 ? pts : null;
}

function interpolateAlongPts(pts, tMs) {
  if (!pts || pts.length < 2) return null;
  if (tMs <= pts[0].ms) {
    const a = pts[0];
    const b = pts[1];
    const span = b.ms - a.ms || 1;
    return a.h + ((tMs - a.ms) / span) * (b.h - a.h);
  }
  if (tMs >= pts[pts.length - 1].ms) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const span = b.ms - a.ms || 1;
    return a.h + ((tMs - a.ms) / span) * (b.h - a.h);
  }
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].ms < tMs) i += 1;
  const a = pts[i];
  const b = pts[i + 1];
  const span = b.ms - a.ms || 1;
  return a.h + ((tMs - a.ms) / span) * (b.h - a.h);
}

/** Nível hora a hora: extremos EPAGRI interpolados; fallback no modelo Open-Meteo. */
function buildEffectiveSeaLevels(times, modelSea, byDate) {
  if (!byDate || typeof byDate !== 'object') return modelSea.slice();
  const cache = new Map();
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const dk = times[i].slice(0, 10);
    if (!cache.has(dk)) {
      cache.set(dk, buildEpagriCurveForDay(dk, byDate));
    }
    const curve = cache.get(dk);
    const tMs = new Date(times[i]).getTime();
    if (curve && Number.isFinite(tMs)) {
      const h = interpolateAlongPts(curve, tMs);
      if (h != null && Number.isFinite(h)) {
        out.push(h);
        continue;
      }
    }
    out.push(modelSea[i]);
  }
  return out;
}

async function loadEpagriTideTable() {
  try {
    const r = await fetch(EPAGRI_TIDES_URL, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.extremesByDate && typeof j.extremesByDate === 'object') return j;
  } catch (_) {
    /* offline / 404 */
  }
  return null;
}

function alignByTime(marine, forecast) {
  const mt = marine?.hourly?.time || [];
  const ft = forecast?.hourly?.time || [];
  const idxF = new Map(ft.map((t, i) => [t, i]));
  const times = [];
  const sea = [];
  const sst = [];
  const wave = [];
  const temp = [];
  const press = [];
  const isDay = [];
  const wind = [];
  const gust = [];
  const windDir = [];
  const rain = [];
  const rainProb = [];
  const rh = [];
  const cloud = [];
  const weatherCode = [];
  const cape = [];
  const apparent = [];
  for (let i = 0; i < mt.length; i++) {
    const t = mt[i];
    const j = idxF.get(t);
    if (j === undefined) continue;
    times.push(t);
    sea.push(marine.hourly.sea_level_height_msl[i]);
    sst.push(marine.hourly.sea_surface_temperature?.[i] ?? null);
    wave.push(marine.hourly.wave_height?.[i] ?? null);
    temp.push(forecast.hourly.temperature_2m[j]);
    apparent.push(forecast.hourly.apparent_temperature?.[j] ?? null);
    press.push(forecast.hourly.pressure_msl[j]);
    const id = forecast.hourly.is_day?.[j];
    isDay.push(id === 1 ? 1 : id === 0 ? 0 : null);
    wind.push(forecast.hourly.wind_speed_10m?.[j] ?? null);
    gust.push(forecast.hourly.wind_gusts_10m?.[j] ?? null);
    windDir.push(forecast.hourly.wind_direction_10m?.[j] ?? null);
    rain.push(forecast.hourly.precipitation?.[j] ?? null);
    rainProb.push(forecast.hourly.precipitation_probability?.[j] ?? null);
    rh.push(forecast.hourly.relative_humidity_2m?.[j] ?? null);
    cloud.push(forecast.hourly.cloud_cover?.[j] ?? null);
    weatherCode.push(forecast.hourly.weather_code?.[j] ?? null);
    cape.push(forecast.hourly.cape?.[j] ?? null);
  }
  return {
    times,
    sea,
    sst,
    wave,
    temp,
    apparent,
    press,
    isDay,
    wind,
    gust,
    windDir,
    rain,
    rainProb,
    rh,
    cloud,
    weatherCode,
    cape,
  };
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

function windComfortKmh(wind, gust) {
  const w = wind != null && Number.isFinite(wind) ? wind : 0;
  const g = gust != null && Number.isFinite(gust) ? gust : w;
  const x = Math.max(w, g * 0.92);
  if (x <= 10) return 1;
  if (x >= 48) return 0.18;
  return 1 - ((x - 10) / 38) * 0.82;
}

function rainComfort(mm, prob) {
  const p = prob != null && Number.isFinite(prob) ? prob : 0;
  const m = mm != null && Number.isFinite(mm) ? mm : 0;
  let s = 1 - Math.min(1, m / 4) * 0.85;
  s *= 1 - (p / 100) * 0.35;
  return Math.max(0.15, Math.min(1, s));
}

function waveComfortMeters(waveHeight, isInland) {
  if (isInland) return 0.55;
  const h = waveHeight;
  if (h == null || !Number.isFinite(h)) return 0.55;
  if (h <= 0.4) return 1;
  if (h >= 2.8) return 0.2;
  return 1 - ((h - 0.4) / 2.4) * 0.8;
}

/** Pressão absoluta: zona “normal” perto de 1013 hPa (modelo). */
function pressureLevelComfort(hPa) {
  if (hPa == null || !Number.isFinite(hPa)) return 0.55;
  const d = Math.abs(hPa - 1013);
  if (d <= 6) return 1;
  if (d >= 28) return 0.38;
  return 1 - ((d - 6) / 22) * 0.62;
}

/** Sensação térmica: conforto para estar na plataforma (não é “peixe gosta de X °C”). */
function apparentTempComfortCelsius(app) {
  if (app == null || !Number.isFinite(app)) return 0.55;
  if (app >= 16 && app <= 30) return 1;
  if (app < 10) return Math.max(0.2, 0.35 + app * 0.015);
  if (app < 16) return 0.35 + ((app - 10) / 6) * 0.65;
  if (app <= 34) return 1 - ((app - 30) / 4) * 0.45;
  return Math.max(0.22, 0.55 - (app - 34) * 0.04);
}

function rhComfortPct(rh) {
  if (rh == null || !Number.isFinite(rh)) return 0.55;
  if (rh >= 40 && rh <= 78) return 1;
  if (rh < 40) return 0.45 + (rh / 40) * 0.55;
  return Math.max(0.35, 1 - (rh - 78) / 22 * 0.65);
}

/** Céu parcial costuma ser ok; muito nublado ou céu limpo extremo ligeiramente neutro. */
function cloudCoverComfort(pct) {
  if (pct == null || !Number.isFinite(pct)) return 0.55;
  if (pct >= 25 && pct <= 85) return 1;
  if (pct < 25) return 0.72 + (pct / 25) * 0.28;
  return Math.max(0.4, 1 - (pct - 85) / 15 * 0.6);
}

/** Código WMO: penaliza chuva forte, trovoada, neblina densa; favorece tempo mais calmo. */
function weatherCodeFishingScore(code) {
  if (code == null || !Number.isFinite(code)) return 0.55;
  const c = Math.round(code);
  if (c === 0 || c === 1) return 1;
  if (c === 2) return 0.95;
  if (c === 3) return 0.82;
  if (c === 45 || c === 48) return 0.55;
  if (c >= 51 && c <= 57) return 0.72;
  if (c >= 61 && c <= 67) {
    if (c <= 63) return 0.55;
    return 0.35;
  }
  if (c >= 71 && c <= 77) return 0.45;
  if (c >= 80 && c <= 82) return c === 80 ? 0.52 : c === 81 ? 0.38 : 0.22;
  if (c === 85 || c === 86) return 0.42;
  if (c === 95) return 0.25;
  if (c === 96 || c === 99) return 0.12;
  return 0.65;
}

/** CAPE alto = mais convecção; penaliza levemente no índice de conforto/pesca. */
function capeComfortScore(cape) {
  if (cape == null || !Number.isFinite(cape)) return 0.62;
  if (cape < 400) return 1;
  if (cape >= 3500) return 0.25;
  return 1 - ((cape - 400) / 3100) * 0.75;
}

function slicePrevHours(arr, i, hours) {
  const out = [];
  const from = Math.max(0, i - hours);
  for (let k = from; k < i; k++) out.push(arr[k]);
  return out;
}

function meanFinite(arr) {
  const v = arr.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function maxFinite(arr) {
  const v = arr.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return Math.max(...v);
}

/**
 * Contexto recente (até ~3 dias de série): chuva acumulada, rajadas e estabilidade de pressão.
 * Melhora o índice quando os dias anteriores no modelo estão mais “calmos”.
 */
function recentContextScore(i, press, rain, gust) {
  const r48 = slicePrevHours(rain, i, 48);
  const g48 = slicePrevHours(gust, i, 48);
  const rainSum = r48.reduce((a, x) => a + (x != null && Number.isFinite(x) ? x : 0), 0);
  const gustMax = maxFinite(g48);
  let rainS = 1;
  if (rainSum > 0) {
    rainS = Math.max(0.2, 1 - Math.min(1, rainSum / 55));
  }
  let gustS = 1;
  if (gustMax != null) {
    gustS = Math.max(0.22, 1 - Math.min(1, Math.max(0, gustMax - 18) / 42));
  }
  let pressS = 0.75;
  if (i >= 24 && press[i] != null && press[i - 24] != null) {
    const dp = Math.abs(press[i] - press[i - 24]);
    if (dp < 2) pressS = 1;
    else if (dp > 12) pressS = 0.35;
    else pressS = 1 - ((dp - 2) / 10) * 0.65;
  } else if (i >= 6 && press[i] != null) {
    const past = slicePrevHours(press, i, 6);
    const m = meanFinite(past);
    if (m != null) {
      const dp = Math.abs(press[i] - m);
      pressS = dp < 1.2 ? 1 : dp > 5 ? 0.45 : 1 - ((dp - 1.2) / 3.8) * 0.55;
    }
  }
  return Math.max(0, Math.min(1, 0.42 * rainS + 0.33 * gustS + 0.25 * pressS));
}

/** Pesos relativos na costa (normalizados para somar 1 em computeHourlyScoresDetailed). */
const SCORE_W_COAST = {
  tideTurn: 82,
  tideSpeed: 45,
  moon: 92,
  sun: 78,
  pressLevel: 68,
  pressTrend: 78,
  tempStab: 48,
  apparent: 58,
  wind: 75,
  rain: 75,
  rh: 38,
  cloud: 38,
  wxCode: 48,
  cape: 28,
  wave: 48,
  sst: 48,
  context: 63,
};

const SCORE_W_INLAND = {
  tideTurn: 38,
  tideSpeed: 22,
  moon: 118,
  sun: 95,
  pressLevel: 78,
  pressTrend: 88,
  tempStab: 55,
  apparent: 62,
  wind: 88,
  rain: 88,
  rh: 44,
  cloud: 44,
  wxCode: 54,
  cape: 34,
  wave: 22,
  sst: 52,
  context: 68,
};

function normalizeScoreWeights(wmap) {
  const t = Object.values(wmap).reduce((a, b) => a + b, 0);
  const out = {};
  for (const k of Object.keys(wmap)) out[k] = wmap[k] / t;
  return out;
}

function compassPt(deg) {
  if (deg == null || !Number.isFinite(deg)) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const i = Math.round(deg / 45) % 8;
  return dirs[(i + 8) % 8];
}

function extractTideExtremesFromSeries(dayIndices, times, seaLevels) {
  const pts = [];
  for (const gi of dayIndices) {
    const y = seaLevels[gi];
    if (y == null || !Number.isFinite(y)) continue;
    pts.push({ t: times[gi], ms: new Date(times[gi]).getTime(), y, gi });
  }
  if (pts.length < 3) return [];
  const out = [];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1].y;
    const b = pts[k].y;
    const c = pts[k + 1].y;
    if (b > a && b >= c) out.push({ ...pts[k], type: 'high', label: 'Preamar' });
    if (b < a && b <= c) out.push({ ...pts[k], type: 'low', label: 'Baixamar' });
  }
  out.sort((u, v) => u.ms - v.ms);
  return out;
}

function buildSolunarWindows(astro) {
  if (!astro) return { major: [], minor: [] };
  const major = [];
  const minor = [];
  const pushWin = (arr, centerMs, halfHours, label) => {
    if (centerMs == null) return;
    arr.push({
      start: centerMs - halfHours * 3600000,
      end: centerMs + halfHours * 3600000,
      label,
      centerMs,
    });
  };
  if (astro.highMoon) pushWin(major, astro.highMoon, 1, 'Lua no céu (máx.)');
  if (astro.moonrise) pushWin(major, astro.moonrise, 1, 'Subida da lua');
  if (astro.moonset) pushWin(major, astro.moonset, 1, 'Pôr da lua');
  if (astro.lowMoon) pushWin(minor, astro.lowMoon, 0.5, 'Lua baixa no céu');
  return { major, minor };
}

function hourOverlapsSolunar(tMs, windows) {
  for (const w of windows) {
    if (tMs >= w.start && tMs <= w.end) return w.label;
  }
  return null;
}

function computeHourlyScoresDetailed(lat, lon, aligned, astroByDay, isInland) {
  const {
    times,
    sea,
    sst,
    wave,
    temp,
    apparent,
    press,
    isDay,
    wind,
    gust,
    windDir,
    rain,
    rainProb,
    rh,
    cloud,
    weatherCode,
    cape,
  } = aligned;
  const wcodes = weatherCode || [];
  const appSeries = apparent || [];
  const n = times.length;
  const W = normalizeScoreWeights(isInland ? SCORE_W_INLAND : SCORE_W_COAST);

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
  const pressTrendScore = dPress.map((dp) => {
    if (dp < -2.5) return 0.2;
    if (dp < -1.2) return 0.45;
    if (dp > 2) return 0.55;
    return 0.85;
  });

  const pressLevelScore = press.map((p) => pressureLevelComfort(p));

  const dTemp = temp.map((t, i) => (i === 0 ? 0 : Math.abs(t - temp[i - 1])));
  const tempStabScore = dTemp.map((dt) => Math.max(0, Math.min(1, 1 - dt / 4)));

  const apparentScore = temp.map((t, i) =>
    apparentTempComfortCelsius(appSeries[i] != null && Number.isFinite(appSeries[i]) ? appSeries[i] : t)
  );

  const sstScore = normalize(
    sst.map((v) => (v == null ? null : v)),
    false
  );

  const windScore = wind.map((w, i) => windComfortKmh(w, gust[i]));
  const rainScore = rain.map((m, i) => rainComfort(m, rainProb[i]));
  const waveScore = wave.map((h) => waveComfortMeters(h, isInland));
  const rhScore = rh.map((x) => rhComfortPct(x));
  const cloudScore = cloud.map((x) => cloudCoverComfort(x));
  const wxScore = wcodes.map((c) => weatherCodeFishingScore(c));
  const capeScore = (cape || []).map((x) => capeComfortScore(x));

  const contextScore = new Array(n);
  for (let i = 0; i < n; i++) {
    contextScore[i] = recentContextScore(i, press, rain, gust);
  }

  const scores = [];
  const details = [];
  const moonEvCache = new Map();
  const solunarCache = new Map();

  for (let i = 0; i < n; i++) {
    const tStr = times[i];
    const d = new Date(tStr);
    const tMs = d.getTime();
    const dayKey = tStr.slice(0, 10);
    const astro = astroByDay?.get(dayKey);

    if (!solunarCache.has(dayKey)) {
      solunarCache.set(dayKey, buildSolunarWindows(astro));
    }
    const { major, minor } = solunarCache.get(dayKey);
    const solMajor = hourOverlapsSolunar(tMs, major);
    const solMinor = hourOverlapsSolunar(tMs, minor);
    let solunarBoost = 0;
    if (solMajor) solunarBoost = 1;
    else if (solMinor) solunarBoost = 0.55;

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
    let moonComb = Math.min(1, 0.52 * moonP + 0.32 * moonEv + 0.12 * (0.5 + Math.abs(illum - 0.5)));
    moonComb = Math.min(1, moonComb + solunarBoost * 0.22);

    const sstPart = sst[i] != null && Number.isFinite(sst[i]) ? sstScore[i] : 0.55;

    const raw =
      W.tideTurn * turnN[i] +
      W.tideSpeed * speedSweet[i] +
      W.moon * moonComb +
      W.sun * sunB +
      W.pressLevel * pressLevelScore[i] +
      W.pressTrend * pressTrendScore[i] +
      W.tempStab * tempStabScore[i] +
      W.apparent * apparentScore[i] +
      W.wind * windScore[i] +
      W.rain * rainScore[i] +
      W.rh * rhScore[i] +
      W.cloud * cloudScore[i] +
      W.wxCode * wxScore[i] +
      W.cape * capeScore[i] +
      W.wave * waveScore[i] +
      W.sst * sstPart +
      W.context * contextScore[i];

    scores.push(Math.round(Math.max(0, Math.min(100, raw * 100))));
    details.push({
      turnN: turnN[i],
      speedSweet: speedSweet[i],
      moonComb,
      sunB,
      pressLevelScore: pressLevelScore[i],
      pressTrendScore: pressTrendScore[i],
      tempStabScore: tempStabScore[i],
      apparentScore: apparentScore[i],
      windScore: windScore[i],
      rainScore: rainScore[i],
      waveScore: waveScore[i],
      rhScore: rhScore[i],
      cloudScore: cloudScore[i],
      wxScore: wxScore[i],
      capeScore: capeScore[i],
      contextScore: contextScore[i],
      /** Compat: explicações antigas usam pressScore / tempScore */
      pressScore: pressTrendScore[i],
      tempScore: tempStabScore[i],
      sstPresent: sst[i] != null && Number.isFinite(sst[i]),
      isDay: id,
      dPress: i === 0 ? 0 : dPress[i],
      dTemp: i === 0 ? 0 : dTemp[i],
      tempC: temp[i],
      appTempC: appSeries[i],
      pressHpa: press[i],
      windKmh: wind[i],
      gustKmh: gust[i],
      windDir: windDir[i],
      rainMm: rain[i],
      rainProbPct: rainProb[i],
      rhPct: rh[i],
      cloudPct: cloud[i],
      waveM: wave[i],
      solMajorLabel: solMajor,
      solMinorLabel: solMinor,
      weatherCode: wcodes[i] ?? null,
      weatherDesc: wcodes[i] != null ? weatherCodeLabel(wcodes[i]) : null,
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

/** YYYY-MM-DD do “hoje” no fuso da previsão (alinhado às strings locais da API). */
function todayDateKeyInTimezone(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
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

/** WMO weather_code (Open-Meteo) — descrição curta em pt-BR. */
function weatherCodeLabel(code) {
  if (code == null || !Number.isFinite(code)) return '—';
  const c = Math.round(code);
  const map = {
    0: 'Céu limpo',
    1: 'Pred. limpo',
    2: 'Parcialmente nublado',
    3: 'Nublado',
    45: 'Neblina',
    48: 'Neblina com geada',
    51: 'Garoa leve',
    53: 'Garoa',
    55: 'Garoa forte',
    56: 'Garoa congelante',
    57: 'Garoa congelante forte',
    61: 'Chuva fraca',
    63: 'Chuva moderada',
    65: 'Chuva forte',
    66: 'Chuva congelante',
    67: 'Chuva congelante forte',
    71: 'Neve fraca',
    73: 'Neve moderada',
    75: 'Neve forte',
    77: 'Grãos de neve',
    80: 'Pancadas de chuva',
    81: 'Pancadas moderadas',
    82: 'Pancadas fortes / violentas',
    85: 'Pancadas de neve',
    86: 'Pancadas de neve fortes',
    95: 'Trovoada',
    96: 'Trovoada com granizo leve',
    99: 'Trovoada com granizo forte',
  };
  return map[c] || `Condição (${c})`;
}

function isThunderWeatherCode(c) {
  return c === 95 || c === 96 || c === 99;
}

/**
 * Avisos a partir do modelo numérico (não são alertas oficiais do INMET).
 * Varre as próximas horas do alinhamento mar+previsão.
 */
function collectSevereWeatherAlerts(aligned, maxHours = 48) {
  const items = [];
  const seen = new Set();
  const push = (level, text) => {
    const k = `${level}:${text}`;
    if (seen.has(k)) return;
    seen.add(k);
    items.push({ level, text });
  };

  const { times, gust, rain, weatherCode, cape: capeSeries } = aligned;
  const wcodes = weatherCode || [];
  const capeArr = capeSeries || [];
  const n = Math.min(times.length, maxHours);

  for (let i = 0; i < n; i++) {
    const t = times[i];
    const labelH = formatHourLabel(t);
    const g = gust[i];
    const r = rain[i];
    const wc = wcodes[i] != null && Number.isFinite(wcodes[i]) ? Math.round(wcodes[i]) : null;
    const cape = capeArr[i];

    if (wc != null && isThunderWeatherCode(wc)) {
      push(
        'critical',
        `${labelH}: risco de <strong>temporal / trovoada</strong> no modelo (${weatherCodeLabel(wc)}). Evite área aberta na água e parafusos altos.`
      );
    } else if (wc === 82) {
      push(
        'critical',
        `${labelH}: <strong>pancadas de chuva muito fortes</strong> no modelo — risco de temporal.`
      );
    }

    if (g != null && Number.isFinite(g) && g >= 75) {
      push('critical', `${labelH}: <strong>rajadas muito fortes</strong> (~${Math.round(g)} km/h) no modelo.`);
    } else if (g != null && Number.isFinite(g) && g >= 55) {
      push('warning', `${labelH}: <strong>rajadas fortes</strong> (~${Math.round(g)} km/h) no modelo.`);
    }

    if (r != null && Number.isFinite(r) && r >= 20) {
      push('critical', `${labelH}: <strong>chuva volumosa</strong> (~${r.toFixed(1)} mm/h) no modelo — risco de alagamento e visibilidade ruim.`);
    } else if (r != null && Number.isFinite(r) && r >= 10) {
      push('warning', `${labelH}: chuva <strong>moderada a forte</strong> (~${r.toFixed(1)} mm/h) no modelo.`);
    }

    if (wc === 65 || wc === 86) {
      push('warning', `${labelH}: <strong>precipitação forte</strong> no modelo (${weatherCodeLabel(wc)}).`);
    }

    if (cape != null && Number.isFinite(cape) && cape >= 2500 && wc != null && wc >= 61 && wc <= 82) {
      push('warning', `${labelH}: <strong>instabilidade alta</strong> no modelo (energia de convecção elevada) — atenção a trovoadas.`);
    }
  }

  let topLevel = 'ok';
  for (const it of items) {
    if (it.level === 'critical') {
      topLevel = 'critical';
      break;
    }
    if (it.level === 'warning') topLevel = 'warning';
  }
  return { topLevel, items };
}

function formatCurrentTimeNote(forecast) {
  const cur = forecast?.current;
  if (!cur?.time) return '';
  try {
    const d = new Date(cur.time);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

function renderLiveWeatherPanel(forecast, aligned) {
  const wrap = $('liveWeatherBlock');
  const alertsEl = $('liveWeatherAlerts');
  const gridEl = $('liveWeatherGrid');
  const metaEl = $('liveWeatherMeta');
  if (!wrap || !alertsEl || !gridEl || !metaEl) return;

  const cur = forecast?.current;
  const h = forecast?.hourly;
  const fallbackIdx = h?.time?.length ? 0 : -1;

  const temp =
    cur?.temperature_2m ??
    (fallbackIdx >= 0 ? h.temperature_2m?.[fallbackIdx] : null);
  const feels =
    cur?.apparent_temperature ??
    (fallbackIdx >= 0 ? h.apparent_temperature?.[fallbackIdx] : null);
  const rh =
    cur?.relative_humidity_2m ??
    (fallbackIdx >= 0 ? h.relative_humidity_2m?.[fallbackIdx] : null);
  const code =
    cur?.weather_code ??
    (fallbackIdx >= 0 ? h.weather_code?.[fallbackIdx] : null);
  const cloud =
    cur?.cloud_cover ?? (fallbackIdx >= 0 ? h.cloud_cover?.[fallbackIdx] : null);
  const pr =
    cur?.pressure_msl ?? (fallbackIdx >= 0 ? h.pressure_msl?.[fallbackIdx] : null);
  const wind =
    cur?.wind_speed_10m ?? (fallbackIdx >= 0 ? h.wind_speed_10m?.[fallbackIdx] : null);
  const gust =
    cur?.wind_gusts_10m ?? (fallbackIdx >= 0 ? h.wind_gusts_10m?.[fallbackIdx] : null);
  const wdir =
    cur?.wind_direction_10m ?? (fallbackIdx >= 0 ? h.wind_direction_10m?.[fallbackIdx] : null);
  const rain =
    cur?.precipitation ?? (fallbackIdx >= 0 ? h.precipitation?.[fallbackIdx] : null);

  const { topLevel, items } = collectSevereWeatherAlerts(aligned, 48);

  alertsEl.className = 'live-weather-alerts';
  if (!items.length) {
    alertsEl.innerHTML =
      '<p class="live-alert live-alert-ok muted small">Nenhum sinal forte de temporal nas próximas ~48 h no <strong>modelo numérico</strong>. Ainda assim acompanhe o <a href="https://alertas2.inmet.gov.br/" target="_blank" rel="noopener">INMET</a> e condições locais.</p>';
  } else {
    const cls =
      topLevel === 'critical' ? 'live-alert-critical' : topLevel === 'warning' ? 'live-alert-warn' : 'live-alert-watch';
    alertsEl.innerHTML = `<div class="live-alert ${cls}" role="status"><strong>Aviso do modelo</strong> (não é alerta oficial):<ul class="live-alert-list">${items
      .slice(0, 8)
      .map((it) => `<li>${it.text}</li>`)
      .join('')}</ul>${
      items.length > 8 ? `<p class="muted small">+${items.length - 8} outros indícios nas próximas horas.</p>` : ''
    }</div>`;
  }

  const cells = [];
  if (temp != null && Number.isFinite(temp)) {
    cells.push(['Temperatura', `${temp.toFixed(1)} °C`]);
  }
  if (feels != null && Number.isFinite(feels)) {
    cells.push(['Sensação', `${feels.toFixed(1)} °C`]);
  }
  cells.push(['Céu / tempo', weatherCodeLabel(code)]);
  if (rh != null && Number.isFinite(rh)) {
    cells.push(['Umidade', `${Math.round(rh)} %`]);
  }
  if (cloud != null && Number.isFinite(cloud)) {
    cells.push(['Nuvens', `${Math.round(cloud)} %`]);
  }
  if (pr != null && Number.isFinite(pr)) {
    cells.push(['Pressão (mar)', `${Math.round(pr)} hPa`]);
  }
  if (wind != null && Number.isFinite(wind)) {
    const dir = compassPt(wdir);
    const d = dir ? ` ${dir}` : '';
    cells.push(['Vento', `${Math.round(wind)} km/h${d}`]);
  }
  if (gust != null && Number.isFinite(gust)) {
    cells.push(['Rajadas', `${Math.round(gust)} km/h`]);
  }
  if (rain != null && Number.isFinite(rain) && rain > 0) {
    cells.push(['Chuva (últ. intervalo)', `${rain.toFixed(1)} mm`]);
  }

  gridEl.innerHTML = cells
    .map(
      ([k, v]) =>
        `<div class="live-weather-cell"><span class="live-weather-k">${k}</span><span class="live-weather-v">${v}</span></div>`
    )
    .join('');

  const when = formatCurrentTimeNote(forecast);
  metaEl.innerHTML = when
    ? `<span class="muted small">Condições atuais do modelo (Open-Meteo), referência ~${when}. Atualiza ao recarregar ou ao tocar em Atualizar.</span>`
    : '<span class="muted small">Dados do modelo Open-Meteo (sem leitura de estação local).</span>';
}

async function refreshLiveWeatherSnapshot() {
  const b = state.bundle;
  if (!b || b.lat == null || b.lon == null || !b.tz || !b.marine) return;
  try {
    const forecast = await loadForecast(b.lat, b.lon, b.tz);
    const aligned = alignByTime(b.marine, forecast);
    const epMap = b.epagriExtremesByDate;
    const modelSea = aligned.sea.slice();
    aligned.sea = buildEffectiveSeaLevels(aligned.times, modelSea, epMap);
    b.forecast = forecast;
    state.bundle.aligned = aligned;
    const inland = b.isInland;
    const { scores, details: scoreDetails } = computeHourlyScoresDetailed(
      b.lat,
      b.lon,
      aligned,
      b.astroByDay,
      inland
    );
    b.scores = scores;
    b.scoreDetails = scoreDetails;
    state.scoreDetails = scoreDetails;
    b.dayData = groupByDay(aligned.times, scores, aligned.sea);
    const daySelect = $('daySelect');
    const prevDay = daySelect?.value;
    fillDaySelect(b.dayData, prevDay || b.dayData[0]?.date);
    if (prevDay && daySelect && [...daySelect.options].some((o) => o.value === prevDay)) {
      daySelect.value = prevDay;
    }
    const dateKey = daySelect?.value || b.dayData[0]?.date;
    if (dateKey) {
      const dayRow = b.dayData.find((d) => d.date === dateKey);
      const dayAvg = dayRow?.avgScore ?? 0;
      renderRecommendations(dateKey, aligned.times, scores, dayAvg, inland, b.astroByDay, aligned);
      renderSummary(b.dayData, { lat: b.lat, lon: b.lon, timezone: b.tz }, dateKey, b.astroByDay, b.marineMeta);
      const { labels, scores: sc, seaNorm } = sliceDay(aligned.times, scores, aligned.sea, dateKey);
      updateChart(labels, sc, seaNorm);
      renderHourlyList(dateKey, aligned.times, scores, scoreDetails, inland);
    }
    renderForecastList(b.dayData);
    renderLiveWeatherPanel(forecast, aligned);
  } catch (_) {
    /* mantém último estado */
  }
}

function startLiveWeatherUpdates() {
  if (state.liveWeatherTimer != null) clearInterval(state.liveWeatherTimer);
  state.liveWeatherTimer = window.setInterval(() => {
    refreshLiveWeatherSnapshot();
  }, LIVE_WEATHER_REFRESH_MS);
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

  if (detail.solMajorLabel) {
    lines.push(`<strong>Solunar major</strong> (${detail.solMajorLabel}) — janela astronômica da Lua, no estilo de tabelas clássicas de pesca.`);
  } else if (detail.solMinorLabel) {
    lines.push(`<strong>Solunar minor</strong> (${detail.solMinorLabel}) — influência mais leve.`);
  }

  if (!isInland) {
    if (detail.turnN >= hi) {
      lines.push('Maré: <strong>virada ou mudança forte de fluxo</strong> no modelo de nível do mar.');
    } else if (detail.turnN <= lo) {
      lines.push('Maré: <strong>pouca virada</strong> nesta hora no modelo.');
    } else {
      lines.push('Maré: influência <strong>média</strong> no modelo.');
    }
  } else {
    lines.push('Interior: a maré do modelo é <strong>pouco confiável</strong> aqui — o índice pesa mais clima, Lua e Sol.');
  }

  if (detail.moonComb >= hi) {
    lines.push('Lua / solunar: <strong>conjunto favorável</strong> nesta hora.');
  } else if (detail.moonComb <= lo) {
    lines.push('Lua / solunar: <strong>menos favorável</strong> pelos critérios usados.');
  }

  if (detail.sunB >= hi) {
    lines.push('Sol: <strong>luz baixa</strong> (nascer/pôr/crepúsculo).');
  } else if (detail.sunB <= 0.34) {
    lines.push('Sol: <strong>sem janela de luz baixa</strong> forte nesta hora.');
  }

  if (detail.windScore >= 0.72) {
    lines.push('Vento: <strong>moderado</strong> — boas condições para arremesso ou mar mais calmo.');
  } else if (detail.windScore <= 0.42) {
    lines.push('Vento: <strong>forte ou com rajadas altas</strong> — pode atrapalhar na beira ou no barco.');
  }

  if (detail.rainScore >= 0.72) {
    lines.push('Chuva: <strong>pouca ou nenhuma</strong> prevista nesta hora.');
  } else if (detail.rainScore <= 0.45) {
    lines.push('Chuva: <strong>volume alto ou probabilidade alta</strong> — piora o conforto e a visibilidade.');
  }

  if (!isInland && detail.waveM != null && Number.isFinite(detail.waveM)) {
    if (detail.waveScore >= 0.75) {
      lines.push(`Ondas: <strong>baixas</strong> (~${detail.waveM.toFixed(1)} m) no modelo.`);
    } else if (detail.waveScore <= 0.4) {
      lines.push(`Ondas: <strong>altas</strong> (~${detail.waveM.toFixed(1)} m) — mar mais agitado.`);
    }
  }

  if (detail.pressHpa != null && Number.isFinite(detail.pressHpa)) {
    if (detail.pressLevelScore >= 0.78) {
      lines.push(`Pressão ao nível do mar: <strong>${Math.round(detail.pressHpa)} hPa</strong> — dentro da faixa “normal” no modelo.`);
    } else if (detail.pressLevelScore <= 0.45) {
      lines.push(`Pressão: <strong>${Math.round(detail.pressHpa)} hPa</strong> — valor mais extremo no modelo (longe da média típica).`);
    }
  }

  if (detail.pressTrendScore >= 0.78) {
    lines.push('Tendência da pressão: <strong>sem queda brusca</strong> na última hora.');
  } else if (detail.pressTrendScore <= 0.48) {
    lines.push('Tendência da pressão: <strong>mudança rápida</strong> — tempo pode ficar instável.');
  }

  if (detail.tempStabScore >= 0.72) {
    lines.push('Temperatura do ar: <strong>mudou pouco</strong> na última hora.');
  } else if (detail.tempStabScore <= 0.45) {
    lines.push('Temperatura do ar: <strong>variação forte</strong> na última hora.');
  }

  if (detail.tempC != null && Number.isFinite(detail.tempC)) {
    const ap =
      detail.appTempC != null && Number.isFinite(detail.appTempC)
        ? ` · sensação ~${detail.appTempC.toFixed(1)} °C`
        : '';
    lines.push(`Ar: <strong>${detail.tempC.toFixed(1)} °C</strong>${ap} (conforto na plataforma).`);
  }

  if (detail.rhScore != null) {
    if (detail.rhScore >= 0.78 && detail.rhPct != null) {
      lines.push(`Umidade: <strong>${Math.round(detail.rhPct)} %</strong> — faixa confortável.`);
    } else if (detail.rhScore <= 0.48 && detail.rhPct != null) {
      lines.push(`Umidade: <strong>${Math.round(detail.rhPct)} %</strong> — muito seca ou muito húmida no modelo.`);
    }
  }

  if (detail.cloudScore != null) {
    if (detail.cloudScore >= 0.78 && detail.cloudPct != null) {
      lines.push(`Céu: <strong>${Math.round(detail.cloudPct)} %</strong> de nuvens — condição equilibrada.`);
    } else if (detail.cloudScore <= 0.45 && detail.cloudPct != null) {
      lines.push(`Céu: <strong>${Math.round(detail.cloudPct)} %</strong> de nuvens — muito claro ou muito fechado.`);
    }
  }

  if (detail.capeScore != null && detail.capeScore <= 0.45) {
    lines.push('Instabilidade (CAPE): <strong>energia de convecção elevada</strong> no modelo — atenção a pancadas/trovoadas.');
  }

  if (detail.contextScore != null) {
    if (detail.contextScore >= 0.78) {
      lines.push('Dias anteriores na série: <strong>menos chuva acumulada e vento mais calmo</strong> — contexto favorável no modelo.');
    } else if (detail.contextScore <= 0.42) {
      lines.push('Dias anteriores na série: <strong>chuva ou rajadas fortes recentes</strong> — contexto mais difícil no modelo.');
    }
  }

  if (detail.sstPresent) {
    lines.push('Temperatura da superfície do mar disponível no modelo para esta célula.');
  }

  if (detail.weatherDesc && detail.weatherDesc !== '—') {
    if (detail.weatherCode != null && isThunderWeatherCode(Math.round(detail.weatherCode))) {
      lines.push(`Tempo no modelo: <strong>${detail.weatherDesc}</strong> — atenção a raios e vento forte.`);
    } else {
      lines.push(`Tempo no modelo: ${detail.weatherDesc}.`);
    }
  }

  return lines;
}

function formatMetricHour(detail, isInland) {
  const parts = [];
  if (detail.tempC != null && Number.isFinite(detail.tempC)) {
    const ap =
      detail.appTempC != null && Number.isFinite(detail.appTempC)
        ? ` (sens. ${detail.appTempC.toFixed(1)}°)`
        : '';
    parts.push(`${detail.tempC.toFixed(1)} °C${ap}`);
  }
  if (detail.pressHpa != null && Number.isFinite(detail.pressHpa)) {
    parts.push(`${Math.round(detail.pressHpa)} hPa`);
  }
  if (detail.windKmh != null && Number.isFinite(detail.windKmh)) {
    const g = detail.gustKmh != null && Number.isFinite(detail.gustKmh) ? ` · rajadas ${Math.round(detail.gustKmh)} km/h` : '';
    const dir = compassPt(detail.windDir);
    const dtxt = dir ? ` ${dir}` : '';
    parts.push(`Vento ${Math.round(detail.windKmh)} km/h${g}${dtxt}`);
  }
  if (detail.rainMm != null && Number.isFinite(detail.rainMm)) {
    const p =
      detail.rainProbPct != null && Number.isFinite(detail.rainProbPct)
        ? ` · prob. ${Math.round(detail.rainProbPct)} %`
        : '';
    parts.push(`Chuva ${detail.rainMm.toFixed(1)} mm${p}`);
  }
  if (!isInland && detail.waveM != null && Number.isFinite(detail.waveM)) {
    parts.push(`Onda ~${detail.waveM.toFixed(2)} m`);
  }
  if (detail.rhPct != null && Number.isFinite(detail.rhPct)) {
    parts.push(`Umid. ${Math.round(detail.rhPct)} %`);
  }
  if (detail.cloudPct != null && Number.isFinite(detail.cloudPct)) {
    parts.push(`Nuvens ${Math.round(detail.cloudPct)} %`);
  }
  if (detail.weatherDesc && detail.weatherDesc !== '—') {
    parts.push(detail.weatherDesc);
  }
  return parts.length ? parts.join(' · ') : '—';
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
    const metricsLine = formatMetricHour(r.detail || {}, isInland);
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
      <div class="hourly-metrics muted small">${metricsLine}</div>
      <div class="hourly-why">
        <strong>Por quê:</strong>
        <ul>${expl.map((x) => `<li>${x}</li>`).join('')}</ul>
      </div>
    `;
    el.appendChild(row);
  }
}

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

const INDEX_WEIGHT_ROWS_DEF = [
  ['tideTurn', 'Maré — viragem (curva de nível)'],
  ['tideSpeed', 'Maré — ritmo do fluxo'],
  ['moon', 'Lua, solunar e fase'],
  ['sun', 'Sol — nascer / pôr / crepúsculo'],
  ['pressLevel', 'Pressão — valor (zona de conforto no modelo)'],
  ['pressTrend', 'Pressão — tendência hora a hora'],
  ['tempStab', 'Temperatura do ar — estabilidade'],
  ['apparent', 'Sensação térmica (conforto na plataforma)'],
  ['wind', 'Vento e rajadas'],
  ['rain', 'Chuva e probabilidade'],
  ['rh', 'Umidade relativa'],
  ['cloud', 'Nebulosidade (céu)'],
  ['wxCode', 'Tipo de tempo (código WMO)'],
  ['cape', 'Instabilidade atmosférica (CAPE)'],
  ['wave', 'Altura de onda'],
  ['sst', 'Temperatura superficial do mar (SST)'],
  ['context', 'Contexto recente (até ~3 dias na mesma série)'],
];

function getIndexWeightRows(isInland) {
  const nw = normalizeScoreWeights(isInland ? SCORE_W_INLAND : SCORE_W_COAST);
  const rows = INDEX_WEIGHT_ROWS_DEF.map(([key, label]) => ({
    label,
    pct: Math.max(1, Math.round(nw[key] * 100)),
  }));
  const s = rows.reduce((a, r) => a + r.pct, 0);
  if (s !== 100 && rows.length) {
    rows[rows.length - 1].pct += 100 - s;
  }
  return rows;
}

function renderIndexWeights(isInland) {
  const el = $('menuWeights');
  const placeholder = $('menuWeightsPlaceholder');
  if (!el) return;
  const rows = getIndexWeightRows(isInland);
  const maxPct = Math.max(...rows.map((r) => r.pct), 1);
  if (placeholder) placeholder.classList.add('hidden');
  el.innerHTML = `
    <h3 class="index-weights-title">Peso de cada fator no índice</h3>
    ${rows
      .map(
        (r) => `
      <div class="weight-row">
        <span class="weight-label">${r.label}</span>
        <span class="weight-pct">${r.pct}%</span>
        <div class="weight-track" aria-hidden="true">
          <div class="weight-fill" style="width:${(r.pct / maxPct) * 100}%"></div>
        </div>
      </div>
    `
      )
      .join('')}
    <p class="index-weights-foot">As porcentagens mostram o <strong>peso relativo</strong> de cada parte da fórmula (costa x interior). O índice final fica entre 0 e 100.</p>
  `;
}

function renderSolunarPanel(astro) {
  const block = $('solunarBlock');
  if (!block) return;
  if (!astro) {
    block.classList.add('hidden');
    block.innerHTML = '';
    return;
  }
  const { major, minor } = buildSolunarWindows(astro);
  const fmt = (ms) =>
    ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const majorLines = major
    .map((w) => `<li><strong>${w.label}</strong>: ~${fmt(w.start)} – ${fmt(w.end)}</li>`)
    .join('');
  const minorLines = minor
    .map((w) => `<li><strong>${w.label}</strong>: ~${fmt(w.start)} – ${fmt(w.end)}</li>`)
    .join('');
  if (!majorLines && !minorLines) {
    block.classList.add('hidden');
    block.innerHTML = '';
    return;
  }
  block.classList.remove('hidden');
  block.innerHTML = `
    <h3 class="subcard-title">Janelas solunar (major e minor)</h3>
    <p class="muted small">Com base nos horários <strong>reais</strong> da Lua (MET Norway), no estilo de várias tabelas de pesca. Não garantem peixe na linha.</p>
    ${majorLines ? `<p class="tide-sub">Major</p><ul class="tide-ul">${majorLines}</ul>` : ''}
    ${minorLines ? `<p class="tide-sub">Minor</p><ul class="tide-ul">${minorLines}</ul>` : ''}
  `;
}

function renderTideTablePanel(dateKey, dayIdx, times, sea, isInland, epagriExtremesByDate) {
  const block = $('tideTableBlock');
  if (!block) return;
  if (isInland) {
    block.classList.add('hidden');
    block.innerHTML = '';
    return;
  }
  const official = epagriExtremesByDate?.[dateKey];
  const officialRows =
    official && official.length
      ? [...official]
          .sort((a, b) => a.t.localeCompare(b.t))
          .map(
            (e) =>
              `<tr><td>${e.hi ? 'Preamar' : 'Baixamar'}</td><td>${e.t.replace(':', 'h')}</td><td>${Number(e.h_m).toFixed(2)} m</td></tr>`
          )
          .join('')
      : '';

  const exModel = extractTideExtremesFromSeries(dayIdx, times, sea);
  const modelRows = exModel.length
    ? exModel
        .map(
          (e) =>
            `<tr><td>${e.label}</td><td>${formatHourLabel(e.t)}</td><td>${e.y.toFixed(2)} m</td></tr>`
        )
        .join('')
    : '';

  if (!officialRows && !modelRows) {
    block.classList.add('hidden');
    block.innerHTML = '';
    return;
  }

  block.classList.remove('hidden');
  const officialBlock = officialRows
    ? `
    <h3 class="subcard-title">Preamar e baixamar — tábua EPAGRI / Siré</h3>
    <p class="muted small">Horários e alturas da <strong>tábua de maré de Balneário Rincão</strong> publicada pela <strong>EPAGRI</strong> (integrada a partir do PDF oficial). Para navegação e referência legal no Brasil, a Marinha (CHM) continua sendo a autoridade; confira sempre a documentação do local.</p>
    <div class="tide-table-wrap">
      <table class="tide-table tide-table-official">
        <thead><tr><th></th><th>Hora (local)</th><th>Altura (tábua)</th></tr></thead>
        <tbody>${officialRows}</tbody>
      </table>
    </div>
  `
    : '';

  const modelNote = officialRows
    ? 'Com a tábua EPAGRI carregada, o <strong>índice e o gráfico</strong> usam uma curva baseada nos extremos da tábua; abaixo ficam picos/vales <strong>só do modelo bruto</strong>, para comparação.'
    : 'Estes horários são <strong>estimados pela curva do modelo Open-Meteo</strong>. Para barco e segurança, use sempre a publicação náutica competente.';
  const modelBlock = modelRows
    ? `
    <h3 class="subcard-title tide-model-sub">${officialRows ? 'Modelo Open-Meteo (comparativo)' : 'Preamar e baixamar (modelo)'}</h3>
    <p class="muted small">${modelNote}</p>
    <div class="tide-table-wrap">
      <table class="tide-table">
        <thead><tr><th></th><th>Hora (seu fuso)</th><th>Nível (modelo)</th></tr></thead>
        <tbody>${modelRows}</tbody>
      </table>
    </div>
  `
    : '';

  block.innerHTML = officialBlock + modelBlock;
}

function renderRecommendations(dateKey, times, scores, dayAvg, isInland, astroByDay, aligned) {
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
    $('solunarBlock')?.classList.add('hidden');
    $('tideTableBlock')?.classList.add('hidden');
    const mw = $('menuWeights');
    if (mw) mw.innerHTML = '';
    $('menuWeightsPlaceholder')?.classList.remove('hidden');
    return;
  }

  renderIndexWeights(isInland);
  renderSolunarPanel(astroByDay?.get(dateKey));
  const epagriMap = state.bundle?.epagriExtremesByDate;
  renderTideTablePanel(dateKey, dayIdx, times, aligned?.sea || [], isInland, epagriMap);

  const hasEpagri = epagriMap && epagriMap[dateKey]?.length;
  intro.textContent = hasEpagri
    ? `Para ${weekdayPt(dateKey)}, na Plataforma Norte — vento, chuva, ondas e Sol/Lua por previsão; maré com extremos da tábua EPAGRI (Balneário Rincão) e curva hora a hora derivada dela para o índice. Não garante pesca.`
    : `Para ${weekdayPt(dateKey)}, na Plataforma Norte — dados de previsão (vento, chuva, ondas, maré por modelo, Lua e Sol). O índice de 0 a 100 junta esses sinais; não garante pesca.`;

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
    vHtml = `<strong>Resumo: boas condições no modelo</strong> neste dia (média ~${dayAvg}/100). `;
  } else if (dayAvg >= 45) {
    vClass = 'verdict-mid';
    vHtml = `<strong>Resumo: condições médias</strong> (média ~${dayAvg}/100). `;
  } else {
    vClass = 'verdict-low';
    vHtml = `<strong>Resumo: dia mais difícil no modelo</strong> (média ~${dayAvg}/100). `;
  }

  if (bestPeriod && bestPeriod.avg != null) {
    const g = gradeLabel(bestPeriod.avg);
    vHtml += `O período com melhor nota é a <strong>${bestPeriod.label.toLowerCase()}</strong>, com média perto de <strong>${bestPeriod.avg}/100</strong> (${g.text.toLowerCase()}). `;
  }
  if (worstPeriod && worstPeriod.avg != null && worstPeriod.id !== bestPeriod?.id) {
    vHtml += `A <strong>${worstPeriod.label.toLowerCase()}</strong> tende a ser mais fraca (~${worstPeriod.avg}/100). `;
  }
  if (isInland) {
    vHtml +=
      ' <em>Lembrete:</em> em lago ou rio a maré do modelo é menos confiável; o índice pesa mais clima, Lua e Sol.';
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
    addHeading('Faixas em que o índice fica mais alto por várias horas:');
    for (const w of goodWins) {
      const i0 = dayIdx[w.a];
      const i1 = dayIdx[w.b];
      const line = document.createElement('div');
      line.className = 'window-line';
      line.textContent = `Entre ${formatHourRange(times[i0], times[i1])} — média ~${Math.round(w.avg)}/100 no intervalo.`;
      windowsEl.appendChild(line);
    }
  } else {
    addHeading('Não há muitas horas seguidas muito altas; veja o gráfico para picos isolados.');
  }

  if (poorWins.length) {
    addHeading('Faixas mais fracas em sequência:');
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
    ['Ponto fixo', `${place.lat.toFixed(5)}°, ${place.lon.toFixed(5)}°`],
    ['Célula do modelo (mar)', `${gridLat}°, ${gridLon}°`],
    ['Fuso horário', place.timezone || '—'],
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
    parts.push(`Sol (MET Norway): nascer do sol ${sr} · pôr do sol ${ss}`);
  }

  if (astro && astro.moonphase != null) {
    const mr = astro.moonrise
      ? new Date(astro.moonrise).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const ms = astro.moonset
      ? new Date(astro.moonset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const ev = [mr ? `lua nascendo ${mr}` : null, ms ? `lua se pondo ${ms}` : null].filter(Boolean).join(' · ');
    parts.push(`Lua: ~${astro.moonphase.toFixed(0)} % iluminada${ev ? ` · ${ev}` : ''}`);
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

  const tickColor = '#8b9cb8';
  const gridColor = 'rgba(100, 140, 190, 0.12)';

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
            s >= 65
              ? 'rgba(94, 240, 200, 0.75)'
              : s >= 45
                ? 'rgba(94, 184, 255, 0.6)'
                : 'rgba(255, 138, 138, 0.5)'
          ),
          borderRadius: 8,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Maré',
          data: seaNorm,
          borderColor: 'rgba(255, 215, 150, 0.9)',
          borderDash: [6, 4],
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
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
          backgroundColor: 'rgba(12, 18, 32, 0.94)',
          titleColor: '#f0f4fc',
          bodyColor: '#c5d4e8',
          borderColor: 'rgba(100, 140, 200, 0.25)',
          borderWidth: 1,
          padding: 14,
          titleFont: { size: 15 },
          bodyFont: { size: 14 },
          cornerRadius: 10,
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y;
              if (ctx.datasetIndex === 0) return `Índice: ${v}`;
              return `Maré (relativa): ${v?.toFixed ? v.toFixed(2) : v}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 14,
            color: tickColor,
            font: { size: 13 },
          },
          grid: { color: gridColor },
        },
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: 'Índice', color: tickColor, font: { size: 14 } },
          ticks: { color: tickColor, font: { size: 13 } },
          grid: { color: gridColor },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 1,
          title: { display: true, text: 'Maré', color: '#e8c86a', font: { size: 14 } },
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

async function loadFixedLocation() {
  const lat = FIXED_LAT;
  const lon = FIXED_LON;
  hideError();
  $('loading').classList.remove('hidden');
  $('mainContent').classList.add('hidden');

  try {
    const { timezone, utc_offset_seconds: utcPre } = await resolveTimezone(lat, lon);

    const [marine, forecast, epagriPayload] = await Promise.all([
      loadMarine(lat, lon, timezone),
      loadForecast(lat, lon, timezone),
      loadEpagriTideTable(),
    ]);

    const placeLabel = FIXED_PLACE_LABEL;
    const aligned = alignByTime(marine, forecast);
    if (!aligned.times.length) throw new Error('Sem dados horários para a Plataforma Norte.');

    const epagriByDate = epagriPayload?.extremesByDate ?? null;
    const modelSea = aligned.sea.slice();
    aligned.sea = buildEffectiveSeaLevels(aligned.times, modelSea, epagriByDate);

    const offsetStr = formatMetOffset(forecast.utc_offset_seconds ?? utcPre ?? 0);
    const dayKeys = aligned.times.map((t) => t.slice(0, 10));
    const astroByDay = await loadAstroSeries(lat, lon, dayKeys, offsetStr);

    const inland = isInlandContext();
    const { scores, details: scoreDetails } = computeHourlyScoresDetailed(lat, lon, aligned, astroByDay, inland);
    const dayData = groupByDay(aligned.times, scores, aligned.sea);

    state.bundle = {
      aligned,
      modelSea,
      marine,
      epagriExtremesByDate: epagriByDate,
      epagriMeta: epagriPayload
        ? { source: epagriPayload.source, year: epagriPayload.year, location: epagriPayload.location }
        : null,
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

    const todayKey = todayDateKeyInTimezone(timezone);
    const defaultDay = dayData.some((d) => d.date === todayKey) ? todayKey : aligned.times[0].slice(0, 10);
    fillDaySelect(dayData, defaultDay);

    const renderForDate = (dateKey) => {
      const dayRow = dayData.find((d) => d.date === dateKey);
      const dayAvg = dayRow?.avgScore ?? 0;
      renderRecommendations(dateKey, aligned.times, scores, dayAvg, inland, astroByDay, aligned);
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
    renderLiveWeatherPanel(forecast, aligned);
    startLiveWeatherUpdates();

    $('mainContent').classList.remove('hidden');
  } catch (e) {
    showError(e.message || 'Erro ao carregar os dados.');
  } finally {
    $('loading').classList.add('hidden');
  }
}

function setDrawerOpen(open) {
  const drawer = $('appDrawer');
  const backdrop = $('drawerBackdrop');
  const btn = $('btnMenu');
  if (!drawer || !backdrop || !btn) return;
  drawer.setAttribute('aria-hidden', String(!open));
  backdrop.setAttribute('aria-hidden', String(!open));
  btn.setAttribute('aria-expanded', String(open));
  if (open) {
    backdrop.classList.remove('hidden');
    document.body.classList.add('drawer-open');
  } else {
    backdrop.classList.add('hidden');
    document.body.classList.remove('drawer-open');
  }
}

function setDrawerPanel(panelId) {
  const map = {
    tide: { nav: 'tide', panel: 'drawerPanelTide' },
    method: { nav: 'method', panel: 'drawerPanelMethod' },
    weights: { nav: 'weights', panel: 'drawerPanelWeights' },
  };
  const cfg = map[panelId] || map.tide;
  document.querySelectorAll('.drawer-nav-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.drawerPanel === cfg.nav);
  });
  ['drawerPanelTide', 'drawerPanelMethod', 'drawerPanelWeights'].forEach((id) => {
    const p = $(id);
    if (!p) return;
    const show = id === cfg.panel;
    p.classList.toggle('hidden', !show);
    p.classList.toggle('is-active', show);
  });
}

$('btnMenu')?.addEventListener('click', () => {
  const drawer = $('appDrawer');
  const isOpen = drawer?.getAttribute('aria-hidden') === 'false';
  if (isOpen) {
    setDrawerOpen(false);
  } else {
    setDrawerOpen(true);
    setDrawerPanel('tide');
  }
});

$('btnCloseDrawer')?.addEventListener('click', () => setDrawerOpen(false));

$('drawerBackdrop')?.addEventListener('click', () => setDrawerOpen(false));

document.querySelectorAll('.drawer-nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.drawerPanel;
    if (id) setDrawerPanel(id);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const drawer = $('appDrawer');
  if (drawer?.getAttribute('aria-hidden') === 'false') setDrawerOpen(false);
});

$('hourlySort').addEventListener('change', () => {
  const b = state.bundle;
  if (!b) return;
  renderHourlyList($('daySelect').value, b.aligned.times, b.scores, b.scoreDetails, b.isInland);
});

$('btnRefreshLiveWeather')?.addEventListener('click', () => {
  const btn = $('btnRefreshLiveWeather');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '…';
  }
  refreshLiveWeatherSnapshot().finally(() => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Atualizar';
    }
  });
});

loadFixedLocation();
