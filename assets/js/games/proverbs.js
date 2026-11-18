/**
 * GAME · Мақалды жалғастыр — пословицы.
 */
import { data } from '../data.js';
import { recordGame } from '../store.js';
import { esc, icon, sample, shuffle } from '../ui.js';
import { gameHud, gameResult } from './shared.js';

const ROUNDS = 6;
const POINTS = 10;

export function render() {
  let rounds = build();
  let index = 0;
  let score = 0;
  let selected = null;
  let answered = false;
  let finished = false;
  let recorded = false;

  function build() {
    return sample(data.games.proverbs, Math.min(ROUNDS, data.games.proverbs.length)).map((proverb) => {
      const options = shuffle(proverb.options);
      return {
        ...proverb,
        options,
        answer: options.indexOf(proverb.options[proverb.answer])
      };
    });
  }

  function finish() {
    finished = true;
    if (!recorded) {
      recordGame('proverbs', score);
      recorded = true;
    }
  }

  function html() {
    if (finished) {
      return gameResult({
        score,
        max: rounds.length * POINTS,
        note: score === rounds.length * POINTS ? 'Барлық мақал дұрыс! Тіл байлығыңыз жақсы.' : 'Мақалдардың мағынасын оқып, қайталап көріңіз.'
      });
    }

    const round = rounds[index];
    return `
      <div class="page">
        <a class="back-link" href="#/games">← Ойындарға</a>
        ${gameHud({ roundValue: `${index + 1}/${rounds.length}`, score })}
        <section class="card">
          <p class="small muted">Мақалдың дұрыс жалғасын таңдаңыз:</p>
          <p class="prompt-word" style="font-size:clamp(1.3rem,5vw,2rem)">«${esc(round.beginning)} …»</p>
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
          ${answered ? `
            <div class="feedback show ${selected === round.answer ? 'ok' : 'bad'}">
              <b>${esc(round.ru)}</b><br>${esc(round.meaning || '')}
            </div>
            <div class="btn-row" style="margin-top:12px">
              <button type="button" class="btn" data-next>${index + 1 < rounds.length ? 'Келесі мақал' : 'Нәтижені көру'} ${icon('arrow')}</button>
            </div>` : ''}
        </section>
        <p class="tiny muted center">Мақал-мәтелдер халық ауыз әдебиетінен алынған және тексеруге жіберілген.</p>
      </div>`;
  }

  return {
    nav: 'games',
    title: 'Мақалды жалғастыр — GAME',
    html: html(),
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', (event) => {
        const option = event.target.closest('[data-opt]');
        if (option && !answered) {
          selected = Number(option.dataset.opt);
          answered = true;
          if (selected === rounds[index].answer) score += POINTS;
          root.innerHTML = html();
          return;
        }

        const next = event.target.closest('[data-next]');
        if (next) {
          if (index + 1 >= rounds.length) {
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
          rounds = build();
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
