// Релеф по повърхностите: карта на нормалите, направена от самата текстура.
//
// Простото решение — картината да служи направо за височина (bumpMap) — не
// работи: в тези текстури сенките вече са нарисувани, релефът ги повтаря и
// паважът изсветлява, вместо да изпъкне.
//
// Затова първо махаме едрото от картината (тя минус размазаната тя — по-горно
// mip ниво) и остава само финият детайл: фугите между тухлите, ръбовете на
// камъните, зърното на асфалта. Наклонът на този детайл дава нормалата.
// Смята се на видеокартата веднъж, при зареждането.

import * as THREE from 'three';

// Текстура → сила на релефа. Каквото не е тук, остава гладко.
const RELIEF = [
  [/^(ciotoli|spietrini)/i, 3.2],                  // паваж
  [/^(brkrun|muropiazza|portacitta)/i, 2.6],       // тухли и зид
  [/^st_roof/i, 2.3],                              // керемиди
  [/^(cassalegno|staccionata|recinto)/i, 1.8],     // дърво
  [/^(erba|sabbia)/i, 2.0],                        // трева и пясък
  [/^(cemento|marciapiede)/i, 1.5],                // бетон и тротоар
  [/^tunnelpareti/i, 1.0],
  [/^(binari|metallo)/i, 1.2],
  [/^(asfalto|strada)/i, 1.4],                     // асфалт
  [/^(casa|capannone|chies|cinema|cityfacade|hotel|st_|stazione|store|windows)/i, 1.0],
];

const MAX_SIZE = 512;        // по-голямо не си личи, а тежи

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  precision highp float;
  uniform sampler2D source;
  uniform vec2 texel;
  uniform float strength;
  uniform float blurLod;
  varying vec2 vUv;

  // Финият детайл: картината минус размазаната картина.
  float detail(vec2 uv) {
    float sharp = dot(textureLod(source, uv, 0.0).rgb, vec3(0.2126, 0.7152, 0.0722));
    float soft = dot(textureLod(source, uv, blurLod).rgb, vec3(0.2126, 0.7152, 0.0722));
    return sharp - soft;
  }

  void main() {
    float l = detail(vUv - vec2(texel.x, 0.0));
    float r = detail(vUv + vec2(texel.x, 0.0));
    float d = detail(vUv - vec2(0.0, texel.y));
    float u = detail(vUv + vec2(0.0, texel.y));
    vec3 n = normalize(vec3((l - r) * strength, (d - u) * strength, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`;

/**
 * Прави карти на нормалите за всички повърхности под `root` и ги слага по
 * материалите. Връща превключвател за силата.
 */
export function applyNormals(renderer, root) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      source: { value: null },
      texel: { value: new THREE.Vector2() },
      strength: { value: 8 },
      blurLod: { value: 3 },
    },
    vertexShader, fragmentShader, depthTest: false, depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  const maps = new Map();          // текстура → карта на нормалите
  const done = new Set();
  const list = [];
  const before = renderer.getRenderTarget();

  root.traverse(o => {
    if (!o.isMesh || o.userData.unlit || o.userData.generated) return;
    for (const m of [].concat(o.material)) {
      if (!m || !m.isMeshStandardMaterial || !m.map || done.has(m)) continue;
      const rule = RELIEF.find(([test]) => test.test(m.map.name || ''));
      if (!rule) continue;
      done.add(m);
      const image = m.map.image;
      if (!image) continue;
      if (!maps.has(m.map)) {
        const k = Math.min(1, MAX_SIZE / Math.max(image.width, image.height));
        const w = Math.max(4, Math.round(image.width * k));
        const h = Math.max(4, Math.round(image.height * k));
        const target = new THREE.WebGLRenderTarget(w, h, {
          minFilter: THREE.LinearMipmapLinearFilter,
          magFilter: THREE.LinearFilter,
          generateMipmaps: true,
          wrapS: m.map.wrapS,
          wrapT: m.map.wrapT,
          depthBuffer: false,
          stencilBuffer: false,
        });
        material.uniforms.source.value = m.map;
        material.uniforms.texel.value.set(1 / w, 1 / h);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        target.texture.wrapS = m.map.wrapS;
        target.texture.wrapT = m.map.wrapT;
        target.texture.anisotropy = m.map.anisotropy;
        target.texture.needsUpdate = true;
        maps.set(m.map, target.texture);
      }
      m.normalMap = maps.get(m.map);
      m.normalScale = new THREE.Vector2(rule[1], rule[1]);
      m.userData.reliefStrength = rule[1];
      m.needsUpdate = true;
      list.push(m);
    }
  });
  renderer.setRenderTarget(before);

  return {
    materials: list.length,
    textures: maps.size,
    /** Силата на релефа (0 го изключва). */
    setScale(k) {
      for (const m of list) m.normalScale.set(m.userData.reliefStrength * k, m.userData.reliefStrength * k);
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Фин детайл по земята.
//
// Текстурите на пътя и тротоара са разпънати по цели улици — зърното им
// излиза едро на екрана и асфалтът изглежда гладък. Затова отгоре им се
// слага ситно зърно, вързано за света, а не за текстурата: повтаря се на
// всеки DETAIL_TILE метра и се вижда само отблизо, пред колата.

const DETAIL_TILE = 0.6;      // метра между две повторения
const DETAIL_NEAR = 30, DETAIL_FAR = 110;
const DETAIL_STRENGTH = 1.9;

function detailTexture(renderer) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  // Периодичен шум: решетка от случайни стойности, която се увива.
  const grid = 32;
  const rnd = new Float32Array(grid * grid);
  let seed = 1;
  for (let i = 0; i < rnd.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    rnd[i] = seed / 4294967296;
  }
  const at = (x, y) => rnd[((y % grid) + grid) % grid * grid + (((x % grid) + grid) % grid)];
  const smooth = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(xi, yi), b = at(xi + 1, yi), c2 = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a + (b - a) * sx) + ((c2 + (d - c2) * sx) - (a + (b - a) * sx)) * sy;
  };
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let h = 0, f = 8, amp = 0.5;
      for (let o = 0; o < 4; o++) {
        h += smooth(x / S * f, y / S * f) * amp;
        f *= 2; amp *= 0.72;          // финото зърно остава силно
      }
      height[y * S + x] = h;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = height[y * S + (x + S - 1) % S], r = height[y * S + (x + 1) % S];
      const d = height[((y + S - 1) % S) * S + x], u = height[((y + 1) % S) * S + x];
      const nx = (l - r) * 14, ny = (d - u) * 14;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * S + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  // Земята се гледа под остър ъгъл — без това зърното се размазва в далечината.
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/**
 * Слага финото зърно по настилките (`materials` — от world.groundMaterials()).
 * Връща превключвател за силата.
 */
export function applyGroundDetail(renderer, materials) {
  const map = { value: detailTexture(renderer) };
  const strength = { value: DETAIL_STRENGTH };
  for (const m of materials) {
    if (!m || !m.isMeshStandardMaterial || m.userData.detail) continue;
    m.userData.detail = true;
    const before = m.onBeforeCompile;
    m.onBeforeCompile = shader => {
      before?.(shader);
      shader.uniforms.detailMap = map;
      shader.uniforms.detailStrength = strength;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvDetailPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vDetailPos;
          uniform sampler2D detailMap;
          uniform float detailStrength;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            float near = 1.0 - smoothstep(${DETAIL_NEAR.toFixed(1)}, ${DETAIL_FAR.toFixed(1)}, length(vViewPosition));
            if (near > 0.0 && detailStrength > 0.0) {
              // Зърното ляга по земята: осите му са световните X и Y.
              // Тук normal е в пространството на камерата, затова и те
              // минават през viewMatrix.
              vec2 uv = vDetailPos.xy / ${DETAIL_TILE.toFixed(2)};
              vec3 d = texture2D(detailMap, uv).xyz * 2.0 - 1.0;
              vec3 ax = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
              vec3 ay = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
              normal = normalize(normal + (ax * d.x + ay * d.y) * near * detailStrength * 0.7);
            }
          }`);
    };
    m.customProgramCacheKey = () => 'ground-detail';
    m.needsUpdate = true;
  }
  return {
    count: materials.length,
    setScale(k) { strength.value = DETAIL_STRENGTH * k; },
  };
}
