/**
 * js/ui/cashflow-ui.js
 * Lógica da aba de Fluxo de Caixa (projeção, envelopes, fixos)
 */

import { state, saveState } from '../state.js';
import { uid } from '../utils/math.js';
import { formatMoney, formatMoneyShort, escapeHtml, parseCurrencyInput } from '../utils/format.js';
import { iconForCategory, toneForCategory, CATEGORIES_LIST } from '../config.js';
import { calculateAnalytics } from '../analytics/engine.js';
import { showToast } from '../utils/dom.js';

let chart = null;

export function buildCashflowProjection() {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let balance = state.balance;
  const days = [];
  const fixed = state.fixedExpenses || [];
  
  for (let d = today.getDate(); d <= today.getDate() + 30; d++) {
    const dayOfMonth = ((d - 1) % daysInMonth) + 1;
    let delta = 0;
    const events = [];
    fixed.filter(f => f.active && f.day === dayOfMonth).forEach(f => {
      delta += f.isIncome ? f.value : -f.value;
      events.push({ name: f.name, value: f.isIncome ? f.value : -f.value, isIncome: !!f.isIncome });
    });
    balance = Number((balance + delta).toFixed(2));
    const date = new Date(today.getFullYear(), today.getMonth(), d);
    days.push({ date, balance, delta, events, dayOfMonth });
  }
  return days;
}

export function renderCashflow() {
  const projection = buildCashflowProjection();
  const fixed = state.fixedExpenses || [];
  const fixedExpenses = fixed.filter(f => f.active && !f.isIncome);
  const fixedIncome = fixed.filter(f => f.active && f.isIncome);
  const totalFixed = fixedExpenses.reduce((a, f) => a + f.value, 0);
  const totalIncome = fixedIncome.reduce((a, f) => a + f.value, 0);
  const freeAmount = Math.max(0, totalIncome - totalFixed);
  const proj30 = projection[projection.length - 1]?.balance || state.balance;

  const el = id => document.getElementById(id);
  if (el('cashflow-balance')) el('cashflow-balance').textContent = formatMoney(state.balance);
  if (el('cashflow-proj30')) el('cashflow-proj30').textContent = formatMoney(proj30);
  if (el('cashflow-fixed')) el('cashflow-fixed').textContent = formatMoney(totalFixed);
  if (el('cashflow-free')) el('cashflow-free').textContent = formatMoney(freeAmount);

  const eventsEl = el('cashflow-events');
  if (eventsEl) {
    const allEvents = projection.flatMap(d => d.events.map(e => ({ ...e, date: d.date, day: d.dayOfMonth })));
    if (!allEvents.length) {
      eventsEl.innerHTML = '<p class="text-white/40 text-sm">Nenhum evento fixo cadastrado. Use "Gerenciar fixos" para adicionar.</p>';
    } else {
      eventsEl.innerHTML = allEvents.slice(0, 20).map(ev => `
        <div class="flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold w-6 h-6 rounded-lg flex items-center justify-center ${ev.isIncome ? 'bg-emerald-400/15 text-emerald-400' : 'bg-rose-400/15 text-rose-400'}">${ev.day}</span>
            <span class="text-sm text-white/80">${escapeHtml(ev.name)}</span>
          </div>
          <span class="text-sm font-bold ${ev.isIncome ? 'text-emerald-300' : 'text-rose-300'}">${ev.isIncome ? '+' : '-'}${formatMoney(Math.abs(ev.value))}</span>
        </div>`).join('');
    }
  }

  const canvas = el('cashflowChart');
  if (canvas) {
    if (chart) { chart.destroy(); chart = null; }
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, 'rgba(0,245,255,.25)');
    grad.addColorStop(1, 'rgba(0,245,255,0)');
    
    // Lazy load or access global Chart
    if (window.Chart) {
      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: projection.map(d => d.date.getDate() + '/' + (d.date.getMonth()+1)),
          datasets: [{ data: projection.map(d => d.balance), borderColor: '#00f5ff', backgroundColor: grad, fill: true, tension: .3, borderWidth: 2, pointRadius: 2 }]
        },
        options: { 
          responsive: true, maintainAspectRatio: false, 
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'Saldo: ' + formatMoney(ctx.parsed.y) } } },
          scales: { 
            y: { grid: { color: 'rgba(255,255,255,.05)' }, border: { display: false }, ticks: { color: 'rgba(255,255,255,.4)', callback: v => formatMoneyShort(v), font: { size: 10 } } }, 
            x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(255,255,255,.35)', maxTicksLimit: 10, font: { size: 10 } } } 
          } 
        }
      });
    }
  }

  renderEnvelopes();
  renderFixedList();
}

export function renderEnvelopes() {
  const grid = document.getElementById('envelope-grid');
  if (!grid) return;
  const analytics = calculateAnalytics(state);
  const CATS = ['Alimentação', 'Transporte', 'Lazer', 'Moradia', 'Saúde', 'Assinaturas', 'Rotina'];
  
  grid.innerHTML = CATS.map(cat => {
    const budget = state.budgets[cat] || 0;
    const spent = analytics.categories.find(([c]) => c === cat)?.[1] || 0;
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const remaining = Math.max(0, budget - spent);
    const over = spent > budget && budget > 0;
    const barColor = over ? '#ff6685' : pct > 80 ? '#facc15' : '#00ff85';
    
    return `
      <div class="rounded-2xl border ${over ? 'border-rose-400/25 bg-rose-400/5' : 'border-white/8 bg-white/4'} p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="flex h-7 w-7 items-center justify-center rounded-xl ${toneForCategory(cat)}"><i class="fa-solid ${iconForCategory(cat)} text-xs"></i></span>
            <span class="text-sm font-semibold text-white">${cat}</span>
          </div>
          ${over ? '<span class="text-xs font-bold text-rose-400">Estourado!</span>' : ''}
        </div>
        ${budget > 0 ? `
          <div class="progress-track mb-1.5">
            <div class="progress-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <div class="flex justify-between text-xs text-white/45">
            <span>Gasto ${formatMoney(spent)}</span>
            <span>${over ? `+${formatMoney(spent - budget)} acima` : `Sobra ${formatMoney(remaining)}`}</span>
          </div>` : `
          <p class="text-xs text-white/35 mt-1">Sem limite — <button onclick="openBudgetModal()" class="text-cyan-400 hover:text-cyan-300">definir</button></p>`}
      </div>`;
  }).join('');
}

export function renderFixedList() {
  const list = document.getElementById('fixed-expenses-list');
  if (!list) return;
  const fixed = state.fixedExpenses || [];
  if (!fixed.length) { list.innerHTML = '<p class="text-white/40 text-sm">Nenhum item fixo cadastrado.</p>'; return; }
  list.innerHTML = fixed.map(f => `
    <div class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3 ${!f.active ? 'opacity-50' : ''}">
      <div class="flex items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl ${f.isIncome ? 'tone-success' : toneForCategory(f.cat)}">
          <i class="fa-solid ${f.isIncome ? 'fa-arrow-trend-up' : iconForCategory(f.cat)} text-sm"></i>
        </span>
        <div>
          <p class="text-sm font-semibold text-white">${escapeHtml(f.name)}</p>
          <p class="text-xs text-white/40">${f.cat} • Todo dia ${f.day}</p>
        </div>
      </div>
      <span class="font-bold text-sm ${f.isIncome ? 'text-emerald-300' : 'text-rose-300'}">${f.isIncome ? '+' : '-'}${formatMoney(f.value)}</span>
    </div>`).join('');
}

export function openFixedModal() {
  const rows = document.getElementById('fixed-modal-rows');
  if (!rows) return;
  renderFixedModalRows();
  document.getElementById('fixed-modal-overlay').classList.remove('hidden');
}

export function renderFixedModalRows() {
  const rows = document.getElementById('fixed-modal-rows');
  const fixed = state.fixedExpenses || [];
  rows.innerHTML = fixed.map((f, i) => `
    <div class="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/4 px-3 py-2.5">
      <div class="flex-1 grid grid-cols-3 gap-2">
        <input type="text" value="${escapeHtml(f.name)}" placeholder="Nome" data-fx-name="${i}" class="col-span-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400/50"/>
        <input type="text" value="${f.value.toFixed(2).replace('.', ',')}" placeholder="Valor" data-fx-value="${i}" class="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400/50 text-right"/>
        <input type="number" min="1" max="28" value="${f.day}" placeholder="Dia" data-fx-day="${i}" class="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400/50 text-center"/>
      </div>
      <label class="flex items-center gap-1 text-xs text-white/50 cursor-pointer">
        <input type="checkbox" ${f.isIncome ? 'checked' : ''} data-fx-income="${i}" class="accent-emerald-400"> Renda
      </label>
      <button onclick="removeFixedRow(${i})" class="w-7 h-7 flex items-center justify-center rounded-lg text-rose-400/60 hover:text-rose-300 hover:bg-rose-400/10 transition-colors"><i class="fa-solid fa-xmark text-xs"></i></button>
    </div>`).join('');
}

export function removeFixedRow(i) {
  state.fixedExpenses.splice(i, 1);
  renderFixedModalRows();
}

export function saveFixedModal() {
  const rows = document.getElementById('fixed-modal-rows');
  const newFixed = [];
  const nameInputs = rows.querySelectorAll('[data-fx-name]');
  
  nameInputs.forEach((nameEl, i) => {
    const name = nameEl.value.trim();
    const valueEl = rows.querySelector(`[data-fx-value="${i}"]`);
    const dayEl = rows.querySelector(`[data-fx-day="${i}"]`);
    const incomeEl = rows.querySelector(`[data-fx-income="${i}"]`);
    const value = parseCurrencyInput(valueEl?.value || '');
    const day = parseInt(dayEl?.value) || 1;
    const isIncome = !!incomeEl?.checked;
    
    if (name && value) {
      const existing = state.fixedExpenses?.[i];
      newFixed.push({ id: existing?.id || uid('fx'), name, cat: isIncome ? 'Receita' : (existing?.cat || 'Rotina'), value, day, active: true, isIncome });
    }
  });
  
  state.fixedExpenses = newFixed;
  saveState();
  document.getElementById('fixed-modal-overlay').classList.add('hidden');
  if (window.appRenderAll) window.appRenderAll(); else renderCashflow(); // [FIX] Reatividade sistêmica
  showToast('Custos fixos salvos.', 'success');
}

export function addFixedRow() {
  if (!state.fixedExpenses) state.fixedExpenses = [];
  state.fixedExpenses.push({ id: uid('fx'), name: '', cat: 'Rotina', value: 0, day: 1, active: true });
  renderFixedModalRows();
  const rows = document.getElementById('fixed-modal-rows');
  rows.lastElementChild?.querySelector('input')?.focus();
}

export function openBudgetModal() {
  const rows = document.getElementById('budget-rows');
  if (!rows) return;
  rows.innerHTML = CATEGORIES_LIST.map(cat => {
    const current = state.budgets[cat] || 0;
    return `
      <div class="budget-row flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/8">
          <i class="fa-solid ${iconForCategory(cat)} text-sm text-cyan-300"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-white">${cat}</p>
          <p class="text-xs text-white/40 mt-0.5">Limite mensal</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-white/50">R$</span>
          <input type="text" data-budget-cat="${cat}" value="${current > 0 ? current.toFixed(2).replace('.',',') : ''}"
            placeholder="0,00" inputmode="decimal"
            class="w-24 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50 text-right transition-colors placeholder:text-white/25"/>
        </div>
      </div>`;
  }).join('');
  document.getElementById('budget-modal-overlay').classList.remove('hidden');
}

export function saveBudgets() {
  CATEGORIES_LIST.forEach(cat => {
    const input = document.querySelector(`[data-budget-cat="${cat}"]`);
    const val = parseCurrencyInput(input?.value || '');
    if (val && val > 0) { state.budgets[cat] = val; }
    else { delete state.budgets[cat]; }
  });
  saveState();
  document.getElementById('budget-modal-overlay').classList.add('hidden');
  if (window.appRenderAll) window.appRenderAll(); else renderEnvelopes(); // [FIX] Reatividade sistêmica
  showToast('Orçamentos salvos com sucesso.', 'success');
}

export function bindCashflowEvents() {
  document.getElementById('fixed-manage-btn')?.addEventListener('click', openFixedModal);
  document.getElementById('fixed-modal-close')?.addEventListener('click', () => document.getElementById('fixed-modal-overlay').classList.add('hidden'));
  document.getElementById('fixed-modal-cancel')?.addEventListener('click', () => document.getElementById('fixed-modal-overlay').classList.add('hidden'));
  document.getElementById('fixed-modal-save')?.addEventListener('click', saveFixedModal);
  document.getElementById('fixed-add-row-btn')?.addEventListener('click', addFixedRow);
  document.getElementById('fixed-modal-overlay')?.addEventListener('click', e => { if (e.target === document.getElementById('fixed-modal-overlay')) document.getElementById('fixed-modal-overlay').classList.add('hidden'); });
  document.getElementById('envelope-reset-btn')?.addEventListener('click', () => {
    showToast('Os envelopes são calculados automaticamente do extrato.', 'info');
  });

  document.getElementById('manage-budgets-btn')?.addEventListener('click', openBudgetModal);
  document.getElementById('budget-modal-close')?.addEventListener('click', () => document.getElementById('budget-modal-overlay').classList.add('hidden'));
  document.getElementById('budget-modal-cancel')?.addEventListener('click', () => document.getElementById('budget-modal-overlay').classList.add('hidden'));
  document.getElementById('budget-modal-save')?.addEventListener('click', saveBudgets);
  document.getElementById('budget-modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('budget-modal-overlay')) document.getElementById('budget-modal-overlay').classList.add('hidden');
  });

  window.removeFixedRow = removeFixedRow;
  window.openFixedModal = openFixedModal;
  window.saveFixedModal = saveFixedModal;
  window.addFixedRow = addFixedRow;
  window.openBudgetModal = openBudgetModal;
  window.saveBudgets = saveBudgets;
}

