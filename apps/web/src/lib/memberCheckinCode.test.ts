import { describe, expect, it } from 'vitest';
import { normalizeMemberCheckinCodeInput } from './memberCheckinCode';

describe('normalizeMemberCheckinCodeInput', () => {
  it('apara espaços e passa para maiúsculas', () => {
    expect(normalizeMemberCheckinCodeInput('  ab12  ')).toBe('AB12');
  });

  it('remove quebras de linha (comum em leitores / colar)', () => {
    expect(normalizeMemberCheckinCodeInput('xy9\n')).toBe('XY9');
    expect(normalizeMemberCheckinCodeInput('a\r\nb')).toBe('AB');
  });

  it('string vazia permanece vazia', () => {
    expect(normalizeMemberCheckinCodeInput('')).toBe('');
    expect(normalizeMemberCheckinCodeInput('   \n  ')).toBe('');
  });
});
