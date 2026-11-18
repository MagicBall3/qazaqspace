/**
 * MEDIA SPACE — шаблондар және шығармашылық жұмыстар.
 * Жұмыстар тек localStorage-та сақталады, еш жерге жарияланбайды.
 */
import { data } from '../data.js';
import { getState, saveWork, deleteWork } from '../store.js';
import { navigate } from '../router.js';
import {
  esc,
  icon,
  levelLabel,
  toast,
  confirmDialog,
  formatDate,
  downloadText,
  emptyState
} from '../ui.js';

const TYPE_LABELS = {
  text: 'Мәтін',
  interview: 'Сұхбат',
  news: 'Жаңалық',
  podcast: 'Подкаст',
  report: 'Репортаж',
  script: 'Сценарий'
};

function sentenceCount(text) {
  return String(text || '')
    .split(/[.!?…]+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1).length;
}

function draftKey(templateId, workId) {
  return `qazaqspace.draft.${workId ? `work:${workId}` : `tpl:${templateId || 'free'}`}`;
}

function readDraft(key) {
  try {
    return sessionStorage.getItem(key) || '';
  } catch (error) {
    return '';
  }
}

function writeDraft(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch (error) { /* приватный режим */ }
}

function clearDraft(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (error) { /* игнорируем */ }
}

/* Каталог ---------------------------------------------------------------- */

export function mediaView() {
  const state = getState();

  const templateCards = data.media.map((template) => `
    <article class="card media-card">
      <div class="media-format">${esc(TYPE_LABELS[template.type] || template.type)} · ${levelLabel(template.level)}</div>
      <h3>${esc(template.titleKz)}</h3>
      <p class="muted" style="margin:0">${esc(template.titleRu)}</p>
      <p class="small" style="margin:0">${esc(template.brief)}</p>
      <div class="btn-row">
        <a class="btn btn-sm" href="#/media/new/${esc(template.id)}">Жазу ${icon('arrow')}</a>
      </div>
    </article>`).join('');

  const works = state.media.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const workCards = works.length
    ? works.map((work) => `
      <article class="card work-card" data-work="${esc(work.id)}">
        <div class="card-head" style="margin-bottom:2px">
          <div style="flex:1;min-width:0">
            <b style="display:block;font-size:.95rem">${esc(work.title || 'Атаусыз жұмыс')}</b>
            <span class="work-date">${formatDate(work.updatedAt || work.createdAt)}${work.migrated ? ' · ескі прототиптен' : ''}</span>
          </div>
          <span class="tag">${esc(work.templateId ? (data.mediaIndex.get(work.templateId)?.titleKz || 'Шаблон') : 'Еркін жұмыс')}</span>
        </div>
        <div class="work-text">${esc(work.text)}</div>
        <div class="work-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-toggle-work>Толық көру</button>
          <a class="btn btn-ghost btn-sm" href="#/media/work/${esc(work.id)}">Өңдеу</a>
          <button type="button" class="btn btn-ghost btn-sm" data-download="${esc(work.id)}">${icon('download')} Жүктеу</button>
          <button type="button" class="btn btn-danger btn-sm" data-delete="${esc(work.id)}">${icon('trash')} Өшіру</button>
        </div>
      </article>`).join('')
    : emptyState({
      icon: 'media',
      title: 'Әзірге жұмыс жоқ',
      text: 'Шаблон таңдап, бірінші мәтініңізді жазыңыз. Жұмыс осы құрылғыда сақталады.'
    });

  return {
    nav: 'media',
    title: 'MEDIA SPACE',
    html: `
      <div class="page">
        <div class="section-head">
          <div class="eyebrow">${icon('media')} Бес бағыттың бірі</div>
          <h2>MEDIA SPACE · Шығармашылық</h2>
          <p>Мектеп өмірі туралы мәтін, жаңалық, сұхбат, подкаст немесе репортаж жоспарын жасаңыз. Дайын шаблонды таңдап, өз сөздеріңізбен толтырыңыз.</p>
        </div>

        <div class="grid cols-3" style="margin-bottom:16px">
          <div class="card"><div class="stat"><b>${data.media.length}</b><small>шаблон</small></div></div>
          <div class="card"><div class="stat"><b>${works.length}</b><small>сақталған жұмыс</small></div></div>
          <div class="card"><div class="stat"><b>local</b><small>сақтау орны</small></div></div>
        </div>

        <div class="notice info" style="margin-bottom:18px">
          ${icon('info')}
          <div>
            <strong>Жеке деректер туралы.</strong>
            Жұмыста өз атыңды, сыныбыңды жазуға болады. Телефон, мекенжай, құпия сөздерді жазбаңыз.
            Жұмыстар серверге жіберілмейді және басқа оқушыларға көрінбейді.
          </div>
        </div>

        <section style="margin-bottom:22px">
          <div class="hr-label">Шаблондар</div>
          <div class="grid cols-3">${templateCards}</div>
        </section>

        <section>
          <div class="hr-label">Менің жұмыстарым · ${works.length}</div>
          <div class="stack" data-works>${workCards}</div>
        </section>
      </div>`,
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', async (event) => {
        const toggle = event.target.closest('[data-toggle-work]');
        if (toggle) {
          const card = toggle.closest('[data-work]');
          if (card) {
            card.classList.toggle('expanded');
            toggle.textContent = card.classList.contains('expanded') ? 'Қысқарту' : 'Толық көру';
          }
          return;
        }

        const download = event.target.closest('[data-download]');
        if (download) {
          const work = state.media.find((item) => item.id === download.dataset.download);
          if (!work) return;
          const safeTitle = (work.title || 'qazaqspace-jumys').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
          downloadText(`${safeTitle}.txt`, work.text);
          return;
        }

        const remove = event.target.closest('[data-delete]');
        if (remove) {
          const id = remove.dataset.delete;
          const work = state.media.find((item) => item.id === id);
          const confirmed = await confirmDialog({
            title: 'Жұмысты өшіру?',
            message: `«${esc(work?.title || 'Жұмыс')}» өшіріледі. Бұл әрекетті қайтару мүмкін емес.`,
            confirmLabel: 'Өшіру',
            cancelLabel: 'Болдырмау',
            danger: true
          });
          if (!confirmed) return;
          deleteWork(id);
          toast('Жұмыс өшірілді', 'ok');
          navigate('/media', { replace: true });
        }
      }, { signal: controller.signal });

      return () => controller.abort();
    }
  };
}

/* Редактор --------------------------------------------------------------- */

export function mediaEditorView(params) {
  const isNew = Boolean(params.templateId);
  const work = isNew ? null : getState().media.find((item) => item.id === params.workId);
  const template = isNew
    ? data.mediaIndex.get(params.templateId)
    : (work?.templateId ? data.mediaIndex.get(work.templateId) : null);

  if (!isNew && !work) {
    return {
      nav: 'media',
      title: 'Жұмыс табылмады',
      html: `<div class="page">${emptyState({
        icon: 'media',
        title: 'Жұмыс табылмады',
        text: 'Ол өшірілген болуы мүмкін. MEDIA SPACE каталогына оралыңыз.',
        action: '<a class="btn btn-sm" href="#/media">MEDIA SPACE-ке оралу</a>'
      })}</div>`
    };
  }

  if (isNew && !template) {
    return {
      nav: 'media',
      title: 'Шаблон табылмады',
      html: `<div class="page">${emptyState({
        icon: 'media',
        title: 'Шаблон табылмады',
        text: 'Басқа шаблонды таңдаңыз.',
        action: '<a class="btn btn-sm" href="#/media">Шаблондарға оралу</a>'
      })}</div>`
    };
  }

  const key = draftKey(template?.id, work?.id);
  const storedDraft = readDraft(key);
  const initialText = storedDraft || work?.text || '';
  const initialTitle = work?.title || template?.titleKz || '';
  const minSentences = template?.minSentences || 3;

  const starters = (template?.starters || []).map((starter) => `
    <button type="button" class="chip" data-starter="${esc(starter)}">${esc(starter)}</button>`).join('');

  const checklist = (template?.checklist || []).map((item, index) => `
    <label class="check-row">
      <input type="checkbox" data-check="${index}">
      <span>${esc(item)}</span>
    </label>`).join('');

  return {
    nav: 'media',
    title: `${initialTitle} — MEDIA SPACE`,
    html: `
      <div class="page">
        <a class="back-link" href="#/media">← MEDIA SPACE</a>

        <section class="card" style="margin-bottom:14px">
          <div class="lesson-head">
            <span class="tag accent">${esc(template ? (TYPE_LABELS[template.type] || template.type) : 'Жұмыс')}</span>
            ${template ? `<span class="tag">${levelLabel(template.level)}</span>` : ''}
            <span class="tag warn">Тек осы құрылғыда</span>
          </div>
          <h2 style="margin-bottom:4px">${esc(initialTitle)}</h2>
          ${template ? `<p class="muted" style="margin-bottom:10px">${esc(template.brief)}</p>
          <div class="lesson-goal"><b>Тапсырма:</b> ${esc(template.prompt)}</div>` : '<p class="muted">Өз жұмысыңызды өңдеп отырсыз.</p>'}
        </section>

        <div class="split">
          <section class="card">
            <div class="field" style="margin-bottom:12px">
              <label for="workTitle">Тақырып</label>
              <input id="workTitle" type="text" data-title value="${esc(initialTitle)}" maxlength="120" autocomplete="off">
            </div>

            <div class="field">
              <label for="workText">Мәтін</label>
              <textarea id="workText" class="editor-textarea" data-text maxlength="12000" placeholder="Мұнда жаза бастаңыз…">${esc(initialText)}</textarea>
            </div>

            <div class="editor-meta">
              <span><b data-count>0</b> сөйлем</span>
              <span>Мақсат: кемінде <b>${minSentences}</b> сөйлем</span>
              <span data-count-status class="tag warn">Жеткіліксіз</span>
            </div>

            <div class="btn-row" style="margin-top:14px">
              <button type="button" class="btn" data-save>${icon('check')} Сақтау</button>
              <button type="button" class="btn btn-ghost" data-download-work>${icon('download')} .txt жүктеу</button>
              ${work ? `<button type="button" class="btn btn-danger btn-ghost" data-delete-work>${icon('trash')} Өшіру</button>` : ''}
            </div>
            <p class="tiny muted" style="margin:10px 0 0" data-save-note>
              Сақталмаған мәтін осы беттен шыққанда жоғалуы мүмкін. Жұмыс автоматты түрде жоба ретінде сақталады, бірақ ол прогреске есептелмейді.
            </p>
          </section>

          <div class="stack">
            ${starters ? `<section class="card">
              <div class="hr-label" style="margin-top:0">Бастау үшін</div>
              <p class="small muted">Дайын бастаманы басып, мәтінге қосыңыз.</p>
              <div class="chips">${starters}</div>
            </section>` : ''}

            ${checklist ? `<section class="card">
              <div class="hr-label" style="margin-top:0">Өзін-өзі тексеру</div>
              <p class="small muted">Мәтінді аяқтаған соң белгілеңіз. Бұл автоматты баға емес.</p>
              <div class="check-list">${checklist}</div>
            </section>` : ''}

            <section class="card">
              <div class="hr-label" style="margin-top:0">Ескерту</div>
              <p class="small muted" style="margin:0">
                Мұғалім мәтінді тексеруі мүмкін, бірақ жұмыс серверге жіберілмейді.
                Сақтау үшін «Сақтау» түймесін басыңыз.
              </p>
            </section>
          </div>
        </div>
      </div>`,
    mount(root) {
      const controller = new AbortController();
      const titleInput = root.querySelector('[data-title]');
      const textArea = root.querySelector('[data-text]');
      const countLabel = root.querySelector('[data-count]');
      const countStatus = root.querySelector('[data-count-status]');
      const saveButton = root.querySelector('[data-save]');

      const currentText = () => String(textArea?.value || '');
      const currentTitle = () => String(titleInput?.value || '').trim();

      const refreshMeta = () => {
        const count = sentenceCount(currentText());
        if (countLabel) countLabel.textContent = String(count);
        if (countStatus) {
          const enough = count >= minSentences;
          countStatus.className = `tag ${enough ? 'ok' : 'warn'}`;
          countStatus.textContent = enough ? 'Жеткілікті' : 'Жеткіліксіз';
        }
        if (saveButton) saveButton.disabled = !currentText().trim();
        writeDraft(key, currentText());
      };

      const save = () => {
        const text = currentText();
        if (!text.trim()) {
          toast('Мәтін бос. Алдымен жазыңыз.', 'warn');
          return;
        }
        try {
          const saved = saveWork({
            id: work?.id || null,
            templateId: template?.id || work?.templateId || null,
            title: currentTitle() || template?.titleKz || 'Менің жұмысым',
            text
          });
          if (!saved) {
            toast('Сақтау мүмкін болмады', 'error');
            return;
          }
          clearDraft(key);
          toast('Жұмыс сақталды', 'ok');
          navigate(`/media/work/${saved.id}`, { replace: true });
        } catch (error) {
          toast(error.message || 'Сақтау қатесі', 'error');
        }
      };

      root.addEventListener('click', async (event) => {
        const starter = event.target.closest('[data-starter]');
        if (starter) {
          const text = starter.dataset.starter || '';
          if (textArea) {
            const prefix = textArea.value && !/\s$/.test(textArea.value) ? ' ' : '';
            textArea.value = `${textArea.value}${prefix}${text}`;
            textArea.focus();
            textArea.setSelectionRange(textArea.value.length, textArea.value.length);
            refreshMeta();
          }
          return;
        }

        if (event.target.closest('[data-save]')) {
          save();
          return;
        }

        if (event.target.closest('[data-download-work]')) {
          const text = currentText();
          if (!text.trim()) {
            toast('Жүктеу үшін мәтін жазыңыз', 'warn');
            return;
          }
          const safeTitle = (currentTitle() || 'qazaqspace-jumys').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
          downloadText(`${safeTitle}.txt`, `${currentTitle()}\n\n${text}\n`);
          return;
        }

        if (event.target.closest('[data-delete-work]') && work) {
          const confirmed = await confirmDialog({
            title: 'Жұмысты өшіру?',
            message: 'Бұл жұмыс қайтарымсыз жойылады.',
            confirmLabel: 'Өшіру',
            cancelLabel: 'Болдырмау',
            danger: true
          });
          if (!confirmed) return;
          deleteWork(work.id);
          clearDraft(key);
          toast('Жұмыс өшірілді', 'ok');
          navigate('/media', { replace: true });
        }
      }, { signal: controller.signal });

      textArea?.addEventListener('input', refreshMeta, { signal: controller.signal });
      titleInput?.addEventListener('input', () => writeDraft(key, currentText()), { signal: controller.signal });

      refreshMeta();
      textArea?.focus();

      return () => controller.abort();
    }
  };
}
