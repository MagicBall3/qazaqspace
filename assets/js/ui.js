/**
 * QAZAQ SPACE — UI helpers: escaping, icons, toasts, modals, speech, formatting.
 */
import { LEVEL_LABELS } from './config.js';

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function icon(name, className = '') {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function levelLabel(level) {
  return LEVEL_LABELS[Number(level)] || `${level} сынып`;
}

const STATUS_LABELS = {
  needs_review: 'Тексеру қажет',
  verified: 'Тексерілді',
  rejected: 'Қабылданбады'
};

const STATUS_TITLES = {
  needs_review: 'Мұғалім тексеруі қажет / Требуется проверка преподавателем',
  verified: 'Мұғалім тексерген / Проверено преподавателем',
  rejected: 'Мұғалім қабылдамаған / Отклонено преподавателем'
};

export function statusBadge(status) {
  const key = STATUS_LABELS[status] ? status : 'needs_review';
  return `<span class="tag ${key}" title="${esc(STATUS_TITLES[key])}">${STATUS_LABELS[key]}</span>`;
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.needs_review;
}

/* Toast ------------------------------------------------------------------ */

let toastTimer = null;

export function toast(message, type = 'ok', ms = 2800) {
  const el = qs('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type === 'ok' ? '' : type}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, ms);
}

/* Modal ------------------------------------------------------------------ */

let modalPreviousFocus = null;

export function closeModal() {
  const wrap = qs('#modal');
  if (!wrap || wrap.hidden) return;
  wrap.hidden = true;
  wrap.innerHTML = '';
  if (modalPreviousFocus && typeof modalPreviousFocus.focus === 'function') {
    modalPreviousFocus.focus();
  }
  modalPreviousFocus = null;
}

export function openModal({ title, body = '', actions = [], onClose = null }) {
  const wrap = qs('#modal');
  if (!wrap) return;
  modalPreviousFocus = document.activeElement;

  wrap.innerHTML = `
    <div class="modal" role="document">
      <h2 id="modalTitle">${esc(title)}</h2>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">
        ${actions.map((a, i) => `
          <button type="button" class="btn ${a.variant || 'btn-ghost'}" data-modal-action="${i}">
            ${esc(a.label)}
          </button>`).join('')}
      </div>
    </div>`;
  wrap.hidden = false;

  const finish = (result) => {
    closeModal();
    if (onClose) onClose(result);
  };

  wrap.querySelectorAll('[data-modal-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = actions[Number(btn.dataset.modalAction)];
      if (!action) return finish(undefined);
      const keepOpen = action.onClick ? action.onClick() : false;
      if (!keepOpen) finish(action.value);
    });
  });

  wrap.onclick = (event) => {
    if (event.target === wrap) finish(undefined);
  };

  const first = wrap.querySelector('.modal .btn');
  if (first) setTimeout(() => first.focus(), 30);
}

export function confirmDialog({
  title = 'Растау',
  message = '',
  confirmLabel = 'Иә, жалғастыру',
  cancelLabel = 'Болдырмау',
  danger = false
}) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: `<p>${message}</p>`,
      actions: [
        { label: cancelLabel, variant: 'btn-ghost', value: false },
        { label: confirmLabel, variant: danger ? 'btn-danger' : 'btn', value: true }
      ],
      onClose: (result) => resolve(result === true)
    });
  });
}

/* Progress --------------------------------------------------------------- */

export function progressBar(value, max = 100, { thin = false, label = '' } = {}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));
  return `
    <div class="progress-wrap">
      ${label ? `<div class="progress-label"><span>${esc(label)}</span><b>${pct}%</b></div>` : ''}
      <div class="bar ${thin ? 'thin' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <span style="width:${pct}%"></span>
      </div>
    </div>`;
}

export function emptyState({ icon: iconName = 'info', title, text = '', action = '' }) {
  return `
    <div class="empty">
      <div class="empty-icon">${icon(iconName)}</div>
      <h3>${esc(title)}</h3>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${action ? `<div style="margin-top:14px">${action}</div>` : ''}
    </div>`;
}

/* Formatting ------------------------------------------------------------- */

export function formatDate(timestamp) {
  if (!timestamp) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(timestamp));
  } catch (error) {
    return '';
  }
}

export function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sample(list, count) {
  return shuffle(list).slice(0, Math.max(0, count));
}

export function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch (error) {
    toast('Файлды жүктеу мүмкін болмады / Не удалось скачать файл', 'error');
    return false;
  }
}

/* Kazakh speech synthesis ------------------------------------------------ */

let speechPrepared = false;

export function speakKazakh(text) {
  if (!('speechSynthesis' in window)) {
    toast('Бұл браузерде дауыс шығару қолжетімсіз / Озвучивание недоступно', 'warn');
    return false;
  }
  if (!speechPrepared) {
    // Некоторые браузеры загружают голоса асинхронно
    window.speechSynthesis.getVoices();
    speechPrepared = true;
  }
  const voices = window.speechSynthesis.getVoices();
  const kkVoice = voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith('kk'));
  if (!kkVoice) {
    toast('Қазақша дауыс табылмады. Мәтінді дауыстап оқып көріңіз. / Казахский голос не установлен — прочитайте текст вслух.', 'warn', 4200);
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = kkVoice;
  utterance.lang = 'kk-KZ';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
  return true;
}

/* Small DOM utilities ---------------------------------------------------- */

export function setBusy(button, busy, busyLabel = '…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = busyLabel;
  } else {
    button.disabled = false;
    if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel;
  }
}
