/**
 * js/utils/math.js — GrokFin Elite v6
 * Matemática e IDs. Zero dependência de DOM ou estado.
 */

/** Converte reais (float) → centavos (inteiro) — elimina imprecisão de ponto flutuante */
export const toCents = (brl) => Math.round(Number(brl) * 100);

/** Converte centavos (inteiro) → reais (float) */
export const fromCents = (cents) => Number(cents) / 100;

/** Limita n entre min e max */
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * Gera ID único criptograficamente seguro (compatível com colunas UUID do Supabase).
 * FIX Bug #5: usa crypto.randomUUID() puro.
 * @param {string} prefix
 * @returns {string}
 */
export const uid = (prefix = 'id') => crypto.randomUUID();

/** Taxa de poupança em % — zero se incomes = 0 */
export const savingRate = (incomes, net) =>
  incomes > 0 ? clamp((net / incomes) * 100, -999, 100) : 0;

/**
 * Soma segura de centavos a partir de um array de valores em reais.
 * Evita erros cumulativos de ponto flutuante.
 * @param {number[]} values — valores em reais
 * @returns {number} — resultado em reais
 */
export function safeSum(values) {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}
