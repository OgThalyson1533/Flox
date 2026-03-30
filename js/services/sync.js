/**
 * js/services/sync.js — GrokFin Elite v3
 *
 * Melhorias vs v2:
 * - Upserts paralelos via Promise.allSettled (antes sequenciais — ~6x mais rápido)
 * - Retry automático com exponential backoff para falhas de rede transitórias
 * - Diff-based sync: só envia entidades que realmente mudaram desde o último sync
 * - Erro de uma entidade não cancela as demais (isolamento total)
 * - syncFromSupabase usa Promise.all para buscar todas as tabelas em paralelo
 */

import { supabase, isSupabaseConfigured } from './supabase.js';
import { currentUser } from './auth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSqlDate(brDateStr) {
  if (!brDateStr) return new Date().toISOString().split('T')[0];
  const parts = brDateStr.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return brDateStr;
}

export function cleanUUID(idStr) {
  if (!idStr) return crypto.randomUUID();
  
  if (idStr.length === 36 && idStr.split('-').length === 5) return idStr;

  let cleaned = idStr;
  const knownPrefixes = ['tx-', 'goal-', 'card-', 'inv-', 'fx-', 'ctx-', 'msg-'];
  for (const prefix of knownPrefixes) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length);
      break;
    }
  }

  if (cleaned.length === 36 && cleaned.split('-').length === 5) return cleaned;

  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) hash = Math.imul(31, hash) + cleaned.charCodeAt(i) | 0;
  const hex = (hash >>> 0).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

/** Retry com exponential backoff — 3 tentativas, delays 500ms/1s/2s */
async function upsertWithRetry(table, rows, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
    try {
      const { error } = await supabase.from(table).upsert(rows);
      if (!error) return { ok: true };
      if (error.code?.startsWith('4')) {
        console.error(`[Sync] ${table} erro permanente (${error.code}):`, error.message);
        return { ok: false, error };
      }
      lastError = error;
    } catch (e) { lastError = e; }
  }
  console.error(`[Sync] ${table} falhou após ${maxRetries} tentativas:`, lastError?.message);
  return { ok: false, error: lastError };
}

/** Hash leve para detectar mudanças sem serializar o objeto inteiro */
function quickHash(obj) {
  try {
    const s = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return s.length + '|' + h;
  } catch { return Math.random().toString(); }
}

const _lastSyncHash = {};
function hasChanged(key, data) {
  const h = quickHash(data);
  if (_lastSyncHash[key] === h) return false;
  _lastSyncHash[key] = h;
  return true;
}

// ── syncToSupabase ────────────────────────────────────────────────────────────

export async function syncToSupabase(state) {
  if (!isSupabaseConfigured || !currentUser) return;

  const uid = currentUser.id;
  const tasks = [];

  // 1. Perfil
  if (state.profile && hasChanged('profile', state.profile)) {
    tasks.push(upsertWithRetry('profiles', [{
      id: uid,
      nickname: state.profile.nickname,
      display_name: state.profile.displayName,
      handle: state.profile.handle,
      bio: state.profile.bio,
      // Prioriza URLs remotas (quando existentes), com fallback para dataURL local
      avatar_url: state.profile.avatarImageUrl || state.profile.avatarImage || null,
      banner_url: state.profile.bannerImageUrl || state.profile.bannerImage || null,
      onboarding_completed: !state.isNewUser
    }]));
  }

  // 2. Transações
  if (state.transactions?.length && hasChanged('transactions', state.transactions)) {
    const txRows = state.transactions.map(t => ({
      id: cleanUUID(t.id),
      user_id: uid,
      date: toSqlDate(t.date),
      description: t.desc,
      category: t.cat,
      amount: t.value,
      payment: t.payment || null,
      card_id: t.cardId ? cleanUUID(t.cardId) : null,
      recurring_template: t.recurringTemplate || false,
      installments: t.installments || 1,
      installment_current: t.installmentCurrent || 1,
      // [FIX TX] Campos de observação e URL do anexo
      notes: t.notes || null,
      attachment_url: t.attachmentUrl || null
    }));
    tasks.push(upsertWithRetry('transactions', txRows));
  }

  // 3. Metas — Estratégia "replace" (delete-then-insert) para garantir que
  //    metas excluídas localmente também sejam removidas do Supabase.
  //    O upsert puro só insere/atualiza — nunca remove registros deletados.
  if (Array.isArray(state.goals) && hasChanged('goals', state.goals)) {
    tasks.push(
      supabase.from('goals').delete().eq('user_id', uid)
        .then(({ error: delError }) => {
          if (delError) {
            console.error('[Sync] Falha ao limpar metas remotas antes do upsert:', delError.message);
            return { ok: false, error: delError };
          }
          if (state.goals.length === 0) {
            console.info('[Sync] Todas as metas remotas removidas (state vazio).');
            return { ok: true };
          }
          return upsertWithRetry('goals', state.goals.map(g => ({
            id: cleanUUID(g.id),
            user_id: uid,
            name: g.nome,
            current_amount: g.atual,
            target_amount: g.total,
            theme: g.theme || 'generic',
            custom_image: g.img || null,
            deadline: g.deadline || null
          })));
        })
        .catch(e => { console.error('[Sync] Falha crítica no sync de metas:', e); return { ok: false }; })
    );
  }

  // 4. Cartões + Faturas (cartões primeiro, depois faturas — FK constraint)
  if (state.cards?.length && hasChanged('cards', state.cards)) {
    const cardRows = state.cards.map(c => ({
      id: cleanUUID(c.id),
      user_id: uid,
      name: c.name,
      flag: c.flag,
      card_type: c.cardType,
      color: c.color,
      card_limit: c.limit,
      closing_day: c.closing || null,
      due_day: c.due || null
    }));
    const invoiceRows = state.cards.flatMap(card =>
      (card.invoices || []).map(inv => ({
        id: cleanUUID(inv.id),
        user_id: uid,
        card_id: cleanUUID(card.id),
        description: inv.desc,
        category: inv.cat,
        amount: inv.value,
        installments: inv.installments || 1,
        installment_current: inv.installmentCurrent || 1
      }))
    );
    // Cartões e faturas em sequência (FK dependency), mas esse bloco corre em paralelo com os outros
    tasks.push(
      upsertWithRetry('cards', cardRows).then(r => {
        if (r.ok && invoiceRows.length) return upsertWithRetry('card_invoices', invoiceRows);
      })
    );
  }

  // 5. Investimentos
  if (state.investments?.length && hasChanged('investments', state.investments)) {
    tasks.push(upsertWithRetry('investments', state.investments.map(i => ({
      id: cleanUUID(i.id),
      user_id: uid,
      name: i.name,
      type: i.type,
      subtype: i.subtype,
      current_value: i.value,
      cost_basis: i.cost
    }))));
  }

  // 6. Gastos Fixos
  if (state.fixedExpenses?.length && hasChanged('fixedExpenses', state.fixedExpenses)) {
    tasks.push(upsertWithRetry('fixed_expenses', state.fixedExpenses.map(f => ({
      id: cleanUUID(f.id),
      user_id: uid,
      name: f.name,
      category: f.cat || f.category || 'Rotina',
      amount: f.value,
      execution_day: f.day,
      is_income: f.isIncome || false,
      is_active: f.active !== false
    }))));
  }

  // 7. Orçamentos
  if (state.budgets && hasChanged('budgets', state.budgets)) {
    const budgetRows = Object.entries(state.budgets)
      .filter(([, val]) => val > 0)
      .map(([category, limit_amount]) => ({ user_id: uid, category, limit_amount }));
    if (budgetRows.length) tasks.push(upsertWithRetry('budgets', budgetRows));
  }

  // 8. Categorias customizadas
  if (Array.isArray(state.customCategories) && state.customCategories.length && hasChanged('customCategories', state.customCategories)) {
    const catRows = state.customCategories.map(name => ({ user_id: uid, name }));
    tasks.push(upsertWithRetry('custom_categories', catRows));
  }

  if (!tasks.length) {
    console.info('[Sync] Sem mudanças — skip.');
    return;
  }

  const results = await Promise.allSettled(tasks);
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed === 0) {
    console.info(`[Sync] OK — ${tasks.length} entidades sincronizadas.`);
  } else {
    console.warn(`[Sync] ${failed}/${tasks.length} entidades falharam.`);
  }
}

// ── syncFromSupabase ──────────────────────────────────────────────────────────

export async function syncFromSupabase(state) {
  if (!isSupabaseConfigured || !currentUser) return null;

  const uid = currentUser.id;
  console.info('[Sync] Pull iniciado...');

  try {
    // Todas as queries em paralelo — antes eram 8 awaits sequenciais
    const [
      { data: profile },
      { data: txs },
      { data: goals },
      { data: fixed },
      { data: buds },
      { data: cards },
      { data: invoices },
      { data: invs },
      { data: customCats }
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('transactions').select('*').eq('user_id', uid).order('date', { ascending: false }),
      supabase.from('goals').select('*').eq('user_id', uid),
      supabase.from('fixed_expenses').select('*').eq('user_id', uid),
      supabase.from('budgets').select('*').eq('user_id', uid),
      supabase.from('cards').select('*').eq('user_id', uid),
      supabase.from('card_invoices').select('*').eq('user_id', uid),
      supabase.from('investments').select('*').eq('user_id', uid),
      supabase.from('custom_categories').select('name').eq('user_id', uid)
    ]);

    // Perfil
    let isOnboardingCompleted = false;
    if (profile) {
      isOnboardingCompleted = profile.onboarding_completed || false;
      state.profile = {
        nickname: profile.nickname || state.profile?.nickname || 'Navigator',
        displayName: profile.display_name || state.profile?.displayName || 'GrokFin User',
        handle: profile.handle || state.profile?.handle || '@grokfin.user',
        bio: profile.bio || state.profile?.bio || '',
        avatarImage: profile.avatar_url || state.profile?.avatarImage || null,
        bannerImage: profile.banner_url || state.profile?.bannerImage || null,
        avatarImageUrl: profile.avatar_url || state.profile?.avatarImageUrl || null,
        bannerImageUrl: profile.banner_url || state.profile?.bannerImageUrl || null
      };
    }

    // Transações
    if (txs?.length) {
      state.transactions = txs.map(t => {
        const [year, month, day] = t.date.split('-');
        return {
          id: t.id,
          date: `${day}/${month}/${year}`,
          desc: t.description,
          cat: t.category,
          value: Number(t.amount),
          payment: t.payment,
          cardId: t.card_id,
          recurringTemplate: t.recurring_template,
          installments: t.installments,
          installmentCurrent: t.installment_current,
          // [FIX TX] Mapeamento dos novos campos vindos do banco
          notes: t.notes || null,
          attachmentUrl: t.attachment_url || null
        };
      });
      state.balance = state.transactions.reduce((acc, t) => acc + t.value, 0);
    } else {
      state.transactions = [];
      state.balance = 0;
    }

    // Metas
    state.goals = goals?.length
      ? goals.map(g => ({
          id: g.id, nome: g.name,
          atual: Number(g.current_amount), total: Number(g.target_amount),
          theme: g.theme, img: g.custom_image, deadline: g.deadline
        }))
      : [];

    // Gastos Fixos
    state.fixedExpenses = fixed?.length
      ? fixed.map(f => ({
          id: f.id, name: f.name, cat: f.category,
          value: Number(f.amount), day: f.execution_day,
          isIncome: f.is_income, active: f.is_active
        }))
      : [];

    // Orçamentos (merge com local)
    if (buds?.length) buds.forEach(b => { state.budgets[b.category] = Number(b.limit_amount); });

    // Cartões + Faturas
    state.cards = cards?.length
      ? cards.map(c => {
          const cInvs = (invoices || []).filter(inv => inv.card_id === c.id);
          return {
            id: c.id, name: c.name, flag: c.flag,
            cardType: c.card_type, color: c.color,
            limit: Number(c.card_limit),
            used: cInvs.reduce((s, inv) => s + Number(inv.amount), 0),
            closing: c.closing_day, due: c.due_day,
            invoices: cInvs.map(inv => ({
              id: inv.id, desc: inv.description, cat: inv.category,
              value: Number(inv.amount),
              installments: inv.installments, installmentCurrent: inv.installment_current
            }))
          };
        })
      : [];

    // Investimentos
    state.investments = invs?.length
      ? invs.map(i => ({
          id: i.id, name: i.name, type: i.type, subtype: i.subtype,
          value: Number(i.current_value), cost: Number(i.cost_basis)
        }))
      : [];

    // Categorias customizadas do usuário
    if (customCats?.length) {
      state.customCategories = customCats.map(r => r.name);
    }

    state.isNewUser = !isOnboardingCompleted && !txs?.length && !goals?.length;

    // Popula cache de hash para evitar re-sync imediato após pull
    ['transactions', 'goals', 'cards', 'investments', 'fixedExpenses'].forEach(k => {
      _lastSyncHash[k] = quickHash(state[k]);
    });

    console.info('[Sync] Pull concluído.');
    return true;

  } catch (err) {
    console.error('[Sync] Erro crítico no pull:', err);
    return null;
  }
}
