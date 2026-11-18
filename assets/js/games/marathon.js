/**
 * GAME · Тіл марафоны — 90 секунд, 12 сұрақ.
 * Сұрақтар сөздік, викторина және мақал-мәтел деректерінен жиналады.
 */
import { data } from '../data.js';
import { recordGame, recordWord } from '../store.js';
import { esc, icon, sample, shuffle, toast } from '../ui.js';
import { gameResult, wordsForLevel } from './shared.js';

const DURATION = 90;
const POINTS = 5;
const QUESTION_COUNT = 12;

function wordQuestions(level, count) {
  return sample(wordsForLevel(level), count).map((word) => {
    const wrong = sample(data.words.filter((item) => item.russian !== word.russian), 3).map((item) => item.russian);
    const options = shuffle([word.russian, ...wrong]);
    return {
      type: 'word',
      wordId: word.id,
      prompt: `«${word.kazakh}» сөзінің аудармасы қайсы?`,
      options,
      answer: options.indexOf(word.russian),
      explain: `${word.kazakh} — ${word.russian}`
    };
  });
}

function quizQuestions(count) {
  return sample(data.games.quiz, count).map((question) => ({
    type: 'quiz',
    prompt: question.question,
    options: question.options,
    answer: question.answer,
    explain: question.explain
  }));
}

function proverbQuestions(count) {
  return sample(data.games.proverbs, count).map((proverb) => {
    const options = shuffle(proverb.options);
    return {
      type: 'proverb',
      prompt: `«${proverb.beginning} …» мақалын аяқтаңыз.`,
      options,
      answer: options.indexOf(proverb.options[proverb.answer]),
      explain: `${proverb.ru} ${proverb.meaning || ''}`.trim()
    };
  });
}

function buildQuestions(level) {
  return shuffle([
    ...wordQuestions(level, 6),
    ...quizQuestions(3),
    ...proverbQuestions(3)
  ]).slice(0, QUESTION_COUNT);
}

export function render({ level = 0 } = {}) {
  let questions = buildQuestions(level);
  let index = 0;
  let score = 0;
  let answered = false;
  let selected = null;
  let finished = false;
  let recorded = false;
  let remaining = DURATION;
  let timerId = null;

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function finish(reason) {
    if (finished) return;
    finished = true;
    stopTimer();
    if (!recorded) {
      recordGame('marathon', score);
      recorded = true;
    }
    const note = reason === 'time'
      ? 'Уақыт бітті. Жылдамдықты да, дәлдікті де жаттықтырыңыз.'
      : 'Барлық сұраққа жауап берілді.';
    if (rootRef) rootRef.innerHTML = gameResult({
      score,
      max: questions.length * POINTS,
      note
    });
  }

  let rootRef = null;

  function html() {
    if (finished) {
      return gameResult({ score, max: questions.length * POINTS });
    }

    const question = questions[index];
    return `
      <div class="page">
        <a class="back-link" href="#/games">← Ойындарға</a>
        <div class="game-hud">
          <span class="hud-item">Сұрақ <b>${index + 1}/${questions.length}</b></span>
          <span class="hud-item">Ұпай <b>${score}</b></span>
          <span class="hud-spacer"></span>
          <span class="hud-item">Уақыт <b class="timer ${remaining <= 15 ? 'low' : ''}" data-timer>${remaining} с</b></span>
        </div>
        <section class="card">
          <p style="font-weight:700;font-size:1.02rem;margin-bottom:12px">${esc(question.prompt)}</p>
          <div class="options">
            ${question.options.map((option, optionIndex) => {
              const className = answered
                ? optionIndex === question.answer
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
          ${answered ? `
            <div class="feedback show ${selected === question.answer ? 'ok' : 'bad'}" style="margin-top:12px">
              ${selected === question.answer ? `Дұрыс! +${POINTS} ұпай.` : `Қате. Дұрыс жауап: <b>${esc(question.options[question.answer])}</b>.`}
              ${question.explain ? `<br><small>${esc(question.explain)}</small>` : ''}
            </div>
            <div class="btn-row" style="margin-top:12px">
              <button type="button" class="btn" data-next>${index + 1 < questions.length ? 'Келесі сұрақ' : 'Нәтижені көру'} ${icon('arrow')}</button>
            </div>` : ''}
        </section>
        <p class="tiny muted center">90 секунд ішінде мүмкіндігінше көп дұрыс жауап бер.</p>
      </div>`;
  }

  function tick() {
    if (finished) return;
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      const timerEl = rootRef?.querySelector('[data-timer]');
      if (timerEl) timerEl.textContent = '0 с';
      finish('time');
      return;
    }
    const timerEl = rootRef?.querySelector('[data-timer]');
    if (timerEl) {
      timerEl.textContent = `${remaining} с`;
      timerEl.classList.toggle('low', remaining <= 15);
    }
  }

  return {
    nav: 'games',
    title: 'Тіл марафоны — GAME',
    html: html(),
    mount(root) {
      rootRef = root;
      const controller = new AbortController();

      if (!finished) {
        stopTimer();
        timerId = setInterval(tick, 1000);
      }

      root.addEventListener('click', (event) => {
        const option = event.target.closest('[data-opt]');
        if (option && !answered && !finished) {
          const question = questions[index];
          selected = Number(option.dataset.opt);
          answered = true;
          const correct = selected === question.answer;
          if (correct) score += POINTS;
          if (question.type === 'word' && question.wordId) {
            recordWord(question.wordId, correct);
          }
          root.innerHTML = html();
          return;
        }

        const next = event.target.closest('[data-next]');
        if (next && !finished) {
          if (index + 1 >= questions.length) {
            finish('done');
          } else {
            index += 1;
            selected = null;
            answered = false;
            root.innerHTML = html();
          }
          return;
        }

        const retry = event.target.closest('[data-retry]');
        if (retry) {
          questions = buildQuestions(level);
          index = 0;
          score = 0;
          answered = false;
          selected = null;
          finished = false;
          recorded = false;
          remaining = DURATION;
          stopTimer();
          timerId = setInterval(tick, 1000);
          root.innerHTML = html();
        }
      }, { signal: controller.signal });

      return () => {
        stopTimer();
        controller.abort();
      };
    }
  };
}
