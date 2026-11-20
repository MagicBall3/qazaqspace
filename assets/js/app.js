/**
 * QAZAQ SPACE — точка входа приложения.
 * Загружает данные, строит навигацию и обрабатывает маршруты.
 */
import { CONFIG, NAV_SECTIONS, BOTTOM_NAV } from './config.js';
import { loadData } from './data.js';
import { getState, setTheme, subscribe } from './store.js';
import { route, setNotFound, start } from './router.js';
import { esc, icon, toast, closeModal, emptyState } from './ui.js';

import { homeView } from './views/home.js';
import { lessonsView } from './views/lessons.js';
import { lessonView } from './views/lesson.js';
import { speakView, speakScenarioView } from './views/speak.js';
import { gamesView, gameView } from './views/games.js';
import { cultureView, cultureCardView } from './views/culture.js';
import { mediaView, mediaEditorView } from './views/media.js';
import { vocabView } from './views/vocab.js';
import { progressView } from './views/progress.js';
import { aboutView } from './views/about.js';

const viewRoot = document.getElementById('view');
const sideNav = document.getElementById('sideNav');
const drawerNav = document.getElementById('drawerNav');
const bottomNav = document.getElementById('bottomNav');
const drawer = document.getElementById('drawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');

let cleanupView = null;
let currentNav = 'home';

/* Навигация -------------------------------------------------------------- */

function navItemsHtml(items) {
  return items.map((item) => `
    <a class="nav-link" href="${esc(item.href)}" data-nav="${esc(item.key)}">
      ${icon(item.icon)}
      <span>${esc(item.label)}</span>
    </a>`).join('');
}

function buildNav() {
  const html = NAV_SECTIONS.map((section) => `
    <div class="nav-group">
      <span class="nav-label">${esc(section.label)}</span>
      ${navItemsHtml(section.items)}
    </div>`).join('');

  if (sideNav) sideNav.innerHTML = html;
  if (drawerNav) drawerNav.innerHTML = html;

  if (bottomNav) {
    bottomNav.innerHTML = BOTTOM_NAV.map((item) => {
      if (item.action) {
        return `<button type="button" data-action="${esc(item.action)}">
          ${icon(item.icon)}
          <span>${esc(item.label)}</span>
        </button>`;
      }
      return `<a href="${esc(item.href)}" data-nav="${esc(item.key)}">
        ${icon(item.icon)}
        <span>${esc(item.label)}</span>
      </a>`;
    }).join('');
  }
}

function markActive(navKey) {
  currentNav = navKey || 'home';
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === currentNav) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

/* Drawer ----------------------------------------------------------------- */

function openMenu() {
  if (!drawer || !drawerBackdrop) return;
  drawer.hidden = false;
  drawerBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  drawer.querySelector('button, a')?.focus();
  document.querySelectorAll('[data-action="open-menu"]').forEach((button) => {
    button.setAttribute('aria-expanded', 'true');
  });
}

function closeMenu() {
  if (!drawer || !drawerBackdrop) return;
  drawer.hidden = true;
  drawerBackdrop.hidden = true;
  document.body.style.overflow = '';
  document.querySelectorAll('[data-action="open-menu"]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
}

/* Тема ------------------------------------------------------------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
    const use = button.querySelector('use');
    if (use) use.setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
    button.setAttribute('aria-label', theme === 'dark' ? 'Ашық тақырыпқа ауысу' : 'Қараңғы тақырыпқа ауысу');
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#070d1a' : '#f4f7fb');
}

function initTheme() {
  const state = getState();
  const stored = state.theme;
  const preferred = stored || 'dark';
  applyTheme(preferred);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  applyTheme(next);
}

/* Рендер ----------------------------------------------------------------- */

function showFatal() {
  if (!viewRoot) return;
  viewRoot.innerHTML = `
    <div class="page">
      <div class="notice warn" style="margin-top:24px">
        ${icon('warn')}
        <div>
          <strong>Қосымша жүктелмеді / Приложение не загрузилось.</strong><br>
          Оқу материалдарын жүктеу мүмкін болмады. Интернет байланысын тексеріп, қайта көріңіз.
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Не істеу керек / Что делать</h3>
        <ol class="small" style="padding-left:20px;line-height:1.7;color:var(--muted)">
          <li>Сайтты жергілікті веб-сервер арқылы ашыңыз.</li>
          <li>Браузерде сайттың мекенжайын ашыңыз.</li>
          <li>Егер қате қайталанса, кейін қайта көріңіз.</li>
        </ol>
      </div>
    </div>`;
}

function renderView(resolved) {
  if (!viewRoot) return;
  const { handler, params, query } = resolved;

  if (cleanupView) {
    try {
      cleanupView();
    } catch (error) {
      console.warn('[QAZAQ SPACE] cleanup failed', error);
    }
    cleanupView = null;
  }

  if (!handler) {
    viewRoot.innerHTML = `<div class="page">${emptyState({
      icon: 'search',
      title: 'Бет табылмады',
      text: 'Мұндай бет жоқ. Басты бетке оралыңыз.',
      action: '<a class="btn btn-sm" href="#/home">Басты бет</a>'
    })}</div>`;
    document.title = 'Бет табылмады — QAZAQ SPACE';
    markActive(currentNav);
    return;
  }

  let view;
  try {
    view = handler(params, query);
  } catch (error) {
    console.error('[QAZAQ SPACE] view render failed', error);
    showFatal();
    return;
  }

  if (!view || typeof view.html !== 'string') {
    viewRoot.innerHTML = `<div class="page">${emptyState({
      icon: 'search',
      title: 'Бет табылмады',
      text: 'Мұндай бет жоқ. Басты бетке оралыңыз.',
      action: '<a class="btn btn-sm" href="#/home">Басты бет</a>'
    })}</div>`;
    document.title = 'Бет табылмады — QAZAQ SPACE';
    markActive(currentNav);
    return;
  }

  viewRoot.innerHTML = view.html || '';
  document.title = view.title || 'QAZAQ SPACE';
  markActive(view.nav || 'home');

  if (typeof view.mount === 'function') {
    try {
      cleanupView = view.mount(viewRoot) || null;
    } catch (error) {
      console.error('[QAZAQ SPACE] view mount failed', error);
      toast('Бетті іске қосу кезінде қате шықты', 'error');
    }
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
  closeMenu();
}

/* Маршруттар ------------------------------------------------------------- */

function registerRoutes() {
  route('home', () => homeView());
  route('lessons', () => lessonsView());
  route('lesson/:id', (params) => lessonView(params));
  route('vocab', () => vocabView());
  route('speak', () => speakView());
  route('speak/:id', (params) => speakScenarioView(params));
  route('games', (params, query) => gamesView(params, query));
  route('game/:id', (params, query) => gameView(params, query));
  route('culture', () => cultureView());
  route('culture/:id', (params) => cultureCardView(params));
  route('media', () => mediaView());
  route('media/new/:templateId', (params) => mediaEditorView({ templateId: params.templateId }));
  route('media/work/:workId', (params) => mediaEditorView({ workId: params.workId }));
  route('progress', () => progressView());
  route('about', () => aboutView());
  setNotFound(() => ({
    nav: 'home',
    title: 'Бет табылмады',
    html: '<div class="page"><div class="error-box"><h2>404</h2><p class="muted">Бет табылмады. Мүмкін сілтеме ескірген.</p><a class="btn" href="#/home">Басты бетке оралу</a></div></div>'
  }));
}

/* Глобальные действия ---------------------------------------------------- */

function bindGlobalActions() {
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const name = action.dataset.action;
    if (name === 'open-menu') {
      event.preventDefault();
      openMenu();
    } else if (name === 'close-menu') {
      event.preventDefault();
      closeMenu();
    } else if (name === 'toggle-theme') {
      event.preventDefault();
      toggleTheme();
    }
  });

  drawerBackdrop?.addEventListener('click', closeMenu);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      closeModal();
    }
  });

  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  const topbar = document.getElementById('topbar');
  if (topbar) {
    const onScroll = () => {
      topbar.classList.toggle('scrolled', window.scrollY > 4);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  window.addEventListener('qazaqspace:storage-error', () => {
    toast('Жетістіктерді сақтау мүмкін болмады.', 'error', 5000);
  });
}

/* Запуск ----------------------------------------------------------------- */

async function boot() {
  initTheme();
  buildNav();
  bindGlobalActions();
  registerRoutes();

  if (!viewRoot) return;

  try {
    await loadData();
  } catch (error) {
    console.error('[QAZAQ SPACE] data loading failed', error);
    showFatal();
    return;
  }

  subscribe(() => {
    // Теманы басқа беттерден өзгертсе де синхрондаймыз
    const theme = getState().theme;
    if (theme && document.documentElement.dataset.theme !== theme) {
      applyTheme(theme);
    }
  });

  start((resolved) => {
    try {
      renderView(resolved);
    } catch (error) {
      console.error('[QAZAQ SPACE] route failed', error);
      showFatal();
    }
  });
}

boot();
