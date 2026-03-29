export {
  addDaysIso,
  buildEpagriCurveForDay,
  interpolateAlongPts,
  buildEffectiveSeaLevels,
  type EpagriExtreme,
  type EpagriByDate,
  type CurvePoint,
} from './tide-epagri.js';

export {
  alignByTime,
  computeHourlyScoresDetailed,
  computeDayAverageScore,
  sliceDayIndices,
  todayDateKeyInTimezone,
  simpleVerdictFromScore,
  weatherCodeLabel,
  weatherCodeEmoji,
  type AlignedSeries,
  type AstroDay,
  type ScoreDetail,
  type SimpleVerdict,
} from './coastIndex.js';
