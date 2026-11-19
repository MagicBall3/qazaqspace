/**
 * ҰЛТТЫҚ LAB — мәдениет карточкалары, сөздік және тапсырма.
 */
import { data, getCultureTheme } from '../data.js';
import { completeCulture, getState } from '../store.js';
import { quizHtml, attachQuiz } from '../components/quiz.js';
import { esc, icon, levelLabel, statusBadge, emptyState, toast } from '../ui.js';

export function cultureView() {
  const state = getState();
  const done = data.culture.filter((card) => state.culture[card.id]).length;

  const themeFilters = `
    <button type="button" class="chip active" data-theme-filter="all" aria-pressed="true">Барлығы · ${data.culture.length}</button>
    ${data.cultureThemes.map((theme) => {
      const cards = data.culture.filter((card) => card.theme === theme.id);
      return `<button type="button" class="chip" data-theme-filter="${esc(theme.id)}" aria-pressed="false">${esc(theme.kz)} · ${cards.length}</button>`;
    }).join('')}`;

  const cards = data.culture.map((card) => {
    const theme = getCultureTheme(card.theme);
    const completed = Boolean(state.culture[card.id]);
    return `
      <a class="card card-hover culture-card" href="#/culture/${esc(card.id)}" data-theme="${esc(card.theme)}">
        <div class="culture-top">
          <span class="tag accent">${esc(theme.kz)}</span>
          ${completed ? '<span class="tag ok">Оқылды</span>' : `<span class="tag">${levelLabel(card.level)}</span>`}
        </div>
        <h3>${esc(card.titleKz)}</h3>
        <p>${esc(card.titleRu)}</p>
        <p style="margin-top:4px">${esc(String(card.textRu).slice(0, 110))}…</p>
        <span class="arrow" style="color:var(--accent);font-weight:700;font-size:.82rem;margin-top:auto">Оқу ${icon('arrow')}</span>
      </a>`;
  }).join('');

  return {
    nav: 'culture',
    title: 'ҰЛТТЫҚ LAB',
    html: `
      <div class="page">
        <div class="section-head">
          <div class="eyebrow">${icon('culture')} Төрт бағыттың бірі</div>
          <h2>ҰЛТТЫҚ LAB · Ұлттық құндылықтар</h2>
          <p>Қазақ мәдениетін қазақ тілінде оқып, қажет жерде орысша түсіндірмені қараңыз. Әр карточкада сөздік және тапсырма бар.</p>
        </div>

        <div class="grid cols-3" style="margin-bottom:16px">
          <div class="card"><div class="stat"><b>${done}/${data.culture.length}</b><small>карточка аяқталды</small></div></div>
          <div class="card"><div class="stat"><b>${data.cultureThemes.length}</b><small>тақырыптық бағыт</small></div></div>
          <div class="card"><div class="stat"><b>Тексеру қажет</b><small>барлық жазба мәртебесі</small></div></div>
        </div>

        <div class="chips" style="margin-bottom:16px" data-theme-filter-row>${themeFilters}</div>

        <div class="grid auto-grid" data-culture-grid>${cards}</div>

        <div class="notice warn" style="margin-top:16px">
          ${icon('warn')}
          <div>
            <strong>Дереккөздер туралы.</strong>
            Мұндағы мәтіндер жалпыға белгілі мәдени және тарихи деректерге негізделген, бірақ әзірге
            «Тексеру қажет» мәртебесінде. Мұғалім қосымша дереккөздермен салыстырып тексеруі қажет.
          </div>
        </div>
      </div>`,
    mount(root) {
      const controller = new AbortController();
      const grid = root.querySelector('[data-culture-grid]');

      root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-theme-filter]');
        if (!button) return;
        const filter = button.dataset.themeFilter;
        root.querySelectorAll('[data-theme-filter]').forEach((chip) => {
          const active = chip === button;
          chip.classList.toggle('active', active);
          chip.setAttribute('aria-pressed', String(active));
        });
        if (!grid) return;
        grid.querySelectorAll('[data-theme]').forEach((card) => {
          card.hidden = filter !== 'all' && card.dataset.theme !== filter;
        });
      }, { signal: controller.signal });

      return () => controller.abort();
    }
  };
}

export function cultureCardView(params) {
  const card = data.cultureIndex.get(params.id);
  if (!card) {
    return {
      nav: 'culture',
      title: 'Карточка табылмады',
      html: `<div class="page">${emptyState({
        icon: 'culture',
        title: 'Карточка табылмады',
        text: 'ҰЛТТЫҚ LAB тізіміне оралыңыз.',
        action: '<a class="btn btn-sm" href="#/culture">ҰЛТТЫҚ LAB-қа оралу</a>'
      })}</div>`
    };
  }

  const theme = getCultureTheme(card.theme);
  const state = getState();
  const completed = Boolean(state.culture[card.id]);
  const question = {
    prompt: card.task?.question || '',
    options: card.task?.options || [],
    answer: card.task?.answer ?? 0,
    explain: card.task?.explain || ''
  };

  return {
    nav: 'culture',
    title: `${card.titleKz} — ҰЛТТЫҚ LAB`,
    html: `
      <div class="page">
        <a class="back-link" href="#/culture">← ҰЛТТЫҚ LAB</a>

        <section class="card" style="margin-bottom:14px">
          <div class="lesson-head">
            <span class="tag accent">${esc(theme.kz)}</span>
            <span class="tag">${levelLabel(card.level)}</span>
            ${statusBadge(card.status)}
            <span data-done-tag>${completed ? '<span class="tag ok">Аяқталды</span>' : ''}</span>
          </div>
          <h1 style="margin-bottom:2px">${esc(card.titleKz)}</h1>
          <p class="muted" style="margin-bottom:0">${esc(card.titleRu)}</p>
        </section>

        <div class="split" style="margin-bottom:14px">
          <section class="card">
            <div class="hr-label" style="margin-top:0">Қазақша мәтін</div>
            <p class="reader-text">${esc(card.textKz)}</p>
            <div class="divider"></div>
            <div class="hr-label" style="margin-top:0">Орысша түсіндірме</div>
            <p class="reader-text ru">${esc(card.textRu)}</p>
          </section>

          <div class="stack">
            <section class="card">
              <div class="hr-label" style="margin-top:0">Сөздік</div>
              ${(card.dictionary || []).map((item) => `
                <div class="dict-row">
                  <b>${esc(item.kz)}</b>
                  <span>${esc(item.ru)}</span>
                </div>`).join('')}
            </section>

            <section class="card">
              <div class="hr-label" style="margin-top:0">Дереккөз</div>
              <p class="small muted" style="margin:0">${esc(card.source || 'Көрсетілмеген')}</p>
              <p class="tiny muted" style="margin:8px 0 0">Материал мұғалім тексеруін қажет етеді.</p>
            </section>
          </div>
        </div>

        <section class="card">
          <div class="hr-label" style="margin-top:0">Тапсырма</div>
          ${quizHtml([question])}
          <div style="margin-top:12px" data-completion>
            ${completed ? `<div class="notice ok">${icon('check')}<div>Бұл карточка бойынша тапсырма аяқталған.</div></div>` : ''}
          </div>
        </section>

        <div class="btn-row" style="margin-top:14px;justify-content:space-between">
          <a class="btn btn-ghost btn-sm" href="#/culture">← Тізімге</a>
          <a class="btn btn-ghost btn-sm" href="#/vocab">Сөздікті ашу ${icon('cards')}</a>
        </div>
      </div>`,
    mount(root) {
      const controller = new AbortController();
      const cleanupQuiz = attachQuiz(root, {
        questions: [question],
        onComplete({ score, total }) {
          const completion = root.querySelector('[data-completion]');
          if (score >= 1 && total > 0) {
            const isNew = completeCulture(card.id);
            if (completion) {
              completion.innerHTML = `<div class="notice ok">${icon('check')}<div>Дұрыс! Карточка аяқталды.${isNew ? ' +10 ұпай' : ''}</div></div>`;
            }
            const doneTag = root.querySelector('[data-done-tag]');
            if (doneTag) doneTag.innerHTML = '<span class="tag ok">Аяқталды</span>';
            if (isNew) toast('Карточка аяқталды! +10 ұпай', 'ok');
          } else if (completion) {
            completion.innerHTML = `<div class="notice warn">${icon('warn')}<div>Жауап дұрыс емес. Мәтінді қайта оқып, тапсырманы қайта орындаңыз.</div></div>`;
          }
        }
      });

      return () => {
        controller.abort();
        cleanupQuiz();
      };
    }
  };
}
