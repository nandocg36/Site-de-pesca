import { describe, expect, it } from 'vitest';
import {
  validateComment,
  validateDisplayName,
  validateEmailLoose,
  validateNewPost,
  validateSurveyPayload,
} from '../js/social/validation.js';
import { VISIBILITY } from '../js/social/constants.js';

describe('validateDisplayName', () => {
  it('aceita nome curto válido', () => {
    const r = validateDisplayName('  Luiz  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('Luiz');
  });
  it('rejeita muito curto', () => {
    expect(validateDisplayName('a').ok).toBe(false);
  });
  it('rejeita muito longo', () => {
    expect(validateDisplayName('x'.repeat(41)).ok).toBe(false);
  });
});

describe('validateEmailLoose', () => {
  it('aceita e-mail simples', () => {
    const r = validateEmailLoose('a@b.co');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('a@b.co');
  });
  it('rejeita sem @', () => {
    expect(validateEmailLoose('nope').ok).toBe(false);
  });
});

describe('validateNewPost', () => {
  it('normaliza visibilidade e legenda vazia', () => {
    const r = validateNewPost('', 'public');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.caption).toBe('');
      expect(r.value.visibility).toBe(VISIBILITY.PUBLIC);
    }
  });
  it('aceita friends', () => {
    const r = validateNewPost('Olá', 'friends');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.visibility).toBe(VISIBILITY.FRIENDS);
  });
  it('rejeita legenda longa', () => {
    expect(validateNewPost('z'.repeat(501), 'public').ok).toBe(false);
  });
});

describe('validateComment', () => {
  it('rejeita vazio', () => {
    expect(validateComment('  ').ok).toBe(false);
  });
  it('aceita texto', () => {
    const r = validateComment(' Boa! ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('Boa!');
  });
});

describe('validateSurveyPayload', () => {
  it('aceita payload válido', () => {
    const r = validateSurveyPayload('camarão', true, 4, 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.baitId).toBe('camarão');
      expect(r.value.fishingToday).toBe(true);
      expect(r.value.dayRating).toBe(4);
      expect(r.value.waterActivity).toBe(5);
    }
  });
  it('rejeita isca inválida', () => {
    const r = validateSurveyPayload('banana', true, 3, 3);
    expect(r.ok).toBe(false);
  });
  it('rejeita ratings fora do intervalo', () => {
    expect(validateSurveyPayload('milho', false, 0, 3).ok).toBe(false);
    expect(validateSurveyPayload('milho', false, 3, 6).ok).toBe(false);
  });
});
