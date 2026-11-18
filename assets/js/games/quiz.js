/**
 * GAME · Викторина — 10 вопросов о языке и культуре.
 */
import { data } from '../data.js';
import { recordGame } from '../store.js';
import { esc, icon, shuffle, toast } from '../ui.js';
import { quizHtml, attachQuiz } from '../components/quiz.js';
import { gameHud } from './shared.js';

const MAX_QUESTIONS = 10;
const POINTS = 10;

function pickQuestions(level) {
  const numeric = Number(level) || 0;
  const pool = numeric
    ? data.games.quiz.filter((question) => Number(question.level) === numeric)
    : data.games.quiz.slice();
  const source = pool.length >= 5 ? pool : data.games.quiz;
  return shuffle(source).slice(0, Math.min(MAX_QUESTIONS, source.length));
}

export function render({ level = 0 } = {}) {
  let questions = pickQuestions(level);
  let best = 0;
  let attempts = 0;

  const html = () => `
    <div class="page">
      <a class="back-link" href="#/games">← Ойындарға</a>
      ${gameHud({
        roundValue: `${questions.length} сұрақ`,
        score: best,
        extra: attempts ? `<span class="hud-item">Әрекет <b>${attempts}</b></span>` : ''
      })}
      <section class="card">
        <div class="card-head">
          <span class="card-icon soft">${icon('spark')}</span>
          <div>
            <h3>Тіл және мәдениет викторинасы</h3>
            <p>Әр дұрыс жауапқа +${POINTS} ұпай. Жауаптан кейін түсіндірме шығады.</p>
          </div>
        </div>
        ${quizHtml(questions)}
      </section>
      <p class="tiny muted center">Сұрақтар оқу деректерінен алынды және мұғалім тексеруін қажет етеді.</p>
    </div>`;

  return {
    nav: 'games',
    title: 'Викторина — GAME',
    html: html(),
    mount(root) {
      const controller = new AbortController();

      const cleanupQuiz = attachQuiz(root, {
        questions,
        onComplete({ score, total }) {
          attempts += 1;
          const points = score * POINTS;
          best = Math.max(best, points);
          const result = recordGame('quiz', points);
          const percent = total ? Math.round((score / total) * 100) : 0;
          toast(
            result.isNewBest
              ? `Жаңа рекорд: ${points} ұпай!`
              : `Нәтиже: ${score}/${total} (${percent}%)`,
            percent >= 70 ? 'ok' : 'warn'
          );
        }
      });

      return () => {
        controller.abort();
        cleanupQuiz();
      };
    }
  };
}
