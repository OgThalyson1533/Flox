/**
 * js/services/goals.js
 * Utilitários para CRUD direto nas metas do Supabase.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

export async function fetchRemoteGoals() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('goals').select('*');
  if (error) console.error('[Goals] Fetch erro:', error);
  return data || [];
}

export async function deleteRemoteGoal(id) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) console.error('[Goals] Delete erro:', error);
}
