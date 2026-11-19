/**
 * Орталық сөздік — барлық бөлімдер үшін бір дереккөз.
 */
import { data } from '../data.js';
import {
  esc,
  icon,
  statusBadge,
  statusLabel,
  levelLabel,
  speakKazakh,
  emptyState
} from '../ui.js';

export function vocabView() {
  const topicOptions = data.topics.map((topic) => `<option value="${esc(topic.id)}">${esc(topic.kz)} · ${esc(topic.ru)}</option>`).join('');

  const rows = data.words.map((word) => {
    const topic = data.topicIndex.get(word.topic);
    return `
      <div class="word-row" data-word data-kz="${esc(word.kazakh.toLowerCase())}" data-ru="${esc(word.russian.toLowerCase())}" data-topic="${esc(word.topic)}" data-level="${word.level}" data-status="${esc(word.status)}">
        <div>
          <div class="word-kz">${esc(word.kazakh)}</div>
          <div class="word-ru">${esc(word.russian)}</div>
        </div>
        <div class="word-side">
          <span class="tag accent">${esc(topic?.kz || word.topic)}</span>
          <span class="tag">${levelLabel(word.level)}</span>
          ${statusBadge(word.status)}
          <button type="button" class="speak-btn" data-speak="${esc(word.kazakh)}" aria-label="Сөзді тыңдау">${icon('speaker')}</button>
          <button type="button" class="word-toggle" data-toggle-word aria-label="Мысалды ашу">${icon('down')}</button>
        </div>
        <div class="word-example">
          <b>${esc(word.exampleKz)}</b><br>${esc(word.exampleRu)}
          ${word.notes ? `<br><span class="tiny">Ескерту: ${esc(word.notes)}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  return {
    nav: 'vocab',
    title: 'Сөздік — Master Vocabulary',
    html: `
      <div class="page">
        <div class="section-head">
          <div class="eyebrow">${icon('cards')} Master Vocabulary</div>
          <h2>Орталық сөздік</h2>
          <p>Барлық сөздер бір орталық сөздіктен алынады. Сабақтар, ойындар және мәтіндер осы сөздікті пайдаланады.</p>
        </div>

        <div class="grid cols-3" style="margin-bottom:16px">
          <div class="card"><div class="stat"><b>${data.words.length}</b><small>сөз жазбасы</small></div></div>
          <div class="card"><div class="stat"><b>${data.topics.length}</b><small>тақырып</small></div></div>
          <div class="card"><div class="stat"><b>${data.statusCounts.verified}</b><small>тексерілген</small></div></div>
        </div>

        <div class="notice info" style="margin-bottom:16px">
          ${icon('info')}
          <div>
            <strong>Мәртебелер:</strong>
            <span class="tag needs_review">Тексеру қажет</span> — мұғалім тексеруі қажет ·
            <span class="tag verified">Тексерілді</span> — мұғалім тексерді ·
            <span class="tag rejected">Қабылданбады</span> — қабылданбады.
            Қазіргі жазбалардың барлығы дерлік тексеруге жіберілген.
          </div>
        </div>

        <section class="card" style="margin-bottom:14px">
          <div class="grid cols-3" style="margin-bottom:12px">
            <div class="field" style="grid-column:1 / -1">
              <label for="vocabSearch">Іздеу</label>
              <div class="search-field">
                ${icon('search')}
                <input id="vocabSearch" type="search" placeholder="Қазақша немесе орысша сөз…" autocomplete="off">
              </div>
            </div>
            <div class="field">
              <label for="vocabTopic">Тақырып</label>
              <select id="vocabTopic">
                <option value="all">Барлық тақырып</option>
                ${topicOptions}
              </select>
            </div>
            <div class="field">
              <label for="vocabLevel">Деңгей</label>
              <select id="vocabLevel">
                <option value="all">Барлық сынып</option>
                <option value="1">5 сынып</option>
                <option value="2">6 сынып</option>
                <option value="3">7 сынып</option>
              </select>
            </div>
            <div class="field">
              <label for="vocabStatus">Мәртебе</label>
              <select id="vocabStatus">
                <option value="all">Барлық мәртебе</option>
                <option value="needs_review">Тексеру қажет</option>
                <option value="verified">Тексерілді</option>
                <option value="rejected">Қабылданбады</option>
              </select>
            </div>
          </div>
          <div class="progress-label">
            <span data-vocab-count>${data.words.length} сөз көрсетілуде</span>
            <button type="button" class="link-btn" data-reset-filters>${icon('reset')} Сүзгіні тазалау</button>
          </div>
        </section>

        <div class="word-list" data-vocab-list>${rows}</div>
        <div data-vocab-empty hidden>${emptyState({
          icon: 'search',
          title: 'Сөз табылмады',
          text: 'Іздеу сөзін өзгертіп немесе сүзгіні тазалап көріңіз.'
        })}</div>

        <div class="notice warn" style="margin-top:16px">
          ${icon('warn')}
          <div>
            Сөздіктегі жазбалардың мәртебелерін мұғалім басқарады. Жаңа сөздер алдымен «Тексеру қажет» мәртебесін алады.
          </div>
        </div>
      </div>`,
    mount(root) {
      const controller = new AbortController();
      const search = root.querySelector('#vocabSearch');
      const topic = root.querySelector('#vocabTopic');
      const level = root.querySelector('#vocabLevel');
      const status = root.querySelector('#vocabStatus');
      const list = root.querySelector('[data-vocab-list]');
      const count = root.querySelector('[data-vocab-count]');
      const empty = root.querySelector('[data-vocab-empty]');

      const applyFilters = () => {
        const term = String(search?.value || '').trim().toLowerCase();
        let visible = 0;
        list?.querySelectorAll('[data-word]').forEach((row) => {
          const matchesTerm = !term || row.dataset.kz.includes(term) || row.dataset.ru.includes(term);
          const matchesTopic = !topic || topic.value === 'all' || row.dataset.topic === topic.value;
          const matchesLevel = !level || level.value === 'all' || row.dataset.level === level.value;
          const matchesStatus = !status || status.value === 'all' || row.dataset.status === status.value;
          const show = matchesTerm && matchesTopic && matchesLevel && matchesStatus;
          row.hidden = !show;
          if (show) visible += 1;
        });
        if (count) count.textContent = `${visible} сөз көрсетілуде`;
        if (empty) empty.hidden = visible !== 0;
      };

      search?.addEventListener('input', applyFilters, { signal: controller.signal });
      [topic, level, status].forEach((select) => {
        select?.addEventListener('change', applyFilters, { signal: controller.signal });
      });

      root.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-toggle-word]');
        if (toggle) {
          toggle.closest('[data-word]')?.classList.toggle('open');
          return;
        }
        const speak = event.target.closest('[data-speak]');
        if (speak) {
          speakKazakh(speak.dataset.speak || '');
          return;
        }
        const reset = event.target.closest('[data-reset-filters]');
        if (reset) {
          if (search) search.value = '';
          if (topic) topic.value = 'all';
          if (level) level.value = 'all';
          if (status) status.value = 'all';
          applyFilters();
        }
      }, { signal: controller.signal });

      applyFilters();
      return () => controller.abort();
    }
  };
}

export function statusLegend() {
  return ['needs_review', 'verified', 'rejected']
    .map((status) => `${statusBadge(status)} ${statusLabel(status)}`)
    .join(' · ');
}
