/**
 * js/utils/dom.js — GrokFin Elite v6
 * Utilitários de DOM e UI. Pode consultar o DOM mas não tem estado próprio.
 */

import { escapeHtml } from './format.js';

/** Normaliza texto para busca: remove acentos, lowercase */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Sanitiza handle de perfil: garante @ e só alfanumérico + ponto + sublinha */
export function sanitizeHandle(value) {
  let v = String(value ?? '').trim();
  if (!v.startsWith('@')) v = '@' + v;
  v = '@' + v.slice(1).replace(/[^a-z0-9._]/gi, '').toLowerCase();
  if (v.length < 2) v = '@grokfin.user';
  return v;
}

/**
 * Exibe uma notificação toast flutuante.
 * FIX: container deve existir no HTML como <div id="toast-container">.
 * @param {string} message
 * @param {'success'|'danger'|'info'} type
 * @param {number} duration ms
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const icons = { success: 'fa-circle-check', danger: 'fa-circle-exclamation', info: 'fa-circle-info' };
  const colors = {
    success: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
    danger:  'border-rose-300/20 bg-rose-300/10 text-rose-200',
    info:    'border-cyan-300/20 bg-cyan-300/10 text-cyan-200'
  };

  toast.className = `toast glass-panel flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm font-medium shadow-xl ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} shrink-0"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}
