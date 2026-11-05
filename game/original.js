// Каквото Blender конверсията е загубила, извадено направо от оригиналния
// FFXRunner6.dir с tools/w3d/extract.py (assets/original.json).
//
// Оттам идват точните места на всички обекти и формата на телата от физиката
// на Havok. Геометрията на видимите модели в .dir е компресирана и не се
// чете — затова липсващите видими обекти се строят от свои двойници, които
// конверсията има: паркираните коли от cars.glb, къщите D09–D11 от D01,
// оградите — от слетия им в едно обект Transenna16.

import * as THREE from 'three';
import { ZONE_LIST } from './data.js?v=169';
import { GRAVITY } from './params.js?v=169';

// Невидимите тела на Havok, които пълнят дупки в конверсията. В оригинала
// Starting.ls маха всичко с „?" от сцената, но телата остават във физиката.
// Огромните подови плочи (?Strada03/04/05/08) и кутията на гаража (?BoxAuto)
// са пропуснати: пътищата на конверсията вече носят колата, а гараж няма.
// ?Ipercubo01/02 са преградите на прелезите — те са работа на сценария.
const HIDDEN_BODIES = [
  // стените покрай дърветата от двете страни на пътя след надлеза
  '?CollisioneAlberi01', '?CollisioneAlberi02',
  // затварят релсите от двете страни на първия прелез
  '?ChiusuraBinari01', '?ChiusuraBinari02',
  // стените на канала
  '?CollisionePareteCanale01', '?CollisionePareteCanale02', '?CollisionePareteCanale03',
  '?CollisionePareteCanale12', '?CollisionePareteCanale13', '?CollisionePareteCanale14',
  '?CollisionePareteCanale15', '?CollisionePareteCanale16', '?CollisionePareteCanale17',
  '?CollisionePareteCanale18', '?CollisionePareteCanale19', '?CollisionePareteCanale20',
  // рампите: от моста на юг, от надлеза на запад, и трамплинът на изхода
  // на тунела — от него в оригинала се скача
  '?Strada06', '?Strada07A', '?Strada07B', '?Strada07C', '?Tunnelazz02Salto',
  // пътят по моста — видим в оригинала, но конверсията има само рисунката му
  "'StradaCavalcavia",
];

// Паркираните коли: cars.glb има по един модел от всеки вид. C02–C07 са
// друго возило от C01 (микробуси, 8.3 фута), E02 е същото като E01 и т.н.
const PARKED = {
  AutoParcA01: 'AutoParcA01', AutoParcB01: 'AutoParcB01',
  AutoParcC01: 'AutoParcC01',
  AutoParcC02: 'AutoParcC02', AutoParcC03: 'AutoParcC02', AutoParcC04: 'AutoParcC02',
  AutoParcC05: 'AutoParcC02', AutoParcC06: 'AutoParcC02', AutoParcC07: 'AutoParcC02',
  AutoParcD01: 'AutoParcD01', AutoParcD02: 'AutoParcD01',
  AutoParcE01: 'AutoParcE01', AutoParcE02: 'AutoParcE01', AutoParcE03: 'AutoParcE03',
  AutoParcF01: 'AutoParcF01',
};

// Къщите, които липсват, и образецът, от който се правят.
const CLONES = { CasazzD09: 'CasazzD01', CasazzD10: 'CasazzD01', CasazzD11: 'CasazzD01' };
// Бараката до първия прелез няма двойник. Най-близката по височина е
// Capanazz15 — разпъва се до точната кутия от физиката на оригинала.
const STAND_INS = { Capanazz08: 'Capanazz15' };

const HIDDEN_MATERIAL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

const sanitise = name => name.replace(/['+-]/g, '_').replace(/_+$/, '');

/** Зоната (от 1) по zoneList на оригинала, 0 ако обектът не е в зона. */
function zoneOf(name) {
  const n = sanitise(name);
  const i = ZONE_LIST.findIndex(list => list.includes(n));
  return i + 1;
}

function directorMatrix(m) {
  return new THREE.Matrix4().fromArray(m);       // и двете са по колони
}

function bodyMesh(name, entry) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(entry.vertices, 3));
  geo.setIndex(entry.triangles);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, HIDDEN_MATERIAL);
  mesh.name = name;
  mesh.visible = false;
  return mesh;
}

function bounds(entry) {
  const v = entry.vertices;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[i + k]);
      max[k] = Math.max(max[k], v[i + k]);
    }
  }
  return { min, max };
}

/** Копие на обект от конверсията, преместено от мястото на `from` на `to`
 *  (матрици на Director) — геометрията се пече в световни координати. */
function relocated(source, fromMatrix, toMatrix, name) {
  const move = directorMatrix(toMatrix).multiply(directorMatrix(fromMatrix).invert());
  const group = new THREE.Group();
  group.name = name;
  source.updateMatrixWorld(true);
  source.traverse(c => {
    if (!c.isMesh) return;
    const geo = c.geometry.clone().applyMatrix4(c.matrixWorld).applyMatrix4(move);
    const mesh = new THREE.Mesh(geo, c.material);
    mesh.name = name;
    group.add(mesh);
  });
  return group;
}

/** Копие, разпънато от кутията на образеца до кутията на липсващия. */
function stretched(source, from, to, name) {
  const scale = [0, 1, 2].map(k => (to.max[k] - to.min[k]) / (from.max[k] - from.min[k]));
  const m = new THREE.Matrix4()
    .makeTranslation(to.min[0], to.min[1], to.min[2])
    .multiply(new THREE.Matrix4().makeScale(...scale))
    .multiply(new THREE.Matrix4().makeTranslation(-from.min[0], -from.min[1], -from.min[2]));
  const group = new THREE.Group();
  group.name = name;
  source.updateMatrixWorld(true);
  source.traverse(c => {
    if (!c.isMesh) return;
    const geo = c.geometry.clone().applyMatrix4(c.matrixWorld).applyMatrix4(m);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, c.material);
    mesh.name = name;
    group.add(mesh);
  });
  return group;
}

// --- оградите -----------------------------------------------------------

// Transenna01–19 са твърди тела с маса 50 кг срещу 600 на колата: в
// оригинала Havok ги разхвърля при удар. Тук всяка е отделен обект с проста
// физика — отскок, въртене, гравитация, падане на земята.
const BARRIER_REACH = 2.6;      // фута от центъра ѝ до центъра на колата
const BARRIER_KICK = 1.25;      // колко от скоростта на колата взема
const BARRIER_MASS_SHARE = 50 / 650;

// Случайни числа с постоянно начало (mulberry32): оградите хвърчат различно при всеки удар,
// но еднакво при всяко зареждане, за да се повтаря записаното каране (tools/inputs.js).
let seed = 0x5eed;
function rand() {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

class Barrier {
  constructor(object, base) {
    this.object = object;
    this.position = base.clone();
    this.velocity = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.flying = false;
    this.object.position.copy(base);
  }

  hit(car) {
    const v = car.velocity;
    this.velocity.set(v.x * BARRIER_KICK, v.y * BARRIER_KICK, 6 + rand() * 4);
    this.velocity.x += (rand() - 0.5) * 8;
    this.velocity.y += (rand() - 0.5) * 8;
    this.spin.set((rand() - 0.5) * 10, (rand() - 0.5) * 10, (rand() - 0.5) * 6);
    this.flying = true;
    // Колата губи толкова, колкото тежи оградата спрямо двете заедно.
    const speed = v.length();
    v.multiplyScalar(1 - BARRIER_MASS_SHARE);
    return speed;
  }

  step(dt, world) {
    if (!this.flying) return;
    this.velocity.z += GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);
    const o = this.object;
    o.rotation.x += this.spin.x * dt;
    o.rotation.y += this.spin.y * dt;
    o.rotation.z += this.spin.z * dt;

    const ground = world.probeDown(this.position.clone().setZ(this.position.z + 4), 40);
    const floor = ground ? ground.point.z : this.position.z;
    if (this.position.z <= floor && this.velocity.z < 0) {
      this.position.z = floor;
      this.velocity.z *= -0.25;
      this.velocity.x *= 0.6;
      this.velocity.y *= 0.6;
      this.spin.multiplyScalar(0.5);
      if (this.velocity.length() < 1.5) {
        this.flying = false;
        // Ляга на една страна, вместо да остане наклонена във въздуха.
        o.rotation.x = Math.round(o.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
        o.rotation.y = Math.round(o.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
      }
    }
    o.position.copy(this.position);
  }
}

/** Разделя слетия Transenna16 на 19 огради: всеки триъгълник отива при
 *  най-близкия център от физиката на оригинала. */
function splitBarriers(merged, centres, scene) {
  const parts = centres.map(() => []);
  merged.updateMatrixWorld(true);
  merged.traverse(c => {
    if (!c.isMesh) return;
    const geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    geo.applyMatrix4(c.matrixWorld);
    const pos = geo.attributes.position;
    const buckets = centres.map(() => []);
    for (let t = 0; t < pos.count; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      let best = 0, bestD = Infinity;
      centres.forEach((ctr, k) => {
        const d = (cx - ctr.x) ** 2 + (cy - ctr.y) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      });
      buckets[best].push(t);
    }
    buckets.forEach((tris, k) => {
      if (!tris.length) return;
      const out = new THREE.BufferGeometry();
      for (const [attr, src] of Object.entries(geo.attributes)) {
        const size = src.itemSize;
        const arr = new Float32Array(tris.length * 3 * size);
        tris.forEach((t, i) => {
          for (let v = 0; v < 3; v++) {
            for (let s = 0; s < size; s++) arr[(i * 3 + v) * size + s] = src.array[(t + v) * size + s];
          }
        });
        out.setAttribute(attr, new THREE.BufferAttribute(arr, size));
      }
      // Началото — в основата на оградата, за да се върти около нея.
      out.translate(-centres[k].x, -centres[k].y, -centres[k].z);
      parts[k].push(new THREE.Mesh(out, c.material));
    });
  });
  return parts.map((meshes, k) => {
    const group = new THREE.Group();
    group.name = 'Transenna';
    meshes.forEach(m => group.add(m));
    scene.add(group);
    return new Barrier(group, centres[k]);
  });
}

// --- сглобяване ------------------------------------------------------------

export function addOriginal(world, scene, data, buildModel) {
  const missing = data.missing;
  const added = { hidden: 0, parked: 0, buildings: 0, barriers: 0 };

  for (const name of HIDDEN_BODIES) {
    const entry = missing[name];
    if (!entry || !entry.vertices) continue;
    world.addToZone(bodyMesh(name, entry), zoneOf(name));
    added.hidden++;
  }

  // Паркираните коли: моделът от cars.glb, а тялото — кутията от физиката.
  for (const [name, model] of Object.entries(PARKED)) {
    const entry = missing[name];
    if (!entry || !entry.vertices) continue;
    const { min, max } = bounds(entry);
    const car = buildModel(model);
    const alongX = (max[0] - min[0]) >= (max[1] - min[1]);
    car.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]);
    car.rotation.z = alongX ? 0 : Math.PI / 2;
    car.updateMatrixWorld(true);
    // Моделът се рисува, а в сблъсъците влиза кутията — както в Havok.
    const zone = zoneOf(name);
    const visual = new THREE.Group();
    visual.add(car);
    const body = bodyMesh(name, entry);
    world.addToZone(body, zone);
    const holder = zone > 0 ? world.zones[zone - 1] : world.root.children[0];
    holder.updateMatrixWorld(true);
    visual.applyMatrix4(holder.matrixWorld.clone().invert());
    holder.add(visual);
    added.parked++;
  }

  // Къщите — копия на същата сграда на точните места.
  for (const [name, sourceName] of Object.entries(CLONES)) {
    const source = world.objects.get(sourceName);
    const entry = missing[name];
    const from = data.sources[sourceName];
    if (!source || !entry || !from) continue;
    world.addToZone(relocated(source, from.matrix, entry.matrix, name), zoneOf(name));
    added.buildings++;
  }
  for (const [name, sourceName] of Object.entries(STAND_INS)) {
    const source = world.objects.get(sourceName);
    const entry = missing[name];
    const from = data.sources[sourceName];
    if (!source || !entry || !entry.vertices || !from || !from.min) continue;
    world.addToZone(stretched(source, from, bounds(entry), name), zoneOf(name));
    added.buildings++;
  }

  // Оградите: слетият обект се сменя с 19 отделни.
  let barriers = [];
  const merged = world.objects.get('Transenna16');
  if (merged) {
    const centres = [];
    for (let k = 1; k <= 19; k++) {
      const name = 'Transenna' + String(k).padStart(2, '0');
      const box = k === 16 ? data.sources.Transenna16 : missing[name] && bounds(missing[name]);
      if (!box || !box.min) continue;
      centres.push(new THREE.Vector3((box.min[0] + box.max[0]) / 2,
                                     (box.min[1] + box.max[1]) / 2, box.min[2]));
    }
    barriers = splitBarriers(merged, centres, scene);
    world.dropColliders(['Transenna16']);
    merged.visible = false;
    merged.traverse(c => { c.visible = false; });
    added.barriers = barriers.length;
  }

  return { added, barriers };
}

/** Удари и полет на оградите. Връща скоростта на удар, ако колата е
 *  блъснала някоя в тази стъпка. */
export function stepBarriers(barriers, car, world, dt) {
  let impact = 0;
  for (const b of barriers) {
    if (!b.flying) {
      const dx = b.position.x - car.position.x;
      const dy = b.position.y - car.position.y;
      if (dx * dx + dy * dy < BARRIER_REACH * BARRIER_REACH &&
          Math.abs(b.position.z - car.position.z) < 3 && car.velocity.length() > 3) {
        impact = Math.max(impact, b.hit(car));
      }
    }
    b.step(dt, world);
  }
  return impact;
}
