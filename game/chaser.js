// Преследвачът — пренесен "BehaviorScript 35 - PallaDaBowlingCPU2".
//
// Черният джип не кара по път и не търси маршрут: той се лепи за играча и се
// опитва да го удари отстрани. Като го изгуби от поглед за 8 секунди, се маха
// от сцената и се появява отново точно зад камерата, за да е винаги наблизо.
// Името в оригинала е „топка за боулинг" и описва точно това, което прави.

import * as THREE from 'three';
import { CPU, CAR_SIZE, TIMESTEP } from './params.js?v=168';
import { Vehicle, UP } from './vehicle.js?v=168';

const DEG = 180 / Math.PI;

// Целите, към които се цели при атака: две кутийки, закачени отстрани на
// колата на играча, които се люлеят настрани ("BehaviorScript 25 - Target").
const TARGET_PERIOD = 3;
const TARGET_AMPLITUDE = 2;
const TARGET_OFFSET = 0.25 + TARGET_AMPLITUDE;

// Ако играчът не тръгне по правата улица към надлеза, условието на
// оригинала (y > -830) никога не се изпълнява — тогава джипът тръгва сам.
const AMBUSH_PATIENCE = 10;     // секунди, откакто играчът се движи

export class Chaser extends Vehicle {
  constructor(world, player, camera, params = CPU) {
    super(world, { width: CAR_SIZE.width * 1.15, length: CAR_SIZE.length * 1.35,
                   height: CAR_SIZE.height * 1.6 });
    this.player = player;
    this.camera = camera;
    this.cpu = params;          // CPU или CPU3 — двата джипа карат с различни числа

    this.status = 'agguato1';        // aiStatus
    this.action = 'waitingForAction';// aiAction
    this.statusChanged = 0;          // aiLastStatusChange
    this.actionChanged = 0;          // aiLastActionChange
    this.initialSide = null;         // aiInitialLato
    this.hiddenSince = null;         // pHidden
    this.fullRetro = false;
    this.inGarage = false;
    this.lookAt = new THREE.Vector3();
    this.targetName = null;          // коя от двете странични цели гони

    this.input = { forward: 0, backward: 0, left: 0, right: 0, brake: 0 };
    this.touchingPlayer = false;     // допира ли се до играча в момента
    this.playerMovingSince = null;   // откога играчът се движи, за търпението
  }

  step(dt, simTime) {
    this.clock = simTime;   // за targetPosition: по времето на симулацията, не на браузъра
    // В гаража колата е извън сцената: в оригинала Havok я държи неподвижна,
    // тук просто не я симулираме — иначе пада през света, защото под точката
    // на гаража няма настилка.
    if (this.inGarage) { this.checkAction(simTime); return; }

    this.probeGround();

    // Ако под колата няма нищо чак до 30 фута, зоната ѝ още не е заредена —
    // тогава тя стои, вместо да пада през света. При скок настилката е далеч
    // по-близо от този праг, така че истинските полети не се засягат.
    if (this.height > 900) { this.driveController(simTime); return; }

    this.driveController(simTime);
    this.integrate(dt);
    this.resolveGround();
    if (this.grounded) this.groundFriction(dt);
    for (const hit of this.resolveObstacles()) this.onCollision(hit.name, simTime);
    this.clampTilt();
  }

  // --- driveController ---------------------------------------------------

  driveController(simTime) {
    if (this.action === 'waitingForAction') { this.checkAction(simTime); return; }

    if (simTime - this.actionChanged > 1) this.checkAction(simTime);
    this.performAction(simTime);

    if (this.height >= this.cpu.maxHeight) return;

    const { fwd, axis, right } = this.axes();
    const vel = this.velocity;
    this.speed = vel.dot(fwd);
    this.slideSpeed = vel.dot(right);
    const w = this.angularVelocity;

    if (this.input.forward) {
      vel.addScaledVector(fwd, (this.cpu.maxSpeed - this.speed) * this.cpu.accGain * this.cpu.grip);
    }
    if (this.input.backward) {
      vel.addScaledVector(fwd, (-this.cpu.maxSpeed / 2 - this.speed) * this.cpu.decGain * this.cpu.grip);
    }
    if (this.input.brake) {
      vel.addScaledVector(fwd, -this.speed * this.cpu.brakeGain);
    }
    // Волана се дава пропорционално — колкото по-настрани е целта, толкова
    // по-силно завива. Тук няма таван на ъгловата скорост като при играча.
    if (this.input.left > 0) this.addAngular(axis, this.cpu.turnGain * this.input.left);
    if (this.input.right > 0) this.addAngular(axis, -this.cpu.turnGain * this.input.right);

    if (!this.input.brake) vel.addScaledVector(right, -this.slideSpeed * this.cpu.grip);
    if (!this.input.left && !this.input.right) {
      this.addAngular(axis, w.dot(axis) * -this.cpu.reTurnGain);
    }
    vel.addScaledVector(vel, -this.cpu.drag);
  }

  /** Наклонът се държи в ±30°, за да не се преобръща. */
  clampTilt() {
    const e = new THREE.Euler().setFromQuaternion(this.quaternion, 'ZYX');
    const limit = 30 / DEG;
    const x = THREE.MathUtils.clamp(e.x, -limit, limit);
    const y = THREE.MathUtils.clamp(e.y, -limit, limit);
    if (x !== e.x || y !== e.y) {
      this.quaternion.setFromEuler(new THREE.Euler(x, y, e.z, 'ZYX'));
    }
  }

  // --- решенията ---------------------------------------------------------

  changeStatus(status, simTime) {
    if (this.status === status) return;
    this.status = status;
    this.statusChanged = simTime;
    this.initialSide = null;
    this.fullRetro = false;
  }

  changeAction(action, simTime) {
    this.action = action;
    this.actionChanged = simTime;
    this.hiddenSince = null;
    if (action === 'followPlayer') this.lookAt.copy(this.player.position);
  }

  checkAction(simTime) {
    this.actionChanged = simTime;

    if (this.action === 'waitingForAction') {
      if (this.status === 'agguato1') this.ambush(simTime);
      else if (this.status === 'waiting') this.respawnBehindCamera(simTime);
      return;
    }

    // И в двата режима на преследване: изгубен ли е от поглед достатъчно дълго?
    if (this.isHidden()) {
      if (this.hiddenSince === null) this.hiddenSince = simTime;
      if (simTime - this.hiddenSince > this.cpu.waitBeforeDisappear) {
        this.changeStatus('waiting', simTime);
        this.changeAction('waitingForAction', simTime);
        this.goToGarage();
        return;
      }
    } else {
      this.hiddenSince = null;
    }

    if (this.action !== 'followPlayer') return;

    // Ако е обърнат на повече от 45° и е далеч, докато никой не го гледа,
    // просто се завърта към играча — оригиналът прави същото.
    const dir = this.lookAt.clone().sub(this.position);
    const { fwd } = this.axes();
    if (fwd.angleTo(dir) * DEG <= 45) return;
    if (this.position.distanceTo(this.lookAt) <= 20) return;
    if (!this.isHidden()) return;

    const speed = this.velocity.length();
    this.quaternion.setFromAxisAngle(UP, Math.atan2(dir.y, dir.x));
    this.velocity.copy(dir.normalize()).multiplyScalar(speed);
    this.angularVelocity.set(0, 0, 0);
    if (this.status === 'retro') this.changeStatus('Ok', simTime);
  }

  /** agguato1: чака на светофара и тръгва, щом играчът се отдалечи. */
  ambush(simTime) {
    const player = this.player.position;
    const delta = Math.min((player.x - this.position.x) / 5, 2.5);

    if (Math.abs(this.player.speed) > 20) {
      if (this.playerMovingSince === null) this.playerMovingSince = simTime;
    } else {
      this.playerMovingSince = null;
    }
    const waitedLongEnough = this.playerMovingSince !== null &&
      simTime - this.playerMovingSince > AMBUSH_PATIENCE;

    // Джипът чака горе на надлеза, в улицата, в която маршрутът завива на
    // запад. Докато играчът изкачва рампата (y между -880 и -830), той пълзи
    // по X към неговото платно; щом играчът излезе горе, тръгва насреща му.
    // Знакът на delta е горен таван само в оригинала — джипът там винаги е
    // на запад. Ограничаваме и отдолу, за да не хвърчи, ако не е.
    const step = Math.max(delta, -2.5);
    if (player.y > -830 || waitedLongEnough) {
      this.velocity.set(step / TIMESTEP, 0, 0);
      this.changeStatus('Ok', simTime);
      this.changeAction('followPlayer', simTime);
    } else if (player.y > -880) {
      this.position.x += step;
    }
  }

  /** Появява се отново на пет фута зад камерата — извън кадър. */
  respawnBehindCamera(simTime) {
    if (simTime - this.statusChanged <= this.cpu.waitBeforeAttack) return;
    if (this.player.speed <= 20) return;

    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
    const from = this.camera.position.clone().addScaledVector(back, 5);
    const hit = this.world.probeDown(from, 60);
    if (hit) {
      const n = hit.name.toLowerCase();
      if (n.includes('strada') || n.includes('marciapiede') || n.includes('sterrato')) {
        this.inGarage = false;
        this.position.copy(hit.point).setZ(hit.point.z + 0.2);
        this.quaternion.copy(this.player.quaternion);
        this.velocity.copy(this.player.velocity);
        this.angularVelocity.set(0, 0, 0);
        this.changeStatus('attack1', simTime);
        this.changeAction('followMarker', simTime);
        return;
      }
    }
    // Мястото не става — опитва пак след секунда, вместо след още осем.
    this.statusChanged = simTime - (this.cpu.waitBeforeAttack - 1);
  }

  goToGarage() {
    this.inGarage = true;
    this.position.set(-10, -10, 1);
    this.quaternion.identity();
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  /** Извън кадър ли е? Оригиналът пробва четирите края на обхващащата сфера. */
  isHidden() {
    const r = this.radius;
    for (const d of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const p = this.position.clone();
      p.x += d[0]; p.y += d[1];
      p.project(this.camera);
      if (p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1 && p.z >= -1 && p.z <= 1) return false;
    }
    return true;
  }

  // --- управлението на волана и газта -------------------------------------

  performAction(simTime) {
    if (this.action === 'followPlayer') this.chase(simTime);
    else if (this.action === 'followMarker') this.ram(simTime);
  }

  chase(simTime) {
    this.lookAt.copy(this.player.position);
    const { fwd, right } = this.axes();
    const dir = this.lookAt.clone().sub(this.position).normalize();
    const side = right.dot(dir);
    const ang = fwd.angleTo(dir) * DEG;
    if (this.initialSide === null) this.initialSide = Math.sign(side);

    if (this.status === 'retro') {
      this.input.forward = 0;
      this.input.brake = 0;
      if (simTime - this.statusChanged < 1.5) {
        this.input.backward = 1;
        if (!this.fullRetro && Math.sign(side) === this.initialSide) {
          this.input.right = Math.max(side, 0);
          this.input.left = Math.max(-side, 0);
        }
        return;
      }
      this.input.backward = 0;
      this.input.right = 0;
      this.input.left = 0;
      this.changeStatus('Ok', simTime);
      return;
    }

    // Завива само докато целта остава от същата страна, от която е тръгнал —
    // иначе спира волана и изчаква да се преподреди. Това е, което създава
    // характерното люлеене на джипа зад теб.
    if (Math.sign(side) === this.initialSide) {
      this.input.right = Math.max(side, 0);
      this.input.left = Math.max(-side, 0);
    } else {
      this.input.right = 0;
      this.input.left = 0;
      this.initialSide = null;
      this.angularVelocity.set(0, 0, 0);
    }
    this.input.brake = 0;
    this.input.backward = 0;

    if (ang < 45) {
      this.input.forward = 1;
    } else if (this.position.distanceTo(this.lookAt) > 100) {
      this.input.forward = this.speed < 20 ? 1 : 0;
    } else if (ang < 90) {
      this.input.forward = this.speed < 10 ? 1 : 0;
    } else {
      this.changeStatus('retro', simTime);
    }
  }

  /** attack1–3: цели се в страничните кутийки и се движи заедно с играча. */
  ram(simTime) {
    const { fwd, right } = this.axes();

    let target = this.targetPosition('right');
    let dir = target.clone().sub(this.position).normalize();
    let side = right.dot(dir);
    const ang = fwd.angleTo(dir) * DEG;

    if (this.status === 'attack1') {
      const other = this.targetPosition('left');
      const otherDir = other.clone().sub(this.position).normalize();
      const otherSide = right.dot(otherDir);
      if (Math.abs(otherSide) < Math.abs(side)) {
        this.targetName = 'left';
        side = otherSide;
      } else {
        this.targetName = 'right';
      }
    } else if (this.targetName) {
      target = this.targetPosition(this.targetName);
      dir = target.clone().sub(this.position).normalize();
      side = right.dot(dir);
    }

    // Изравнява се с играча: взема половината от неговата скорост по
    // водещата ос и неговата ъглова скорост около Z.
    if (Math.abs(fwd.x) > Math.abs(fwd.y)) {
      this.velocity.x = (this.velocity.x + this.player.velocity.x) / 2;
    } else {
      this.velocity.y = (this.velocity.y + this.player.velocity.y) / 2;
    }
    this.angularVelocity.z = this.player.angularVelocity.z;

    // Докато е зад играча, догонва (виж CPU.attackCatchUp).
    const pf = this.player.forwardVector;
    const behind = (this.player.position.x - this.position.x) * pf.x +
                   (this.player.position.y - this.position.y) * pf.y;
    if (behind > 2 && this.cpu.attackCatchUp) {
      const want = this.player.velocity.dot(fwd) + this.cpu.attackCatchUp;
      const now = this.velocity.dot(fwd);
      if (now < want) this.velocity.addScaledVector(fwd, want - now);
    }

    this.input.right = Math.max(side, 0);
    this.input.left = Math.max(-side, 0);

    switch (this.status) {
      case 'attack1':
        this.input.forward = 1; this.input.backward = 0; this.input.brake = 0;
        if (ang > 90) this.changeStatus('attack2', simTime);
        break;
      case 'attack2':
        this.input.forward = 1; this.input.backward = 0; this.input.brake = 0;
        if (ang > 120) this.changeStatus('attack3', simTime);
        break;
      case 'attack3':
        this.input.forward = 0; this.input.backward = 0; this.input.brake = 1;
        if (ang < 60) this.changeStatus('attack2', simTime);
        break;
    }
  }

  /** Кутийките се люлеят отстрани на играча със синус, период 3 секунди. */
  targetPosition(side) {
    const t = this.clock ?? 0;
    const delta = Math.sin(2 * Math.PI / TARGET_PERIOD * t) * TARGET_AMPLITUDE;
    const offset = side === 'right' ? -TARGET_OFFSET + delta : TARGET_OFFSET - delta;
    return new THREE.Vector3(0, offset, 0)
      .applyQuaternion(this.player.quaternion)
      .add(this.player.position);
  }

  // --- havok_callback ----------------------------------------------------

  onCollision(name, simTime) {
    // Сградите в този свят се казват Palazzo, Casazz, Capanazz… — оригиналът
    // ги разпознава просто по "azz" в името.
    if ((name || '').toLowerCase().includes('azz')) {
      switch (this.status) {
        case 'retro': this.changeStatus('Ok', simTime); break;
        case 'attack1': case 'attack2': case 'attack3':
          this.changeStatus('Ok', simTime);
          this.changeAction('followPlayer', simTime);
          break;
        case 'waiting': break;
        default: this.changeStatus('retro', simTime);
      }
    }
  }

  /** Вика се от main.js при допир с колата на играча. */
  onHitPlayer(simTime) {
    if (Math.abs(this.player.speed) < 15 && this.action === 'followPlayer') {
      this.changeStatus('retro', simTime);
      this.fullRetro = true;
    }
  }
}
