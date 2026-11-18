/**
 * QAZAQ SPACE — вычисление прогресса из реальных действий.
 * Никаких заранее заданных процентов и «фальшивой» аналитики.
 */
import { GAME_IDS } from './config.js';

const WEIGHTS = {
  lessons: 30,
  speak: 15,
  games: 20,
  culture: 20,
  media: 15
};

const MEDIA_TARGET = 1; // достаточно одной сохранённой творческой работы

export function computeProgress(state, data) {
  const totalLessons = data.lessons.length;
  const completedLessons = data.lessons.filter((lesson) => Boolean(state.lessons[lesson.id])).length;

  const totalSpeak = data.speak.length;
  const completedSpeak = data.speak.filter((scenario) => Boolean(state.speak[scenario.id])).length;

  const totalGames = GAME_IDS.length;
  const playedGames = GAME_IDS.filter((id) => {
    const record = state.games[id];
    return Boolean(record) && (Number(record.best) > 0 || id === 'quest');
  }).length;

  const totalCulture = data.culture.length;
  const completedCulture = data.culture.filter((card) => Boolean(state.culture[card.id])).length;

  const worksCount = state.media.length;
  const completedMedia = Math.min(worksCount, MEDIA_TARGET);

  const wordStats = Object.values(state.words);
  const wordsTouched = wordStats.filter((item) => (item.correct || 0) + (item.wrong || 0) > 0).length;
  const wordsMastered = wordStats.filter((item) => (item.correct || 0) >= 2).length;

  const categories = {
    lessons: { done: completedLessons, total: totalLessons },
    speak: { done: completedSpeak, total: totalSpeak },
    games: { done: playedGames, total: totalGames },
    culture: { done: completedCulture, total: totalCulture },
    media: { done: completedMedia, total: MEDIA_TARGET }
  };

  let weighted = 0;
  Object.entries(categories).forEach(([key, value]) => {
    const ratio = value.total > 0 ? Math.min(1, value.done / value.total) : 0;
    weighted += ratio * WEIGHTS[key];
  });
  const percent = Math.round(weighted);

  const gameBestSum = GAME_IDS.reduce((sum, id) => sum + (Number(state.games[id]?.best) || 0), 0);
  const points = completedLessons * 20
    + completedSpeak * 15
    + completedCulture * 10
    + completedMedia * 15
    + Math.min(worksCount, 3) * 5
    + gameBestSum;

  const totalWords = data.words.length;

  return {
    percent,
    points,
    categories,
    weights: WEIGHTS,
    lessons: { done: completedLessons, total: totalLessons },
    speak: { done: completedSpeak, total: totalSpeak },
    games: { done: playedGames, total: totalGames },
    culture: { done: completedCulture, total: totalCulture },
    media: { done: completedMedia, total: MEDIA_TARGET, works: worksCount },
    words: {
      mastered: wordsMastered,
      touched: wordsTouched,
      total: totalWords,
      percent: totalWords ? Math.round((wordsMastered / totalWords) * 100) : 0
    }
  };
}

export function achievements(state, progress) {
  const gameIds = Object.keys(state.games);
  return [
    {
      id: 'first_lesson',
      title: 'Алғашқы қадам',
      text: 'Бір сабақты аяқтадың',
      icon: 'book',
      unlocked: progress.lessons.done >= 1
    },
    {
      id: 'all_lessons',
      title: 'Білім іздеуші',
      text: 'Барлық сабақты аяқтадың',
      icon: 'chart',
      unlocked: progress.lessons.total > 0 && progress.lessons.done === progress.lessons.total
    },
    {
      id: 'first_game',
      title: 'Ойын басталды',
      text: 'Алғашқы ойын нәтижесі сақталды',
      icon: 'game',
      unlocked: gameIds.length >= 1
    },
    {
      id: 'words_10',
      title: 'Сөз зергері',
      text: '10 сөзді меңгердің (әр сөзге 2 дұрыс жауап)',
      icon: 'cards',
      unlocked: progress.words.mastered >= 10
    },
    {
      id: 'speaker',
      title: 'Сөйлеуші',
      text: '3 SPEAK жағдаятын орындадың',
      icon: 'chat',
      unlocked: progress.speak.done >= 3
    },
    {
      id: 'culture',
      title: 'Мәдениет зерттеушісі',
      text: '5 мәдениет карточкасын аяқтадың',
      icon: 'culture',
      unlocked: progress.culture.done >= 5
    },
    {
      id: 'creator',
      title: 'Шығармашыл',
      text: 'Бір шығармашылық жұмысты сақтадың',
      icon: 'media',
      unlocked: progress.media.works >= 1
    },
    {
      id: 'full_path',
      title: 'QAZAQ SPACE',
      text: 'Барлық бағытта ілгерілеу бар',
      icon: 'spark',
      unlocked: progress.lessons.done > 0
        && progress.games.done > 0
        && progress.speak.done > 0
        && progress.culture.done > 0
        && progress.media.works > 0
    }
  ];
}
