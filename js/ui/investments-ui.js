/**
 * js/ui/investments-ui.js
 * Lógica da aba Investimentos (rendimento, alocação, simulador)
 */

import { state, saveState } from '../state.js';
import { uid } from '../utils/math.js';
import { formatMoney, formatMoneyShort, formatPercent, escapeHtml, parseCurrencyInput } from '../utils/format.js';
import { showToast } from '../utils/dom.js';

const INV_COLORS = { renda_fixa: '#00f5ff', renda_variavel: '#00ff85', cripto: '#facc15', exterior: '#a855f7' };
const INV_LABELS = { renda_fixa: 'Renda Fixa', renda_variavel: 'Renda Variável', cripto: 'Cripto', exterior: 'Internacional' };
let _editingInvId = null;
const CDI_RATE = 13.75;
let charts_extra = { invAlloc: null, sim: null };

export function renderInvestments() {
  const investments = state.investments || [];
  const totalValue = investments.reduce((a, i) => a + i.value, 0);
  const totalCost = investments.reduce((a, i) => a + i.cost, 0);
  const totalProfit = totalValue - totalCost;
  const returnPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const vsoCDI = returnPct - CDI_RATE;

  const setEl = (id, text, cls) => { const el = document.getElementById(id); if (el) { el.textContent = text; if (cls) el.className = cls; } };
  setEl('inv-total', formatMoney(totalValue));
  setEl('inv-profit', (totalProfit >= 0 ? '+' : '') + formatMoney(totalProfit), `mt-3 text-3xl font-black ${totalProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`);
  setEl('inv-return-pct', formatPercent(returnPct, 2));
  setEl('inv-vs-cdi', (vsoCDI >= 0 ? '+' : '') + formatPercent(vsoCDI, 2), `mt-3 text-3xl font-black ${vsoCDI >= 0 ? 'text-emerald-300' : 'text-rose-300'}`);

  const allocCanvas = document.getElementById('invAllocChart');
  if (allocCanvas && window.Chart) {
    if (charts_extra.invAlloc) { charts_extra.invAlloc.destroy(); charts_extra.invAlloc = null; }
    const classes = [...new Set(investments.map(i => i.type))];
    const classValues = classes.map(c => investments.filter(i => i.type === c).reduce((a, i) => a + i.value, 0));
    
    if (classes.length) {
      charts_extra.invAlloc = new Chart(allocCanvas, {
        type: 'doughnut',
        data: { labels: classes.map(c => INV_LABELS[c] || c), datasets: [{ data: classValues, backgroundColor: classes.map(c => INV_COLORS[c] || '#888'), borderWidth: 0, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', animation: { duration: 1500, easing: 'easeOutQuart' }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatMoney(ctx.parsed)} (${formatPercent((ctx.parsed / totalValue) * 100, 1)})` } } } }
      });
      const legend = document.getElementById('inv-alloc-legend');
      if (legend) legend.innerHTML = classes.map((c, i) => `<span class="pill text-xs" style="border-color:${INV_COLORS[c]}30;background:${INV_COLORS[c]}15;color:${INV_COLORS[c]}">${INV_LABELS[c] || c} ${formatPercent((classValues[i] / totalValue) * 100, 0)}</span>`).join('');
    }
  }

  const list = document.getElementById('inv-assets-list');
  if (list) {
    list.innerHTML = investments.length ? investments.map(inv => {
      const profit = inv.value - inv.cost;
      const profitPct = inv.cost > 0 ? (profit / inv.cost) * 100 : 0;
      const color = INV_COLORS[inv.type] || '#888';
      return `
        <div class="flex items-center gap-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
          <div class="w-2 h-10 rounded-full flex-shrink-0" style="background:${color}"></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <p class="font-semibold text-white text-sm truncate">${escapeHtml(inv.name)}</p>
              <p class="font-black text-white ml-2 text-sm flex-shrink-0">${formatMoney(inv.value)}</p>
            </div>
            <div class="flex items-center justify-between mt-0.5">
              <p class="text-xs text-white/40">${INV_LABELS[inv.type] || inv.type} • ${inv.subtype?.toUpperCase() || ''}</p>
              <p class="text-xs font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'} ml-2">${profit >= 0 ? '+' : ''}${formatMoney(profit)} (${formatPercent(profitPct, 1)})</p>
            </div>
          </div>
          <div class="flex gap-1 flex-shrink-0">
            <button onclick="openEditInv('${inv.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-400/70 hover:bg-cyan-400/10 transition-colors"><i class="fa-solid fa-pen text-xs"></i></button>
            <button onclick="deleteInv('${inv.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-rose-400/60 hover:bg-rose-400/10 transition-colors"><i class="fa-solid fa-trash-can text-xs"></i></button>
          </div>
        </div>`;
    }).join('') : '<p class="text-white/40 text-sm">Nenhum ativo cadastrado.</p>';
  }

  renderRebalanceTips(investments, totalValue);
}

export function renderRebalanceTips(investments, total) {
  const el = document.getElementById('inv-rebalance-tips');
  if (!el) return;
  const tips = [];
  const alloc = {};
  investments.forEach(i => { alloc[i.type] = (alloc[i.type] || 0) + i.value; });
  const rfPct = total > 0 ? (alloc['renda_fixa'] || 0) / total * 100 : 0;
  const rvPct = total > 0 ? (alloc['renda_variavel'] || 0) / total * 100 : 0;
  const criptoPct = total > 0 ? (alloc['cripto'] || 0) / total * 100 : 0;
  
  if (rfPct > 80) tips.push({ type: 'tip', icon: '⚖️', text: `${formatPercent(rfPct, 0)} em Renda Fixa é conservador. Considere alocar parte em Renda Variável para potencializar retornos de longo prazo.` });
  if (criptoPct > 20) tips.push({ type: 'alert', icon: '⚠️', text: `${formatPercent(criptoPct, 0)} em cripto é alto para a maioria dos perfis. Recomendado manter abaixo de 10% do patrimônio.` });
  if (rvPct > 60) tips.push({ type: 'tip', icon: '🛡️', text: `Alta concentração em Renda Variável (${formatPercent(rvPct, 0)}). Reequilibre com Renda Fixa para proteger o patrimônio em cenários de volatilidade.` });
  if (!tips.length) tips.push({ type: 'positive', icon: '✅', text: `Sua alocação está equilibrada. Mantenha aportes regulares e revise trimestralmente.` });
  
  el.innerHTML = tips.map(t => `<div class="insight-${t.type} rounded-2xl p-4 flex gap-3 text-sm"><span class="text-lg">${t.icon}</span><p class="text-white/70 leading-relaxed">${t.text}</p></div>`).join('');
}

export function calcCompound(monthly, rate, years) {
  const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
  const months = years * 12;
  const total = monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  const invested = monthly * months;
  return { total: Math.round(total), invested: Math.round(invested), earnings: Math.round(total - invested) };
}

export function renderSimulator() {
  const monthly = parseCurrencyInput(document.getElementById('sim-monthly')?.value || '500') || 500;
  const rate = parseFloat(document.getElementById('sim-rate')?.value?.replace(',', '.')) || CDI_RATE;
  const years = parseInt(document.getElementById('sim-years')?.value) || 10;
  const result = calcCompound(monthly, rate, years);
  
  const elInvested = document.getElementById('sim-invested');
  const elEarnings = document.getElementById('sim-earnings');
  const elFinal = document.getElementById('sim-final');
  const elResults = document.getElementById('sim-results');
  
  if (elInvested) elInvested.textContent = formatMoney(result.invested);
  if (elEarnings) elEarnings.textContent = formatMoney(result.earnings);
  if (elFinal) elFinal.textContent = formatMoney(result.total);
  if (elResults) elResults.style.display = 'grid';

  const canvas = document.getElementById('simChart');
  if (canvas && window.Chart) {
    if (charts_extra.sim) { charts_extra.sim.destroy(); charts_extra.sim = null; }
    const labels = [], valuesComp = [], valuesSimple = [];
    for (let y = 1; y <= years; y++) {
      labels.push(`Ano ${y}`);
      const r = calcCompound(monthly, rate, y);
      valuesComp.push(r.total);
      valuesSimple.push(monthly * y * 12);
    }
    const ctx = canvas.getContext('2d');
    const g1 = ctx.createLinearGradient(0, 0, 0, 180); 
    g1.addColorStop(0, 'rgba(0,255,133,.3)'); 
    g1.addColorStop(1, 'rgba(0,255,133,0)');
    
    charts_extra.sim = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Com juros compostos', data: valuesComp, borderColor: '#00ff85', backgroundColor: g1, fill: true, tension: .3, borderWidth: 2, pointRadius: 3 },
        { label: 'Sem juros (só aporte)', data: valuesSimple, borderColor: 'rgba(255,255,255,.3)', borderDash: [4,4], fill: false, tension: 0, borderWidth: 1.5, pointRadius: 0 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 1500, easing: 'easeOutQuart' }, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: 'rgba(255,255,255,.5)', font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` } } }, scales: { y: { grid: { color: 'rgba(255,255,255,.05)' }, border: { display: false }, ticks: { color: 'rgba(255,255,255,.4)', callback: v => formatMoneyShort(v), font: { size: 10 } } }, x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(255,255,255,.35)', font: { size: 10 } } } } }
    });
  }
}

export function openEditInv(id) {
  const inv = (state.investments || []).find(i => i.id === id);
  if (!inv) return;
  _editingInvId = id;
  document.getElementById('inv-modal-title').textContent = 'Editar Ativo';
  document.getElementById('inv-modal-name').value = inv.name;
  document.getElementById('inv-modal-type').value = inv.type;
  document.getElementById('inv-modal-subtype').value = inv.subtype || 'outro_cripto';
  document.getElementById('inv-modal-value').value = inv.value.toFixed(2).replace('.', ',');
  document.getElementById('inv-modal-cost').value = inv.cost.toFixed(2).replace('.', ',');
  document.getElementById('inv-modal-error')?.classList.add('hidden');
  document.getElementById('inv-modal-overlay')?.classList.remove('hidden');
}

export function deleteInv(id) {
  // [FIX] Ativos excluídos localmente voltavam no próximo syncFromSupabase
  import('../services/supabase.js').then(({ supabase, isSupabaseConfigured }) => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.from('investments').delete().eq('id', id)
      .catch(e => console.error('[Investments] Falha ao deletar ativo remoto:', e));
  });
  state.investments = (state.investments || []).filter(i => i.id !== id);
  saveState();
  if (window.appRenderAll) window.appRenderAll();
  showToast('Ativo removido.', 'info');
}

export function saveInvModal() {
  const name = document.getElementById('inv-modal-name').value.trim();
  const type = document.getElementById('inv-modal-type').value;
  const subtype = document.getElementById('inv-modal-subtype').value;
  const value = parseCurrencyInput(document.getElementById('inv-modal-value').value);
  const cost = parseCurrencyInput(document.getElementById('inv-modal-cost').value);
  const errEl = document.getElementById('inv-modal-error');
  
  if (!name) { errEl.textContent = 'Informe o nome.'; errEl.classList.remove('hidden'); return; }
  if (!value) { errEl.textContent = 'Valor atual inválido.'; errEl.classList.remove('hidden'); return; }
  if (!cost) { errEl.textContent = 'Custo inválido.'; errEl.classList.remove('hidden'); return; }
  
  if (!state.investments) state.investments = [];
  if (_editingInvId) {
    const idx = state.investments.findIndex(i => i.id === _editingInvId);
    if (idx >= 0) state.investments[idx] = { ...state.investments[idx], name, type, subtype, value, cost };
    showToast('Ativo atualizado.', 'success');
  } else {
    state.investments.push({ id: uid('inv'), name, type, subtype, value, cost });
    showToast('Ativo adicionado.', 'success');
  }
  
  _editingInvId = null;
  saveState();
  document.getElementById('inv-modal-overlay').classList.add('hidden');
  if (window.appRenderAll) window.appRenderAll(); // [FIX] Integridade visual inter-abas
}

export function bindInvestmentEvents() {
  document.getElementById('inv-add-btn')?.addEventListener('click', () => {
    _editingInvId = null;
    document.getElementById('inv-modal-title').textContent = 'Novo Ativo';
    ['inv-modal-name','inv-modal-value','inv-modal-cost'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('inv-modal-error')?.classList.add('hidden');
    document.getElementById('inv-modal-overlay')?.classList.remove('hidden');
    setTimeout(() => document.getElementById('inv-modal-name')?.focus(), 60);
  });
  
  document.getElementById('inv-modal-close')?.addEventListener('click', () => document.getElementById('inv-modal-overlay').classList.add('hidden'));
  document.getElementById('inv-modal-cancel')?.addEventListener('click', () => document.getElementById('inv-modal-overlay').classList.add('hidden'));
  document.getElementById('inv-modal-save')?.addEventListener('click', saveInvModal);
  
  document.getElementById('inv-modal-overlay')?.addEventListener('click', e => { 
    if (e.target === document.getElementById('inv-modal-overlay')) document.getElementById('inv-modal-overlay').classList.add('hidden'); 
  });
  
  document.getElementById('sim-calc-btn')?.addEventListener('click', renderSimulator);
  ['sim-monthly','sim-rate','sim-years'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') renderSimulator(); });
  });

  window.openEditInv = openEditInv;
  window.deleteInv = deleteInv;
}
