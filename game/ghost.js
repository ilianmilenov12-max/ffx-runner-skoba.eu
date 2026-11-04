// „Призракът" — прозрачна кола, която повтаря най-бързото ти измъкване.
// Няма го в оригинала. Пази се в браузъра (localStorage['ffx-ghost']) заедно
// с рекордите; всяко ново най-добро време го заменя.

import * as THREE from 'three';

const KEY = 'ffx-ghost';
const EVERY = 2;                 // проба на всеки две стъпки — 12.5 в секунда
const OPACITY = 0.38;

function load() {
  try {
    const g = JSON.parse(localStorage.getItem(KEY));
    return g && Array.isArray(g.samples) && g.samples.length >= 16 ? g : null;
  } catch { return null; }
}

export class Ghost {
  constructor(scene, model) {
    this.saved = load();
    this.samples = [];           // текущото бягане: t, x, y, z, qx, qy, qz, qw
    this.tick = 0;
    this.cursor = 0;
    this.enabled = true;

    // Моделът е същата кола, само прозрачна и синкава, и не пише в дълбочината,
    // за да не закрива нищо.
    model.traverse(c => {
      if (!c.isMesh) return;
      c.material = [].concat(c.material).map(m => {
        const g = m.clone();
        g.transparent = true;
        g.opacity = OPACITY;
        g.depthWrite = false;
        if (g.color) g.color.lerp(new THREE.Color(0x7fb8ff), 0.45);
        return g;
      });
      if (c.material.length === 1) c.material = c.material[0];
    });
    model.visible = false;
    scene.add(model);
    this.model = model;
    this._q1 = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
  }

  /** Всяка стъпка, докато тече хронометърът. */
  record(car, runTime) {
    if (this.tick++ % EVERY) return;
    const p = car.position, q = car.quaternion;
    this.samples.push(+runTime.toFixed(2), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2),
      +q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4));
  }

  /** При ново най-добро време текущото бягане става призрак. */
  keep(runTime) {
    const ghost = { time: +runTime.toFixed(2), samples: this.samples };
    try { localStorage.setItem(KEY, JSON.stringify(ghost)); } catch { /* няма място */ }
  }

  /** Всеки кадър: поставя призрака там, където е бил в този момент. */
  show(runTime, started) {
    const g = this.saved;
    const s = g && g.samples;
    if (!s || !started || !this.enabled || runTime > g.time) { this.model.visible = false; return; }

    const n = s.length / 8;
    let i = Math.min(this.cursor, n - 2);
    while (i > 0 && s[i * 8] > runTime) i--;
    while (i < n - 2 && s[(i + 1) * 8] <= runTime) i++;
    this.cursor = i;

    const a = i * 8, b = a + 8;
    const span = s[b] - s[a];
    const k = span > 0 ? THREE.MathUtils.clamp((runTime - s[a]) / span, 0, 1) : 0;
    this.model.position.set(
      s[a + 1] + (s[b + 1] - s[a + 1]) * k,
      s[a + 2] + (s[b + 2] - s[a + 2]) * k,
      s[a + 3] + (s[b + 3] - s[a + 3]) * k);
    this._q1.set(s[a + 4], s[a + 5], s[a + 6], s[a + 7]);
    this._q2.set(s[b + 4], s[b + 5], s[b + 6], s[b + 7]);
    this.model.quaternion.slerpQuaternions(this._q1, this._q2, k);
    this.model.visible = true;
  }
}
