// Кинотеатърът, направен обемно.
//
// Фасадата му е една картина: козирка, табела, афиши и букви — всичко
// нарисувано върху равна стена. Тук те стават геометрия: козирката излиза
// над входа и се вижда отдолу, табелата и буквите стърчат, афишите са в
// рамки, а колоните до входа са наистина колони. Лицата на изпъкналите
// части взимат точно своето парче от картината (UV-то се смята по стената,
// без дълбочината), затова буквите си остават букви.
//
// Вратите потъват навътре през общия път в facade.js (HAND там).

import * as THREE from 'three';

const TEXTURE = 'Cinema';

// Части по текстурата: [u0, v0, u1, v1], дълбочина в метри и вид.
// `sign` са с картината отпред, `stone` са в цвета на камъка.
const PARTS = [
  { rect: [0.300, 0.836, 0.700, 0.870], out: 2.2, kind: 'stone', label: 'козирка' },
  { rect: [0.300, 0.845, 0.336, 1.000], out: 0.55, kind: 'stone', label: 'колона ляво' },
  { rect: [0.664, 0.845, 0.700, 1.000], out: 0.55, kind: 'stone', label: 'колона дясно' },
  { rect: [0.355, 0.712, 0.655, 0.828], out: 0.9, kind: 'sign', label: 'табела', glow: 1 },
  { rect: [0.270, 0.628, 0.752, 0.698], out: 0.3, kind: 'sign', label: 'букви', glow: 0.7 },
  { rect: [0.175, 0.795, 0.287, 0.967], out: 0.12, kind: 'sign', label: 'афиш ляво', glow: 0.25 },
  { rect: [0.713, 0.795, 0.825, 0.967], out: 0.12, kind: 'sign', label: 'афиш дясно', glow: 0.25 },
];

const GLOW = { day: 0, sunset: 0.8, night: 2.0, rainDay: 0.5 };

/** Стените с дадена текстура, с изображението „UV → свят". */
function faces(mesh) {
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
    if (Math.abs(n.z) > 0.35) continue;
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
      g = { origin: pa, uvOrigin: ua, dPdu, dPdv, outward,
        uMin: Infinity, uMax: -Infinity, vMin: Infinity, vMax: -Infinity };
      groups.set(key, g);
    }
    for (const q of [ua, ub, uc]) {
      g.uMin = Math.min(g.uMin, q.x); g.uMax = Math.max(g.uMax, q.x);
      g.vMin = Math.min(g.vMin, q.y); g.vMax = Math.max(g.vMax, q.y);
    }
  }
  return [...groups.values()];
}

function push(target, a, b, c, d, uvAt) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.lengthSq() < 1e-12) return;
  n.normalize();
  for (const tri of [[a, b, c], [a, c, d]]) {
    for (const v of tri) {
      target.pos.push(v.x, v.y, v.z);
      target.nor.push(n.x, n.y, n.z);
      const t = uvAt(v);
      target.uv.push(t.x, t.y);
    }
  }
}

function geometryOf(part) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(part.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(part.uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** Обемните части на кинотеатъра. `wall` е цветът на камъка (windows.py). */
export function buildTheatre(world, wallColor = [150, 124, 110]) {
  world.root.updateMatrixWorld(true);
  const meshes = [];
  const signMaterials = [];
  let source = null;

  world.zones.forEach((zone, zi) => {
    const list = [];
    zone.traverse(o => { if (o.isMesh && !o.userData.generated && !o.userData.unlit) list.push(o); });
    for (const mesh of list) {
      const material = [].concat(mesh.material)[0];
      if (material?.map?.name !== TEXTURE) continue;
      source = source || material;

      for (const face of faces(mesh)) {
        // Само стената с табелата: долната половина на картината.
        if (face.vMin > 0.55 || face.vMax < 0.9) continue;
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
        const stone = { pos: [], nor: [], uv: [] };
        // Светещите части се делят по сила: табелата грее, афишите — слабо.
        const signs = new Map();

        for (const { rect: [u0, v0, u1, v1], out, kind, glow = 1 } of PARTS) {
          if (u0 < face.uMin || u1 > face.uMax || v0 < face.vMin || v1 > face.vMax) continue;
          if (kind === 'sign' && !signs.has(glow)) signs.set(glow, { pos: [], nor: [], uv: [] });
          const target = kind === 'sign' ? signs.get(glow) : stone;
          const p = (u, v, d) => at(u, v, d);
          // Лице навън, после четирите страни назад към стената.
          push(target, p(u0, v1, out), p(u1, v1, out), p(u1, v0, out), p(u0, v0, out), uvAt);
          push(target, p(u0, v0, out), p(u1, v0, out), p(u1, v0, 0), p(u0, v0, 0), uvAt);
          push(target, p(u1, v1, out), p(u0, v1, out), p(u0, v1, 0), p(u1, v1, 0), uvAt);
          push(target, p(u0, v0, out), p(u0, v0, 0), p(u0, v1, 0), p(u0, v1, out), uvAt);
          push(target, p(u1, v1, out), p(u1, v1, 0), p(u1, v0, 0), p(u1, v0, out), uvAt);
        }

        const wall = new THREE.Color().setRGB(
          wallColor[0] / 255, wallColor[1] / 255, wallColor[2] / 255, THREE.SRGBColorSpace);
        const stoneMaterial = new THREE.MeshStandardMaterial({
          color: wall.multiplyScalar(1.05), roughness: 0.82, metalness: 0,
          envMapIntensity: material.envMapIntensity ?? 0.3,
        });
        const parts = [[stone, stoneMaterial, 'stone']];
        for (const [glow, part] of signs) {
          const signMaterial = new THREE.MeshStandardMaterial({
            map: material.map, normalMap: material.normalMap || null,
            roughness: material.roughness, metalness: material.metalness,
            envMapIntensity: material.envMapIntensity,
            emissive: 0xffffff, emissiveMap: material.map, emissiveIntensity: 0,
          });
          signMaterial.userData.glow = glow;
          signMaterials.push(signMaterial);
          parts.push([part, signMaterial, `sign${String(glow).replace('.', '')}`]);
        }

        zone.updateMatrixWorld(true);
        const inverse = zone.matrixWorld.clone().invert();
        for (const [part, mat, kind] of parts) {
          if (!part.pos.length) continue;
          const m = new THREE.Mesh(geometryOf(part), mat);
          m.name = `Theatre_${kind}_${zi + 1}`;
          m.applyMatrix4(inverse);
          m.castShadow = true;
          m.receiveShadow = true;
          m.userData.generated = true;
          zone.add(m);
          meshes.push(m);
        }
      }
    }
  });

  return {
    meshes,
    /** Табелата и афишите светят вечер. */
    setTime(time, weather) {
      const k = time === 'night' ? GLOW.night : time === 'sunset' ? GLOW.sunset
        : weather === 'rain' ? GLOW.rainDay : GLOW.day;
      for (const m of signMaterials) m.emissiveIntensity = k * (m.userData.glow ?? 1);
    },
    setVisible(on) { for (const m of meshes) m.visible = on; },
  };
}
