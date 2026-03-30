/**
 * js/services/cards.js
 * Utilitários para CRUD direto nos cartões do Supabase.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

export async function fetchRemoteCards() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('cards').select('*, card_invoices(*)');
  if (error) console.error('[Cards] Fetch erro:', error);
  return data || [];
}

export async function deleteRemoteCard(id) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) console.error('[Cards] Delete erro:', error);
}
