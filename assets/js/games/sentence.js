/**
 * GAME · Сөйлем құрастыр — порядок слов.
 */
import { data } from '../data.js';
import { recordGame } from '../store.js';
import { esc, icon, sample, shuffle } from '../ui.js';
import { gameHud, gameResult } from './shared.js';

const ROUNDS = 4;
const POINTS = 10;

export function render({ level = 0 } = {}) {
  const pool = data.games.sentences.filter((sentence) => !level || Number(sentence.level) === Number(level));
  const source = pool.length >= 2 ? pool : data.games.sentences;

  let rounds = sample(source, Math.min(ROUNDS, source.length));
  let index = 0;
  let score = 0;
  let current = prepare(rounds[0]);
  let answered = false;
  let feedback = '';
  let finished = false;
  let recorded = false;

  function prepare(round) {
    let poolWords = shuffle(round.words);
    if (round.words.length > 1 && poolWords.join(' ') === round.words.join(' ')) {
      poolWords = shuffle(poolWords);
    }
    return { round, pool: poolWords, answer: [] };
  }

  function isCorrect() {
    return current.answer.join(' ') === current.round.words.join(' ');
  }

  function finish() {
    finished = true;
    if (!recorded) {
      recordGame('sentence', score);
      recorded = true;
    }
  }

  function html() {
    if (finished) {
      return gameResult({
        score,
        max: rounds.length * POINTS,
        note: score >= rounds.length * POINTS ? 'Барлық сөйлем дұрыс құрылды!' : 'Сөз тәртібін еске түсіріп, қайта көріңіз.'
      });
    }

    return `
      <div class="page">
        <a class="back-link" href="#/games">← Ойындарға</a>
        ${gameHud({ roundValue: `${index + 1}/${rounds.length}`, score })}
        <section class="card">
          <p class="small muted">Сөздерді дұрыс ретпен қойып, сөйлем құрастырыңыз:</p>
          <p style="font-weight:700;font-size:1.02rem">«${esc(current.round.ru)}»</p>

          <div class="token-line" aria-label="Құрастырылған сөйлем">
            ${current.answer.length
              ? current.answer.map((word, wordIndex) => `
                <button type="button" class="token" data-remove="${wordIndex}">${esc(word)}</button>`).join('')
              : '<span class="placeholder">Сөздерді төменнен таңдаңыз…</span>'}
          </div>

          <div class="token-pool">
            ${current.pool.map((word, wordIndex) => `
              <button type="button" class="chip" data-add="${wordIndex}">${esc(word)}</button>`).join('')}
          </div>

          <div class="feedback show ${feedback.startsWith('Дұрыс') ? 'ok' : feedback ? 'bad' : 'info'}" style="${feedback ? '' : 'display:none'}">${feedback}</div>

          <div class="btn-row" style="margin-top:12px">
            ${answered
              ? `<button type="button" class="btn" data-next>${index + 1 < rounds.length ? 'Келесі сөйлем' : 'Нәтижені көру'} ${icon('arrow')}</button>`
              : `<button type="button" class="btn" data-check ${current.answer.length ? '' : 'disabled'}>Тексеру</button>
                 <button type="button" class="btn btn-ghost" data-reset>Басынан</button>`}
          </div>
        </section>
        <p class="tiny muted center">Кеңес: қазақ тілінде баяндауыш көбіне сөйлем соңында тұрады.</p>
      </div>`;
  }

  return {
    nav: 'games',
    title: 'Сөйлем құрастыр — GAME',
    html: html(),
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', (event) => {
        const add = event.target.closest('[data-add]');
        if (add) {
          if (answered) return;
          const wordIndex = Number(add.dataset.add);
          current.answer.push(current.pool.splice(wordIndex, 1)[0]);
          feedback = '';
          root.innerHTML = html();
          return;
        }

        const remove = event.target.closest('[data-remove]');
        if (remove) {
          if (answered) return;
          const wordIndex = Number(remove.dataset.remove);
          current.pool.push(current.answer.splice(wordIndex, 1)[0]);
          feedback = '';
          root.innerHTML = html();
          return;
        }

        const reset = event.target.closest('[data-reset]');
        if (reset) {
          current = prepare(current.round);
          answered = false;
          feedback = '';
          root.innerHTML = html();
          return;
        }

        const check = event.target.closest('[data-check]');
        if (check) {
          if (!current.answer.length) {
            feedback = 'Алдымен сөздерді таңдаңыз.';
          } else if (isCorrect()) {
            answered = true;
            score += POINTS;
            feedback = `Дұрыс! +${POINTS} ұпай`;
          } else {
            feedback = 'Қате. Сөз тәртібін тексеріңіз.';
          }
          root.innerHTML = html();
          return;
        }

        const next = event.target.closest('[data-next]');
        if (next) {
          if (index + 1 >= rounds.length) {
            finish();
          } else {
            index += 1;
            current = prepare(rounds[index]);
            answered = false;
            feedback = '';
          }
          root.innerHTML = html();
          return;
        }

        const retry = event.target.closest('[data-retry]');
        if (retry) {
          rounds = sample(source, Math.min(ROUNDS, source.length));
          index = 0;
          score = 0;
          current = prepare(rounds[0]);
          answered = false;
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
