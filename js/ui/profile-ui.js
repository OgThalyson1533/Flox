/**
 * js/ui/profile-ui.js
 * Lógica do perfil do usuário, edição de draft e bind dos inputs visuais.
 */

import { state, saveState } from '../state.js';
import { formatMoney } from '../utils/format.js';
import { calculateAnalytics } from '../analytics/engine.js';
import { showToast } from '../utils/dom.js';
import { signOut, currentUser } from '../services/auth.js';
import { syncToSupabase } from '../services/sync.js';
import { isSupabaseConfigured, supabase } from '../services/supabase.js';

export const profileEditor = { isEditing: false, draft: null, handleTaken: false, handleChecking: false };
let _handleValidationTimer = null;

function resolveProfile(p = {}) {
  return {
    nickname: p.nickname || 'Anônimo',
    displayName: p.displayName || 'GrokFin User',
    handle: p.handle || '@grokfin.user',
    bio: p.bio || 'Organizando minha vida financeira com eficiência brutal. Cortando excessos, focando no que importa.',
    theme: p.theme || 'cyber',
    avatarImage: p.avatarImage || null, // Se null, na visualização ele cai pro default
    bannerImage: p.bannerImage || null
  };
}

function applyThemeToGlows(theme) {
  const g1 = document.getElementById('app-glow-1');
  const g2 = document.getElementById('app-glow-2');
  const g3 = document.getElementById('app-glow-3');
  if (!g1 || !g2 || !g3) return;

  // Limpar defaults color classes (Regex simples e eficiente)
  [g1, g2, g3].forEach(el => el.className = el.className.replace(/bg-[a-z]+-\d+\/\d+/g, '').trim());

  if (theme === 'royal') {
    g1.classList.add('bg-violet-600/20');
    g2.classList.add('bg-fuchsia-500/15');
    g3.classList.add('bg-purple-800/15');
  } else if (theme === 'gold') {
    g1.classList.add('bg-amber-500/15');
    g2.classList.add('bg-yellow-600/10');
    g3.classList.add('bg-orange-500/12');
  } else if (theme === 'minimal') {
    g1.classList.add('bg-slate-500/5');
    g2.classList.add('bg-gray-600/5');
    g3.classList.add('bg-zinc-700/8');
  } else { // Cyber / Default
    g1.classList.add('bg-cyan-400/10');
    g2.classList.add('bg-violet-500/12');
    g3.classList.add('bg-emerald-400/8');
  }
}

export function applyProfileBindings(profile) {
  document.querySelectorAll('[data-bind="profile.nickname"]').forEach(el => {
    el.textContent = profile.nickname;
  });
  document.querySelectorAll('[data-bind="profile.displayName"]').forEach(el => {
    if (el.tagName === 'INPUT') el.value = profile.displayName;
    else el.textContent = profile.displayName;
  });
  document.querySelectorAll('[data-bind="profile.handle"]').forEach(el => {
    if (el.tagName === 'INPUT') el.value = profile.handle;
    else el.textContent = profile.handle;
  });
  document.querySelectorAll('[data-bind="profile.bio"]').forEach(el => {
    if (el.tagName === 'TEXTAREA') el.value = profile.bio;
    else el.textContent = profile.bio;
  });

  // [FIX #1] O HTML usa data-profile-text / data-profile-image / data-profile-bg
  // em vez de data-bind. Suporte duplo para cobrir os dois padrões:
  document.querySelectorAll('[data-profile-text="displayName"]').forEach(el => { el.textContent = profile.displayName; });
  document.querySelectorAll('[data-profile-text="nickname"]').forEach(el => { el.textContent = profile.nickname; });
  document.querySelectorAll('[data-profile-text="handle"]').forEach(el => { el.textContent = profile.handle; });

  const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' rx='28' fill='%230d1624'/%3E%3Ccircle cx='64' cy='50' r='22' fill='%231e3a5f'/%3E%3Cellipse cx='64' cy='100' rx='34' ry='22' fill='%231e3a5f'/%3E%3C/svg%3E`;
  const DEFAULT_BANNER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='200' viewBox='0 0 800 200'%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%230a1628'/%3E%3Cstop offset='1' stop-color='%23061020'/%3E%3C/linearGradient%3E%3Crect width='800' height='200' fill='url(%23g)'/%3E%3C/svg%3E`;

  const avatarUrl = profile.avatarImage || (window.createDefaultAvatarDataUrl ? window.createDefaultAvatarDataUrl(profile.displayName) : DEFAULT_AVATAR);
  const bannerUrl = profile.bannerImage || (window.createDefaultBannerDataUrl ? window.createDefaultBannerDataUrl() : DEFAULT_BANNER);

  document.querySelectorAll('[data-bind="profile.avatarImage"], [data-profile-image="avatar"]').forEach(img => {
    img.src = avatarUrl;
  });
  document.querySelectorAll('[data-bind="profile.bannerImage"]').forEach(img => {
    img.src = bannerUrl;
  });
  // Banner via background CSS
  document.querySelectorAll('[data-profile-bg="banner"]').forEach(el => {
    el.style.backgroundImage = `url('${bannerUrl}')`;
  });

  applyThemeToGlows(profile.theme);
}

function fillProfileInputs(profile) {
  const nicknameInput = document.getElementById('profile-nickname-input');
  if (nicknameInput) nicknameInput.value = profile.nickname;

  const displayNameInput = document.getElementById('profile-displayname-input');
  if (displayNameInput) displayNameInput.value = profile.displayName;

  const handleInput = document.getElementById('profile-handle-input');
  if (handleInput) handleInput.value = profile.handle;

  const themeInput = document.getElementById('profile-theme-input');
  if (themeInput) themeInput.value = profile.theme || 'cyber';
  setHandleFeedback('', 'idle');
}

function setHandleFeedback(message, type = 'idle') {
  const feedback = document.getElementById('profile-handle-feedback');
  const handleInput = document.getElementById('profile-handle-input');
  if (!feedback || !handleInput) return;

  feedback.textContent = message || '';
  feedback.classList.remove('hidden', 'text-rose-300', 'text-emerald-300', 'text-white/45');
  handleInput.classList.remove('border-rose-500/60', 'ring-1', 'ring-rose-500/50');

  if (!message) {
    feedback.classList.add('hidden');
    return;
  }

  if (type === 'error') {
    feedback.classList.add('text-rose-300');
    handleInput.classList.add('border-rose-500/60', 'ring-1', 'ring-rose-500/50');
    return;
  }

  if (type === 'success') {
    feedback.classList.add('text-emerald-300');
    return;
  }

  feedback.classList.add('text-white/45');
}

async function validateHandleAvailability(handle) {
  if (!isSupabaseConfigured || !supabase || !currentUser) return true;
  const normalized = sanitizeHandle(handle);
  const currentHandle = sanitizeHandle(state.profile?.handle || '');
  if (normalized === currentHandle) return true;

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', normalized)
    .neq('id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.warn('[Profile] Não foi possível validar @handle:', error.message);
    return true;
  }
  return !data;
}

function queueHandleValidation(handle) {
  clearTimeout(_handleValidationTimer);
  profileEditor.handleChecking = true;
  profileEditor.handleTaken = false;
  setHandleFeedback('Validando disponibilidade do @handle...', 'info');

  _handleValidationTimer = setTimeout(async () => {
    const isAvailable = await validateHandleAvailability(handle);
    profileEditor.handleChecking = false;
    profileEditor.handleTaken = !isAvailable;
    if (!profileEditor.isEditing) return;
    if (!handle || handle === '@') {
      setHandleFeedback('', 'idle');
      return;
    }
    if (isAvailable) setHandleFeedback('✓ @handle disponível', 'success');
    else setHandleFeedback('Esse @handle já existe. Escolha outro.', 'error');
  }, 350);
}

export function setProfileEditMode(isEditing) {
  profileEditor.isEditing = isEditing;
  // [FIX #6] profile-edit-tools não existe no HTML; apenas profile-save-btn
  const saveBtn = document.getElementById('profile-save-btn');
  if (saveBtn) saveBtn.classList.toggle('hidden', !isEditing);

  const toggleBtn = document.getElementById('profile-edit-toggle-btn');
  const toggleLabel = document.getElementById('profile-edit-toggle-label');
  if (toggleBtn) {
    toggleBtn.classList.toggle('bg-rose-500/10', isEditing);
    toggleBtn.classList.toggle('text-rose-400', isEditing);
    toggleBtn.classList.toggle('border-rose-500/20', isEditing);
  }
  if (toggleLabel) toggleLabel.textContent = isEditing ? 'Cancelar edição' : 'Editar perfil';

  // [FIX #7] O HTML usa profile-edit-panel (com .hidden), não profile-preview-mode/edit-mode
  const editPanel = document.getElementById('profile-edit-panel');
  if (editPanel) editPanel.classList.toggle('hidden', !isEditing);

  // Mostrar/ocultar labels de edição (elementos com classe profile-edit-only)
  document.querySelectorAll('.profile-edit-only').forEach(el => {
    el.classList.toggle('hidden', !isEditing);
  });
}

export function startProfileEditing() {
  profileEditor.draft = resolveProfile(state.profile || {});
  profileEditor.handleTaken = false;
  profileEditor.handleChecking = false;
  setProfileEditMode(true);
  fillProfileInputs(profileEditor.draft);
}

export function cancelProfileEditing() {
  profileEditor.draft = null;
  setProfileEditMode(false);
  renderProfile(calculateAnalytics(state));
}

function sanitizeHandle(value = '') {
  const clean = String(value)
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  return `@${clean || 'grokfin.user'}`;
}

export function updateProfileDraftField(field, value) {
  if (!profileEditor.isEditing) {
    startProfileEditing();
  }
  
  const defaults = { nickname: 'Anônimo', displayName: 'GrokFin User', handle: '@grokfin.user' };
  const nextValue = field === 'handle'
    ? sanitizeHandle(value)
    : (String(value).trim() || defaults[field] || '');

  profileEditor.draft = resolveProfile({ ...(profileEditor.draft || state.profile || {}), [field]: nextValue });
  applyProfileBindings(profileEditor.draft);

  if (field === 'handle') {
    const handleInput = document.getElementById('profile-handle-input');
    if (handleInput) handleInput.value = nextValue;
    queueHandleValidation(nextValue);
  }
}

export async function saveProfileDraft() {
  if (!profileEditor.isEditing) return;
  if (profileEditor.handleChecking) {
    showToast('Aguarde a validação do @handle.', 'info');
    return;
  }
  if (profileEditor.handleTaken) {
    showToast('Esse @handle já existe. Escolha outro para salvar.', 'danger');
    return;
  }
  
  const updatedProfile = resolveProfile(profileEditor.draft || state.profile || {});

  // Forçar salvamento primeiro na nuvem
  if (isSupabaseConfigured) {
    try {
      const saveBtn = document.getElementById('profile-save-btn');
      const originalText = saveBtn ? saveBtn.innerHTML : '';
      if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Salvando...';
      
      const stateClone = { ...state, profile: updatedProfile, lastUpdated: new Date().toISOString() };
      await syncToSupabase(stateClone);
      
      // Somente atualiza estado real e cache se deu certo na nuvem
      state.profile = updatedProfile;
      state.lastUpdated = stateClone.lastUpdated;
      saveState();
      if (saveBtn) saveBtn.innerHTML = originalText;
    } catch (e) {
      console.error('[Profile] Falha ao salvar no banco em nuvem:', e);
      showToast('Não foi possível salvar na nuvem. Alteração cancelada.', 'danger');
      return; // Interrompe para não salvar local
    }
  } else {
    // Fallback se não configurado
    state.profile = updatedProfile;
    state.lastUpdated = new Date().toISOString();
    saveState();
  }

  profileEditor.draft = null;
  setProfileEditMode(false);
  
  if (window.renderHeaderMeta) window.renderHeaderMeta(calculateAnalytics(state));
  renderProfile(calculateAnalytics(state));
  showToast('Perfil atualizado com sucesso!', 'success');
}

export function renderProfile(analytics) {
  const profileToRender = profileEditor.isEditing
    ? resolveProfile(profileEditor.draft || state.profile || {})
    : resolveProfile(state.profile || {});

  if (!profileEditor.isEditing) {
    state.profile = profileToRender;
  }

  applyProfileBindings(profileToRender);
  fillProfileInputs(profileToRender);
  setProfileEditMode(profileEditor.isEditing);

  const goalsDone = (state.goals || []).filter(g => {
    const progress = Math.min(Math.round((g.atual / g.total) * 100), 100);
    return progress >= 100;
  }).length;
  
  const elMetricGoals = document.getElementById('profile-metric-goals');
  if (elMetricGoals) elMetricGoals.textContent = String((state.goals || []).length);
  
  const elMetricTx = document.getElementById('profile-metric-transactions');
  if (elMetricTx) elMetricTx.textContent = String((state.transactions || []).length);
  
  const elMetricCompleted = document.getElementById('profile-metric-completed');
  if (elMetricCompleted) elMetricCompleted.textContent = String(goalsDone);
  
  const elBalancePill = document.getElementById('profile-balance-pill');
  if (elBalancePill) elBalancePill.textContent = formatMoney(state.balance);
  
  const elHealthPill = document.getElementById('profile-health-pill');
  if (elHealthPill) elHealthPill.textContent = `${analytics?.healthScore || 0}/100`;

  if (window.updateInstallButtons) window.updateInstallButtons();
}

/** Resize image helper (async, to use via event bindings) */
export async function handleProfileImageUpload(event, type) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!profileEditor.isEditing) {
    startProfileEditing();
  }
  try {
    const options = type === 'avatar'
      ? { width: 512, height: 512, quality: 0.88 }
      : { width: 1600, height: 640, quality: 0.82 };
    
    // Calls external resize util if available
    const dataUrl = window.resizeImageFile ? await window.resizeImageFile(file, options) : null;
    if (!dataUrl) throw new Error('Resize tool missing');
    
    profileEditor.draft = resolveProfile(profileEditor.draft || state.profile || {});
    if (type === 'avatar') {
      profileEditor.draft.avatarImage = dataUrl;
    } else {
      profileEditor.draft.bannerImage = dataUrl;
    }
    applyProfileBindings(profileEditor.draft);
    showToast(type === 'avatar' ? 'Prévia do avatar atualizada. Salve para confirmar.' : 'Prévia da capa atualizada. Salve para confirmar.', 'info');
  } catch (err) {
    showToast('Não foi possível processar essa imagem.', 'danger');
  } finally {
    event.target.value = '';
  }
}

export function bindProfileEvents() {
  document.getElementById('profile-edit-toggle-btn')?.addEventListener('click', () => {
    if (profileEditor.isEditing) cancelProfileEditing();
    else startProfileEditing();
  });

  document.getElementById('profile-cancel-btn')?.addEventListener('click', () => {
    cancelProfileEditing();
  });

  document.getElementById('profile-logout-btn')?.addEventListener('click', async () => {
    await signOut();
    window.location.replace('./index.html');
  });

  document.getElementById('profile-save-btn')?.addEventListener('click', saveProfileDraft);
  
  document.getElementById('profile-nickname-input')?.addEventListener('input', event => {
    updateProfileDraftField('nickname', event.currentTarget.value);
  });
  document.getElementById('profile-displayname-input')?.addEventListener('input', event => {
    updateProfileDraftField('displayName', event.currentTarget.value);
  });
  document.getElementById('profile-handle-input')?.addEventListener('input', event => {
    updateProfileDraftField('handle', event.currentTarget.value);
  });
  
  document.getElementById('profile-theme-input')?.addEventListener('change', event => {
    updateProfileDraftField('theme', event.currentTarget.value);
  });
  
  document.getElementById('profile-avatar-input')?.addEventListener('change', event => handleProfileImageUpload(event, 'avatar'));
  document.getElementById('profile-banner-input')?.addEventListener('change', event => handleProfileImageUpload(event, 'banner'));
}
