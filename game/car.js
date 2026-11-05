// Колата на играча — пренесен "BehaviorScript 33 - DriveHuman".
//
// Тялото и допирът със света са в Vehicle; тук е само управлението, така
// както е в Lingo-то: поредица от импулси, приложени на всяка стъпка от 0.04 s.

import * as THREE from 'three';
import { CAR, CAR_SIZE, DAMAGE, FEET_PER_METRE, NITRO, TIMESTEP } from './params.js?v=168';
import { SURFACE, classifySurface } from './world.js?v=168';
import { Vehicle, UP } from './vehicle.js?v=168';

export class PlayerCar extends Vehicle {
  constructor(world, state) {
    super(world, CAR_SIZE);
    this.state = state;                       // споделено: гориво, щети

    // keys е това, което държи клавиатурата; input е каквото остава след
    // правилата на getKeys и се преизчислява на всяка стъпка.
    this.keys = { forward: 0, backward: 0, left: 0, right: 0, brake: 0, nitro: 0 };
    this.input = { forward: 0, backward: 0, left: 0, right: 0, brake: 0, nitro: 0 };
    this.nitroUntil = 0;                      // докога тече текущият заряд
    this.nitroHeld = false;                   // Shift пуска по един заряд на натискане
    this.simTime = 0;

    this.surface = SURFACE.TRACK;
    this.oldSurface = SURFACE.TRACK;
    this.grip = CAR.grip;
    this.maxSpeed = CAR.maxSpeed;
    this.sgommata = 0;
    this.upsideDownSince = null;              // pUpsideDown
    this.rolloverCounted = false;             // pDanniRibaltamentoOk
    this.correctorUntil = 0;                  // pCorrector
    this.collisionWait = 0;                   // sndCollisionWait
    this.lastImpact = null;                   // за звука и HUD-а
  }

  get boosting() { return this.simTime < this.nitroUntil; }

  /** getKeys: взаимно изключващите се клавиши се гасят един друг. */
  readKeys() {
    const i = Object.assign(this.input, this.keys);
    if (i.left && i.right) { i.left = 0; i.right = 0; }
    if (i.brake || (i.forward && i.backward)) { i.forward = 0; i.backward = 0; }
  }

  /** Една стъпка на симулацията. simTime е в секунди от старта. */
  step(dt, simTime, running) {
    this.probeSurface();
    this.readKeys();
    this.simTime = simTime;

    if (running) {
      if (this.input.nitro && !this.nitroHeld && !this.boosting && this.state.nitro > 0) {
        this.state.nitro--;
        this.nitroUntil = simTime + NITRO.time;
      }
      this.nitroHeld = !!this.input.nitro;

      if (this.correctorUntil > 0) {
        if (simTime > this.correctorUntil) this.correctorUntil = 0;
      } else {
        this.consumeFuel();
        this.driveController(simTime);
      }
    }

    this.integrate(dt);
    const drop = this.resolveGround();
    if (this.grounded) this.groundFriction(dt);
    if (drop > 8) this.registerImpact(this.groundName || '', drop, true);
    for (const hit of this.resolveObstacles()) this.registerImpact(hit.name, hit.speed, false);

    if (this.collisionWait > 0) this.collisionWait--;
  }

  // --- probeGround ------------------------------------------------------

  probeSurface() {
    this.oldSurface = this.surface;
    const hit = this.probeGround();
    if (!hit) { this.grip = 0; this.inWater = false; return; }

    this.surface = classifySurface(hit.name);
    // probeGround вика aqua.perform, докато колата е във водата.
    this.inWater = hit.name.toLowerCase().includes('acqua') && this.height < CAR.maxHeight;
    switch (this.surface) {
      case SURFACE.TRACK: this.grip = CAR.trackGrip; this.maxSpeed = CAR.trackSpeed; break;
      case SURFACE.GROUND: this.grip = CAR.groundGrip; this.maxSpeed = CAR.groundSpeed; break;
      case SURFACE.GRASS: this.grip = CAR.grassGrip; this.maxSpeed = CAR.grassSpeed; break;
    }
  }

  // --- getKeys: горивото се харчи на кадър, докато се дава газ -------------

  consumeFuel() {
    if (!(this.input.forward || this.input.backward)) return;
    if (this.state.fuel > 0) {
      this.state.fuel -= 1;
    } else {
      this.input.forward = 0;
      this.input.backward = 0;
      this.state.outOfFuel = true;
    }
  }

  // --- driveController ---------------------------------------------------

  driveController(simTime) {
    const { fwd, axis, right } = this.axes();
    const vel = this.velocity;

    this.speed = vel.dot(fwd);
    this.slideSpeed = vel.dot(right);
    this.fallSpeed = vel.dot(axis);
    const propSpeed = Math.min(Math.abs(this.speed) / this.maxSpeed, 1);
    const w = this.angularVelocity;

    // Гаси въртенето около надлъжната ос, за да не се люлее колата.
    this.addAngular(fwd, w.dot(fwd) * -CAR.antiRevolution);
    const impRight = w.dot(right) * -CAR.antiRevolution;
    if (impRight < 0) this.addAngular(right, impRight);

    // Подскок при смяна на настилката.
    if (this.surface !== this.oldSurface) {
      vel.addScaledVector(axis, CAR.sobbalzo * propSpeed);
    }

    if (this.height < CAR.maxHeight) {
      let turnGain;
      if (this.input.backward && this.speed > 20) {
        this.sgommata = 1;                    // ръчна спирачка: завърта рязко
        turnGain = 25 * CAR.turnGain;
      } else {
        this.sgommata = 0;
        turnGain = CAR.turnGain;
      }

      if (this.input.forward) {
        vel.addScaledVector(fwd, (this.maxSpeed - this.speed) * CAR.accGain * this.grip);
      }
      if (this.input.backward && !this.sgommata) {
        vel.addScaledVector(fwd, (-CAR.maxRetroSpeed - this.speed) * CAR.decGain * this.grip);
      }
      if (this.input.brake) {
        vel.addScaledVector(fwd, -this.speed * CAR.brakeGain);
      }
      // Нитрото бута напред отгоре на двигателя, до своя таван.
      if (this.boosting && this.speed < NITRO.maxSpeed) {
        vel.addScaledVector(fwd, Math.min(NITRO.accel * TIMESTEP, NITRO.maxSpeed - this.speed));
      }

      // Таванът на ъгловата скорост пада с нарастване на скоростта — така
      // колата не може да завие рязко на висока скорост. При спряла кола
      // таванът е нула, тоест на място не се върти.
      const mTS = Math.min(Math.abs(this.speed), (1 - propSpeed) * CAR.maxTurnSpeed);
      const canTurn = Math.abs(w.dot(axis)) < mTS;
      if (canTurn) {
        // Обръщането на знака е за заден ход: тогава волан наляво завърта
        // каросерията надясно. При ръчната спирачка обаче колата още се движи
        // напред — оригиналът не прави разлика между двете, защото и двете са
        // един и същ клавиш, но по-горе внимателно е изключил тягата назад при
        // pSgommata и не е изключил това. Смятаме го за пропуск: иначе ръчната
        // спирачка завърта колата обратно на натиснатата стрелка.
        const sign = (this.input.backward && !this.sgommata) ? -1 : 1;
        if (this.input.left) this.addAngular(axis, turnGain * sign);
        if (this.input.right) this.addAngular(axis, -turnGain * sign);

        // Проверката canTurn се прави преди импулса, а импулсът може да е
        // двайсет пъти по-голям от самия таван (ръчната спирачка е 25 x). Без
        // инерционния тензор на Havok, който го е поемал, колата подскачаше до
        // пет пъти над тавана и се въртеше като пумпал. Затова го спазваме.
        const yaw = w.dot(axis);
        if (Math.abs(yaw) > mTS) w.addScaledVector(axis, Math.sign(yaw) * mTS - yaw);
      }

      // Странично сцепление — това превръща плъзгането в завой.
      if (!this.input.brake && !this.sgommata) {
        vel.addScaledVector(right, -this.slideSpeed * this.grip);
      }

      // Изправяне на волана, когато не се завива или таванът е достигнат.
      if (!canTurn || (!this.input.left && !this.input.right)) {
        this.addAngular(axis, w.dot(axis) * -CAR.reTurnGain);
      }

      if (vel.length() > CAR.minSpeed) vel.addScaledVector(vel, -CAR.drag);
    }

    // По таван ли сме?
    if (axis.dot(UP) > 0.5) {
      this.upsideDownSince = null;
      this.rolloverCounted = false;
    } else {
      if (this.upsideDownSince === null) this.upsideDownSince = simTime;
      if (simTime - this.upsideDownSince > CAR.correctorActivation) {
        this.corrector(simTime);
        this.upsideDownSince = simTime;
      }
    }
  }

  // --- havok_callback: щети ----------------------------------------------

  registerImpact(name, impactSpeedFeet, isGround) {
    if (this.collisionWait > 0) return;

    // Праговете и множителите по-долу са спрямо m/s (виж DAMAGE в params.js).
    const impactSpeed = impactSpeedFeet / FEET_PER_METRE;
    const lower = (name || '').toLowerCase();
    const groundCollision = isGround || lower.includes('strada') ||
      lower.includes('marciapiede') || lower.includes('sterrato');

    let damage = 0;
    let kind;

    if (this.upsideDownSince === null) {
      // Нормалното возене по път не носи щети — само истинско тупване.
      if (groundCollision && this.fallSpeed > -8) return;
      if (lower.includes('cpu')) {
        damage = Math.min(Math.round(DAMAGE.cpu * impactSpeed), DAMAGE.cpuMax);
        kind = impactSpeed < 2 ? 'crash1' : 'crash2';
      } else if (groundCollision) {
        damage = DAMAGE.ground;
        kind = 'impattosuolo';
      } else {
        damage = Math.round(DAMAGE.impact * impactSpeed);
        kind = impactSpeed < 1.5 ? 'impatto1' : impactSpeed < 2 ? 'impatto2' : 'impatto3';
      }
    } else {
      if (this.rolloverCounted) return;
      this.rolloverCounted = true;
      damage = DAMAGE.rollover;
      kind = 'ribaltamento';
    }

    this.state.body = Math.max(this.state.body - damage, 0);
    this.lastImpact = { kind, damage, speed: impactSpeed };
    this.collisionWait = 1;
    if (this.state.body <= 0) this.state.destroyed = true;
  }

  /** correctorMatrix — изправя колата, след като е стояла по таван. */
  corrector(simTime) {
    const p = this.position.clone();
    p.z += 3;
    for (const dir of SIDE_DIRS) {
      const hit = this.world.raycast(p, dir, 2);
      if (hit && hit.distance < 2) p.addScaledVector(dir, -2);
    }
    // Запазва се само курсът; надлъжният наклон се занулява.
    const heading = Math.atan2(this.forwardVector.y, this.forwardVector.x);
    this.placeAt(p, heading);
    this.correctorUntil = simTime + 4;
  }
}

const SIDE_DIRS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
];
