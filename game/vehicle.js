// Общото тяло на колите — това, което в оригинала върши Havok.
//
// Всеки импулс в скриптовете е от вида `нещо * mass`, затова при делението на
// масата остава чиста добавка към скоростта и физичен двигател не е нужен.
// Тук са само интегрирането и допирът със света; управлението е в наследниците
// (car.js за играча, chaser.js за преследвача).

import * as THREE from 'three';
import { GRAVITY, INERTIA, RIDE_HEIGHT, RESTITUTION,
         GROUND_FRICTION, SPIN_FRICTION } from './params.js?v=167';

export const FORWARD = new THREE.Vector3(1, 0, 0);   // G.forward
export const UP = new THREE.Vector3(0, 0, 1);        // G.up
const IDENTITY = new THREE.Quaternion();

// Оригиналът пуска лъча към земята право от началото на модела, защото
// кутията на Havok сама държи колата върху повърхността. Тук няма такава
// кутия, затова лъчът тръгва малко по-нависоко: иначе, щом пътят се вдигне
// (рампа, бордюр), началото на колата остава под настилката, лъчът минава
// под нея и колата пропада. Вдигането е под височината на колата, за да не
// се качва по стени.
const PROBE_LIFT = 1.5;
const ALIGN_RATE = 0.15;   // част от наклона, която се наваксва за една стъпка

export class Vehicle {
  constructor(world, size) {
    this.world = world;
    this.size = size;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.angularVelocity = new THREE.Vector3();

    this.height = 9999;                       // pheight
    this.objectUnder = '';                    // pObjectUnder
    this.contact = null;                      // pContact
    this.normal = new THREE.Vector3(0, 0, 1); // pNormal
    this.speed = 0;                           // pCurrentSpeed
    this.slideSpeed = 0;                      // pSlideSpeed
    this.fallSpeed = 0;                       // pFallSpeed

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  placeAt(position, headingRad) {
    // Предпазител: сентинелът 9999 за „няма земя" не бива да става координата.
    if (!Number.isFinite(position.z) || Math.abs(position.z) > 4000) {
      position = position.clone().setZ(0);
    }
    this.position.copy(position);
    this.quaternion.setFromAxisAngle(UP, headingRad);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  get forwardVector() { return this._fwd.copy(FORWARD).applyQuaternion(this.quaternion); }
  get upVector() { return this._axis.copy(UP).applyQuaternion(this.quaternion); }
  get radius() { return Math.max(this.size.width, this.size.length) / 2; }

  /** Осевите вектори на колата, както ги смята driveController. */
  axes() {
    const fwd = this._fwd.copy(FORWARD).applyQuaternion(this.quaternion);
    const axis = this._axis.copy(UP).applyQuaternion(this.quaternion);
    const right = this._right.copy(fwd).cross(axis);
    return { fwd, axis, right };
  }

  addAngular(axis, amount) {
    this.angularVelocity.addScaledVector(axis, amount / INERTIA);
  }

  /** Лъч отвесно надолу; height е височината спрямо началото на колата. */
  groundHit() {
    const from = this._tmp.copy(this.position);
    from.z += PROBE_LIFT;
    const hit = this.world.probeDown(from, PROBE_LIFT + 30);
    if (hit) hit.height = hit.distance - PROBE_LIFT;
    return hit;
  }

  probeGround() {
    const hit = this.groundHit();
    if (!hit) {
      this.contact = null;
      this.objectUnder = '';
      this.height = 9999;
      return null;
    }
    this.objectUnder = hit.name;
    this.contact = hit.point;
    this.normal.copy(hit.normal);
    this.height = hit.height;
    return hit;
  }

  integrate(dt) {
    this.velocity.z += GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    const w = this.angularVelocity;
    const wLen = w.length();
    if (wLen > 1e-6) {
      const q = new THREE.Quaternion().setFromAxisAngle(
        this._tmp.copy(w).divideScalar(wLen), wLen * dt);
      this.quaternion.premultiply(q).normalize();
    }
  }

  /** Триене от допира със земята — това, което Havok е вършел вместо нас. */
  groundFriction(dt) {
    const { right } = this.axes();
    const lateral = this.velocity.dot(right);
    const drop = GROUND_FRICTION * -GRAVITY * dt;
    if (lateral !== 0) {
      const reduce = Math.sign(lateral) * Math.min(Math.abs(lateral), drop);
      this.velocity.addScaledVector(right, -reduce);
    }
    this.angularVelocity.multiplyScalar(1 - SPIN_FRICTION);
  }

  /** Връща скоростта на удара в земята, ако е имало такъв. */
  resolveGround() {
    const hit = this.groundHit();
    this.grounded = false;
    if (!hit) { this.height = 9999; return 0; }
    this.height = hit.height;
    if (hit.height >= RIDE_HEIGHT) return 0;

    this.position.z += RIDE_HEIGHT - hit.height;
    this.height = RIDE_HEIGHT;

    // Гасим само скоростта навътре в повърхността — импулсът на подскока
    // е нагоре и трябва да оцелее.
    let impact = 0;
    const into = this.velocity.dot(hit.normal);
    if (into < 0) {
      impact = -into;
      this.velocity.addScaledVector(hit.normal, -into);
    }

    // Лягане по наклона на настилката — по малко на стъпка, за да не трепти.
    const align = new THREE.Quaternion().setFromUnitVectors(this.upVector, hit.normal);
    align.slerp(IDENTITY, 1 - ALIGN_RATE);
    this.quaternion.premultiply(align).normalize();

    this.groundName = hit.name;
    this.grounded = true;
    return impact;
  }

  /** Хоризонтални лъчи по четирите страни — заместват кутията на Havok. */
  resolveObstacles() {
    const fwd = this.forwardVector.clone().setZ(0).normalize();
    const right = new THREE.Vector3(fwd.y, -fwd.x, 0);
    const half = { f: this.size.length / 2, r: this.size.width / 2 };
    const probes = [
      [fwd, half.f], [fwd.clone().negate(), half.f],
      [right, half.r], [right.clone().negate(), half.r],
    ];

    const impacts = [];
    for (const [dir, reach] of probes) {
      const origin = this._tmp.copy(this.position);
      origin.z += this.size.height;
      const hit = this.world.raycast(origin, dir, reach + 0.5);
      if (!hit) continue;
      if (Math.abs(hit.normal.z) > 0.7) continue;      // това е под, не стена

      const n = hit.normal.clone().setZ(0).normalize();
      const push = reach - hit.distance;
      if (push > 0) this.position.addScaledVector(n, push);

      const vn = this.velocity.dot(n);
      if (vn < 0) {
        this.velocity.addScaledVector(n, -vn * (1 + RESTITUTION));
        impacts.push({ name: hit.name, speed: -vn });
      }
    }
    return impacts;
  }
}
