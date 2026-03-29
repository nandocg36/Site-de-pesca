import { describe, expect, it } from 'vitest';
import {
  alignByTime,
  computeDayAverageScore,
  computeHourlyScoresDetailed,
  simpleVerdictFromScore,
  sliceDayIndices,
} from '../src/coastIndex.js';

describe('coastIndex', () => {
  it('alignByTime intersecta timestamps marine + forecast', () => {
    const marine = {
      hourly: {
        time: ['2026-03-29T12:00', '2026-03-29T13:00'],
        sea_level_height_msl: [1.0, 1.1],
        sea_surface_temperature: [22, 22],
        wave_height: [0.5, 0.5],
      },
    };
    const forecast = {
      hourly: {
        time: ['2026-03-29T12:00', '2026-03-29T13:00'],
        temperature_2m: [20, 21],
        apparent_temperature: [20, 21],
        pressure_msl: [1013, 1014],
        is_day: [1, 1],
        wind_speed_10m: [10, 12],
        wind_gusts_10m: [15, 18],
        wind_direction_10m: [180, 190],
        precipitation: [0, 0],
        precipitation_probability: [0, 0],
        relative_humidity_2m: [60, 62],
        cloud_cover: [40, 45],
        weather_code: [1, 2],
        cape: [100, 120],
      },
    };
    const a = alignByTime(marine, forecast);
    expect(a.times).toHaveLength(2);
    expect(a.sea[0]).toBe(1.0);
    expect(a.temp[1]).toBe(21);
  });

  it('computeHourlyScoresDetailed devolve scores 0–100', () => {
    const aligned = alignByTime(
      {
        hourly: {
          time: ['2026-03-29T12:00'],
          sea_level_height_msl: [1.0],
          sea_surface_temperature: [22],
          wave_height: [0.5],
        },
      },
      {
        hourly: {
          time: ['2026-03-29T12:00'],
          temperature_2m: [22],
          apparent_temperature: [22],
          pressure_msl: [1013],
          is_day: [1],
          wind_speed_10m: [8],
          wind_gusts_10m: [10],
          wind_direction_10m: [90],
          precipitation: [0],
          precipitation_probability: [5],
          relative_humidity_2m: [55],
          cloud_cover: [30],
          weather_code: [1],
          cape: [200],
        },
      },
    );
    const { scores } = computeHourlyScoresDetailed(-28.8, -49.2, aligned, new Map(), false);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toBeGreaterThanOrEqual(0);
    expect(scores[0]).toBeLessThanOrEqual(100);
  });

  it('sliceDayIndices + computeDayAverageScore', () => {
    const times = ['2026-03-29T10:00', '2026-03-29T11:00', '2026-03-30T10:00'];
    expect(sliceDayIndices(times, '2026-03-29')).toEqual([0, 1]);
    const scores = [40, 60, 50];
    expect(computeDayAverageScore(times, scores, '2026-03-29')).toBe(50);
  });

  it('simpleVerdictFromScore — limiares', () => {
    expect(simpleVerdictFromScore(65).word).toBe('BOM');
    expect(simpleVerdictFromScore(50).word).toBe('MAIS OU MENOS');
    expect(simpleVerdictFromScore(40).word).toBe('FRACO');
    expect(simpleVerdictFromScore(20).word).toBe('RUIM');
  });
});
