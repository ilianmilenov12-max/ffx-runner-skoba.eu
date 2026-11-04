// Езикът на играта: английски по подразбиране, български по избор.
// Изборът идва от ?lang=bg|en в адреса (линкът на началния екран) или от
// бутона в паузата и се пази в браузъра (localStorage['ffx-lang']).
// Текстовете в index.html са с data-i18n="ключ" (съдържание) и
// data-i18n-aria / data-i18n-alt (атрибути); applyStatic() ги попълва.

const KEY = 'ffx-lang';
export const LANGS = ['en', 'bg'];

const TEXT = {
  en: {
    wait: 'please wait…',
    loadingWorld: 'loading the city…',
    loadingCars: 'loading the cars…',
    pressPlay: 'press PLAY or any key',
    tapPlay: 'tap PLAY',
    error: 'ERROR: ',
    best: 'best ',
    bestTime: 'best time ',
    bestPoints: 'high score ',
    fuel: 'fuel',
    body: 'body',
    fuelCans: 'fuel cans',
    repairs: 'repairs',
    won: 'Congratulations, you win!!',
    trapped: 'You were captured.',
    crash: 'Car destroyed, you lose.',
    outOfFuel: 'Out of fuel, you lose.',
    failed: 'Mission failed: try again!',
    end: 'Game over',
    newRecord: 'new record!',
    recordTime: 'best time',
    recordPoints: 'high score',
    nitro: 'nitro ',
    version: 'version ',
    difficultyNext: 'difficulty applies from the next run (R)',
    on: 'on',
    off: 'off',
    'set.time': 'time of day',
    'set.weather': 'weather',
    'set.quality': 'graphics',
    'set.relief': 'building relief',
    'set.blur': 'motion blur',
    'set.fog': 'distance fog',
    'set.ghost': 'record ghost',
    'set.map': 'mini map',
    'set.difficulty': 'difficulty',
    'set.lang': 'language',
    'val.day': 'day', 'val.sunset': 'sunset', 'val.night': 'night',
    'val.clear': 'clear', 'val.rain': 'rain',
    'val.high': 'high', 'val.low': 'low',
    'val.easy': 'easy', 'val.normal': 'normal', 'val.hard': 'hard',
    'val.en': 'English', 'val.bg': 'Български',
    // index.html
    'alt.fuel': 'fuel',
    'alt.body': 'body',
    'aria.play': 'Play',
    'aria.howto': 'How to play',
    howtoTitle: 'How to play',
    howto1: 'You are driving through the city and the enemy cars are chasing you and lying in wait. ' +
      'The route has two laps: the first time the level crossing ahead closes and you turn north through the tunnel; ' +
      'the second time you get through the crossing, go around the truck and race the last barrier before the train shuts you in.',
    howto2: '<kbd>↑</kbd> throttle · <kbd>↓</kbd> reverse, or handbrake at speed · <kbd>←</kbd><kbd>→</kbd> steer · ' +
      '<kbd>space</kbd> brake · <kbd>Shift</kbd> nitro · <kbd>P</kbd> pause and settings · <kbd>R</kbd> restart',
    howto3: 'Fuel cans refill fuel and nitro, wrenches repair the body. The yellow line on the map in the top right shows the way.',
    howtoBack: 'click to go back',
    'over.left': 'remaining',
    'over.collected': 'collected',
    'over.time': 'time',
    'over.score': 'score',
    pauseTitle: 'Pause',
    resume: 'Resume',
    restart: 'Restart',
    brake: 'brake',
    keys: '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> steer · <kbd>space</kbd> brake · <kbd>Shift</kbd> nitro · ' +
      '<kbd>P</kbd> pause and settings · <kbd>R</kbd> restart · <kbd>D</kbd> diagnostics',
    credits: 'Original game by <a href="https://github.com/OfficinePixel/ffx_runner" target="_blank" rel="noopener">Officine Pixel</a>' +
      ' · <a href="LICENSE.txt" target="_blank">GPL-3.0</a>' +
      ' · <a href="https://github.com/ilianmilenov12-max/ffx-runner-skoba.eu" target="_blank" rel="noopener">source code</a>' +
      ' · web port by <a href="https://skoba.eu/proekti/ffx-runner?ref=ffx" target="_blank" rel="noopener">Skoba</a>',
    switchLang: '<a href="?lang=bg" lang="bg">Български</a>',
  },
  bg: {
    wait: 'моля, изчакай…',
    loadingWorld: 'зареждане на света…',
    loadingCars: 'зареждане на колите…',
    pressPlay: 'натисни PLAY или който и да е клавиш',
    tapPlay: 'докосни PLAY',
    error: 'ГРЕШКА: ',
    best: 'рекорд ',
    bestTime: 'най-добро време ',
    bestPoints: 'най-много точки ',
    fuel: 'гориво',
    body: 'каросерия',
    fuelCans: 'бидони',
    repairs: 'ремонти',
    won: 'Поздравления, ти спечели!!',
    trapped: 'Заловен си.',
    crash: 'Колата е унищожена, губиш.',
    outOfFuel: 'Горивото свърши, губиш.',
    failed: 'Мисията се провали: опитай пак!',
    end: 'Край',
    newRecord: 'нов рекорд!',
    recordTime: 'рекорд време',
    recordPoints: 'рекорд точки',
    nitro: 'нитро ',
    version: 'версия ',
    difficultyNext: 'трудността важи от следващото бягане (R)',
    on: 'вкл.',
    off: 'изкл.',
    'set.time': 'време на деня',
    'set.weather': 'време',
    'set.quality': 'графика',
    'set.relief': 'релеф по сградите',
    'set.blur': 'размазване при скорост',
    'set.fog': 'мъгла в далечината',
    'set.ghost': 'призрак на рекорда',
    'set.map': 'мини карта',
    'set.difficulty': 'трудност',
    'set.lang': 'език',
    'val.day': 'ден', 'val.sunset': 'залез', 'val.night': 'нощ',
    'val.clear': 'ясно', 'val.rain': 'дъжд',
    'val.high': 'високо', 'val.low': 'ниско',
    'val.easy': 'лесно', 'val.normal': 'нормално', 'val.hard': 'трудно',
    'val.en': 'English', 'val.bg': 'Български',
    'alt.fuel': 'гориво',
    'alt.body': 'каросерия',
    'aria.play': 'Играй',
    'aria.howto': 'Как се играе',
    howtoTitle: 'Как се играе',
    howto1: 'Бягаш с колата през града, а колите на противника те гонят и причакват. Пътят е две обиколки: ' +
      'първия път прелезът пред теб се затваря и завиваш на север през тунела; втория път минаваш ' +
      'през прелеза, заобикаляш камиона и се надбягваш с последната бариера, преди влакът да те затвори.',
    howto2: '<kbd>↑</kbd> газ · <kbd>↓</kbd> заден ход, а при скорост ръчна спирачка · <kbd>←</kbd><kbd>→</kbd> завиване · ' +
      '<kbd>интервал</kbd> спирачка · <kbd>Shift</kbd> нитро · <kbd>P</kbd> пауза и настройки · <kbd>R</kbd> отначало',
    howto3: 'Бидоните пълнят горивото и нитрото, гаечните ключове оправят каросерията. Жълтата линия на картата горе вдясно показва пътя.',
    howtoBack: 'натисни, за да се върнеш',
    'over.left': 'остатък',
    'over.collected': 'събрани',
    'over.time': 'време',
    'over.score': 'точки',
    pauseTitle: 'Пауза',
    resume: 'Продължи',
    restart: 'Отначало',
    brake: 'спирачка',
    keys: '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> кормуване · <kbd>интервал</kbd> спирачка · <kbd>Shift</kbd> нитро · ' +
      '<kbd>P</kbd> пауза и настройки · <kbd>R</kbd> отначало · <kbd>D</kbd> диагностика',
    credits: 'Оригиналната игра е на <a href="https://github.com/OfficinePixel/ffx_runner" target="_blank" rel="noopener">Officine Pixel</a>' +
      ' · <a href="LICENSE.txt" target="_blank">GPL-3.0</a>' +
      ' · <a href="https://github.com/ilianmilenov12-max/ffx-runner-skoba.eu" target="_blank" rel="noopener">изходен код</a>' +
      ' · уеб порт: <a href="https://skoba.eu/proekti/ffx-runner?ref=ffx" target="_blank" rel="noopener">Скоба</a>',
    switchLang: '<a href="?lang=en" lang="en">English</a>',
  },
};

function initial() {
  const fromUrl = new URL(location.href).searchParams.get('lang');
  if (LANGS.includes(fromUrl)) {
    try { localStorage.setItem(KEY, fromUrl); } catch { /* няма хранилище */ }
    return fromUrl;
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* няма хранилище */ }
  return 'en';
}

export let lang = initial();

/** Текстът за ключа на текущия език (или самият ключ, ако го няма). */
export function t(key) {
  return TEXT[lang][key] ?? TEXT.en[key] ?? key;
}

/** Число с разделителите на езика: 12,345 / 12 345. */
export function num(n) {
  return n.toLocaleString(lang === 'bg' ? 'bg' : 'en');
}

/** Попълва текстовете в index.html. */
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.innerHTML = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-alt]')) el.setAttribute('alt', t(el.dataset.i18nAlt));
}

/** Сменя езика в движение (бутонът в паузата). */
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* няма хранилище */ }
  // адресът не бива да връща стария език при R (location.reload)
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
  }
  applyStatic();
  dispatchEvent(new CustomEvent('ffx-lang', { detail: next }));
}

applyStatic();
