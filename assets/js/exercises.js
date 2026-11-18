/**
 * QAZAQ SPACE — универсальная система генерации упражнений.
 * Использует Master Vocabulary (data/vocabulary.json) как единственный источник.
 * Поддерживает: случайный выбор, перемешивание, исключение повторов,
 * уровни сложности, повторную генерацию.
 */
import { data } from './data.js';
import { esc, shuffle, sample } from './ui.js';

/* ------------------------------------------------------------------ */
/* Утилиты                                                            */
/* ------------------------------------------------------------------ */

/** Случайный выбор N элементов без повторов из массива. */
export function pickUnique(items, count) {
  const pool = Array.isArray(items) ? items.slice() : [];
  const n = Math.min(count, pool.length);
  const result = [];
  const used = new Set();
  while (result.length < n && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    const item = pool.splice(idx, 1)[0];
    const key = typeof item === 'string' ? item : (item.id || JSON.stringify(item));
    if (used.has(key)) continue;
    used.add(key);
    result.push(item);
  }
  return result;
}

/** Перемешать массив (Fisher-Yates). */
export function shuffleArray(arr) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Слова по уровню сложности. */
export function wordsByLevel(level) {
  const numeric = Number(level) || 0;
  if (!numeric) return data.words.slice();
  const filtered = data.words.filter((w) => Number(w.level) === numeric);
  return filtered.length >= 4 ? filtered : data.words.slice();
}

/** Слова по теме. */
export function wordsByTopic(topicId) {
  if (!topicId || topicId === 'all') return data.words.slice();
  return data.words.filter((w) => w.topic === topicId);
}

/** Слова по уровню и теме. */
export function wordsByLevelAndTopic(level, topicId) {
  let words = data.words.slice();
  if (level) words = words.filter((w) => Number(w.level) === Number(level));
  if (topicId && topicId !== 'all') words = words.filter((w) => w.topic === topicId);
  return words.length >= 4 ? words : data.words.slice();
}

/* ------------------------------------------------------------------ */
/* Генераторы вопросов                                                */
/* ------------------------------------------------------------------ */

/**
 * Генерация вопроса "угадай перевод".
 * @param {object} word - слово из словаря
 * @param {Array} pool - пул слов для неправильных вариантов
 * @param {number} optionCount - количество вариантов (по умолчанию 4)
 * @returns {object} вопрос с options и answer
 */
export function generateTranslationQuestion(word, pool, optionCount = 4) {
  const wrong = pool
    .filter((w) => w.id !== word.id && w.russian !== word.russian)
    .map((w) => w.russian);
  const uniqueWrong = [...new Set(wrong)];
  const wrongOptions = shuffleArray(uniqueWrong).slice(0, optionCount - 1);
  const options = shuffleArray([word.russian, ...wrongOptions]);
  return {
    type: 'translation',
    wordId: word.id,
    prompt: `«${word.kazakh}» сөзінің аудармасы қайсы?`,
    options,
    answer: options.indexOf(word.russian),
    explain: `${word.kazakh} — ${word.russian}`,
    hint: word.exampleKz ? `Мысал: ${word.exampleKz}` : ''
  };
}

/**
 * Генерация набора вопросов "угадай перевод".
 * @param {object} options
 * @param {number} options.count - количество вопросов
 * @param {number} options.level - уровень сложности (0 = все)
 * @param {string} options.topic - тема (или 'all')
 * @param {number} options.optionCount - вариантов ответа
 * @returns {Array} массив вопросов
 */
export function generateTranslationQuiz({ count = 5, level = 0, topic = 'all', optionCount = 4 } = {}) {
  const pool = wordsByLevelAndTopic(level, topic);
  const selected = pickUnique(pool, count);
  return selected.map((word) => generateTranslationQuestion(word, pool, optionCount));
}

/**
 * Генерация вопроса "составь предложение".
 * @param {object} sentence - объект с words и ru
 * @returns {object} вопрос
 */
export function generateSentenceQuestion(sentence) {
  const words = sentence.words.slice();
  const shuffled = shuffleArray(words);
  // Ensure shuffled is different from original
  let pool = shuffled;
  if (pool.join(' ') === words.join(' ') && words.length > 1) {
    pool = shuffleArray(shuffled);
  }
  return {
    type: 'sentence',
    sentenceId: sentence.id,
    prompt: `Сөздерді дұрыс ретпен қойып, сөйлем құрастырыңыз:`,
    words: words,
    pool: pool,
    answer: words.join(' '),
    ru: sentence.ru,
    level: sentence.level || 0
  };
}

/**
 * Генерация набора предложений.
 * @param {object} options
 * @param {number} options.count
 * @param {number} options.level
 * @returns {Array}
 */
export function generateSentenceQuiz({ count = 4, level = 0 } = {}) {
  const pool = data.games?.sentences || [];
  const filtered = level ? pool.filter((s) => Number(s.level) === Number(level)) : pool;
  const source = filtered.length >= 2 ? filtered : pool;
  const selected = pickUnique(source, count);
  return selected.map(generateSentenceQuestion);
}

/**
 * Генерация пар для сопоставления (match).
 * @param {object} options
 * @param {number} options.count - количество пар
 * @param {number} options.level
 * @param {string} options.topic
 * @returns {object} { pairs, left, right }
 */
export function generateMatchSet({ count = 8, level = 0, topic = 'all' } = {}) {
  const pool = wordsByLevelAndTopic(level, topic);
  const selected = pickUnique(pool, count);
  const pairs = selected.map((w) => ({ id: w.id, kazakh: w.kazakh, russian: w.russian }));
  return {
    type: 'match',
    pairs,
    left: shuffleArray(pairs.slice()),
    right: shuffleArray(pairs.slice()),
    maxScore: pairs.length * 10
  };
}

/**
 * Генерация вопроса "найди ошибку".
 * @param {object} item - { correct, wrong, explanation }
 * @returns {object}
 */
export function generateErrorQuestion(item) {
  return {
    type: 'error',
    prompt: 'Қатені табыңыз:',
    sentence: item.wrong,
    correct: item.correct,
    options: item.options || ['Дұрыс', 'Қате'],
    answer: item.answer !== undefined ? item.answer : 1,
    explain: item.explain || item.explanation || ''
  };
}

/**
 * Генерация набора "найди ошибку".
 * @param {object} options
 * @param {number} options.count
 * @returns {Array}
 */
export function generateErrorQuiz({ count = 5 } = {}) {
  const pool = data.games?.errors || [];
  const source = pool.length >= count ? pool : pool;
  const selected = pickUnique(source, count);
  return selected.map(generateErrorQuestion);
}

/**
 * Генерация вопроса викторины (quiz).
 * @param {object} question - вопрос из data.games.quiz
 * @returns {object}
 */
export function generateQuizQuestion(question) {
  const options = shuffleArray(question.options.slice());
  return {
    type: 'quiz',
    id: question.id,
    prompt: question.question,
    options,
    answer: options.indexOf(question.options[question.answer]),
    explain: question.explain || '',
    level: question.level || 0
  };
}

/**
 * Генерация набора викторины.
 * @param {object} options
 * @param {number} options.count
 * @param {number} options.level
 * @returns {Array}
 */
export function generateQuizSet({ count = 10, level = 0 } = {}) {
  const pool = data.games?.quiz || [];
  const filtered = level ? pool.filter((q) => Number(q.level) === Number(level)) : pool;
  const source = filtered.length >= 5 ? filtered : pool;
  const selected = pickUnique(source, count);
  return selected.map(generateQuizQuestion);
}

/**
 * Генерация вопроса по пословице.
 * @param {object} proverb
 * @returns {object}
 */
export function generateProverbQuestion(proverb) {
  const options = shuffleArray(proverb.options.slice());
  return {
    type: 'proverb',
    id: proverb.id,
    prompt: `«${proverb.beginning} …» мақалын аяқтаңыз.`,
    options,
    answer: options.indexOf(proverb.options[proverb.answer]),
    explain: `${proverb.ru} ${proverb.meaning || ''}`.trim(),
    level: 2
  };
}

/**
 * Генерация набора пословиц.
 * @param {object} options
 * @param {number} options.count
 * @returns {Array}
 */
export function generateProverbSet({ count = 6 } = {}) {
  const pool = data.games?.proverbs || [];
  const selected = pickUnique(pool, count);
  return selected.map(generateProverbQuestion);
}

/**
 * Генерация вопроса "угадай слово" (word quiz).
 * @param {object} word
 * @param {Array} pool
 * @returns {object}
 */
export function generateWordQuestion(word, pool) {
  const wrong = pool
    .filter((w) => w.id !== word.id && w.russian !== word.russian)
    .map((w) => w.russian);
  const uniqueWrong = [...new Set(wrong)];
  const wrongOptions = shuffleArray(uniqueWrong).slice(0, 3);
  const options = shuffleArray([word.russian, ...wrongOptions]);
  return {
    type: 'word',
    wordId: word.id,
    prompt: `«${word.kazakh}» сөзінің аудармасы қайсы?`,
    options,
    answer: options.indexOf(word.russian),
    explain: `${word.kazakh} — ${word.russian}`,
    level: word.level
  };
}

/**
 * Генерация набора "угадай слово".
 * @param {object} options
 * @param {number} options.count
 * @param {number} options.level
 * @param {string} options.topic
 * @returns {Array}
 */
export function generateWordSet({ count = 5, level = 0, topic = 'all' } = {}) {
  const pool = wordsByLevelAndTopic(level, topic);
  const selected = pickUnique(pool, count);
  return selected.map((word) => generateWordQuestion(word, pool));
}

/* ------------------------------------------------------------------ */
/* Обратная связь                                                     */
/* ------------------------------------------------------------------ */

/**
 * Создание отчёта о результатах.
 * @param {Array} questions - вопросы с ответами
 * @param {Array} answers - массив { questionIndex, selected, correct }
 * @returns {object} отчёт
 */
export function buildFeedback(questions, answers) {
  const total = questions.length;
  const correct = answers.filter((a) => a.correct).length;
  const wrong = total - correct;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const wrongWords = answers
    .filter((a) => !a.correct)
    .map((a) => questions[a.questionIndex])
    .filter(Boolean);

  return {
    total,
    correct,
    wrong,
    percent,
    grade: percent >= 80 ? 'excellent' : percent >= 60 ? 'good' : 'needs_work',
    wrongQuestions: wrongWords,
    wrongWordIds: wrongWords.map((q) => q.wordId || q.sentenceId || q.id).filter(Boolean)
  };
}

/**
 * Генерация "повторить сложные слова" — только слова с ошибками.
 * @param {Array} wrongWordIds - ID слов с ошибками
 * @param {number} count - количество вопросов
 * @returns {Array}
 */
export function generateRetrySet(wrongWordIds, count = 5) {
  if (!wrongWordIds || !wrongWordIds.length) return [];
  const words = wrongWordIds
    .map((id) => data.vocabIndex.get(id) || data.words.find((w) => w.id === id))
    .filter(Boolean);
  const pool = data.words;
  return words.slice(0, count).map((word) => generateTranslationQuestion(word, pool));
}

export default {
  pickUnique,
  shuffleArray,
  wordsByLevel,
  wordsByTopic,
  wordsByLevelAndTopic,
  generateTranslationQuestion,
  generateTranslationQuiz,
  generateSentenceQuestion,
  generateSentenceQuiz,
  generateMatchSet,
  generateErrorQuestion,
  generateErrorQuiz,
  generateQuizQuestion,
  generateQuizSet,
  generateProverbQuestion,
  generateProverbSet,
  generateWordQuestion,
  generateWordSet,
  buildFeedback,
  generateRetrySet
};
