// js/ui/reports-ui.js

let activeRepTab = 'dre';
let reportChartRxV = null;
let reportChartCashflow = null;

// Formatters
const fmtMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const fmtPct = (val) => new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val / 100);

export function bindReportsEvents() {
  // The HTML buttons have class 'rep-tab-item' and ids like 'rep-tab-dre', 'rep-tab-rxv', etc.
  // They also have inline onclick="switchRepTab('...')" for the visual switching.
  // We hook into them to also update our module-level activeRepTab and re-render data.
  document.querySelectorAll('.rep-tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.id?.replace('rep-tab-', '');
      if (tabId) {
        activeRepTab = tabId;
        renderReports();
      }
    });
  });

  // Bind period comparisons
  const sA = document.getElementById('comp-period-a');
  const sB = document.getElementById('comp-period-b');
  if(sA) sA.addEventListener('change', () => renderReports());
  if(sB) sB.addEventListener('change', () => renderReports());
}

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthsRange(monthsBack) {
  const dates = [];
  const now = new Date(getCurrentPeriod() + '-01T00:00:00');
  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    dates.push({
      id: `${yyyy}-${mm}`,
      label: d.toLocaleString('pt-BR', { month: 'short', year: 'numeric' }).toUpperCase().replace('. de ', ' ')
    });
  }
  return dates;
}

function getTransactionsForPeriod(periodId) {
  const state = window.appState;
  const d = new Date(periodId + '-01T00:00:00');
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
  
  return (state.transactions || []).filter(t => {
    const td = new Date(t.date.split('/').reverse().join('-') + 'T00:00:00');
    return td >= start && td <= end;
  });
}

function getMonthlyAnalytics(state, periodId) {
  const txs = getTransactionsForPeriod(periodId);
  const incomes = txs.filter(t => t.value > 0).reduce((acc, t) => acc + t.value, 0);
  const expenses = txs.filter(t => t.value < 0).reduce((acc, t) => acc + Math.abs(t.value), 0);
  return { incomes, expenses, net: incomes - expenses };
}

function groupByCategory(txs, type) {
  const filtered = txs.filter(t => type === 'income' ? t.value > 0 : t.value < 0);
  const groups = {};
  filtered.forEach(t => {
    const v = Math.abs(t.value);
    if (!groups[t.category]) groups[t.category] = 0;
    groups[t.category] += v;
  });
  return Object.entries(groups).sort((a,b) => b[1] - a[1]);
}

export function renderReports() {
  const state = window.appState;
  if(!state || !state.transactions) return;

  if(activeRepTab === 'dre') renderDRE(state);
  else if(activeRepTab === 'rxv') renderRxV(state);
  else if(activeRepTab === 'cashflow') renderCashflow(state);
  else if(activeRepTab === 'comparison') renderComparison(state);
}

function renderDRE(state) {
  const tHead = document.getElementById('dre-table-head');
  const tBody = document.getElementById('dre-table-body');
  if(!tHead || !tBody) return;

  const months = getMonthsRange(2); // Last 3 months (month-2, month-1, current)
  
  // Update header
  tHead.innerHTML = `
    <th class="px-5 py-4 w-64 uppercase tracking-widest sticky bg-black border-r border-white/5 left-0 z-10">Conta</th>
    ${months.map(m => `<th class="px-5 py-4 text-right">${m.label}</th>`).join('')}
    <th class="px-5 py-4 text-right font-bold text-cyan-300">TOTAL</th>
  `;

  // Aggregate Data
  const dataMap = { incomes: {}, expenses: {}, totalIncomes: [0,0,0], totalExpenses: [0,0,0] };

  months.forEach((m, idx) => {
    const txs = getTransactionsForPeriod(m.id);
    const incGroups = groupByCategory(txs, 'income');
    const expGroups = groupByCategory(txs, 'expense');

    incGroups.forEach(([cat, val]) => {
      if(!dataMap.incomes[cat]) dataMap.incomes[cat] = [0,0,0];
      dataMap.incomes[cat][idx] = val;
      dataMap.totalIncomes[idx] += val;
    });

    expGroups.forEach(([cat, val]) => {
      if(!dataMap.expenses[cat]) dataMap.expenses[cat] = [0,0,0];
      dataMap.expenses[cat][idx] = val;
      dataMap.totalExpenses[idx] += val;
    });
  });

  const sumArray = (arr) => arr.reduce((a,b) => a+b, 0);

  let html = ``;

  // --- RECEITAS ---
  html += `
    <tr class="bg-white/[0.02]">
      <td class="px-5 py-3 font-bold text-emerald-400 sticky bg-[#131a20] border-r border-white/5 left-0 z-10 flex items-center gap-2">
        <button class="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-white/50"><i class="fa-solid fa-minus text-[10px]"></i></button>
        RECEITA BRUTA
      </td>
      ${dataMap.totalIncomes.map(v => `<td class="px-5 py-3 text-right text-emerald-300">${fmtMoney(v)}</td>`).join('')}
      <td class="px-5 py-3 text-right font-bold text-emerald-400 bg-emerald-400/5">${fmtMoney(sumArray(dataMap.totalIncomes))}</td>
    </tr>
  `;

  Object.entries(dataMap.incomes).sort((a,b) => sumArray(b[1]) - sumArray(a[1])).forEach(([cat, vals]) => {
    html += `
      <tr class="text-white/70">
        <td class="px-5 py-3 pl-12 sticky bg-black border-r border-white/5 left-0 z-10 w-64 truncate max-w-[250px]" title="${cat}">${cat}</td>
        ${vals.map(v => `<td class="px-5 py-3 text-right">${fmtMoney(v)}</td>`).join('')}
        <td class="px-5 py-3 text-right font-semibold text-white bg-white/5">${fmtMoney(sumArray(vals))}</td>
      </tr>
    `;
  });

  // --- DESPESAS ---
  html += `
    <tr class="bg-white/[0.02]">
      <td class="px-5 py-3 font-bold text-rose-400 sticky bg-[#1a141a] border-r border-white/5 left-0 z-10 flex items-center gap-2">
        <button class="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-white/50"><i class="fa-solid fa-plus text-[10px]"></i></button>
        DESPESAS OPERACIONAIS
      </td>
      ${dataMap.totalExpenses.map(v => `<td class="px-5 py-3 text-right text-rose-300">-${fmtMoney(v)}</td>`).join('')}
      <td class="px-5 py-3 text-right font-bold text-rose-400 bg-rose-400/5">-${fmtMoney(sumArray(dataMap.totalExpenses))}</td>
    </tr>
  `;

  Object.entries(dataMap.expenses).sort((a,b) => sumArray(b[1]) - sumArray(a[1])).forEach(([cat, vals]) => {
    html += `
      <tr class="text-white/70">
        <td class="px-5 py-3 pl-12 sticky bg-black border-r border-white/5 left-0 z-10 w-64 truncate max-w-[250px]" title="${cat}">${cat}</td>
        ${vals.map(v => `<td class="px-5 py-3 text-right">-${fmtMoney(v)}</td>`).join('')}
        <td class="px-5 py-3 text-right font-semibold text-white bg-white/5">-${fmtMoney(sumArray(vals))}</td>
      </tr>
    `;
  });

  // --- RESULTADO ---
  const netVals = dataMap.totalIncomes.map((inc, i) => inc - dataMap.totalExpenses[i]);
  html += `
    <tr>
      <td class="px-5 py-4 font-black text-cyan-400 sticky bg-black border-t border-r border-cyan-400/20 left-0 z-10">RESULTADO LÍQUIDO</td>
      ${netVals.map(v => `<td class="px-5 py-4 text-right font-bold ${v >= 0 ? 'text-white' : 'text-rose-400'} border-t border-cyan-400/20">${fmtMoney(v)}</td>`).join('')}
      <td class="px-5 py-4 text-right font-black ${sumArray(netVals) >= 0 ? 'text-cyan-400 bg-cyan-400/10' : 'text-rose-400 bg-rose-400/10'} border-t border-cyan-400/20">${fmtMoney(sumArray(netVals))}</td>
    </tr>
  `;

  tBody.innerHTML = html;
}

function renderRxV(state) {
  const currentP = getCurrentPeriod();
  const ana = getMonthlyAnalytics(state, currentP);

  document.getElementById('rxv-total-incomes').innerText = fmtMoney(ana.incomes || 0);
  document.getElementById('rxv-total-expenses').innerText = fmtMoney(ana.expenses || 0);
  document.getElementById('rxv-net').innerText = fmtMoney(ana.net || 0);

  const mrg = ana.incomes ? (ana.net / ana.incomes) * 100 : 0;
  document.getElementById('rxv-margin').innerText = mrg.toFixed(1) + '%';

  // Summary
  const txs = getTransactionsForPeriod(currentP);
  document.getElementById('rxv-summary-count').innerText = txs.length;
  
  const inTxs = txs.filter(t => t.value > 0);
  const outTxs = txs.filter(t => t.value < 0);
  
  const avgIn = inTxs.length ? (ana.incomes / inTxs.length) : 0;
  const avgOut = outTxs.length ? (ana.expenses / outTxs.length) : 0;
  
  document.getElementById('rxv-summary-avg-in').innerText = fmtMoney(avgIn);
  document.getElementById('rxv-summary-avg-out').innerText = fmtMoney(avgOut);

  let maxExp = 0;
  let maxExpName = '-';
  outTxs.forEach(t => {
    if(Math.abs(t.value) > maxExp) { maxExp = Math.abs(t.value); maxExpName = t.description; }
  });
  document.getElementById('rxv-summary-max-exp').innerText = `${fmtMoney(maxExp)} (${maxExpName})`;

  // Status Donut
  const targetInc = state.incomesTarget || (ana.incomes + 100);
  const prog = Math.min(100, Math.round((ana.incomes / targetInc) * 100)) || 0;
  
  document.getElementById('rxv-status-container').innerHTML = `
    <svg viewBox="0 0 36 36" class="w-32 h-32 transform -rotate-90">
      <path class="text-white/5" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
      <path class="text-emerald-400" stroke-dasharray="${prog}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
    </svg>
    <div class="absolute flex flex-col items-center z-10 mt-1">
      <p class="text-[9px] text-white/40 uppercase tracking-widest">Atingido</p>
      <p class="text-xl font-black text-white">${prog}%</p>
    </div>
  `;

  // Top Categories (Expenses)
  const topC = groupByCategory(txs, 'expense').slice(0, 4);
  const tcHtml = topC.map(([cat, val], i) => {
    const pct = ana.expenses ? Math.round((val / ana.expenses) * 100) : 0;
    const colors = [
      'from-rose-500 to-orange-500',
      'from-violet-500 to-fuchsia-500',
      'from-cyan-500 to-blue-500',
      'from-emerald-500 to-teal-500'
    ];
    return `
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-white/70 truncate w-32">${cat}</span>
          <span class="text-white font-bold">${fmtMoney(val)}</span>
        </div>
        <div class="w-full bg-white/5 rounded-full h-2">
          <div class="bg-gradient-to-r ${colors[i%4]} h-2 rounded-full" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('rxv-top-categories').innerHTML = tcHtml || '<p class="text-white/30 text-sm">Sem despesas registradas.</p>';

  // Chart
  const ctx = document.getElementById('canvas-rxv');
  if(!ctx) return;
  if(reportChartRxV) reportChartRxV.destroy();

  const months = getMonthsRange(5); // 6 months trend
  const cData = { labels: [], incomes: [], expenses: [] };
  months.forEach(m => {
    cData.labels.push(m.label.substring(0,3));
    const mAna = getMonthlyAnalytics(state, m.id);
    cData.incomes.push(mAna.incomes);
    cData.expenses.push(mAna.expenses);
  });

  if (window.Chart) {
    reportChartRxV = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: cData.labels,
        datasets: [
          {
            label: 'Receitas',
            data: cData.incomes,
            borderColor: '#34d399',
            backgroundColor: 'rgba(52, 211, 153, 0.2)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointBackgroundColor: '#34d399'
          },
          {
            label: 'Despesas',
            data: cData.expenses,
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.2)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointBackgroundColor: '#f43f5e'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleColor: 'rgba(255,255,255,0.7)',
            bodyColor: '#fff',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.raw)}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, callback: (v) => 'R$ ' + (v/1000) + 'k' }
          },
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } }
          }
        }
      }
    });
  }
}

function renderCashflow(state) {
  const currentP = getCurrentPeriod();
  const ana = getMonthlyAnalytics(state, currentP);

  document.getElementById('cf-total-incomes').innerText = fmtMoney(ana.incomes || 0);
  document.getElementById('cf-total-expenses').innerText = fmtMoney(ana.expenses || 0);
  document.getElementById('cf-net').innerText = fmtMoney(ana.net || 0);

  const ctx = document.getElementById('canvas-cashflow');
  if(!ctx) return;
  if(reportChartCashflow) reportChartCashflow.destroy();

  const [yStr, mStr] = currentP.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10) - 1; // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOfMonth = new Date(year, month, 1);

  // Calcula o balance acumulado até o início deste mês
  let balance = 0;
  (state.transactions || []).forEach(t => {
    if (!t.date) return;
    const parts = t.date.split('/');
    if (parts.length === 3) {
      const td = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
      if (td < startOfMonth) balance += t.value;
    }
  });

  const txs = getTransactionsForPeriod(currentP);
  const days = {};
  txs.forEach(t => {
    if (!days[t.date]) days[t.date] = 0;
    days[t.date] += t.value;
  });

  const labels = [];
  const data = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${String(d).padStart(2,'0')}/${String(month+1).padStart(2,'0')}/${year}`;
    labels.push(String(d).padStart(2,'0'));
    if (days[dayStr]) {
      balance += days[dayStr];
    }
    data.push(balance);
  }

  if (window.Chart && labels.length > 0) {
    reportChartCashflow = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Saldo Acumulado',
          data: data,
          borderColor: '#22d3ee', // cyan-400
          borderWidth: 2,
          backgroundColor: 'rgba(34, 211, 238, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: '#22d3ee'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            bodyColor: '#fff',
            borderColor: 'rgba(34, 211, 238, 0.2)',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `Saldo: ${fmtMoney(ctx.raw)}`
            }
          }
        },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } }
          },
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } }
          }
        }
      }
    });
  }
}

function renderComparison(state) {
  const sA = document.getElementById('comp-period-a');
  const sB = document.getElementById('comp-period-b');
  
  // Populate dropdowns if empty
  if(sA && sA.options.length <= 1) {
    const r = getMonthsRange(11);
    const opts = r.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    sA.innerHTML = opts;
    sB.innerHTML = opts;
    sA.value = getCurrentPeriod();
    if(r.length > 1) sB.value = r[1].id;
  }

  const pA = sA?.value || getCurrentPeriod();
  const pB = sB?.value || getMonthsRange(1)[1]?.id;

  const aA = getMonthlyAnalytics(state, pA);
  const aB = getMonthlyAnalytics(state, pB);

  const cDiff = (curr, prev) => curr - prev;
  const cPct = (curr, prev) => prev !== 0 ? ((curr - prev) / prev) * 100 : 0;

  // Render Cards
  ['inc', 'exp', 'net'].forEach(k => {
    let mA = 0, mB = 0;
    if(k==='inc') { mA = aA.incomes; mB = aB.incomes; }
    if(k==='exp') { mA = aA.expenses; mB = aB.expenses; }
    if(k==='net') { mA = aA.net; mB = aB.net; }
    
    document.getElementById(`comp-${k}-a`).innerText = fmtMoney(mA);
    document.getElementById(`comp-${k}-b`).innerText = fmtMoney(mB);
    
    const diff = cDiff(mA, mB);
    const pct = cPct(mA, mB);
    
    const diffEl = document.getElementById(`comp-${k}-diff`);
    diffEl.innerHTML = `${diff >= 0 ? '+' : ''}${fmtMoney(diff)} <span class="${diff >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} text-[10px] px-1.5 py-0.5 rounded" id="comp-${k}-pct">${diff >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>`;
  });

  // Render Table
  const tbody = document.getElementById('comp-table-body');
  if(!tbody) return;

  const tA = getTransactionsForPeriod(pA);
  const tB = getTransactionsForPeriod(pB);

  const groups = {};
  tA.forEach(t => {
    if(!groups[t.category]) groups[t.category] = { a: 0, b: 0, id: t.category };
    groups[t.category].a += Math.abs(t.value);
  });
  tB.forEach(t => {
    if(!groups[t.category]) groups[t.category] = { a: 0, b: 0, id: t.category };
    groups[t.category].b += Math.abs(t.value);
  });

  let h = '';
  Object.values(groups).sort((x, y) => Math.abs(x.a - x.b) - Math.abs(y.a - y.b)).reverse().forEach(g => {
    const d = g.a - g.b;
    const p = cPct(g.a, g.b);
    h += `
      <tr>
        <td class="px-4 py-3 text-white truncate max-w-[200px]" title="${g.id}">${g.id}</td>
        <td class="px-4 py-3 text-right text-white/70">${fmtMoney(g.a)}</td>
        <td class="px-4 py-3 text-right text-white/70">${fmtMoney(g.b)}</td>
        <td class="px-4 py-3 text-right font-bold ${d > 0 ? 'text-rose-400' : (d < 0 ? 'text-emerald-400' : 'text-white/50')}">${d > 0 ? '+' : ''}${fmtMoney(d)}</td>
        <td class="px-4 py-3 text-right"><span class="${d > 0 ? 'bg-rose-500/10 text-rose-400' : (d < 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/50')} text-[10px] px-2 py-1 rounded">${d > 0 ? '+' : ''}${p.toFixed(1)}%</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = h || '<tr><td colspan="5" class="px-4 py-8 text-center text-white/30">Nenhum dado comparativo.</td></tr>';
}
