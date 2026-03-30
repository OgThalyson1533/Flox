/**
 * js/app.js — GrokFin Elite v6
 * Orquestrador central da aplicação modular.
 */

import { loadState, saveState, state } from './state.js';
import { initAuth } from './services/auth.js';
import { isSupabaseConfigured } from './services/supabase.js';
import { syncFromSupabase } from './services/sync.js';
import { fetchExchangeRates } from './services/exchange.js';
import { bindNavigationEvents, syncLocationHash, syncActiveViewLabel, switchTab } from './ui/navigation.js';
import { bindDashboardEvents, renderDashboard, renderHeaderMeta, renderReport, renderHomeWidgets } from './ui/dashboard-ui.js';
import { renderCharts } from './ui/charts.js';
import { bindTxEvents, renderTransactions } from './ui/transactions-ui.js';
import { bindGoalEvents, renderGoals } from './ui/goals-ui.js';
import { bindCardEvents, renderCards } from './ui/cards-ui.js';
import { bindCashflowEvents, renderCashflow } from './ui/cashflow-ui.js';
import { bindInvestmentEvents, renderInvestments } from './ui/investments-ui.js';
import { bindChatEvents, ensureChatSeed, renderChat, getAIProvider } from './ui/chat-ui.js';
import { bindProfileEvents, renderProfile } from './ui/profile-ui.js';
import { renderMarketTab } from './ui/market-ui.js';
import { bindReportsEvents, renderReports } from './ui/reports-ui.js';
import { calculateAnalytics, processRecurrences } from './analytics/engine.js';
import { showToast } from './utils/dom.js';
import { initOnboarding } from './ui/onboarding.js';

let renderAnimationFrame = null;

window.renderAll = function() {
  if (renderAnimationFrame) cancelAnimationFrame(renderAnimationFrame);
  
  renderAnimationFrame = requestAnimationFrame(() => {
    const analytics = calculateAnalytics(state);
    
    renderHeaderMeta(analytics);
    renderProfile(analytics);
    renderDashboard(analytics);
    renderHomeWidgets(analytics);
    renderReport(analytics);
    renderCharts(analytics);
    renderTransactions();
    renderGoals(analytics);
    renderCards();
    renderCashflow();
    renderInvestments();
    renderReports();
    // [FIX] Aba Mercado nunca era renderizada no ciclo global
    if (state.ui.activeTab === 9) renderMarketTab(false);
    // [FIX CAL] Atualiza calendário financeiro com dados reais após qualquer mudança
    if (typeof window.finCalRender === 'function') window.finCalRender();
    
    renderAnimationFrame = null;
  });
}

window.appRenderAll = window.renderAll;
window.renderHeaderMeta = renderHeaderMeta;
// [FIX CAL] Expõe state globalmente para o calendário financeiro embutido no HTML
window.appState = state;
window.showToast = showToast;

async function initApp() {
  // 0. Autenticação restrita (bloquear se Supabase estiver configurado e o usuário não existir)
  const user = await initAuth();
  if (isSupabaseConfigured && !user) {
    window.location.replace('./index.html');
    return;
  }

  // 1. Carrega dados do localStorage ou gera banco inicial
  const loadedState = loadState();
  Object.assign(state, loadedState);

  // 1.2 Resgata da nuvem e mescla/sobrescreve o local (multi-device)
  if (isSupabaseConfigured && user) {
    const success = await syncFromSupabase(state);
    if (success) {
      saveState();
    }
  }

  // 1.3 Atualiza cotações de câmbio em background (sem bloquear o boot)
  // [FIX] fetchExchangeRates nunca era chamado — app sempre usava valores estáticos do seed
  fetchExchangeRates().then(rates => {
    if (rates) {
      state.exchange = { ...state.exchange, ...rates };
      saveState();
    }
  }).catch(e => console.warn('[Exchange] Falha ao atualizar cotações:', e));

  // 1.5 Roda o Cron-Job Local de Recorrências Fixas
  const cronDidChanges = processRecurrences(state);
  if (cronDidChanges) {
    saveState();
  }

  // 2. Configura a Chart.js global
  if (window.Chart) {
    Chart.defaults.color = 'rgba(255,255,255,.58)';
    Chart.defaults.font.family = 'Inter';
  }

  // 3. Aplica bind de eventos de todos os módulos de UI
  bindNavigationEvents();
  bindDashboardEvents();
  bindTxEvents();
  bindGoalEvents();
  bindCardEvents();
  bindCashflowEvents();
  bindInvestmentEvents();
  bindChatEvents();
  bindProfileEvents();
  bindReportsEvents();

  // 3.2 Indicador de modo IA — atualiza o badge do header do chat
  // #ai-active-indicator e #ai-mode-label ficavam estáticos; agora refletem
  // o provedor configurado assim que o app inicializa.
  (function updateAIIndicator() {
    const apiKey   = localStorage.getItem('grokfin_anthropic_key');
    const provider = getAIProvider(apiKey);
    const indicator = document.getElementById('ai-active-indicator');
    const modeLabel = document.getElementById('ai-mode-label');
    const subtitle  = document.getElementById('ai-chat-subtitle');

    if (provider === 'gemini') {
      if (indicator) {
        indicator.textContent = '✦ Gemini ativo';
        indicator.style.display = 'inline-flex';
        indicator.style.background = 'linear-gradient(135deg,#00f5ff,#00ff85)';
      }
      if (modeLabel) modeLabel.textContent = 'Gemini conectado';
      if (subtitle)  subtitle.textContent  = 'IA Gemini ativa · Lê saldo, metas, categorias, câmbio e comprovantes';
    } else if (provider === 'claude') {
      if (indicator) {
        indicator.textContent = '✦ Claude ativo';
        indicator.style.display = 'inline-flex';
        indicator.style.background = 'linear-gradient(135deg,#a855f7,#6366f1)';
      }
      if (modeLabel) modeLabel.textContent = 'Claude conectado';
      if (subtitle)  subtitle.textContent  = 'IA Claude ativa · Lê saldo, metas, categorias, câmbio e comprovantes';
    } else {
      if (indicator) indicator.style.display = 'none';
      if (modeLabel) modeLabel.textContent = 'Modo básico';
    }
  })();

  // 3.1 Garante a mensagem de boas-vindas no chat
  // [FIX] ensureChatSeed nunca era chamado — chat abria vazio para novos usuários
  ensureChatSeed();

  // 4. Render Inicial Pleno
  window.renderAll();
  
  // 5. Restaura a Tab ativa 
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash) {
     window.dispatchEvent(new Event('hashchange'));
  } else {
     switchTab(state.ui.activeTab || 0, { noScroll: true, skipHistory: true });
     syncLocationHash(state.ui.activeTab || 0);
     syncActiveViewLabel(state.ui.activeTab || 0);
  }

  // 6. Inicia Onboarding de Novos Usuários
  initOnboarding();

  console.info('[GrokFin] Aplicação inicializada de forma modular.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
