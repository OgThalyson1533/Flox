/**
 * js/ui/banks-ui.js
 * CRUD completo de Contas Bancárias — inspirado na análise do Fingu.
 * 
 * Funcionalidades:
 * - Lista de bancos em grid com saldo, tipo, mini gráfico histórico
 * - Criar banco → gera transação automática "Reajuste de saldo" se saldo > 0
 * - Editar banco → gera transação de ajuste com a diferença de saldo
 * - Excluir banco → modal inteligente: excluir transações OU transferir para outro banco
 */

import { state, saveState } from '../state.js';
import { uid }              from '../utils/math.js';
import { formatMoney, escapeHtml, parseCurrencyInput } from '../utils/format.js';
import { showToast }        from '../utils/dom.js';
import { isSupabaseConfigured } from '../services/supabase.js';

let _editingBankId = null;
let _deletingBankId = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getBanks() {
  if (!Array.isArray(state.banks)) state.banks = [];
  return state.banks;
}

const BANK_TYPE_LABELS = {
  conta_corrente: 'Conta Corrente',
  conta_poupanca: 'Conta Poupança',
  investimentos:  'Investimentos',
  outros:         'Outros'
};

const BANK_COLORS = {
  conta_corrente: '#00f5ff',
  conta_poupanca: '#00ff85',
  investimentos:  '#a78bfa',
  outros:         '#facc15'
};

/** Calcula saldo real a partir das transações concluídas vinculadas ao banco */
function calcBankBalance(bankId) {
  const txs = (state.transactions || []).filter(
    t => t.bank_id === bankId && t.is_paid === true && t.account_type === 'bank'
  );
  return txs.reduce((sum, t) => sum + t.value, 0);
}

/** Retorna histórico de saldo dos últimos 6 meses para mini gráfico */
function getBalanceHistory(bankId) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }) });
  }
  const txs = (state.transactions || []).filter(t => t.bank_id === bankId && t.is_paid === true && t.account_type === 'bank');
  let running = 0;
  return months.map(({ year, month, label }) => {
    const sum = txs.filter(t => {
      const parts = (t.date || '').split('/');
      if (parts.length !== 3) return false;
      const tDate = new Date(parts[2], parts[1] - 1, parts[0]);
      return tDate.getFullYear() < year || (tDate.getFullYear() === year && tDate.getMonth() <= month);
    }).reduce((s, t) => s + t.value, 0);
    return { label, value: sum };
  });
}

/** Renderiza mini SVG sparkline */
function sparkline(history, color) {
  if (!history.length) return '';
  const vals = history.map(h => h.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 100, H = 28;
  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-7" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.7"/>
  </svg>`;
}

// ── Render ─────────────────────────────────────────────────────────────────────

export function renderBanks() {
  const grid = document.getElementById('banks-grid');
  if (!grid) return;

  const banks = getBanks();

  if (!banks.length) {
    grid.innerHTML = `
      <div class="col-span-full glass-panel rounded-[28px] p-10 text-center text-white/40">
        <i class="fa-solid fa-building-columns text-4xl mb-3 block opacity-30"></i>
        <p class="font-medium">Nenhuma conta bancária cadastrada.</p>
        <p class="text-sm mt-1">Clique em <strong>+ Adicionar Conta</strong> para começar.</p>
      </div>`;
    return;
  }

  grid.innerHTML = banks.map(bank => {
    const realBalance = calcBankBalance(bank.id);
    const displayBalance = realBalance !== 0 ? realBalance : (bank.balance || 0);
    const color = BANK_COLORS[bank.type] || bank.color || '#00f5ff';
    const typeLabel = BANK_TYPE_LABELS[bank.type] || bank.type;
    const history = getBalanceHistory(bank.id);
    const txCount = (state.transactions || []).filter(t => t.bank_id === bank.id).length;
    const positive = displayBalance >= 0;

    return `
      <div class="glass-panel card-hover rounded-[28px] p-6 relative overflow-hidden">
        <div class="absolute inset-0 opacity-8" style="background:radial-gradient(circle at 80% 20%, ${color}, transparent 70%)"></div>
        <div class="relative">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl flex items-center justify-center" style="background:${color}22;border:1px solid ${color}44">
                <i class="fa-solid fa-building-columns text-sm" style="color:${color}"></i>
              </div>
              <div>
                <p class="font-bold text-white text-sm">${escapeHtml(bank.name)}</p>
                <p class="text-xs text-white/45">● ${typeLabel}</p>
              </div>
            </div>
            <div class="flex gap-1">
              <button onclick="openEditBank('${bank.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-400/70 hover:bg-cyan-400/10 transition-colors" title="Editar">
                <i class="fa-solid fa-pen text-xs"></i>
              </button>
              <button onclick="openDeleteBank('${bank.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-rose-400/60 hover:bg-rose-400/10 transition-colors" title="Excluir">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            </div>
          </div>

          <div class="mb-3">
            <p class="text-xs text-white/45 mb-0.5">Saldo Atual</p>
            <p class="text-2xl font-black ${positive ? 'text-white' : 'text-rose-300'}">${formatMoney(displayBalance)}</p>
          </div>

          <div class="h-7 mb-3">${sparkline(history, color)}</div>

          <div class="flex justify-between text-xs text-white/35">
            <span>${txCount} transaç${txCount !== 1 ? 'ões' : 'ão'}</span>
            <span style="color:${color}">● Ativo</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Criar/Editar banco ─────────────────────────────────────────────────────────

export function openAddBank() {
  _editingBankId = null;
  _setModalTitle('Adicionar Banco');
  _clearBankForm();
  document.getElementById('bank-modal-overlay')?.classList.remove('hidden');
  setTimeout(() => document.getElementById('bank-modal-name')?.focus(), 60);
}

export function openEditBank(id) {
  const bank = getBanks().find(b => b.id === id);
  if (!bank) return;
  _editingBankId = id;
  _setModalTitle('Editar Conta');

  document.getElementById('bank-modal-name').value  = bank.name;
  document.getElementById('bank-modal-type').value  = bank.type || 'conta_corrente';
  document.getElementById('bank-modal-balance').value = (bank.balance || 0).toFixed(2).replace('.', ',');
  document.getElementById('bank-modal-error')?.classList.add('hidden');

  // Label dinâmico para edição
  const lblEl = document.getElementById('bank-balance-label');
  if (lblEl) lblEl.textContent = 'Saldo Reajustado (R$)';

  document.getElementById('bank-modal-overlay')?.classList.remove('hidden');
}

export function saveBankModal() {
  const name    = document.getElementById('bank-modal-name').value.trim();
  const type    = document.getElementById('bank-modal-type').value;
  const balance = parseCurrencyInput(document.getElementById('bank-modal-balance').value);
  const errEl   = document.getElementById('bank-modal-error');

  if (!name) {
    errEl.textContent = 'Informe o nome da conta.';
    errEl.classList.remove('hidden');
    return;
  }
  if (balance === null || balance === undefined || isNaN(balance)) {
    errEl.textContent = 'Saldo inválido.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl?.classList.add('hidden');

  if (_editingBankId) {
    // EDITAR: gera transação de reajuste com a diferença
    const idx = state.banks.findIndex(b => b.id === _editingBankId);
    if (idx >= 0) {
      const oldBalance = state.banks[idx].balance || 0;
      const diff = balance - oldBalance;
      state.banks[idx] = { ...state.banks[idx], name, type, balance };

      if (diff !== 0) {
        _createAdjustTransaction(_editingBankId, diff, name);
        showToast(`Conta atualizada. Reajuste de ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'adicionado' : 'removido'}.`, 'success');
      } else {
        showToast('Conta atualizada.', 'success');
      }
    }
  } else {
    // CRIAR: gera transação de saldo inicial se > 0
    if (!state.banks) state.banks = [];
    const newBank = {
      id: uid('bank'),
      name, type,
      balance: balance,
      color: BANK_COLORS[type] || '#00f5ff',
      created_at: new Date().toISOString()
    };
    state.banks.push(newBank);

    if (balance > 0) {
      _createAdjustTransaction(newBank.id, balance, name);
      showToast(`Banco adicionado com saldo inicial de ${formatMoney(balance)}.`, 'success');
    } else {
      showToast('Conta bancária adicionada.', 'success');
    }
  }

  _editingBankId = null;
  saveState();
  document.getElementById('bank-modal-overlay')?.classList.add('hidden');
  if (window.appRenderAll) window.appRenderAll();
  else renderBanks();
}

/** Cria transação automática de "Reajuste de saldo" */
function _createAdjustTransaction(bankId, amount, bankName) {
  if (!state.transactions) state.transactions = [];
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();

  state.transactions.unshift({
    id: uid('tx'),
    date: `${dd}/${mm}/${yyyy}`,
    desc: `Reajuste de saldo — ${bankName}`,
    cat: 'Receita',
    value: amount,
    payment: 'conta',
    bank_id: bankId,
    account_type: 'bank',
    transaction_type: 'reajuste',
    is_paid: true,
    notes: 'Ajuste automático de saldo'
  });

  // Recalcular saldo geral
  state.balance = (state.transactions || [])
    .filter(t => t.is_paid)
    .reduce((s, t) => s + t.value, 0);
}

// ── Excluir banco ──────────────────────────────────────────────────────────────

export function openDeleteBank(id) {
  _deletingBankId = id;
  const bank = getBanks().find(b => b.id === id);
  if (!bank) return;

  // Conta quantas transações e cartões estão vinculados
  const linkedTxs = (state.transactions || []).filter(t => t.bank_id === id);
  const linkedCards = (state.cards || []).filter(c => c.bank_id === id);

  const summaryEl = document.getElementById('bank-delete-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      O banco <strong>"${escapeHtml(bank.name)}"</strong> possui:
      <ul class="mt-2 space-y-1 text-sm">
        ${linkedTxs.length ? `<li>• <span class="text-rose-300 font-bold">${linkedTxs.length}</span> transação${linkedTxs.length !== 1 ? 'ões' : ''} vinculada${linkedTxs.length !== 1 ? 's' : ''}</li>` : ''}
        ${linkedCards.length ? `<li>• <span class="text-amber-300 font-bold">${linkedCards.length}</span> cartão${linkedCards.length !== 1 ? 'ões' : ''} vinculado${linkedCards.length !== 1 ? 's' : ''}</li>` : ''}
        ${!linkedTxs.length && !linkedCards.length ? '<li class="text-white/40">Nenhuma transação ou cartão vinculado.</li>' : ''}
      </ul>
      <p class="mt-3 text-white/55">O que deseja fazer com as transações?</p>`;
  }

  // Popula select de banco destino (sem o que será deletado)
  const destSelect = document.getElementById('bank-delete-dest');
  if (destSelect) {
    const others = getBanks().filter(b => b.id !== id);
    destSelect.innerHTML = others.length
      ? others.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')
      : '<option value="">Nenhum outro banco disponível</option>';
  }

  // Opção "transferir" só ativa se há outros bancos
  const transferOpt = document.getElementById('bank-delete-opt-transfer');
  const otherBanks = getBanks().filter(b => b.id !== id);
  if (transferOpt) transferOpt.disabled = otherBanks.length === 0;

  document.getElementById('bank-delete-overlay')?.classList.remove('hidden');
}

export function confirmDeleteBank() {
  if (!_deletingBankId) return;

  const optDelete   = document.getElementById('bank-delete-opt-delete');
  const optTransfer = document.getElementById('bank-delete-opt-transfer');
  const destSelect  = document.getElementById('bank-delete-dest');
  const isTransfer  = optTransfer?.checked;
  const destId      = destSelect?.value;

  if (isTransfer && !destId) {
    showToast('Selecione o banco destino para transferir as transações.', 'warning');
    return;
  }

  const bank = getBanks().find(b => b.id === _deletingBankId);

  if (isTransfer && destId) {
    // Migrar transações e cartões para o banco destino
    state.transactions = (state.transactions || []).map(t =>
      t.bank_id === _deletingBankId ? { ...t, bank_id: destId } : t
    );
    state.cards = (state.cards || []).map(c =>
      c.bank_id === _deletingBankId ? { ...c, bank_id: destId } : c
    );
    showToast(`Transações transferidas para o banco destino.`, 'success');
  } else {
    // Excluir todas as transações vinculadas
    const removed = (state.transactions || []).filter(t => t.bank_id === _deletingBankId).length;
    state.transactions = (state.transactions || []).filter(t => t.bank_id !== _deletingBankId);
    state.cards = (state.cards || []).map(c =>
      c.bank_id === _deletingBankId ? { ...c, bank_id: null } : c
    );
    if (removed > 0) showToast(`${removed} transaç${removed !== 1 ? 'ões' : 'ão'} excluída${removed !== 1 ? 's' : ''} com o banco.`, 'info');
  }

  // Remove o banco
  state.banks = (state.banks || []).filter(b => b.id !== _deletingBankId);

  // Remover do Supabase se configurado
  if (isSupabaseConfigured) {
    const bankId = _deletingBankId;
    import('../services/supabase.js').then(({ supabase, isSupabaseConfigured: ok }) => {
      if (!ok || !supabase) return;
      supabase.from('banks').delete().eq('id', bankId).catch(e => console.error('[Banks] Falha ao deletar banco remoto:', e));
    });
  }

  // Recalcular saldo
  state.balance = (state.transactions || []).filter(t => t.is_paid).reduce((s, t) => s + t.value, 0);

  _deletingBankId = null;
  saveState();
  document.getElementById('bank-delete-overlay')?.classList.add('hidden');
  showToast(`Banco "${escapeHtml(bank?.name || '')}" removido.`, 'info');
  if (window.appRenderAll) window.appRenderAll();
  else renderBanks();
}

// ── Helpers internos ───────────────────────────────────────────────────────────

function _setModalTitle(text) {
  const el = document.getElementById('bank-modal-title');
  if (el) el.textContent = text;
}

function _clearBankForm() {
  ['bank-modal-name', 'bank-modal-balance'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const typeEl = document.getElementById('bank-modal-type');
  if (typeEl) typeEl.value = 'conta_corrente';
  const lblEl = document.getElementById('bank-balance-label');
  if (lblEl) lblEl.textContent = 'Saldo Inicial (R$)';
  document.getElementById('bank-modal-error')?.classList.add('hidden');
}

// ── Bind Events ────────────────────────────────────────────────────────────────

export function bindBankEvents() {
  document.getElementById('bank-add-btn')?.addEventListener('click', openAddBank);
  document.getElementById('bank-modal-close')?.addEventListener('click', () =>
    document.getElementById('bank-modal-overlay')?.classList.add('hidden'));
  document.getElementById('bank-modal-cancel')?.addEventListener('click', () =>
    document.getElementById('bank-modal-overlay')?.classList.add('hidden'));
  document.getElementById('bank-modal-save')?.addEventListener('click', saveBankModal);
  document.getElementById('bank-modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('bank-modal-overlay'))
      document.getElementById('bank-modal-overlay').classList.add('hidden');
  });

  // Delete modal
  document.getElementById('bank-delete-close')?.addEventListener('click', () =>
    document.getElementById('bank-delete-overlay')?.classList.add('hidden'));
  document.getElementById('bank-delete-cancel')?.addEventListener('click', () =>
    document.getElementById('bank-delete-overlay')?.classList.add('hidden'));
  document.getElementById('bank-delete-confirm')?.addEventListener('click', confirmDeleteBank);
  document.getElementById('bank-delete-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('bank-delete-overlay'))
      document.getElementById('bank-delete-overlay').classList.add('hidden');
  });

  // Toggle visibilidade do select de destino ao escolher "transferir"
  document.getElementById('bank-delete-opt-transfer')?.addEventListener('change', () => {
    document.getElementById('bank-delete-dest-row')?.classList.remove('hidden');
  });
  document.getElementById('bank-delete-opt-delete')?.addEventListener('change', () => {
    document.getElementById('bank-delete-dest-row')?.classList.add('hidden');
  });

  // Expor funções globais para onclick inline
  window.openEditBank   = openEditBank;
  window.openDeleteBank = openDeleteBank;
}
