/**
 * Maré EPAGRI: extremos → curva linear hora a hora (sem dependências de DOM).
 * Espelha a lógica legada em `js/tide-epagri.js`.
 */

export type EpagriExtreme = { t: string; h_m: number; hi: boolean };
export type EpagriByDate = Record<string, EpagriExtreme[] | undefined>;
export type CurvePoint = { ms: number; h: number };

export function addDaysIso(isoDate: string, n: number): string {
  const [Y, M, D] = isoDate.split('-').map(Number);
  const dt = new Date(Y, M - 1, D + n);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Curva contínua (linear entre extremos) para interpolar nível hora a hora. */
export function buildEpagriCurveForDay(
  dateKey: string,
  byDate: EpagriByDate | null | undefined,
): CurvePoint[] | null {
  if (!byDate || typeof byDate !== 'object') return null;
  const cur = byDate[dateKey];
  if (!cur || cur.length < 2) return null;
  const prevKey = addDaysIso(dateKey, -1);
  const nextKey = addDaysIso(dateKey, 1);
  const prev = byDate[prevKey];
  const next = byDate[nextKey];
  const pts: CurvePoint[] = [];
  const pushDay = (dk: string, e: EpagriExtreme) => {
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

export function interpolateAlongPts(pts: CurvePoint[] | null | undefined, tMs: number): number | null {
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
export function buildEffectiveSeaLevels(
  times: string[],
  modelSea: number[],
  byDate: EpagriByDate | null | undefined,
): number[] {
  if (!byDate || typeof byDate !== 'object') return modelSea.slice();
  const cache = new Map<string, CurvePoint[] | null>();
  const out: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const dk = times[i].slice(0, 10);
    if (!cache.has(dk)) {
      cache.set(dk, buildEpagriCurveForDay(dk, byDate));
    }
    const curve = cache.get(dk) ?? null;
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
