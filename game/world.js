// Зареждане и подготовка на света.
//
// Оригиналът държи целия град в един Shockwave 3D cast member и кодира
// свойствата на обектите в имената им (Starting.ls). Blender конверсията е
// изгубила специалните знаци, затова ги възстановяваме от data.js.
//
// Сцената се обръща обратно в координатите на Director: Z нагоре, фут за
// единица. Така всички константи от Lingo-то важат без преизчисляване.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_SCALE } from './params.js?v=167';
import { ZONE_LIST, ZONE_ON, INVISIBLE, DOUBLE_SIDED } from './data.js?v=167';

// probeGround в DriveHuman разпознава настилката по името на обекта отдолу.
// Lingo сравнява низове без оглед на регистъра, затова сравняваме в lowercase.
export const SURFACE = { TRACK: 'track', GROUND: 'ground', GRASS: 'grass' };

export function classifySurface(name) {
  const n = name.toLowerCase();
  if (n.includes('strada')) return SURFACE.TRACK;
  if (n.includes('marciapiede')) return SURFACE.GROUND;
  // Оригиналът проверява "acqua" два пъти — вторият клон, който единствен
  // връща #grass, е недостижим. Възпроизвеждаме бъга: трева няма.
  if (n.includes('acqua')) return SURFACE.TRACK;
  return SURFACE.TRACK;
}

export class World {
  constructor() {
    this.root = new THREE.Group();
    this.objects = new Map();      // име → Object3D
    this.zones = [];               // индекс 0..17 → Group
    this.zoneVisible = [];         // zone01 от Zone.ls
    this.currentZone = 0;
    this.colliders = [];           // меша, срещу които се хвърлят лъчи
    this.missing = [];             // обекти от zoneList, които ги няма в .glb
    this._ray = new THREE.Raycaster();
  }

  async load(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const scene = gltf.scene;

    // glTF излиза Y-нагоре; връщаме го на Z-нагоре и в мащаба на оригинала.
    this.root.add(scene);
    this.root.rotation.x = Math.PI / 2;
    this.root.scale.setScalar(WORLD_SCALE);
    this.root.updateMatrixWorld(true);

    // Оригиналът рисува целия град без осветление (Starting.ls: `s.flat = 1`)
    // — сенките са нарисувани в текстурите. Тук той е осветен истински:
    // слънце, сенки от сградите, небе (atmosphere.js). Без осветление остават
    // само небето и силуетите на хоризонта — те са фон.
    const flat = new Map();
    scene.traverse(o => {
      if (o.name) this.objects.set(o.name, o);
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map(m => this._flatten(m, flat));
      if (Array.isArray(o.material) && o.material.length === 1) o.material = o.material[0];
    });

    for (const name of DOUBLE_SIDED) {
      const o = this.objects.get(name);
      if (!o) continue;
      o.traverse(c => {
        if (!c.isMesh) return;
        for (const m of [].concat(c.material)) if (m) m.side = THREE.DoubleSide;
      });
    }

    // Тригерните обеми са невидими, но продължават да се засичат от лъча.
    for (const name of INVISIBLE) {
      const o = this.objects.get(name);
      if (o) o.visible = false;
    }

    // Небето е кутия, в която се стои отвътре — лицевите ѝ стени гледат навън.
    const sky = this.objects.get('cielo');
    if (sky) sky.traverse(c => {
      if (!c.isMesh) return;
      for (const m of [].concat(c.material)) {
        if (m) m.side = THREE.BackSide;
      }
    });

    // Фонът — небето и силуетите на хоризонта — не се осветява.
    scene.traverse(o => {
      if (!o.isMesh || !UNLIT.test(o.name)) return;
      o.material = [].concat(o.material).map(m => m && new THREE.MeshBasicMaterial({
        name: m.name, map: m.map, color: m.color, transparent: m.transparent,
        opacity: m.opacity, alphaTest: m.alphaTest, side: m.side,
      }));
      if (o.material.length === 1) o.material = o.material[0];
      o.userData.unlit = true;
    });

    this._buildZones();
    this._collectColliders();
    return this;
  }

  _flatten(material, cache) {
    if (!material) return material;
    if (cache.has(material.uuid)) return cache.get(material.uuid);
    const flat = new THREE.MeshStandardMaterial({
      name: material.name,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.3,        // небето осветява малко — главно е слънцето
      map: material.map || null,
      color: material.color ? material.color.clone() : undefined,
      transparent: material.transparent,
      opacity: material.opacity,
      // Starting.ls слага textureRenderFormat = #rgba5551 — един бит прозрачност.
      // Дърветата, оградите и силуетите на хоризонта разчитат на нея, а
      // конверсията е изнесла материалите като плътни. Прагът е безобиден за
      // текстурите без алфа канал.
      alphaTest: 0.5,
      side: THREE.FrontSide,
    });
    cache.set(material.uuid, flat);
    return flat;
  }

  _buildZones() {
    for (let i = 0; i < ZONE_LIST.length; i++) {
      const group = new THREE.Group();
      group.name = `zona${i + 1}`;
      for (const name of ZONE_LIST[i]) {
        const o = this.objects.get(name);
        if (!o) { this.missing.push(name); continue; }
        group.add(o);          // прегрупираме — трансформациите са световни
      }
      this.root.children[0].add(group);
      this.zones.push(group);
    }

    // zone01 от adjustZone: зона K се вижда от зона i, ако K === i или K ∈ zoneOn[i]
    this.zoneVisible = ZONE_ON.map((neighbours, i) =>
      ZONE_ON.map((_, k) => k === i || neighbours.includes(k + 1)));
  }

  _collectColliders() {
    // Обектите извън зоните (небе, декор без зона) остават винаги активни.
    this._zoneMeshes = this.zones.map(z => {
      const meshes = [];
      z.traverse(o => { if (o.isMesh) meshes.push(o); });
      return meshes;
    });
    const inZone = new Set(this._zoneMeshes.flat());
    this._loose = [];
    this.root.traverse(o => { if (o.isMesh && !inZone.has(o)) this._loose.push(o); });
    this._refreshColliders();
  }

  // zoneChange от ZoneManager.ls — показва текущата зона и съседите ѝ.
  // Изключените зони отпадат и от лъчите, както removeFromWorld в оригинала.
  setZone(n) {
    if (n === this.currentZone || n < 1 || n > this.zones.length) return;
    this.currentZone = n;
    const visible = this.zoneVisible[n - 1];
    for (let z = 0; z < this.zones.length; z++) this.zones[z].visible = visible[z];
    this._refreshColliders();
  }

  /** Сенките: всичко в града ги хвърля и приема, освен фона. */
  enableShadows() {
    this.root.traverse(o => {
      if (!o.isMesh || o.userData.unlit) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  /** Материалите на настилките — за мокрия асфалт при дъжд. */
  groundMaterials() {
    const out = new Set();
    this.root.traverse(o => {
      if (!o.isMesh || o.userData.unlit) return;
      const n = o.name.toLowerCase();
      if (!/strada|marciapiede|asfalto|piazza|ciotoli|parcheggio/.test(n)) return;
      for (const m of [].concat(o.material)) if (m && m.isMeshStandardMaterial) out.add(m);
    });
    return [...out];
  }

  /** Изважда обектите (и всичко под тях) от лъчите и сблъсъците. */
  dropColliders(names) {
    const gone = new Set();
    for (const name of names) {
      const o = this.objects.get(name);
      if (o) o.traverse(c => { if (c.isMesh) gone.add(c); });
    }
    this._loose = this._loose.filter(m => !gone.has(m));
    this._zoneMeshes = this._zoneMeshes.map(list => list.filter(m => !gone.has(m)));
    this._refreshColliders();
  }

  /** Добавя меш със световни координати към зона (номер от 1) или извън
   *  зоните (0). Мешът се закача под групата на зоната — така се скрива и
   *  изважда от сблъсъците заедно с нея, както всичко останало в света. */
  addToZone(mesh, zone) {
    const parent = zone > 0 ? this.zones[zone - 1] : this.root.children[0];
    parent.updateMatrixWorld(true);
    mesh.applyMatrix4(parent.matrixWorld.clone().invert());
    parent.add(mesh);
    mesh.updateMatrixWorld(true);
    const list = zone > 0 ? this._zoneMeshes[zone - 1] : this._loose;
    mesh.traverse(c => { if (c.isMesh) list.push(c); });
    this._refreshColliders();
  }

  /** Добавя подвижен обект (камиона) към сблъсъците, извън зоните. */
  addColliders(object) {
    object.traverse(c => { if (c.isMesh && !this._loose.includes(c)) this._loose.push(c); });
    this._refreshColliders();
  }

  _refreshColliders() {
    this.colliders.length = 0;
    this.colliders.push(...this._loose);
    for (let z = 0; z < this.zones.length; z++) {
      if (this.zones[z].visible) this.colliders.push(...this._zoneMeshes[z]);
    }
  }

  // zoneManager.ls вади номера на зоната от последните два знака на името.
  // Тук четем цифрите след "zona": GLTFLoader добавя наставки при повтарящи
  // се имена и "GraficaStradaZona01" става "GraficaStradaZona01_1".
  zoneFromObjectName(name) {
    const m = name && /zona(\d+)/i.exec(name);
    return m ? parseInt(m[1], 10) : 0;
  }

  /** Лъч надолу срещу целия град, не само видимите зони — при подреждане на
   *  неща по маршрута при зареждане, когато е заредена само зона 1. */
  probeDownAll(origin, maxDistance = 120) {
    const all = [...this._loose, ...this._zoneMeshes.flat()];
    this._ray.set(origin, DOWN);
    this._ray.far = maxDistance;
    for (const h of this._ray.intersectObjects(all, false)) {
      const name = h.object.name || '';
      if (/cielo/i.test(name) || name.startsWith('?')) continue;
      return { point: h.point, name, distance: h.distance };
    }
    return null;
  }

  /** Лъч надолу — връща { distance, point, normal, name } или null.
   *  Съответства на modelsUnderRay(pos, gDown, 3, #detailed). */
  probeDown(origin, maxDistance = 30) {
    return this.raycast(origin, DOWN, maxDistance);
  }

  /** `skipHidden` пропуска телата с „?" в името. Starting.ls ги маха от
   *  сцената (`removeFromWorld`), но физиката на Havok ги пази — затова колата
   *  се удря в тях, а камерата и погледът на противника (modelsUnderRay в
   *  оригинала) минават през тях. */
  raycast(origin, direction, maxDistance, skipHidden = false) {
    this._ray.set(origin, direction);
    this._ray.far = maxDistance;
    const hits = this._ray.intersectObjects(this.colliders, false);
    for (const h of hits) {
      const name = h.object.name || '';
      if (name.toLowerCase().includes('cielo')) continue;  // небето не е препятствие
      if (skipHidden && name.startsWith('?')) continue;
      const normal = h.face
        ? h.face.normal.clone().applyNormalMatrix(
            new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize()
        : new THREE.Vector3(0, 0, 1);
      // Телата от Havok са двустранни — нормалата трябва да гледа към лъча.
      if (normal.dot(direction) > 0) normal.negate();
      return { distance: h.distance, point: h.point, normal, name };
    }
    return null;
  }

}

const DOWN = new THREE.Vector3(0, 0, -1);
const UNLIT = /cielo|skyline/i;
