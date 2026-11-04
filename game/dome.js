// Небе с преливане: зенит → хоризонт → земя, сияние около слънцето (или
// луната) и облаци. За разлика от физическото небе (vendor-sky.js) цветовете
// тук са точно тези, които са зададени — затова от него са отраженията и
// небето при залез, нощ и дъжд, където физическото изгаря или е черно.

import * as THREE from 'three';

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = world.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_Position.z = gl_Position.w;   // винаги най-отзад
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float glow;
  uniform float disc;
  uniform float discSize;
  uniform float clouds;
  uniform vec3 cloudLit;
  uniform vec3 cloudDark;
  uniform float time;
  varying vec3 vDir;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2) + time * 0.004 * float(i + 1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.z;
    vec3 col = h > 0.0
      ? mix(horizon, zenith, pow(h, 0.55))
      : mix(horizon, ground, pow(min(-h * 4.0, 1.0), 0.6));

    float d = max(dot(dir, sunDir), 0.0);
    vec3 sun = sunColor * (glow * (pow(d, 5.0) * 0.35 + pow(d, 48.0)));
    float sunDisc = smoothstep(1.0 - discSize, 1.0 - discSize * 0.6, d) * disc;

    if (clouds > 0.0 && h > 0.0) {
      vec2 uv = dir.xy / (h + 0.12) * 1.6 + vec2(time * 0.006, time * 0.002);
      float n = fbm(uv);
      float mask = smoothstep(1.0 - clouds, 1.0 - clouds + 0.35, n) * smoothstep(0.0, 0.18, h);
      float light = clamp(0.35 + (n - 0.5) * 1.4 + pow(d, 4.0) * 0.5, 0.0, 1.0);
      vec3 cloud = mix(cloudDark, cloudLit, light) + sunColor * glow * pow(d, 8.0) * 0.25;
      col = mix(col, cloud, mask);
      sun *= 1.0 - mask * 0.8;
      sunDisc *= 1.0 - mask;
    }
    col += sun + sunColor * sunDisc;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Dome extends THREE.Mesh {
  constructor(size = 900) {
    super(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        ground: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 0, 1) },
        sunColor: { value: new THREE.Color() },
        glow: { value: 0 },
        disc: { value: 0 },
        discSize: { value: 0.0006 },
        clouds: { value: 0 },
        cloudLit: { value: new THREE.Color() },
        cloudDark: { value: new THREE.Color() },
        time: { value: 0 },
      },
      vertexShader, fragmentShader,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.scale.setScalar(size);
    this.frustumCulled = false;
    this.renderOrder = -10;
  }

  /** Палитра: { zenith, horizon, ground, glow, disc, clouds, cloudLit, cloudDark }. */
  set(p, sunDir, sunColor, { clouds = true } = {}) {
    const u = this.material.uniforms;
    u.zenith.value.set(p.zenith);
    u.horizon.value.set(p.horizon);
    u.ground.value.set(p.ground);
    u.sunDir.value.copy(sunDir).normalize();
    u.sunColor.value.set(sunColor);
    u.glow.value = p.glow ?? 0;
    u.disc.value = p.disc ?? 0;
    u.discSize.value = p.discSize ?? 0.0006;
    u.clouds.value = clouds ? p.clouds ?? 0 : 0;
    u.cloudLit.value.set(p.cloudLit ?? p.horizon);
    u.cloudDark.value.set(p.cloudDark ?? p.zenith);
  }

  set time(t) { this.material.uniforms.time.value = t; }
}
