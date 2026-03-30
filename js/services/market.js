/**
 * js/services/market.js
 * Utilitário de requisição livre e gratuita para puxar cotações de Fiats e Cripto (Web 3.0).
 * Fonte FIAT: AwesomeAPI
 * Fonte Crypto: CoinGecko (pública, com throttle se abusar, mas atende o App)
 */

export async function fetchFiatQuotes() {
  try {
    // Traz USD-BRL, EUR-BRL, GBP-BRL
    const res = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL');
    if (!res.ok) throw new Error('Falha AwesomeAPI FIAT');
    const data = await res.json();
    return {
      usd: { bid: data.USDBRL.bid, pct: data.USDBRL.pctChange },
      eur: { bid: data.EURBRL.bid, pct: data.EURBRL.pctChange },
      gbp: { bid: data.GBPBRL.bid, pct: data.GBPBRL.pctChange }
    };
  } catch (err) {
    console.error('[Market] Erro ao buscar cotação Fiat:', err);
    return null;
  }
}

export async function fetchCryptoTrends() {
  try {
    // Busca no CoinGecko as tendências ("Trending") para sugerir moedas
    const res = await fetch('https://api.coingecko.com/api/v3/search/trending');
    if (!res.ok) throw new Error('Falha CoinGecko Trends');
    const data = await res.json();
    // Pegar as top 4 criptos
    const coins = (data.coins || []).slice(0, 4).map(c => c.item);
    return coins.map(c => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      thumb: c.thumb,
      priceBtc: c.price_btc,
      marketCapRank: c.market_cap_rank
    }));
  } catch (err) {
    console.error('[Market] Erro ao buscar Cripto Trends:', err);
    return null;
  }
}

export async function fetchMajorCryptos() {
  try {
    // BTC e ETH vs BRL via CoinGecko simple price
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl&include_24hr_change=true');
    if (!res.ok) throw new Error('Falha CoinGecko Simple Price');
    const data = await res.json();
    return {
      btc: { price: data.bitcoin.brl, pct: data.bitcoin.brl_24h_change },
      eth: { price: data.ethereum.brl, pct: data.ethereum.brl_24h_change }
    };
  } catch (err) {
    console.error('[Market] Erro ao buscar BTC/ETH:', err);
    return null;
  }
}
