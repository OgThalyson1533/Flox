/**
 * js/services/supabase.js
 * Configuração e inicialização do cliente Supabase.
 * Para funcionar, as chaves precisam estar definidas.
 */

// Como estamos rodando estático no browser, o SDK do Supabase precisa ser
// importado via CDN (no index.html) ou via ESM:
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Tenta pegar de variáveis injetadas ou do ambiente
// Para rodar local sem bundler, o usuário pode definir no localStorage ou hardcoded
const getEnv = (key) => {
  let val = window[`__ENV_${key}`] || localStorage.getItem(`grokfin_env_${key}`);
  if (!val) {
    try {
      const cfg = JSON.parse(localStorage.getItem('grokfin-cfg') || '{}');
      if (key === 'SUPABASE_URL') val = cfg.supabaseUrl;
      if (key === 'SUPABASE_ANON_KEY') val = cfg.supabaseAnonKey;
    } catch(e) {}
  }
  return val || '';
};

export const SUPABASE_URL = getEnv('SUPABASE_URL');
export const SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY');

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export let supabase = null;

if (isSupabaseConfigured) {
  try {
    // [FIX] Valida URL antes de instanciar — URL malformada lançava exceção não tratada
    new URL(SUPABASE_URL);
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.info('[Supabase] Cliente inicializado.');
  } catch (e) {
    console.error('[Supabase] URL inválida — verifique a configuração:', e.message);
  }
} else {
  console.warn('[Supabase] Chaves não configuradas. Rodando em modo totalmente offline.');
}
