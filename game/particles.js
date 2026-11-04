// Частиците — трите ефекта на оригинала с техните числа.
//
// Взривът е от "ParentScript 8 - BoomParticle", пръските от
// "BehaviorScript 27 - Aqua", искрата при бонус от "BehaviorScript 26 - Bonus".
// Director има собствен #particle ресурс; тук същите параметри карат един
// общ буфер от точки.

import * as THREE from 'three';

// lifeTime е в милисекунди в оригинала — тук в секунди.
export const PRESETS = {
  boom: {                      // взривът при унищожена кола
    life: 5, count: 50,
    colorStart: [1, 1, 0.5], colorEnd: [1, 0.125, 0.125],
    sizeStart: 0, sizeEnd: 10,
    blendStart: 0.5, blendEnd: 0,
    angle: 60, speed: [1, 4], drag: 1, gravity: -0.1,
  },
  aqua: {                      // пръски, докато колата газù вода
    life: 1, count: 6,
    colorStart: [1, 1, 1], colorEnd: [0.5, 0.5, 1],
    sizeStart: 0, sizeEnd: 2,
    blendStart: 1, blendEnd: 0,
    angle: 45, speed: [8, 16], drag: 10, gravity: 0,
  },
  nitro: {                     // пламъкът зад колата при нитро (не е от оригинала)
    life: 0.35, count: 3,
    colorStart: [0.55, 0.75, 1], colorEnd: [1, 0.45, 0.1],
    sizeStart: 1.3, sizeEnd: 0,
    blendStart: 1, blendEnd: 0,
    angle: 40, speed: [1, 3], drag: 3, gravity: 0,
  },
  // --- добавки, не са от оригинала ---
  sparks: {                    // искри при удар
    life: 0.5, count: 26,
    colorStart: [1, 0.92, 0.55], colorEnd: [1, 0.35, 0.05],
    sizeStart: 0.4, sizeEnd: 0.05,
    blendStart: 1, blendEnd: 0,
    angle: 130, speed: [6, 16], drag: 1, gravity: -30,
  },
  tyre: {                      // дим от гумите (в слоя с нормално смесване)
    life: 1.3, count: 1,
    colorStart: [0.78, 0.78, 0.8], colorEnd: [0.6, 0.6, 0.62],
    sizeStart: 0.7, sizeEnd: 4,
    blendStart: 0.4, blendEnd: 0,
    angle: 70, speed: [0.5, 1.8], drag: 1.5, gravity: 0.6,
  },
  engine: {                    // пушек от ударения двигател
    life: 1.8, count: 1,
    colorStart: [0.28, 0.28, 0.28], colorEnd: [0.12, 0.12, 0.12],
    sizeStart: 0.6, sizeEnd: 3.2,
    blendStart: 0.55, blendEnd: 0,
    angle: 25, speed: [1.5, 3], drag: 0.8, gravity: 1,
  },
  bonus: {                     // искрата при вдигнат бонус
    life: 2, count: 100,
    colorStart: [1, 1, 0.5], colorEnd: [0.5, 0.5, 0.125],
    sizeStart: 1.5, sizeEnd: 0.5,
    blendStart: 1, blendEnd: 0,
    angle: 180, speed: [1, 3], drag: 2, gravity: 0,
  },
};

// Атрибутите се обявяват изрично: ShaderMaterial подава сам само position,
// normal и uv, а на `color` разчитаме само ако е вдигнат USE_COLOR.
const VERTEX = `
  attribute vec3 pcolor;
  attribute float size;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = pcolor;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * 180.0 / max(-mv.z, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha * (1.0 - r * 4.0));
  }`;

const MAX = 900;

export class Particles {
  // Взривът и искрите светят (събират се с фона); димът трябва да скрива,
  // затова за него има втори слой с нормално смесване.
  constructor(scene, blending = THREE.AdditiveBlending) {
    this.items = [];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geometry.setAttribute('pcolor', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    this.geometry = geometry;

    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthWrite: false,
      blending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Изстрелва наведнъж — emitter.mode = #burst в оригинала. */
  burst(name, position, count) {
    const p = PRESETS[name];
    const n = Math.min(count ?? p.count, MAX - this.items.length);
    const spread = p.angle * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      // Конус около нагоре, с полуъгъл `angle` — emitter.direction/angle.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * spread / 2;
      const speed = p.speed[0] + Math.random() * (p.speed[1] - p.speed[0]);
      this.items.push({
        preset: p, age: 0,
        pos: position.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi)).multiplyScalar(speed),
      });
    }
  }

  update(dt) {
    const pos = this.geometry.attributes.position.array;
    const col = this.geometry.attributes.pcolor.array;
    const siz = this.geometry.attributes.size.array;
    const alp = this.geometry.attributes.alpha.array;

    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const p = it.preset;
      it.age += dt;
      if (it.age >= p.life) { this.items.splice(i, 1); continue; }

      // tweenMode = #age: всичко се мени линейно с възрастта.
      const t = it.age / p.life;
      it.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      it.vel.z += p.gravity * dt;
      it.pos.addScaledVector(it.vel, dt);

      pos[n * 3] = it.pos.x; pos[n * 3 + 1] = it.pos.y; pos[n * 3 + 2] = it.pos.z;
      for (let c = 0; c < 3; c++) {
        col[n * 3 + c] = p.colorStart[c] + (p.colorEnd[c] - p.colorStart[c]) * t;
      }
      siz[n] = p.sizeStart + (p.sizeEnd - p.sizeStart) * t;
      alp[n] = p.blendStart + (p.blendEnd - p.blendStart) * t;
      n++;
    }

    this.geometry.setDrawRange(0, n);
    for (const a of ['position', 'pcolor', 'size', 'alpha']) {
      this.geometry.attributes[a].needsUpdate = true;
    }
  }
}
