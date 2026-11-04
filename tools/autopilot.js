// Автопилот за тестване: кара по записания маршрут (tools/route.json) и
// води дневник на всичко по пътя — стъпките на сценария, сцените, щетите,
// колите на противника.
//
// Не е част от играта. Кара чрез ffx.advance(), тоест превърта симулацията
// без да чака браузъра да рисува — Chrome спира анимацията на прозорец,
// който не е отпред, а маршрутът е три минути.
//
//   const ap = await import('./tools/autopilot.js?t=' + Date.now());
//   const pilot = await ap.createPilot(window.ffx, { invulnerable: true });
//   pilot.run(60);           // шейсет секунди симулация
//   pilot.report();

const REACH = 28;         // на колко фута от точката минаваме към следващата
const LOOKAHEAD = 12;     // колко точки напред търсим, ако колата е избутана
const AIM_FT = 38;        // целта за волана е толкова напред по пътя
const PREVIEW_FT = 110;   // толкова напред гледаме, за да забавим преди завой

export async function createPilot(ffx, opts = {}) {
  const { invulnerable = false, infiniteFuel = false } = opts;
  const res = await fetch('tools/route.json?t=' + Date.now());
  const route = await res.json();
  const pts = [...route['обиколка_1'], ...route['обиколка_2_и_финал']];

  const { car, state, sequence, chaser, ambusher, driver } = ffx;
  const log = { събития: [], щети: [], видимост: [0, 0, 0], близо: [0, 0, 0], проби: 0 };
  const note = (what, extra = {}) => log.събития.push({
    t: +state.simTime.toFixed(1), what,
    поз: [Math.round(car.position.x), Math.round(car.position.y)], ...extra,
  });

  let i = 0, stuck = 0, lastStep = sequence.step, lastCut = false, lastBody = state.body;
  let snaps = 0;
  let progressAt = 0, progressI = 0;   // кога за последно е напреднал
  let lastGarage = chaser.inGarage;

  // Същата проверка, по която колите решават дали са изчезнали от кадър.
  const inFrame = c => !c.inGarage && !c.isHidden();

  /** Една стъпка: дневник и клавиши. Връща false, щом трябва да спре. */
  function tick() {
    if (state.finished || i >= pts.length) return false;
    if (invulnerable) state.body = 100;
    if (infiniteFuel) state.fuel = 4000;

    if (sequence.step !== lastStep) { note('стъпка ' + lastStep + ' → ' + sequence.step); lastStep = sequence.step; }
    const cut = sequence.cutscene > 0;
    if (cut !== lastCut) { note(cut ? 'сцена започва' : 'сцена свършва', { скорост: +car.speed.toFixed(1) }); lastCut = cut; }
    if (chaser.inGarage !== lastGarage) { note(chaser.inGarage ? 'гонителят в гаража' : 'гонителят се появява'); lastGarage = chaser.inGarage; }
    if (!invulnerable && state.body < lastBody) log.щети.push([+state.simTime.toFixed(1), lastBody - state.body]);
    lastBody = state.body;

    log.проби++;
    [chaser, ambusher, driver].forEach((c, k) => {
      if (inFrame(c)) log.видимост[k]++;
      if (c.position.distanceTo(car.position) < 60) log.близо[k]++;
    });

    // Ако колата е избутана встрани, хващаме най-близката точка напред.
    let best = i, bestD = Infinity;
    for (let k = i; k < Math.min(pts.length, i + LOOKAHEAD); k++) {
      const d = Math.hypot(pts[k][0] - car.position.x, pts[k][1] - car.position.y);
      if (d < bestD) { bestD = d; best = k; }
    }
    i = best;
    if (bestD < REACH) i++;
    if (i >= pts.length) return false;

    // Заседнал ли е? Ако не е напреднал четири секунди, го местим напред.
    if (i !== progressI) { progressI = i; progressAt = state.simTime; }
    if (state.running && !sequence.controlsLocked && sequence.cutscene <= 0 &&
        state.simTime - progressAt > 4) {
      const at = pts[i], next = pts[Math.min(i + 1, pts.length - 1)];
      car.placeAt(new ffx.THREE.Vector3(at[0], at[1], (at[2] ?? 0) + 0.3),
                  Math.atan2(next[1] - at[1], next[0] - at[0]));
      note('заседнал, преместен', { точка: i });
      snaps++;
      progressAt = state.simTime;
      i++;
      return true;
    }

    // Паднала ли е колата от маршрута? Тесен мост, пропуснат завой — тогава
    // я връщаме върху пътя. Тестваме сценария и противниците, не шофьора.
    // Разстоянието е до отсечката между предишната и текущата точка, не до
    // самата точка: иначе колата винаги е „далеч" по средата между две точки.
    const here = pts[Math.min(i, pts.length - 1)];
    const prev = pts[Math.max(0, i - 1)];
    const sx = here[0] - prev[0], sy = here[1] - prev[1];
    const len2 = sx * sx + sy * sy || 1;
    const u = Math.max(0, Math.min(1, ((car.position.x - prev[0]) * sx + (car.position.y - prev[1]) * sy) / len2));
    const off = Math.hypot(prev[0] + u * sx - car.position.x, prev[1] + u * sy - car.position.y);
    const routeZ = (prev[2] ?? 0) + u * ((here[2] ?? 0) - (prev[2] ?? 0));
    const drop = Math.abs(routeZ - car.position.z);
    if (state.running && !sequence.controlsLocked && sequence.cutscene <= 0 &&
        (off > 35 || drop > 6)) {
      const next = pts[Math.min(i + 1, pts.length - 1)];
      car.placeAt(new ffx.THREE.Vector3(here[0], here[1], (here[2] ?? 0) + 0.3),
                  Math.atan2(next[1] - here[1], next[0] - here[0]));
      snaps++;
      note('върнат на маршрута', { точка: i, отклонение: Math.round(off), височина: Math.round(drop) });
      return true;
    }

    // Преследване на точка напред по пътя: целим се в първата точка, която
    // е поне AIM_FT от колата — така завоят започва навреме, а не чак
    // когато колата стигне ъгъла.
    const ahead = ft => {
      for (let k = i; k < pts.length; k++) {
        if (Math.hypot(pts[k][0] - car.position.x, pts[k][1] - car.position.y) >= ft) return pts[k];
      }
      return pts[pts.length - 1];
    };
    const angleTo = pt => {
      const fwd = car.forwardVector;
      let a = Math.atan2(pt[1] - car.position.y, pt[0] - car.position.x) - Math.atan2(fwd.y, fwd.x);
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return a;
    };
    const diff = angleTo(ahead(AIM_FT));
    const bend = Math.abs(angleTo(ahead(PREVIEW_FT)));

    const keys = car.keys;
    keys.left = diff > 0.06 ? 1 : 0;
    keys.right = diff < -0.06 ? 1 : 0;
    keys.brake = 0;
    keys.backward = 0;
    keys.forward = 1;
    // Колкото по-остър е завоят отпред, толкова по-бавно влизаме в него.
    const safe = bend > 1.2 ? 22 : bend > 0.7 ? 32 : bend > 0.35 ? 42 : 99;
    if (car.speed > safe) { keys.forward = 0; if (car.speed > safe + 8) keys.brake = 1; }

    stuck = (state.running && Math.abs(car.speed) < 4) ? stuck + 1 : 0;
    if (stuck > 20) {
      keys.forward = 0; keys.backward = 1;
      keys.left = diff < 0 ? 1 : 0; keys.right = diff > 0 ? 1 : 0;
      if (stuck > 40) stuck = 0;
    }
    return true;
  }

  return {
    log,
    get point() { return i + ' от ' + pts.length; },
    run(seconds) { ffx.advance(seconds, tick); return this.status(); },
    status() {
      return {
        t: +state.simTime.toFixed(0), точка: this.point, зона: ffx.world.currentZone,
        стъпка: sequence.step, каросерия: state.body, гориво: state.fuel, край: state.finished,
      };
    },
    report() {
      const pct = a => a.map(n => Math.round(100 * n / Math.max(1, log.проби)) + '%');
      return {
        събития: log.събития, щети: log.щети.slice(0, 30),
        в_кадър: pct(log.видимост), под_60ft: pct(log.близо), редът: ['гонител', 'засада', 'улична'],
        връщания: snaps,
        край: state.finished ? (state.won ? 'победа' : state.destroyed ? 'унищожена'
              : state.outOfFuel ? 'гориво' : 'затворен') : 'не е свършило',
        ...this.status(),
      };
    },
  };
}
