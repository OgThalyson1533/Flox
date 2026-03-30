/**
 * js/services/exchange.js
 * Serviço de câmbio via AwesomeAPI.
 */

import { state, saveState } from '../state.js';

const CACHE_HOURS = 4;

export async function fetchExchangeRates() {
  const now = new Date();
  const lastSync = state.exchange?.lastSync ? new Date(state.exchange.lastSync) : null;
  
  const diffHours = lastSync ? (now - lastSync) / (1000 * 60 * 60) : 999;
  
  // Usa o cache local se ainda for válido
  if (diffHours < CACHE_HOURS && state.exchange?.usd) {
    console.info('[Exchange] Usando taxas em cache.');
    return state.exchange;
  }

  try {
    console.info('[Exchange] Buscando novas taxas de câmbio na AwesomeAPI...');
    const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL');
    if (!res.ok) throw new Error('Falha na API de câmbio');
    
    const data = await res.json();
    
    const usd = parseFloat(data.USDBRL.ask);
    const eur = parseFloat(data.EURBRL.ask);
    const btc = parseFloat(data.BTCBRL.ask);
    
    const trendUsd = parseFloat(data.USDBRL.pctChange);
    const trendEur = parseFloat(data.EURBRL.pctChange);
    const trendBtc = parseFloat(data.BTCBRL.pctChange);

    const exchangeData = {
      usd, eur, btc,
      trend: { usd: trendUsd, eur: trendEur, btc: trendBtc },
      lastSync: now.toISOString()
    };
    
    state.exchange = exchangeData;
    saveState();
    
    return exchangeData;
    
  } catch (error) {
    console.error('[Exchange] Erro ao buscar taxas', error);
    // Retorna o cache antigo se existir, se não retorna os defaults
    return state.exchange || {
      usd: 5.90, eur: 6.40, btc: 300000,
      trend: { usd: 0, eur: 0, btc: 0 },
      lastSync: null
    };
  }
}
