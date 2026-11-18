/**
 * Сабақтар тізімі — 5–7 сынып бойынша топтастырылған.
 */
import { data } from '../data.js';
import { getState } from '../store.js';
import { esc, icon, levelLabel, emptyState } from '../ui.js';

export function lessonsView() {
  const state = getState();
  const completed = data.lessons.filter((lesson) => state.lessons[lesson.id]).length;

  const groups = [1, 2, 3].map((level) => {
    const lessons = data.lessons.filter((lesson) => Number(lesson.level) === level);
    if (!lessons.length) return '';
    return `
      <section style="margin-bottom:22px">
        <div class="hr-label">${levelLabel(level)} · ${level === 1 ? 'қарапайым фразалар' : level === 2 ? 'өзіндік диалог' : 'толық жауап және пікір'}</div>
        <div class="row-list">
          ${lessons.map((lesson, index) => {
            const done = Boolean(state.lessons[lesson.id]);
            const score = state.lessons[lesson.id]?.score;
            const total = state.lessons[lesson.id]?.total;
            return `
              <a class="row-item" href="#/lesson/${esc(lesson.id)}">
                <span class="num">${index + 1}</span>
                <span class="row-body">
                  <b>${esc(lesson.titleKz)} <span class="muted" style="font-weight:500">· ${esc(lesson.titleRu)}</span></b>
                  <small>${esc(lesson.summary)}</small>
                </span>
                ${done
                  ? `<span class="tag ok">${score !== null && score !== undefined ? `${score}/${total}` : 'Аяқталды'}</span>`
                  : '<span class="tag">Жаңа</span>'}
                <span class="chev">${icon('chevron')}</span>
              </a>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');

  return {
    nav: 'lessons',
    title: 'Сабақтар',
    html: `
      <div class="page">
        <div class="section-head">
          <div class="eyebrow">${icon('book')} Оқу бағдарламасы</div>
          <h2>Сабақтар</h2>
          <p>Әр сабақта жаңа сөздер, мысалдар, түсіндірме, практика және нәтиже бар. Қиындық 5-сыныптан 7-сыныпқа қарай өседі.</p>
        </div>

        <div class="notice warn" style="margin-bottom:18px">
          ${icon('warn')}
          <div>
            <strong>Материалдар тексерілуде.</strong>
            Барлық сабақтар мен сөздік жазбалары <span class="tag needs_review">needs_review</span> мәртебесінде.
            Мұғалім мазмұнды тексеріп, деректер файлындағы мәртебені <b>verified</b> етіп өзгерте алады.
          </div>
        </div>

        ${progressSummary(completed)}
        ${groups || emptyState({ title: 'Сабақтар жоқ', text: 'Деректер файлын тексеріңіз.' })}

        <div class="card">
          <div class="card-head">
            <span class="card-icon soft">${icon('cards')}</span>
            <div>
              <h3>Сөздік қорын қайталау</h3>
              <p>Барлық сөздер бір орталық сөздіктен алынады.</p>
            </div>
          </div>
          <a class="btn btn-sm" href="#/vocab">Сөздікті ашу ${icon('arrow')}</a>
        </div>
      </div>`
  };
}

function progressSummary(completed) {
  const total = data.lessons.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return `
    <section class="card" style="margin-bottom:18px">
      <div class="progress-label"><span>Аяқталған сабақтар</span><b>${completed} / ${total}</b></div>
      <div class="bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
        <span style="width:${percent}%"></span>
      </div>
      <p class="tiny muted" style="margin:8px 0 0">Сабақ нәтижесі тек практика тапсырмасы орындалғаннан кейін есептеледі.</p>
    </section>`;
}
