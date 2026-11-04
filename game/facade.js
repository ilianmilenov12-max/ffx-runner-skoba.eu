// Истински ниши по фасадите — геометрия, не шейдър.
//
// Стената на сградата е плосък четириъгълник с нарисувани прозорци. Тук пред
// нея се вдига „кожа": същата стена, изнесена с DEPTH напред, с изрязани
// дупки там, където са прозорците. Оригиналната стена си остава на мястото и
// се вижда през дупките — прозорецът потъва навътре наистина. Между кожата и
// стената се затварят страниците на нишата, а по ръба на плоскостта —
// бордюр, за да не зее кожата отстрани.
//
// Отгоре на това: перваз под всеки прозорец и корниз по горния ръб.
//
// Къде са прозорците: tools/windows.py ги намира по текстурите и записва
// правоъгълниците в assets/masks/index.json. Стените са плоски, затова от
// върховете и UV-то се получава точното изображение „UV → свят", включително
// при повтаряща се текстура.

import * as THREE from 'three';

const DEPTH = 0.3;                                    // колко навътре е прозорецът
const SILL = { out: 0.16, high: 0.14, over: 0.12 };   // перваз пред кожата
const CORNICE = { out: 0.5, high: 0.42 };
const MIN_W = 0.8, MAX_W = 4.5;                       // обикновен прозорец (метра)
const MIN_H = 0.8, MAX_H = 5.0;

/** Какво минава за прозорец: обикновен, лентов (халетата) или тесен и висок
 *  (църквата). Всичко извън тези форми е петно по текстурата или цяла стена. */
function windowLike(w, h) {
  if (w >= MIN_W && w <= MAX_W && h >= MIN_H && h <= MAX_H) return true;
  if (w <= 20 && h >= 0.8 && h <= 3.2 && w / h >= 3) return true;
  if (w >= 0.35 && w <= 2 && h >= 0.8 && h <= 5 && h / w >= 2) return true;
  return false;
}
const ROW_TOL = 0.35;                                 // разминаване в един ред
const MAX_QUADS = 200000;

// Кинотеатърът е рисуван прекалено едро, за да го хване разпознаването:
// вратите му са изброени на ръка по текстурата (u0, v0, u1, v1). Горната
// половина на картината е страничните стени, долната — фасадата с табелата.
const HAND = {
  Cinema: [
    [0.035, 0.345, 0.115, 0.487], [0.245, 0.345, 0.325, 0.487],
    [0.455, 0.345, 0.535, 0.487], [0.660, 0.345, 0.740, 0.487],
    [0.865, 0.345, 0.945, 0.487],
    [0.030, 0.830, 0.130, 0.995], [0.860, 0.830, 0.960, 0.995],
  ],
  // Фахверковите къщи: гредите се сливат с прозорците и разпознаването се
  // обърква, затова и техните са изброени на ръка.
  CasaB: [
    [0.358, 0.200, 0.468, 0.278], [0.478, 0.200, 0.600, 0.278],
    [0.075, 0.383, 0.190, 0.477], [0.275, 0.383, 0.390, 0.477],
    [0.655, 0.383, 0.775, 0.477], [0.790, 0.383, 0.900, 0.477],
    [0.115, 0.573, 0.230, 0.667], [0.243, 0.573, 0.352, 0.667],
    [0.620, 0.573, 0.733, 0.667], [0.748, 0.573, 0.860, 0.667],
    [0.235, 0.820, 0.400, 0.995], [0.540, 0.828, 0.800, 0.892],
  ],
  CasaD: [
    [0.115, 0.020, 0.245, 0.200], [0.345, 0.020, 0.420, 0.200],
    [0.545, 0.020, 0.655, 0.200], [0.730, 0.020, 0.825, 0.200],
    [0.090, 0.440, 0.200, 0.730], [0.600, 0.440, 0.690, 0.730],
    [0.800, 0.440, 0.910, 0.730], [0.320, 0.440, 0.380, 0.880],
  ],
};

class Mesh3 {
  constructor() { this.pos = []; this.nor = []; this.uv = []; }

  /** Четириъгълник по четири върха; `flip` обръща лицето. */
  quad(a, b, c, d, uvAt, flip) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    const ring = flip ? [a, d, c, b] : [a, b, c, d];
    if (flip) n.negate();
    for (const tri of [[ring[0], ring[1], ring[2]], [ring[0], ring[2], ring[3]]]) {
      for (const v of tri) {
        this.pos.push(v.x, v.y, v.z);
        this.nor.push(n.x, n.y, n.z);
        const t = uvAt(v);
        this.uv.push(t.x, t.y);
      }
    }
  }

  /** Плътна кутия: център и три оси с дължини. */
  box(center, right, up, out, uvAt) {
    const c = (sx, sy, sz) => center.clone()
      .addScaledVector(right, sx / 2).addScaledVector(up, sy / 2).addScaledVector(out, sz / 2);
    const p = [c(-1, -1, -1), c(1, -1, -1), c(1, 1, -1), c(-1, 1, -1),
      c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)];
    this.quad(p[4], p[5], p[6], p[7], uvAt, false);
    this.quad(p[1], p[0], p[3], p[2], uvAt, false);
    this.quad(p[5], p[1], p[2], p[6], uvAt, false);
    this.quad(p[0], p[4], p[7], p[3], uvAt, false);
    this.quad(p[7], p[6], p[2], p[3], uvAt, false);
    this.quad(p[0], p[1], p[5], p[4], uvAt, false);
  }

  get quads() { return this.pos.length / 18; }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** Стените на модела: групи съседни триъгълници с общо UV изображение. */
function walls(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position, uv = geo.attributes.uv, index = geo.index;
  if (!uv) return [];
  mesh.updateMatrixWorld();
  const count = index ? index.count : pos.count;
  const at = i => (index ? index.getX(i) : i);
  geo.computeBoundingBox();
  const centre = geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  const groups = new Map();

  for (let t = 0; t < count; t += 3) {
    const ia = at(t), ib = at(t + 1), ic = at(t + 2);
    const pa = new THREE.Vector3().fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
    const pb = new THREE.Vector3().fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
    const pc = new THREE.Vector3().fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
    const e1 = new THREE.Vector3().subVectors(pb, pa), e2 = new THREE.Vector3().subVectors(pc, pa);
    const n = new THREE.Vector3().crossVectors(e1, e2);
    if (n.lengthSq() < 1e-9) continue;
    n.normalize();
    if (Math.abs(n.z) > 0.35) continue;               // само вертикални стени
    const ua = new THREE.Vector2(uv.getX(ia), uv.getY(ia));
    const ub = new THREE.Vector2(uv.getX(ib), uv.getY(ib));
    const uc = new THREE.Vector2(uv.getX(ic), uv.getY(ic));
    const d1 = new THREE.Vector2().subVectors(ub, ua), d2 = new THREE.Vector2().subVectors(uc, ua);
    const det = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(det) < 1e-9) continue;
    const dPdu = e1.clone().multiplyScalar(d2.y / det).add(e2.clone().multiplyScalar(-d1.y / det));
    const dPdv = e1.clone().multiplyScalar(-d2.x / det).add(e2.clone().multiplyScalar(d1.x / det));
    // Навън е накъдето гледа лицето на триъгълника: стените са едностранни,
    // а средата на модела лъже при дълги редове (кожата на едно хале
    // излизаше пред съседното). Но ако лицето сочи навътре в модела, това е
    // вътрешна стена: оригиналът я крие (едностранна е), а первазите по нея
    // са плътни кутии и увисват на показ през отворената страна.
    const outward = n;
    if (n.dot(new THREE.Vector3().subVectors(pa, centre)) < -0.01) continue;
    // В ключа влиза и къде в света е точката UV (0,0): иначе две стени в една
    // равнина се сливат в една плоскост и кожата се разпъва през празното
    // между тях.
    const zero = pa.clone().addScaledVector(dPdu, -ua.x).addScaledVector(dPdv, -ua.y);
    const key = [n.x.toFixed(3), n.y.toFixed(3), n.z.toFixed(3), pa.dot(n).toFixed(2),
      dPdu.x.toFixed(2), dPdu.y.toFixed(2), dPdu.z.toFixed(2),
      dPdv.x.toFixed(2), dPdv.y.toFixed(2), dPdv.z.toFixed(2),
      zero.x.toFixed(1), zero.y.toFixed(1), zero.z.toFixed(1)].join(',');
    let g = groups.get(key);
    if (!g) {
      g = { origin: pa, uvOrigin: ua, dPdu, dPdv, outward, area: 0, error: 0,
        uMin: Infinity, uMax: -Infinity, vMin: Infinity, vMax: -Infinity, mesh };
      groups.set(key, g);
    }
    g.area += new THREE.Vector3().crossVectors(e1, e2).length() / 2;
    // Изображението „UV → свят" се взима от първия триъгълник. Ако по стената
    // UV-то не е равномерно (трапец вместо успоредник), за останалите върхове
    // то се разминава — тогава кожата се разлита като ветрило във въздуха.
    for (const [p, q] of [[pa, ua], [pb, ub], [pc, uc]]) {
      const guess = g.origin.clone()
        .addScaledVector(g.dPdu, q.x - g.uvOrigin.x)
        .addScaledVector(g.dPdv, q.y - g.uvOrigin.y);
      g.error = Math.max(g.error, guess.distanceTo(p));
    }
    for (const [, q] of [[pa, ua], [pb, ub], [pc, uc]]) {
      g.uMin = Math.min(g.uMin, q.x); g.uMax = Math.max(g.uMax, q.x);
      g.vMin = Math.min(g.vMin, q.y); g.vMax = Math.max(g.vMax, q.y);
    }
  }
  return [...groups.values()];
}

/** Прозорците на една стена, подредени в редове (в UV координати). */
function rows(face, rects, uLen, vLen) {
  const found = [];
  for (let tu = Math.floor(face.uMin); tu <= Math.ceil(face.uMax); tu++) {
    for (let tv = Math.floor(face.vMin); tv <= Math.ceil(face.vMax); tv++) {
      for (const [x0, y0, x1, y1] of rects) {
        const u0 = x0 + tu, u1 = x1 + tu, v0 = y0 + tv, v1 = y1 + tv;
        if (u0 < face.uMin + 0.002 || u1 > face.uMax - 0.002) continue;
        if (v0 < face.vMin + 0.002 || v1 > face.vMax - 0.002) continue;
        const w = (u1 - u0) * uLen, h = (v1 - v0) * vLen;
        if (!windowLike(w, h)) continue;
        found.push({ u0, u1, v0, v1 });
      }
    }
  }
  found.sort((a, b) => a.v0 - b.v0 || a.u0 - b.u0);
  const out = [];
  for (const win of found) {
    const tol = (win.v1 - win.v0) * ROW_TOL;
    const row = out.find(r => Math.abs(r.v0 - win.v0) < tol && Math.abs(r.v1 - win.v1) < tol);
    if (row) {
      row.v0 = Math.min(row.v0, win.v0);
      row.v1 = Math.max(row.v1, win.v1);
      row.windows.push(win);
    } else {
      out.push({ v0: win.v0, v1: win.v1, windows: [win] });
    }
  }
  for (const row of out) {
    row.windows.sort((a, b) => a.u0 - b.u0);
    // Припокриващи се (от съседни плочки) се изхвърлят.
    row.windows = row.windows.filter((w, i) => i === 0 || w.u0 > row.windows[i - 1].u1 + 0.001);
  }
  // Редовете също не бива да се застъпват.
  const sorted = out.sort((a, b) => a.v0 - b.v0);
  return sorted.filter((r, i) => i === 0 || r.v0 > sorted[i - 1].v1 + 0.001);
}

/**
 * Ниши, первази и корнизи по фасадите. `windows` е assets/masks/index.json.
 * В `covered` са текстурите, по които вече има истинска геометрия — по тях
 * шейдърът за ниши (relief.js) не бива да се пуска втори път.
 */
export function buildFacadeDetails(world, windows) {
  const skins = new Map();       // текстура → материал на кожата
  const trims = new Map();       // текстура → материал на первазите
  const builders = new Map();
  const meshes = [];
  const covered = new Set();
  let quads = 0;
  // Без това матриците на зоните още са единични и стените излизат десет
  // пъти по-малки — всички прозорци падат под най-малкия допустим размер.
  world.root.updateMatrixWorld(true);

  world.zones.forEach((zone, zi) => {
    const list = [];
    zone.traverse(o => { if (o.isMesh && !o.userData.generated && !o.userData.unlit) list.push(o); });

    for (const mesh of list) {
      const material = [].concat(mesh.material)[0];
      const name = material?.map?.name;
      const rects = HAND[name] || (name && windows[name] ? windows[name].rects : null);
      if (!rects || !rects.length) continue;
      if (!skins.has(name)) {
        skins.set(name, new THREE.MeshStandardMaterial({
          map: material.map,
          normalMap: material.normalMap || null,
          roughness: material.roughness,
          metalness: material.metalness,
          envMapIntensity: material.envMapIntensity,
        }));
        const wall = windows[name]?.wall || [190, 185, 175];
        const color = new THREE.Color().setRGB(wall[0] / 255, wall[1] / 255, wall[2] / 255, THREE.SRGBColorSpace);
        trims.set(name, new THREE.MeshStandardMaterial({
          color: color.multiplyScalar(1.06), roughness: 0.85, metalness: 0,
          envMapIntensity: material.envMapIntensity ?? 0.3,
        }));
      }
      const key = `${zi}|${name}`;
      if (!builders.has(key)) builders.set(key, { zone, zi, name, skin: new Mesh3(), trim: new Mesh3() });
      const { skin, trim } = builders.get(key);

      for (const face of walls(mesh)) {
        const { origin, uvOrigin, dPdu, dPdv, outward } = face;
        const uLen = dPdu.length(), vLen = dPdv.length();
        const at = (u, v, depth = 0) => origin.clone()
          .addScaledVector(dPdu, u - uvOrigin.x)
          .addScaledVector(dPdv, v - uvOrigin.y)
          .addScaledVector(outward, depth);
        const uvAt = p => {
          const d = new THREE.Vector3().subVectors(p, origin);
          return new THREE.Vector2(
            uvOrigin.x + dPdu.dot(d) / (uLen * uLen),
            uvOrigin.y + dPdv.dot(d) / (vLen * vLen));
        };
        // Лицето да сочи навън: обхождаме обратно само ако UV-то е огледално
        // (иначе кожата гледа навътре в сградата и се вижда само отзад).
        const flip = new THREE.Vector3().crossVectors(dPdu, dPdv).dot(outward) < 0;
        const panel = (u0, v0, u1, v1, depth) => {
          if (u1 - u0 < 1e-5 || v1 - v0 < 1e-5) return;
          skin.quad(at(u0, v0, depth), at(u1, v0, depth), at(u1, v1, depth), at(u0, v1, depth), uvAt, flip);
          quads++;
        };

        // Кожа се вдига само върху правоъгълни стени: фронтоните и комините
        // не запълват правоъгълника си в UV и кожата им стърчи в небето.
        const box = (face.uMax - face.uMin) * uLen * (face.vMax - face.vMin) * vLen;
        const rectangular = box > 0 && Math.abs(face.area - box) / box < 0.06 && face.error < 0.25;
        const lines = quads > MAX_QUADS || !rectangular ? [] : rows(face, rects, uLen, vLen);
        if (lines.length) {
          covered.add(name);
          let v = face.vMin;
          for (const row of lines) {
            panel(face.uMin, v, face.uMax, row.v0, DEPTH);      // ивица над реда
            let u = face.uMin;
            for (const win of row.windows) {
              panel(u, row.v0, win.u0, row.v1, DEPTH);          // стена вляво
              u = win.u1;
              // Страниците на нишата: от кожата назад до стената.
              for (const [[a0, b0], [a1, b1]] of [
                [[win.u0, row.v0], [win.u1, row.v0]],
                [[win.u1, row.v1], [win.u0, row.v1]],
                [[win.u0, row.v1], [win.u0, row.v0]],
                [[win.u1, row.v0], [win.u1, row.v1]],
              ]) {
                skin.quad(at(a0, b0, DEPTH), at(a1, b1, DEPTH), at(a1, b1, 0), at(a0, b0, 0), uvAt, flip);
                quads++;
              }
              // Перваз под прозореца, пред кожата.
              const low = at((win.u0 + win.u1) / 2, row.v1, DEPTH);
              const high = at((win.u0 + win.u1) / 2, row.v0, DEPTH);
              const down = new THREE.Vector3().subVectors(low, high).normalize();
              trim.box(
                low.clone().addScaledVector(outward, SILL.out / 2).addScaledVector(down, SILL.high / 2),
                dPdu.clone().normalize().multiplyScalar((win.u1 - win.u0) * uLen + SILL.over * 2),
                down.clone().multiplyScalar(SILL.high),
                outward.clone().multiplyScalar(SILL.out), uvAt);
              quads += 6;
            }
            panel(u, row.v0, face.uMax, row.v1, DEPTH);         // стена вдясно
            v = row.v1;
          }
          panel(face.uMin, v, face.uMax, face.vMax, DEPTH);     // ивица под последния ред
          // Бордюр по ръба: кожата не бива да зее отстрани.
          for (const [[a0, b0], [a1, b1]] of [
            [[face.uMin, face.vMin], [face.uMax, face.vMin]],
            [[face.uMax, face.vMax], [face.uMin, face.vMax]],
            [[face.uMin, face.vMax], [face.uMin, face.vMin]],
            [[face.uMax, face.vMin], [face.uMax, face.vMax]],
          ]) {
            skin.quad(at(a0, b0, 0), at(a1, b1, 0), at(a1, b1, DEPTH), at(a0, b0, DEPTH), uvAt, flip);
            quads++;
          }
        }

        // Корниз по горния ръб — само ако стената свършва най-горе в модела.
        const bounds = new THREE.Box3().setFromObject(mesh);
        const topV = at(face.uMin, face.vMin).z >= at(face.uMin, face.vMax).z ? face.vMin : face.vMax;
        const a = at(face.uMin, topV, DEPTH), b = at(face.uMax, topV, DEPTH);
        const width = a.distanceTo(b);
        if (rectangular && width > 1.5 && Math.abs(a.z - bounds.max.z) < 0.4 && quads < MAX_QUADS) {
          const up = new THREE.Vector3(0, 0, 1);
          trim.box(
            a.clone().add(b).multiplyScalar(0.5)
              .addScaledVector(outward, CORNICE.out / 2).addScaledVector(up, -CORNICE.high / 2),
            new THREE.Vector3().subVectors(b, a).normalize().multiplyScalar(width),
            up.clone().multiplyScalar(CORNICE.high),
            outward.clone().multiplyScalar(CORNICE.out), uvAt);
          quads += 6;
        }
      }
    }
  });

  for (const { zone, zi, name, skin, trim } of builders.values()) {
    zone.updateMatrixWorld(true);
    const inverse = zone.matrixWorld.clone().invert();
    for (const [part, material, kind] of [[skin, skins.get(name), 'skin'], [trim, trims.get(name), 'trim']]) {
      if (!part.pos.length) continue;
      const mesh = new THREE.Mesh(part.geometry(), material);
      mesh.name = `Facade_${kind}_${zi + 1}_${name}`;
      mesh.applyMatrix4(inverse);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.generated = true;
      zone.add(mesh);
      meshes.push(mesh);
    }
  }

  return {
    meshes,
    quads,
    covered,
    setVisible(on) { for (const m of meshes) m.visible = on; },
  };
}

// Само за проверка от конзолата (tools/lookdev.js).
export const _internals = { walls, rows };
