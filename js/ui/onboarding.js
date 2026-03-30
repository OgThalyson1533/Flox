/**
 * js/ui/onboarding.js — GrokFin Elite v6
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE: "Onboarding Premium" — Tour de primeiro login com 4 etapas.
 *
 * Etapas:
 *  1. Boas-vindas + Criação de perfil (nome + apelido + foto de avatar/capa)
 *  2. Apreciação visual do app (feature highlights animados)
 *  3. Primeiro Input Guiado (saldo inicial + transação de entrada)
 *  4. Handover motivacional ("Tudo pronto — assuma o controle")
 *
 * Ativação: state.isNewUser === true (flag do banco/localStorage)
 * Após concluir: state.isNewUser = false, salvo via saveState()
 *
 * CORREÇÕES nesta versão:
 *  - [FIX] window.renderHeaderMeta() chamado sem analytics → guard adicionado
 *  - [FIX] Novos usuários começam sem dados seed (limpeza após onboarding)
 *  - [NEW] Upload de foto de avatar e capa com save no Supabase Storage
 */

import { state, saveState } from '../state.js';
import { showToast } from '../utils/dom.js';
import { parseCurrencyInput, formatMoney } from '../utils/format.js';
import { uid } from '../utils/math.js';
import { formatDateBR } from '../utils/date.js';
import { syncToSupabase } from '../services/sync.js';

// ─── CSS injetado dinamicamente ────────────────────────────────────────────────
const OB_STYLES = `
  @keyframes ob-fade-in  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ob-slide-up { from { opacity: 0; transform: translateY(32px) scale(.96); } to { opacity:1; transform:none; } }
  @keyframes ob-slide-out{ from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-24px) scale(.96); } }
  @keyframes ob-pop-in   { from { opacity: 0; transform: scale(.80); } to { opacity: 1; transform: scale(1); } }
  @keyframes ob-check    { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
  @keyframes ob-pulse-ring{ 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:.2;transform:scale(1.18)} }
  @keyframes ob-img-pulse { 0%,100%{opacity:.7} 50%{opacity:1} }

  #ob-overlay { animation: ob-fade-in .4s ease both; }
  .ob-box     { animation: ob-slide-up .38s cubic-bezier(.22,1,.36,1) both; }
  .ob-exit    { animation: ob-slide-out .28s ease both; pointer-events:none; }

  .ob-input {
    width: 100%; padding: 13px 16px; border-radius: 14px;
    border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.07);
    color: #fff; font-size: 15px; outline: none; transition: border-color .2s, background .2s;
    box-sizing: border-box;
  }
  .ob-input:focus { border-color: rgba(0,245,255,.45); background: rgba(0,245,255,.06); }
  .ob-input::placeholder { color: rgba(255,255,255,.28); }

  .ob-btn-primary {
    width: 100%; padding: 14px; border-radius: 18px;
    background: linear-gradient(135deg,#00f5ff,#00ff85);
    border: none; font-size: 15px; font-weight: 700; color: #000;
    cursor: pointer; transition: transform .15s, box-shadow .2s;
    box-shadow: 0 0 24px rgba(0,245,255,.2);
  }
  .ob-btn-primary:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 0 32px rgba(0,245,255,.35); }
  .ob-btn-primary:active { transform: scale(.98); }

  .ob-btn-ghost {
    width: 100%; padding: 13px; border-radius: 18px;
    border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05);
    color: rgba(255,255,255,.65); font-size: 14px; font-weight: 600;
    cursor: pointer; transition: background .18s, color .18s;
  }
  .ob-btn-ghost:hover { background: rgba(255,255,255,.1); color: #fff; }

  .ob-dot { width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,.2); transition:all .3s; }
  .ob-dot.active { width:24px; border-radius:4px; background:linear-gradient(90deg,#00f5ff,#00ff85); }

  .ob-feat {
    display:flex; align-items:center; gap:14px; padding:14px 16px;
    border: 1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.05);
    border-radius:18px; animation: ob-slide-up .38s ease both;
    transition: border-color .2s, background .2s;
  }
  .ob-feat:hover { border-color:rgba(0,245,255,.2); background:rgba(0,245,255,.05); }
  .ob-feat:nth-child(1){animation-delay:.05s} .ob-feat:nth-child(2){animation-delay:.12s}
  .ob-feat:nth-child(3){animation-delay:.19s} .ob-feat:nth-child(4){animation-delay:.26s}

  .ob-amount-input {
    font-size: 32px; font-weight: 900; text-align: center; color: #fff;
    background: transparent; border: none; outline: none; width: 100%;
    letter-spacing: -1px;
  }
  .ob-amount-wrap {
    padding: 20px; border-radius: 20px;
    border: 1.5px solid rgba(0,245,255,.25); background: rgba(0,245,255,.06);
    margin-bottom: 4px; text-align: center;
  }

  .ob-check-ring {
    width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px;
    background: linear-gradient(135deg,rgba(0,245,255,.15),rgba(0,255,133,.15));
    border: 1.5px solid rgba(0,255,133,.3);
    display: flex; align-items: center; justify-content: center;
    animation: ob-pop-in .45s cubic-bezier(.22,1,.36,1) .1s both;
    position: relative;
  }
  .ob-check-ring::before {
    content:''; position:absolute; inset:-10px; border-radius:50%;
    border:1.5px solid rgba(0,255,133,.15);
    animation: ob-pulse-ring 2.5s ease-in-out infinite;
  }

  /* Photo upload areas */
  .ob-photo-upload {
    position:relative; cursor:pointer; border-radius:50%;
    border:2px dashed rgba(0,245,255,.3); background:rgba(0,245,255,.05);
    display:flex; align-items:center; justify-content:center;
    transition: border-color .2s, background .2s; overflow:hidden;
  }
  .ob-photo-upload:hover { border-color:rgba(0,245,255,.6); background:rgba(0,245,255,.1); }
  .ob-photo-upload img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
  .ob-banner-upload {
    position:relative; cursor:pointer; border-radius:16px;
    border:2px dashed rgba(168,85,247,.3); background:rgba(168,85,247,.05);
    display:flex; align-items:center; justify-content:center;
    transition: border-color .2s, background .2s; overflow:hidden; height:90px;
  }
  .ob-banner-upload:hover { border-color:rgba(168,85,247,.6); background:rgba(168,85,247,.1); }
  .ob-banner-upload img { width:100%; height:100%; object-fit:cover; border-radius:14px; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('ob-styles')) return;
  const s = document.createElement('style');
  s.id = 'ob-styles';
  s.textContent = OB_STYLES;
  document.head.appendChild(s);
}

function dots(n, total = 4) {
  return Array.from({ length: total }, (_, i) =>
    `<div class="ob-dot ${i + 1 === n ? 'active' : ''}"></div>`
  ).join('');
}

// Resize image to dataURL (max width/height) — same pattern used in profile-ui
async function resizeToDataUrl(file, w = 512, h = 512, q = 0.88) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const r = Math.min(w / img.width, h / img.height, 1);
      canvas.width = Math.round(img.width * r);
      canvas.height = Math.round(img.height * r);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', q));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload dataURL to Supabase Storage if available
async function uploadImageToSupabase(dataUrl, filename, bucket = 'avatars') {
  try {
    const supabaseClient = window.supabase || (await import('../services/supabase.js')).getSupabaseClient?.();
    if (!supabaseClient) return null;
    const base64 = dataUrl.split(',')[1];
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const { data, error } = await supabaseClient.storage.from(bucket).upload(filename, blob, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(data.path);
    return urlData?.publicUrl || null;
  } catch {
    return null; // Supabase not configured — store locally
  }
}

// ─── Step templates ───────────────────────────────────────────────────────────
function stepWelcome(ctx) {
  const avatarStr = ctx.avatarPreview
    ? `<img src="${ctx.avatarPreview}" />`
    : `<span style="font-size:28px;font-weight:900;color:#000">G</span>`;

  const bannerStyle = ctx.bannerPreview
    ? `background-image:url('${ctx.bannerPreview}');background-size:cover;background-position:center;`
    : '';

  return `
    <div class="ob-box w-full max-w-[480px]" style="
      background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.03));
      border:1px solid rgba(255,255,255,.1); border-radius:28px; overflow:hidden;
      backdrop-filter:blur(24px); box-shadow:0 24px 64px rgba(0,0,0,.5)">

      <!-- Banner area -->
      <div class="ob-banner-upload" id="ob-banner-zone" style="${bannerStyle}border-radius:0;height:96px;border:none;border-bottom:1px solid rgba(255,255,255,.08);">
        ${ctx.bannerPreview ? `<img src="${ctx.bannerPreview}" style="width:100%;height:100%;object-fit:cover;border-radius:0"/>` : `
        <div style="text-align:center">
          <i class="fa-solid fa-image" style="font-size:20px;color:rgba(168,85,247,.6);display:block;margin-bottom:4px"></i>
          <p style="font-size:11px;color:rgba(255,255,255,.3)">Capa do perfil</p>
        </div>`}
        <input type="file" id="ob-banner-input" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;"/>
      </div>

      <div style="padding:0 28px 28px">
        <!-- Avatar -->
        <div style="position:relative;margin-top:-28px;margin-bottom:16px;display:flex;align-items:flex-end;gap:12px">
          <div class="ob-photo-upload" id="ob-avatar-zone" style="width:64px;height:64px;background:linear-gradient(135deg,#00f5ff,#00ff85);border:3px solid rgba(10,13,22,1)">
            ${avatarStr}
            <input type="file" id="ob-avatar-input" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;"/>
          </div>
          <div style="padding-bottom:4px">
            <p style="font-size:10px;color:rgba(0,245,255,.7);text-transform:uppercase;letter-spacing:.15em;font-weight:700">Foto de perfil</p>
            <p style="font-size:11px;color:rgba(255,255,255,.35)">Clique para alterar</p>
          </div>
        </div>

        <h2 style="font-size:22px;font-weight:900;color:#fff;margin-bottom:6px;letter-spacing:-.4px">
          Bem-vindo ao GrokFin Elite
        </h2>
        <p style="font-size:14px;color:rgba(255,255,255,.52);margin-bottom:20px">
          Vamos personalizar sua experiência em 60 segundos.
        </p>

        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
          <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.15em;display:block;margin-bottom:5px">Seu nome *</label>
            <input id="ob-name" type="text" class="ob-input" placeholder="Ex: João Silva"
              value="${ctx.savedName || ''}" autocomplete="given-name"/>
            <p id="ob-name-err" style="display:none;font-size:11px;color:#ff6685;margin-top:4px;padding-left:2px">
              <i class="fa-solid fa-circle-exclamation" style="margin-right:4px"></i>Informe seu nome para continuar
            </p>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.15em;display:block;margin-bottom:5px">Apelido <span style="opacity:.45">(opcional)</span></label>
            <input id="ob-nick" type="text" class="ob-input" placeholder="Como prefiro ser chamado"
              value="${ctx.savedNick || ''}" autocomplete="nickname"/>
          </div>
        </div>

        <button id="ob-next-1" class="ob-btn-primary" style="margin-bottom:10px">Continuar →</button>
        <button id="ob-skip-1" class="ob-btn-ghost">Pular personalização</button>

        <div style="display:flex;justify-content:center;gap:6px;margin-top:18px">${dots(1)}</div>
      </div>
    </div>`;
}

function stepFeatures(name) {
  const firstName = name?.split(' ')[0] || 'você';
  const features = [
    { icon:'fa-robot',       color:'#00f5ff', title:'Chat com IA',          desc:'Envie um comprovante ou fale pelo microfone para lançar transações na conta.' },
    { icon:'fa-bullseye',    color:'#a78bfa', title:'Metas inteligentes',    desc:'IA estima prazo, imagem e aporte mensal de cada meta automaticamente.' },
    { icon:'fa-chart-line',  color:'#6ee7b7', title:'Painel em tempo real',  desc:'Burn diário, runway, score de saúde e projeção de 12 meses.' },
    { icon:'fa-credit-card', color:'#fcd34d', title:'Cartões & Fluxo',       desc:'Controle faturas, envelopes e custos fixos num único lugar premium.' },
  ];
  return `
    <div class="ob-box w-full max-w-[460px]" style="
      background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.03));
      border:1px solid rgba(255,255,255,.1); border-radius:28px; padding:32px 28px;
      backdrop-filter:blur(24px); box-shadow:0 24px 64px rgba(0,0,0,.5)">

      <p style="font-size:12px;font-weight:700;letter-spacing:.2em;color:rgba(0,245,255,.7);text-transform:uppercase;text-align:center;margin-bottom:8px">Seus novos superpoderes</p>
      <h2 style="font-size:22px;font-weight:900;color:#fff;text-align:center;margin-bottom:24px;letter-spacing:-.4px">
        ${firstName}, bem-vindo ao nível elite 🚀
      </h2>

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px">
        ${features.map(f => `
          <div class="ob-feat">
            <span style="width:38px;height:38px;border-radius:12px;background:${f.color}18;border:1px solid ${f.color}30;
              display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fa-solid ${f.icon}" style="font-size:16px;color:${f.color}"></i>
            </span>
            <div>
              <p style="font-size:13px;font-weight:700;color:#fff;margin-bottom:2px">${f.title}</p>
              <p style="font-size:12px;color:rgba(255,255,255,.55);line-height:1.4">${f.desc}</p>
            </div>
          </div>`).join('')}
      </div>

      <button id="ob-next-2" class="ob-btn-primary" style="margin-bottom:10px">Explorar →</button>
      <div style="display:flex;justify-content:center;gap:6px;margin-top:16px">${dots(2)}</div>
    </div>`;
}

function stepFirstInput() {
  return `
    <div class="ob-box w-full max-w-[460px]" style="
      background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.03));
      border:1px solid rgba(255,255,255,.1); border-radius:28px; padding:32px 28px;
      backdrop-filter:blur(24px); box-shadow:0 24px 64px rgba(0,0,0,.5)">

      <div style="width:56px;height:56px;border-radius:18px;background:linear-gradient(135deg,rgba(0,245,255,.15),rgba(0,255,133,.15));
        border:1px solid rgba(0,245,255,.25);display:flex;align-items:center;justify-content:center;margin:0 auto 18px">
        <i class="fa-solid fa-wallet" style="font-size:22px;color:#00f5ff"></i>
      </div>

      <h2 style="font-size:22px;font-weight:900;color:#fff;text-align:center;margin-bottom:6px;letter-spacing:-.4px">
        Dê vida ao seu painel
      </h2>
      <p style="font-size:14px;color:rgba(255,255,255,.52);text-align:center;margin-bottom:24px">
        Informe quanto você tem hoje para inicializar o dashboard.
      </p>

      <!-- Balance -->
      <div class="ob-amount-wrap" style="margin-bottom:16px">
        <p style="font-size:10px;font-weight:700;letter-spacing:.18em;color:rgba(0,245,255,.7);text-transform:uppercase;margin-bottom:8px">Saldo atual em conta (R$)</p>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px">
          <span style="font-size:22px;color:rgba(255,255,255,.4);font-weight:700">R$</span>
          <input id="ob-balance" type="text" class="ob-amount-input" placeholder="0,00" inputmode="decimal" autocomplete="off"/>
        </div>
        <p style="font-size:11px;color:rgba(255,255,255,.28);margin-top:6px">Você pode editar depois na aba Conta</p>
      </div>

      <!-- First transaction -->
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:16px;margin-bottom:20px;background:rgba(255,255,255,.03)">
        <p style="font-size:12px;font-weight:700;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.15em;margin-bottom:12px">
          <i class="fa-solid fa-receipt" style="color:#a78bfa;margin-right:6px"></i>Primeiro lançamento <span style="color:rgba(255,255,255,.28)">(opcional)</span>
        </p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <input id="ob-tx-desc" type="text" class="ob-input" style="padding:11px 14px;font-size:13px" placeholder="Ex: Salário de março"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <input id="ob-tx-value" type="text" class="ob-input" style="padding:11px 14px;font-size:13px;text-align:right" placeholder="Valor R$" inputmode="decimal"/>
            <select id="ob-tx-type" class="ob-input" style="padding:11px 14px;font-size:13px;cursor:pointer;background:rgba(255,255,255,.07)">
              <option value="entrada">Entrada ↑</option>
              <option value="saida">Saída ↓</option>
            </select>
          </div>
        </div>
      </div>

      <button id="ob-next-3" class="ob-btn-primary" style="margin-bottom:10px">
        <i class="fa-solid fa-arrow-right" style="margin-right:8px"></i>Salvar e continuar
      </button>
      <button id="ob-skip-3" class="ob-btn-ghost">Pular esta etapa</button>
      <div style="display:flex;justify-content:center;gap:6px;margin-top:16px">${dots(3)}</div>
    </div>`;
}

function stepHandover(name, balance) {
  const firstName = name?.split(' ')[0] || 'usuário';
  return `
    <div class="ob-box w-full max-w-[440px]" style="
      background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.03));
      border:1px solid rgba(255,255,255,.1); border-radius:28px; padding:36px 28px;
      backdrop-filter:blur(24px); box-shadow:0 24px 64px rgba(0,0,0,.5); text-align:center">

      <div class="ob-check-ring">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path d="M8 18L15 25L28 11" stroke="#00ff85" stroke-width="3"
            stroke-linecap="round" stroke-linejoin="round"
            stroke-dasharray="40" stroke-dashoffset="40"
            style="animation:ob-check .5s .2s ease forwards"/>
        </svg>
      </div>

      <p style="font-size:12px;font-weight:700;letter-spacing:.22em;color:rgba(0,245,255,.75);text-transform:uppercase;margin-bottom:8px">Sistema ativado</p>
      <h2 style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-.6px;margin-bottom:10px;line-height:1.1">
        Tudo pronto,<br>${firstName}.
      </h2>
      <p style="font-size:15px;color:rgba(255,255,255,.6);margin-bottom:24px;line-height:1.5;max-width:320px;margin-left:auto;margin-right:auto">
        Seu painel financeiro de alto nível está vivo.<br>Cada centavo vai contar a partir de agora.
      </p>

      ${balance > 0 ? `
      <div style="border:1px solid rgba(0,245,255,.15);background:rgba(0,245,255,.06);border-radius:18px;padding:16px;margin-bottom:20px">
        <p style="font-size:11px;color:rgba(0,245,255,.7);text-transform:uppercase;letter-spacing:.18em;margin-bottom:6px">Saldo inicial registrado</p>
        <p style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.5px">${formatMoney(balance)}</p>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px">
        ${[['9','Abas'],['2','IAs'],['100%','Ativo']].map(([v,l]) => `
          <div style="border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);border-radius:16px;padding:14px 8px">
            <p style="font-size:22px;font-weight:900;color:#00f5ff;letter-spacing:-.5px">${v}</p>
            <p style="font-size:10px;color:rgba(255,255,255,.4);margin-top:3px">${l}</p>
          </div>`).join('')}
      </div>

      <div style="border:1px solid rgba(0,245,255,.15);background:rgba(0,245,255,.06);border-radius:16px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:rgba(255,255,255,.65);text-align:left">
        <i class="fa-solid fa-lightbulb" style="color:#fcd34d;margin-right:8px"></i>
        Dica: use o <strong style="color:#fff">Chat</strong> para registrar gastos por voz ou enviar comprovantes 📸
      </div>

      <button id="ob-finish" class="ob-btn-primary">
        <i class="fa-solid fa-rocket" style="margin-right:8px"></i>Acessar Dashboard
      </button>
      <div style="display:flex;justify-content:center;gap:6px;margin-top:20px">${dots(4)}</div>
    </div>`;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
export function initOnboarding() {
  if (!state.isNewUser) return;

  injectStyles();

  const overlay = document.createElement('div');
  overlay.id = 'ob-overlay';
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', zIndex:'9999',
    background:'rgba(4,10,18,.90)', backdropFilter:'blur(14px)',
    display:'flex', alignItems:'center', justifyContent:'center',
    padding:'16px', overflowY:'auto',
  });
  document.body.appendChild(overlay);

  // Context object — persists across steps
  const ctx = {
    name: state.profile?.displayName || '',
    nick: '',
    avatarDataUrl: null,
    bannerDataUrl: null,
    avatarPreview: null,
    bannerPreview: null,
    savedName: '',
    savedNick: '',
    balance: 0,
  };

  function render(html) {
    overlay.innerHTML = html;
    setTimeout(() => overlay.querySelector('input:not([type=file])')?.focus(), 80);

    // Bind file inputs if on step 1
    const avatarInput = document.getElementById('ob-avatar-input');
    const bannerInput = document.getElementById('ob-banner-input');

    if (avatarInput) {
      avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          ctx.avatarDataUrl = await resizeToDataUrl(file, 512, 512, 0.88);
          ctx.avatarPreview = ctx.avatarDataUrl;
          // Re-render step 1 keeping current values
          ctx.savedName = document.getElementById('ob-name')?.value || '';
          ctx.savedNick = document.getElementById('ob-nick')?.value || '';
          animateOut(() => render(stepWelcome(ctx)));
        } catch { showToast('Erro ao carregar a imagem.', 'danger'); }
      });
    }

    if (bannerInput) {
      bannerInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          ctx.bannerDataUrl = await resizeToDataUrl(file, 1600, 640, 0.82);
          ctx.bannerPreview  = ctx.bannerDataUrl;
          ctx.savedName = document.getElementById('ob-name')?.value || '';
          ctx.savedNick = document.getElementById('ob-nick')?.value || '';
          animateOut(() => render(stepWelcome(ctx)));
        } catch { showToast('Erro ao carregar a capa.', 'danger'); }
      });
    }
  }

  function animateOut(cb) {
    const box = overlay.querySelector('.ob-box');
    if (box) { box.classList.add('ob-exit'); setTimeout(cb, 260); }
    else cb();
  }

  // ── Event delegation ──────────────────────────────────────────────────────
  overlay.addEventListener('click', async (e) => {
    // Don't intercept file inputs
    if (e.target.type === 'file') return;

    const id = e.target.closest('[id]')?.id;
    if (!id) return;

    // ── STEP 1 ────────────────────────────────────────────────────────────
    if (id === 'ob-next-1') {
      const nameVal = document.getElementById('ob-name')?.value?.trim();
      const errEl = document.getElementById('ob-name-err');

      if (!nameVal) {
        const inp = document.getElementById('ob-name');
        if (inp) { inp.style.borderColor = 'rgba(255,100,133,.6)'; inp.focus(); }
        if (errEl) errEl.style.display = 'block';
        return;
      }

      const nickVal = document.getElementById('ob-nick')?.value?.trim();
      ctx.name = nameVal;
      ctx.nick = nickVal || nameVal.split(' ')[0];

      // Save profile data
      state.profile = state.profile || {};
      state.profile.displayName = nameVal;
      state.profile.nickname = ctx.nick;
      state.profile.handle = '@' + nameVal.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '.user';
      if (ctx.avatarDataUrl) state.profile.avatarImage = ctx.avatarDataUrl;
      if (ctx.bannerDataUrl) state.profile.bannerImage = ctx.bannerDataUrl;
      saveState();

      // Upload to Supabase Storage (async, non-blocking)
      if (ctx.avatarDataUrl) {
        const userId = window._currentUser?.id || 'anon';
        uploadImageToSupabase(ctx.avatarDataUrl, `${userId}/avatar.jpg`, 'avatars').then(url => {
          if (url) { state.profile.avatarImageUrl = url; saveState(); }
        });
      }
      if (ctx.bannerDataUrl) {
        const userId = window._currentUser?.id || 'anon';
        uploadImageToSupabase(ctx.bannerDataUrl, `${userId}/banner.jpg`, 'banners').then(url => {
          if (url) { state.profile.bannerImageUrl = url; saveState(); }
        });
      }

      // [FIX] Guard: only call renderHeaderMeta if analytics are available
      try {
        const { calculateAnalytics } = await import('../analytics/engine.js');
        const analytics = calculateAnalytics(state);
        if (window.renderHeaderMeta) window.renderHeaderMeta(analytics);
        if (window.applyProfileBindings) window.applyProfileBindings(state.profile);
      } catch { /* profile update is cosmetic here */ }

      animateOut(() => render(stepFeatures(ctx.name)));
    }

    if (id === 'ob-skip-1') {
      animateOut(() => render(stepFeatures(ctx.name || 'você')));
    }

    // ── STEP 2 ────────────────────────────────────────────────────────────
    if (id === 'ob-next-2') {
      animateOut(() => render(stepFirstInput()));
    }

    // ── STEP 3 ────────────────────────────────────────────────────────────
    if (id === 'ob-next-3') {
      const balanceRaw = document.getElementById('ob-balance')?.value;
      const balance = parseCurrencyInput(balanceRaw);

      if (balance > 0) {
        state.transactions.unshift({
          id: uid('tx'),
          date: formatDateBR(new Date()),
          desc: 'Saldo Inicial',
          cat: 'Receita',
          value: balance,
          payment: 'conta'
        });
        state.balance = balance;
        ctx.balance = balance;
      }

      const txDesc  = document.getElementById('ob-tx-desc')?.value?.trim();
      const txRaw   = document.getElementById('ob-tx-value')?.value;
      const txType  = document.getElementById('ob-tx-type')?.value;
      const txValue = parseCurrencyInput(txRaw);

      // [FIX] Clear seed transactions for new users starting fresh, but keep the Saldo Inicial we might have just added
      const initialTx = state.transactions.find(t => t.desc === 'Saldo Inicial');
      state.transactions = initialTx ? [initialTx] : [];

      if (txDesc && txValue > 0) {
        const finalValue = txType === 'entrada' ? txValue : -txValue;
        state.transactions.unshift({
          id: uid('tx'),
          date: formatDateBR(new Date()),
          desc: txDesc,
          cat: txType === 'entrada' ? 'Receita' : 'Rotina',
          value: finalValue,
        });
        state.balance = Number(((state.balance || 0) + finalValue).toFixed(2));
        ctx.balance = state.balance;
      }

      saveState();
      animateOut(() => render(stepHandover(ctx.name, ctx.balance)));
    }

    if (id === 'ob-skip-3') {
      // [FIX] Clear seed transactions even if skipping
      state.transactions = [];
      state.balance = 0;
      ctx.balance = 0;
      saveState();
      animateOut(() => render(stepHandover(ctx.name, 0)));
    }

    // ── STEP 4 ────────────────────────────────────────────────────────────
    if (id === 'ob-finish') {
      state.isNewUser = false;
      saveState();
      
      // Força sync imediato para garantir que o BD salve o profile e os saldos
      syncToSupabase(state).catch(e => console.error('[Onboarding] Error syncing:', e));

      overlay.style.transition = 'opacity .4s ease';
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        if (window.appRenderAll) window.appRenderAll();
        if (window.switchTab) window.switchTab(0);
        setTimeout(() => {
          showToast(`🚀 Bem-vindo ao GrokFin Elite, ${ctx.name || 'Usuário'}!`, 'success');
        }, 300);
      }, 400);
    }
  });

  // Enter key advances step
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'SELECT') return;
    if (e.target.tagName === 'INPUT' && e.target.type !== 'file') {
      e.preventDefault();
      overlay.querySelector('.ob-btn-primary')?.click();
    }
  });

  // Start
  render(stepWelcome(ctx));
}
