/**
 * Общие помощники игровых движков.
 */
import { data } from '../data.js';
import { esc } from '../ui.js';

export function wordsForLevel(level) {
  const numeric = Number(level) || 0;
  if (!numeric) return data.words;
  const filtered = data.words.filter((word) => Number(word.level) === numeric);
  return filtered.length >= 4 ? filtered : data.words;
}

export function gameHud({ roundLabel = 'Раунд', roundValue = '', score = 0, extra = '' }) {
  return `
    <div class="game-hud">
      ${roundValue ? `<span class="hud-item">${esc(roundLabel)} <b>${esc(roundValue)}</b></span>` : ''}
      <span class="hud-item">Ұпай <b>${Number(score) || 0}</b></span>
      <span class="hud-spacer"></span>
      ${extra}
    </div>`;
}

export function gameResult({ score, max, note = '', retry = true, title = 'Нәтиже' }) {
  const percent = max > 0 ? Math.round((Math.min(score, max) / max) * 100) : 0;
  return `
    <div class="page">
      <a class="back-link" href="#/games">← Ойындарға</a>
      <div class="result-banner">
        <span class="tag accent">${esc(title)}</span>
        <div class="result-score">${Number(score) || 0} / ${Number(max) || 0}</div>
        <div class="result-max">${percent}% · нәтиже сақталды</div>
        <p class="small muted" style="margin:8px 0 0">${note || 'Жақсы жұмыс! Нәтижені жақсарту үшін қайта ойнауға болады.'}</p>
      </div>
      <div class="btn-row">
        ${retry ? '<button type="button" class="btn" data-retry>Қайта ойнау</button>' : ''}
        <a class="btn btn-ghost" href="#/games">Ойындарға оралу</a>
        <a class="btn btn-ghost" href="#/progress">Прогресті көру</a>
      </div>
    </div>`;
}

export function gameIntro(title, instruction) {
  return `
    <div class="section-head">
      <h2>${esc(title)}</h2>
      <p>${esc(instruction)}</p>
    </div>`;
}
