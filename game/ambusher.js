// Вторият джип — пренесен "BehaviorScript 36 - AgguatiCPU3".
//
// Този не те гони отзад: чака те. `aiGoTo` в оригинала съдържа девет
// предварително зададени места с точни координати — площадът, задънената
// уличка, двата тунела, паркингът, каналът — и на всяко има условие кога да
// изскочи. Щом играчът влезе в обхвата му, той се включва в преследване;
// щом го изгуби, отива на следващото място по веригата.
//
// Заради това изглежда, че противникът е предвидил маршрута ти.

import * as THREE from 'three';
import { CPU3, CAR_SIZE } from './params.js?v=168';
import { Chaser } from './chaser.js?v=168';

const D = Math.PI / 180;
const DEG = 180 / Math.PI;

// aiGoTo от оригинала: позиция, посока, къде бяга после, и кога да изскочи.
// Условията са върху позицията на играча, точно както са записани там.
export const AMBUSHES = [
  { name: 'agguato1', pos: [-496, -797, 0.5], heading: 90 * D,
    trigger: p => p.x < -490 || (p.x < -440 && p.y > -750),
    runTo: [-443, -889, 0.5], goaway: p => p.y < -885 },
  { name: 'inPiazza', pos: [-479.5, -1100, 0.5], heading: 270 * D,
    trigger: p => p.x > -543 && p.x < -393 && p.y < -1107 && p.y > -1200,
    needsVisible: true,
    runTo: [-479, -1197, 0.5], goaway: p => p.y > -1070 && p.x < -465 },
  { name: 'vicoloCieco', pos: [-446, -1295, 0.5], heading: 270 * D,
    trigger: p => p.y > -1340,
    runTo: [-479, -1197, 0.5], goaway: p => p.y > -1070 && p.x < -465 },
  { name: 'tunnel2', pos: [34, -1162, 0.5], heading: 270 * D,
    trigger: p => p.x > 25,
    runTo: [34, -1162, 0.5], goaway: p => p.x > -140 && p.y > -1000 },
  { name: 'tunnel1', pos: [-380, -1210, -14], heading: 180 * D,
    trigger: p => p.y < -1100,
    runTo: [-380, -1210, -14], goaway: p => p.z > -1 },
  { name: 'agguato2', pos: [350, -1280, 0.5], heading: 180 * D,
    trigger: p => p.x > 100,
    runTo: [100, -1280, 5], goaway: p => p.y < -1360 },
  { name: 'parcheggio', pos: [305, -1390, 0.5], heading: 30 * D,
    trigger: p => p.y < -1380,
    runTo: [305, -1390, 5], goaway: p => p.x > 670 },
  { name: 'canalone', pos: [705, -561, -14], heading: 270 * D,
    trigger: p => p.y > -1700,
    runTo: [705, -561, -14], goaway: p => p.y > 0 },
  { name: 'finale', pos: [770, 79, 0.5], heading: 90 * D,
    trigger: p => p.y > 75,
    runTo: [940, 176, 0.5], goaway: () => false },
];

// Накъде продължава след като изгуби играча — веригата от `#waiting` в
// оригинала. Индексите са от нула; стойност null значи „остани тук".
// Кога колата се смята за безнадеждно далеч от играча и си сменя мястото.
const RELOCATE_RANGE = 400;
const RELOCATE_PATIENCE = 4;

// Засадата изскача и просто защото играчът е минал наблизо. Условията на
// оригинала са по абсолютни координати и важат само за замисления маршрут;
// щом играчът кара другаде, никое не се изпълнява и колата не влиза в играта.
const POUNCE_RANGE = 150;

const NEXT = [
  { to: 1, when: p => p.y < -1000 },   // след 1 → площадът
  { to: 3, when: p => p.y < -1000 },   // след площада → тунел 2
  { to: 3, when: p => p.y < -1000 },   // след уличката → тунел 2
  { to: 4, when: p => p.z < -10 },     // след тунел 2 → тунел 1
  { to: 5, when: () => true },
  { to: 6, when: () => true },
  { to: 7, when: () => true },
  { to: 8, when: () => true },
  null,                                 // финалът е последен
];

export class Ambusher extends Chaser {
  constructor(world, player, camera) {
    super(world, player, camera, CPU3);
    this.size = { width: CAR_SIZE.width * 1.15, length: CAR_SIZE.length * 1.35,
                  height: CAR_SIZE.height * 1.6 };
    this.spot = -1;
    this.farSince = null;
    this.goTo(0, 0);
  }

  step(dt, simTime) {
    // Докато чака, стои закован. Мястото на засадата често е в зона, която
    // още не е заредена — там няма настилка под колата и всяка симулация би я
    // пуснала да пада през света. Оригиналът я държи с pHavok.position.
    if (this.action === 'waitingForAction') { this.checkAction(simTime); return; }
    super.step(dt, simTime);
  }

  /** Засада, каквато я няма в оригинала: точка върху пътя пред самия старт.
   *  Деветте записани места са пръснати по маршрута и първото от тях е чак
   *  в зона 4 — дотогава играта е празна, а в оригинала още на седмата
   *  секунда отсреща излиза кола. Оттук нататък веригата поема нормално. */
  openAt(position, heading) {
    this.spot = -1;                 // извън деветте: веригата ще започне от 0
    this.inGarage = false;
    this.placeAt(position, heading);
    this.changeStatus('opening', 0);
    this.changeAction('waitingForAction', 0);
  }

  /** aiGoTo: сяда на поредното място и зачаква. */
  goTo(index, simTime) {
    const a = AMBUSHES[index];
    if (!a) return;
    this.spot = index;
    this.inGarage = false;
    this.placeAt(new THREE.Vector3(...a.pos), a.heading);
    this.changeStatus(a.name, simTime);
    this.changeAction('waitingForAction', simTime);
  }

  checkAction(simTime) {
    this.actionChanged = simTime;

    if (this.action === 'runningAway') {
      // Оттегля се. Щом се скрие от поглед достатъчно дълго, отива на
      // следващата засада.
      if (this.isHidden()) {
        if (this.hiddenSince === null) this.hiddenSince = simTime;
        if (simTime - this.hiddenSince > this.cpu.waitBeforeDisappear) this.goToGarage();
      } else {
        this.hiddenSince = null;
      }
      return;
    }

    if (this.action !== 'waitingForAction') {
      // Играчът излязъл ли е от участъка на тази засада? Тогава колата не го
      // гони докрай, а се оттегля към записаната точка — така изчезва от
      // огледалото и се появява отново някъде напред.
      const a = AMBUSHES[this.spot];
      if (a && a.goaway(this.player.position)) {
        this.runTarget = new THREE.Vector3(...a.runTo);
        this.changeAction('runningAway', simTime);
        return;
      }
      super.checkAction(simTime);
      return;
    }

    const p = this.player.position;

    // Отварящата засада: изскача, щом играчът дойде наблизо, и после
    // предава щафетата на записаните девет места.
    if (this.spot < 0) {
      if (this.position.distanceTo(p) < POUNCE_RANGE) {
        this.changeStatus('Ok', simTime);
        this.changeAction('followPlayer', simTime);
        this.spot = 0;
      }
      return;
    }

    const a = AMBUSHES[this.spot];
    if (!a) return;

    // Изскача ли вече? По условието на оригинала или просто защото играчът
    // е дошъл наблизо.
    const near = this.position.distanceTo(p) < POUNCE_RANGE;
    if ((a.trigger(p) || near) && !(a.needsVisible && this.isHidden())) {
      this.changeStatus('Ok', simTime);
      this.changeAction('followPlayer', simTime);
      return;
    }

    // Или играчът е подминал и е време за следващата засада?
    const next = NEXT[this.spot];
    if (next && next.when(p)) { this.goTo(next.to, simTime); return; }

    // Веригата в оригинала предполага, че играчът кара по замисления маршрут.
    // Ако тръгне другаде, нито едно от условията не се изпълнява и колата
    // остава да чака на място, до което никой няма да стигне. Затова, ако
    // играчът стои далеч задълго, тя се мести на най-близката до него засада —
    // все така някое от деветте места на оригинала, не измислена точка.
    if (this.position.distanceTo(p) < RELOCATE_RANGE) { this.farSince = null; return; }
    if (this.farSince === null) { this.farSince = simTime; return; }
    if (simTime - this.farSince < RELOCATE_PATIENCE) return;

    let best = this.spot, bestDist = Infinity;
    for (let i = 0; i < AMBUSHES.length; i++) {
      if (i === this.spot) continue;
      const d = p.distanceTo(new THREE.Vector3(...AMBUSHES[i].pos));
      if (d < bestDist) { bestDist = d; best = i; }
    }
    // Мести се на най-близката засада, каквото и да е разстоянието: иначе,
    // ако играчът е далеч от всичките девет места, колата остава там, където
    // е, и никога не влиза в играта.
    this.farSince = null;
    this.goTo(best, simTime);
  }

  performAction(simTime) {
    if (this.action !== 'runningAway') { super.performAction(simTime); return; }

    const { fwd, right } = this.axes();
    const toTarget = this.runTarget.clone().sub(this.position);
    if (toTarget.length() < 10) { this.goToGarage(); return; }

    const side = right.dot(toTarget.normalize());
    this.input.right = Math.max(side, 0);
    this.input.left = Math.max(-side, 0);
    this.input.forward = fwd.angleTo(toTarget) * DEG < 90 ? 1 : 0;
    this.input.backward = 0;
    this.input.brake = 0;
  }

  /** Изгуби ли играча, не се прибира в гараж — премества се на следващото място. */
  goToGarage() {
    const next = NEXT[this.spot];
    this.goTo(next ? next.to : this.spot, this.statusChanged);
  }
}
