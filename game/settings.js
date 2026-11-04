// Настройките в паузата: размазване, мъгла, призрак, карта и трудност.
// Пазят се в браузъра (localStorage['ffx-settings']). Трудността мени
// числата в params.js още при зареждането на модула — преди те да бъдат
// прочетени — затова смяната ѝ важи от следващото бягане.

import { CPU, DAMAGE, NITRO } from './params.js?v=167';
import { lang, setLang, t } from './i18n.js?v=167';

const KEY = 'ffx-settings';
const DEFAULTS = {
  time: 'day', weather: 'clear', quality: 'high', relief: true,
  blur: true, fog: true, ghost: true, map: true, difficulty: 'normal',
};
// Надписите са в i18n.js: 'val.day', 'val.sunset'…
const CYCLES = {
  time: ['day', 'sunset', 'night'],
  weather: ['clear', 'rain'],
  quality: ['high', 'low'],
};

// „Нормално" е играта, както е сега. Разликите са в щетите от удар с кола,
// в това колко бързо джипът излиза до теб и в зарядите нитро.
export const DIFFICULTY = {
  easy: { cpu: 1.2, cpuMax: 10, catchUp: 5, nitro: 5 },
  normal: { cpu: 2, cpuMax: 20, catchUp: 10, nitro: 3 },
  hard: { cpu: 2.5, cpuMax: 30, catchUp: 14, nitro: 2 },
};
const ORDER = ['easy', 'normal', 'hard'];

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; }
}

function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* няма хранилище */ }
}

export const settings = load();
const applied = DIFFICULTY[settings.difficulty] ? settings.difficulty : 'normal';
{
  const d = DIFFICULTY[applied];
  DAMAGE.cpu = d.cpu;
  DAMAGE.cpuMax = d.cpuMax;
  CPU.attackCatchUp = d.catchUp;
  NITRO.charges = d.nitro;
  NITRO.max = Math.max(NITRO.max, d.nitro);
}


/** Менюто в паузата. `apply` получава настройките при всяка промяна. */
export function pauseMenu(apply, { onResume, onRestart }) {
  const root = document.getElementById('pause');
  const note = document.getElementById('pause-note');
  const buttons = [...root.querySelectorAll('[data-setting]')];

  const render = () => {
    for (const b of buttons) {
      const k = b.dataset.setting;
      const value = k === 'lang' ? t('val.' + lang)
        : k === 'difficulty' ? t('val.' + settings.difficulty)
        : CYCLES[k] ? t('val.' + (CYCLES[k].includes(settings[k]) ? settings[k] : CYCLES[k][0]))
        : settings[k] ? t('on') : t('off');
      b.innerHTML = `<span>${t('set.' + k)}</span><b>${value}</b>`;
    }
    note.textContent = settings.difficulty !== applied ? t('difficultyNext') : '';
  };

  for (const b of buttons) {
    b.addEventListener('click', () => {
      const k = b.dataset.setting;
      // езикът не е настройка на играта: пази се отделно (i18n.js)
      if (k === 'lang') { setLang(lang === 'en' ? 'bg' : 'en'); render(); return; }
      if (k === 'difficulty') {
        settings.difficulty = ORDER[(ORDER.indexOf(settings.difficulty) + 1) % ORDER.length];
      } else if (CYCLES[k]) {
        const list = CYCLES[k];
        settings[k] = list[(list.indexOf(settings[k]) + 1) % list.length];
      } else {
        settings[k] = !settings[k];
      }
      save(settings);
      apply(settings);
      render();
    });
  }
  document.getElementById('pause-resume').addEventListener('click', onResume);
  document.getElementById('pause-restart').addEventListener('click', onRestart);

  apply(settings);
  render();
  return {
    show(on) {
      root.classList.toggle('on', on);
      if (on) render();
    },
  };
}
