/**
 * Менің жетістігім — тек нақты орындалған әрекеттер.
 */
import { data } from '../data.js';
import {
  getState,
  resetProgress,
  exportProgress,
  getStorageMeta
} from '../store.js';
import { computeProgress, achievements } from '../progress.js';
import { GAME_META } from '../games/meta.js';
import { confirmDialog, downloadText, esc, formatDate, icon, toast } from '../ui.js';
import { navigate } from '../router.js';

export function progressView() {
  const state = getState();
  const progress = computeProgress(state, data);
  const achievementList = achievements(state, progress);
  const storage = getStorageMeta();
  const lastChange = formatDate(lastActivity(state));

  const categoryRows = [
    ['lessons', 'Сабақтар', 'book'],
    ['speak', 'SPEAK жағдаяттары', 'chat'],
    ['games', 'Ойындар', 'game'],
    ['culture', 'Ұлттық мәдениет', 'culture'],
    ['media', 'Шығармашылық жұмыс', 'media']
  ].map(([key, label, iconName]) => {
    const value = progress.categories[key];
    const percent = value.total ? Math.round((value.done / value.total) * 100) : 0;
    return `
      <div class="meter-row">
        <span>${icon(iconName)} ${label}</span>
        <div class="bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
          <span style="width:${percent}%"></span>
        </div>
        <b>${value.done}/${value.total}</b>
      </div>`;
  }).join('');

  const gameRows = GAME_META.map((game) => {
    const record = state.games[game.id];
    return `
      <div class="phrase-item">
        <b>${esc(game.titleKz)}</b>
        <span>${record ? `Ең жақсы: ${record.best}/${game.max} · ${record.plays} рет` : 'Әлі ойналмаған'}</span>
      </div>`;
  }).join('');

  const achievementCards = achievementList.map((item) => `
    <div class="achievement ${item.unlocked ? 'unlocked' : 'locked'}">
      <span class="ach-icon">${icon(item.unlocked ? item.icon : 'lock')}</span>
      <div>
        <b>${esc(item.title)}</b>
        <small>${esc(item.text)}</small>
      </div>
    </div>`).join('');

  return {
    nav: 'progress',
    title: 'Менің жетістігім',
    html: `
      <div class="page">
        <div class="section-head">
          <div class="eyebrow">${icon('chart')} Жеке жетістік</div>
          <h2>Менің жетістігім</h2>
          <p>Бұл көрсеткіштер тек сіздің нақты әрекеттеріңізден есептеледі: аяқталған сабақтар, ойын нәтижелері, мәдениет тапсырмалары және сақталған жұмыстар.</p>
        </div>

        ${storage.available ? '' : `<div class="notice warn" style="margin-bottom:14px">${icon('warn')}<div><strong>Сақтау шектеулі.</strong> Жетістіктер тек осы сессияда сақталуы мүмкін.</div></div>`}

        <section class="card overall-card" style="margin-bottom:14px">
          <div class="overall-ring" style="--p:${progress.percent}" role="img" aria-label="Жалпы жетістік ${progress.percent}%">
            <div><b>${progress.percent}%</b><small>жалпы жетістік</small></div>
          </div>
          <div>
            <div class="stat-grid" style="margin-bottom:14px">
              <div class="stat"><b>${progress.points}</b><small>ұпай</small></div>
              <div class="stat"><b>${progress.words.mastered}/${progress.words.total}</b><small>меңгерілген сөз</small></div>
              <div class="stat"><b>${progress.games.done}/${progress.games.total}</b><small>ойын</small></div>
              <div class="stat"><b>${progress.media.works}</b><small>сақталған жұмыс</small></div>
            </div>
            <p class="tiny muted" style="margin:0">«Меңгерілген сөз» — ойындар мен тапсырмаларда кемінде екі рет дұрыс жауап берілген сөз. Балл ойдан қосылмайды.</p>
          </div>
        </section>

        <div class="split" style="margin-bottom:14px">
          <section class="card">
            <div class="hr-label" style="margin-top:0">Бағыттар бойынша</div>
            ${categoryRows}
            <div class="divider"></div>
            <div class="progress-label"><span>Сөздік қоры</span><b>${progress.words.mastered} / ${progress.words.total}</b></div>
            <div class="bar thin" style="margin-top:6px"><span style="width:${progress.words.percent}%"></span></div>
            <p class="tiny muted" style="margin:8px 0 0">${progress.words.touched} сөзбен жұмыс істелді, ${progress.words.mastered} сөз меңгерілді.</p>
          </section>

          <section class="card">
            <div class="hr-label" style="margin-top:0">Ойын нәтижелері</div>
            ${gameRows}
            <a class="btn btn-sm" href="#/games" style="margin-top:12px">Ойындарға ${icon('arrow')}</a>
          </section>
        </div>

        <section class="card" style="margin-bottom:14px">
          <div class="hr-label" style="margin-top:0">Жетістіктер</div>
          <div class="grid cols-2">${achievementCards}</div>
        </section>

        <section class="card">
          <div class="hr-label" style="margin-top:0">Деректерді басқару</div>
          <p class="small muted">Жетістіктер осы браузерде ғана сақталады. Оны файлға экспорттауға болады. Басқа құрылғыға автоматты синхрондау жоқ.</p>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost btn-sm" data-export>${icon('download')} Жетістіктерді экспорттау</button>
            <button type="button" class="btn btn-danger btn-sm" data-reset>${icon('reset')} Жетістіктерді қалпына келтіру</button>
          </div>
          <p class="tiny muted" style="margin:10px 0 0">Соңғы белсенділік: ${lastChange || 'әрекет жоқ'}.</p>
        </section>
      </div>`,
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', async (event) => {
        const exportButton = event.target.closest('[data-export]');
        if (exportButton) {
          downloadText('qazaqspace-progress.json', exportProgress(), 'application/json;charset=utf-8');
          toast('Жетістіктер файлға экспортталды', 'ok');
          return;
        }

        const resetButton = event.target.closest('[data-reset]');
        if (resetButton) {
          const confirmed = await confirmDialog({
            title: 'Жетістіктерді қалпына келтіру?',
            message: 'Барлық аяқталған сабақтар, ойын нәтижелері, мәдениет тапсырмалары және сақталған шығармашылық жұмыстар жойылады. Бұл әрекетті қайтару мүмкін емес.',
            confirmLabel: 'Иә, барлығын жою',
            cancelLabel: 'Болдырмау',
            danger: true
          });
          if (!confirmed) return;
          resetProgress();
          toast('Жетістіктер қалпына келтірілді', 'ok');
          navigate('/progress', { replace: true });
        }
      }, { signal: controller.signal });

      return () => controller.abort();
    }
  };
}

function lastActivity(state) {
  const stamps = [];
  Object.values(state.lessons || {}).forEach((record) => stamps.push(record?.completedAt));
  Object.values(state.speak || {}).forEach((record) => stamps.push(record?.completedAt));
  Object.values(state.culture || {}).forEach((record) => stamps.push(record?.completedAt));
  Object.values(state.games || {}).forEach((record) => stamps.push(record?.lastAt));
  (state.media || []).forEach((work) => stamps.push(work?.updatedAt || work?.createdAt));
  stamps.push(state.quest?.completedAt);
  Object.values(state.quest?.stations || {}).forEach((record) => stamps.push(record?.completedAt));

  const valid = stamps.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return valid.length ? Math.max(...valid) : 0;
}
