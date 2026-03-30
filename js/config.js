/**
 * js/config.js — GrokFin Elite v6
 * Todas as constantes da aplicação centralizadas.
 * NÃO importa nenhum outro módulo interno.
 */

export const STORAGE_KEY = 'grokfin_hybrid_pwa_state';

/** Índice → label de cada aba */
export const NAV_LABELS = [
  'Home', 'Análise', 'Conta', 'Chat',
  'Metas', 'Perfil', 'Cartões', 'Fluxo', 'Invest.', 'Mercado', 'Relatórios'
];

/** Índice → hash de URL de cada aba */
export const NAV_HASHES = [
  'home', 'analise', 'conta', 'chat',
  'metas', 'perfil', 'cartoes', 'fluxo', 'investimentos', 'mercado', 'relatorios'
];

/** Ícones FontAwesome de cada aba */
export const NAV_ICONS = [
  'fa-house', 'fa-chart-pie', 'fa-credit-card', 'fa-comments',
  'fa-bullseye', 'fa-user', 'fa-wallet', 'fa-water', 'fa-seedling', 'fa-globe', 'fa-chart-pie'
];

/** Quantidade de transações por página no extrato */
export const TX_PAGE_SIZE = 20;

/** Lista canônica de categorias para orçamentos */
export const CATEGORIES_LIST = [
  'Alimentação', 'Assinaturas', 'Investimentos', 'Lazer',
  'Moradia', 'Metas', 'Rotina', 'Saúde', 'Transporte'
];

/** Formas de pagamento disponíveis */
export const PAYMENT_METHODS = [
  { value: 'pix',            label: 'Pix',                    icon: 'fa-qrcode' },
  { value: 'dinheiro',       label: 'Dinheiro / Espécie',     icon: 'fa-money-bill-wave' },
  { value: 'cartao_credito', label: 'Cartão de crédito',      icon: 'fa-credit-card' },
  { value: 'cartao_debito',  label: 'Cartão de débito',       icon: 'fa-credit-card' },
  { value: 'conta',          label: 'Transferência / TED',    icon: 'fa-building-columns' },
  { value: 'boleto',         label: 'Boleto bancário',        icon: 'fa-barcode' },
];

export const iconByCategory = {
  'Receita': 'fa-arrow-trend-up',
  'Alimentação': 'fa-bowl-food',
  'Transporte': 'fa-car-side',
  'Lazer': 'fa-film',
  'Moradia': 'fa-house',
  'Investimentos': 'fa-chart-line',
  'Assinaturas': 'fa-repeat',
  'Saúde': 'fa-heart-pulse',
  'Metas': 'fa-bullseye',
  'Rotina': 'fa-bag-shopping'
};

export const toneByCategory = {
  'Receita': 'tone-success',
  'Alimentação': 'tone-cyan',
  'Transporte': 'tone-amber',
  'Lazer': 'tone-violet',
  'Moradia': 'tone-slate',
  'Investimentos': 'tone-cyan',
  'Assinaturas': 'tone-violet',
  'Saúde': 'tone-danger',
  'Metas': 'tone-success',
  'Rotina': 'tone-slate'
};

export function iconForCategory(category) {
  return iconByCategory[category] || 'fa-wallet';
}

export function toneForCategory(category, positive = false) {
  if (positive) return 'tone-success';
  return toneByCategory[category] || 'tone-slate';
}
