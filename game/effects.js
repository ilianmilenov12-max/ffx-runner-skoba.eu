// Следи от гуми, дим и искри. Няма ги в оригинала — там следата е само
// невидимата пътечка, по която върви третата кола (trail.js).

import * as THREE from 'three';
import { CAR, RIDE_HEIGHT } from './params.js?v=168';

const MAX_MARKS = 1400;          // парчета следа, после най-старите се преизползват
const MARK_WIDTH = 0.32;         // фута
const MARK_BREAK = 6;            // по-дълъг скок значи нова следа, не продължение
const REAR = -1.35;              // задният мост спрямо центъра на колата
const TRACK = 0.78;              // половината разстояние между задните гуми

/** Черните ивици по асфалта: едно парче на стъпка за всяка задна гума,
 *  опънато от миналото ѝ място до сегашното — така следата е непрекъсната. */
class SkidMarks {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x101010, transparent: true, opacity: 0.55, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_MARKS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.next = 0;
    this.last = [null, null];
    this._o = new THREE.Object3D();
  }

  mark(wheel, point) {
    const prev = this.last[wheel];
    this.last[wheel] = point.clone();
    if (!prev) return;
    const dx = point.x - prev.x, dy = point.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.05 || len > MARK_BREAK) return;
    const o = this._o;
    o.position.set((point.x + prev.x) / 2, (point.y + prev.y) / 2, (point.z + prev.z) / 2);
    o.rotation.set(0, 0, Math.atan2(dy, dx));
    o.scale.set(len + 0.1, MARK_WIDTH, 1);
    o.updateMatrix();
    this.mesh.setMatrixAt(this.next, o.matrix);
    this.next = (this.next + 1) % MAX_MARKS;
    this.mesh.count = Math.max(this.mesh.count, this.next === 0 ? MAX_MARKS : this.next);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  lift() { this.last = [null, null]; }
}

export class Effects {
  constructor(scene, sparks, smoke) {
    this.marks = new SkidMarks(scene);
    this.sparks = sparks;
    this.smoke = smoke;
    this.tick = 0;
    this.idle = 0;
  }

  /** Всяка стъпка на симулацията, след колата. */
  step(car, state) {
    this.tick++;
    const { fwd, right } = car.axes();
    const speed = Math.abs(car.speed || 0);
    const grounded = car.height < CAR.maxHeight;

    // Гумите се влачат при ръчна спирачка, при рязко спиране и при занасяне.
    const skidding = grounded && speed > 8 &&
      (car.sgommata || (car.input.brake && speed > 15) || Math.abs(car.slideSpeed || 0) > 6);
    if (skidding) {
      const groundZ = car.position.z - RIDE_HEIGHT + 0.04;
      for (const [k, side] of [[0, -1], [1, 1]]) {
        const p = car.position.clone().addScaledVector(fwd, REAR).addScaledVector(right, side * TRACK);
        p.z = groundZ;
        this.marks.mark(k, p);
        if (this.tick % 2 === k) this.smoke.burst('tyre', p.setZ(groundZ + 0.3), 1);
      }
      this.idle = 0;
    } else if (++this.idle > 3) {
      // Занасянето мига на прага за стъпка-две — следата не бива да се къса.
      this.marks.lift();
    }

    // Пушек от двигателя — толкова по-гъст, колкото по-ударена е колата.
    if (state.body < 35 && !state.destroyed) {
      const every = state.body < 12 ? 1 : state.body < 22 ? 2 : 4;
      if (this.tick % every === 0) {
        const p = car.position.clone().addScaledVector(fwd, 1.5);
        p.z += 1.2;
        this.smoke.burst('engine', p, 1);
      }
    }
  }

  /** Искри при удар — в посоката, от която е дошъл. */
  impact(car, hit) {
    if (!hit || !/crash|impatto[23]|ribaltamento/.test(hit.kind)) return;
    const p = car.position.clone();
    p.z += 0.8;
    const count = Math.min(40, 10 + Math.round(hit.speed * 4));
    this.sparks.burst('sparks', p, count);
  }
}
