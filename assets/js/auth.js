import { supabase, signIn, signUp, signInWithGoogle, signOut, resetPassword, onAuthChange, getCurrentUser, getCurrentProfile } from './supabase.js';
import { esc, safeUrl, initial, toast } from './ui.js';

export function authModal() {
  const root = document.createElement('div');
  root.className = 'auth-modal';
  root.innerHTML = `
    <div class="auth-modal-overlay">
      <div class="auth-modal-card">
        <button type="button" class="auth-modal-close" aria-label="Жабу">✕</button>
        <h2>Қош келдіңіз!</h2>
        <div class="auth-tabs">
          <button type="button" class="auth-tab active" data-auth-tab="login">Кіру</button>
          <button type="button" class="auth-tab" data-auth-tab="register">Тіркелу</button>
        </div>
        <form class="auth-form" data-auth-form>
          <div class="field"><label for="authEmail">Email</label><input type="email" id="authEmail" name="email" required autocomplete="email" placeholder="your@email.com"></div>
          <div class="field"><label for="authPassword">Құпиясөз</label><input type="password" id="authPassword" name="password" required minlength="6" autocomplete="current-password"></div>
          <div class="field" data-auth-field="username" hidden><label for="authUsername">Юзернейм</label><input type="text" id="authUsername" name="username" autocomplete="username"></div>
          <div class="field" data-auth-field="displayName" hidden><label for="authDisplayName">Аты-жөні</label><input type="text" id="authDisplayName" name="displayName" autocomplete="name"></div>
          <button type="submit" class="btn auth-submit">Кіру</button>
        </form>
        <div class="auth-divider"><span>немесе</span></div>
        <button type="button" class="btn btn-ghost auth-google" data-auth-google>Google</button>
        <button type="button" class="auth-link-btn" data-auth-reset>Құпиясөзді ұмыттыңыз ба?</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return new Promise((resolve) => {
    const close = () => { root.remove(); resolve(false); };
    root.querySelector('.auth-modal-close').addEventListener('click', close);
    root.querySelector('.auth-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
    const tabs = root.querySelectorAll('.auth-tab');
    const form = root.querySelector('.auth-form');
    const submitBtn = root.querySelector('.auth-submit');
    let mode = 'login';
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        mode = tab.dataset.authTab;
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        submitBtn.textContent = mode === 'login' ? 'Кіру' : 'Тіркелу';
        root.querySelector('[data-auth-field="username"]').hidden = mode !== 'register';
        root.querySelector('[data-auth-field="displayName"]').hidden = mode !== 'register';
      });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'login' ? 'Кіріп жатыр...' : 'Тіркеліп жатыр...';
      try {
        const email = form.email.value;
        const password = form.password.value;
        if (mode === 'login') {
          await signIn(email, password);
          toast('Сәтті кірдіңіз!', 'ok');
        } else {
          const username = form.username.value || 'user_' + Math.random().toString(36).slice(2, 8);
          const displayName = form.displayName.value || username;
          await signUp(email, password, username, displayName);
          toast('Тіркелу сәтті! Email растаңыз.', 'ok');
        }
        close(); resolve(true);
      } catch (err) {
        toast(err.message || 'Қате. Қайта көріңіз.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'login' ? 'Кіру' : 'Тіркелу';
      }
    });
    root.querySelector('[data-auth-google]').addEventListener('click', async () => {
      try { await signInWithGoogle(); } catch (err) { toast(err.message || 'Google кіру қате', 'error'); }
    });
    root.querySelector('[data-auth-reset]').addEventListener('click', async () => {
      const email = root.querySelector('#authEmail').value;
      if (!email) { toast('Email енгізіңіз', 'warn'); return; }
      try { await resetPassword(email); toast('Сілтеме email-ге жіберілді', 'ok'); }
      catch (err) { toast(err.message || 'Қате', 'error'); }
    });
  });
}

export async function showUserMenu() {
  const user = getCurrentUser();
  const profile = getCurrentProfile();
  if (!user) { await authModal(); return; }
  const root = document.createElement('div');
  root.className = 'user-menu';
  const avatarUrl = safeUrl(profile?.avatar_url);
  const avatar = avatarUrl
    ? `<img src="${esc(avatarUrl)}" alt="">`
    : initial(profile?.display_name);
  const displayName = esc(profile?.display_name || profile?.username || 'Қолданушы');
  const username = esc(profile?.username || '');
  root.innerHTML = `
    <div class="user-menu-overlay">
      <div class="user-menu-card">
        <button type="button" class="user-menu-close" aria-label="Жабу">✕</button>
        <div class="user-avatar">${avatar}</div>
        <h3>${displayName}</h3>
        <p class="muted">@${username}</p>
        <button type="button" class="btn btn-ghost" data-user-action="profile">Профильді өңдеу</button>
        <button type="button" class="btn btn-danger" data-user-action="logout">Шығу</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return new Promise((resolve) => {
    const close = () => { root.remove(); resolve(); };
    root.querySelector('.user-menu-close').addEventListener('click', close);
    root.querySelector('.user-menu-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
    root.querySelector('[data-user-action="logout"]').addEventListener('click', async () => {
      await signOut(); toast('Шықтыңыз', 'ok'); close(); window.location.reload();
    });
  });
}

export function initAuth() {
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-auth-login]')) { await authModal(); }
    if (e.target.closest('[data-user-menu]')) { await showUserMenu(); }
  });
  onAuthChange((user) => {
    document.querySelectorAll('[data-auth-required]').forEach((el) => { el.hidden = !user; });
    document.querySelectorAll('[data-auth-hidden]').forEach((el) => { el.hidden = !!user; });
  });
}
