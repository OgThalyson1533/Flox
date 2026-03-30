/**
 * js/utils/date.js — GrokFin Elite v6
 * Funções puras de datas. Zero dependência de DOM ou estado.
 */

/** Parseia "DD/MM/AAAA" → Date (meio-dia local) ou null se inválido */
export function parseDateBR(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split('/').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [day, month, year] = parts;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (isNaN(date.getTime())) return null;
  return date;
}

/** Date → "DD/MM/AAAA" */
export function formatDateBR(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

/** Date → "22 de março de 2026" */
export function formatLongDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** ISO string ou Date → "Mar 2026" */
export function formatMonthYear(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(d);
}

/** ISO string → "12:34" */
export function formatShortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Retorna true se dois dates caem no mesmo mês/ano */
export function sameMonth(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Diferença em meses (inteiro) entre duas datas */
export function diffMonths(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** Adiciona N meses a uma data (imutável) */
export function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
