import { describe, it, expect } from 'vitest';
import {
  addDaysIso,
  buildEpagriCurveForDay,
  interpolateAlongPts,
  buildEffectiveSeaLevels,
} from '../src/tide-epagri.js';

describe('addDaysIso', () => {
  it('avança um dia no fim do mês', () => {
    expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01');
  });
  it('recua um dia', () => {
    expect(addDaysIso('2026-03-15', -1)).toBe('2026-03-14');
  });
});

describe('interpolateAlongPts', () => {
  it('interpola o ponto médio', () => {
    const pts = [
      { ms: 0, h: 0 },
      { ms: 3_600_000, h: 2 },
    ];
    expect(interpolateAlongPts(pts, 1_800_000)).toBe(1);
  });
  it('retorna null sem pontos suficientes', () => {
    expect(interpolateAlongPts(null, 0)).toBeNull();
    expect(interpolateAlongPts([{ ms: 0, h: 1 }], 0)).toBeNull();
  });
});

describe('buildEpagriCurveForDay', () => {
  it('null sem dois extremos no dia', () => {
    expect(
      buildEpagriCurveForDay('2026-01-01', { '2026-01-01': [{ t: '12:00', h_m: 1, hi: true }] }),
    ).toBeNull();
  });
  it('monta curva com dois pontos no dia', () => {
    const byDate = {
      '2026-06-15': [
        { t: '06:00', h_m: 0.2, hi: false },
        { t: '18:00', h_m: 0.8, hi: true },
      ],
    };
    const curve = buildEpagriCurveForDay('2026-06-15', byDate);
    expect(curve).not.toBeNull();
    expect(curve!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildEffectiveSeaLevels', () => {
  it('sem tábua devolve cópia do modelo', () => {
    expect(buildEffectiveSeaLevels(['2026-01-01T00:00'], [1.2], null)).toEqual([1.2]);
  });
  it('usa EPAGRI quando a curva existe (meio entre dois extremos)', () => {
    const byDate = {
      '2026-06-15': [
        { t: '06:00', h_m: 0.0, hi: false },
        { t: '18:00', h_m: 1.0, hi: true },
      ],
    };
    const times = ['2026-06-15T12:00:00'];
    const modelSea = [99];
    const out = buildEffectiveSeaLevels(times, modelSea, byDate);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toBe(99);
    expect(out[0]).toBeGreaterThan(0.4);
    expect(out[0]).toBeLessThan(0.6);
  });
  it('fallback ao modelo se não houver curva para o dia', () => {
    const byDate = { '2026-06-15': [{ t: '12:00', h_m: 0.5, hi: true }] };
    const out = buildEffectiveSeaLevels(['2026-06-15T12:00:00'], [2.5], byDate);
    expect(out[0]).toBe(2.5);
  });
});
