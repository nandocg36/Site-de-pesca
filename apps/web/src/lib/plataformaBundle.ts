/**
 * Carrega dados Open-Meteo + MET Norway + EPAGRI e calcula índice (Plataforma Norte).
 * Espelha o fluxo principal de `app.js` / `loadFixedLocation`.
 */

import {
  alignByTime,
  buildEffectiveSeaLevels,
  computeDayAverageScore,
  computeHourlyScoresDetailed,
  simpleVerdictFromScore,
  todayDateKeyInTimezone,
  weatherCodeEmoji,
  weatherCodeLabel,
  type EpagriByDate,
} from '@pesca/fishing-core';

export const FIXED_LAT = -28.82718;
export const FIXED_LON = -49.21348;
export const FIXED_PLACE_LABEL = 'Plataforma Norte, Balneário Rincão, SC';

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MET_SUN = 'https://api.met.no/weatherapi/sunrise/3.0/sun';
const MET_MOON = 'https://api.met.no/weatherapi/sunrise/3.0/moon';

const MET_HEADERS = {
  'User-Agent': 'PescaPlataformaNorte/1.0 (https://github.com/nandocg36/Site-de-pesca)',
  Accept: 'application/json',
} as const;

function apiLabelForUrl(url: string): string {
  if (url.includes('marine-api.open-meteo')) return 'dados marinhos (Open-Meteo)';
  if (url.includes('api.open-meteo.com')) return 'previsão do tempo (Open-Meteo)';
  if (url.includes('met.no')) return 'sol e lua (MET Norway)';
  return 'serviço externo';
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const label = apiLabelForUrl(url);
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: 'no-store' });
  } catch (e) {
    const netMsg =
      e instanceof TypeError && String(e.message || '').toLowerCase().includes('fetch')
        ? 'Sem ligação ou pedido bloqueado.'
        : e instanceof Error
          ? e.message
          : String(e);
    throw new Error(`Não foi possível contactar ${label}. ${netMsg}`);
  }
  if (!res.ok) {
    throw new Error(`Não foi possível carregar ${label} (código ${res.status}).`);
  }
  const data: unknown = await res.json();
  if (data && typeof data === 'object' && 'error' in data) {
    const er = data as { reason?: string };
    throw new Error(er.reason || `Erro reportado por ${label}.`);
  }
  return data;
}

function formatMetOffset(seconds: number): string {
  const totalM = Math.round(seconds / 60);
  const sign = totalM >= 0 ? '+' : '-';
  const abs = Math.abs(totalM);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function resolveTimezone(lat: number, lon: number): Promise<{ timezone: string; utc_offset_seconds: number }> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m',
    forecast_days: '1',
    timezone: 'auto',
  });
  const data = (await fetchJson(`${FORECAST_URL}?${params}`)) as {
    timezone?: string;
    utc_offset_seconds?: number;
  };
  return { timezone: data.timezone || 'GMT', utc_offset_seconds: data.utc_offset_seconds ?? 0 };
}

async function loadMarine(lat: number, lon: number, timezone: string): Promise<unknown> {
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

async function loadForecast(lat: number, lon: number, timezone: string): Promise<unknown> {
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
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly,
    past_days: '3',
    forecast_days: '8',
    timezone,
    wind_speed_unit: 'kmh',
  });
  return fetchJson(`${FORECAST_URL}?${params}`);
}

function parseTimeMaybe(s: string | null | undefined): number | null {
  if (!s || typeof s !== 'string') return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

type MetFeature = {
  properties?: {
    sunrise?: { time?: string };
    sunset?: { time?: string };
    solarnoon?: { time?: string };
    moonrise?: { time?: string };
    moonset?: { time?: string };
    moonphase?: number;
    high_moon?: { time?: string; disc_centre_elevation?: number };
    low_moon?: { time?: string; disc_centre_elevation?: number };
  };
};

function parseAstroDay(sunFeature: MetFeature | null | undefined, moonFeature: MetFeature | null | undefined) {
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
    moonAltHigh:
      typeof mp.high_moon?.disc_centre_elevation === 'number' ? mp.high_moon.disc_centre_elevation : null,
    moonAltLow: typeof mp.low_moon?.disc_centre_elevation === 'number' ? mp.low_moon.disc_centre_elevation : null,
  };
}

async function fetchMetSunMoon(
  lat: number,
  lon: number,
  dateIso: string,
  offsetStr: string,
): Promise<{ sun: MetFeature; moon: MetFeature }> {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    date: dateIso,
    offset: offsetStr,
  });
  const [sun, moon] = await Promise.all([
    fetchJson(`${MET_SUN}?${q}`, { headers: MET_HEADERS }) as Promise<MetFeature>,
    fetchJson(`${MET_MOON}?${q}`, { headers: MET_HEADERS }) as Promise<MetFeature>,
  ]);
  return { sun, moon };
}

async function loadAstroSeries(
  lat: number,
  lon: number,
  dayKeys: string[],
  offsetStr: string,
): Promise<Map<string, ReturnType<typeof parseAstroDay>>> {
  const unique = [...new Set(dayKeys)].sort();
  const settled = await Promise.allSettled(
    unique.map(async (d) => {
      const { sun, moon } = await fetchMetSunMoon(lat, lon, d, offsetStr);
      return [d, parseAstroDay(sun, moon)] as const;
    }),
  );
  const map = new Map<string, ReturnType<typeof parseAstroDay>>();
  settled.forEach((result, i) => {
    const d = unique[i];
    if (result.status === 'fulfilled') {
      map.set(result.value[0], result.value[1]);
    } else {
      map.set(d, parseAstroDay(null, null));
    }
  });
  return map;
}

type EpagriPayload = { extremesByDate?: EpagriByDate; year?: number; location?: string; source?: string };

async function loadEpagriTideTable(epagriUrl: string): Promise<EpagriPayload | null> {
  try {
    const r = await fetch(epagriUrl, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as EpagriPayload;
    if (j?.extremesByDate && typeof j.extremesByDate === 'object') return j;
  } catch {
    /* ignore */
  }
  return null;
}

export type PlataformaPinnedSnapshot = {
  placeLabel: string;
  timezone: string;
  todayKey: string;
  dayAvg: number;
  verdictWord: string;
  verdictSub: string;
  verdictCls: string;
  scoreRounded: number;
  weatherEmoji: string;
  weatherDesc: string;
};

export async function loadPlataformaPinnedSnapshot(
  epagriUrl = '/data/epagri-tides-2026.json',
): Promise<PlataformaPinnedSnapshot> {
  const lat = FIXED_LAT;
  const lon = FIXED_LON;
  const { timezone, utc_offset_seconds: utcPre } = await resolveTimezone(lat, lon);
  const [marine, forecast, epagriPayload] = await Promise.all([
    loadMarine(lat, lon, timezone),
    loadForecast(lat, lon, timezone),
    loadEpagriTideTable(epagriUrl),
  ]);

  const f = forecast as { utc_offset_seconds?: number };
  const aligned = alignByTime(marine, forecast);
  if (!aligned.times.length) {
    throw new Error('Sem dados horários para a Plataforma Norte.');
  }

  const epagriByDate = epagriPayload?.extremesByDate ?? null;
  const modelSea = aligned.sea.slice();
  aligned.sea = buildEffectiveSeaLevels(aligned.times, modelSea, epagriByDate);

  const offsetStr = formatMetOffset(f.utc_offset_seconds ?? utcPre ?? 0);
  const dayKeys = aligned.times.map((t) => t.slice(0, 10));
  const astroByDay = await loadAstroSeries(lat, lon, dayKeys, offsetStr);

  const { scores, details } = computeHourlyScoresDetailed(lat, lon, aligned, astroByDay, false);
  const todayKey = todayDateKeyInTimezone(timezone);
  const dayAvg = computeDayAverageScore(aligned.times, scores, todayKey);
  const { word, sub, cls } = simpleVerdictFromScore(dayAvg);
  const scoreRounded = Math.round(dayAvg);

  let gi = aligned.times.findIndex((t) => t.startsWith(todayKey));
  if (gi < 0) gi = 0;
  const wc = details[gi]?.weatherCode ?? null;

  return {
    placeLabel: FIXED_PLACE_LABEL,
    timezone,
    todayKey,
    dayAvg,
    verdictWord: word,
    verdictSub: sub,
    verdictCls: cls,
    scoreRounded,
    weatherEmoji: weatherCodeEmoji(wc),
    weatherDesc: weatherCodeLabel(wc),
  };
}
