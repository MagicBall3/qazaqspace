/**
 * QAZAQ SPACE — переиспользуемый квиз с немедленной обратной связью.
 * Используется в уроках, культуре и части игр.
 */
import { esc } from '../ui.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function questionHtml(question, index) {
  const options = (question.options || []).map((option, optionIndex) => `
    <button type="button" class="option" data-q="${index}" data-opt="${optionIndex}">
      <span class="opt-letter">${LETTERS[optionIndex] || optionIndex + 1}</span>
      <span>${esc(option)}</span>
    </button>`).join('');

  return `
    <div class="question-block" data-question="${index}">
      <div class="question-text">${index + 1}. ${esc(question.prompt || question.question || '')}</div>
      ${question.hint ? `<div class="question-hint">${esc(question.hint)}</div>` : ''}
      <div class="options">${options}</div>
      <div class="feedback" data-feedback="${index}" role="status"></div>
    </div>`;
}

function resultHtml(score, total) {
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  return `
    <div class="result-banner" data-quiz-result>
      <span class="tag accent">Нәтиже</span>
      <div class="result-score">${score} / ${total}</div>
      <div class="result-max">${percent}% дұрыс жауап</div>
      <p class="small muted" style="margin:8px 0 0">
        ${percent >= 80 ? 'Керемет! Материал жақсы меңгерілді.' : percent >= 60 ? 'Жақсы. Қателерді қайталап көріңіз.' : 'Қайталау керек. Материалды оқып, әрекетті қайталаңыз.'}
      </p>
      <div class="btn-row" style="justify-content:center;margin-top:12px">
        <button type="button" class="btn btn-ghost" data-quiz-retry>Қайта тапсыру</button>
      </div>
    </div>`;
}

export function quizHtml(questions) {
  return `
    <div data-quiz>
      <div data-quiz-questions>
        ${(questions || []).map(questionHtml).join('')}
      </div>
      <div data-quiz-result-wrap hidden></div>
    </div>`;
}

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {Array} options.questions
 * @param {(result: {score:number,total:number}) => void} [options.onComplete]
 * @param {(question:object, correct:boolean) => void} [options.onAnswer]
 * @returns {() => void} cleanup
 */
export function attachQuiz(container, { questions, onComplete, onAnswer }) {
  const quizRoot = container.querySelector('[data-quiz]');
  if (!quizRoot) return () => {};

  const questionsWrap = quizRoot.querySelector('[data-quiz-questions]');
  const resultWrap = quizRoot.querySelector('[data-quiz-result-wrap]');
  const initialHtml = questionsWrap.innerHTML;
  const answered = new Set();
  let correctCount = 0;
  let completed = false;

  const controller = new AbortController();

  const complete = () => {
    if (completed) return;
    completed = true;
    const result = { score: correctCount, total: questions.length };
    if (onComplete) onComplete(result);
  };

  quizRoot.addEventListener('click', (event) => {
    const retry = event.target.closest('[data-quiz-retry]');
    if (retry) {
      answered.clear();
      correctCount = 0;
      completed = false;
      questionsWrap.innerHTML = initialHtml;
      questionsWrap.hidden = false;
      resultWrap.hidden = true;
      resultWrap.innerHTML = '';
      return;
    }

    const button = event.target.closest('[data-q][data-opt]');
    if (!button) return;

    const questionIndex = Number(button.dataset.q);
    const optionIndex = Number(button.dataset.opt);
    const question = questions[questionIndex];
    if (!question || answered.has(questionIndex)) return;

    answered.add(questionIndex);
    const correct = optionIndex === question.answer;
    if (correct) correctCount += 1;

    const block = quizRoot.querySelector(`[data-question="${questionIndex}"]`);
    if (block) {
      block.querySelectorAll('[data-opt]').forEach((optionButton) => {
        optionButton.disabled = true;
        const index = Number(optionButton.dataset.opt);
        if (index === question.answer) optionButton.classList.add('correct');
        if (index === optionIndex && !correct) optionButton.classList.add('wrong');
      });
      const feedback = block.querySelector(`[data-feedback="${questionIndex}"]`);
      if (feedback) {
        feedback.className = `feedback show ${correct ? 'ok' : 'bad'}`;
        feedback.innerHTML = correct
          ? `Дұрыс! ${question.explain ? esc(question.explain) : ''}`
          : `Қате. Дұрыс жауап: <b>${esc(question.options?.[question.answer] ?? '')}</b>. ${question.explain ? esc(question.explain) : ''}`;
      }
    }

    if (onAnswer) onAnswer(question, correct);

    if (answered.size === questions.length) {
      if (resultWrap) {
        resultWrap.innerHTML = resultHtml(correctCount, questions.length);
        resultWrap.hidden = false;
      }
      complete();
    }
  }, { signal: controller.signal });

  return () => controller.abort();
}
