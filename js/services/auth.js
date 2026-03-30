/**
 * js/services/auth.js
 * Lógica de autenticação com Supabase.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';
import { showToast } from '../utils/dom.js';

export let currentUser = null;

export async function initAuth(onStateChangeCallback) {
  if (!isSupabaseConfigured) return null;
  
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error('[Auth] Erro ao recuperar sessão', error);
  
  currentUser = session?.user || null;

  supabase.auth.onAuthStateChange((event, session) => {
    console.info(`[Auth] State changed: ${event}`);
    currentUser = session?.user || null;
    if (onStateChangeCallback) onStateChangeCallback(currentUser, event);
  });
  
  return currentUser;
}

export async function signUp(email, password, displayName) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado');
  
  const { data, error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      data: { display_name: displayName }
    } 
  });
  
  if (error) {
    showToast(error.message, 'danger');
    throw error;
  }
  return data;
}

export async function signIn(email, password) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado');
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast(error.message, 'danger');
    throw error;
  }
  return data;
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  Object.keys(localStorage)
    .filter((key) => key.startsWith('grokfin_'))
    .forEach((key) => localStorage.removeItem(key));
  await supabase.auth.signOut();
  currentUser = null;
  showToast('Logout realizado', 'info');
}

export async function resetPasswordForEmail(email) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    showToast(error.message, 'danger');
    throw error;
  }
  return data;
}
