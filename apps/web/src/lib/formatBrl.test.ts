import { describe, expect, it } from 'vitest';
import { formatCentsBrl, parseReaisToCents } from './formatBrl';

describe('formatBrl', () => {
  it('formata centavos em BRL', () => {
    expect(formatCentsBrl(15000)).toMatch(/150/);
    expect(formatCentsBrl(0)).toMatch(/0/);
  });

  it('parseReaisToCents aceita vírgula decimal pt-BR', () => {
    expect(parseReaisToCents('150,50')).toBe(15050);
    expect(parseReaisToCents(' 1.234,56 ')).toBe(123456);
  });

  it('parseReaisToCents aceita ponto decimal', () => {
    expect(parseReaisToCents('150.5')).toBe(15050);
  });

  it('parseReaisToCents devolve null para inválido', () => {
    expect(parseReaisToCents('')).toBeNull();
    expect(parseReaisToCents('abc')).toBeNull();
  });
});
