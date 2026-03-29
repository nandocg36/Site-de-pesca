/** Formata centavos de BRL para exibição (ex.: 15000 → R$ 150,00). */
export function formatCentsBrl(cents: number): string {
  const n = Number.isFinite(cents) ? cents : 0;
  return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Converte string de reais (ex.: "150,50" ou "150.5") em centavos; null se inválido. */
export function parseReaisToCents(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const v = Number(normalized);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}
