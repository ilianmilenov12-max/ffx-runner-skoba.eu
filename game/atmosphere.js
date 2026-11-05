// Атмосферата: слънце и сенки, небе с облаци, звезди, време на деня и дъжд.
//
// Сенките са от едно слънце, но картата им покрива само квадрат около
// колата и го следва — така са остри, а струват колкото за малък град.

import * as THREE from 'three';
import { Sky } from './vendor-sky.js?v=168';
import { Dome } from './dome.js?v=168';

const SHADOW_SPAN = 240;          // фута от колата във всяка посока
const SHADOW_MAP = 4096;
const SKY_SIZE = 900;             // под далечната равнина на камерата (1000)

// Времената на деня. Азимутът е от изток обратно на часовника (Y е север).
// `dome` е небето с преливане (dome.js): от него са отраженията винаги, а
// видимото небе — навсякъде освен в ясен ден (там е физическото, `preetham`).
// Сиянието (bloom) хваща само светлините: прагът му е над осветените фасади.
export const TIMES = {
  day: {
    label: 'ден', sunElevation: 52, sunAzimuth: 220,
    sun: 0xfff1dc, sunIntensity: 3.0,
    sky: 0xcfe3ff, ground: 0x6a5d4e, hemi: 1.1,
    fog: 0xb9cadb, fogNear: 200, fogFar: 700,
    exposure: 0.95, bloom: 0.12,
    preetham: { turbidity: 5, rayleigh: 1.2, mie: 0.004, mieG: 0.8, clouds: 0.35, brightness: 0.35 },
    dome: { zenith: 0x4f86d0, horizon: 0xc4d7ea, ground: 0x6b645a, glow: 0.5,
      clouds: 0.3, cloudLit: 0xffffff, cloudDark: 0xb4c0cc },
    env: 1.0,
  },
  // Златният час: топло слънце ниско над покривите, хладни сенки.
  sunset: {
    label: 'залез', sunElevation: 12, sunAzimuth: 250,
    sun: 0xffb070, sunIntensity: 2.6,
    sky: 0xc4ae9c, ground: 0x5a4640, hemi: 0.85,
    fog: 0xcfae92, fogNear: 200, fogFar: 700,
    exposure: 0.95, bloom: 0.16,
    dome: { zenith: 0x2f4f86, horizon: 0xf0bb8c, ground: 0x4a3a34, glow: 1.2, disc: 6,
      clouds: 0.35, cloudLit: 0xffbd8e, cloudDark: 0x5f5b78 },
    env: 0.8,
  },
  night: {
    label: 'нощ', sunElevation: -12, sunAzimuth: 250,
    moon: true, sun: 0x9db8ff, sunIntensity: 0.45,
    sky: 0x24365a, ground: 0x0c0f16, hemi: 0.55,
    fog: 0x0e1626, fogNear: 90, fogFar: 520,
    exposure: 1.15, bloom: 0.35,
    dome: { zenith: 0x02040a, horizon: 0x111b30, ground: 0x05070b, glow: 0.12, disc: 2.5, discSize: 0.0003,
      clouds: 0.22, cloudLit: 0x1b2438, cloudDark: 0x070a12 },
    env: 1.0,
  },
};

export const WEATHER = {
  clear: { label: 'ясно' },
  rain: { label: 'дъжд' },
};

// Дъжд: сиво облачно небе, слънцето почти гасне, мъглата е по-близо.
// Всяко време на деня има своя сивота — при залез остава малко топлина.
const RAIN = {
  day: {
    sun: 0xdfe6ee, sunIntensity: 0.45, sky: 0xaab4c0, ground: 0x3e4247, hemi: 1.05,
    fog: 0x8c96a1, fogNear: 60, fogFar: 380, exposure: 1.0, bloom: 0.16,
    dome: { zenith: 0x5a636e, horizon: 0x8c96a1, ground: 0x3a3f45, glow: 0.08, disc: 0,
      clouds: 0.95, cloudLit: 0x9ba4ae, cloudDark: 0x4e5660 },
    env: 1.0,
  },
  sunset: {
    sun: 0xffc08e, sunIntensity: 0.45, sky: 0xa2a6b2, ground: 0x34363c, hemi: 0.95,
    fog: 0x87878f, fogNear: 60, fogFar: 380, exposure: 1.0, bloom: 0.18,
    dome: { zenith: 0x3a414f, horizon: 0x8f8b90, ground: 0x2e3035, glow: 0.5, disc: 0,
      clouds: 0.95, cloudLit: 0x9f9ca4, cloudDark: 0x444a58 },
    env: 1.0,
  },
  night: {
    sunIntensity: 0.25, sky: 0x2a3548, ground: 0x0a0c10, hemi: 0.5,
    fog: 0x141a24, fogNear: 50, fogFar: 360, exposure: 1.15, bloom: 0.4,
    dome: { zenith: 0x05070b, horizon: 0x161c27, ground: 0x07090c, glow: 0, disc: 0,
      clouds: 0.95, cloudLit: 0x1e2531, cloudDark: 0x0a0d12 },
    env: 1.0,
  },
};

/** Настройките за даденото време на деня и време. */
export function preset(time, weather) {
  const t = TIMES[time] || TIMES.day;
  if (weather !== 'rain') return t;
  const r = RAIN[time] || RAIN.day;
  return { ...t, ...r, dome: { ...t.dome, ...r.dome }, preetham: null, wet: true };
}

export class Atmosphere {
  constructor(scene, renderer, fog) {
    this.scene = scene;
    this.renderer = renderer;
    this.fog = fog;
    this.time = 'day';
    this.weather = 'clear';
    this.clock = 0;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.hemi.up.set(0, 0, 1);
    this.hemi.position.set(0, 0, 1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_SPAN; sc.right = SHADOW_SPAN;
    sc.top = SHADOW_SPAN; sc.bottom = -SHADOW_SPAN;
    sc.near = 10; sc.far = 1600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.35;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sunDir = new THREE.Vector3();

    this.sky = new Sky();              // ясен ден
    this.sky.scale.setScalar(SKY_SIZE);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.dome = new Dome(SKY_SIZE);    // залез, нощ, дъжд
    scene.add(this.dome);

    this.stars = makeStars();
    scene.add(this.stars);

    this.rain = makeRain();
    scene.add(this.rain);

    this.ground = [];              // материалите на настилките — мокри при дъжд
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envDome = new Dome(SKY_SIZE);
    this.envScene.add(this.envDome);
    this.env = null;
  }

  /** Стария фон (кутията `cielo`) го сменя истинското небе. */
  replaceOldSky(cielo) {
    if (cielo) cielo.visible = false;
  }

  set(time = this.time, weather = this.weather) {
    this.time = TIMES[time] ? time : 'day';
    this.weather = WEATHER[weather] ? weather : 'clear';
    const t = preset(this.time, this.weather);
    const wet = !!t.wet;

    const el = THREE.MathUtils.degToRad(t.sunElevation);
    const az = THREE.MathUtils.degToRad(t.sunAzimuth);
    this.sunDir.set(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
    // Нощем светлината е от луната — високо, от другата страна.
    const light = t.moon
      ? new THREE.Vector3(-this.sunDir.x, -this.sunDir.y, 0.75).normalize()
      : this.sunDir.clone();
    this.lightDir = light;

    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunIntensity;
    this.hemi.color.set(t.sky);
    this.hemi.groundColor.set(t.ground);
    this.hemi.intensity = t.hemi;

    const fogColor = new THREE.Color(t.fog);
    this.fog.color.copy(fogColor);
    this.fog.near = t.fogNear;
    this.fog.far = t.fogFar;
    this.scene.background = fogColor.clone();
    this.renderer.toneMappingExposure = t.exposure;

    // Видимото небе: физическото само в ясен ден, иначе преливането.
    const p = t.preetham;
    if (p) {
      const u = this.sky.material.uniforms;
      u.turbidity.value = p.turbidity;
      u.rayleigh.value = p.rayleigh;
      u.mieCoefficient.value = p.mie;
      u.mieDirectionalG.value = p.mieG;
      u.cloudCoverage.value = p.clouds;
      u.cloudDensity.value = 0.45;
      u.showSunDisc.value = 1;
      u.brightness.value = p.brightness;
      // Шейдърът е с Y нагоре — слънцето му се подава с разменени оси.
      u.sunPosition.value.set(this.sunDir.x, this.sunDir.z, this.sunDir.y).multiplyScalar(450000);
    }
    this.sky.visible = !!p;
    this.dome.visible = !p;
    this.dome.set(t.dome, light, t.moon ? 0xcfdcff : t.sun);
    this.stars.visible = !!t.moon && !wet;
    this.rain.visible = wet;
    this.rain.material.opacity = t.moon ? 0.16 : 0.3;   // нощем капките се виждат само на светло

    // Отраженията по колите и мокрия асфалт — от преливането, без облаци:
    // точно колкото е зададено, без да изгаря.
    this.envDome.set({ ...t.dome, disc: 0 }, light, t.moon ? 0xcfdcff : t.sun, { clouds: false });
    this.envDome.material.uniforms.glow.value *= 0.5;
    if (this.env) this.env.dispose();
    this.env = this.pmrem.fromScene(this.envScene, 0.02).texture;
    this.scene.environment = this.env;
    this.scene.environmentIntensity = t.env;
    for (const m of this.ground) {
      m.roughness = wet ? 0.3 : 0.9;
      m.metalness = wet ? 0.05 : 0;
      m.envMapIntensity = wet ? 1.0 : 0.3;
      m.color.setScalar(wet ? 0.7 : 1);   // мокрото е по-тъмно
      m.needsUpdate = true;
    }
    return t;
  }

  get isNight() { return !!TIMES[this.time].moon; }

  setShadowQuality(size) {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.shadowMap = size;
  }

  /** Всеки кадър: сенките следват колата, небето — камерата, дъждът пада. */
  update(dt, focus, camera) {
    this.clock += dt;
    // Картата на сенките се мести на цели пиксели — иначе ръбовете трептят.
    const texel = (2 * SHADOW_SPAN) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fy = Math.round(focus.y / texel) * texel;
    this.sun.target.position.set(fx, fy, focus.z);
    this.sun.position.set(fx, fy, focus.z).addScaledVector(this.lightDir, 700);
    this.sun.target.updateMatrixWorld();

    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.time.value = this.clock;
    this.dome.position.copy(camera.position);
    this.dome.time = this.clock;
    this.stars.position.copy(camera.position);

    if (this.rain.visible) {
      this.rain.position.copy(camera.position);
      const pos = this.rain.geometry.attributes.position;
      const a = pos.array;
      const fall = 70 * dt;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 2] -= fall; a[i + 5] -= fall;
        if (a[i + 5] < -30) {
          const x = (Math.random() - 0.5) * 120, y = (Math.random() - 0.5) * 120, z = 30 + Math.random() * 20;
          a[i] = x; a[i + 1] = y; a[i + 2] = z;
          a[i + 3] = x + 0.3; a[i + 4] = y + 0.2; a[i + 5] = z - 2.2;
        }
      }
      pos.needsUpdate = true;
    }
  }
}

function makeStars() {
  const n = 1600;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(Math.random() * 0.95);        // само горната половина
    pos[i * 3] = Math.sin(v) * Math.cos(u) * 850;
    pos[i * 3 + 1] = Math.sin(v) * Math.sin(u) * 850;
    pos[i * 3 + 2] = Math.cos(v) * 850;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false,
  }));
  stars.frustumCulled = false;
  stars.visible = false;
  return stars;
}

function makeRain() {
  const n = 2600;
  const pos = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 120, y = (Math.random() - 0.5) * 120, z = Math.random() * 60 - 30;
    pos.set([x, y, z, x + 0.3, y + 0.2, z - 2.2], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xaebccc, transparent: true, opacity: 0.35, fog: true, depthWrite: false,
  }));
  rain.frustumCulled = false;
  rain.visible = false;
  return rain;
}
