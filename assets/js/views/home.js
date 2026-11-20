/**
 * Басты бет — төрт бағыт, нақты жетістік, күн сөзі.
 */
import { data } from '../data.js';
import { getState } from '../store.js';
import { computeProgress } from '../progress.js';
import { esc, icon, statusBadge, progressBar } from '../ui.js';

const DIRECTIONS = [
  {
    href: '#/speak',
    icon: 'chat',
    label: 'SPEAK',
    kz: 'Сөйлеу практикасы',
    ru: 'Диалогтар, рөлдік жағдаяттар, сұхбаттар',
    key: 'speak'
  },
  {
    href: '#/games',
    icon: 'game',
    label: 'GAME',
    kz: 'Ойын алаңы',
    ru: 'Тілдік ойындар, квесттер, жұмбақтар, марафондар',
    key: 'games'
  },
  {
    href: '#/culture',
    icon: 'culture',
    label: 'ҰЛТТЫҚ LAB',
    kz: 'Ұлттық құндылықтар',
    ru: 'Дәстүрлер, мәдениет, ойындар, мақал-мәтелдер',
    key: 'culture'
  },
  {
    href: '#/media',
    icon: 'media',
    label: 'MEDIA SPACE',
    kz: 'Шығармашылық',
    ru: 'Подкасттар, сұхбаттар, бейнерепортаждар, мектеп жаңалықтары',
    key: 'media'
  }
];

function wordOfDay() {
  const day = Math.floor(Date.now() / 86400000);
  return data.words[day % data.words.length];
}

export function homeView() {
  const state = getState();
  const progress = computeProgress(state, data);
  const nextLesson = data.lessons.find((lesson) => !state.lessons[lesson.id]);
  const word = wordOfDay();
  const topic = data.topicIndex.get(word.topic);

  const directionCards = DIRECTIONS.map((direction) => {
    const done = direction.key === 'games'
      ? progress.games.done
      : direction.key === 'culture'
        ? progress.culture.done
        : direction.key === 'speak'
          ? progress.speak.done
          : null;

    return `
      <a class="card card-hover direction-card" href="${direction.href}">
        <span class="card-icon">${icon(direction.icon)}</span>
        <b>${direction.label}</b>
        <div>${esc(direction.kz)}</div>
        <small>${esc(direction.ru)}</small>
        <span class="arrow">
          ${done !== null ? `${done} аяқталды` : 'Ашу'}
          ${icon('arrow')}
        </span>
      </a>`;
  }).join('');

  return {
    nav: 'home',
    title: 'Басты бет',
    html: `
      <div class="page">
        <section class="hero">
          <div class="hero-orbit" aria-hidden="true"></div>
          <span class="hero-badge">${icon('globe')} 5–7 сынып · қазақ тілі</span>
          <h1>Қазақ тілінде бірге сөйлейік!</h1>
          <p class="lead">
            QAZAQ SPACE — сөз жаттауға ғана емес, нақты өмірде қазақша сөйлеуге арналған оқу кеңістігі.
          </p>
          <div class="hero-actions">
            ${nextLesson
              ? `<a class="btn" href="#/lesson/${esc(nextLesson.id)}">Оқуды жалғастыру ${icon('arrow')}</a>`
              : `<a class="btn" href="#/games">Ойындарға өту ${icon('arrow')}</a>`}
            <a class="btn btn-ghost" href="#/speak">${icon('chat')} Сөйлеуді бастау</a>
            <a class="btn btn-ghost" href="#/progress">${icon('chart')} Менің жетістігім</a>
          </div>
        </section>

        <div class="grid auto-grid" style="margin-bottom:18px">
          ${directionCards}
        </div>

        <div class="split" style="margin-bottom:14px">
          <section class="card">
            <div class="card-head">
              <span class="card-icon soft">${icon('book')}</span>
              <div>
                <h3>Оқуды жалғастыру</h3>
                <p>${nextLesson ? esc(nextLesson.summary) : 'Барлық сабақ аяқталды'}</p>
              </div>
            </div>
            ${nextLesson
              ? `<p style="margin-bottom:10px"><b>${esc(nextLesson.titleKz)}</b> · ${esc(nextLesson.titleRu)}</p>
                 <a class="btn btn-sm" href="#/lesson/${esc(nextLesson.id)}">Сабақты ашу ${icon('arrow')}</a>`
              : `<p class="muted small">Енді білімді ойындар мен SPEAK бөлімінде бекітуге болады.</p>
                 <a class="btn btn-sm" href="#/games">Ойындар ${icon('arrow')}</a>`}
          </section>

          <section class="card">
            <div class="card-head">
              <span class="card-icon soft">${icon('chart')}</span>
              <div>
                <h3>Менің жетістігім</h3>
                <p>Нақты орындалған әрекеттер бойынша</p>
              </div>
            </div>
            ${progressBar(progress.percent, 100, { label: 'Жалпы жетістік' })}
            <div class="stat-grid" style="margin-top:12px">
              <div class="stat"><b>${progress.lessons.done}/${progress.lessons.total}</b><small>сабақ</small></div>
              <div class="stat"><b>${progress.words.mastered}</b><small>меңгерілген сөз</small></div>
              <div class="stat"><b>${progress.points}</b><small>ұпай</small></div>
            </div>
          </section>
        </div>

        <div class="split">
          <section class="card">
            <div class="eyebrow">${icon('cards')} Күн сөзі</div>
            <h3 style="margin-bottom:2px">${esc(word.kazakh)}</h3>
            <p class="muted" style="margin-bottom:8px">${esc(word.russian)}</p>
            <p class="small"><b>${esc(word.exampleKz)}</b><br><span class="muted">${esc(word.exampleRu)}</span></p>
            <div class="chips" style="margin-top:10px">
              <span class="tag accent">${esc(topic?.kz || word.topic)}</span>
              <span class="tag">${word.level} сынып</span>
              ${statusBadge(word.status)}
            </div>
            <p class="tiny muted" style="margin:10px 0 0">Словарь жазбасы — мұғалім тексеруін қажет етеді.</p>
          </section>

          <section class="card">
            <div class="eyebrow">${icon('info')} Маңызды</div>
            <h3>Ашықтық туралы</h3>
            <p class="small muted" style="margin-bottom:10px">
              Барлық тілдік материалдар қазір «Тексеру қажет» мәртебесінде.
            </p>
            <p class="small muted" style="margin-bottom:0">
              Оқушы жұмыстары тек осы құрылғыда сақталады. Жеке деректер сұралмайды және сыртқы сервистерге жіберілмейді.
            </p>
          </section>
        </div>
      </div>`
  };
}
