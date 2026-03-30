/**
 * js/state.js — GrokFin Elite v6
 * Gerenciamento de estado: loadState, saveState, buildSeedState.
 * O state object é a única fonte de verdade para toda a aplicação.
 */

import { STORAGE_KEY } from './config.js';
import { uid }         from './utils/math.js';
import { formatDateBR, addMonths } from './utils/date.js';
import { syncToSupabase } from './services/sync.js';

// ── Helpers internos ──────────────────────────────────────────────────────────
export const state = {};
const LEGACY_STORAGE_KEY = 'grokfin_elite_v4_state';

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function createSvgDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createDefaultBannerDataUrl() {
  return createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 640">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#09111c"/>
          <stop offset="55%" stop-color="#0a1322"/>
          <stop offset="100%" stop-color="#071019"/>
        </linearGradient>
        <radialGradient id="glowA" cx="0.2" cy="0.2" r="0.65">
          <stop offset="0%" stop-color="rgba(0,245,255,.95)"/>
          <stop offset="100%" stop-color="rgba(0,245,255,0)"/>
        </radialGradient>
        <radialGradient id="glowB" cx="0.85" cy="0.15" r="0.5">
          <stop offset="0%" stop-color="rgba(168,85,247,.9)"/>
          <stop offset="100%" stop-color="rgba(168,85,247,0)"/>
        </radialGradient>
        <radialGradient id="glowC" cx="0.7" cy="0.85" r="0.48">
          <stop offset="0%" stop-color="rgba(0,255,133,.75)"/>
          <stop offset="100%" stop-color="rgba(0,255,133,0)"/>
        </radialGradient>
      </defs>
      <rect width="1600" height="640" fill="url(#bg)"/>
      <rect width="1600" height="640" fill="url(#glowA)" opacity="0.24"/>
      <rect width="1600" height="640" fill="url(#glowB)" opacity="0.20"/>
      <rect width="1600" height="640" fill="url(#glowC)" opacity="0.22"/>
      <g opacity="0.85">
        <rect x="104" y="104" width="190" height="190" rx="44" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.08)"/>
        <text x="199" y="225" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="98" font-weight="900" fill="#E6FDFF">G</text>
      </g>
    </svg>
  `);
}

function createDefaultAvatarDataUrl(name = 'GrokFin User') {
  const initials = (String(name).trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2) || 'GF').toUpperCase();
  return createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="avatarBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#00F5FF"/>
          <stop offset="100%" stop-color="#00FF85"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="140" fill="#08111C"/>
      <circle cx="256" cy="256" r="208" fill="url(#avatarBg)" opacity="0.95"/>
      <text x="256" y="292" text-anchor="middle" font-family="Inter, Arial, sans-serif"
            font-size="140" font-weight="900" fill="#071019">${initials}</text>
    </svg>
  `);
}

// ── buildSeedState ────────────────────────────────────────────────────────────

export function buildSeedState() {
  const today = new Date();

  return {
    isNewUser: true,
    balance: 1550,
    exchange: {
      usd: 5.92, eur: 6.45, btc: 312450,
      trend: { usd: 0.4, eur: 0.2, btc: -1.2 }
    },
    // [FIX] Novos usuários começam com dados ZERADOS.
    // Dados de demonstração não devem aparecer no primeiro acesso real.
    banks: [],
    cards: [],
    investments: [],
    fixedExpenses: [],
    budgets: {
      'Moradia': 0, 'Alimentação': 0, 'Transporte': 0,
      'Lazer': 0,    'Investimentos': 0,'Assinaturas': 0,
      'Saúde': 0,    'Metas': 0
    },
    goals: [],
    profile: {
      bannerImage: createDefaultBannerDataUrl(),
      avatarImage: createDefaultAvatarDataUrl('GrokFin User'),
      nickname: 'Navigator',
      displayName: 'GrokFin User',
      handle: '@grokfin.user'
    },
    transactions: [
      { id: uid('tx'), date: formatDateBR(today), desc: 'Pendência', cat: 'Alimentação', value: -500.00, payment: 'conta', notes: 'Feijão', is_paid: false, account_type: 'bank', transaction_type: 'saida' },
      { id: uid('tx'), date: formatDateBR(addDays(today, -1)), desc: 'Aluguel', cat: 'Moradia', value: -1500.00, payment: 'conta', is_paid: true, account_type: 'bank', transaction_type: 'saida' },
      { id: uid('tx'), date: formatDateBR(addDays(today, -3)), desc: 'Supermercado', cat: 'Alimentação', value: -450.00, payment: 'cartao_credito', is_paid: true, account_type: 'credit_card', transaction_type: 'saida' },
      { id: uid('tx'), date: formatDateBR(addDays(today, -5)), desc: 'Salário', cat: 'Receita', value: 4000.00, payment: 'conta', is_paid: true, account_type: 'bank', transaction_type: 'entrada' }
    ],
    customCategories: [], // categorias criadas pelo usuário — persistidas por conta
    ui: { txSearch: '', txCategory: 'all', txSort: 'date-desc', txDateStart: null, txDateEnd: null, txPage: 0, txPageSize: 10, activeTab: 0, homeFilter: 'this_month' },
    chatHistory: [],
    lastUpdated: new Date().toISOString()
  };
}

// ── Tab index migration helpers ───────────────────────────────────────────────

// [FIX #5] Expandido para cobrir todas as 9 abas (0-8).
// Antes limitava erroneamente ao índice 5, bloqueando as tabs 6, 7 e 8
// de serem restauradas após recarregar a página.
function mapCurrentActiveTab(index) {
  const mapping = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9 };
  return mapping[index] ?? Math.min(Math.max(index, 0), 9);
}

function mapLegacyActiveTab(index) {
  const mapping = { 0: 0, 1: 2, 2: 4, 3: 3, 4: 1 };
  return mapping[index] ?? Math.min(Math.max(index, 0), 9);
}

// ── loadState ─────────────────────────────────────────────────────────────────

export function loadState() {
  const seed = buildSeedState();
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    const legacyRaw  = currentRaw ? null : localStorage.getItem(LEGACY_STORAGE_KEY);
    const raw = currentRaw || legacyRaw;
    if (!raw) return seed;

    const saved = JSON.parse(raw);
    const savedActiveTab = Number(saved?.ui?.activeTab);
    const activeTab = currentRaw
      ? mapCurrentActiveTab(Number.isFinite(savedActiveTab) ? savedActiveTab : seed.ui.activeTab)
      : mapLegacyActiveTab(Number.isFinite(savedActiveTab) ? savedActiveTab : seed.ui.activeTab);

    const goalsSource = Array.isArray(saved.goals) && saved.goals.length ? saved.goals : seed.goals;

    return {
      ...seed,
      ...saved,
      isNewUser: saved.isNewUser ?? (raw ? false : true),
      exchange:     { ...seed.exchange,     ...(saved.exchange    || {}), trend: { ...seed.exchange.trend, ...(saved.exchange?.trend || {}) } },
      ui:           { ...seed.ui,           ...(saved.ui          || {}), activeTab },
      budgets:      { ...seed.budgets,      ...(saved.budgets     || {}) },
      profile:      { ...seed.profile,      ...(saved.profile     || {}) },
      transactions: Array.isArray(saved.transactions) && saved.transactions.length ? saved.transactions : seed.transactions,
      customCategories: Array.isArray(saved.customCategories) ? saved.customCategories : [],
      banks:        Array.isArray(saved.banks)        ? saved.banks        : seed.banks,
      cards:        Array.isArray(saved.cards)        ? saved.cards        : seed.cards,
      investments:  Array.isArray(saved.investments)  ? saved.investments  : seed.investments,
      fixedExpenses:Array.isArray(saved.fixedExpenses)? saved.fixedExpenses: seed.fixedExpenses,
      goals:        goalsSource,
      chatHistory:  Array.isArray(saved.chatHistory)  ? saved.chatHistory  : []
    };
  } catch {
    return seed;
  }
}

// ── saveState ─────────────────────────────────────────────────────────────────

let _syncTimeout = null;

// [FIX #2] Removido parâmetro `state` da assinatura. Todos os callers chamavam
// saveState() sem argumento, fazendo o parâmetro chegar como `undefined` e nunca
// persistindo nada no localStorage. Agora usa o `state` exportado deste módulo
// diretamente, que é o objeto mutado pela aplicação inteira.
export function saveState() {
  try {
    if (state.isNewUser && (state.goals.length > 0 || state.transactions.length > 0)) {
       state.isNewUser = false;
    }

    const toSave = { ...state, chatHistory: (state.chatHistory || []).slice(-40) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    
    // Background sync para o Supabase (Debounced)
    if (!state.isNewUser) {
      clearTimeout(_syncTimeout);
      _syncTimeout = setTimeout(() => {
        syncToSupabase(state).catch(e => console.error('[Sync] Falha auto-sync:', e));
      }, 2500);
    }
  } catch {
    // localStorage cheio — tenta versão slim sem imagens e chat
    try {
      const slim = { ...state, chatHistory: [], profile: { ...state.profile, bannerImage: '', avatarImage: '' } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      console.warn('GrokFin: localStorage quase cheio, imagens de perfil removidas do cache.');
    } catch { /* ignore */ }
  }
}
