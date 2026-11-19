/**
 * QAZAQ SPACE — центральная конфигурация.
 * Секретов здесь нет и быть не должно.
 */
export const CONFIG = {
  version: '2.1.0',
  storageKey: 'qazaqspace.v2',
  legacyStorageKey: 'qs',
  media: {
    maxWorks: 50,
    maxTextLength: 12000
  }
};

export const LEVEL_LABELS = {
  1: '5 сынып',
  2: '6 сынып',
  3: '7 сынып'
};

export const LEVEL_LABELS_RU = {
  1: '5 класс',
  2: '6 класс',
  3: '7 класс'
};

export const GAME_IDS = ['wordquiz', 'sentence', 'match', 'proverbs', 'quiz', 'quest', 'marathon', 'finderror', 'qazaqword'];

export const GAME_LEVELS = [
  { value: 0, label: 'Барлығы' },
  { value: 1, label: '5 сынып' },
  { value: 2, label: '6 сынып' },
  { value: 3, label: '7 сынып' }
];

export const NAV_SECTIONS = [
  {
    label: 'Негізгі',
    items: [
      { href: '#/home', key: 'home', label: 'Басты бет', icon: 'home' },
      { href: '#/lessons', key: 'lessons', label: 'Сабақтар', icon: 'book' },
      { href: '#/vocab', key: 'vocab', label: 'Сөздік', icon: 'cards' }
    ]
  },
  {
    label: 'Төрт бағыт',
    items: [
      { href: '#/speak', key: 'speak', label: 'SPEAK', icon: 'chat' },
      { href: '#/games', key: 'games', label: 'GAME', icon: 'game' },
      { href: '#/culture', key: 'culture', label: 'ҰЛТТЫҚ LAB', icon: 'culture' },
      { href: '#/media', key: 'media', label: 'MEDIA SPACE', icon: 'media' }
    ]
  },
  {
    label: 'Жеке',
    items: [
      { href: '#/progress', key: 'progress', label: 'Менің жетістігім', icon: 'chart' }
    ]
  }
];

export const BOTTOM_NAV = [
  { href: '#/home', key: 'home', label: 'Басты', icon: 'home' },
  { href: '#/lessons', key: 'lessons', label: 'Сабақ', icon: 'book' },
  { href: '#/games', key: 'games', label: 'Ойын', icon: 'game' },
  { href: '#/cult', key: 'culture', label: 'Мәдениет', icon: 'culture' },
  { key: '__menu', label: 'Мәзір', icon: 'menu', action: 'open-menu' }
];
