/**
 * QAZAQ SPACE — локальное хранилище прогресса.
 * Только реальные действия ученика: уроки, игры, культура, SPEAK, медиа.
 * Никакой серверной регистрации и персональных данных.
 */
import { CONFIG } from './config.js';
import { syncLessonCompletion, syncGameResult } from './supabase.js';

const DEFAULT_STATE = {
  version: 2,
  theme: null,
  lessons: {},
  speak: {},
  culture: {},
  games: {},
  words: {},
  media: [],
  quest: { stations: {}, completedAt: null }
};

const listeners = new Set();
let storageWarned = false;

function defaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalize(raw) {
  const state = defaultState();
  if (!isPlainObject(raw)) return state;

  state.theme = raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : null;
  state.lessons = isPlainObject(raw.lessons) ? raw.lessons : {};
  state.speak = isPlainObject(raw.speak) ? raw.speak : {};
  state.culture = isPlainObject(raw.culture) ? raw.culture : {};
  state.games = isPlainObject(raw.games) ? raw.games : {};
  state.words = isPlainObject(raw.words) ? raw.words : {};
  state.media = Array.isArray(raw.media) ? raw.media.filter((item) => isPlainObject(item)) : [];
  state.quest = isPlainObject(raw.quest) ? raw.quest : { stations: {}, completedAt: null };
  if (!isPlainObject(state.quest.stations)) state.quest.stations = {};
  return state;
}

/**
 * Перенос прогресса из старого прототипа (localStorage key `qs`).
 * Старые баллы не переносим: в новой версии они вычисляются из реальных действий.
 */
function migrateLegacy() {
  try {
    const raw = localStorage.getItem(CONFIG.legacyStorageKey);
    if (!raw) return null;
    const old = JSON.parse(raw);
    if (!isPlainObject(old)) return null;

    const migrated = defaultState();
    migrated.theme = old.th === 'light' || old.th === 'dark' ? old.th : null;

    const legacyLessons = ['lesson_greetings', 'lesson_family', 'lesson_school'];
    if (Array.isArray(old.l)) {
      old.l.forEach((index) => {
        const id = legacyLessons[Number(index)];
        if (id) {
          migrated.lessons[id] = {
            completedAt: Date.now(),
            score: null,
            total: null,
            attempts: 1,
            migrated: true
          };
        }
      });
    }

    if (Array.isArray(old.g)) {
      const legacyGames = { find: 'wordquiz', build: 'sentence' };
      old.g.forEach((game) => {
        const id = legacyGames[game];
        if (id) {
          migrated.games[id] = { best: 0, plays: 1, lastAt: Date.now(), migrated: true };
        }
      });
    }

    const legacyWorkTitles = ['Өзім туралы', 'Менің отбасым', 'Суретті сипатта', 'Жоба: Менің сыныбым'];
    if (Array.isArray(old.c)) {
      old.c.forEach((work, index) => {
        if (!isPlainObject(work) || typeof work.x !== 'string' || !work.x.trim()) return;
        migrated.media.push({
          id: `legacy_${Date.now()}_${index}`,
          templateId: null,
          title: legacyWorkTitles[Number(work.k)] || 'Ескі жұмыс',
          text: work.x.slice(0, CONFIG.media.maxTextLength),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          migrated: true
        });
      });
    }

    return migrated;
  } catch (error) {
    console.warn('[QAZAQ SPACE] legacy migration failed', error);
    return null;
  }
}

function load() {
  try {
    const current = localStorage.getItem(CONFIG.storageKey);
    if (current) {
      const parsed = JSON.parse(current);
      return normalize(parsed);
    }
    const legacy = migrateLegacy();
    if (legacy) {
      try {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(legacy));
      } catch (error) { /* сохранение ниже обработается */ }
      return legacy;
    }
  } catch (error) {
    console.warn('[QAZAQ SPACE] localStorage read failed', error);
  }
  return defaultState();
}

let state = load();

function persist() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  } catch (error) {
    if (!storageWarned) {
      storageWarned = true;
      console.warn('[QAZAQ SPACE] localStorage write failed', error);
      window.dispatchEvent(new CustomEvent('qazaqspace:storage-error'));
    }
  }
}

function emit() {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      console.error('[QAZAQ SPACE] store listener failed', error);
    }
  });
}

function commit() {
  persist();
  emit();
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(theme) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  commit();
}

/* Уроки ------------------------------------------------------------------ */

export function completeLesson(id, score, total) {
  if (!id) return false;
  const now = Date.now();
  const current = state.lessons[id];
  const isNew = !current;
  if (current) {
    current.attempts = (current.attempts || 1) + 1;
    current.score = Math.max(Number(current.score) || 0, Number(score) || 0);
    current.total = total;
  } else {
    state.lessons[id] = {
      completedAt: now,
      score: Number(score) || 0,
      total: Number(total) || 0,
      attempts: 1
    };
  }
  commit();
  syncLessonCompletion(id, score, total, 20);
  return isNew;
}

/* SPEAK ------------------------------------------------------------------ */

export function completeSpeak(id) {
  if (!id || state.speak[id]) return false;
  state.speak[id] = { completedAt: Date.now(), attempts: 1 };
  commit();
  return true;
}

/* Культура --------------------------------------------------------------- */

export function completeCulture(id) {
  if (!id) return false;
  const current = state.culture[id];
  const isNew = !current;
  if (current) {
    current.attempts = (current.attempts || 1) + 1;
    current.completedAt = Date.now();
  } else {
    state.culture[id] = { completedAt: Date.now(), attempts: 1 };
  }
  commit();
  return isNew;
}

/* Игры ------------------------------------------------------------------- */

export function recordGame(gameId, score) {
  if (!gameId) return { isNewBest: false, best: 0 };
  const numeric = Math.max(0, Math.round(Number(score) || 0));
  const current = state.games[gameId];
  const best = current ? Number(current.best) || 0 : 0;
  const isNewBest = numeric > best;

  state.games[gameId] = {
    best: Math.max(best, numeric),
    plays: (current?.plays || 0) + 1,
    lastAt: Date.now(),
    lastScore: numeric
  };
  commit();
  syncGameResult(gameId, numeric, state.games[gameId].best, 10);
  return { isNewBest, best: state.games[gameId].best };
}

/* Слова ------------------------------------------------------------------ */

export function recordWord(wordId, correct) {
  if (!wordId) return;
  const current = state.words[wordId] || { correct: 0, wrong: 0, lastAt: 0 };
  if (correct) current.correct = (current.correct || 0) + 1;
  else current.wrong = (current.wrong || 0) + 1;
  current.lastAt = Date.now();
  state.words[wordId] = current;
  commit();
}

/* Медиа ------------------------------------------------------------------ */

export function saveWork({ id = null, templateId = null, title = '', text }) {
  const clean = String(text || '').trim();
  if (!clean) return null;

  const now = Date.now();
  const existing = id ? state.media.find((work) => work.id === id) : null;

  if (existing) {
    existing.text = clean.slice(0, CONFIG.media.maxTextLength);
    existing.updatedAt = now;
    if (templateId) existing.templateId = templateId;
    if (title) existing.title = title;
    commit();
    return existing;
  }

  if (state.media.length >= CONFIG.media.maxWorks) {
    throw new Error(`Сақтау шегі: ${CONFIG.media.maxWorks} жұмыс. Ескі жұмыстарды өшіріңіз.`);
  }

  const work = {
    id: `work_${now}_${Math.random().toString(36).slice(2, 8)}`,
    templateId,
    title,
    text: clean.slice(0, CONFIG.media.maxTextLength),
    createdAt: now,
    updatedAt: now
  };
  state.media.unshift(work);
  commit();
  return work;
}

export function deleteWork(id) {
  const before = state.media.length;
  state.media = state.media.filter((work) => work.id !== id);
  if (state.media.length !== before) {
    commit();
    return true;
  }
  return false;
}

/* QR-квест --------------------------------------------------------------- */

export function completeQuestStation(stationId, withCode = false) {
  if (!stationId) return false;
  if (state.quest.stations[stationId]) return false;
  state.quest.stations[stationId] = {
    completedAt: Date.now(),
    withCode: Boolean(withCode)
  };
  commit();
  return true;
}

export function finishQuest(totalStations) {
  const done = Object.keys(state.quest.stations).length;
  if (totalStations > 0 && done >= totalStations && !state.quest.completedAt) {
    state.quest.completedAt = Date.now();
    commit();
    return true;
  }
  return false;
}

/* Сброс и экспорт -------------------------------------------------------- */

export function resetProgress() {
  const theme = state.theme;
  state = defaultState();
  state.theme = theme;
  persist();
  emit();
  return true;
}

export function exportProgress() {
  return JSON.stringify({
    app: 'QAZAQ SPACE',
    exportedAt: new Date().toISOString(),
    state
  }, null, 2);
}

export function getStorageMeta() {
  return { key: CONFIG.storageKey, available: !storageWarned, warned: storageWarned };
}
