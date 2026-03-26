/**
 * PWA Pesca — Plataforma Norte, Balneário Rincão (ponto fixo).
 * Open-Meteo + MET Norway.
 */

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MET_SUN = 'https://api.met.no/weatherapi/sunrise/3.0/sun';
const MET_MOON = 'https://api.met.no/weatherapi/sunrise/3.0/moon';

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
  /** @type {{ aligned: object, scores: number[], scoreDetails: object[], dayData: object[], astroByDay: Map, forecast: object, isInland: boolean, placeLabel: string, tz: string, lat: number, lon: number } | null} */
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
    forecast_days: '8',
    timezone,
    cell_selection: 'sea',
  });
  return fetchJson(`${MARINE_URL}?${params}`);
}

async function loadForecast(lat, lon, timezone) {
  const hourly = [
    'temperature_2m',
    'pressure_msl',
    'is_day',
    'wind_speed_10m',
    'wind_gusts_10m',
    'wind_direction_10m',
    'precipitation',
    'precipitation_probability',
    'relative_humidity_2m',
    'cloud_cover',
  ].join(',');
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly,
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
  for (let i = 0; i < mt.length; i++) {
    const t = mt[i];
    const j = idxF.get(t);
    if (j === undefined) continue;
    times.push(t);
    sea.push(marine.hourly.sea_level_height_msl[i]);
    sst.push(marine.hourly.sea_surface_temperature?.[i] ?? null);
    wave.push(marine.hourly.wave_height?.[i] ?? null);
    temp.push(forecast.hourly.temperature_2m[j]);
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
  }
  return { times, sea, sst, wave, temp, press, isDay, wind, gust, windDir, rain, rainProb, rh, cloud };
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
  const { times, sea, sst, wave, temp, press, isDay, wind, gust, windDir, rain, rainProb, rh, cloud } = aligned;
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

  const windScore = wind.map((w, i) => windComfortKmh(w, gust[i]));
  const rainScore = rain.map((m, i) => rainComfort(m, rainProb[i]));
  const waveScore = wave.map((h) => waveComfortMeters(h, isInland));

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

    const sstS = sst[i] != null ? 0.06 * (sstScore[i] || 0.5) : 0.03;

    const raw =
      (isInland ? 0.06 : 0.2) * turnN[i] +
      (isInland ? 0.04 : 0.08) * speedSweet[i] +
      0.17 * moonComb +
      0.13 * sunB +
      0.09 * pressScore[i] +
      0.07 * tempScore[i] +
      0.08 * windScore[i] +
      0.07 * rainScore[i] +
      (isInland ? 0.03 : 0.06) * waveScore[i] +
      sstS;

    scores.push(Math.round(Math.max(0, Math.min(100, raw * 100))));
    details.push({
      turnN: turnN[i],
      speedSweet: speedSweet[i],
      moonComb,
      sunB,
      pressScore: pressScore[i],
      tempScore: tempScore[i],
      windScore: windScore[i],
      rainScore: rainScore[i],
      waveScore: waveScore[i],
      sstPresent: sst[i] != null && Number.isFinite(sst[i]),
      isDay: id,
      dPress: i === 0 ? 0 : dPress[i],
      dTemp: i === 0 ? 0 : dTemp[i],
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

  if (detail.pressScore >= 0.78) {
    lines.push('Pressão: <strong>mais estável</strong> (pouca queda na última hora).');
  } else if (detail.pressScore <= 0.48) {
    lines.push('Pressão: <strong>queda rápida</strong> — o tempo pode ficar instável.');
  }

  if (detail.tempScore >= 0.72) {
    lines.push('Temperatura do ar: <strong>mudou pouco</strong> na última hora.');
  } else if (detail.tempScore <= 0.45) {
    lines.push('Temperatura do ar: <strong>variação forte</strong> na última hora.');
  }

  if (detail.sstPresent) {
    lines.push('Temperatura da superfície do mar disponível no modelo para esta célula.');
  }

  return lines;
}

function formatMetricHour(detail, isInland) {
  const parts = [];
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

function getIndexWeightRows(isInland) {
  if (isInland) {
    return [
      { label: 'Maré — viragem (modelo)', pct: 8 },
      { label: 'Maré — ritmo do fluxo', pct: 5 },
      { label: 'Lua, solunar e fase', pct: 21 },
      { label: 'Sol — nascer / pôr / crepúsculo', pct: 16 },
      { label: 'Pressão atmosférica', pct: 11 },
      { label: 'Estabilidade da temperatura do ar', pct: 9 },
      { label: 'Vento e rajadas', pct: 10 },
      { label: 'Chuva e probabilidade', pct: 9 },
      { label: 'Ondas (peso reduzido)', pct: 4 },
      { label: 'Temperatura superficial do mar (SST)', pct: 7 },
    ];
  }
  return [
    { label: 'Maré — viragem (modelo)', pct: 19 },
    { label: 'Maré — ritmo do fluxo', pct: 8 },
    { label: 'Lua, solunar e fase', pct: 16 },
    { label: 'Sol — nascer / pôr / crepúsculo', pct: 12 },
    { label: 'Pressão atmosférica', pct: 9 },
    { label: 'Estabilidade da temperatura do ar', pct: 7 },
    { label: 'Vento e rajadas', pct: 8 },
    { label: 'Chuva e probabilidade', pct: 7 },
    { label: 'Altura de onda', pct: 6 },
    { label: 'Temperatura superficial do mar (SST)', pct: 8 },
  ];
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

function renderTideTablePanel(dateKey, dayIdx, times, sea, isInland) {
  const block = $('tideTableBlock');
  if (!block) return;
  if (isInland) {
    block.classList.add('hidden');
    block.innerHTML = '';
    return;
  }
  const ex = extractTideExtremesFromSeries(dayIdx, times, sea);
  if (!ex.length) {
    block.classList.add('hidden');
    block.innerHTML = '';
    return;
  }
  block.classList.remove('hidden');
  const rows = ex
    .map(
      (e) =>
        `<tr><td>${e.label}</td><td>${formatHourLabel(e.t)}</td><td>${e.y.toFixed(2)} m</td></tr>`
    )
    .join('');
  block.innerHTML = `
    <h3 class="subcard-title">Preamar e baixamar (modelo — não oficial)</h3>
    <p class="muted small">Estes horários são <strong>estimados pela curva do modelo Open-Meteo</strong>, não pela tábua do CHM/Marinha nem por estação maregráfica local. Use só como orientação para pesca; para barco e segurança, consulte a <a href="https://www.marinha.mil.br/chm/tabuas-de-mare" target="_blank" rel="noopener">tábua oficial</a>.</p>
    <div class="tide-table-wrap">
      <table class="tide-table">
        <thead><tr><th></th><th>Hora (seu fuso)</th><th>Nível (modelo)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
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
  renderTideTablePanel(dateKey, dayIdx, times, aligned?.sea || [], isInland);

  intro.textContent = `Para ${weekdayPt(dateKey)}, na Plataforma Norte — dados de previsão (vento, chuva, ondas, maré por modelo, Lua e Sol). O índice de 0 a 100 junta esses sinais; não garante pesca.`;

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
          padding: 12,
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
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14, color: tickColor },
          grid: { color: gridColor },
        },
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: 'Índice', color: tickColor, font: { size: 11 } },
          ticks: { color: tickColor },
          grid: { color: gridColor },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 1,
          title: { display: true, text: 'Maré', color: '#e8c86a', font: { size: 11 } },
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

    const [marine, forecast] = await Promise.all([
      loadMarine(lat, lon, timezone),
      loadForecast(lat, lon, timezone),
    ]);

    const placeLabel = FIXED_PLACE_LABEL;
    const aligned = alignByTime(marine, forecast);
    if (!aligned.times.length) throw new Error('Sem dados horários para a Plataforma Norte.');

    const offsetStr = formatMetOffset(forecast.utc_offset_seconds ?? utcPre ?? 0);
    const dayKeys = aligned.times.map((t) => t.slice(0, 10));
    const astroByDay = await loadAstroSeries(lat, lon, dayKeys, offsetStr);

    const inland = isInlandContext();
    const { scores, details: scoreDetails } = computeHourlyScoresDetailed(lat, lon, aligned, astroByDay, inland);
    const dayData = groupByDay(aligned.times, scores, aligned.sea);

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

loadFixedLocation();
