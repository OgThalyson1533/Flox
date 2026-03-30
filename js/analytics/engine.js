/**
 * js/analytics/engine.js — GrokFin Elite v3
 *
 * Melhorias vs v2:
 * - Memoização de calculateAnalytics (evita recálculo em renders repetidos do mesmo frame)
 * - getReferenceDate usa "hoje" se não houver transações no mês atual (antes travava no mês da última tx)
 * - burnDaily normalizado por dias_no_mes, não por dia_atual (evita distorção no início do mês)
 * - Novos indicadores: trend3m (tendência de 3 meses), scoreBreakdown (detalha de onde vem o healthScore),
 *   nextFixedEvent (próximo vencimento fixo), volatility (desvio padrão de gastos mensais)
 * - buildSmartInsights: insights não se repetem e têm prioridade dinâmica por severidade
 * - processRecurrences: data em DD/MM/YYYY, isIncome respeitado (já corrigido em v2)
 */

import { parseDateBR, addMonths } from '../utils/date.js';
import { formatMoney, formatNumber, formatPercent } from '../utils/format.js';
import { clamp, uid } from '../utils/math.js';

// ── Period helpers ────────────────────────────────────────────────────────────

/**
 * Returns { start, end } Date objects for a given homeFilter period.
 */
export function getPeriodRange(filter = 'this_month', refDate = null) {
  const today = refDate || new Date();
  const y = today.getFullYear();
  const m = today.getMonth();

  switch (filter) {
    case 'last_month':
      return {
        start: new Date(y, m - 1, 1),
        end:   new Date(y, m, 0, 23, 59, 59)
      };
    case '3_months':
      return {
        start: new Date(y, m - 2, 1),
        end:   new Date(y, m + 1, 0, 23, 59, 59)
      };
    case '6_months':
      return {
        start: new Date(y, m - 5, 1),
        end:   new Date(y, m + 1, 0, 23, 59, 59)
      };
    case 'this_year':
      return {
        start: new Date(y, 0, 1),
        end:   new Date(y, 11, 31, 23, 59, 59)
      };
    case 'this_month':
    default:
      return {
        start: new Date(y, m, 1),
        end:   new Date(y, m + 1, 0, 23, 59, 59)
      };
  }
}

/**
 * Returns the "previous" equivalent range to compare against.
 */
export function getPreviousPeriodRange(filter = 'this_month', refDate = null) {
  const today = refDate || new Date();
  const y = today.getFullYear();
  const m = today.getMonth();

  switch (filter) {
    case 'last_month': // prev = 2 months ago
      return { start: new Date(y, m - 2, 1), end: new Date(y, m - 1, 0, 23, 59, 59) };
    case '3_months':  // prev = 6–3 months ago
      return { start: new Date(y, m - 5, 1), end: new Date(y, m - 2, 0, 23, 59, 59) };
    case '6_months':  // prev = 12–6 months ago
      return { start: new Date(y, m - 11, 1), end: new Date(y, m - 5, 0, 23, 59, 59) };
    case 'this_year': // prev = last year
      return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31, 23, 59, 59) };
    case 'this_month': // prev = last month
    default:
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameMonth(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function diffMonths(from, to) {
  return Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1);
}

// ── Memoização ────────────────────────────────────────────────────────────────
// Evita recalcular em múltiplos renders no mesmo frame (renderAll chama várias funções)

let _memoKey = null;
let _memoResult = null;

function memoKey(state) {
  return (state.transactions?.length || 0) + '|' +
         (state.goals?.length || 0) + '|' +
         (state.balance || 0) + '|' +
         (state.lastUpdated || '');
}

// ── getReferenceDate ──────────────────────────────────────────────────────────

/**
 * Retorna a data de referência para o mês atual.
 * v3: sempre usa o mês corrente se houver qualquer transação nele,
 * caso contrário cai para o mês da última transação — evitando que o
 * dashboard "congele" no mês passado quando não há lançamentos ainda.
 */
export function getReferenceDate(state) {
  const today = new Date();
  if (!state?.transactions?.length) return today;

  const hasThisMonth = state.transactions.some(t => {
    const d = parseDateBR(t.date);
    return d && sameMonth(d, today);
  });
  if (hasThisMonth) return today;

  // Fallback: mês da transação mais recente
  const timestamps = state.transactions
    .map(t => parseDateBR(t.date))
    .filter(Boolean)
    .map(d => d.getTime());
  return timestamps.length ? new Date(Math.max(...timestamps)) : today;
}

// ── Meta helpers ──────────────────────────────────────────────────────────────

export function getGoalProgress(goal) {
  const atual = Number(goal.atual ?? goal.current ?? 0);
  const total = Number(goal.total ?? goal.target ?? 0);
  if (!total) return 0;
  return clamp(Math.round((atual / total) * 100), 0, 100);
}

export function getMonthlyNeed(goal, refDate = new Date()) {
  const deadline = new Date(goal.deadline);
  const months = diffMonths(refDate, deadline);
  const remaining = Math.max(0, goal.total - goal.atual);
  return remaining === 0 ? 0 : Math.ceil(remaining / months);
}

// ── Health caption ────────────────────────────────────────────────────────────

export function getHealthCaption(score) {
  if (score >= 82) return 'Estrutura forte, metas respirando e boa folga de caixa.';
  if (score >= 68) return 'Bom equilíbrio, com alguns vazamentos pontuais para ajustar.';
  if (score >= 50) return 'Atenção: algumas categorias pedem revisão este mês.';
  return 'Mês ainda pede disciplina em categorias-chave.';
}

// ── calculateAnalytics ────────────────────────────────────────────────────────

export function calculateAnalytics(state) {
  // Memoização — evita recalcular múltiplas vezes no mesmo frame
  const key = memoKey(state);
  if (key === _memoKey && _memoResult) return _memoResult;

  const ref = getReferenceDate(state);

  const monthTransactions = state.transactions.filter(t => {
    const d = parseDateBR(t.date);
    return d && sameMonth(d, ref);
  });

  const incomes  = monthTransactions.filter(t => t.value > 0).reduce((acc, t) => acc + t.value, 0);
  const expenses = monthTransactions.filter(t => t.value < 0).reduce((acc, t) => acc + Math.abs(t.value), 0);
  const net      = incomes - expenses;

  // ── Mês anterior ─────────────────────────────────────────────────────────
  const lastMonthStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(ref.getFullYear(), ref.getMonth(), 0);
  let lastMonthIncomes = 0, lastMonthExpenses = 0;
  state.transactions.forEach(t => {
    const d = parseDateBR(t.date);
    if (d && d >= lastMonthStart && d <= lastMonthEnd) {
      if (t.value > 0) lastMonthIncomes += t.value;
      else lastMonthExpenses += Math.abs(t.value);
    }
  });

  // ── Categorias ───────────────────────────────────────────────────────────
  const expenseItems  = monthTransactions.filter(t => t.value < 0);
  const categoriesMap = expenseItems.reduce((acc, t) => {
    acc[t.cat] = (acc[t.cat] || 0) + Math.abs(t.value);
    return acc;
  }, {});
  const categoryEntries = Object.entries(categoriesMap).sort((a, b) => b[1] - a[1]);
  const topCategory = categoryEntries[0]
    ? { name: categoryEntries[0][0], value: categoryEntries[0][1] }
    : { name: 'Sem dados', value: 0 };

  // ── Burn / Runway ─────────────────────────────────────────────────────────
  // v3: normaliza pelo nº de dias do mês, não pelo dia atual
  // Isso evita que no dia 3 do mês o burnDaily apareça como 10x o real
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, ref.getDate());
  // Usa o mínimo entre daysElapsed e daysInMonth para não extrapolar
  const burnDaily    = expenses / Math.min(daysElapsed, daysInMonth);
  const runwayMonths = burnDaily > 0 ? state.balance / (burnDaily * 30) : 99;
  const savingRate   = incomes > 0 ? (net / incomes) * 100 : 0;
  const avgTicket    = expenseItems.length ? expenses / expenseItems.length : 0;

  // ── Orçamentos ────────────────────────────────────────────────────────────
  const budgetUse = categoryEntries.map(([cat, value]) => {
    const limit = state.budgets[cat] || null;
    return { cat, value, limit, ratio: limit ? value / limit : null };
  }).sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
  const overspend = budgetUse.find(item => item.ratio && item.ratio > 1) || null;

  // ── Metas ─────────────────────────────────────────────────────────────────
  const goalsProgress = state.goals.length
    ? state.goals.reduce((acc, goal) => acc + getGoalProgress(goal), 0) / state.goals.length
    : 0;

  // ── Health Score com breakdown ────────────────────────────────────────────
  const scoreSaving  = clamp((clamp(savingRate, -10, 35) + 10) * 1.4, 0, 63);
  const scoreRunway  = Math.min(runwayMonths, 12) * 2.1;
  const scoreGoals   = goalsProgress * 0.35;
  const scoreBudget  = overspend ? -8 : 6;
  const healthScore  = clamp(Math.round(scoreSaving + scoreRunway + scoreGoals + scoreBudget), 22, 98);

  // Breakdown exposto para o dashboard mostrar de onde vem o score
  const scoreBreakdown = {
    saving:  Math.round(scoreSaving),
    runway:  Math.round(scoreRunway),
    goals:   Math.round(scoreGoals),
    budget:  scoreBudget
  };

  // ── Tendência de gastos (7 dias) ──────────────────────────────────────────
  const recentExpense = state.transactions
    .filter(t => { const d = parseDateBR(t.date); return d && t.value < 0 && d >= addDays(ref, -7); })
    .reduce((acc, t) => acc + Math.abs(t.value), 0);

  const previousExpense = state.transactions
    .filter(t => { const d = parseDateBR(t.date); return d && t.value < 0 && d < addDays(ref, -7) && d >= addDays(ref, -14); })
    .reduce((acc, t) => acc + Math.abs(t.value), 0);

  const expenseTrend = previousExpense > 0
    ? ((recentExpense - previousExpense) / previousExpense) * 100
    : 0;

  // ── Tendência de 3 meses (novo) ───────────────────────────────────────────
  // Compara média de gastos dos últimos 3 meses vs 3 meses anteriores a esses
  const monthlyExpenses = [];
  for (let i = 0; i < 6; i++) {
    const mRef = addMonths(ref, -i);
    const mExp = state.transactions.filter(t => {
      const d = parseDateBR(t.date);
      return d && t.value < 0 && sameMonth(d, mRef);
    }).reduce((acc, t) => acc + Math.abs(t.value), 0);
    monthlyExpenses.push(mExp);
  }
  const avg3m     = (monthlyExpenses[0] + monthlyExpenses[1] + monthlyExpenses[2]) / 3;
  const avg3mPrev = (monthlyExpenses[3] + monthlyExpenses[4] + monthlyExpenses[5]) / 3;
  const trend3m   = avg3mPrev > 0 ? ((avg3m - avg3mPrev) / avg3mPrev) * 100 : 0;

  // ── Volatilidade mensal (desvio padrão de gastos) (novo) ─────────────────
  const meanExp = monthlyExpenses.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const variance = monthlyExpenses.slice(0, 3).reduce((acc, v) => acc + Math.pow(v - meanExp, 2), 0) / 3;
  const volatility = Math.sqrt(variance);

  // ── Próximo evento fixo (novo) ────────────────────────────────────────────
  const today = new Date();
  const todayDay = today.getDate();
  const nextFixedEvent = (state.fixedExpenses || [])
    .filter(f => f.active !== false && f.day)
    .map(f => {
      let daysUntil = f.day - todayDay;
      if (daysUntil < 0) daysUntil += daysInMonth;
      return { ...f, daysUntil };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)[0] || null;

  // ── Projeção 12 meses ─────────────────────────────────────────────────────
  const fixedMonthlyOut = (state.fixedExpenses || []).filter(e => !e.isIncome && e.active !== false).reduce((a, e) => a + Math.abs(e.value), 0);
  const fixedMonthlyIn  = (state.fixedExpenses || []).filter(e => e.isIncome  && e.active !== false).reduce((a, e) => a + Number(e.value), 0);
  const floatingExpenses = Math.max(0, expenses - fixedMonthlyOut);
  const baseMonthlyIncomes = incomes > 0 ? incomes : fixedMonthlyIn;
  const predictiveNet  = baseMonthlyIncomes - (fixedMonthlyOut + floatingExpenses);
  const monthlyPace    = predictiveNet !== 0 ? predictiveNet : net;

  const projection = [];
  let simulated = state.balance;
  for (let i = 0; i < 12; i++) {
    let monthlyFlow = monthlyPace;
    const futureDate = addMonths(ref, i + 1);
    const monthIndex = futureDate.getMonth();
    if (monthIndex === 0)  monthlyFlow -= Math.max(500, baseMonthlyIncomes * 0.15);
    if (monthIndex === 11) monthlyFlow += baseMonthlyIncomes * 0.7;
    simulated += monthlyFlow;
    projection.push({
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(futureDate),
      value: Math.round(simulated)
    });
  }

  // ── Metas detalhadas ──────────────────────────────────────────────────────
  const goalsDetailed = [...state.goals].map(goal => ({
    ...goal,
    progress:    getGoalProgress(goal),
    monthlyNeed: getMonthlyNeed(goal, ref),
    remaining:   Math.max(0, goal.total - goal.atual)
  }));

  const urgentGoal = goalsDetailed
    .filter(g => g.remaining > 0)
    .sort((a, b) => {
      if (a.monthlyNeed === b.monthlyNeed) return new Date(a.deadline) - new Date(b.deadline);
      return a.monthlyNeed - b.monthlyNeed;
    })[0] || null;

  const result = {
    ref, monthTransactions, incomes, expenses, net,
    lastMonthIncomes, lastMonthExpenses,
    categories: categoryEntries, topCategory,
    burnDaily, runwayMonths, savingRate, avgTicket,
    budgetUse, overspend, healthScore, scoreBreakdown,
    expenseTrend, trend3m, volatility,
    recentExpense, nextFixedEvent,
    projection, urgentGoal, goalsDetailed, goalsProgress
  };

  _memoKey = key;
  _memoResult = result;
  return result;
}

// ── buildPrimaryInsight ───────────────────────────────────────────────────────

export function buildPrimaryInsight(analytics, state) {
  if (analytics.overspend) {
    const item   = analytics.overspend;
    const exceed = Math.max(0, item.value - item.limit);
    const targetSaving = analytics.incomes > 0
      ? ((analytics.net + exceed) / analytics.incomes) * 100
      : analytics.savingRate;
    return {
      label:  `Filtrar ${item.cat}`,
      action: { type: 'filter-category', category: item.cat },
      text:   `Seu gasto em **${item.cat}** já consumiu **${formatPercent(item.ratio * 100, 0)}** do orçamento. Cortando **${formatMoney(exceed)}** a taxa de poupança pode subir para **${formatPercent(targetSaving, 1)}**.`
    };
  }

  if (analytics.urgentGoal) {
    const goal    = analytics.urgentGoal;
    const applied = Math.max(0, Math.round(Math.min(goal.monthlyNeed || 0, goal.remaining, Math.max(state.balance - 800, 0) || Math.min(state.balance, goal.remaining))));
    if (applied > 0) {
      return {
        label:  `Aportar ${formatMoney(applied)}`,
        action: { type: 'goal-contribution', goalId: goal.id, amount: applied },
        text:   `A meta **${goal.nome}** precisa de **${formatMoney(goal.monthlyNeed)}/mês**. Um aporte imediato de **${formatMoney(applied)}** antecipa a conclusão.`
      };
    }
  }

  // v3: usa trend3m no fallback se relevante
  if (Math.abs(analytics.trend3m) > 10) {
    const dir = analytics.trend3m > 0 ? 'subindo' : 'caindo';
    return {
      label:  'Ver diagnóstico',
      action: { type: 'open-report' },
      text:   `Seus gastos estão **${dir} ${formatPercent(Math.abs(analytics.trend3m), 0)}** nos últimos 3 meses. Fluxo líquido atual: **${formatMoney(analytics.net)}**.`
    };
  }

  return {
    label:  'Abrir relatório',
    action: { type: 'open-report' },
    text:   `Seu fluxo do mês está em **${formatMoney(analytics.net)}**, com runway de **${formatNumber(analytics.runwayMonths, 1)} meses**.`
  };
}

// ── buildSmartInsights ────────────────────────────────────────────────────────

export function buildSmartInsights(analytics, state) {
  const insights = [];
  const seen = new Set(); // evita insights duplicados

  const add = (type, icon, title, text, priority = 5) => {
    if (!seen.has(title)) { seen.add(title); insights.push({ type, icon, title, text, priority }); }
  };

  // ── Regra 50-30-20 ───────────────────────────────────────────────────────
  if (analytics.incomes > 0) {
    const wantsCats = ['Lazer', 'Assinaturas'];
    const needsCats = ['Moradia', 'Alimentação', 'Saúde', 'Transporte', 'Rotina'];
    let wantsTotal = 0, needsTotal = 0;
    analytics.categories.forEach(([cat, val]) => {
      if (wantsCats.includes(cat)) wantsTotal += val;
      if (needsCats.includes(cat)) needsTotal += val;
    });
    const wantsPct = (wantsTotal / analytics.incomes) * 100;
    const needsPct = (needsTotal / analytics.incomes) * 100;

    if (wantsPct > 30) {
      add('alert', '🎭', 'Lazer acima de 30%',
        `Gastos não-essenciais em ${formatPercent(wantsPct, 0)} da renda (ideal ≤ 30%). Revise assinaturas e saídas.`, 2);
    } else if (analytics.savingRate >= 20) {
      add('positive', '⚖️', 'Equilíbrio 50-30-20',
        'Lazer e investimentos estão em harmonia. Continue nesse ritmo.', 8);
    }

    if (needsPct > 55) {
      add('tip', '🏠', 'Custo fixo elevado',
        `Essenciais consomem ${formatPercent(needsPct, 0)} da renda (ideal ≤ 50%). Considere revisar contratos ou hábitos.`, 3);
    }
  }

  // ── Orçamento estourado ──────────────────────────────────────────────────
  if (analytics.overspend) {
    const excess = Math.max(0, analytics.overspend.value - analytics.overspend.limit);
    add('alert', '⚠️', `${analytics.overspend.cat} estourou`,
      `Orçamento ultrapassado em ${formatMoney(excess)} (${formatPercent(analytics.overspend.ratio * 100, 0)} do limite).`, 1);
  }

  // ── Taxa de poupança ─────────────────────────────────────────────────────
  if (analytics.savingRate >= 20) {
    add('positive', '🏆', 'Taxa de poupança saudável',
      `Poupando ${formatPercent(analytics.savingRate, 1)} da renda. Acima dos 20% ideais.`, 7);
  } else if (analytics.savingRate < 10 && analytics.incomes > 0) {
    add('alert', '📉', 'Taxa de poupança < 10%',
      `Taxa em ${formatPercent(analytics.savingRate, 1)}. Pelo menos 20% garante crescimento patrimonial consistente.`, 2);
  }

  // ── Tendência de 3 meses (novo) ──────────────────────────────────────────
  if (Math.abs(analytics.trend3m) > 15) {
    const rising = analytics.trend3m > 0;
    add(rising ? 'alert' : 'positive',
      rising ? '📈' : '📉',
      `Gastos ${rising ? 'crescendo' : 'reduzindo'} nos últimos 3 meses`,
      `Variação de ${formatPercent(Math.abs(analytics.trend3m), 0)} vs trimestre anterior. ${rising ? 'Avalie onde estão os vazamentos.' : 'Boa disciplina de cortes!'}`,
      rising ? 3 : 7);
  }

  // ── Volatilidade alta (novo) ─────────────────────────────────────────────
  if (analytics.volatility > analytics.expenses * 0.3 && analytics.expenses > 0) {
    add('tip', '🌊', 'Gastos irregulares',
      `Seus gastos mensais variam bastante (±${formatMoney(analytics.volatility)}). Priorizar gastos fixos ajuda a prever o caixa.`, 4);
  }

  // ── Próximo evento fixo (novo) ───────────────────────────────────────────
  if (analytics.nextFixedEvent && analytics.nextFixedEvent.daysUntil <= 5) {
    const ev = analytics.nextFixedEvent;
    add('tip', '📅', `${ev.name} vence em ${ev.daysUntil === 0 ? 'hoje' : `${ev.daysUntil} dia${ev.daysUntil > 1 ? 's' : ''}`}`,
      `${ev.isIncome ? 'Entrada' : 'Saída'} de ${formatMoney(ev.value)} programada. Verifique o saldo disponível.`, 2);
  }

  // ── Burn diário ──────────────────────────────────────────────────────────
  if (analytics.burnDaily > 0) {
    add('tip', '🔥', 'Burn diário',
      `Gasto médio de ${formatMoney(analytics.burnDaily)}/dia, runway de ${formatNumber(analytics.runwayMonths, 1)} meses.`, 6);
  }

  // ── Meta urgente ─────────────────────────────────────────────────────────
  if (analytics.urgentGoal) {
    const goal = analytics.urgentGoal;
    add('tip', '🎯', `Meta: ${goal.nome}`,
      `${goal.progress}% concluída. Aporte ideal: ${formatMoney(goal.monthlyNeed)}/mês para bater o prazo.`, 5);
  }

  // Ordena por prioridade (menor número = mais urgente) e limita a 4
  return insights.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

// ── processRecurrences ────────────────────────────────────────────────────────

export function processRecurrences(state) {
  if (!state.fixedExpenses?.length) return false;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
  if (state.lastCronRun === currentMonthKey) return false;

  let changesMade = false;

  state.fixedExpenses.forEach(exp => {
    // Verifica por data DD/MM/YYYY + flag recurringTemplate
    const alreadyLaunched = state.transactions.some(t => {
      const d = parseDateBR(t.date);
      if (!d) return false;
      return d.getFullYear() === now.getFullYear() &&
             d.getMonth() === now.getMonth() &&
             t.desc.toLowerCase() === exp.name.toLowerCase() &&
             !!t.recurringTemplate;
    });

    if (!alreadyLaunched && exp.value > 0) {
      const txDay   = String(exp.day || 1).padStart(2, '0');
      const txMonth = String(now.getMonth() + 1).padStart(2, '0');
      const txDate  = `${txDay}/${txMonth}/${now.getFullYear()}`;
      const val     = exp.isIncome ? Math.abs(exp.value) : -Math.abs(exp.value);

      state.transactions.push({
        id: uid('tx'),
        desc: exp.name,
        value: val,
        cat: exp.cat || exp.category || (exp.isIncome ? 'Receita' : 'Rotina'),
        date: txDate,
        payment: 'conta',
        recurringTemplate: true
      });
      state.balance += val;
      changesMade = true;
    }
  });

  state.lastCronRun = currentMonthKey;
  // Invalida memo após cron
  _memoKey = null;
  return changesMade;
}

// ── getPaymentMethodStats ─────────────────────────────────────────────────────

/**
 * Returns payment method breakdown for a set of transactions.
 * Returns { incomes: [{method, label, icon, value, pct}], expenses: [...] }
 */
export function getPaymentMethodStats(transactions) {
  const methodConfig = [
    { key: 'pix',          label: 'Pix',             icon: 'fa-bolt' },
    { key: 'credito',      label: 'Cartão Crédito',  icon: 'fa-credit-card' },
    { key: 'debito',       label: 'Cartão Débito',   icon: 'fa-card-blank' },
    { key: 'dinheiro',     label: 'Dinheiro',         icon: 'fa-money-bill' },
    { key: 'transferencia',label: 'Transferência',    icon: 'fa-arrow-right-arrow-left' },
    { key: 'boleto',       label: 'Boleto',           icon: 'fa-barcode' },
    { key: 'conta',        label: 'Débito Auto',      icon: 'fa-rotate' },
  ];

  const incomeMap  = {};
  const expenseMap = {};
  let totalIn  = 0;
  let totalOut = 0;

  transactions.forEach(t => {
    const method = (t.payment || 'outros').toLowerCase();
    if (t.value > 0) {
      incomeMap[method]  = (incomeMap[method]  || 0) + t.value;
      totalIn += t.value;
    } else {
      expenseMap[method] = (expenseMap[method] || 0) + Math.abs(t.value);
      totalOut += Math.abs(t.value);
    }
  });

  function buildList(map, total) {
    return Object.entries(map)
      .map(([key, value]) => {
        const cfg = methodConfig.find(m => m.key === key) ||
                    { key, label: key.charAt(0).toUpperCase() + key.slice(1), icon: 'fa-circle-question' };
        return { ...cfg, value, pct: total > 0 ? (value / total) * 100 : 0 };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }

  return {
    incomes:  buildList(incomeMap,  totalIn),
    expenses: buildList(expenseMap, totalOut),
    totalIn,
    totalOut
  };
}

// ── calculateAnalyticsForPeriod ───────────────────────────────────────────────

/**
 * Computes analytics metrics for an arbitrary date range.
 * Used by the Home tab period filter.
 */
export function calculateAnalyticsForPeriod(state, filter = 'this_month') {
  const ref = getReferenceDate(state);
  const { start, end }   = getPeriodRange(filter, ref);
  const { start: ps, end: pe } = getPreviousPeriodRange(filter, ref);

  function txInRange(t, s, e) {
    const d = parseDateBR(t.date);
    return d && d >= s && d <= e;
  }

  const current  = state.transactions.filter(t => txInRange(t, start, end));
  const previous = state.transactions.filter(t => txInRange(t, ps, pe));

  function summary(txList) {
    const incomes  = txList.filter(t => t.value > 0).reduce((a, t) => a + t.value, 0);
    const expenses = txList.filter(t => t.value < 0).reduce((a, t) => a + Math.abs(t.value), 0);
    const net      = incomes - expenses;
    const avgTicket = txList.filter(t => t.value < 0).length
      ? expenses / txList.filter(t => t.value < 0).length
      : 0;
    const categoriesMap = {};
    txList.filter(t => t.value < 0).forEach(t => {
      categoriesMap[t.cat] = (categoriesMap[t.cat] || 0) + Math.abs(t.value);
    });
    const categories = Object.entries(categoriesMap).sort((a, b) => b[1] - a[1]);
    return { incomes, expenses, net, avgTicket, categories };
  }

  const cur = summary(current);
  const prev = summary(previous);

  // payment methods
  const paymentStats = getPaymentMethodStats(current);

  // fixed costs in current period
  const fixedCosts = (state.fixedExpenses || [])
    .filter(e => !e.isIncome && e.active !== false)
    .reduce((a, e) => a + Math.abs(e.value), 0);
  const variableExpenses = Math.max(0, cur.expenses - fixedCosts);
  const surplus = Math.max(0, cur.incomes - cur.expenses);
  const expenseRatio = cur.incomes > 0 ? (cur.expenses / cur.incomes) * 100 : 0;

  // comparison chips
  function pctChange(curr, prev) {
    if (!prev) return null;
    return ((curr - prev) / prev) * 100;
  }

  const comparison = {
    incomes:  { current: cur.incomes,  previous: prev.incomes,  pct: pctChange(cur.incomes,  prev.incomes)  },
    expenses: { current: cur.expenses, previous: prev.expenses, pct: pctChange(cur.expenses, prev.expenses) },
    net:      { current: cur.net,      previous: prev.net,      pct: pctChange(cur.net,      prev.net)      },
    avgTicket:{ current: cur.avgTicket,previous: prev.avgTicket,pct: pctChange(cur.avgTicket,prev.avgTicket)},
  };

  return {
    ...cur,
    fixedCosts,
    variableExpenses,
    surplus,
    expenseRatio,
    paymentStats,
    comparison,
    period: { start, end, filter }
  };
}
