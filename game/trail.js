// Следата на играча — пренесен "ParentScript 10 - Trail".
//
// Колата на играча пуска точка зад себе си, докато кара по настилка. Третата
// кола на противника не знае нищо за улиците: тя върви по тези точки. Затова
// изглежда, че познава града — всъщност просто кара по твоите следи.
//
// Starting.ls я създава с new(script("trail"), 1, 20, 1, 10, 0, 0):
// най-много 20 точки, поне секунда и поне десет фута една от друга.

import * as THREE from 'three';

export class Trail {
  constructor({ maxMarks = 20, minTime = 1, minDistance = 10 } = {}) {
    this.maxMarks = maxMarks;
    this.minTime = minTime;
    this.minDistance = minDistance;
    this.marks = [];
  }

  /** dropMark: добавя точка, ако е минало достатъчно време и разстояние. */
  drop(position, direction, now) {
    const last = this.marks[this.marks.length - 1];
    if (last) {
      if (this.minTime > 0 && now - last.time < this.minTime) return false;
      if (this.minDistance > 0 && position.distanceTo(last.pos) < this.minDistance) {
        // Точката още е прясна — само насочваме посоката ѝ натам, накъдето
        // колата е продължила.
        last.dir.copy(position).sub(last.pos);
        return false;
      }
      if (this.marks.length === this.maxMarks) this.marks.shift();
    }
    this.marks.push({ time: now, pos: position.clone(), dir: direction.clone() });
    return true;
  }

  /** getMark(i): i-тата точка отзад напред, без най-старата. */
  get(i) {
    const n = this.marks.length - i;
    return n > 1 ? this.marks[n - 1] : null;
  }

  /** getHiddenMark: първата точка, която камерата не вижда. */
  hidden(camera) {
    for (const mark of this.marks) {
      const p = mark.pos.clone().project(camera);
      const visible = p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1 && p.z >= -1 && p.z <= 1;
      if (!visible) return mark;
    }
    return null;
  }

  reset() { this.marks.length = 0; }
}
