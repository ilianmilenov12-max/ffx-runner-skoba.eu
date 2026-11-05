// Запис на карането и повторението му стъпка по стъпка. Не е част от играта.
//
//   ?rec=<име>     играеш нормално; клавишите на всяка стъпка от симулацията (25 в секунда)
//                  се пращат на tools/rec_server.py → tools/inputs/<име>.json (на всеки 2 s и в края)
//   ?replay=<име>  същото каране наново, без часовника на браузъра: кадрите ги рисува
//                  tools/capture.js през ffx.manual(), затова видеото излиза гладко
//
// Повтаря се точно, защото симулацията не зависи от рисуването: стъпката е постоянна, светофарът
// светва след брой стъпки, колите на противника гледат през своя камера (aiEye в main.js), а
// оградите хвърчат по случайни числа с постоянно начало. Трудността трябва да е същата: тя се
// пази в записа и replay я слага преди зареждането (виж capture.js).

const SERVER = 'http://127.0.0.1:8799';
const KEYS = ['forward', 'backward', 'left', 'right', 'brake', 'nitro'];
const PAUSE = 1 << KEYS.length;

const pack = (car, state) => KEYS.reduce((v, k, i) => v | (car.keys[k] ? 1 << i : 0), 0) | (state.paused ? PAUSE : 0);

/** Записът: [стойност, брой стъпки] — клавишите се сменят рядко, затова е кратък. */
export function record(ffx, name) {
  const { car, state } = ffx;
  const runs = [];
  ffx.onStep = () => {
    const v = pack(car, state);
    const last = runs[runs.length - 1];
    if (last && last[0] === v) last[1]++;
    else runs.push([v, 1]);
  };
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('ffx-settings')) || {}; } catch { /* няма */ }
  const save = () => fetch(`${SERVER}/inputs?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body: JSON.stringify({ name, settings, beganAt: state.beganAt, steps: state.step, runTime: state.runTime,
      won: !!state.won, finished: !!state.finished, runs }),
  }).catch(() => {});
  const timer = setInterval(() => { save(); if (state.finished) clearInterval(timer); }, 2000);
  addEventListener('pagehide', save);
  console.log(`записвам карането като „${name}“`);
}

/** Повторението: при всяка стъпка слага записаните клавиши и натиска PLAY в същия момент. */
export async function replay(ffx, name) {
  const rec = await fetch(`tools/inputs/${encodeURIComponent(name)}.json?t=${Date.now()}`).then(r => r.json());
  const values = [];
  for (const [v, n] of rec.runs) for (let i = 0; i < n; i++) values.push(v);
  const { car, state } = ffx;
  ffx.replay = rec;
  ffx.onStep = step => {
    if (rec.beganAt != null && step === rec.beganAt && state.beganAt == null) ffx.begin();
    const v = values[step] ?? 0;
    KEYS.forEach((k, i) => { car.keys[k] = v & (1 << i) ? 1 : 0; });
    const paused = !!(v & PAUSE);
    if (state.started && !state.finished && paused !== state.paused) {
      state.paused = paused;
      state.running = !paused;
    }
  };
  ffx.replayReady = true;
  console.log(`повторение на „${name}“: ${values.length} стъпки, PLAY на ${rec.beganAt}`);
}
