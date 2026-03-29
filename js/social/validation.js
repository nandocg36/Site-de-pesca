import { BAIT_OPTIONS, VISIBILITY } from './constants.js';

const BAIT_IDS = new Set(BAIT_OPTIONS.map((b) => b.id));

/**
 * @param {unknown} v
 * @returns {{ ok: true, value: string } | { ok: false, errors: string[] }}
 */
export function validateDisplayName(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < 2) return { ok: false, errors: ['Nome deve ter pelo menos 2 caracteres.'] };
  if (s.length > 40) return { ok: false, errors: ['Nome pode ter no máximo 40 caracteres.'] };
  return { ok: true, value: s };
}

/**
 * @param {unknown} v
 */
export function validateEmailLoose(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < 5) return { ok: false, errors: ['E-mail parece inválido.'] };
  if (s.length > 120) return { ok: false, errors: ['E-mail demasiado longo.'] };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: false, errors: ['Formato de e-mail inválido.'] };
  return { ok: true, value: s.toLowerCase() };
}

/**
 * @param {unknown} caption
 * @param {unknown} visibility
 */
export function validateNewPost(caption, visibility) {
  const errors = [];
  const cap = typeof caption === 'string' ? caption.trim() : '';
  if (cap.length > 500) errors.push('Legenda pode ter no máximo 500 caracteres.');
  const vis = visibility === VISIBILITY.FRIENDS ? VISIBILITY.FRIENDS : VISIBILITY.PUBLIC;
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { caption: cap, visibility: vis } };
}

/**
 * @param {unknown} text
 */
export function validateComment(text) {
  const s = typeof text === 'string' ? text.trim() : '';
  if (s.length < 1) return { ok: false, errors: ['Comentário não pode ficar vazio.'] };
  if (s.length > 280) return { ok: false, errors: ['Comentário pode ter no máximo 280 caracteres.'] };
  return { ok: true, value: s };
}

/**
 * @param {unknown} baitId
 * @param {unknown} fishingToday — boolean ou string 'yes'/'no'
 * @param {unknown} dayRating — 1–5
 * @param {unknown} waterActivity — 1–5
 */
export function validateSurveyPayload(baitId, fishingToday, dayRating, waterActivity) {
  const errors = [];
  const bait = typeof baitId === 'string' ? baitId.trim() : '';
  if (!BAIT_IDS.has(bait)) errors.push('Escolha uma isca válida.');

  let fishing = false;
  if (typeof fishingToday === 'boolean') fishing = fishingToday;
  else if (fishingToday === 'yes' || fishingToday === 'true') fishing = true;
  else if (fishingToday === 'no' || fishingToday === 'false') fishing = false;
  else errors.push('Indique se está a pescar hoje.');

  const dr = Number(dayRating);
  const wa = Number(waterActivity);
  if (!Number.isInteger(dr) || dr < 1 || dr > 5) errors.push('Avaliação do dia: use 1 a 5.');
  if (!Number.isInteger(wa) || wa < 1 || wa > 5) errors.push('Atividade na água: use 1 a 5.');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      baitId: bait,
      fishingToday: fishing,
      dayRating: dr,
      waterActivity: wa,
    },
  };
}
