/**
 * QAZAQ SPACE — загрузка и индексация данных.
 * Единственный источник словаря — data/vocabulary.json.
 * Все разделы используют эти индексы, поэтому исправление словаря
 * автоматически отражается в уроках, играх и SPEAK.
 */

const FILES = {
  vocabulary: 'data/vocabulary.json',
  lessons: 'data/lessons.json',
  speak: 'data/speak.json',
  games: 'data/games.json',
  culture: 'data/culture.json',
  media: 'data/media.json'
};

export const data = {
  ready: false,
  words: [],
  topics: [],
  topicIndex: new Map(),
  vocabIndex: new Map(),
  wordsByTopic: new Map(),
  wordsByLevel: new Map(),
  lessons: [],
  lessonIndex: new Map(),
  speak: [],
  speakIndex: new Map(),
  games: null,
  quest: null,
  culture: [],
  cultureIndex: new Map(),
  cultureThemes: [],
  cultureThemeIndex: new Map(),
  media: [],
  mediaIndex: new Map(),
  statusCounts: {},
  issues: []
};

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`Деректер қатесі: ${name} массиві табылмады / Ошибка данных: ${name} не является массивом.`);
  }
  return value;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`${path} — HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${path} — JSON қатесі / некорректный JSON`);
  }
}

function buildIndexes() {
  data.issues = [];

  /* Словарь ------------------------------------------------------------- */
  data.topics = assertArray(data.vocabulary.topics, 'vocabulary.topics');
  data.words = assertArray(data.vocabulary.words, 'vocabulary.words');
  data.topicIndex = new Map(data.topics.map((topic) => [topic.id, topic]));
  data.vocabIndex = new Map();
  data.wordsByTopic = new Map();
  data.wordsByLevel = new Map();
  data.statusCounts = { needs_review: 0, verified: 0, rejected: 0 };

  data.words.forEach((word) => {
    if (!word.id || data.vocabIndex.has(word.id)) {
      data.issues.push(`Қайталанған немесе бос ID: ${word.id || '—'}`);
      return;
    }
    data.vocabIndex.set(word.id, word);
    if (word.status && data.statusCounts[word.status] !== undefined) {
      data.statusCounts[word.status] += 1;
    } else {
      data.issues.push(`Белгісіз мәртебе: ${word.id}`);
    }
    if (!data.topicIndex.has(word.topic)) {
      data.issues.push(`Белгісіз тақырып: ${word.id} → ${word.topic}`);
    } else {
      if (!data.wordsByTopic.has(word.topic)) data.wordsByTopic.set(word.topic, []);
      data.wordsByTopic.get(word.topic).push(word);
    }
    const level = Number(word.level) || 1;
    if (!data.wordsByLevel.has(level)) data.wordsByLevel.set(level, []);
    data.wordsByLevel.get(level).push(word);
  });

  /* Уроки ---------------------------------------------------------------- */
  data.lessons = assertArray(data.lessonsRoot.lessons, 'lessons.lessons');
  data.lessonIndex = new Map();
  data.lessons.forEach((lesson) => {
    if (!lesson.id || data.lessonIndex.has(lesson.id)) {
      data.issues.push(`Сабақ ID қатесі: ${lesson.id || '—'}`);
      return;
    }
    data.lessonIndex.set(lesson.id, lesson);
    (lesson.vocabulary || []).forEach((wordId) => {
      if (!data.vocabIndex.has(wordId)) {
        data.issues.push(`Сабақта жоқ сөз: ${lesson.id} → ${wordId}`);
      }
    });
  });

  /* SPEAK ---------------------------------------------------------------- */
  data.speak = assertArray(data.speakRoot.scenarios, 'speak.scenarios');
  data.speakIndex = new Map(data.speak.map((scenario) => [scenario.id, scenario]));

  /* Игры ---------------------------------------------------------------- */
  data.games = data.games || {};
  data.quest = data.games.quest || null;
  assertArray(data.games.sentences, 'games.sentences');
  assertArray(data.games.proverbs, 'games.proverbs');
  assertArray(data.games.quiz, 'games.quiz');

  /* Культура ------------------------------------------------------------- */
  data.cultureThemes = assertArray(data.cultureRoot.themes, 'culture.themes');
  data.cultureThemeIndex = new Map(data.cultureThemes.map((theme) => [theme.id, theme]));
  data.culture = assertArray(data.cultureRoot.cards, 'culture.cards');
  data.cultureIndex = new Map(data.culture.map((card) => [card.id, card]));

  /* Медиа ---------------------------------------------------------------- */
  data.media = assertArray(data.mediaRoot.templates, 'media.templates');
  data.mediaIndex = new Map(data.media.map((template) => [template.id, template]));

  data.ready = true;
  if (data.issues.length) {
    console.warn('[QAZAQ SPACE] data issues:', data.issues);
  }
}

export async function loadData() {
  const [vocabulary, lessons, speak, games, culture, media] = await Promise.all([
    fetchJson(FILES.vocabulary),
    fetchJson(FILES.lessons),
    fetchJson(FILES.speak),
    fetchJson(FILES.games),
    fetchJson(FILES.culture),
    fetchJson(FILES.media)
  ]);

  data.vocabulary = vocabulary;
  data.lessonsRoot = lessons;
  data.speakRoot = speak;
  data.games = games;
  data.cultureRoot = culture;
  data.mediaRoot = media;

  buildIndexes();
  return data;
}

/* Convenience ------------------------------------------------------------ */

export function getWord(id) {
  return data.vocabIndex.get(id) || null;
}

export function wordsForLesson(lesson) {
  return (lesson?.vocabulary || []).map(getWord).filter(Boolean);
}

export function getTopic(id) {
  return data.topicIndex.get(id) || { id, kz: id, ru: id };
}

export function getCultureTheme(id) {
  return data.cultureThemeIndex.get(id) || { id, kz: id, ru: id };
}

export function allGameQuestions() {
  const quiz = (data.games?.quiz || []).slice();
  const proverbs = (data.games?.proverbs || []).map((proverb) => ({
    id: proverb.id,
    level: 2,
    question: `«${proverb.beginning} …» мақалын аяқтаңыз.`,
    options: proverb.options,
    answer: proverb.answer,
    explain: `${proverb.ru} ${proverb.meaning || ''}`.trim()
  }));
  return quiz.concat(proverbs);
}
