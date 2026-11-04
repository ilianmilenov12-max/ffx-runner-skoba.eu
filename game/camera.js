// Камерата — пренесен "BehaviorScript 23 - CameraTrack1".
//
// Върви зад колата с изоставане и, когато между нея и колата попадне сграда,
// минава в режим #danger: разлага движението си по трите оси и подрязва всяка
// съставка поотделно, вместо да влезе в стената.
//
// Смята се със същата стъпка като физиката (25 Hz), защото стъпките на
// изглаждане в оригинала са на кадър, а не за секунда. Затова тук се пази
// собствено състояние; камерата на сцената се насочва към него в main.js,
// интерполирано между две стъпки, за да е гладко и на 60 кадъра.

import * as THREE from 'three';
import { CAMERA } from './params.js?v=165';

const STATUS = { RELAXED: 'relaxed', WARNING: 'warning', DANGER: 'danger' };

export class ChaseCamera {
  constructor(world, car, sky) {
    this.world = world;
    this.car = car;
    this.sky = sky;

    this.offset = new THREE.Vector3(...CAMERA.offset);
    this.targetOffset = new THREE.Vector3(...CAMERA.targetOffset);

    this.position = car.position.clone().add(new THREE.Vector3(0, 0, 10));
    this.fov = CAMERA.fov;          // main.js го пренася на истинската камера
    this.quaternion = new THREE.Quaternion();

    this.oldSource = this.position.clone();
    this.oldTarget = car.position.clone();
    this.status = STATUS.RELAXED;
    this.dangerTimer = 0;

    // Небето следва колата (pSky.transform.position в оригинала); височината му
    // остава, каквато е била. Закачено е за сцената, значи е в световни координати.
    this._skyZ = sky ? sky.position.z : 0;

    this._m = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 0, 1);

    // Кинематика: оригиналът превключва към отделни камери (CameraPL1 при
    // прелеза, LastCamera накрая) и прелива към тях с Tween за три секунди
    // (`theEnd` в CameraTrack1). Самите камери не са минали през конверсията,
    // затова местата им са подбрани, но механиката е същата.
    this.shot = null;
  }

  /** theEnd: прелива от сегашното положение към зададено за `seconds`.
   *  С `offset` кадърът следва колата, вместо да стои на място — иначе при
   *  финала колата потегля и излиза извън него. */
  flyTo(position, target, seconds = 3, offset = null, fov = CAMERA.fov) {
    this.shot = {
      from: this.position.clone(), fromQ: this.quaternion.clone(),
      to: position.clone(), target: target.clone(),
      t: 0, length: seconds, offset,
      fromFov: this.fov, toFov: fov,
    };
  }

  /** Рязко отиване на фиксирана камера, без преливане. */
  cut(position, target, fov = CAMERA.fov) {
    this.flyTo(position, target, 0, null, fov);
  }

  /** Обратно зад колата. */
  /** Край на сцената. С `snap` камерата се връща зад колата веднага, както
   *  `sprite.camera = MainCamera` в оригинала; иначе би прелетяла дотам. */
  release(snap = false) {
    this.shot = null;
    this.fov = CAMERA.fov;
    if (!snap) return;
    const carPos = this.car.position;
    this.position.copy(this.offset).applyQuaternion(this.car.quaternion).add(carPos);
    this.position.z = carPos.z + this.offset.z;
    this.oldSource.copy(this.position);
    this.oldTarget.copy(carPos);
    this.status = STATUS.RELAXED;
    this._lookAt(carPos.clone().add(this.targetOffset));
  }

  get inShot() { return this.shot !== null; }

  /** Една стъпка — вика се от фиксирания цикъл, не от рисуването. */
  update(simTime, dt = 0.04) {
    const carPos = this.car.position;

    if (this.shot) {
      const s = this.shot;
      if (s.offset) {
        s.to.copy(carPos).add(s.offset);
        s.target.copy(carPos).setZ(carPos.z + 3);
      }
      s.t = Math.min(s.t + dt, s.length || 1e-6);
      const k = s.length > 0 ? s.t / s.length : 1;
      this.position.lerpVectors(s.from, s.to, k);
      this.fov = s.fromFov + (s.toFov - s.fromFov) * k;
      this._lookAt(s.target);
      // Преливането тръгва от старата ориентация и стига до новата.
      if (k < 1) this.quaternion.slerpQuaternions(s.fromQ, this.quaternion, k);
      if (this.sky) this.sky.position.set(carPos.x, carPos.y, this._skyZ);
      this.oldSource.copy(this.position);
      this.oldTarget.copy(carPos);
      return;
    }

    const desired = this.offset.clone().applyQuaternion(this.car.quaternion).add(carPos);
    let newPos = this.oldSource.clone().addScaledVector(
      desired.sub(this.oldSource), 1 / CAMERA.steps);
    newPos.z = carPos.z + this.offset.z;      // височината не се изглажда

    if (this.status === STATUS.RELAXED) {
      const dir = newPos.clone().sub(this.oldSource);
      const dist = this.oldSource.distanceTo(newPos);
      const hit = this._ray(this.oldSource, dir, dist + CAMERA.warnDistance);
      if (hit && hit.distance < dist + CAMERA.warnDistance) {
        this.status = STATUS.DANGER;
        if (hit.distance < dist + CAMERA.dangerDistance) newPos = this.oldSource.clone();
      }
      this.position.copy(newPos);
    } else {
      this._avoid(newPos, carPos, simTime);
    }

    // Точката, към която гледа, изостава още повече — така кадърът е спокоен.
    const newTarget = this.oldTarget.clone().addScaledVector(
      carPos.clone().sub(this.oldTarget), 1 / CAMERA.targetSteps);
    this._lookAt(newTarget.clone().add(this.targetOffset));

    if (this.sky) this.sky.position.set(newTarget.x, newTarget.y, this._skyZ);

    this.oldSource.copy(this.position);
    this.oldTarget.copy(carPos);
  }

  _lookAt(target) {
    this._m.lookAt(this.position, target, this._up);
    this.quaternion.setFromRotationMatrix(this._m);
  }

  /** Режимите #danger/#warning: всяка ос се подрязва отделно. */
  _avoid(newPos, carPos, simTime) {
    const delta = newPos.clone().sub(this.oldSource);
    const parts = [
      new THREE.Vector3(delta.x, 0, 0),
      new THREE.Vector3(0, delta.y, 0),
      new THREE.Vector3(0, 0, delta.z),
    ];
    const limits = [CAMERA.dangerDistance, CAMERA.dangerDistance, CAMERA.dangerUp];

    this.status = STATUS.WARNING;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const len = part.length();
      if (len < 1e-6) continue;
      const hit = this._ray(this.oldSource, part, len + limits[i]);
      if (hit && hit.distance < limits[i] + len) {
        part.normalize().multiplyScalar(hit.distance - limits[i]);
        this.status = STATUS.DANGER;
      }
    }

    if (this.status === STATUS.DANGER) {
      this.position.copy(this.oldSource).add(parts[0]).add(parts[1]).add(parts[2]);
      this.dangerTimer = simTime;
      // Ако въпреки това камерата изостане твърде много, я премятаме близо до колата.
      if (this.position.distanceTo(carPos) > 15) {
        this.oldSource.copy(this.offset).divideScalar(4)
          .applyQuaternion(this.car.quaternion).add(carPos);
        this.oldTarget.copy(carPos);
        this.position.copy(this.oldSource);
      }
    } else {
      this.position.copy(this.oldSource).add(delta);
      if (simTime - this.dangerTimer > 1) this.status = STATUS.RELAXED;
    }
  }

  _ray(origin, direction, maxDistance) {
    const len = direction.length();
    if (len < 1e-6) return null;
    return this.world.raycast(origin, direction.clone().divideScalar(len), maxDistance, true);
  }
}
