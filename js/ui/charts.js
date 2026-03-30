/**
 * js/ui/charts.js
 * Gráficos principais (Pie, Line, Flow), usando Chart.js (via janela global/CDN).
 */

import { state } from '../state.js';
import { addMonths, sameMonth, parseDateBR } from '../utils/date.js';
import { getReferenceDate } from '../analytics/engine.js';
import { formatMoney, formatMoneyShort } from '../utils/format.js';

let charts = { pie: null, line: null, monthly: null };

export function getMonthlyFlowData() {
  const today = getReferenceDate(state);
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = addMonths(today, -i);
    const txMonth = state.transactions.filter(t => sameMonth(parseDateBR(t.date), d));
    const income = txMonth.filter(t => t.value > 0).reduce((a, t) => a + t.value, 0);
    const expense = txMonth.filter(t => t.value < 0).reduce((a, t) => a + Math.abs(t.value), 0);
    months.push({
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d),
      income,
      expense
    });
  }
  return months;
}

export function renderCharts(analytics) {
  // Config padrão (caso não tenha sido definido externamente)
  if (window.Chart) {
    window.Chart.defaults.color = 'rgba(255,255,255,.58)';
    window.Chart.defaults.font.family = 'Inter';
  }

  const pieCanvas = document.getElementById('pieChart');
  const lineCanvas = document.getElementById('lineChart');
  if (!pieCanvas || !lineCanvas) return;

  try { if (charts.pie) { charts.pie.destroy(); charts.pie = null; } } catch {}
  try { if (charts.line) { charts.line.destroy(); charts.line = null; } } catch {}
  try { if (charts.monthly) { charts.monthly.destroy(); charts.monthly = null; } } catch {}

  const pieLabels = analytics.categories.length ? analytics.categories.map(([name]) => name) : ['Sem dados'];
  const pieValues = analytics.categories.length ? analytics.categories.map(([, value]) => value) : [1];
  const palette = ['#00f5ff', '#a855f7', '#00ff85', '#facc15', '#ff6685', '#60a5fa', '#fb7185', '#94a3b8'];

  charts.pie = new Chart(pieCanvas, {
    type: 'doughnut',
    data: {
      labels: pieLabels,
      datasets: [{
        data: pieValues,
        backgroundColor: palette.slice(0, pieValues.length),
        borderWidth: 0,
        hoverOffset: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: { duration: 1500, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: window.innerWidth < 1280 ? 'bottom' : 'right',
          labels: {
            usePointStyle: true,
            padding: 18,
            color: 'rgba(255,255,255,.72)',
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.label}: ${formatMoney(context.parsed)}`;
            }
          }
        }
      }
    }
  });

  const lineCtx = lineCanvas.getContext('2d');
  const gradient = lineCtx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(0,255,133,.35)');
  gradient.addColorStop(1, 'rgba(0,255,133,0)');

  if (state.transactions.length === 0) {
    lineCanvas.style.display = 'none';
    const parent = lineCanvas.parentElement;
    let msg = parent.querySelector('.no-data-msg');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'no-data-msg absolute inset-0 flex items-center justify-center text-sm text-white/40 italic';
      msg.textContent = 'Adicione transações para ver sua projeção futura.';
      parent.appendChild(msg);
    }
    msg.style.display = 'flex';
  } else {
    lineCanvas.style.display = 'block';
    const msg = lineCanvas.parentElement.querySelector('.no-data-msg');
    if (msg) msg.style.display = 'none';

    charts.line = new Chart(lineCanvas, {
      type: 'line',
      data: {
        labels: analytics.projection.map(item => item.label),
        datasets: [{
          data: analytics.projection.map(item => item.value),
          borderColor: '#00ff85',
          backgroundColor: gradient,
          borderWidth: 3,
          fill: true,
          tension: .35,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointBorderWidth: 2,
          pointBackgroundColor: '#0d131f',
          pointBorderColor: '#00ff85'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1500, easing: 'easeOutQuart' },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,.06)' },
            border: { display: false },
            ticks: {
              callback(value) { return formatMoneyShort(value); }
            }
          },
          x: {
            grid: { display: false },
            border: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label(context) {
                return `Patrimônio projetado: ${formatMoney(context.parsed.y)}`;
              }
            }
          }
        }
      }
    });
  }

  // ── Monthly income vs expense chart ──
  const monthlyCanvas = document.getElementById('monthlyFlowChart');
  if (monthlyCanvas) {
    const mData = getMonthlyFlowData();
    const lineCtxM = monthlyCanvas.getContext('2d');
    const gradIncome = lineCtxM.createLinearGradient(0, 0, 0, 256);
    gradIncome.addColorStop(0, 'rgba(0,255,133,.30)');
    gradIncome.addColorStop(1, 'rgba(0,255,133,0)');
    const gradExpense = lineCtxM.createLinearGradient(0, 0, 0, 256);
    gradExpense.addColorStop(0, 'rgba(255,102,133,.25)');
    gradExpense.addColorStop(1, 'rgba(255,102,133,0)');

    if (state.transactions.length === 0) {
      monthlyCanvas.style.display = 'none';
      const parent = monthlyCanvas.parentElement;
      let msg = parent.querySelector('.no-data-msg');
      if (!msg) {
        msg = document.createElement('div');
        msg.className = 'no-data-msg absolute inset-0 flex items-center justify-center text-sm text-white/40 italic';
        msg.textContent = 'Adicione transações para compor o fluxo dos meses passados.';
        parent.appendChild(msg);
      }
      msg.style.display = 'flex';
    } else {
      monthlyCanvas.style.display = 'block';
      const msg = monthlyCanvas.parentElement.querySelector('.no-data-msg');
      if (msg) msg.style.display = 'none';
      
      charts.monthly = new Chart(monthlyCanvas, {
        type: 'line',
        data: {
          labels: mData.map(d => d.label),
          datasets: [
            {
              label: 'Receita',
              data: mData.map(d => d.income),
              borderColor: '#00ff85',
              backgroundColor: gradIncome,
              borderWidth: 2.5, fill: true, tension: .35,
              pointRadius: 4, pointHoverRadius: 7,
              pointBackgroundColor: '#0d131f', pointBorderColor: '#00ff85', pointBorderWidth: 2
            },
            {
              label: 'Despesas',
              data: mData.map(d => d.expense),
              borderColor: '#ff6685',
              backgroundColor: gradExpense,
              borderWidth: 2.5, fill: true, tension: .35,
              pointRadius: 4, pointHoverRadius: 7,
              pointBackgroundColor: '#0d131f', pointBorderColor: '#ff6685', pointBorderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 1500, easing: 'easeOutQuart' },
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: {
              grid: { color: 'rgba(255,255,255,.05)' },
              border: { display: false },
              ticks: { color: 'rgba(255,255,255,.45)', callback: v => formatMoneyShort(v), font: { size: 11 } }
            },
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: 'rgba(255,255,255,.45)', font: { size: 11 } }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}`,
                afterBody: (items) => {
                  if (items.length >= 2) {
                    const inc = items.find(i => i.datasetIndex === 0)?.parsed.y || 0;
                    const exp = items.find(i => i.datasetIndex === 1)?.parsed.y || 0;
                    const net = inc - exp;
                    return [`Saldo: ${net >= 0 ? '+' : ''}${formatMoney(net)}`];
                  }
                  return [];
                }
              }
            }
          }
        }
      });
    }
  }
}
