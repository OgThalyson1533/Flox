/**
 * js/ui/chat-ui.js
 * Lógica do assistente chat, integração com AI e fallback.
 */

import { state, saveState } from '../state.js';
import { uid } from '../utils/math.js';
import { richText, formatMoney, parseCurrencyInput, formatPercent } from '../utils/format.js';
import { formatShortTime } from '../utils/date.js';
import { calculateAnalytics } from '../analytics/engine.js';
import { showToast, normalizeText } from '../utils/dom.js';

let chatTyping = false;

// Helpers global exportados se necessários
export function scrollChatToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

export function ensureChatSeed() {
  if (!state.chatHistory) state.chatHistory = [];
  // Removemos o seed inicial hardcoded, o empty-state agora reside nativamente no HTML do Sidebar.
  saveState();
}

export function toggleAiSidePanel(forceState) {
  const panel = document.getElementById('ai-side-panel');
  const backdrop = document.getElementById('ai-panel-backdrop');
  if (!panel || !backdrop) return;
  
  const isOpen = forceState !== undefined ? forceState : panel.classList.contains('translate-x-full');
  
  if (isOpen) {
    panel.classList.remove('translate-x-full');
    panel.classList.add('translate-x-0');
    backdrop.classList.remove('hidden');
    void backdrop.offsetWidth;
    backdrop.classList.remove('opacity-0');
    
    // Gera sugestões contextuais baseadas nos dados reais do usuário
    buildContextualSuggestions();
    
    setTimeout(() => {
      document.getElementById('chat-input')?.focus();
      scrollChatToBottom();
    }, 300);
  } else {
    panel.classList.add('translate-x-full');
    panel.classList.remove('translate-x-0');
    backdrop.classList.add('opacity-0');
    setTimeout(() => { backdrop.classList.add('hidden'); }, 500);
  }
}

window.toggleAiSidePanel = toggleAiSidePanel;

// ── Sugestões contextuais dinâmicas ──────────────────────────────────────────
export function buildContextualSuggestions() {
  const container = document.getElementById('ai-suggestions-container');
  if (!container) return;

  const analytics = calculateAnalytics(state);
  const suggestions = [];

  if (analytics.overspend) {
    suggestions.push({
      label: `Por que ultrapassei ${analytics.overspend.cat}?`,
      prompt: `Por que meu orçamento de ${analytics.overspend.cat} estourou?`
    });
  }

  if (analytics.urgentGoal && suggestions.length < 3) {
    suggestions.push({
      label: `Como está a meta "${analytics.urgentGoal.nome}"?`,
      prompt: `Como está minha meta de ${analytics.urgentGoal.nome}?`
    });
  }

  if (analytics.runwayMonths < 2 && analytics.burnDaily > 0 && suggestions.length < 3) {
    suggestions.push({
      label: 'Como está meu fôlego de caixa?',
      prompt: 'Qual é o meu runway e como posso aumentar meu fôlego financeiro?'
    });
  }

  if (analytics.topCategory && analytics.topCategory.value > 0 && suggestions.length < 3) {
    suggestions.push({
      label: `Maior gasto: ${analytics.topCategory.name}`,
      prompt: `Quanto gastei em ${analytics.topCategory.name} e como posso reduzir?`
    });
  }

  if (analytics.lastMonthExpenses > 0 && suggestions.length < 3) {
    const diff = analytics.expenses - analytics.lastMonthExpenses;
    suggestions.push({
      label: `Gastei ${diff > 0 ? 'mais' : 'menos'} que o mês passado?`,
      prompt: 'Compare meus gastos deste mês com o mês passado.'
    });
  }

  if ((state.investments || []).length && suggestions.length < 3) {
    suggestions.push({
      label: 'Como estão meus investimentos?',
      prompt: 'Como estão meus investimentos e qual o total aplicado?'
    });
  }

  const fallbacks = [
    { label: 'Qual é o meu saldo atual?', prompt: 'Qual é o meu saldo atual e patrimônio total?' },
    { label: 'Onde estou gastando mais?', prompt: 'Onde estou gastando mais dinheiro este mês?' },
    { label: 'Como está minha saúde financeira?', prompt: 'Como está meu score e saúde financeira geral?' },
  ];
  fallbacks.forEach(f => { if (suggestions.length < 3) suggestions.push(f); });

  const btnClass = 'w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-[13px] font-medium text-white/80 transition-all hover:bg-emerald-400/10 hover:border-emerald-400/50 hover:text-emerald-300 group shadow-sm';
  const arrowClass = 'fa-solid fa-arrow-right opacity-0 -translate-x-2 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 text-emerald-400';

  container.innerHTML = suggestions.slice(0, 3).map(s => `
    <button class="${btnClass}" data-chat-prompt="${s.prompt.replace(/"/g, '&quot;')}">
      <span>${s.label}</span>
      <i class="${arrowClass}"></i>
    </button>
  `).join('');
}

export function renderChat() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const aiSidePanel = document.getElementById('ai-side-panel');
  if (aiSidePanel) {
    if (state.chatHistory && state.chatHistory.length > 0) {
      aiSidePanel.classList.add('has-messages');
    } else {
      aiSidePanel.classList.remove('has-messages');
    }
  }

  container.innerHTML = state.chatHistory.map(message => {
    const isUser = message.role === 'user';
    return `
      <div class="flex flex-col ${isUser ? 'items-end' : 'items-start'}">
        <div class="flex gap-2 max-w-[88%] ${isUser ? 'flex-row-reverse' : 'flex-row'}">
          ${isUser ? '' : `
            <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 text-[#0f1115] shadow-sm">
              <i class="fa-solid fa-robot text-sm"></i>
            </div>
          `}
          <div class="flex-1 min-w-0">
            <div class="${isUser ? 'bg-[#10b981] text-[#0b0d14] rounded-[18px] rounded-tr-sm shadow-[0_2px_10px_rgba(16,185,129,0.1)]' : 'bg-white/5 border border-white/5 text-white/90 rounded-[18px] rounded-tl-sm'} px-4 py-3">
              <div class="text-[13px] leading-relaxed break-words whitespace-pre-wrap ${isUser ? 'font-medium' : ''}">${richText(message.text)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (chatTyping) {
    const typingNode = document.createElement('div');
    typingNode.className = 'flex flex-col items-start';
    typingNode.innerHTML = `
      <div class="flex gap-2 max-w-[88%] flex-row">
        <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 text-[#0f1115] shadow-sm">
          <i class="fa-solid fa-robot text-sm"></i>
        </div>
        <div class="bg-white/5 border border-white/5 rounded-[18px] rounded-tl-sm px-4 py-3">
          <div class="flex items-center h-[19px]">
            <span class="typing-dot bg-emerald-400"></span><span class="typing-dot bg-emerald-400"></span><span class="typing-dot bg-emerald-400"></span>
          </div>
        </div>
      </div>
    `;
    container.appendChild(typingNode);
  }

  scrollChatToBottom();
}

// Debounce de 300ms para salvar o histórico do chat — evita múltiplas
// escritas em localStorage por sequências rápidas de mensagens (ex: erro+fallback)
let _chatSaveTimer = null;
function debouncedChatSave() {
  clearTimeout(_chatSaveTimer);
  _chatSaveTimer = setTimeout(() => saveState(), 300);
}

export function pushChatMessage(role, text) {
  state.chatHistory.push({
    id: uid('msg'),
    role,
    text,
    createdAt: new Date().toISOString()
  });
  state.chatHistory = state.chatHistory.slice(-50);
  debouncedChatSave();
  renderChat();
}

export function setChatTyping(value) {
  chatTyping = value;
  renderChat();
}

async function callAIProxy({ provider, ...payload }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, ...payload }),
      signal: controller.signal
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || err?.message || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      throw new Error('Timeout — verifique sua conexão.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendGeminiMessage(userText, apiKey) {
  const analytics = calculateAnalytics(state);
  const recentTxs = state.transactions.slice(0, 8).map(t =>
    `${t.date} | ${t.desc} | ${t.cat} | ${t.value >= 0 ? '+' : ''}R$${Math.abs(t.value).toFixed(2)}`
  ).join('\n');

  const budgetLines = Object.entries(state.budgets || {})
    .filter(([, v]) => v > 0)
    .map(([cat, lim]) => {
      const spent = analytics.categories.find(([c]) => c === cat)?.[1] || 0;
      return `${cat}: gasto R$${spent.toFixed(2)} / limite R$${lim.toFixed(2)} (${Math.round((spent/lim)*100)}%)`;
    }).join('\n') || 'Sem orçamentos cadastrados';

  const goalLines = (state.goals || []).map(g =>
    `${g.nome}: R$${g.atual.toFixed(2)} de R$${g.total.toFixed(2)} (${Math.round((g.atual/g.total)*100)}%) — prazo ${g.deadline ? new Date(g.deadline).toLocaleDateString('pt-BR') : 'sem prazo'}`
  ).join('\n') || 'Sem metas';

  const cardLines = (state.cards || []).map(c =>
    `${c.name} (${c.cardType}): R$${(c.used||0).toFixed(2)} usados de R$${c.limit.toFixed(2)}`
  ).join('\n') || 'Sem cartões';

  const context = [
    'Você é o GrokFin Elite, assessor financeiro pessoal de altíssimo nível.',
    'Seja direto, prático e use os DADOS REAIS do usuário em cada resposta.',
    'Nunca invente dados. Se não souber algo, diga que não tem essa informação.',
    'Use **negrito** para valores e conceitos-chave. Máximo 3 parágrafos curtos.',
    'Responda em português do Brasil.',
    '',
    '=== SITUAÇÃO FINANCEIRA ATUAL ===',
    `Saldo em conta: R$${state.balance.toFixed(2)}`,
    `Receita do mês: R$${analytics.incomes.toFixed(2)}`,
    `Despesas do mês: R$${analytics.expenses.toFixed(2)}`,
    `Fluxo líquido: R$${analytics.net.toFixed(2)}`,
    `Taxa de poupança: ${analytics.savingRate.toFixed(1)}%`,
    `Score financeiro: ${analytics.healthScore}/100`,
    `Burn diário: R$${analytics.burnDaily.toFixed(2)}`,
    `Runway: ${analytics.runwayMonths.toFixed(1)} meses`,
    `Maior gasto do mês: ${analytics.topCategory.name} (R$${analytics.topCategory.value.toFixed(2)})`,
    `Tendência 3 meses: ${analytics.trend3m > 0 ? '+' : ''}${analytics.trend3m.toFixed(1)}%`,
    `USD: R$${state.exchange.usd} | EUR: R$${state.exchange.eur}`,
    '',
    '=== ORÇAMENTOS ===',
    budgetLines,
    '',
    '=== METAS ===',
    goalLines,
    '',
    '=== CARTÕES ===',
    cardLines,
    '',
    '=== ÚLTIMAS TRANSAÇÕES ===',
    recentTxs
  ].join('\n');

  const payload = {
    contents: [{ parts: [{ text: context + '\n\nPergunta do usuário: ' + userText }] }],
    generationConfig: { maxOutputTokens: 600, temperature: 0.7 }
  };
  const data = await callAIProxy({
    provider: 'gemini',
    apiKey,
    mode: 'text',
    payload
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.text;
  if (!text) throw new Error('Resposta vazia do Gemini.');
  return text;
}

// ── Helpers de detecção de categoria ────────────────────────────────────────
function detectCategoryInText(q) {
  const catMap = {
    'alimentacao|comida|mercado|supermercado|ifood|restaurante|lanche|padaria|fruta|pao|cafe|pizza|hamburguer|almoco|jantar': 'Alimentação',
    'transporte|uber|99|taxi|gasolina|combustivel|posto|onibus|metro|brt|trem|passagem|pedagio': 'Transporte',
    'lazer|netflix|spotify|cinema|show|ingresso|shopee|roupa|calcado|sapato|jogo|steam|xbox|playstation|bar|balada|festa|amazon': 'Lazer',
    'farmacia|remedio|medico|hospital|saude|plano de saude|dentista|psicol|terapia': 'Saúde',
    'aluguel|condominio|agua|luz|energia|internet|gas de cozinha|moradia|iptu|manutencao': 'Moradia',
    'faculdade|escola|curso|livro|mensalidade|material|educacao': 'Assinaturas',
    'investimento|aporte|tesouro|cdb|acoes|fundo|renda fixa|poupanca': 'Investimentos',
  };
  for (const [pattern, cat] of Object.entries(catMap)) {
    if (new RegExp(pattern).test(q)) return cat;
  }
  return null;
}

export function buildAssistantReply(rawText) {
  const q = normalizeText(rawText);
  const analytics = calculateAnalytics(state);
  const nick = state.profile?.nickname || state.profile?.displayName || '';
  const hasData = analytics.expenses > 0 || analytics.incomes > 0;

  // ── 1. Saudações ───────────────────────────────────────────────────────────
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|tudo bem|hey|hello|opa)\b/.test(q)) {
    const statusMsg = !hasData
      ? 'Percebi que ainda não há transações registradas. Comece adicionando uma receita ou despesa na aba **Conta**!'
      : `Você está com **${formatMoney(state.balance)}** em conta e score **${analytics.healthScore}/100**.`;
    return `Olá${nick ? ', ' + nick : ''}! Sou o **GrokFin**, seu assessor financeiro. ${statusMsg} Como posso ajudar?`;
  }

  // ── 2. Saldo e Patrimônio ──────────────────────────────────────────────────
  if (/saldo|quanto (tenho|tem)|caixa|dinheiro em conta|patrimonio|quanto (eu tenho|sobrou)/.test(q)) {
    const invTotal = (state.investments || []).reduce((a, i) => a + (i.value || 0), 0);
    const goalsTotal = (state.goals || []).reduce((a, g) => a + (g.atual || 0), 0);
    const patrimonio = state.balance + invTotal + goalsTotal;
    let msg = `Seu **saldo em conta** é **${formatMoney(state.balance)}**.`;
    if (analytics.net !== 0) {
      msg += ` O fluxo líquido deste mês está em **${formatMoney(analytics.net)}** (${analytics.net >= 0 ? '✅ positivo' : '⚠️ negativo'}).`;
    }
    if (invTotal > 0) msg += `\n\nSomando **investimentos** (${formatMoney(invTotal)}) e **reservas de metas** (${formatMoney(goalsTotal)}), seu patrimônio total estimado é **${formatMoney(patrimonio)}**.`;
    if (analytics.runwayMonths < 3 && analytics.burnDaily > 0) {
      msg += `\n\n⚠️ Atenção: com o ritmo atual, seu caixa dura **${analytics.runwayMonths.toFixed(1)} meses**. Considere revisar despesas.`;
    }
    return msg;
  }

  // ── 3. Receita / Renda ─────────────────────────────────────────────────────
  if (/receita|renda|salario|quanto (ganhei|entrou|recebi)|entrada|ganho/.test(q)) {
    const diff = analytics.incomes - analytics.lastMonthIncomes;
    let msg = `Sua **receita total** deste mês foi **${formatMoney(analytics.incomes)}**.`;
    if (analytics.lastMonthIncomes > 0) {
      const pct = ((diff / analytics.lastMonthIncomes) * 100).toFixed(1);
      msg += ` Comparado ao mês anterior (${formatMoney(analytics.lastMonthIncomes)}), isso representa **${diff >= 0 ? '+' : ''}${pct}%**.`;
    }
    return msg;
  }

  // ── 4. Gastos por categoria específica ────────────────────────────────────
  const matchedCat = detectCategoryInText(q);
  if (matchedCat && /gasto|despesa|custo|quanto (gastei|paguei)|gasto com/.test(q)) {
    const catValue = analytics.categories.find(([c]) => c === matchedCat)?.[1] || 0;
    const budget = (state.budgets || {})[matchedCat];
    const txCount = analytics.monthTransactions.filter(t => t.value < 0 && t.cat === matchedCat).length;
    let msg = `Você gastou **${formatMoney(catValue)}** em **${matchedCat}** este mês`;
    if (txCount) msg += ` (${txCount} transação${txCount > 1 ? 'ões' : ''})`;
    msg += '.';
    if (budget > 0) {
      const pct = (catValue / budget * 100).toFixed(0);
      msg += ` Orçamento: ${formatMoney(budget)} — ${catValue > budget ? '⚠️ **ESTOURADO**' : `${pct}% utilizado`}.`;
    }
    return msg;
  }

  // ── 5. Maior gasto / onde estou gastando ─────────────────────────────────
  if (/maior gasto|onde (estou|to) gastando|mais (gasto|despesa)|o que mais gast/.test(q)) {
    if (!analytics.categories.length) return 'Ainda não há despesas registradas neste mês. Adicione transações na aba **Conta**.';
    const top3 = analytics.categories.slice(0, 3);
    let msg = `**Seus maiores gastos do mês:**\n`;
    top3.forEach(([cat, val], i) => {
      const pct = analytics.expenses > 0 ? (val / analytics.expenses * 100).toFixed(0) : 0;
      msg += `\n${i + 1}. **${cat}**: ${formatMoney(val)} (${pct}% das despesas)`;
    });
    if (analytics.overspend) {
      msg += `\n\n⚠️ Alerta: **${analytics.overspend.cat}** ultrapassou o orçamento em **${formatMoney(Math.max(0, analytics.overspend.value - analytics.overspend.limit))}**.`;
    }
    return msg;
  }

  // ── 6. Orçamento ──────────────────────────────────────────────────────────
  if (/orcamento|budget|limite (de gasto|mensal)|teto|estourou|quanto posso gastar/.test(q)) {
    const budgets = Object.entries(state.budgets || {}).filter(([, v]) => v > 0);
    if (!budgets.length) return 'Você ainda não configurou nenhum orçamento. Defina limites por categoria na aba **Conta**.';
    const lines = analytics.budgetUse.filter(b => b.limit).map(b => {
      const pct = (b.ratio * 100).toFixed(0);
      const status = b.ratio > 1 ? '🔴' : b.ratio > 0.8 ? '🟡' : '🟢';
      return `${status} **${b.cat}**: ${formatMoney(b.value)} / ${formatMoney(b.limit)} (${pct}%)`;
    });
    return `**Status dos orçamentos deste mês:**\n\n${lines.join('\n')}${analytics.overspend ? `\n\n⚠️ **${analytics.overspend.cat}** estourou. Considere revisar.` : '\n\n✅ Todos os orçamentos sob controle!'}`;
  }

  // ── 7. Metas ──────────────────────────────────────────────────────────────
  if (/meta|objetivo|guardar para|poupar para|quando (vou|consigo) (atingir|alcançar)|acelerar|sonho/.test(q)) {
    if (!state.goals?.length) return 'Você não tem metas cadastradas. Crie um objetivo na aba **Metas**!';
    if (analytics.urgentGoal) {
      const g = analytics.urgentGoal;
      const deadlineLabel = g.deadline ? `prazo: ${new Date(g.deadline).toLocaleDateString('pt-BR')}` : 'sem prazo';
      let msg = `Sua meta mais urgente é **"${g.nome}"**:\n\n• Progresso: **${g.progress}%** (${formatMoney(g.atual || 0)} de ${formatMoney(g.total || 0)})\n• Faltam: **${formatMoney(g.remaining)}** (${deadlineLabel})\n• Aporte ideal: **${formatMoney(g.monthlyNeed)}/mês**`;
      if ((state.goals || []).length > 1) msg += `\n\nVocê tem **${state.goals.length} metas** no total. Quer detalhes de outra?`;
      return msg;
    }
    return '🎉 Todas as suas metas estão concluídas! Quer criar um novo objetivo?';
  }

  // ── 8. Cartões ────────────────────────────────────────────────────────────
  if (/cartao|fatura|credito|limite (do|de) cart|card/.test(q)) {
    const cards = state.cards || [];
    if (!cards.length) return 'Você não tem cartões cadastrados. Adicione na aba **Cartões**.';
    const sorted = [...cards].sort((a, b) => (b.used || 0) - (a.used || 0));
    let msg = `**Situação dos seus cartões:**\n`;
    sorted.forEach(c => {
      const usado = c.used || 0;
      const limite = c.limit || 0;
      const pct = limite > 0 ? (usado / limite * 100).toFixed(0) : 0;
      const status = pct > 80 ? '🔴' : pct > 50 ? '🟡' : '🟢';
      msg += `\n${status} **${c.name}**: ${formatMoney(usado)} / ${formatMoney(limite)} (${pct}%)`;
    });
    return msg;
  }

  // ── 9. Comparativo mês a mês ──────────────────────────────────────────────
  if (/comparado|mes passado|anterior|esse mes vs|variacao|mudou esse mes/.test(q)) {
    if (!analytics.lastMonthExpenses && !analytics.lastMonthIncomes) return 'Ainda não há dados do mês anterior para comparar.';
    const expDiff = analytics.expenses - analytics.lastMonthExpenses;
    const incDiff = analytics.incomes - analytics.lastMonthIncomes;
    const expPct = analytics.lastMonthExpenses > 0 ? (expDiff / analytics.lastMonthExpenses * 100).toFixed(1) : null;
    const incPct = analytics.lastMonthIncomes > 0 ? (incDiff / analytics.lastMonthIncomes * 100).toFixed(1) : null;
    let msg = `**Comparativo com o mês anterior:**\n\n`;
    msg += `• Receitas: **${formatMoney(analytics.incomes)}** ${incPct ? `(${incDiff >= 0 ? '+' : ''}${incPct}%)` : ''}\n`;
    msg += `• Despesas: **${formatMoney(analytics.expenses)}** ${expPct ? `(${expDiff >= 0 ? '+' : ''}${expPct}% ${expDiff >= 0 ? '📈' : '📉'})` : ''}\n`;
    msg += `• Fluxo: **${formatMoney(analytics.net)}**`;
    return msg;
  }

  // ── 10. Investimentos ─────────────────────────────────────────────────────
  if (/invest(imento)?|aplicacao|carteira|renda fixa|acoes|fundo|tesouro|cdb/.test(q)) {
    const invs = state.investments || [];
    if (!invs.length) return 'Você não tem investimentos cadastrados. Adicione suas aplicações na aba **Invest.**.';
    const total = invs.reduce((a, i) => a + (i.value || 0), 0);
    let msg = `**Sua carteira:** Total aplicado: **${formatMoney(total)}**\n`;
    invs.slice(0, 5).forEach(inv => {
      const pct = total > 0 ? (inv.value / total * 100).toFixed(1) : 0;
      msg += `\n• **${inv.name || 'Investimento'}**: ${formatMoney(inv.value || 0)} (${pct}%)`;
    });
    return msg;
  }

  // ── 11. Câmbio / crypto ───────────────────────────────────────────────────
  if (/dolar|usd|euro|eur|btc|bitcoin|cambio|crypto/.test(q)) {
    const ex = state.exchange || {};
    const trend = ex.trend || {};
    let msg = `**Cotações em tempo real:**\n\n`;
    if (ex.usd) msg += `🇺🇸 **Dólar:** R$ ${ex.usd}${trend.usd ? ` (${trend.usd > 0 ? '+' : ''}${trend.usd}% hoje)` : ''}\n`;
    if (ex.eur) msg += `🇪🇺 **Euro:** R$ ${ex.eur}${trend.eur ? ` (${trend.eur > 0 ? '+' : ''}${trend.eur}% hoje)` : ''}\n`;
    if (ex.btc) msg += `₿ **Bitcoin:** R$ ${Number(ex.btc).toLocaleString('pt-BR')}${trend.btc ? ` (${trend.btc > 0 ? '+' : ''}${trend.btc}% hoje)` : ''}`;
    return msg;
  }

  // ── 12. Score / Saúde financeira ──────────────────────────────────────────
  if (/score|saude financeira|nota|pontuacao|avaliacao|como estou financeiramente/.test(q)) {
    const { healthScore, scoreBreakdown } = analytics;
    const caption = healthScore >= 82 ? '🏆 Excelente' : healthScore >= 68 ? '✅ Bom' : healthScore >= 50 ? '⚠️ Atenção' : '🔴 Crítico';
    let msg = `${caption} — seu **score** é **${healthScore}/100**.\n\n**Composição:**\n`;
    msg += `• Poupança: +${scoreBreakdown?.saving ?? 0} pts (${formatPercent(analytics.savingRate, 1)} poupada)\n`;
    msg += `• Runway: +${scoreBreakdown?.runway ?? 0} pts (${analytics.runwayMonths.toFixed(1)} meses)\n`;
    msg += `• Metas: +${scoreBreakdown?.goals ?? 0} pts\n`;
    msg += `• Orçamento: ${scoreBreakdown?.budget >= 0 ? '+' : ''}${scoreBreakdown?.budget ?? 0} pts`;
    return msg;
  }

  // ── 13. Runway / Burn rate ────────────────────────────────────────────────
  if (/runway|burn|folego|quantos meses|caixa dura|aguentar/.test(q)) {
    let msg = `**Análise de Runway:**\n\n`;
    msg += `• Burn diário: **${formatMoney(analytics.burnDaily)}/dia**\n`;
    msg += `• Burn mensal estimado: **${formatMoney(analytics.burnDaily * 30)}/mês**\n`;
    msg += `• Saldo: **${formatMoney(state.balance)}**\n`;
    msg += `• **Fôlego atual: ${analytics.runwayMonths.toFixed(1)} meses**`;
    if (analytics.runwayMonths < 3) {
      msg += '\n\n🚨 **Zona de risco!** Recomendo construir uma reserva de emergência de pelo menos 6 meses.';
    } else if (analytics.runwayMonths >= 6) {
      msg += '\n\n✅ Boa reserva! Acima de 6 meses é o ideal para emergências.';
    }
    return msg;
  }

  // ── 14. Despesas fixas ────────────────────────────────────────────────────
  if (/fixo|recorrente|conta fixa|vence|mensalidade de conta|compromisso/.test(q)) {
    const fixed = (state.fixedExpenses || []).filter(e => e.active !== false);
    if (!fixed.length) return 'Você não tem despesas fixas cadastradas. Adicione contas recorrentes no seu perfil para eu monitorá-las automaticamente.';
    const out = fixed.filter(e => !e.isIncome);
    const totalOut = out.reduce((a, e) => a + Math.abs(e.value), 0);
    let msg = `**Compromissos fixos:** Total saídas: **${formatMoney(totalOut)}/mês**\n`;
    out.forEach(e => { msg += `\n• ${e.name}: ${formatMoney(Math.abs(e.value))}${e.day ? ` (dia ${e.day})` : ''}`; });
    if (analytics.nextFixedEvent) {
      const ev = analytics.nextFixedEvent;
      msg += `\n\n📅 Próximo: **${ev.name}** em **${ev.daysUntil === 0 ? 'hoje' : `${ev.daysUntil} dia(s)`}** (${formatMoney(Math.abs(ev.value))}).`;
    }
    return msg;
  }

  // ── 15. Diagnóstico completo ──────────────────────────────────────────────
  if (/relatorio|diagnostico|resumo|geral|overview|como estou|visao geral/.test(q)) {
    const invTotal = (state.investments || []).reduce((a, i) => a + (i.value || 0), 0);
    let msg = `**📊 Diagnóstico GrokFin — ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}**\n\n`;
    msg += `💰 **Saldo:** ${formatMoney(state.balance)}\n`;
    msg += `📈 **Receitas:** ${formatMoney(analytics.incomes)} | 📉 **Despesas:** ${formatMoney(analytics.expenses)}\n`;
    msg += `⚖️ **Fluxo:** ${formatMoney(analytics.net)} | 💾 **Poupança:** ${formatPercent(analytics.savingRate, 1)}\n`;
    msg += `🔥 **Burn:** ${formatMoney(analytics.burnDaily)}/dia | ⏳ **Runway:** ${analytics.runwayMonths.toFixed(1)} meses\n`;
    msg += `🏆 **Score:** ${analytics.healthScore}/100\n`;
    if (analytics.topCategory?.name) msg += `\n🎯 **Maior gasto:** ${analytics.topCategory.name} (${formatMoney(analytics.topCategory.value)})\n`;
    if (analytics.overspend) msg += `⚠️ **Alerta:** ${analytics.overspend.cat} estourou o orçamento.\n`;
    if (analytics.urgentGoal) msg += `🎯 **Meta urgente:** ${analytics.urgentGoal.nome} — ${analytics.urgentGoal.progress}% concluída.\n`;
    if (invTotal > 0) msg += `💼 **Investimentos:** ${formatMoney(invTotal)}\n`;
    return msg;
  }

  // ── 16. Dicas de economia ─────────────────────────────────────────────────
  if (/como econom|dica|cortar|poupar|como (reduzir|gastar menos)|onde (cortar|economizar)/.test(q)) {
    const tips = [];
    if (analytics.overspend) {
      const excess = Math.max(0, analytics.overspend.value - analytics.overspend.limit);
      tips.push(`🔴 **${analytics.overspend.cat}** estourou em **${formatMoney(excess)}** — cortar aqui é a ação de maior impacto.`);
    }
    if (analytics.topCategory?.value > analytics.incomes * 0.3 && analytics.incomes > 0) {
      tips.push(`📊 **${analytics.topCategory.name}** representa **${(analytics.topCategory.value / analytics.incomes * 100).toFixed(0)}%** da renda — acima do ideal de 30%.`);
    }
    if (analytics.savingRate < 10 && analytics.incomes > 0) {
      const needToSave = analytics.incomes * 0.2 - Math.max(0, analytics.net);
      tips.push(`💡 Para atingir 20% de poupança, reduza **${formatMoney(needToSave)}** dos gastos mensais.`);
    }
    if (!tips.length) return `✅ Seus gastos estão bem controlados! Taxa de poupança: **${formatPercent(analytics.savingRate, 1)}**. Avalie oportunidades de investimento para crescer o patrimônio.`;
    return tips.join('\n\n') + '\n\n_Posso detalhar qualquer categoria ou meta._';
  }

  // ── Default inteligente ───────────────────────────────────────────────────
  if (!hasData) {
    return `Olá${nick ? ', ' + nick : ''}! Ainda não vejo transações este mês. Comece na aba **Conta**, ou diga:\n\n• **"recebi 5000 de salário"** → registro automático\n• **"gastei 80 no mercado"** → despesa em Alimentação\n\nAssim eu posso te dar insights reais! 👋`;
  }
  const topTip = analytics.overspend
    ? `⚠️ Alerta: **${analytics.overspend.cat}** com ${formatPercent(analytics.overspend.ratio * 100, 0)} do orçamento utilizado.`
    : analytics.categories.length
      ? `Maior gasto: **${analytics.topCategory.name}** (${formatMoney(analytics.topCategory.value)}).`
      : `Fluxo do mês: **${formatMoney(analytics.net)}**.`;
  return `${topTip}\n\nScore: **${analytics.healthScore}/100** | Poupança: **${formatPercent(analytics.savingRate, 1)}** | Runway: **${analytics.runwayMonths.toFixed(1)} meses**.\n\nPosso detalhar: _gastos, metas, cartões, investimentos, comparativos, dicas..._`;
}

export function handleBotTransaction(text) {
  const l = text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos para matching

  // ── Detectar intent ───────────────────────────────────────────────────────
  const isIncome  = /recebi|ganhei|entrou|salario|deposito|renda/.test(l);
  const isExpense = /gastei|paguei|comprei|adicion(ei|e)|saiu|cobr|gastando/.test(l);
  if (!isIncome && !isExpense) return null;

  // ── Extrair valor — aceita "R$ 10", "10,50", "10.50", "10 reais", "10 conto"
  const valueMatch = text.match(/(?:R\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:reais?|conto[s]?)?/i);
  if (!valueMatch) return null;
  let val = parseCurrencyInput(valueMatch[1]);
  if (val <= 0) return null;
  if (isExpense) val = -val;

  // ── Detectar forma de pagamento — usa o schema do transactions-ui ──────────
  // transactions-ui espera: 'cartao_credito' | 'cartao_debito' | 'pix' | 'dinheiro' | 'conta'
  let payment = 'conta';
  if (/cart(a|ã)o|credito|cr[eé]dito/.test(l))   payment = 'cartao_credito';
  else if (/d[eé]bito/.test(l))                   payment = 'cartao_debito';
  else if (/pix/.test(l))                          payment = 'pix';
  else if (/dinheiro|esp[eé]cie|especie/.test(l)) payment = 'dinheiro';

  // Label humanizado para a resposta do chat
  const PAYMENT_LABEL = {
    cartao_credito: 'cartão de crédito',
    cartao_debito:  'débito',
    pix:            'Pix',
    dinheiro:       'dinheiro',
    conta:          '',
  };

  // ── Detectar data relativa ────────────────────────────────────────────────
  let txDate = new Intl.DateTimeFormat('pt-BR').format(new Date());
  if (/ontem/.test(l)) {
    const d = new Date(); d.setDate(d.getDate() - 1);
    txDate = new Intl.DateTimeFormat('pt-BR').format(d);
  } else if (/anteontem/.test(l)) {
    const d = new Date(); d.setDate(d.getDate() - 2);
    txDate = new Intl.DateTimeFormat('pt-BR').format(d);
  }

  // ── Detectar categoria ────────────────────────────────────────────────────
  let cat = isIncome ? 'Receita' : 'Rotina';
  const catRules = [
    [/mercado|ifood|comida|padaria|supermercado|pao|fruta|lanche|almoco|jantar|cafe|pizza|hamburguer|acougue|hortifruti/, 'Alimentação'],
    [/uber|99|taxi|gas(olina)?|combustivel|posto|onibus|metro|brt|trem|transporte|passagem|pedágio|pedagio/, 'Transporte'],
    [/netflix|spotify|cinema|show|ingresso|shopee|roupa|calcado|sapato|lazer|jogo|steam|xbox|playstation|bar|balada|festa|amazon|magazine|americanas/, 'Lazer'],
    [/farmacia|remedio|medico|hospital|saude|plano de saude|dentista|psicol|terapia/, 'Saúde'],
    [/aluguel|condominio|agua|luz|energia|internet|gas|moradia|iptu|manutencao|reforma/, 'Moradia'],
    [/salario|freelance|renda|receita|bonus|dividendo|aluguel recebido|comissao/, 'Receita'],
    [/faculdade|escola|curso|livro|mensalidade|material/, 'Assinaturas'],
    [/investimento|aporte|tesouro|cdb|acoes|fundo/, 'Investimentos'],
  ];
  for (const [regex, category] of catRules) {
    if (regex.test(l)) { cat = category; break; }
  }

  // ── Extrair descrição limpando artefatos ──────────────────────────────────
  let desc = text
    .replace(/(recebi|ganhei|entrou|gastei|paguei|comprei|adicionei|adicione|saiu)/gi, '')
    .replace(/R?\$?\s*\d+(?:[.,]\d{1,2})?\s*(?:reais?|contos?)?/gi, '')
    .replace(/\b(no|na|com|de|em|pra|pelo|pela|num|numa|uns?|umas?|cartao|cartão|credito|débito|debito|pix|dinheiro|ontem|hoje|anteontem|reais|conto)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!desc || desc.length < 2) desc = isIncome ? 'Receita via chat' : 'Despesa via chat';
  desc = desc.charAt(0).toUpperCase() + desc.slice(1);

  // ── Montar transação e salvar ─────────────────────────────────────────────
  const tx = {
    id: uid('tx'),
    desc,
    value: val,
    cat,
    payment,        // campo canônico esperado por transactions-ui
    date: txDate,
  };

  if (!state.transactions) state.transactions = [];
  state.transactions.unshift(tx); // mais recente primeiro
  state.balance += val;
  saveState();
  if (typeof window.appRenderAll === 'function') window.appRenderAll();

  // ── Montar resposta humanizada ────────────────────────────────────────────
  const emoji       = isIncome ? '💰' : '📝';
  const verb        = isIncome ? 'receita' : 'despesa';
  const methodLabel = PAYMENT_LABEL[payment] ? ` via **${PAYMENT_LABEL[payment]}**` : '';
  const dateLabel   = txDate !== new Intl.DateTimeFormat('pt-BR').format(new Date())
    ? ` (data: **${txDate}**)` : '';

  return `${emoji} Registrei ${verb}: **${desc}** — **${formatMoney(Math.abs(val))}**${methodLabel} em **${cat}**${dateLabel}. Saldo atualizado: **${formatMoney(state.balance)}**.`;
}

// Rate limiter: máx 10 mensagens por minuto para prevenir custos excessivos na API
const _chatRateLog = [];
function checkChatRateLimit() {
  const now = Date.now();
  // Remove entradas com mais de 60 segundos
  while (_chatRateLog.length && now - _chatRateLog[0] > 60000) _chatRateLog.shift();
  if (_chatRateLog.length >= 10) return false;
  _chatRateLog.push(now);
  return true;
}

export async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input?.value.trim();
  if (!text) return;

  if (!checkChatRateLimit()) {
    showToast('Muitas mensagens! Aguarde um momento.', 'danger');
    return;
  }

  pushChatMessage('user', text);
  input.value = '';
  setChatTyping(true);

  // ── Tentativa 1: Registrar transação via linguagem natural ────────────────
  const txReply = handleBotTransaction(text);
  if (txReply) {
    setChatTyping(false);
    pushChatMessage('assistant', txReply);
    return;
  }

  // ── Tentativa 2: Motor de inteligência local ──────────────────────────────
  setTimeout(() => {
    const reply = buildAssistantReply(text);
    setChatTyping(false);
    pushChatMessage('assistant', reply);
  }, 480);
}

export async function sendClaudeAPIMessage(userText, apiKey) {
  if (getAIProvider(apiKey) === 'gemini') {
    return await sendGeminiMessage(userText, apiKey);
  }
  
  const analytics = calculateAnalytics(state);
  const recentTxs = state.transactions.slice(0, 10).map(t =>
    `${t.date} | ${t.desc} | ${t.cat} | ${t.value >= 0 ? '+' : ''}R$${Math.abs(t.value).toFixed(2)}`
  ).join('\n');

  const budgetCtx = Object.entries(state.budgets || {})
    .filter(([, v]) => v > 0)
    .map(([cat, lim]) => {
      const spent = analytics.categories.find(([c]) => c === cat)?.[1] || 0;
      return `  • ${cat}: R$${spent.toFixed(2)} gasto / R$${lim.toFixed(2)} limite (${Math.round((spent/lim)*100)}%)`;
    }).join('\n') || '  Sem orçamentos definidos';

  const goalsCtx = (state.goals || []).map(g =>
    `  • ${g.nome}: ${Math.round((g.atual/g.total)*100)}% (R$${g.atual.toFixed(2)} / R$${g.total.toFixed(2)})`
  ).join('\n') || '  Sem metas ativas';

  const cardsCtx = (state.cards || []).map(c =>
    `  • ${c.name} [${c.cardType}]: R$${(c.used||0).toFixed(2)} / limite R$${c.limit.toFixed(2)}`
  ).join('\n') || '  Sem cartões';

  const systemPrompt = [
    'Você é o GrokFin Elite, assessor financeiro integrado ao app do usuário.',
    'REGRA CRÍTICA: Use SEMPRE os dados abaixo. Nunca invente números.',
    'Seja direto e específico. Máximo 3 parágrafos. Use **negrito** para valores.',
    'Responda em português do Brasil.',
    '',
    '## DADOS FINANCEIROS',
    `Saldo: R$${state.balance.toFixed(2)}`,
    `Receita/mês: R$${analytics.incomes.toFixed(2)} | Despesas: R$${analytics.expenses.toFixed(2)}`,
    `Fluxo: R$${analytics.net.toFixed(2)} | Poupança: ${analytics.savingRate.toFixed(1)}%`,
    `Score: ${analytics.healthScore}/100 | Burn/dia: R$${analytics.burnDaily.toFixed(2)} | Runway: ${analytics.runwayMonths.toFixed(1)}m`,
    `Maior gasto: ${analytics.topCategory.name} (R$${analytics.topCategory.value.toFixed(2)})`,
    `USD: R$${state.exchange.usd} | EUR: R$${state.exchange.eur}`,
    '',
    '## ORÇAMENTOS', budgetCtx,
    '', '## METAS', goalsCtx,
    '', '## CARTÕES', cardsCtx,
    '', '## ÚLTIMAS TRANSAÇÕES', recentTxs
  ].join('\n');

  const messages = [
    ...state.chatHistory.slice(-6).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: userText }
  ];
  const data = await callAIProxy({
    provider: 'claude',
    apiKey,
    mode: 'text',
    payload: { model: 'claude-haiku-4-5-20251001', max_tokens: 512, system: systemPrompt, messages }
  });
  return data?.content?.[0]?.text || data?.text || 'Sem resposta da IA.';
}

// ── Detecção de provedor centralizada ────────────────────────────────────────
// Evita o antipadrão de apiKey.startsWith('AIza') espalhado por todo o arquivo.
export function getAIProvider(key) {
  if (!key) return 'none';
  if (key.startsWith('AIza'))   return 'gemini';
  if (key.startsWith('sk-ant-')) return 'claude';
  return 'unknown';
}

export async function sendGeminiImageMessage(base64, mimeType, apiKey) {
  const data = await callAIProxy({
    provider: 'gemini',
    apiKey,
    mode: 'image',
    base64,
    mimeType
  });
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Não consegui ler a imagem.';
}

// ── Análise de imagem via Claude Vision API ───────────────────────────────────
export async function sendClaudeImageMessage(base64, mimeType, apiKey) {
  const data = await callAIProxy({
    provider: 'claude',
    apiKey,
    mode: 'image',
    base64,
    mimeType
  });
  return data?.content?.[0]?.text || data?.text || 'Não consegui ler a imagem.';
}

export function handleChatImageInput(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validar tipo de arquivo
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!ALLOWED.includes(file.type)) {
    showToast('Formato não suportado. Use JPG, PNG ou WEBP.', 'danger');
    return;
  }
  // Validar tamanho (max 4MB)
  if (file.size > 4 * 1024 * 1024) {
    showToast('Imagem muito grande. Máximo 4 MB.', 'danger');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const base64Part = evt.target.result.split(',')[1];
    const displayName = file.name.length > 28
      ? file.name.slice(0, 25) + '…'
      : file.name;
    pushChatMessage('user', `📎 **Comprovante anexado:** ${displayName}`);
    setChatTyping(true);

    const apiKey   = localStorage.getItem('grokfin_anthropic_key');
    const provider = getAIProvider(apiKey);

    try {
      let reply;
      if (provider === 'gemini') {
        reply = await sendGeminiImageMessage(base64Part, file.type, apiKey);
      } else if (provider === 'claude') {
        reply = await sendClaudeImageMessage(base64Part, file.type, apiKey);
      } else {
        reply = '⚠️ Configure uma chave de API para analisar imagens.\n\n'
          + '**Gemini** (gratuito): chave começa com `AIza` — obtenha em aistudio.google.com\n'
          + '**Claude** (pago): chave começa com `sk-ant-` — obtenha em console.anthropic.com';
      }
      setChatTyping(false);
      pushChatMessage('assistant', reply);

      // Se a resposta da IA sugerir um comando de registro, oferecer atalho
      const suggestedCommand = reply.match(/[Gg]astei[^.!?]*/);
      if (suggestedCommand) {
        setTimeout(() => {
          const input = document.getElementById('chat-input');
          if (input && !input.value) {
            input.value = suggestedCommand[0].trim();
            input.focus();
            showToast('💡 Sugestão preenchida — confirme ou edite antes de enviar', 'success');
          }
        }, 400);
      }
    } catch (err) {
      setChatTyping(false);
      pushChatMessage('assistant', `⚠️ Erro ao analisar imagem: ${err.message}`);
    }
  };
  reader.readAsDataURL(file);
  // Limpar input para permitir reenvio da mesma imagem
  e.target.value = '';
}

export function bindChatEvents() {
  const btn = document.getElementById('chat-send-btn');
  const input = document.getElementById('chat-input');
  const fileInput = document.getElementById('file-upload');
  
  if (btn) btn.addEventListener('click', sendChatMessage);
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); }
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', handleChatImageInput);
  }

  // Eventos de toggle do AI Side Panel
  const triggerBtn = document.getElementById('ai-panel-trigger');
  const closeBtn = document.getElementById('ai-panel-close');
  const backdrop = document.getElementById('ai-panel-backdrop');

  triggerBtn?.addEventListener('click', () => window.toggleAiSidePanel(true));
  closeBtn?.addEventListener('click', () => window.toggleAiSidePanel(false));
  backdrop?.addEventListener('click', () => window.toggleAiSidePanel(false));


  // [FIX #5] Transcrição de áudio via SpeechRecognition (Web Speech API)
  const micBtn = document.getElementById('chat-mic-btn');
  const micIcon = document.getElementById('chat-mic-icon');
  if (micBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.title = 'Transcrição de áudio não suportada neste navegador (use Chrome)';
      micBtn.style.opacity = '0.4';
      micBtn.style.cursor = 'not-allowed';
    } else {
      let recognition = null;
      let isListening = false;

      micBtn.addEventListener('click', () => {
        if (isListening) {
          recognition?.stop();
          return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          isListening = true;
          micBtn.classList.add('recording');
          if (micIcon) { micIcon.className = 'fa-solid fa-stop'; }
          micBtn.title = 'Gravando… clique para parar';
        };

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          if (input) {
            input.value = transcript;
            input.focus();
          }
          showToast(`🎙️ "${transcript.slice(0, 40)}${transcript.length > 40 ? '…' : ''}"`, 'success');
        };

        recognition.onerror = (event) => {
          const msgs = { 'not-allowed': 'Permissão de microfone negada.', 'no-speech': 'Nenhuma fala detectada.', 'network': 'Erro de rede.' };
          showToast(msgs[event.error] || `Erro: ${event.error}`, 'danger');
        };

        recognition.onend = () => {
          isListening = false;
          micBtn.classList.remove('recording');
          if (micIcon) { micIcon.className = 'fa-solid fa-microphone'; }
          micBtn.title = 'Gravar áudio';
        };

        recognition.start();
      });
    }
  }

  // ── Tecla ESC fecha o painel ─────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const panel = document.getElementById('ai-side-panel');
      if (panel && !panel.classList.contains('translate-x-full')) {
        window.toggleAiSidePanel(false);
      }
    }
  });

  // ── Event Delegation para botões injetados dinamicamente ─────────────────
  // [FIX] Usa delegação de eventos no contêiner pai (#ai-side-panel) para
  // capturar cliques em [data-chat-prompt] gerados pelo buildContextualSuggestions().
  // O querySelectorAll anterior não capturava botões criados após o bindChatEvents().
  const panel = document.getElementById('ai-side-panel');
  if (panel) {
    panel.addEventListener('click', e => {
      const promptBtn = e.target.closest('[data-chat-prompt]');
      if (promptBtn) {
        const prompt = promptBtn.dataset.chatPrompt;
        if (prompt) sendChatPrompt(prompt);
        return;
      }
      const actionBtn = e.target.closest('[data-quick-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.quickAction;
        if (action === 'open-transactions') window.switchTab?.(2);
        if (action === 'open-report') window.switchTab?.(1);
      }
    });
  }
}

// [FIX #6] sendChatPrompt: função para acionar o chat programaticamente.
// Era referenciada em goals-ui.js como window.sendChatPrompt mas nunca havia
// sido definida em nenhum arquivo, causando erro silencioso ao clicar em
// "Briefing IA" em uma meta. A função injeta o texto no input do chat e dispara
// o envio, tornando o atalho de metas funcional.
export function sendChatPrompt(text) {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.value = String(text || '').trim();
  window.toggleAiSidePanel(true);
  sendChatMessage();
}

// Expõe globalmente para uso via window.sendChatPrompt (ex: goals-ui.js)
window.sendChatPrompt = sendChatPrompt;
