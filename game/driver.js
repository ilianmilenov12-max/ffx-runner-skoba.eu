// Третата кола — пренесен "BehaviorScript 83 - DriveCPU3[cont]".
//
// Тази не напада и не причаква: кара. И не знае нищо за улиците — върви по
// следата, която играчът оставя зад себе си (`trail.js`). Търсенето минава
// през седем фази: първо гледа дали вижда играча, после трите последни точки
// от следата, а ако самата тя е извън кадър, се телепортира върху скрита
// точка и продължава оттам. Затова изглежда, че познава града.

import * as THREE from 'three';
import { CPU_DRIVE, CAR_SIZE, RIDE_HEIGHT } from './params.js?v=165';
import { Chaser } from './chaser.js?v=165';

const DEG = 180 / Math.PI;

export class StreetDriver extends Chaser {
  constructor(world, player, camera, trail) {
    super(world, player, camera, CPU_DRIVE);
    this.trail = trail;
    this.size = { ...CAR_SIZE };
    this.phase = 1;                 // aiPhase
    this.target = new THREE.Vector3();   // aiPointAt
    this.status = 'retro';
    this.action = 'lookingForTarget';
    this.lastSaved = { time: 0, status: '', action: '', speed: 0 };
  }

  /** Тази кола решава всичко на всяка стъпка, няма отделна проверка. */
  checkAction() {}

  performAction(simTime) {
    // Засича заклещване: ако цяла секунда е в същото състояние и не се движи,
    // обръща волана и дава назад. Оригиналът дори го отпечатва в конзолата.
    if (simTime - this.lastSaved.time > 1) {
      if (this.lastSaved.status === this.status && this.lastSaved.action === this.action &&
          this.status === 'Ok' && this.speed < 1) {
        const l = this.input.left, r = this.input.right;
        this.input.left = 1 - l; this.input.right = 1 - r;
        this.changeStatus('retro', simTime);
      }
      this.lastSaved = { time: simTime, status: this.status, action: this.action, speed: this.speed };
    }

    const { fwd, right } = this.axes();
    const pos = this.position;
    const idle = () => { this.input.forward = 0; this.input.backward = 0; this.input.brake = 0; };

    switch (this.status) {
      case 'retro':
        if (simTime - this.statusChanged < 1) {
          this.input.forward = 0; this.input.backward = 1; this.input.brake = 0;
          return;
        }
        idle(); this.input.left = 0; this.input.right = 0;
        this.changeStatus('Ok', simTime);
        return;

      case 'lost':
        idle(); this.input.left = 0; this.input.right = 0;
        this.findNewTarget(simTime);
        return;
    }

    // #Ok и #searching
    if (this.action === 'lookingForTarget') {
      idle();
      this.findNewTarget(simTime);
      return;
    }

    let toTarget = this.target.clone().sub(pos);
    let dist = toTarget.length();
    let ang = fwd.angleTo(toTarget) * DEG;

    if (this.action === 'followPlayer') {
      // Първо се мери спрямо запомнената точка; чак ако тя е зад колата или
      // под носа ѝ, целта се обновява до сегашното място на играча и мярката
      // се повтаря. Едва ако и тогава е зле, колата дава назад. Редът е важен —
      // обратното я заключва в цикъл напред-назад.
      if (ang > 90 || dist <= 2) {
        this.target.copy(this.player.position);
        toTarget = this.target.clone().sub(pos);
        dist = toTarget.length();
        ang = fwd.angleTo(toTarget) * DEG;

        if (ang > 90 || dist <= 2) {
          const lato = right.dot(this.player.position.clone().sub(pos).normalize());
          this.input.forward = 0; this.input.backward = 1; this.input.brake = 0;
          this.input.right = Math.max(-lato, 0);
          this.input.left = Math.max(lato, 0);
          this.changeStatus('retro', simTime);
          return;
        }
      }
      const side = right.dot(toTarget.clone().normalize());
      this.input.right = Math.max(side, 0);
      this.input.left = Math.max(-side, 0);

      if (this.canSee(this.player.position)) {
        this.input.forward = 1; this.input.backward = 0; this.input.brake = 0;
        if (this.status !== 'Ok') this.changeStatus('Ok', simTime);
      } else {
        idle();
        if (this.status !== 'searching') this.changeStatus('searching', simTime);
        if (simTime - this.statusChanged > 1) {
          this.input.left = 0; this.input.right = 0;
          this.changeStatus('lost', simTime);
        }
      }
      return;
    }

    if (this.action === 'followMarker') {
      const side = right.dot(toTarget.clone().normalize());
      this.input.right = Math.max(side, 0);
      this.input.left = Math.max(-side, 0);
      if (dist <= 8) {
        this.input.forward = 0; this.input.backward = 0;
        this.changeStatus('lost', simTime);
        this.changeAction('lookingForTarget', simTime);
      } else {
        this.input.forward = 1; this.input.backward = 0; this.input.brake = 0;
      }
    }
  }

  /** aiFindNewTarget: седемте фази на търсене. */
  findNewTarget(simTime) {
    const phase = this.phase;
    if (phase === 1) {
      if (this.canSee(this.player.position)) {
        this.target.copy(this.player.position);
        this.changeStatus('Ok', simTime);
        this.changeAction('followPlayer', simTime);
        this.phase = 1;
        return true;
      }
    } else if (phase >= 2 && phase <= 4) {
      const mark = this.trail.get(phase - 1);
      if (mark && this.canSee(mark.pos)) {
        this.target.copy(mark.pos);
        this.changeStatus('Ok', simTime);
        this.changeAction('followMarker', simTime);
        this.phase = 1;
        return true;
      }
    } else if (phase >= 5 && phase <= 7) {
      // Извън кадър ли е? Тогава може да се премести върху стара следа.
      if (this.isHidden()) {
        const mark = this.trail.hidden(this.camera);
        if (mark) {
          // Просвет над следата — НЕ this.height: то е разстоянието до земята
          // и е 9999, когато лъчът не е намерил нищо. Веднъж подадено тук,
          // колата отлита на десет хиляди фута нагоре и излиза от играта
          // завинаги.
          this.position.copy(mark.pos);
          this.position.z += RIDE_HEIGHT;
          const heading = Math.atan2(mark.dir.y, mark.dir.x);
          this.placeAt(this.position, heading);
          this.changeStatus('lost', simTime);
          this.changeAction('lookingForTarget', simTime);
          this.phase = 1;
          return true;
        }
      }
    } else {
      this.phase = 0;
    }
    this.phase++;
    return false;
  }

  /** aiLookForPlayer / aiLookForMarker: чист ли е погледът дотам? */
  canSee(point) {
    const from = this.position.clone();
    from.z += this.cpu.radarHeight;
    const dir = point.clone().sub(from);
    const distance = dir.length();
    if (distance < 1e-3) return true;
    const hit = this.world.raycast(from, dir.divideScalar(distance), distance, true);
    return !hit;          // нищо по пътя значи чист поглед
  }

  /** Няма гараж: ако изгуби всичко, просто започва търсенето отначало. */
  goToGarage() {
    this.phase = 5;       // направо към фазата с телепортирането
    this.changeStatus('lost', this.statusChanged);
    this.changeAction('lookingForTarget', this.statusChanged);
  }
}
