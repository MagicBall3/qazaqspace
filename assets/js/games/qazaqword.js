/**
 * GAME · QAZAQ WORD — Wordle-стиль ойын.
 * Казахский и русский языки, 5 букв, 6 попыток.
 */
import { data } from '../data.js';
import { getState, recordGame } from '../store.js';
import { esc, icon, toast } from '../ui.js';
import { gameHud, gameResult } from './shared.js';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const KZ_ALPHABET = 'АӘБВГҒДЕЁЖЗИЙКҚЛМНҢОӨПРСТУҰҮФХҺЦЧШЩЪЫІЬЭЮЯ'.split('');
const RU_ALPHABET = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split('');

/* ------------------------------------------------------------------ */
/* Утилиты Unicode                                                    */
/* ------------------------------------------------------------------ */

function codePoints(str) {
  return [...str];
}

function normalize(str) {
  return String(str || '').trim().toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Алгоритм проверки                                                  */
/* ------------------------------------------------------------------ */

function evaluateGuess(guess, target) {
  const g = codePoints(normalize(guess));
  const t = codePoints(normalize(target));
  const result = new Array(g.length).fill('absent');
  const targetCounts = {};

  for (const ch of t) {
    targetCounts[ch] = (targetCounts[ch] || 0) + 1;
  }

  // First pass: correct positions
  for (let i = 0; i < g.length; i++) {
    if (g[i] === t[i]) {
      result[i] = 'correct';
      targetCounts[g[i]]--;
    }
  }

  // Second pass: present but wrong position
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue;
    if (targetCounts[g[i]] && targetCounts[g[i]] > 0) {
      result[i] = 'present';
      targetCounts[g[i]]--;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Игровой словарь                                                    */
/* ------------------------------------------------------------------ */

function getWordPool(lang) {
  const words = data.words.filter((w) => w.wordleEligible === true);
  if (lang === 'kz') {
    const unique = [...new Set(words.map((w) => w.kazakh.trim().toUpperCase()))];
    return unique.filter((w) => codePoints(w).length === WORD_LENGTH);
  } else {
    const unique = [];
    const seen = new Set();
    for (const w of words) {
      const first = w.russian.split(',')[0].split(';')[0].trim().toUpperCase();
      if (codePoints(first).length === WORD_LENGTH && !seen.has(first)) {
        seen.add(first);
        unique.push(first);
      }
    }
    return unique;
  }
}

function getWordInfo(word, lang) {
  if (lang === 'kz') {
    return data.words.find((w) => w.kazakh.trim().toUpperCase() === word.toUpperCase());
  } else {
    return data.words.find((w) => {
      const first = w.russian.split(',')[0].split(';')[0].trim().toUpperCase();
      return first === word.toUpperCase();
    });
  }
}

/* ------------------------------------------------------------------ */
/* Ежедневное слово                                                   */
/* ------------------------------------------------------------------ */

function getDailyWord(lang) {
  const pool = getWordPool(lang);
  if (!pool.length) return null;
  // Deterministic based on date in Asia/Almaty
  const now = new Date();
  const almatyOffset = 6 * 60; // UTC+6
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const almaty = new Date(utc + almatyOffset * 60000);
  const dateStr = almaty.toISOString().split('T')[0];
  // Simple hash
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % pool.length;
  return pool[idx];
}

/* ------------------------------------------------------------------ */
/* Состояние игры                                                     */
/* ------------------------------------------------------------------ */

let state = {
  lang: 'kz',
  mode: 'daily', // daily, free, learn
  target: null,
  guesses: [],
  current: '',
  gameOver: false,
  won: false,
  dailyDate: null,
  usedWords: []
};

function resetGame(newTarget) {
  state.guesses = [];
  state.current = '';
  state.gameOver = false;
  state.won = false;
  state.target = newTarget;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem('qazaqword.v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.lang = parsed.lang || 'kz';
        state.mode = parsed.mode || 'daily';
        state.usedWords = Array.isArray(parsed.usedWords) ? parsed.usedWords : [];
      }
    }
  } catch (e) {
    console.warn('QAZAQ WORD: progress load failed', e);
  }
}

function saveProgress() {
  try {
    localStorage.setItem('qazaqword.v1', JSON.stringify({
      lang: state.lang,
      mode: state.mode,
      usedWords: state.usedWords.slice(-50)
    }));
  } catch (e) {
    console.warn('QAZAQ WORD: progress save failed', e);
  }
}

/* ------------------------------------------------------------------ */
/* Визуализация                                                       */
/* ------------------------------------------------------------------ */

const COLOR_MAP = {
  correct: 'var(--ok)',
  present: 'var(--warn)',
  absent: 'var(--surface-strong)'
};

function renderGrid() {
  const rows = [];
  for (let r = 0; r < MAX_ATTEMPTS; r++) {
    const guess = state.guesses[r];
    const isCurrent = r === state.guesses.length && !state.gameOver;
    const cells = [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      let letter = '';
      let color = '';
      let border = 'var(--border)';
      if (guess) {
        letter = guess.letters[c] || '';
        color = COLOR_MAP[guess.result[c]] || '';
        border = color || 'var(--border)';
      } else if (isCurrent && c < state.current.length) {
        letter = state.current[c];
        border = 'var(--accent)';
      }
      cells.push(`<div class="qw-cell" style="border-color:${border};background:${color || 'transparent'};color:${color ? 'var(--accent-ink)' : 'var(--text)'}">${esc(letter)}</div>`);
    }
    rows.push(`<div class="qw-row">${cells.join('')}</div>`);
  }
  return rows.join('');
}

function renderKeyboard(lang) {
  const alphabet = lang === 'kz' ? KZ_ALPHABET : RU_ALPHABET;
  const used = {};
  for (const g of state.guesses) {
    for (let i = 0; i < g.letters.length; i++) {
      const ch = g.letters[i];
      const res = g.result[i];
      if (!used[ch] || (res === 'correct') || (res === 'present' && used[ch] === 'absent')) {
        used[ch] = res;
      }
    }
  }
  const rows = [];
  // Split into 3 rows
  const row1 = alphabet.slice(0, Math.ceil(alphabet.length / 3));
  const row2 = alphabet.slice(Math.ceil(alphabet.length / 3), Math.ceil(alphabet.length * 2 / 3));
  const row3 = alphabet.slice(Math.ceil(alphabet.length * 2 / 3));
  
  function keyRow(keys) {
    return `<div class="qw-keyboard-row">${keys.map((k) => {
      const color = used[k] ? COLOR_MAP[used[k]] : '';
      const style = color ? `style="background:${color};color:var(--accent-ink);border-color:${color}"` : '';
      return `<button type="button" class="qw-key" data-key="${esc(k)}" ${style}>${esc(k)}</button>`;
    }).join('')}</div>`;
  }
  
  return `
    ${keyRow(row1)}
    ${keyRow(row2)}
    <div class="qw-keyboard-row">
      <button type="button" class="qw-key qw-key-wide" data-action="enter">Enter</button>
      ${keyRow(row3)}
      <button type="button" class="qw-key qw-key-wide" data-action="backspace">⌫</button>
    </div>
  `;
}

function renderResult() {
  if (!state.gameOver) return '';
  const info = getWordInfo(state.target, state.lang);
  const word = state.target;
  const translation = info ? (state.lang === 'kz' ? info.russian : info.kazakh) : '';
  const topic = info ? info.topic : '';
  const example = info && info.status === 'verified' ? info.exampleKz : '';
  const exampleRu = info && info.status === 'verified' ? info.exampleRu : '';

  return `
    <div class="qw-result">
      <div class="result-banner">
        <span class="tag accent">${state.won ? 'Жеңіс!' : 'Ойын аяқталды'}</span>
        <div class="result-score">${state.guesses.length} / ${MAX_ATTEMPTS}</div>
        <p class="small muted" style="margin:8px 0 0">
          ${state.won ? 'Керемет! Сөзді таптыңыз.' : 'Сөз: <b>' + esc(word) + '</b>'}
        </p>
        ${translation ? `<p class="small" style="margin:8px 0 0"><b>Аударма:</b> ${esc(translation)}</p>` : ''}
        ${topic ? `<p class="tiny muted" style="margin:4px 0 0">Тақырып: ${esc(topic)}</p>` : ''}
        ${example ? `<p class="small muted" style="margin:8px 0 0"><b>Мысал:</b> ${esc(example)}<br><span class="muted">${esc(exampleRu)}</span></p>` : ''}
        <div class="btn-row" style="justify-content:center;margin-top:12px">
          <button type="button" class="btn" data-action="new-game">Жаңа ойын</button>
          ${info ? `<a class="btn btn-ghost" href="#/vocab">Сөздікті ашу</a>` : ''}
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Основной рендер                                                    */
/* ------------------------------------------------------------------ */

export function render() {
  loadProgress();
  const pool = getWordPool(state.lang);
  const hasWords = pool.length >= 1;

  if (state.mode === 'daily' && !state.target) {
    const daily = getDailyWord(state.lang);
    if (daily) {
      state.target = daily;
      state.dailyDate = new Date().toISOString().split('T')[0];
    }
  }

  if (state.mode === 'free' && !state.target) {
    if (pool.length) {
      let available = pool.filter((w) => !state.usedWords.includes(w));
      if (!available.length) available = pool.slice();
      state.target = available[Math.floor(Math.random() * available.length)];
    }
  }

  if (state.mode === 'learn' && !state.target) {
    if (pool.length) {
      let available = pool.filter((w) => !state.usedWords.includes(w));
      if (!available.length) available = pool.slice();
      state.target = available[Math.floor(Math.random() * available.length)];
    }
  }

  const langLabel = state.lang === 'kz' ? 'Қазақша' : 'Русский';
  const modeLabel = state.mode === 'daily' ? 'Күнделікті' : state.mode === 'free' ? 'Еркін' : 'Оқу';

  return {
    nav: 'games',
    title: 'QAZAQ WORD — GAME',
    html: `
      <div class="page">
        <div class="qw-header">
          <h2 style="margin-bottom:4px">QAZAQ WORD</h2>
          <p class="small muted" style="margin-bottom:10px">5 әріптен тұратын сөзді 6 әрекетте тап.</p>
        </div>

        <div class="qw-controls">
          <div class="chips">
            <button type="button" class="chip ${state.lang === 'kz' ? 'active' : ''}" data-lang="kz" aria-pressed="${state.lang === 'kz'}">Қазақша</button>
            <button type="button" class="chip ${state.lang === 'ru' ? 'active' : ''}" data-lang="ru" aria-pressed="${state.lang === 'ru'}">Русский</button>
          </div>
          <div class="chips" style="margin-top:6px">
            <button type="button" class="chip ${state.mode === 'daily' ? 'active' : ''}" data-mode="daily" aria-pressed="${state.mode === 'daily'}">Күнделікті</button>
            <button type="button" class="chip ${state.mode === 'free' ? 'active' : ''}" data-mode="free" aria-pressed="${state.mode === 'free'}">Еркін</button>
            <button type="button" class="chip ${state.mode === 'learn' ? 'active' : ''}" data-mode="learn" aria-pressed="${state.mode === 'learn'}">Оқу</button>
          </div>
        </div>

        ${!hasWords ? `<div class="notice warn" style="margin:14px 0">
          ${icon('warn')}
          <div>
            <strong>Сөздер жоқ.</strong> Ойынға арналған 5 әріпті сөздер әлі расталмаған.
            Мұғалім словарьдағы сөздерді растауы керек.
          </div>
        </div>` : ''}

        <div class="qw-game" ${!hasWords ? 'hidden' : ''}>
          <div class="qw-grid">${renderGrid()}</div>
          ${renderResult()}
          <div class="qw-keyboard">${renderKeyboard(state.lang)}</div>
        </div>

        <div class="notice info" style="margin-top:14px">
          ${icon('info')}
          <div>
            <strong>Ережелер:</strong> 5 әріпті сөзді табыңыз. Жасыл — дұрыс орын. Сары — сөзде бар, бірақ басқа орында. Сұр — сөзде жоқ.
          </div>
        </div>
      </div>
    `,
    mount(root) {
      const controller = new AbortController();

      root.addEventListener('click', (event) => {
        const langBtn = event.target.closest('[data-lang]');
        if (langBtn) {
          const newLang = langBtn.dataset.lang;
          if (newLang !== state.lang) {
            state.lang = newLang;
            resetGame(null);
            if (state.mode === 'daily') {
              state.target = getDailyWord(state.lang);
            } else {
              const pool = getWordPool(state.lang);
              if (pool.length) {
                let available = pool.filter((w) => !state.usedWords.includes(w));
                if (!available.length) available = pool.slice();
                state.target = available[Math.floor(Math.random() * available.length)];
              }
            }
            saveProgress();
            root.innerHTML = render().html;
            // Re-mount
          }
          return;
        }

        const modeBtn = event.target.closest('[data-mode]');
        if (modeBtn) {
          state.mode = modeBtn.dataset.mode;
          resetGame(null);
          if (state.mode === 'daily') {
            state.target = getDailyWord(state.lang);
          } else {
            const pool = getWordPool(state.lang);
            if (pool.length) {
              let available = pool.filter((w) => !state.usedWords.includes(w));
              if (!available.length) available = pool.slice();
              state.target = available[Math.floor(Math.random() * available.length)];
            }
          }
          saveProgress();
          root.innerHTML = render().html;
          return;
        }

        const key = event.target.closest('[data-key]');
        if (key && !state.gameOver && state.target) {
          const ch = key.dataset.key;
          if (codePoints(state.current).length < WORD_LENGTH) {
            state.current += ch;
            root.querySelector('.qw-grid').innerHTML = renderGrid();
          }
          return;
        }

        const enter = event.target.closest('[data-action="enter"]');
        if (enter && !state.gameOver && state.target) {
          if (codePoints(state.current).length !== WORD_LENGTH) {
            toast('5 әріп енгізіңіз', 'warn');
            return;
          }
          const pool = getWordPool(state.lang);
          if (!pool.includes(state.current.toUpperCase())) {
            toast('Бұл сөз тізімде жоқ', 'warn');
            return;
          }
          const result = evaluateGuess(state.current, state.target);
          state.guesses.push({ letters: codePoints(state.current.toUpperCase()), result });
          if (result.every((r) => r === 'correct')) {
            state.gameOver = true;
            state.won = true;
            if (!state.usedWords.includes(state.target)) {
              state.usedWords.push(state.target);
            }
            saveProgress();
          } else if (state.guesses.length >= MAX_ATTEMPTS) {
            state.gameOver = true;
            state.won = false;
            if (!state.usedWords.includes(state.target)) {
              state.usedWords.push(state.target);
            }
            saveProgress();
          }
          state.current = '';
          root.innerHTML = render().html;
          return;
        }

        const backspace = event.target.closest('[data-action="backspace"]');
        if (backspace && !state.gameOver) {
          const chars = codePoints(state.current);
          chars.pop();
          state.current = chars.join('');
          root.querySelector('.qw-grid').innerHTML = renderGrid();
          return;
        }

        const newGame = event.target.closest('[data-action="new-game"]');
        if (newGame) {
          resetGame(null);
          if (state.mode === 'daily') {
            state.target = getDailyWord(state.lang);
          } else {
            const pool = getWordPool(state.lang);
            if (pool.length) {
              let available = pool.filter((w) => !state.usedWords.includes(w));
              if (!available.length) {
                state.usedWords = [];
                available = pool.slice();
              }
              state.target = available[Math.floor(Math.random() * available.length)];
            }
          }
          saveProgress();
          root.innerHTML = render().html;
          return;
        }
      }, { signal: controller.signal });

      // Physical keyboard
      const keyHandler = (e) => {
        if (state.gameOver) return;
        if (e.key === 'Enter') {
          const enterBtn = root.querySelector('[data-action="enter"]');
          if (enterBtn) enterBtn.click();
        } else if (e.key === 'Backspace') {
          const bsBtn = root.querySelector('[data-action="backspace"]');
          if (bsBtn) bsBtn.click();
        } else {
          const ch = e.key.toUpperCase();
          const alphabet = state.lang === 'kz' ? KZ_ALPHABET : RU_ALPHABET;
          if (alphabet.includes(ch) && codePoints(state.current).length < WORD_LENGTH) {
            state.current += ch;
            const grid = root.querySelector('.qw-grid');
            if (grid) grid.innerHTML = renderGrid();
          }
        }
      };
      document.addEventListener('keydown', keyHandler, { signal: controller.signal });

      return () => controller.abort();
    }
  };
}
