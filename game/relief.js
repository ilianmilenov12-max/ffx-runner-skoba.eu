// Вдлъбнати прозорци по фасадите (parallax occlusion mapping).
//
// Сградите са кутии с нарисувани прозорци — гладки стени. Тук за всеки
// пиксел се проследява лъчът от камерата навътре в стената, докато не удари
// дъното на прозореца. Прозорците се разместват спрямо стената, докато
// минаваш покрай тях, виждат се страниците на нишата и слънцето хвърля сянка
// вътре. Геометрията не се пипа.
//
// Къде е прозорец се знае предварително: tools/windows.py ги намира по
// текстурите като правоъгълници и ги записва като маски в assets/masks/.
// (Да се гадае дълбочината направо от снимката не става — петната и фугите
// стават дупки и фасадата се набраздява.)
//
// Допирателното пространство се смята от производните на екрана: моделите
// нямат tangent-и, а и не им трябват — стените са плоски.

import * as THREE from 'three';

const DEPTH = 0.95;                     // дълбочина на нишата, фута
const FADE_FROM = 110, FADE_TO = 240;    // по-далеч нишите се изглаждат
const STEPS = 14;
const SHADOW = 0.55;                    // колко тъмно е в засенчената ниша

const pars = /* glsl */`
uniform float reliefDepth;
uniform sampler2D reliefMask;
uniform vec3 reliefLight;        // посока към слънцето, в пространството на камерата

// 0 — стената, 1 — дъното на прозореца.
float reliefAt(vec2 uv, vec2 gx, vec2 gy) {
  return textureGrad(reliefMask, uv, gx, gy).r;
}

vec2 reliefUv(vec2 uv, vec2 gx, vec2 gy, out float shade) {
  shade = 1.0;
  float fade = 1.0 - smoothstep(${FADE_FROM.toFixed(1)}, ${FADE_TO.toFixed(1)}, length(vViewPosition));
  if (reliefDepth <= 0.0 || fade <= 0.0) return uv;

  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  float det = gx.x * gy.y - gx.y * gy.x;
  if (abs(det) < 1e-14) return uv;
  vec3 dPdu = (gy.y * q0 - gx.y * q1) / det;
  vec3 dPdv = (gx.x * q1 - gy.x * q0) / det;
  float uu = dot(dPdu, dPdu), uw = dot(dPdu, dPdv), ww = dot(dPdv, dPdv);
  float g = uu * ww - uw * uw;
  if (g < 1e-14) return uv;

  vec3 N = normalize(cross(q0, q1));
  vec3 V = normalize(vViewPosition);
  if (dot(N, V) < 0.0) N = -N;
  // Докъде се измества по стената лъч, слязъл до дъното на нишата.
  // Почти успоредно на стената нишата се сплесква: иначе прозорците се
  // разтеглят на дълги процепи — там тази сметка не може да е вярна.
  float vn = max(dot(V, N), 0.25);
  float depthNow = reliefDepth * fade * mix(0.5, 1.0, smoothstep(0.15, 0.55, vn));
  vec3 L = (N - V / vn) * depthNow;
  vec2 full = vec2(ww * dot(L, dPdu) - uw * dot(L, dPdv),
                   uu * dot(L, dPdv) - uw * dot(L, dPdu)) / g;

  // Далече стъпките са по-малко: там нишата е няколко пиксела.
  int steps = int(mix(6.0, float(${STEPS}), fade));
  float layer = 1.0 / float(steps);
  vec2 stepUv = full * layer;
  vec2 cur = uv;
  float d = 0.0;
  float h = reliefAt(cur, gx, gy);
  for (int i = 0; i < ${STEPS}; i++) {
    if (i >= steps || d >= h) break;
    cur += stepUv;
    d += layer;
    h = reliefAt(cur, gx, gy);
  }
  // Точката на удара — между последните две стъпки.
  vec2 prev = cur - stepUv;
  float after = h - d;
  float before = reliefAt(prev, gx, gy) - (d - layer);
  float w = clamp(after / (after - before + 1e-5), 0.0, 1.0);
  vec2 hit = mix(cur, prev, w);
  float depth = mix(d, d - layer, w);

  // В нишата е по-тъмно, а слънцето хвърля сянка в нея: от точката на удара
  // се тръгва към слънцето и се гледа дали стената я закрива.
  shade = 1.0 - 0.25 * depth;
  float ln = dot(reliefLight, N);
  if (depth > 0.02 && ln > 0.08) {
    vec3 Lp = (N - reliefLight / ln) * depthNow;
    vec2 toLight = vec2(ww * dot(Lp, dPdu) - uw * dot(Lp, dPdv),
                        uu * dot(Lp, dPdv) - uw * dot(Lp, dPdu)) / g;
    float blocked = 0.0;
    for (int i = 1; i <= 4; i++) {
      float dz = depth * float(i) / 4.0;
      if (reliefAt(hit - toLight * dz, gx, gy) < depth - dz) blocked = 1.0;
    }
    shade *= mix(1.0, ${SHADOW.toFixed(2)}, blocked);
  }
  return hit;
}
`;

const mapChunk = /* glsl */`
#ifdef USE_MAP
  vec2 reliefGx = dFdx(vMapUv), reliefGy = dFdy(vMapUv);
  float reliefShade;
  vec2 reliefCoord = reliefUv(vMapUv, reliefGx, reliefGy, reliefShade);
  vec4 sampledDiffuseColor = textureGrad(map, reliefCoord, reliefGx, reliefGy);
  diffuseColor *= sampledDiffuseColor;
  diffuseColor.rgb *= reliefShade;
#endif
`;

/**
 * Слага нишите по всички фасади под `root`, за които има маска и по които
 * няма истинска геометрия. `names` е assets/masks/index.json.
 */
export function applyRelief(root, names, skip = new Set(), loader = new THREE.TextureLoader()) {
  const depth = { value: DEPTH };
  const light = { value: new THREE.Vector3(0, 0, 1) };
  const masks = new Map();
  const done = new Set();
  const used = [];

  root.traverse(o => {
    if (!o.isMesh || o.userData.unlit || o.userData.generated) return;
    for (const m of [].concat(o.material)) {
      if (!m || !m.isMeshStandardMaterial || !m.map || done.has(m)) continue;
      const name = m.map.name;
      // По фасадите с истински ниши (facade.js) шейдърът е излишен.
      if (!name || !names[name] || skip.has(name)) continue;
      done.add(m);
      if (!masks.has(name)) {
        const tex = loader.load(`assets/masks/${name}.png`);
        tex.flipY = false;                 // както текстурите от glTF
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = m.map.wrapS;
        tex.wrapT = m.map.wrapT;
        masks.set(name, tex);
      }
      const mask = { value: masks.get(name) };
      m.onBeforeCompile = shader => {
        shader.uniforms.reliefDepth = depth;
        shader.uniforms.reliefLight = light;
        shader.uniforms.reliefMask = mask;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\n' + pars)
          .replace('#include <map_fragment>', mapChunk);
      };
      m.customProgramCacheKey = () => 'relief';
      m.needsUpdate = true;
      used.push(m.map.name);
    }
  });

  return {
    materials: done.size,
    textures: masks.size,
    used,
    setEnabled(on) { depth.value = on ? DEPTH : 0; },
    /** Посоката към слънцето — за сянката вътре в нишата. */
    update(camera, sunDir) {
      light.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    },
  };
}
