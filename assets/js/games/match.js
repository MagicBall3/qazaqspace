/**
 * GAME · Жұпты тап — соответствие казахского слова и перевода.
 */
import { recordGame, recordWord } from '../store.js';
import { esc, sample, shuffle, icon } from '../ui.js';
import { gameHud, gameResult, wordsForLevel } from './shared.js';

const PAIRS = 8;

export function render({ level = 0 } = {}) {
  let pairs = sample(wordsForLevel(level), Math.min(PAIRS, wordsForLevel(level).length));
  let left = shuffle(pairs);
  let right = shuffle(pairs);
  const matched = new Set();
  let selectedLeft = null;
  let score = 0;
  let mistakes = 0;
  let feedback = '';
  let feedbackType = 'info';
  let finished = false;
  let recorded = false;

  function finish() {
    finished = true;
    if (!recorded) {
      recordGame('match', score);
      recorded = true;
    }
  }

  function html() {
    if (finished) {
      return gameResult({
        score,
        max: pairs.length * 10,
        note: mistakes === 0 ? 'Бір қатесіз! Керемет нәтиже.' : `Қате саны: ${mistakes}. Сөздерді қайталап көріңіз.`
      });
    }

    return `
      <div class="page">
        <a class="back-link" href="#/games">← Ойындарға</a>
        ${gameHud({ roundValue: `${matched.size}/${pairs.length}`, score, extra: `<span class="hud-item">Қате <b>${mistakes}</b></span>` })}
        <section class="card">
          <p class="small muted">Қазақша сөзді және оның орысша аудармасын сәйкестендіріңіз. Дұрыс жұп жасыл түске боялады.</p>
          <div class="match-grid" style="margin-top:12px">
            <div>
              <div class="match-col-title">Қазақша</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${left.map((word) => `
                  <button type="button" class="match-item ${matched.has(word.id) ? 'matched' : selectedLeft === word.id ? 'selected' : ''}"
                    data-side="left" data-id="${esc(word.id)}" ${matched.has(word.id) ? 'disabled' : ''}>
                    ${esc(word.kazakh)}
                  </button>`).join('')}
              </div>
            </div>
            <div>
              <div class="match-col-title">Орысша</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${right.map((word) => `
                  <button type="button" class="match-item ${matched.has(word.id) ? 'matched' : ''}"
                    data-side="right" data-id="${esc(word.id)}" ${matched.has(word.id) ? 'disabled' : ''}>
                    ${esc(word.russian)}
                  </button>`).join('')}
              </div>
            </div>
          </div>
          <div class="feedback show ${feedbackType}" style="margin-top:14px;${feedback ? '' : 'display:none'}">${feedback}</div>
          <div class="btn-row" style="margin-top:12px">
            <button type="button" class="btn btn-ghost" data-reset>${icon('reset')} Қайта бастау</button>
          </div>
        </section>
        <p class="tiny muted center">Дұрыс жұп: +10 ұпай. Қате: −2 ұпай.</p>
      </div>`;
  }

  function resetSelection() {
    selectedLeft = null;
  }

  return {
    nav: 'games',
    title: 'Жұпты тап — GAME',
    html: html(),
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', (event) => {
        const item = event.target.closest('[data-side]');
        if (item) {
          if (finished || item.disabled) return;
          const id = item.dataset.id;
          if (item.dataset.side === 'left') {
            if (matched.has(id)) return;
            selectedLeft = selectedLeft === id ? null : id;
            feedback = '';
            root.innerHTML = html();
            return;
          }

          // Правая колонка
          if (!selectedLeft) {
            feedback = 'Алдымен сол жақтан қазақша сөзді таңдаңыз.';
            feedbackType = 'info';
            root.innerHTML = html();
            return;
          }

          if (selectedLeft === id) {
            const word = pairs.find((pair) => pair.id === id);
            matched.add(id);
            score += 10;
            recordWord(id, true);
            feedback = `Дұрыс! «${esc(word?.kazakh || '')}» — ${esc(word?.russian || '')}. +10 ұпай`;
            feedbackType = 'ok';
            resetSelection();
            if (matched.size === pairs.length) finish();
          } else {
            score = Math.max(0, score - 2);
            mistakes += 1;
            recordWord(selectedLeft, false);
            const selectedWord = pairs.find((pair) => pair.id === selectedLeft);
            feedback = `Бұл жұп емес. «${esc(selectedWord?.kazakh || '')}» сөзінің аудармасын қайта іздеңіз. −2 ұпай`;
            feedbackType = 'bad';
            resetSelection();
          }
          root.innerHTML = html();
          return;
        }

        const reset = event.target.closest('[data-reset]');
        if (reset) {
          pairs = sample(wordsForLevel(level), Math.min(PAIRS, wordsForLevel(level).length));
          left = shuffle(pairs);
          right = shuffle(pairs);
          matched.clear();
          selectedLeft = null;
          score = 0;
          mistakes = 0;
          feedback = '';
          finished = false;
          recorded = false;
          root.innerHTML = html();
          return;
        }

        const retry = event.target.closest('[data-retry]');
        if (retry) {
          pairs = sample(wordsForLevel(level), Math.min(PAIRS, wordsForLevel(level).length));
          left = shuffle(pairs);
          right = shuffle(pairs);
          matched.clear();
          selectedLeft = null;
          score = 0;
          mistakes = 0;
          feedback = '';
          finished = false;
          recorded = false;
          root.innerHTML = html();
        }
      }, { signal: controller.signal });

      return () => controller.abort();
    }
  };
}
