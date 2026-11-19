/**
 * Сабақ беті: мақсат → сөздер → мысалдар → түсіндірме → практика → нәтиже.
 */
import { data, wordsForLesson } from '../data.js';
import { completeLesson, getState } from '../store.js';
import { quizHtml, attachQuiz } from '../components/quiz.js';
import {
  esc,
  icon,
  levelLabel,
  statusBadge,
  speakKazakh,
  toast,
  emptyState
} from '../ui.js';

function completionHtml(record) {
  if (!record) {
    return `<div class="notice" data-completion>${icon('info')}<div>Практиканы орындаңыз. Кемінде 75% дұрыс жауап болса, сабақ аяқталды деп есептеледі.</div></div>`;
  }
  const score = record.score ?? 0;
  const total = record.total ?? 0;
  return `
    <div class="notice ok" data-completion>
      ${icon('check')}
      <div>
        <strong>Сабақ аяқталды.</strong>
        ${total ? `Нәтиже: ${score} / ${total}.` : ''}
        ${record.migrated ? ' Бұл нәтиже ескі нұсқадан көшірілді, қайта тапсыруға болады.' : ''}
      </div>
    </div>`;
}

export function lessonView(params) {
  const lesson = data.lessonIndex.get(params.id);
  if (!lesson) {
    return {
      nav: 'lessons',
      title: 'Сабақ табылмады',
      html: `<div class="page">${emptyState({
        icon: 'book',
        title: 'Сабақ табылмады',
        text: 'Мүмкін сілтеме ескірген. Сабақтар тізіміне оралыңыз.',
        action: '<a class="btn btn-sm" href="#/lessons">Сабақтарға оралу</a>'
      })}</div>`
    };
  }

  const state = getState();
  const words = wordsForLesson(lesson);
  const record = state.lessons[lesson.id];
  const nextLesson = data.lessons.find((item) => Number(item.level) === Number(lesson.level) && item.id !== lesson.id)
    || data.lessons.find((item) => item.id !== lesson.id);

  const wordRows = words.map((word) => `
    <div class="word-row open">
      <div>
        <div class="word-kz">${esc(word.kazakh)}</div>
        <div class="word-ru">${esc(word.russian)}</div>
      </div>
      <div class="word-side">
        <span class="tag">${esc(word.partOfSpeech || '')}</span>
        ${statusBadge(word.status)}
      </div>
      <div class="word-example">
        <b>${esc(word.exampleKz)}</b><br>${esc(word.exampleRu)}
        <button type="button" class="speak-btn" data-speak="${esc(word.exampleKz)}" aria-label="Мысалды тыңдау" style="display:inline-grid;vertical-align:middle;margin-left:6px">
          ${icon('speaker')}
        </button>
      </div>
    </div>`).join('');

  const examples = (lesson.examples || []).map((example) => `
    <div class="example-pair">
      <div class="kz">
        <span>${esc(example.kz)}</span>
        <button type="button" class="speak-btn" data-speak="${esc(example.kz)}" aria-label="Тыңдау">${icon('speaker')}</button>
      </div>
      <div class="ru">${esc(example.ru)}</div>
    </div>`).join('');

  const explanations = (lesson.explanation || []).map((block) => `
    <div class="explain-block">
      <h3>${esc(block.title)}</h3>
      <p>${esc(block.body)}</p>
    </div>`).join('');

  return {
    nav: 'lessons',
    title: `${lesson.titleKz} — QAZAQ SPACE`,
    html: `
      <div class="page">
        <a class="back-link" href="#/lessons">← Сабақтарға</a>

        <section class="card" style="margin-bottom:14px">
          <div class="lesson-head">
            <span class="tag accent">${levelLabel(lesson.level)}</span>
            <span class="tag">${esc(lesson.titleRu)}</span>
            <span class="tag warn">Оқу материалы · тексеру қажет</span>
          </div>
          <h1 style="margin-bottom:4px">${esc(lesson.titleKz)}</h1>
          <p class="muted" style="margin-bottom:14px">${esc(lesson.summary)}</p>
          <div class="lesson-goal"><b>Мақсат:</b> ${esc(lesson.goal)}</div>
        </section>

        <section style="margin-bottom:16px">
          <div class="hr-label">1 · Жаңа сөздер</div>
          <div class="word-list">${wordRows}</div>
        </section>

        <section class="card" style="margin-bottom:16px">
          <div class="hr-label" style="margin-top:0">2 · Мысалдар</div>
          ${examples}
        </section>

        <section class="card" style="margin-bottom:16px">
          <div class="hr-label" style="margin-top:0">3 · Түсіндірме</div>
          ${explanations}
        </section>

        <section class="card" style="margin-bottom:16px">
          <div class="hr-label" style="margin-top:0">4 · Шығармашылық тапсырма</div>
          <p style="font-weight:650">${esc(lesson.practice?.openTask?.prompt || '')}</p>
          <div class="chips" style="margin-bottom:10px">
            ${(lesson.practice?.openTask?.hints || []).map((hint) => `<span class="chip">${esc(hint)}</span>`).join('')}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-reveal-model>Үлгі жауапты көру</button>
          <div data-model hidden style="margin-top:12px">
            <div class="notice info">
              ${icon('info')}
              <div><strong>Үлгі жауап:</strong><br>${esc(lesson.practice?.openTask?.modelAnswer || '')}<br>
              <span class="tiny">Бұл үлгі — бағаланбайды. Өз жауабыңызды жазып көріңіз.</span></div>
            </div>
          </div>
        </section>

        <section class="card" style="margin-bottom:16px">
          <div class="hr-label" style="margin-top:0">5 · Білімді тексеру</div>
          ${quizHtml(lesson.practice?.questions || [])}
          <div style="margin-top:14px" data-completion-wrap>
            ${completionHtml(record)}
          </div>
        </section>

        <div class="btn-row" style="justify-content:space-between">
          <a class="btn btn-ghost btn-sm" href="#/lessons">← Тізімге</a>
          ${nextLesson ? `<a class="btn btn-sm" href="#/lesson/${esc(nextLesson.id)}">${esc(nextLesson.titleKz)} ${icon('arrow')}</a>` : ''}
        </div>
      </div>`,
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', (event) => {
        const speakButton = event.target.closest('[data-speak]');
        if (speakButton) {
          speakKazakh(speakButton.dataset.speak || '');
          return;
        }
        const reveal = event.target.closest('[data-reveal-model]');
        if (reveal) {
          const model = root.querySelector('[data-model]');
          if (model) {
            model.hidden = !model.hidden;
            reveal.textContent = model.hidden ? 'Үлгі жауапты көру' : 'Үлгі жауапты жасыру';
          }
        }
      }, { signal: controller.signal });

      const cleanupQuiz = attachQuiz(root, {
        questions: lesson.practice?.questions || [],
        onComplete({ score, total }) {
          const percent = total > 0 ? score / total : 0;
          const wrap = root.querySelector('[data-completion-wrap]');
          if (percent >= 0.75) {
            const isNew = completeLesson(lesson.id, score, total);
            if (wrap) {
              wrap.innerHTML = completionHtml({
                score,
                total,
                completedAt: Date.now()
              });
            }
            toast(isNew ? `Сабақ аяқталды! +20 ұпай` : `Нәтиже жаңартылды: ${score}/${total}`, 'ok');
          } else if (wrap) {
            wrap.innerHTML = `
              <div class="notice warn" data-completion>
                ${icon('warn')}
                <div><strong>Нәтиже: ${score}/${total}.</strong> Сабақты аяқтау үшін кемінде 75% дұрыс жауап қажет. Материалды қайталап, тестті қайта тапсырыңыз.</div>
              </div>`;
          }
        }
      });

      return () => {
        controller.abort();
        cleanupQuiz();
      };
    }
  };
}
