// Записвач на сесия: какво става, докато човек кара.
//
// Не е част от играта. Включва се веднъж от конзолата и оттам нататък
// оцелява при R, защото флагът е в sessionStorage и main.js го вдига сам:
//
//   sessionStorage.setItem('ffx-rec-on', '1');
//   (await import('./tools/recorder.js')).start(window.ffx);
//
// Всяко бягане се праща на части на tools/rec_server.py, който ги пише в
// tools/sessions/<id>.jsonl. Ако сървърът не върви, записът остава само в
// sessionStorage ('ffx-rec').
//
// Записва се на всяка стъпка на симулацията — закача се за sequence.update,
// който тече от зеления светофар нататък, — а не по таймер: таймерите в
// браузъра се забавят, щом табът не е отпред.

const ENDPOINT = 'http://127.0.0.1:8799/rec';
const SAMPLE_EVERY = 0.5;   // секунди между две проби на положението
const SEND_EVERY = 3;       // секунди между две пращания
const NEAR = 60;            // „близо" е под толкова фута
const STILL_SPEED = 3;      // под толкова ft/s колата се смята за спряла
const STILL_TIME = 2;       // …ако стои толкова секунди извън сцена
const MAX_EVENTS = 3000;

export function start(ffx) {
  if (window.__rec) return window.__rec;
  const { car, chaser, ambusher, driver, sequence, state, world, engine } = ffx;
  const enemies = [['джип', chaser], ['бус', ambusher], ['улична', driver]];

  const id = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const version = (document.querySelector('script[type=module]')?.getAttribute('src') || '')
    .split('v=')[1] || '?';
  const run = {
    id, version, started: new Date().toISOString(),
    samples: [], events: [],
    steps: 0,
    visible: { джип: 0, бус: 0, улична: 0 },
    near: { джип: 0, бус: 0, улична: 0 },
    end: null,
  };
  let sentSamples = 0, sentEvents = 0, lastSend = 0;

  // Какво е било на предишната стъпка — за да се хващат само промените.
  let t0 = null;
  let lastSample = -Infinity;
  let prev = null;
  let stillSince = null;
  let lastCrash = null;

  // Звукът на удара носи вида му (crash1/2, impatto1–3, ribaltamento…) —
  // само оттам се разбира в какво се е ударила колата.
  const crash = engine.crash.bind(engine);
  engine.crash = kind => { lastCrash = { kind, t: now() }; return crash(kind); };

  const now = () => +(state.simTime - (t0 ?? state.simTime)).toFixed(2);
  const pos = () => [Math.round(car.position.x), Math.round(car.position.y)];
  const note = (what, extra = {}) => {
    if (run.events.length < MAX_EVENTS) run.events.push({ t: now(), what, pos: pos(), ...extra });
  };
  const keys = () => {
    const k = car.keys;
    return (k.forward ? 'F' : '-') + (k.backward ? 'B' : '-') + (k.left ? 'L' : '-') +
           (k.right ? 'R' : '-') + (k.brake ? 'S' : '-');
  };
  const nearest = () => {
    let best = null;
    for (const [name, c] of enemies) {
      if (c.inGarage) continue;
      const d = c.position.distanceTo(car.position);
      if (!best || d < best.d) best = { name, d, status: c.status };
    }
    return best ? { кой: best.name, ft: Math.round(best.d), статус: best.status } : null;
  };
  const snapshot = () => ({
    step: sequence.step,
    cut: sequence.cutscene > 0,
    zone: world.currentZone,
    body: state.body,
    fuelPicks: state.pickedFuel,
    repairPicks: state.pickedRepair,
    upside: car.upsideDownSince !== null && car.upsideDownSince !== undefined,
    enemies: enemies.map(([, c]) => ({ garage: c.inGarage, status: c.status, spot: c.spot })),
  });

  function send(final = false) {
    const part = {
      id, version,
      samples: run.samples.slice(sentSamples),
      events: run.events.slice(sentEvents),
      summary: summary(),
      final,
    };
    sentSamples = run.samples.length;
    sentEvents = run.events.length;
    const body = JSON.stringify(part);
    try {
      if (final) navigator.sendBeacon(ENDPOINT + '?id=' + id, body);
      else fetch(ENDPOINT + '?id=' + id, { method: 'POST', mode: 'no-cors', body }).catch(() => {});
    } catch { /* сървърът не върви — остава sessionStorage */ }
    try {
      const all = JSON.parse(sessionStorage.getItem('ffx-rec') || '{}');
      all[id] = run;
      sessionStorage.setItem('ffx-rec', JSON.stringify(all));
    } catch { /* препълнено или забранено */ }
  }

  function summary() {
    const pct = o => Object.fromEntries(Object.entries(o).map(([k, v]) =>
      [k, Math.round(100 * v / Math.max(1, run.steps)) + '%']));
    return {
      време: now(), стъпка: sequence.step, зона: world.currentZone,
      каросерия: state.body, гориво: state.fuel,
      в_кадър: pct(run.visible), под_60ft: pct(run.near),
      край: run.end,
    };
  }

  function onStep() {
    if (run.end || state.paused || !state.started) return;
    if (t0 === null) { t0 = state.simTime; note('старт'); }
    const t = now();
    const s = snapshot();

    if (prev) {
      if (s.step !== prev.step) {
        note('стъпка ' + prev.step + ' → ' + s.step, {
          бариера1: +sequence.closed[0].toFixed(2), бариера2: +sequence.closed[1].toFixed(2),
          скорост: Math.round(car.velocity.length()),
        });
      }
      if (s.cut !== prev.cut) note(s.cut ? 'сцена започва' : 'сцена свършва', {
        скорост: Math.round(car.velocity.length()),
      });
      if (s.zone !== prev.zone) note('зона ' + s.zone);
      if (s.body < prev.body) {
        note('удар', {
          щета: prev.body - s.body, остава: s.body,
          звук: lastCrash && t - lastCrash.t < 0.2 ? lastCrash.kind : null,
          най_близо: nearest(),
          скорост: Math.round(car.velocity.length()),
        });
      }
      if (s.repairPicks > prev.repairPicks) note('ремонт', { каросерия: s.body });
      if (s.fuelPicks > prev.fuelPicks) note('гориво', { гориво: state.fuel });
      if (s.upside && !prev.upside) note('по таван');
      s.enemies.forEach((e, k) => {
        const p = prev.enemies[k];
        const name = enemies[k][0];
        if (e.garage !== p.garage) note(name + (e.garage ? ' изчезва' : ' се появява'), {
          статус: e.status,
          ft: e.garage ? null : Math.round(enemies[k][1].position.distanceTo(car.position)),
        });
        // Уличната сменя състоянието си постоянно (retro/Ok/searching) —
        // от нея се пазят само появяванията.
        if (k < 2 && e.status !== p.status && !e.garage) note(name + ': ' + p.status + ' → ' + e.status, {
          ft: Math.round(enemies[k][1].position.distanceTo(car.position)),
        });
        if (k === 1 && e.spot !== p.spot) note('бус: засада ' + p.spot + ' → ' + e.spot);
      });
    }

    // Стои ли колата? Засича заклещвания в геометрията и в противниците.
    const speed = car.velocity.length();
    if (state.running && !s.cut && speed < STILL_SPEED) {
      if (stillSince === null) stillSince = t;
      else if (stillSince !== false && t - stillSince > STILL_TIME) {
        note('стои', { от: stillSince, клавиши: keys(), най_близо: nearest() });
        stillSince = false;             // веднъж, докато не тръгне пак
      }
    } else {
      stillSince = null;
    }

    if (state.running && !s.cut) {
      run.steps++;
      for (const [name, c] of enemies) {
        if (c.inGarage) continue;
        if (!c.isHidden()) run.visible[name]++;
        if (c.position.distanceTo(car.position) < NEAR) run.near[name]++;
      }
    }

    if (t - lastSample >= SAMPLE_EVERY) {
      lastSample = t;
      const p = car.position;
      run.samples.push([
        t, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1),
        Math.round(speed), s.zone, s.step, s.body, state.fuel, keys(),
        ...enemies.map(([, c]) => c.inGarage ? null : Math.round(c.position.distanceTo(p))),
      ]);
    }

    if (state.finished) {
      run.end = state.won ? 'победа' : state.destroyed ? 'унищожена'
              : state.outOfFuel ? 'без гориво' : 'затворен';
      note('край: ' + run.end);
      send(true);
      return;
    }
    if (t - lastSend >= SEND_EVERY) { lastSend = t; send(); }
    prev = s;
  }

  const update = sequence.update.bind(sequence);
  sequence.update = (dt, c) => { update(dt, c); onStep(); };

  addEventListener('pagehide', () => { if (!run.end) { note('страницата е затворена'); send(true); } });
  addEventListener('keydown', e => {
    if ((e.key === 'r' || e.key === 'R') && !run.end) {
      run.end = 'рестарт (R)';
      note('рестарт (R)');
      send(true);
    }
  });

  window.__rec = { run, summary, send };
  return window.__rec;
}
