/**
 * js/services/transactions.js
 * Utilitários para CRUD direto nas transações do Supabase (Opcional, se online-only).
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

export async function fetchRemoteTransactions() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false });
  if (error) console.error('[Transactions] Fetch erro:', error);
  return data || [];
}

export async function deleteRemoteTransaction(id) {
  if (!isSupabaseConfigured) return;
  try {
    // [FIX] IDs locais têm prefixo (ex: 'tx-uuid'). Supabase espera UUID puro.
    const knownPrefixes = ['tx-', 'goal-', 'card-', 'inv-', 'fx-', 'ctx-', 'msg-'];
    let cleanId = id;
    for (const prefix of knownPrefixes) {
      if (cleanId.startsWith(prefix)) { cleanId = cleanId.slice(prefix.length); break; }
    }
    const { error } = await supabase.from('transactions').delete().eq('id', cleanId);
    if (error) console.error('[Transactions] Delete erro:', error);
  } catch (err) {
    console.error('[Transactions] Falha na exclusão remota:', err);
  }
}
