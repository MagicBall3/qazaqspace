/**
 * GAME алаңы: ойындар каталогы және жеке ойын беті.
 */
import { getState } from '../store.js';
import { GAME_META, getGameMeta } from '../games/meta.js';
import { GAME_LEVELS } from '../config.js';
import { esc, icon, emptyState } from '../ui.js';
import * as wordquiz from '../games/wordquiz.js';
import * as sentence from '../games/sentence.js';
import * as match from '../games/match.js';
import * as proverbs from '../games/proverbs.js';
import * as quiz from '../games/quiz.js';
import * as quest from '../games/quest.js';
import * as marathon from '../games/marathon.js';
import * as finderror from '../games/finderror.js';
import * as qazaqword from '../games/qazaqword.js';

const ENGINES = { wordquiz, sentence, match, proverbs, quiz, quest, marathon, finderror, qazaqword };

function levelTag(level) {
  return `<span class="tag">${level === 1 ? '5 сынып' : level === 2 ? '6 сынып' : '7 сынып'}</span>`;
}

export function gamesView(params, query) {
  const state = getState();
  const selectedLevel = Number(query?.get('level')) || 0;

  const levelChips = GAME_LEVELS.map((level) => `
    <a class="chip ${selectedLevel === level.value ? 'active' : ''}" href="#/games?level=${level.value}"
       aria-pressed="${selectedLevel === level.value}">${esc(level.label)}</a>`).join('');

  const cards = GAME_META.map((game) => {
    const record = state.games[game.id];
    return `
      <article class="card game-card">
        <span class="card-icon soft">${icon(game.icon)}</span>
        <h3>${esc(game.titleKz)}</h3>
        <p class="muted" style="margin:0">${esc(game.titleRu)}</p>
        <p class="small" style="margin:0">${esc(game.description)}</p>
        <div class="game-meta">
          ${record
            ? `<span class="tag ok">Ең жақсы: ${Number(record.best) || 0}/${game.max}</span>`
            : '<span class="tag">Әлі ойналмаған</span>'}
          ${game.level && selectedLevel ? levelTag(selectedLevel) : ''}
        </div>
        <div class="btn-row">
          <a class="btn btn-sm" href="#/game/${esc(game.id)}?level=${selectedLevel}">
            ${record ? 'Қайта ойнау' : 'Ойнау'} ${icon('arrow')}
          </a>
        </div>
      </article>`;
  }).join('');

  return {
    nav: 'games',
    title: 'GAME — ойын алаңы',
    html: `
      <div class="page">
        <div class="section-head">
          <div class="eyebrow">${icon('game')} Бес бағыттың бірі</div>
          <h2>GAME · Ойын алаңы</h2>
          <p>Сөздік, сөйлем құру, мақал-мәтел, викторина, QR-квест және уақытқа қарсы марафон. Барлық нәтиже нақты жауаптардан есептеледі.</p>
        </div>

        <div class="notice info" style="margin-bottom:14px">
          ${icon('info')}
          <div>
            <strong>Қалай жұмыс істейді:</strong> әр ойынның нәтижесі осы құрылғыда сақталады және «Менің прогресім» бөлімінде көрінеді.
            Ойындар оқу материалын бекітуге арналған, баға қоюға емес.
          </div>
        </div>

        <div class="chips" style="margin-bottom:16px">
          ${levelChips}
        </div>

        <div class="grid cols-3" style="margin-bottom:16px">${cards}</div>

        <div class="notice warn">
          ${icon('warn')}
          <div>
            <strong>QR-квест туралы:</strong> QR-кодтарды мұғалім өзі басып шығарады.
            Кодтар <span class="mono">docs/TEACHER_GUIDE.md</span> файлында сипатталған. Кодсыз станцияны да өтуге болады, бірақ бонус қосылмайды.
          </div>
        </div>
      </div>`
  };
}

export function gameView(params, query) {
  const meta = getGameMeta(params.id);
  const engine = ENGINES[params.id];
  if (!meta || !engine) {
    return {
      nav: 'games',
      title: 'Ойын табылмады',
      html: `<div class="page">${emptyState({
        icon: 'game',
        title: 'Ойын табылмады',
        text: 'Ойындар тізіміне оралыңыз.',
        action: '<a class="btn btn-sm" href="#/games">Ойындарға оралу</a>'
      })}</div>`
    };
  }

  const level = Number(query?.get('level')) || 0;
  const view = engine.render({ level });
  return {
    ...view,
    nav: 'games',
    title: `${meta.titleKz} — GAME`
  };
}
