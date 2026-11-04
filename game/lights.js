// Светлините на нощния град: фаровете на колата ти (истинска светлина),
// сиянието на фаровете и стоповете на всички коли и уличните лампи покрай
// маршрута — петна светлина по асфалта и светеща лампа отгоре.

import * as THREE from 'three';

const LAMP_EVERY = 95;          // фута между две лампи по маршрута
const LAMP_SIDE = 10;           // встрани от линията на маршрута
const LAMP_HEIGHT = 13;
const POOL_SIZE = 34;

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GLOW = glowTexture('rgba(255,250,235,1)', 'rgba(255,230,190,0.35)');
const RED = glowTexture('rgba(255,70,50,1)', 'rgba(255,20,10,0.35)');
const POOL = glowTexture('rgba(255,222,165,0.6)', 'rgba(255,200,130,0.14)');

// Светлините са по-ярки от „бялото" (HDR): само те минават прага на
// сиянието в look.js, осветените стени — не.
const HDR = 3;

function sprite(texture, size, color = 0xffffff, hdr = HDR) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, color, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  s.material.color.multiplyScalar(hdr);
  s.scale.setScalar(size);
  return s;
}

/** Фарове и стопове върху модел на кола (forward е +X, нагоре е +Z). */
function carGlows(model, size, length) {
  const group = new THREE.Group();
  const half = length / 2;
  for (const y of [-0.62, 0.62]) {
    const head = sprite(GLOW, size);
    head.position.set(half, y * size, 0.75);
    group.add(head);
    const tail = sprite(RED, size * 0.65, 0xffffff, 2);
    tail.position.set(-half, y * size, 0.85);
    group.add(tail);
  }
  model.add(group);
  return group;
}

export function addLights(scene, world, player, others, route) {
  // Фаровете на колата ти — единствената истинска светлина от колите:
  // всяка лампа в сцената струва на всеки пиксел.
  const spot = new THREE.SpotLight(0xfff2dc, 420, 160, 0.5, 0.6, 1.5);
  spot.position.set(1.6, 0, 0.9);
  spot.target.position.set(40, 0, -2);
  spot.castShadow = false;
  player.add(spot);
  player.add(spot.target);

  const glows = [carGlows(player, 1.1, 3.8), ...others.map(o => carGlows(o, 1.2, 4.6))];

  // Уличните лампи — покрай маршрута, редувайки страните.
  const lamps = new THREE.Group();
  const poolGeo = new THREE.PlaneGeometry(POOL_SIZE, POOL_SIZE);
  const poolMat = new THREE.MeshBasicMaterial({
    map: POOL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, fog: true,
  });
  if (route && route.length > 1) {
    let since = 0, side = 1;          // колко фута след последната лампа
    for (let i = 1; i < route.length; i++) {
      const [x0, y0] = route[i - 1], [x1, y1] = route[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (!len) continue;
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      let last = -since;
      for (let d = LAMP_EVERY - since; d < len; d += LAMP_EVERY) {
        last = d;
        const x = x0 + (x1 - x0) * d / len + nx * LAMP_SIDE * side;
        const y = y0 + (y1 - y0) * d / len + ny * LAMP_SIDE * side;
        side = -side;
        const ground = world.probeDownAll(new THREE.Vector3(x, y, 60), 120);
        if (!ground || /tunnel/i.test(ground.name)) continue;   // в тунела — без
        const z = ground.point.z + 0.06;
        const pool = new THREE.Mesh(poolGeo, poolMat);
        pool.position.set(x, y, z);
        lamps.add(pool);
        const bulb = sprite(GLOW, 3.2, 0xffd9a0);
        bulb.position.set(x, y, z + LAMP_HEIGHT);
        lamps.add(bulb);
      }
      since = len - last;
    }
  }
  scene.add(lamps);

  let night = false, rain = false;
  const apply = () => {
    spot.visible = night || rain;
    spot.intensity = night ? 420 : 160;
    for (const g of glows) {
      g.visible = night || rain;
      // Денем в дъжда фаровете са включени, но не заслепяват.
      g.userData.dim = night ? 1 : 0.45;
      for (const c of g.children) c.material.opacity = g.userData.dim;
    }
    lamps.visible = night;
  };
  apply();

  return {
    lamps: lamps.children.length / 2,
    glowObjects: [...glows, lamps],
    setNight(isNight, isRain) { night = isNight; rain = isRain; apply(); },
    update(simTime, car) {
      // Стоповете светят по-силно при спиране.
      const braking = car.input && (car.input.brake || (car.input.backward && car.speed > 2));
      const tail = glows[0].children.filter((_, i) => i % 2 === 1);
      const dim = glows[0].userData.dim ?? 1;
      for (const t of tail) t.material.opacity = (braking ? 1 : 0.55) * dim;
    },
  };
}
