/**
 * Índice costeiro 0–100 (maré + tempo + astro) — porte da lógica em `app.js` (Plataforma Norte).
 * Sem I/O: recebe séries já alinhadas e mapa astro por dia (YYYY-MM-DD).
 */

export type AstroDay = {
  sunrise: number | null;
  sunset: number | null;
  solarnoon: number | null;
  moonrise: number | null;
  moonset: number | null;
  moonphase: number | null;
  highMoon: number | null;
  lowMoon: number | null;
  moonAltHigh: number | null;
  moonAltLow: number | null;
};

export type AlignedSeries = {
  times: string[];
  sea: number[];
  sst: (number | null)[];
  wave: (number | null)[];
  temp: number[];
  apparent: (number | null)[];
  press: number[];
  isDay: (0 | 1 | null)[];
  wind: (number | null)[];
  gust: (number | null)[];
  windDir: (number | null)[];
  rain: (number | null)[];
  rainProb: (number | null)[];
  rh: (number | null)[];
  cloud: (number | null)[];
  weatherCode: (number | null)[];
  cape: (number | null)[];
};

export type ScoreDetail = {
  turnN: number;
  speedSweet: number;
  moonComb: number;
  sunB: number;
  pressLevelScore: number;
  pressTrendScore: number;
  tempStabScore: number;
  apparentScore: number;
  windScore: number;
  rainScore: number;
  waveScore: number;
  rhScore: number;
  cloudScore: number;
  wxScore: number;
  capeScore: number;
  contextScore: number;
  pressScore: number;
  tempScore: number;
  sstPresent: boolean;
  isDay: 0 | 1 | null;
  dPress: number;
  dTemp: number;
  tempC: number;
  appTempC: number | null;
  pressHpa: number;
  windKmh: number | null;
  gustKmh: number | null;
  windDir: number | null;
  rainMm: number | null;
  rainProbPct: number | null;
  rhPct: number | null;
  cloudPct: number | null;
  waveM: number | null;
  solMajorLabel: string | null;
  solMinorLabel: string | null;
  weatherCode: number | null;
  weatherDesc: string | null;
};

export function alignByTime(marine: unknown, forecast: unknown): AlignedSeries {
  const m = marine as {
    hourly?: {
      time?: string[];
      sea_level_height_msl?: number[];
      sea_surface_temperature?: (number | null)[];
      wave_height?: (number | null)[];
    };
  };
  const f = forecast as {
    hourly?: Record<string, (number | null)[] | undefined>;
  };
  const mt = m?.hourly?.time ?? [];
  const ft = f?.hourly?.time ?? [];
  const idxF = new Map(ft.map((t, i) => [t, i]));
  const times: string[] = [];
  const sea: number[] = [];
  const sst: (number | null)[] = [];
  const wave: (number | null)[] = [];
  const temp: number[] = [];
  const press: number[] = [];
  const isDay: (0 | 1 | null)[] = [];
  const wind: (number | null)[] = [];
  const gust: (number | null)[] = [];
  const windDir: (number | null)[] = [];
  const rain: (number | null)[] = [];
  const rainProb: (number | null)[] = [];
  const rh: (number | null)[] = [];
  const cloud: (number | null)[] = [];
  const weatherCode: (number | null)[] = [];
  const cape: (number | null)[] = [];
  const apparent: (number | null)[] = [];
  const fh = f.hourly ?? {};

  for (let i = 0; i < mt.length; i++) {
    const t = mt[i];
    const j = idxF.get(t);
    if (j === undefined) continue;
    times.push(t);
    sea.push(m.hourly!.sea_level_height_msl![i]);
    sst.push(m.hourly!.sea_surface_temperature?.[i] ?? null);
    wave.push(m.hourly!.wave_height?.[i] ?? null);
    temp.push(fh.temperature_2m![j] as number);
    apparent.push((fh.apparent_temperature?.[j] ?? null) as number | null);
    press.push(fh.pressure_msl![j] as number);
    const id = fh.is_day?.[j];
    isDay.push(id === 1 ? 1 : id === 0 ? 0 : null);
    wind.push((fh.wind_speed_10m?.[j] ?? null) as number | null);
    gust.push((fh.wind_gusts_10m?.[j] ?? null) as number | null);
    windDir.push((fh.wind_direction_10m?.[j] ?? null) as number | null);
    rain.push((fh.precipitation?.[j] ?? null) as number | null);
    rainProb.push((fh.precipitation_probability?.[j] ?? null) as number | null);
    rh.push((fh.relative_humidity_2m?.[j] ?? null) as number | null);
    cloud.push((fh.cloud_cover?.[j] ?? null) as number | null);
    weatherCode.push((fh.weather_code?.[j] ?? null) as number | null);
    cape.push((fh.cape?.[j] ?? null) as number | null);
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

function normalize(arr: (number | null)[], invert = false): number[] {
  const valid = arr.filter((v): v is number => v != null && Number.isFinite(v));
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

function moonPhaseBoostFromPercent(phasePct: number | null | undefined): number {
  if (phasePct == null || !Number.isFinite(phasePct)) return 0.5;
  const x = phasePct / 100;
  return Math.max(0, Math.min(1, 1 - 2 * Math.abs(x - 0.5)));
}

function sunEdgeBoost(tMs: number, sunrise: number | null, sunset: number | null): number {
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

function moonEventBoostFromTimes(moonrise: number | null, moonset: number | null) {
  const events = [moonrise, moonset].filter((x) => x != null) as number[];
  return (tMs: number) => {
    if (!events.length) return 0;
    let best = 0;
    for (const ev of events) {
      const d = Math.abs(tMs - ev) / 3600000;
      if (d < 1.75) best = Math.max(best, 1 - d / 1.75);
    }
    return best;
  };
}

function windComfortKmh(wind: number | null, gust: number | null): number {
  const w = wind != null && Number.isFinite(wind) ? wind : 0;
  const g = gust != null && Number.isFinite(gust) ? gust : w;
  const x = Math.max(w, g * 0.92);
  if (x <= 10) return 1;
  if (x >= 48) return 0.18;
  return 1 - ((x - 10) / 38) * 0.82;
}

function rainComfort(mm: number | null, prob: number | null): number {
  const p = prob != null && Number.isFinite(prob) ? prob : 0;
  const m = mm != null && Number.isFinite(mm) ? mm : 0;
  let s = 1 - Math.min(1, m / 4) * 0.85;
  s *= 1 - (p / 100) * 0.35;
  return Math.max(0.15, Math.min(1, s));
}

function waveComfortMeters(waveHeight: number | null, isInland: boolean): number {
  if (isInland) return 0.55;
  const h = waveHeight;
  if (h == null || !Number.isFinite(h)) return 0.55;
  if (h <= 0.4) return 1;
  if (h >= 2.8) return 0.2;
  return 1 - ((h - 0.4) / 2.4) * 0.8;
}

function pressureLevelComfort(hPa: number | null | undefined): number {
  if (hPa == null || !Number.isFinite(hPa)) return 0.55;
  const d = Math.abs(hPa - 1013);
  if (d <= 6) return 1;
  if (d >= 28) return 0.38;
  return 1 - ((d - 6) / 22) * 0.62;
}

function apparentTempComfortCelsius(app: number | null | undefined): number {
  if (app == null || !Number.isFinite(app)) return 0.55;
  if (app >= 16 && app <= 30) return 1;
  if (app < 10) return Math.max(0.2, 0.35 + app * 0.015);
  if (app < 16) return 0.35 + ((app - 10) / 6) * 0.65;
  if (app <= 34) return 1 - ((app - 30) / 4) * 0.45;
  return Math.max(0.22, 0.55 - (app - 34) * 0.04);
}

function rhComfortPct(rhVal: number | null | undefined): number {
  if (rhVal == null || !Number.isFinite(rhVal)) return 0.55;
  if (rhVal >= 40 && rhVal <= 78) return 1;
  if (rhVal < 40) return 0.45 + (rhVal / 40) * 0.55;
  return Math.max(0.35, 1 - ((rhVal - 78) / 22) * 0.65);
}

function cloudCoverComfort(pct: number | null | undefined): number {
  if (pct == null || !Number.isFinite(pct)) return 0.55;
  if (pct >= 25 && pct <= 85) return 1;
  if (pct < 25) return 0.72 + (pct / 25) * 0.28;
  return Math.max(0.4, 1 - ((pct - 85) / 15) * 0.6);
}

function weatherCodeFishingScore(code: number | null | undefined): number {
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

function capeComfortScore(capeVal: number | null | undefined): number {
  if (capeVal == null || !Number.isFinite(capeVal)) return 0.62;
  if (capeVal < 400) return 1;
  if (capeVal >= 3500) return 0.25;
  return 1 - ((capeVal - 400) / 3100) * 0.75;
}

function slicePrevHours<T>(arr: T[], i: number, hours: number): T[] {
  const out: T[] = [];
  const from = Math.max(0, i - hours);
  for (let k = from; k < i; k++) out.push(arr[k]);
  return out;
}

function meanFinite(arr: (number | null | undefined)[]): number | null {
  const v = arr.filter((x) => x != null && Number.isFinite(x)) as number[];
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function maxFinite(arr: (number | null | undefined)[]): number | null {
  const v = arr.filter((x) => x != null && Number.isFinite(x)) as number[];
  if (!v.length) return null;
  return Math.max(...v);
}

function recentContextScore(
  i: number,
  press: number[],
  rain: (number | null)[],
  gust: (number | null)[],
): number {
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

function normalizeScoreWeights(wmap: Record<string, number>): Record<string, number> {
  const t = Object.values(wmap).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const k of Object.keys(wmap)) out[k] = wmap[k] / t;
  return out;
}

function buildSolunarWindows(astro: AstroDay | null | undefined): {
  major: { start: number; end: number; label: string; centerMs: number }[];
  minor: { start: number; end: number; label: string; centerMs: number }[];
} {
  if (!astro) return { major: [], minor: [] };
  const major: { start: number; end: number; label: string; centerMs: number }[] = [];
  const minor: { start: number; end: number; label: string; centerMs: number }[] = [];
  const pushWin = (
    arr: { start: number; end: number; label: string; centerMs: number }[],
    centerMs: number | null | undefined,
    halfHours: number,
    label: string,
  ) => {
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

function hourOverlapsSolunar(
  tMs: number,
  windows: { start: number; end: number; label: string }[],
): string | null {
  for (const w of windows) {
    if (tMs >= w.start && tMs <= w.end) return w.label;
  }
  return null;
}

export function weatherCodeLabel(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return '—';
  const c = Math.round(code);
  const map: Record<number, string> = {
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
  return map[c] ?? `Condição (${c})`;
}

export function weatherCodeEmoji(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return '🌤️';
  const c = Math.round(code);
  if (c === 0 || c === 1) return '☀️';
  if (c === 2 || c === 3) return '⛅';
  if (c === 45 || c === 48) return '🌫️';
  if (c >= 51 && c <= 57) return '🌦️';
  if (c >= 61 && c <= 67) return '🌧️';
  if (c >= 71 && c <= 77) return '❄️';
  if (c >= 80 && c <= 86) return '⛈️';
  if (c >= 95) return '⚡';
  return '🌤️';
}

export function sliceDayIndices(times: string[], dateKey: string): number[] {
  const idx: number[] = [];
  for (let i = 0; i < times.length; i++) {
    if (times[i].startsWith(dateKey)) idx.push(i);
  }
  return idx;
}

export function todayDateKeyInTimezone(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function computeDayAverageScore(times: string[], scores: number[], dateKey: string): number {
  const idx = sliceDayIndices(times, dateKey);
  if (!idx.length) return 0;
  let s = 0;
  for (const i of idx) s += scores[i];
  return s / idx.length;
}

export type SimpleVerdict = { word: string; sub: string; cls: string };

/** Veredito em linguagem simples (cartão principal). */
export function simpleVerdictFromScore(avg: number): SimpleVerdict {
  if (avg >= 60) {
    return {
      word: 'BOM',
      sub: 'Pelo modelo, é um bom dia para ir pescar na plataforma.',
      cls: 'simple-good',
    };
  }
  if (avg >= 48) {
    return {
      word: 'MAIS OU MENOS',
      sub: 'Dá para ir; nem o melhor nem o pior dia.',
      cls: 'simple-mid',
    };
  }
  if (avg >= 38) {
    return { word: 'FRACO', sub: 'O modelo diz que hoje é mais difícil.', cls: 'simple-low' };
  }
  return { word: 'RUIM', sub: 'Pelo modelo, hoje está desfavorável.', cls: 'simple-bad' };
}

export function computeHourlyScoresDetailed(
  _lat: number,
  _lon: number,
  aligned: AlignedSeries,
  astroByDay: Map<string, AstroDay> | null | undefined,
  isInland: boolean,
): { scores: number[]; details: ScoreDetail[] } {
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
    apparentTempComfortCelsius(appSeries[i] != null && Number.isFinite(appSeries[i]) ? appSeries[i]! : t),
  );

  const sstScore = normalize(
    sst.map((v) => (v == null ? null : v)),
    false,
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

  const scores: number[] = [];
  const details: ScoreDetail[] = [];
  const moonEvCache = new Map<string, (tMs: number) => number>();
  const solunarCache = new Map<string, ReturnType<typeof buildSolunarWindows>>();

  for (let i = 0; i < n; i++) {
    const tStr = times[i];
    const d = new Date(tStr);
    const tMs = d.getTime();
    const dayKey = tStr.slice(0, 10);
    const astro = astroByDay?.get(dayKey);

    if (!solunarCache.has(dayKey)) {
      solunarCache.set(dayKey, buildSolunarWindows(astro ?? null));
    }
    const { major, minor } = solunarCache.get(dayKey)!;
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

    const moonP = moonPhaseBoostFromPercent(astro?.moonphase ?? null);
    if (!moonEvCache.has(dayKey)) {
      const a = astro ?? ({} as AstroDay);
      moonEvCache.set(dayKey, moonEventBoostFromTimes(a.moonrise, a.moonset));
    }
    const moonEv = moonEvCache.get(dayKey)!(tMs);
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
      pressScore: pressTrendScore[i],
      tempScore: tempStabScore[i],
      sstPresent: sst[i] != null && Number.isFinite(sst[i]),
      isDay: id,
      dPress: i === 0 ? 0 : dPress[i],
      dTemp: i === 0 ? 0 : dTemp[i],
      tempC: temp[i],
      appTempC: appSeries[i] ?? null,
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
