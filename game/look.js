// Визията отгоре на оригинала: мъгла в далечината, остри текстури под ъгъл,
// отражения по колите и леко размазване при скорост. Нищо от това го няма
// в оригинала освен мъглата в пауза — тя е от Initialize.ls.
//
// Светът остава плосък (MeshBasicMaterial, осветлението е нарисувано в
// текстурите), затова отраженията пипат само колите.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const LOOK = {
  // Мъглата скрива края на града и кварталите, които изскачат при смяна на
  // зоната. Цветът е този на небето при хоризонта, за да се слее с него.
  fogColor: 0xb7c8da,
  fogNear: 170,
  fogFar: 620,
  // Initialize.ls, в пауза: fog.decayMode = #exponential, far = 200,
  // color = rgb(192, 192, 192). При far 200 мъглата е почти плътна.
  pauseFogColor: 0xc0c0c0,
  pauseFogDensity: 0.0087,

  // Размазването расте от blurFrom до blurTo ft/s, с извивка нагоре, за да
  // се усеща още от средна скорост. При пределните 57 е ясно, с нитро — силно.
  blurFrom: 20,
  blurTo: 90,
  blurMax: 0.075,
  blurCurve: 0.7,
  // При завой кадърът се размазва и настрани, по ъгловата скорост на колата.
  turnBlur: 0.012,
  // С колко градуса се разширява кадърът при най-голяма скорост.
  fovKick: 6,

  saturation: 1.08,
  vignette: 0.35,
};

const AO_SCALE = 0.5;       // затъмняването в ъглите — на половин резолюция

// Радиално размазване към центъра на кадъра: колата и пътят точно пред нея
// остават чисти, краищата се размиват. Плюс лека наситеност и винетка.
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
    turn: { value: 0 },
    center: { value: new THREE.Vector2(0.5, 0.42) },
    saturation: { value: LOOK.saturation },
    vignette: { value: LOOK.vignette },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float turn;
    uniform vec2 center;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - center;
      float dist = length(dir);
      float edge = smoothstep(0.06, 0.55, dist);
      float amount = strength * edge;
      vec2 side = vec2(turn * edge, 0.0);
      vec4 sum = vec4(0.0);
      for (int i = 0; i < 16; i++) {
        float t = float(i) / 15.0 - 0.5;
        sum += texture2D(tDiffuse, vUv - (dir * amount + side) * t);
      }
      vec4 col = sum / 16.0;
      float l = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
      col.rgb = mix(vec3(l), col.rgb, saturation);
      col.rgb *= mix(1.0, smoothstep(0.95, 0.3, dist), vignette);
      gl_FragColor = col;
    }
  `,
};

export class Look {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.fog = new THREE.Fog(LOOK.fogColor, LOOK.fogNear, LOOK.fogFar);
    this.pauseFog = new THREE.FogExp2(LOOK.pauseFogColor, LOOK.pauseFogDensity);
    scene.fog = this.fog;

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(scene, camera));
    // Затъмняване в ъглите и под колите (ambient occlusion) — дава дълбочина
    // на плоския град. Скъпо е, затова е в настройките.
    this.aoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
    this.aoPass.blendIntensity = 0.85;
    this.aoPass.updateGtaoMaterial({ radius: 3.5, distanceExponent: 1.4, thickness: 2, scale: 1 });
    // Затъмняването е меко — смята се на половин резолюция (в CSS пиксели),
    // иначе на Retina екран изяжда три четвърти от кадрите.
    const aoSetSize = this.aoPass.setSize.bind(this.aoPass);
    this.aoPass.setSize = () => aoSetSize(Math.round(innerWidth * AO_SCALE), Math.round(innerHeight * AO_SCALE));
    this.aoPass.setSize();
    this.composer.addPass(this.aoPass);
    // Светлините (сияния, петна от лампите) не са предмети — ако влязат в
    // сметката за затъмняването, около тях излизат тъмни квадрати.
    this.aoIgnore = [];
    const aoRender = this.aoPass.render.bind(this.aoPass);
    this.aoPass.render = (...args) => {
      const shown = this.aoIgnore.filter(o => o.visible);
      shown.forEach(o => { o.visible = false; });
      aoRender(...args);
      shown.forEach(o => { o.visible = true; });
    };
    // Сиянието около светлините: фаровете, лампите, слънцето. Прагът е над
    // най-светлата осветена стена — иначе целият кадър „мъгливее".
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.15, 0.4, 1.5);
    this.composer.addPass(this.bloomPass);
    this.speedPass = new ShaderPass(SpeedShader);
    this.composer.addPass(this.speedPass);
    this.composer.addPass(new OutputPass());

    this.kick = 0;          // разширението на кадъра, изгладено
    this.blurOn = true;     // настройките в паузата
    this.fogOn = true;
  }

  /** Небето не се замъглява — то е фонът, в който мъглата се губи. */
  keepClear(object) {
    if (!object) return;
    object.traverse(c => {
      if (!c.isMesh) return;
      for (const m of [].concat(c.material)) if (m) m.fog = false;
    });
  }

  /** Острите текстури под ъгъл: асфалтът и тротоарите в далечината. */
  sharpen(root) {
    const max = this.renderer.capabilities.getMaxAnisotropy();
    const seen = new Set();
    root.traverse(c => {
      if (!c.isMesh) return;
      for (const m of [].concat(c.material)) {
        const t = m && m.map;
        if (!t || seen.has(t)) continue;
        seen.add(t);
        t.anisotropy = max;
        t.needsUpdate = true;
      }
    });
  }

  /** Лак по колите: отражения от небето (scene.environment в atmosphere.js). */
  polishCars(root) {
    root.traverse(c => {
      if (!c.isMesh) return;
      c.castShadow = true;
      for (const m of [].concat(c.material)) {
        if (!m || !m.isMeshStandardMaterial) continue;
        m.envMapIntensity = 0.9;
        m.roughness = Math.min(m.roughness ?? 1, 0.45);
        m.metalness = Math.max(m.metalness ?? 0, 0.15);
        m.needsUpdate = true;
      }
    });
  }

  resize() {
    this.composer.setSize(innerWidth, innerHeight);
  }

  setBloom(strength) { this.bloomPass.strength = strength; }
  setAO(on) { this.aoPass.enabled = on; }

  /** Всеки кадър: мъглата според паузата, размазването и кадърът според
   *  скоростта. В неподвижните сцени нито едното, нито другото. */
  update(speed, { paused, inShot, baseFov, yawRate = 0 }) {
    this.scene.fog = paused ? this.pauseFog : (this.fogOn ? this.fog : null);

    const lin = THREE.MathUtils.clamp((speed - LOOK.blurFrom) / (LOOK.blurTo - LOOK.blurFrom), 0, 1);
    const s = inShot || !this.blurOn ? 0 : Math.pow(lin, LOOK.blurCurve);
    this.speedPass.uniforms.strength.value = s * LOOK.blurMax;
    const turn = inShot || !this.blurOn ? 0 : THREE.MathUtils.clamp(yawRate, -3, 3) * LOOK.turnBlur * Math.min(1, speed / 40);
    this.speedPass.uniforms.turn.value += (turn - this.speedPass.uniforms.turn.value) * 0.3;
    this.kick += (s * LOOK.fovKick - this.kick) * 0.1;
    const fov = baseFov + (inShot ? 0 : this.kick);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    this.composer.render();
  }
}
