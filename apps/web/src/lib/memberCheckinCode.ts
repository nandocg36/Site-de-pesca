/**
 * Normaliza o input da portaria antes do RPC (manual ou colado de leitor QR).
 */
export function normalizeMemberCheckinCodeInput(raw: string): string {
  return raw.trim().replace(/\r?\n/g, '').toUpperCase();
}
