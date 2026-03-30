/**
 * js/services/investments.js
 * Utilitários para CRUD direto nos investimentos do Supabase.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

export async function fetchRemoteInvestments() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('investments').select('*');
  if (error) console.error('[Investments] Fetch erro:', error);
  return data || [];
}

export async function deleteRemoteInvestment(id) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('investments').delete().eq('id', id);
  if (error) console.error('[Investments] Delete erro:', error);
}
