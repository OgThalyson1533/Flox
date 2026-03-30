/**
 * js/ui/cards-ui.js
 * Lógica da aba Cartões, renderização e modais.
 */

import { state, saveState } from '../state.js';
import { uid } from '../utils/math.js';
import { formatMoney, formatPercent, escapeHtml, parseCurrencyInput } from '../utils/format.js';
import { iconForCategory, toneForCategory } from '../config.js';
import { calculateAnalytics } from '../analytics/engine.js';
import { showToast } from '../utils/dom.js';
import { isSupabaseConfigured } from '../services/supabase.js';

let _activeCardId = null;
let _editingCardId = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function _populateBankSelect(selectedBankId) {
  const select = document.getElementById('card-modal-bank');
  if (!select) return;
  const banks = state.banks || [];
  if (!banks.length) {
    select.innerHTML = '<option value="">Crie um banco primeiro</option>';
    select.disabled = true;
  } else {
    select.disabled = false;
    select.innerHTML = banks.map(b => 
      `<option value="${b.id}" ${b.id === selectedBankId ? 'selected' : ''}>${escapeHtml(b.name)}</option>`
    ).join('');
  }
}

export function renderCards() {
  const grid = document.getElementById('cards-grid');
  if (!grid) return;
  if (!state.cards || !state.cards.length) {
    grid.innerHTML = '<div class="glass-panel col-span-full rounded-[28px] p-10 text-center text-white/45">Nenhum cartão cadastrado. Clique em "Novo cartão" para começar.</div>';
    return;
  }
  grid.innerHTML = state.cards.map(card => {
    const usedPct = card.limit > 0 ? Math.min((card.used / card.limit) * 100, 100) : 0;
    const available = Math.max(0, card.limit - card.used);
    const color = card.color || '#7c3aed';
    const statusColor = usedPct > 80 ? '#ff6685' : usedPct > 60 ? '#facc15' : '#00ff85';
    const flagIcons = { visa: 'VISA', mastercard: 'MC', elo: 'ELO', amex: 'AMEX', hipercard: 'HIPER' };
    const linkedBank = state.banks?.find(b => b.id === card.bank_id);
    return `
      <div class="glass-panel card-hover rounded-[28px] p-6 relative overflow-hidden cursor-pointer ${_activeCardId === card.id ? 'ring-2 ring-cyan-400/40' : ''}" onclick="selectCard('${card.id}')">
        <div class="absolute inset-0 opacity-10" style="background:radial-gradient(circle at 80% 20%, ${color}, transparent 70%)"></div>
        <div class="relative">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black text-white" style="background:${color}">${flagIcons[card.flag] || 'CARD'}</div>
              <div>
                <p class="font-bold text-white text-sm">${escapeHtml(card.name)}</p>
                <p class="text-xs text-white/45">
                  <span style="color:#c4b5fd">● Crédito</span>
                  ${card.closing ? ` • Fecha dia ${card.closing} • Vence dia ${card.due}` : ''}
                  ${linkedBank ? ` • <span class="text-cyan-300/70">${escapeHtml(linkedBank.name)}</span>` : ''}
                </p>
              </div>
            </div>
            <div class="flex gap-1">
              <button onclick="event.stopPropagation();openEditCard('${card.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-400/70 hover:bg-cyan-400/10 transition-colors"><i class="fa-solid fa-pen text-xs"></i></button>
              <button onclick="event.stopPropagation();deleteCard('${card.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-rose-400/60 hover:bg-rose-400/10 transition-colors"><i class="fa-solid fa-trash-can text-xs"></i></button>
            </div>
          </div>
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-white/55">${card.cardType === 'debito' ? 'Utilizado (débito)' : 'Fatura atual'}</span>
              <span class="font-bold text-white">${formatMoney(card.used)}</span>
            </div>
            ${card.cardType !== 'debito' ? `
            <div class="progress-track">
              <div class="progress-fill" style="width:${usedPct}%;background:linear-gradient(90deg,${color},${statusColor})"></div>
            </div>` : ''}
            <div class="flex justify-between text-xs text-white/45">
              <span>${card.cardType === 'debito' ? '' : `${formatPercent(usedPct, 0)} do limite`}</span>
              <span>${card.cardType === 'debito' ? `Saldo inicial ${formatMoney(available)}` : `Disponível ${formatMoney(available)}`}</span>
            </div>
            <div class="flex gap-2 mt-2">
              <button onclick="event.stopPropagation();selectCard('${card.id}')" class="w-full rounded-xl py-2.5 text-xs font-bold text-black transition-opacity hover:opacity-90" style="background:linear-gradient(135deg,${color},${statusColor})">
                <i class="fa-solid fa-receipt mr-1.5"></i>${card.cardType === 'debito' ? 'Ver lançamentos' : 'Ver fatura'}
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

export function selectCard(id) {
  _activeCardId = id;
  renderCards();
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  const panel = document.getElementById('card-invoice-panel');
  const title = document.getElementById('card-invoice-title');
  const list = document.getElementById('card-invoice-list');
  const addBtn = document.getElementById('card-tx-add-btn');
  if (title) title.textContent = card.cardType === 'debito' ? `Lançamentos — ${card.name}` : `Fatura — ${card.name}`;
  if (addBtn) addBtn.classList.remove('hidden');
  const invoices = card.invoices || [];
  if (!invoices.length) {
    if (list) list.innerHTML = '<p class="text-white/40 text-sm py-4">Sem lançamentos nesta fatura.</p>';
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  const total = invoices.reduce((a, t) => a + t.value, 0);
  if (list) {
    list.innerHTML = `
      <div class="flex justify-between items-center mb-3 pb-3 border-b border-white/8">
        <span class="text-sm text-white/55">${card.cardType === 'debito' ? 'Total utilizado' : 'Total da fatura'}</span>
        <span class="font-black text-white text-lg">${formatMoney(total)}</span>
      </div>
      <div class="space-y-2">
        ${invoices.map(tx => `
          <div class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
            <div class="flex items-center gap-3">
              <span class="flex h-8 w-8 items-center justify-center rounded-xl ${toneForCategory(tx.cat)}" style="flex-shrink:0">
                <i class="fa-solid ${iconForCategory(tx.cat)} text-xs"></i>
              </span>
              <div>
                <p class="text-sm font-semibold text-white">${escapeHtml(tx.desc)}</p>
                <p class="text-xs text-white/40">${tx.cat} ${tx.installments > 1 ? `• ${tx.installmentCurrent}/${tx.installments}x` : ''}</p>
              </div>
            </div>
            <div class="text-right">
              <p class="font-bold text-white text-sm">${formatMoney(tx.value)}</p>
              <button onclick="deleteCardTx('${id}','${tx.id}')" class="text-xs text-rose-400/60 hover:text-rose-300 transition-colors mt-1">remover</button>
            </div>
          </div>`).join('')}
      </div>`;
  }
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function deleteCardTx(cardId, txId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  const tx = card.invoices.find(t => t.id === txId);
  if (tx) card.used = Math.max(0, Number((card.used - tx.value).toFixed(2)));
  card.invoices = card.invoices.filter(t => t.id !== txId);
  saveState();
  if (window.appRenderAll) window.appRenderAll(); else renderCards(); // [FIX] Reatividade sistêmica
  selectCard(cardId);
  showToast('Lançamento removido da fatura.', 'info');
}

export function openEditCard(id) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  _editingCardId = id;
  document.getElementById('card-modal-title').textContent = 'Editar Cartão';
  document.getElementById('card-modal-name').value = card.name;
  document.getElementById('card-modal-flag').value = card.flag;
  document.getElementById('card-modal-color').value = card.color || '#7c3aed';
  document.getElementById('card-modal-limit').value = card.limit.toFixed(2).replace('.', ',');
  document.getElementById('card-modal-closing').value = card.closing || '';
  document.getElementById('card-modal-due').value = card.due || '';
  document.getElementById('card-modal-error').classList.add('hidden');
  
  // Preenche o select de banco vinculado
  _populateBankSelect(card.bank_id);

  const ct = card.cardType || 'credito';
  const radio = document.getElementById(`card-type-${ct}`);
  if (radio) radio.checked = true;
  
  const closingRow = document.getElementById('card-closing-due-row');
  if (closingRow) closingRow.style.display = ct === 'credito' ? '' : 'none';
  document.getElementById('card-modal-overlay').classList.remove('hidden');
}

export function deleteCard(id) {
  // [FIX] Cartões excluídos localmente voltavam no próximo syncFromSupabase — agora são removidos do banco
  if (isSupabaseConfigured) {
    import('../services/supabase.js').then(({ supabase, isSupabaseConfigured: ok }) => {
      if (!ok || !supabase) return;
      supabase.from('card_invoices').delete().eq('card_id', id).then(() => {
        supabase.from('cards').delete().eq('id', id).catch(e => console.error('[Cards] Falha ao deletar cartão remoto:', e));
      }).catch(e => console.error('[Cards] Falha ao deletar faturas remotas:', e));
    });
  }
  state.cards = state.cards.filter(c => c.id !== id);
  if (_activeCardId === id) _activeCardId = null;
  saveState();
  if (window.appRenderAll) window.appRenderAll(); else renderCards();
  showToast('Cartão removido.', 'info');
}

export function openCardTx(cardId) {
  _activeCardId = cardId;
  document.getElementById('card-tx-desc').value = '';
  document.getElementById('card-tx-value').value = '';
  document.getElementById('card-tx-cat').value = 'Alimentação';
  document.getElementById('card-tx-installments').value = '1';
  document.getElementById('card-tx-error').classList.add('hidden');
  document.getElementById('card-tx-modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('card-tx-desc')?.focus(), 60);
}

export function saveCardModal() {
  const name = document.getElementById('card-modal-name').value.trim();
  const cardType = document.querySelector('input[name="card-modal-type"]:checked')?.value || 'credito';
  const flag = document.getElementById('card-modal-flag').value;
  const color = document.getElementById('card-modal-color').value;
  const limit = parseCurrencyInput(document.getElementById('card-modal-limit').value);
  const closing = cardType === 'credito' ? parseInt(document.getElementById('card-modal-closing').value) : 0;
  const due = cardType === 'credito' ? parseInt(document.getElementById('card-modal-due').value) : 0;
  const bankId = document.getElementById('card-modal-bank')?.value || null;
  const errEl = document.getElementById('card-modal-error');

  if (!name) { errEl.textContent = 'Informe o nome do cartão.'; errEl.classList.remove('hidden'); return; }
  if (!limit) { errEl.textContent = 'Limite / saldo inválido.'; errEl.classList.remove('hidden'); return; }
  
  if (_editingCardId) {
    const idx = state.cards.findIndex(c => c.id === _editingCardId);
    if (idx >= 0) state.cards[idx] = { ...state.cards[idx], name, cardType, flag, color, limit, closing, due, bank_id: bankId || null };
    showToast('Cartão atualizado.', 'success');
  } else {
    if (!state.cards) state.cards = [];
    state.cards.push({ id: uid('card'), name, cardType, flag, color, limit, used: 0, closing, due, bank_id: bankId || null, invoices: [] });
    showToast(`Cartão de ${cardType} adicionado.`, 'success');
  }
  _editingCardId = null;
  saveState();
  document.getElementById('card-modal-overlay').classList.add('hidden');
  if (window.appRenderAll) window.appRenderAll(); else renderCards(); // [FIX] Reatividade sistêmica
}

export function saveCardTx() {
  const card = state.cards.find(c => c.id === _activeCardId);
  if (!card) return;
  const desc = document.getElementById('card-tx-desc').value.trim();
  const cat = document.getElementById('card-tx-cat').value;
  const amount = parseCurrencyInput(document.getElementById('card-tx-value').value);
  const installments = parseInt(document.getElementById('card-tx-installments').value) || 1;
  const errEl = document.getElementById('card-tx-error');
  
  if (!desc) { errEl.textContent = 'Informe a descrição.'; errEl.classList.remove('hidden'); return; }
  if (!amount) { errEl.textContent = 'Valor inválido.'; errEl.classList.remove('hidden'); return; }
  
  const installValue = Number((amount / installments).toFixed(2));
  for (let i = 0; i < installments; i++) {
    if (!card.invoices) card.invoices = [];
    card.invoices.unshift({ 
      id: uid('ctx'), 
      desc: installments > 1 ? `${desc} (${i+1}/${installments})` : desc, 
      cat, 
      value: installValue, 
      installments, 
      installmentCurrent: i + 1 
    });
  }
  card.used = Number((card.used + amount).toFixed(2));
  saveState();
  document.getElementById('card-tx-modal-overlay').classList.add('hidden');
  if (window.appRenderAll) window.appRenderAll(); else renderCards(); // [FIX] Reatividade sistêmica
  selectCard(_activeCardId);
  showToast(installments > 1 ? `Compra parcelada em ${installments}x lançada.` : 'Lançamento adicionado à fatura.', 'success');
}

export function bindCardEvents() {
  document.getElementById('card-add-btn')?.addEventListener('click', () => {
    _editingCardId = null;
    document.getElementById('card-modal-title').textContent = 'Novo Cartão';
    ['card-modal-name','card-modal-limit','card-modal-closing','card-modal-due'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('card-modal-color').value = '#7c3aed';
    document.getElementById('card-modal-error')?.classList.add('hidden');
    _populateBankSelect(null);
    
    const creditoRadio = document.getElementById('card-type-credito');
    if (creditoRadio) creditoRadio.checked = true;
    
    const closingRow = document.getElementById('card-closing-due-row');
    if (closingRow) closingRow.style.display = '';
    
    document.getElementById('card-modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('card-modal-name')?.focus(), 60);
  });

  document.querySelectorAll('input[name="card-modal-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const closingRow = document.getElementById('card-closing-due-row');
      const limitLabel = document.getElementById('card-modal-limit-label');
      const isCredito = radio.value === 'credito';
      if (closingRow) closingRow.style.display = isCredito ? '' : 'none';
      if (limitLabel) limitLabel.textContent = isCredito ? 'Limite (R$)' : 'Saldo inicial (R$)';
    });
  });

  document.getElementById('card-modal-close')?.addEventListener('click', () => document.getElementById('card-modal-overlay').classList.add('hidden'));
  document.getElementById('card-modal-cancel')?.addEventListener('click', () => document.getElementById('card-modal-overlay').classList.add('hidden'));
  document.getElementById('card-modal-save')?.addEventListener('click', saveCardModal);
  
  document.getElementById('card-modal-overlay')?.addEventListener('click', e => { 
    if (e.target === document.getElementById('card-modal-overlay')) document.getElementById('card-modal-overlay').classList.add('hidden'); 
  });
  
  document.getElementById('card-tx-add-btn')?.addEventListener('click', () => { if (_activeCardId) openCardTx(_activeCardId); });
  document.getElementById('card-tx-modal-close')?.addEventListener('click', () => document.getElementById('card-tx-modal-overlay').classList.add('hidden'));
  document.getElementById('card-tx-cancel')?.addEventListener('click', () => document.getElementById('card-tx-modal-overlay').classList.add('hidden'));
  document.getElementById('card-tx-save')?.addEventListener('click', saveCardTx);
  
  document.getElementById('card-tx-modal-overlay')?.addEventListener('click', e => { 
    if (e.target === document.getElementById('card-tx-modal-overlay')) document.getElementById('card-tx-modal-overlay').classList.add('hidden'); 
  });

  // Global exposes for inline onclick handlers inside renderCards
  window.selectCard = selectCard;
  window.deleteCardTx = deleteCardTx;
  window.openEditCard = openEditCard;
  window.deleteCard = deleteCard;
}

