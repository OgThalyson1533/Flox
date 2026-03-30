/**
 * js/ui/market-ui.js
 * Lida com o Discover e Tickers da Aba Mercado.
 */

import { fetchFiatQuotes, fetchCryptoTrends, fetchMajorCryptos } from '../services/market.js';
import { formatMoney } from '../utils/format.js';

let marketRendered = false;

export async function renderMarketTab(forceRefresh = false) {
  if (marketRendered && !forceRefresh) return;
  
  const tickersEl = document.getElementById('market-tickers');
  const trendingCryptoEl = document.getElementById('market-trending-crypto');
  const trendingFiatEl = document.getElementById('market-trending-fiat');

  if (!tickersEl || !trendingCryptoEl || !trendingFiatEl) return;

  marketRendered = true; // Prevents spam. Add a refresh button on UI if needed later.

  // 1. Fetch
  const [fiat, cryptoMajors, cryptoTrends] = await Promise.all([
    fetchFiatQuotes(),
    fetchMajorCryptos(),
    fetchCryptoTrends()
  ]);

  // 2. Tickers
  const makeTicker = (label, symbol, price, pct, isCrypto = false) => {
    let color = pct >= 0 ? 'text-emerald-400' : 'text-rose-400';
    let icon = pct >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    let formattedPrice = isCrypto ? formatMoney(price) : `R$ ${price}`;
    
    return `
      <div class="glass-panel rounded-3xl p-4 flex flex-col justify-between hover:bg-white/5 transition-colors cursor-default">
        <div class="flex justify-between items-start">
          <p class="text-xs font-bold uppercase tracking-widest text-white/40">${label}</p>
          <span class="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-white/50 border border-white/5">${symbol}</span>
        </div>
        <div class="mt-4">
          <p class="text-2xl font-black text-white tracking-tight">${formattedPrice}</p>
          <p class="mt-1 text-xs font-bold ${color}"><i class="fa-solid ${icon} mr-1"></i>${pct > 0 ? '+' : ''}${pct}%</p>
        </div>
      </div>
    `;
  };

  if (fiat && cryptoMajors) {
    tickersEl.innerHTML = '';
    tickersEl.innerHTML += makeTicker('Dólar Com.', 'USD', Number(fiat.usd.bid).toFixed(2), fiat.usd.pct);
    tickersEl.innerHTML += makeTicker('Euro', 'EUR', Number(fiat.eur.bid).toFixed(2), fiat.eur.pct);
    tickersEl.innerHTML += makeTicker('Bitcoin', 'BTC', cryptoMajors.btc.price, cryptoMajors.btc.pct, true);
    tickersEl.innerHTML += makeTicker('Ethereum', 'ETH', cryptoMajors.eth.price, cryptoMajors.eth.pct, true);
  } else {
    tickersEl.innerHTML = '<p class="text-xs text-rose-400 col-span-full">Falha ao carregar cotações base.</p>';
  }

  // 3. Trending Crypto
  if (cryptoTrends && cryptoTrends.length > 0) {
    trendingCryptoEl.innerHTML = cryptoTrends.map(c => `
      <div class="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-3 hover:bg-white/10 transition-colors">
        <div class="flex items-center gap-3">
          <img src="${c.thumb}" alt="${c.symbol}" class="w-9 h-9 rounded-full border border-white/10" />
          <div>
            <p class="text-sm font-bold text-white">${c.name}</p>
            <p class="text-[10px] uppercase font-bold text-white/40 bg-black/20 rounded px-1.5 py-0.5 inline-block mt-1 border border-white/5">${c.symbol}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-xs font-bold text-emerald-300">Trending</p>
          <p class="text-[10px] text-white/40 mt-1 uppercase tracking-wider">Rank #${c.marketCapRank}</p>
        </div>
      </div>
    `).join('');
  } else {
    trendingCryptoEl.innerHTML = '<p class="text-xs text-white/40">Não foi possível carregar as tendências cripto no momento.</p>';
  }

  // 4. Fiat Currencies List
  if (fiat) {
    trendingFiatEl.innerHTML = `
      <div class="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-3 hover:bg-white/10 transition-colors">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 text-cyan-300 border border-cyan-400/10 flex items-center justify-center font-bold text-sm">US</div>
           <div>
            <p class="text-sm font-bold text-white">Dólar Americano</p>
            <p class="text-[10px] text-white/40 mt-1 uppercase font-bold tracking-widest bg-black/20 rounded px-1.5 py-0.5 inline-block border border-white/5">USD/BRL</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm font-bold text-white">R$ ${Number(fiat.usd.bid).toFixed(2)}</p>
          <p class="text-[10px] font-bold ${fiat.usd.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'} mt-1">${fiat.usd.pct}% hoje</p>
        </div>
      </div>
      <div class="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-3 hover:bg-white/10 transition-colors mt-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400/20 to-purple-500/20 text-indigo-300 border border-indigo-400/10 flex items-center justify-center font-bold text-sm">EU</div>
           <div>
            <p class="text-sm font-bold text-white">Euro</p>
             <p class="text-[10px] text-white/40 mt-1 uppercase font-bold tracking-widest bg-black/20 rounded px-1.5 py-0.5 inline-block border border-white/5">EUR/BRL</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm font-bold text-white">R$ ${Number(fiat.eur.bid).toFixed(2)}</p>
          <p class="text-[10px] font-bold ${fiat.eur.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'} mt-1">${fiat.eur.pct}% hoje</p>
        </div>
      </div>
      <div class="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-3 hover:bg-white/10 transition-colors mt-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400/20 to-red-500/20 text-rose-300 border border-rose-400/10 flex items-center justify-center font-bold text-sm">UK</div>
           <div>
            <p class="text-sm font-bold text-white">Libra Esterlina</p>
            <p class="text-[10px] text-white/40 mt-1 uppercase font-bold tracking-widest bg-black/20 rounded px-1.5 py-0.5 inline-block border border-white/5">GBP/BRL</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm font-bold text-white">R$ ${Number(fiat.gbp.bid).toFixed(2)}</p>
          <p class="text-[10px] font-bold ${fiat.gbp.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'} mt-1">${fiat.gbp.pct}% hoje</p>
        </div>
      </div>
    `;
  }
}
