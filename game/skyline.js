// Кулите на мястото на картонените силуети.
//
// Оригиналът показва на края на всяка зона плоска картинка с небостъргачи
// (SkyLine*): тя скрива кварталите, които в момента не са заредени. Отблизо
// е черен картон. Тук всеки силует става редица истински сгради — височините
// са взети от самата картинка, колона по колона, а кулите стоят зад нея,
// откъдето камерата никога не минава. Прозорците им светят нощем.

import * as THREE from 'three';

const COLUMNS = 96;             // колони от силуета
const FLOOR = 3.6;              // фута на етаж
const BAY = 3.2;                // фута между два прозореца
const N = 8;                    // прозорци и етажи в една плочка на текстурата
const TILE_W = N * BAY, TILE_H = N * FLOOR;
const MIN_DEPTH = 6, MAX_DEPTH = 46;
const ROAD_CLEAR = 14;          // толкова фута от пътя остават свободни
const SINK = 16;                // кулите слизат под земята, за да не висят
const HAZE = 14;                // толкова фута над земята се губят в маранята

// Нощем светят толкова от прозорците; при залез и в дъжд — по-малко.
const GLOW = { day: 0, sunset: 0.45, night: 1.7, rainDay: 0.3 };

const OFFICE_TINTS = [0xffffff, 0xeee2cf, 0xdcc6ab, 0xcfd5dc, 0xc4baab, 0xe6d3c3, 0xbba893, 0xd7d7d0];
const GLASS_TINTS = [0xffffff, 0xd2e2ec, 0xdadbe6, 0xc3d2c8, 0xe6e0d8];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Плочка 8×8 прозореца: стената, прозорците и кои от тях светят нощем. */
function facade(kind) {
  const S = 512, cell = S / N;
  const base = canvas(S), lit = canvas(S);
  const g = base.getContext('2d'), e = lit.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  const rnd = rng(kind === 'glass' ? 11 : 7);
  const light = () => (rnd() < 0.7 ? '#ffcf8a' : rnd() < 0.5 ? '#fff0d0' : '#cfe2ff');

  if (kind === 'office') {
    g.fillStyle = '#d9d6cf';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {          // петна и неравности по мазилката
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.05})`;
      g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 10, 2 + rnd() * 10);
    }
    for (let fy = 0; fy < N; fy++) {
      g.fillStyle = 'rgba(0,0,0,0.10)';       // корниз между етажите
      g.fillRect(0, fy * cell + cell - 7, S, 4);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(0, fy * cell + cell - 3, S, 2);
      for (let fx = 0; fx < N; fx++) {
        const x = fx * cell + cell * 0.2, y = fy * cell + cell * 0.2;
        const w = cell * 0.6, h = cell * 0.56;
        g.fillStyle = '#8f8d88';
        g.fillRect(x - 3, y - 3, w + 6, h + 6);
        const grad = g.createLinearGradient(x, y, x + w * 0.4, y + h);
        grad.addColorStop(0, '#6f8193');
        grad.addColorStop(0.45, '#2b3845');
        grad.addColorStop(1, '#1a232c');
        g.fillStyle = grad;
        g.fillRect(x, y, w, h);
        g.fillStyle = '#8f8d88';
        g.fillRect(x + w / 2 - 1.5, y, 3, h);
        g.fillRect(x, y + h * 0.35, w, 2);
        if (rnd() < 0.3) {
          e.fillStyle = light();
          e.fillRect(x, y, w, h);
          e.fillStyle = 'rgba(0,0,0,0.35)';     // пердета и сенки в стаята
          e.fillRect(x + rnd() * w * 0.6, y, w * 0.25, h);
        }
      }
    }
  } else {
    g.fillStyle = '#2e3d4b';
    g.fillRect(0, 0, S, S);
    for (let fy = 0; fy < N; fy++) {
      for (let fx = 0; fx < N; fx++) {
        const x = fx * cell, y = fy * cell;
        const grad = g.createLinearGradient(x, y, x, y + cell);
        const k = 0.85 + rnd() * 0.3;
        grad.addColorStop(0, `rgb(${110 * k | 0},${135 * k | 0},${158 * k | 0})`);
        grad.addColorStop(0.7, `rgb(${46 * k | 0},${62 * k | 0},${78 * k | 0})`);
        grad.addColorStop(1, `rgb(${34 * k | 0},${46 * k | 0},${58 * k | 0})`);
        g.fillStyle = grad;
        g.fillRect(x + 2, y + 2, cell - 4, cell * 0.78);
        if (rnd() < 0.26) {
          e.fillStyle = light();
          e.fillRect(x + 2, y + 2, cell - 4, cell * 0.78);
        }
      }
      g.fillStyle = '#56616b';                  // плоча между етажите
      g.fillRect(0, fy * cell + cell * 0.8, S, cell * 0.2);
    }
    g.fillStyle = 'rgba(200,210,220,0.5)';      // вертикалните профили
    for (let fx = 0; fx <= N; fx++) g.fillRect(fx * cell - 1, 0, 2, S);
  }

  const tex = [base, lit].map(c => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
  // Покривът взима едно петно от стената (или плочата при стъклото).
  const roof = kind === 'office' ? [0.02, 0.02] : [0.53, 1 - 0.9 / N];
  return { map: tex[0], lit: tex[1], roof };
}

/** Височините на силуета: за всяка колона — най-горният непрозрачен пиксел. */
function silhouette(image) {
  const w = 256, h = 256;
  const c = canvas(w);
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;
  const cols = [];
  for (let i = 0; i < COLUMNS; i++) {
    const x = Math.min(w - 1, Math.round((i + 0.5) * w / COLUMNS));
    let top = h;
    for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] >= 128) { top = y; break; }
    cols.push(top / h);          // v на върха: 0 горе, 1 долу
  }
  return cols;
}

/** Колоните в сгради: съседни колони с близка височина са една сграда. */
function segments(heights, width, rnd) {
  const out = [];
  let start = 0;
  const colW = width / heights.length;
  for (let i = 1; i <= heights.length; i++) {
    const run = heights.slice(start, i);
    const h0 = run[0];
    const tooWide = (i - start) * colW > 40 + rnd() * 25;
    const jump = i < heights.length && Math.abs(heights[i] - h0) > Math.max(3, h0 * 0.1);
    if (i === heights.length || jump || tooWide) {
      const max = Math.max(...run), mean = run.reduce((a, b) => a + b, 0) / run.length;
      out.push({ s0: start * colW, s1: i * colW, h: max * 0.7 + mean * 0.3 });
      start = i;
    }
  }
  // Съвсем тесните (под 4 фута) се сливат със съседа.
  for (let i = out.length - 1; i > 0; i--) {
    if (out[i].s1 - out[i].s0 < 4) {
      out[i - 1].s1 = out[i].s1;
      out[i - 1].h = Math.max(out[i - 1].h, out[i].h * 0.9);
      out.splice(i, 1);
    }
  }
  return out;
}

class Builder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.base = []; this.idx = []; }

  quad(a, b, c, d, n, uvs, color, base) {
    const i = this.pos.length / 3;
    for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(t[0], t[1]);
      this.col.push(color.r, color.g, color.b);
      this.base.push(base);
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** Кутия: основата е четириъгълникът p0..p3 (обратно на часовника). */
  box(base, z0, z1, uOff, vOff, roof, color, ground) {
    const up = new THREE.Vector3(0, 0, 1);
    for (let k = 0; k < 4; k++) {
      const a = base[k], b = base[(k + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = new THREE.Vector3(b.y - a.y, -(b.x - a.x), 0).normalize();
      const u0 = uOff, u1 = uOff + len / TILE_W;
      const v0 = vOff, v1 = vOff + (z1 - z0) / TILE_H;
      this.quad(
        new THREE.Vector3(a.x, a.y, z0), new THREE.Vector3(b.x, b.y, z0),
        new THREE.Vector3(b.x, b.y, z1), new THREE.Vector3(a.x, a.y, z1),
        n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], color, ground);
    }
    const r = [roof, roof, roof, roof];
    this.quad(...base.map(p => new THREE.Vector3(p.x, p.y, z1)), up, r, color.clone().multiplyScalar(0.8), ground);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('ground', new THREE.Float32BufferAttribute(this.base, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Пътят на гъсто — на всеки 5 фута, за да се пази и между точките. */
function densify(route) {
  const out = [];
  for (let i = 1; i < route.length; i++) {
    const [x0, y0] = route[i - 1], [x1, y1] = route[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5));
    for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
}

export function buildSkyline(world, route) {
  const kinds = { office: facade('office'), glass: facade('glass') };
  const materials = {
    office: new THREE.MeshStandardMaterial({
      map: kinds.office.map, emissiveMap: kinds.office.lit, emissive: 0xffffff, emissiveIntensity: 0,
      vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.4,
    }),
    glass: new THREE.MeshStandardMaterial({
      map: kinds.glass.map, emissiveMap: kinds.glass.lit, emissive: 0xffffff, emissiveIntensity: 0,
      vertexColors: true, roughness: 0.25, metalness: 0.45, envMapIntensity: 1.0,
    }),
  };
  // Долу кулите се губят в маранята — както картинката, която заместват:
  // оттам нататък няма град, а основите иначе висят във въздуха.
  for (const m of Object.values(materials)) {
    m.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float ground;\nvarying float vAboveGround;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvAboveGround = (modelMatrix * vec4(transformed, 1.0)).z - ground;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAboveGround;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
          #ifdef USE_FOG
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, (1.0 - smoothstep(-6.0, ${HAZE.toFixed(1)}, vAboveGround)) * 0.9);
          #endif`);
    };
  }
  const road = densify(route || []);
  const meshes = [];
  const kept = [];
  const raycaster = new THREE.Raycaster();

  world.zones.forEach((zone, zi) => {
    const planes = [];
    zone.traverse(o => {
      if (o.isMesh && /^skyline/i.test(o.name) && !/country/i.test(o.name)) planes.push(o);
    });
    if (!planes.length) return;

    // Зоните, които се виждат заедно с тази: в тях кулите не бива да влизат.
    const together = new Set();
    world.zoneVisible.forEach(vis => {
      if (vis[zi]) vis.forEach((on, k) => { if (on) together.add(k); });
    });
    const solid = [];
    together.forEach(k => world.zones[k].traverse(o => {
      if (o.isMesh && !o.userData.unlit && o.visible && !/^skyline|^\?/i.test(o.name)) solid.push(o);
    }));

    const builders = { office: new Builder(), glass: new Builder() };
    for (const plane of planes) {
      const built = buildPlane(plane, zi, solid, road, raycaster, builders, kinds);
      if (built) plane.visible = false;
      else kept.push(plane.name);
    }
    zone.updateMatrixWorld(true);
    const inverse = zone.matrixWorld.clone().invert();
    for (const [kind, b] of Object.entries(builders)) {
      if (!b.idx.length) continue;
      const mesh = new THREE.Mesh(b.geometry(), materials[kind]);
      mesh.name = `SkylineTowers_${zi + 1}_${kind}`;
      mesh.applyMatrix4(inverse);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.generated = true;
      zone.add(mesh);
      meshes.push(mesh);
    }
  });

  return {
    meshes,
    kept,
    /** Светещите прозорци според времето на деня. */
    setTime(time, weather) {
      const k = time === 'night' ? GLOW.night : time === 'sunset' ? GLOW.sunset
        : weather === 'rain' ? GLOW.rainDay : GLOW.day;
      for (const m of Object.values(materials)) m.emissiveIntensity = k;
    },
  };
}

function buildPlane(plane, zi, solid, road, raycaster, builders, kinds) {
  const pos = plane.geometry.attributes.position, uv = plane.geometry.attributes.uv;
  if (pos.count !== 4 || !plane.material.map) return false;
  plane.updateMatrixWorld();
  const vs = [...Array(4)].map((_, i) => ({
    p: new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(plane.matrixWorld),
    u: uv.getX(i), v: uv.getY(i),
  }));
  const bottom = vs.filter(q => q.v > 0.5), top = vs.filter(q => q.v <= 0.5);
  if (bottom.length !== 2 || top.length !== 2) return false;
  const a = bottom.find(q => q.u < 0.5).p, b = bottom.find(q => q.u >= 0.5).p;
  const zb = Math.min(a.z, b.z), zt = Math.max(...top.map(q => q.p.z));
  const vTop = Math.min(...top.map(q => q.v));
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, 0);
  const width = dir.length();
  dir.normalize();

  // Отзад е страната без път (пътят е отпред — оттам се гледа силуетът).
  let side = 0;
  const nrm = new THREE.Vector3(-dir.y, dir.x, 0);
  for (const [x, y] of road) {
    const s = (x - a.x) * dir.x + (y - a.y) * dir.y;
    if (s < -40 || s > width + 40) continue;
    const d = (x - a.x) * nrm.x + (y - a.y) * nrm.y;
    if (Math.abs(d) < 400) side += Math.sign(d) / Math.max(20, Math.abs(d));
  }
  const back = side > 0 ? nrm.clone().negate() : nrm.clone();

  // Какво има зад силуета в съседните зони — само близките предмети.
  const probe = new THREE.Box3().setFromPoints([
    a, b, a.clone().addScaledVector(back, MAX_DEPTH + 10), b.clone().addScaledVector(back, MAX_DEPTH + 10),
  ]).expandByScalar(4);
  probe.min.z = zb - 5; probe.max.z = zt + 5;
  const near = solid.filter(o => {
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    return new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).intersectsBox(probe);
  });
  const free = (s, z) => {
    if (!near.length) return MAX_DEPTH;
    const o = a.clone().addScaledVector(dir, s);
    o.z = z;
    raycaster.set(o.addScaledVector(back, -0.5), back);
    raycaster.far = MAX_DEPTH + 2;
    const hit = raycaster.intersectObjects(near, false)[0];
    return hit ? hit.distance - 3 : MAX_DEPTH;
  };

  const rnd = rng(zi * 131 + Math.round(a.x * 7 + a.y * 13));
  const cols = silhouette(plane.material.map.image);
  // v → височина: v = vTop е горният край, v = 1 — долният.
  const heights = cols.map(v => zb + (zt - zb) * (1 - (Math.max(v, vTop) - vTop) / (1 - vTop)) - zb);
  const segs = segments(heights, width, rnd);
  let placed = 0;

  for (const seg of segs) {
    const w = seg.s1 - seg.s0;
    if (seg.h < 3) continue;
    const inset = rnd() * 3.5;                            // лицата не са в една равнина
    let depth = THREE.MathUtils.clamp(w * (0.7 + rnd() * 0.6), 12, MAX_DEPTH);
    for (const s of [seg.s0 + 1, (seg.s0 + seg.s1) / 2, seg.s1 - 1]) {
      for (const z of [zb + 3, zb + seg.h * 0.6]) depth = Math.min(depth, free(s, z) - inset);
    }
    // Път зад силуета (покрай краищата му): кулата спира на ROAD_CLEAR от него.
    // Пътят отпред не пречи — там и досега беше картинката.
    for (const [x, y] of road) {
      const s = (x - a.x) * dir.x + (y - a.y) * dir.y;
      if (s < seg.s0 - ROAD_CLEAR || s > seg.s1 + ROAD_CLEAR) continue;
      const d = (x - a.x) * back.x + (y - a.y) * back.y;
      if (d > 0) depth = Math.min(depth, d - ROAD_CLEAR - inset);
    }
    if (depth < MIN_DEPTH) continue;
    placed += w;

    const glass = seg.h > 34 && rnd() < 0.55;
    const kind = glass ? 'glass' : 'office';
    const tint = new THREE.Color((glass ? GLASS_TINTS : OFFICE_TINTS)[Math.floor(rnd() * (glass ? GLASS_TINTS : OFFICE_TINTS).length)]);
    const corner = (s, d) => a.clone().addScaledVector(dir, s).addScaledVector(back, d);
    // Обратно на часовника, гледано отгоре: зависи накъде е „отзад".
    const ccw = dir.x * back.y - dir.y * back.x > 0;
    const f0 = corner(seg.s0, inset), f1 = corner(seg.s1, inset);
    const r1 = corner(seg.s1, inset + depth), r0 = corner(seg.s0, inset + depth);
    const base = ccw ? [f0, f1, r1, r0] : [f1, f0, r0, r1];
    const uOff = Math.floor(rnd() * N) / N, vOff = Math.floor(rnd() * N) / N;
    const z1 = zb + seg.h;
    builders[kind].box(base, zb - SINK, z1, uOff, vOff - SINK / TILE_H, kinds[kind].roof, tint, zb);

    // Високите получават по-тясна корона — покривите не са плоски кутии.
    if (seg.h > 30 && w > 14 && depth > 14 && rnd() < 0.6) {
      const m = Math.min(w, depth) * (0.15 + rnd() * 0.1);
      const c0 = corner(seg.s0 + m, inset + m), c1 = corner(seg.s1 - m, inset + m);
      const c2 = corner(seg.s1 - m, inset + depth - m), c3 = corner(seg.s0 + m, inset + depth - m);
      const cb = ccw ? [c0, c1, c2, c3] : [c1, c0, c3, c2];
      builders[kind].box(cb, z1, z1 + FLOOR * (1 + Math.floor(rnd() * 3)), uOff, vOff, kinds[kind].roof, tint, zb);
    }
  }
  // Ако повечето от силуета не може да стане сгради, остава картинката.
  return placed / width > 0.7;
}
