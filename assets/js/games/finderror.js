/**
 * GAME · Қатені тап — поиск ошибки в предложении.
 * Задания из подготовленного проверенного набора.
 */
import { data } from '../data.js';
import { recordGame } from '../store.js';
import { esc, icon, sample, shuffle } from '../ui.js';
import { gameHud, gameResult } from './shared.js';
import { generateErrorQuiz } from '../exercises.js';

const POINTS = 10;
const ROUNDS = 10;

export function render({ level = 0 } = {}) {
  let questions = buildQuestions(level);
  let index = 0;
  let score = 0;
  let selected = null;
  let answered = false;
  let finished = false;
  let recorded = false;

  function buildQuestions(currentLevel) {
    const pool = (data.games?.errors || []).slice();
    const filtered = currentLevel
      ? pool.filter((q) => Number(q.level) === Number(currentLevel))
      : pool;
    const source = filtered.length >= 3 ? filtered : pool;
    return sample(source, Math.min(ROUNDS, source.length)).map((item) => ({
      id: item.id,
      wrong: item.wrong,
      correct: item.correct,
      options: shuffle(item.options),
      answer: item.options.indexOf(item.correct) >= 0
        ? (shuffle(item.options).indexOf(item.correct))
        : 0,
      explain: item.explain,
      level: item.level
    }));
  }

  // Rebuild with proper answer index after shuffle
  function buildQuestionsFixed(currentLevel) {
    const pool = (data.games?.errors || []).slice();
    const filtered = currentLevel
      ? pool.filter((q) => Number(q.level) === Number(currentLevel))
      : pool;
    const source = filtered.length >= 3 ? filtered : pool;
    return sample(source, Math.min(ROUNDS, source.length)).map((item) => {
      const options = shuffle(item.options.slice());
      return {
        id: item.id,
        wrong: item.wrong,
        correct: item.correct,
        options,
        answer: options.indexOf(item.correct),
        explain: item.explain,
        level: item.level
      };
    });
  }

  questions = buildQuestionsFixed(level);

  function finish() {
    finished = true;
    if (!recorded) {
      recordGame('finderror', score);
      recorded = true;
    }
  }

  function html() {
    if (finished) {
      return gameResult({
        score,
        max: questions.length * POINTS,
        note: score >= questions.length * POINTS
          ? 'Барлық қате табылды! Керемет нәтиже.'
          : 'Қателерді қайталап көріңіз.'
      });
    }

    const q = questions[index];
    return `
      <div class="page">
        <a class="back-link" href="#/games">← Ойындарға</a>
        ${gameHud({ roundValue: `${index + 1}/${questions.length}`, score })}
        <section class="card">
          <p class="small muted" style="margin-bottom:8px">Сөйлемдегі қатені табыңыз:</p>
          <p class="prompt-word" style="font-size:clamp(1.1rem,4vw,1.6rem);margin-bottom:14px">${esc(q.wrong)}</p>
          <div class="options">
            ${q.options.map((option, oi) => {
              const className = answered
                ? oi === q.answer ? 'correct'
                : oi === selected ? 'wrong' : ''
                : '';
              return `<button type="button" class="option ${className}" data-opt="${oi}" ${answered ? 'disabled' : ''}>
                <span class="opt-letter">${String.fromCharCode(65 + oi)}</span>
                <span>${esc(option)}</span>
              </button>`;
            }).join('')}
          </div>
          <div class="feedback ${answered ? 'show' : ''} ${selected === q.answer ? 'ok' : 'bad'}">
            ${answered
              ? selected === q.answer
                ? `Дұрыс! +${POINTS} ұпай. ${esc(q.explain)}`
                : `Қате. Дұрыс жауап: <b>${esc(q.options[q.answer])}</b>. ${esc(q.explain)}`
              : ''}
          </div>
          ${answered ? `<div class="btn-row" style="margin-top:12px">
            <button type="button" class="btn" data-next>${index + 1 < questions.length ? 'Келесі сұрақ' : 'Нәтижені көру'} ${icon('arrow')}</button>
          </div>` : ''}
        </section>
      </div>`;
  }

  return {
    nav: 'games',
    title: 'Қатені тап — GAME',
    html: html(),
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', (event) => {
        const option = event.target.closest('[data-opt]');
        if (option && !answered) {
          selected = Number(option.dataset.opt);
          answered = true;
          const q = questions[index];
          const correct = selected === q.answer;
          if (correct) score += POINTS;
          root.innerHTML = html();
          return;
        }

        const next = event.target.closest('[data-next]');
        if (next) {
          if (index + 1 >= questions.length) {
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
          questions = buildQuestionsFixed(level);
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
