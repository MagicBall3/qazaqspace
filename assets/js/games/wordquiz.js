/**
 * GAME · Сөзді тап — выбор правильного перевода.
 */
import { recordGame, recordWord } from '../store.js';
import { data } from '../data.js';
import { esc, icon, sample, shuffle } from '../ui.js';
import { gameHud, gameResult, wordsForLevel } from './shared.js';

const ROUNDS = 5;
const POINTS = 5;

export function render({ level = 0 } = {}) {
  let rounds = buildRounds(level);
  let index = 0;
  let score = 0;
  let selected = null;
  let answered = false;
  let finished = false;
  let recorded = false;

  function buildRounds(currentLevel) {
    return sample(wordsForLevel(currentLevel), ROUNDS).map((word) => {
      const wrong = sample(data.words.filter((item) => item.russian !== word.russian), 3).map((item) => item.russian);
      const options = shuffle([word.russian, ...wrong]);
      return { word, options, answer: options.indexOf(word.russian) };
    });
  }

  function finish() {
    finished = true;
    if (!recorded) {
      recordGame('wordquiz', score);
      recorded = true;
    }
  }

  function html() {
    if (finished) {
      return gameResult({
        score,
        max: ROUNDS * POINTS,
        note: score >= ROUNDS * POINTS ? 'Барлық жауап дұрыс! Сөздік қоры жақсы меңгерілген.' : 'Қате жауаптарды сөздікте қайталап көріңіз.'
      });
    }

    const round = rounds[index];
    return `
      <div class="page">
        <a class="back-link" href="#/games">← Ойындарға</a>
        ${gameHud({ roundValue: `${index + 1}/${ROUNDS}`, score })}
        <section class="card">
          <p class="small muted center" style="margin-bottom:0">Дұрыс аударманы таңдаңыз</p>
          <div class="prompt-word">${esc(round.word.kazakh)}</div>
          <div class="options">
            ${round.options.map((option, optionIndex) => {
              const className = answered
                ? optionIndex === round.answer
                  ? 'correct'
                  : optionIndex === selected
                    ? 'wrong'
                    : ''
                : '';
              return `<button type="button" class="option ${className}" data-opt="${optionIndex}" ${answered ? 'disabled' : ''}>
                <span class="opt-letter">${String.fromCharCode(65 + optionIndex)}</span>
                <span>${esc(option)}</span>
              </button>`;
            }).join('')}
          </div>
          <div class="feedback ${answered ? 'show' : ''} ${selected === round.answer ? 'ok' : 'bad'}">
            ${answered
              ? selected === round.answer
                ? `Дұрыс! +${POINTS} ұпай`
                : `Қате. Дұрыс жауап: <b>${esc(round.options[round.answer])}</b>`
              : ''}
          </div>
          ${answered ? `<div class="btn-row" style="margin-top:12px">
            <button type="button" class="btn" data-next>${index + 1 < ROUNDS ? 'Келесі раунд' : 'Нәтижені көру'} ${icon('arrow')}</button>
          </div>` : ''}
        </section>
        <p class="tiny muted center">Сөздік жазбасы: ${esc(round.word.status === 'verified' ? 'тексерілген' : 'тексеру қажет')}.</p>
      </div>`;
  }

  return {
    nav: 'games',
    title: 'Сөзді тап — GAME',
    html: html(),
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', (event) => {
        const option = event.target.closest('[data-opt]');
        if (option && !answered) {
          selected = Number(option.dataset.opt);
          answered = true;
          const round = rounds[index];
          const correct = selected === round.answer;
          if (correct) score += POINTS;
          recordWord(round.word.id, correct);
          root.innerHTML = html();
          return;
        }

        const next = event.target.closest('[data-next]');
        if (next) {
          if (index + 1 >= ROUNDS) {
            finish();
          } else {
            index += 1;
            selected = null;
            answered = false;
          }
          root.innerHTML = html();
          return;
        }

        const retry = event.target.closest('[data-retry]');
        if (retry) {
          rounds = buildRounds(level);
          index = 0;
          score = 0;
          selected = null;
          answered = false;
          finished = false;
          recorded = false;
          root.innerHTML = html();
        }
      }, { signal: controller.signal });

      return () => controller.abort();
    }
  };
}
