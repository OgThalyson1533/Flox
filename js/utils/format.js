/**
 * js/utils/format.js — GrokFin Elite v6
 * Funções puras de formatação. Zero dependência de DOM ou estado.
 */

/** Formata um número como moeda BRL: R$ 1.234,56 */
export function formatMoney(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** Formata número com casas decimais: 1234.5 → "1.234,5" */
export function formatNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return '0';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/** Formata percentual: 15.5 → "15,5%" */
export function formatPercent(value, decimals = 0) {
  if (value == null || isNaN(value)) return '0%';
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)}%`;
}

/** Versão curta de moeda: R$ 312 mil, R$ 1,2 mi */
export function formatMoneyShort(value) {
  if (value == null || isNaN(value)) return 'R$ 0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (abs >= 1_000)     return `${sign}R$ ${(abs / 1_000).toFixed(0)} mil`;
  return `${sign}R$ ${Math.round(abs)}`;
}

/** Escapa HTML para prevenir XSS */
export function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Converte **negrito** para <strong> e _itálico_ para <em>.
 * Usa escapeHtml primeiro para segurança.
 */
export function richText(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/_(.+?)_/g, '<em class="text-white/75 not-italic">$1</em>');
}

/**
 * Parseia entrada de moeda do usuário: "1.250,90" ou "1250.90" → 1250.90
 * Retorna 0 se inválido.
 */
export function parseCurrencyInput(raw) {
  if (!raw) return 0;
  const clean = String(raw).trim()
    .replace(/[^\d.,]/g, '')
    .replace(/\.(?=.*\.)/g, '')  // remove pontos extras (exceto o último)
    .replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Utilitário de animação numérica (Number Scroller).
 * Anima um valor de 'start' até 'end' ao longo de 'duration' ms.
 */
export function animateValue(element, start, end, duration, formatFn = formatMoney) {
  if (!element) return;
  start = parseFloat(start) || 0;
  end = parseFloat(end) || 0;
  if (start === end) {
    element.textContent = formatFn(end);
    return;
  }
  
  let startTimestamp = null;
  const easeOutQuart = t => 1 - Math.pow(1 - t, 4);

  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeProgress = easeOutQuart(progress);
    const current = start + easeProgress * (end - start);
    
    element.textContent = formatFn(current);
    
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      element.textContent = formatFn(end); // Garante valor final exato
    }
  };
  
  window.requestAnimationFrame(step);
}
