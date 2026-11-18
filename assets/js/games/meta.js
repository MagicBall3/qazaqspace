/**
 * Метаданные игр без импорта движков — используются в хабе и прогрессе.
 */
export const GAME_META = [
  {
    id: 'wordquiz',
    titleKz: 'Сөзді тап',
    titleRu: 'Угадай слово',
    icon: 'cards',
    description: 'Қазақша сөздің дұрыс аудармасын таңда. 5 раунд.',
    instruction: 'Әр раундта бір сөз және 4 нұсқа беріледі. Дұрыс жауапқа +5 ұпай.',
    max: 25,
    level: true
  },
  {
    id: 'sentence',
    titleKz: 'Сөйлем құрастыр',
    titleRu: 'Собери предложение',
    icon: 'edit',
    description: 'Сөздерді дұрыс ретпен қойып, сөйлем құра. 4 раунд.',
    instruction: 'Сөздерді басып, дұрыс орынға қойыңыз. Дұрыс сөйлемге +10 ұпай.',
    max: 40,
    level: true
  },
  {
    id: 'match',
    titleKz: 'Жұпты тап',
    titleRu: 'Найди пару',
    icon: 'plus',
    description: 'Қазақша сөз бен орысша аудармасын сәйкестендір. 8 жұп.',
    instruction: 'Сол жақтан сөзді, оң жақтан аудармасын таңдаңыз. Дұрыс жұпқа +10, қатеге −2 ұпай.',
    max: 80,
    level: true
  },
  {
    id: 'proverbs',
    titleKz: 'Мақалды жалғастыр',
    titleRu: 'Продолжи пословицу',
    icon: 'flag',
    description: 'Қазақ мақал-мәтелдерінің дұрыс жалғасын таңда. 6 раунд.',
    instruction: 'Мақалдың басы беріледі. Үш нұсқаның ішінен дұрыс жалғасын таңдаңыз. +10 ұпай.',
    max: 60,
    level: false
  },
  {
    id: 'quiz',
    titleKz: 'Викторина',
    titleRu: 'Викторина',
    icon: 'spark',
    description: 'Тіл және мәдениет туралы 10 сұрақ.',
    instruction: 'Әр дұрыс жауапқа +10 ұпай. Жауаптан кейін түсіндірме шығады.',
    max: 100,
    level: true
  },
  {
    id: 'quest',
    titleKz: 'QR-квест: Мәдениет іздері',
    titleRu: 'QR-квест',
    icon: 'qr',
    description: '5 станция бойынша мәдениетті зертте. QR-код немесе код арқылы өтіңіз.',
    instruction: 'Әр станцияда сұраққа жауап беріңіз. QR-код коды дұрыс болса +5 бонус. Барлығы 75 ұпай.',
    max: 75,
    level: false
  },
  {
    id: 'finderror',
    titleKz: 'Қатені тап',
    titleRu: 'Найди ошибку',
    icon: 'edit',
    description: 'Сөйлемдегі қатені тауып, дұрыс нұсқасын таңда. 10 сұрақ.',
    instruction: 'Әр сөйлемді оқып, қате бар-жоғын анықтаңыз. Қате болса дұрыс нұсқасын таңдаңыз. +10 ұпай.',
    max: 100,
    level: true
  },
  {
    id: 'qazaqword',
    titleKz: 'QAZAQ WORD',
    titleRu: 'QAZAQ WORD',
    icon: 'cards',
    description: '5 әріпті сөзді 6 әрекетте тап. Казахский и русский языки.',
    instruction: '5 әріпті сөзді табыңыз. 6 әрекет бар. Жасыл — дұрыс орын, сары — сөзде бар, сұр — сөзде жоқ.',
    max: 6,
    level: false
  },
  {
    id: 'marathon',
    titleKz: 'Тіл марафоны',
    titleRu: 'Языковой марафон',
    icon: 'chart',
    description: '90 секунд ішінде 12 сұраққа жауап бер.',
    instruction: 'Уақыт шектеулі. Әр дұрыс жауапқа +5 ұпай. 60 ұпай — максимум.',
    max: 60,
    level: true
  }
];

export function getGameMeta(id) {
  return GAME_META.find((game) => game.id === id) || null;
}
