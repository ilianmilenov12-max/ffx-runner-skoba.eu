// Сценарият — пренесен "BehaviorScript 37 - animation".
//
// Оригиналът го кара с четири невидими обема, поставени върху пътя:
// -SWPassaggioLivello01, -SWTunnel, -SWCamion и -SWPassaggioLivello02.
// Blender конверсията не ги е пренесла (виж списъка с липсващи в конзолата),
// затова тук са пресъздадени от геометрията около тях: бариерите Sbarra01–04
// още са в света и координатите им казват къде минават двата прелеза.
//
// Точките, които НЕ следват от геометрията, са означени поотделно по-долу.

import * as THREE from 'three';
import { CAR } from './params.js?v=163';

const CAR_MAX_HEIGHT = CAR.maxHeight;

// Стъпките на `animation` в оригинала. -1 е между първия прелез и тунела.
export const STEP = {
  START: 0, CROSSING1: 1, AFTER_CROSSING1: -1, TUNNEL: 2, RESUME: 3,
  TRUCK: 4, AFTER_TRUCK: 5, CROSSING2: 6, FINALE: 8, TRAPPED: 10,
};

/** Правоъгълник върху пътя; z не се проверява, лъчът и без това е отвесен. */
const area = (x, y, w, h) => ({ x, y, w, h });
/** Кръг около точка — за прагове, които трябва да хванат всяка посока. */
const near = (x, y, r) => ({ x, y, r });

// Тригерите са четирите невидими обема -SW* на оригинала. Конверсията не ги
// е пренесла, но мястото им е в сцената на .dir (tools/w3d/extract.py →
// assets/original.json): -SWPassaggioLivello01 при x≈-96, -SWTunnel на
// изхода от тунела, -SWCamion при x≈121 след прелеза, -SWPassaggioLivello02
// при x≈830. Размерът им там е в компресираната геометрия — затова всеки е
// ивица напряко на пътя. И четирите пътя вървят изток-запад.
const TRIGGER_DEPTH = 12;     // покрай пътя
const TRIGGER_WIDTH = 60;     // напряко: платното и тротоарите

// Ако assets/original.json не се зареди — местата, намерени преди по видеото.
const FALLBACK_TRIGGERS = {
  passaggio1: near(63, -1284, 133),
  tunnel: area(-80, -1051, 50, 44),
  camion: area(142, -1285, 20, 50),
  passaggio2: near(957, 177, 140),
};

function triggersFrom(original) {
  const t = (original && original.triggers) || {};
  const at = (name, fallback) => {
    const p = t[name] && t[name].position;
    return p ? area(p[0], p[1], TRIGGER_DEPTH, TRIGGER_WIDTH) : fallback;
  };
  return {
    passaggio1: at('SWPassaggioLivello01', FALLBACK_TRIGGERS.passaggio1),
    tunnel: at('SWTunnel', FALLBACK_TRIGGERS.tunnel),
    camion: at('SWCamion', FALLBACK_TRIGGERS.camion),
    passaggio2: at('SWPassaggioLivello02', FALLBACK_TRIGGERS.passaggio2),
  };
}

// Прибере ли се играчът в зона 1 по друг път, -SWTunnel не се пресича
// никога, а прелезът остава затворен завинаги. Затова стига и самата зона —
// но само далеч от тригера, иначе зоната (която почва при x≈-110) би го
// изпреварила по нормалния път.
const TUNNEL_FALLBACK_DISTANCE = 150;

// Пътищата и на двата прелеза вървят изток-запад, а стълбовете на бариерите
// стоят от двете им страни — на около седемнайсет фута един от друг напряко
// и на четирийсет покрай пътя. Значи арматурата трябва да замита по Y, към
// осевата линия, а не към отсрещния стълб: иначе ляга покрай платното.
// Всяка е 17.4 фута, тоест сама покрива цялата ширина и няма нужда от
// разтягане.
// `arm` е на колко фута от осевата точка стои всяка арматура покрай пътя.
const CROSSINGS = [
  { mid: [62.7, -1283.9], road: [1, 0], arm: 19.8 },   // Sbarra01 (x 42.9) / Sbarra02 (x 82.5)
  { mid: [957, 177], road: [1, 0], arm: 15 },          // Sbarra03 (x 942) / Sbarra04 (x 972)
];

const inside = (t, p) => t.r !== undefined
  ? Math.hypot(p.x - t.x, p.y - t.y) < t.r
  : Math.abs(p.x - t.x) < t.w / 2 && Math.abs(p.y - t.y) < t.h / 2;

// Първата бариера се движи за четири секунди (tween 90 → 0 за 4000 ms), а
// последната за пет: keyframePlayer.play(..., 0, 1000, 0.2) — една секунда
// анимация, пусната с една пета от скоростта.
const BARRIER_TIME = 4;
const BARRIER2_TIME = 5;
// Колко високо над основата на арматурата е пантата. Колата е висока 1.5 фута,
// затова спусната арматура трябва да е под това, за да личи, че пътят е затворен.
const HINGE_HEIGHT = 1.1;
// Половината ширина на платното при прелеза — встрани от нея няма преграда.
const BARRIER_HALF_WIDTH = 30;
const CAR_HALF_LENGTH = 2;   // колата е 3.82 фута
// Камионът е твърдо тяло в сцената; стъпка 4 го мести само по Y — от 12 фута
// пред мястото му до 12 фута след него за 4.8 секунди. Мястото му в сцената
// е (351, -1271), в северната пресечка на кръстовището, където маршрутът
// завива на юг, и е с мащаб 1.83 — цистерна от 21 фута, почти двойно по-
// голяма от модела в cars.glb. Кабината е на юг (така е във видеото).
const TRUCK_TIME = 4.8;
const TRUCK_FALLBACK = { at: [355, -1272], scale: 1 };
const TRUCK_SWING = 12;
const TRUCK_HEADING = Math.PI / 2;    // кабината на юг (моделът гледа към -X)
const TRAIN_TIME = 10;       // tween 358 → -30 за 10000 ms
const FINALE_THROTTLE = 3;   // колкото трае преливането на камерата

// Камерите на оригинала (CameraPL1 при прелеза, LastCamera накрая) не са
// минали през конверсията, но са в сцената на .dir, с точка на гледане и
// обектив: и двете са с тесни 34.5°. Смяната към CameraPL1 е рязка
// (`sprite.camera = ...`), без прелитане, и зоната става 11, за да се вижда
// прелезът. Към LastCamera `TV.theEnd()` прелива за три секунди.
const FALLBACK_SHOTS = {
  crossing1: { at: [-40, -1284, 18], look: [63, -1284, 5], zone: 11 },
  last: null,
};

function shotsFrom(original) {
  const cam = (original && original.cameras) || {};
  const shot = (c, zone) => c && c.target
    ? { at: c.position, look: c.target, fov: c.fov, zone } : null;
  return {
    crossing1: shot(cam.CameraPL1, 11) || FALLBACK_SHOTS.crossing1,
    last: shot(cam.LastCamera, 0) || FALLBACK_SHOTS.last,
  };
}
// Сцената трае, колкото бариерите се вдигат: стъпка 3 идва, щом tween-ът свърши.
const CUTSCENE_TIME = BARRIER_TIME;

export class Sequence {
  constructor(world, car, state, engine, chase, original = null) {
    this.world = world;
    this.triggers = triggersFrom(original);
    this.shots = shotsFrom(original);
    const camion = original && original.missing && original.missing.Camion;
    if (camion) {
      const m = camion.matrix;
      this.truckAt = [m[12], m[13]];
      this.truckScale = Math.hypot(m[0], m[1], m[2]);
    } else {
      this.truckAt = TRUCK_FALLBACK.at;
      this.truckScale = TRUCK_FALLBACK.scale;
    }
    this.car = car;
    this.state = state;
    this.engine = engine;
    this.chase = chase;
    this.cutscene = 0;
    this.side0 = null;
    this.side2 = null;
    this.closed = [0, 0];      // колко са спуснати двата прелеза

    this.step = STEP.START;
    this.timer = 0;
    // Арматурата е отвесна дъска, чието начало е някъде по средата ѝ, а
    // въртенето трябва да е около пантата в основата и НАСТРАНИ през пътя,
    // не покрай него. Затова всяка се закача за отделна група, поставена в
    // пантата, и се върти тя. Без това арматурата оставаше високо над колата
    // и се минаваше под нея.
    this.hinges = this.makeHinges(world, [
      ['Sbarra01', 'Sbarra02'], ['Sbarra02', 'Sbarra01'],
      ['Sbarra03', 'Sbarra04'], ['Sbarra04', 'Sbarra03'],
    ]);
    // Спусната, арматурата лежи на фут от пътя и лъчът към земята я взема за
    // настилка — колата се качва върху нея и я прескача. Спирането е работа
    // на стената в blockAt, затова арматурите излизат от сблъсъците.
    world.dropColliders(['Sbarra01', 'Sbarra02', 'Sbarra03', 'Sbarra04']);
    this.train = world.objects.get('Treno') || null;
    this.trainStart = this.train ? this.train.position.clone() : null;
    this.truck = null;         // сглобява се от cars.glb в main.js
    this.forcedZone = null;    // зоната, която сцената държи видима
  }

  /** Пантата е в основата на арматурата; оста сочи така, че да замете пътя. */
  makeHinges(world, pairs) {
    return pairs.map(([name, partnerName], index) => {
      const arm = world.objects.get(name);
      const partner = world.objects.get(partnerName);
      if (!arm || !partner) return null;

      const here = new THREE.Vector3();
      const there = new THREE.Vector3();
      arm.getWorldPosition(here);
      partner.getWorldPosition(there);

      // Пантата се закача за сцената, а не за родителя на арматурата: светът
      // е завъртян и умножен по десет, а точката е в световни координати.
      const box = new THREE.Box3().setFromObject(arm);
      const scene = world.root.parent || world.root;
      const pivot = new THREE.Group();
      pivot.position.set(here.x, here.y, box.min.z + HINGE_HEIGHT);
      scene.add(pivot);
      pivot.attach(arm);                 // запазва трансформацията на арматурата

      // Напряко на пътя, към осевата му линия. Всяка арматура е 17.4 фута,
      // тоест сама покрива цялата ширина — разтягане не трябва.
      const crossing = CROSSINGS[Math.floor(index / 2)];
      const across = new THREE.Vector3(0, Math.sign(crossing.mid[1] - here.y) || 1, 0);
      const axis = new THREE.Vector3(0, 0, 1).cross(across).normalize();

      return { pivot, axis };
    });
  }

  attachTruck(model) {
    this.truck = model;
    if (!model) return;
    // Стои на мястото си в пресечката от самото начало, както твърдото тяло в
    // оригинала. В първата обиколка дотук не се стига.
    model.scale.setScalar(this.truckScale);
    this.placeTruck(this.truckAt[1]);
    // Твърдо тяло е — колата се удря в него.
    this.world.addColliders(model);
  }

  placeTruck(y) {
    this.truck.position.set(this.truckAt[0], y, 0.05);
    this.truck.rotation.z = TRUCK_HEADING;
    this.truck.updateMatrixWorld(true);
  }

  goTo(step) {
    this.step = step;
    this.timer = 0;
    this.side0 = null; this.side2 = null;
    if (step === STEP.TRUCK) this.engine?.sequence('camion');
    if (step === STEP.CROSSING1) this.engine?.sequence('treno');
    if (step === STEP.FINALE || step === STEP.TRAPPED) {
      this.engine?.sequence('treno');
      this.theEnd();
    }
  }

  /** Проверява тригерите и върти текущата стъпка. */
  update(dt, car) {
    const p = car.position;

    // Първият прелез е затворен през цялата първа обиколка: в оригинала там
    // стои невидимият куб ?Ipercubo01 от самото начало, и чак стъпка 2 го
    // маха. Бариерата само показва, че пътят е затворен. Последният прелез
    // не е стена: изходът там се решава от сценария.
    this.blockAt(0, this.step === STEP.START || this.step === STEP.CROSSING1 ||
                    this.step === STEP.AFTER_CROSSING1, car);

    switch (this.step) {
      case STEP.START:
        if (inside(this.triggers.passaggio1, p)) this.goTo(STEP.CROSSING1);
        break;

      case STEP.CROSSING1:
        // Бариерите на първия прелез слизат.
        this.timer += dt;
        this.closed[0] = Math.min(this.timer / BARRIER_TIME, 1);
        this.setBarriers(0, 1, this.closed[0]);
        if (this.timer >= BARRIER_TIME) this.goTo(STEP.AFTER_CROSSING1);
        break;

      case STEP.AFTER_CROSSING1:
        if ((inside(this.triggers.tunnel, p) || this.cameHomeAnotherWay(p)) &&
            car.height < CAR_MAX_HEIGHT) {
          this.goTo(STEP.TUNNEL);
          this.playShot('crossing1');
        }
        break;

      case STEP.TUNNEL:
        // Бариерите се вдигат, гледани от камерата при прелеза — сцената от
        // стъпка 2 на оригинала. Играчът стои.
        this.timer += dt;
        this.closed[0] = 1 - Math.min(this.timer / BARRIER_TIME, 1);
        this.setBarriers(0, 1, this.closed[0]);
        if (this.timer >= BARRIER_TIME) this.goTo(STEP.RESUME);
        break;

      case STEP.RESUME:
        if (inside(this.triggers.camion, p)) this.goTo(STEP.TRUCK);
        break;

      case STEP.TRUCK: {
        this.timer += dt;
        const t = Math.min(this.timer / TRUCK_TIME, 1);
        // tween(p.y + 12, p.y - 12): пътят е изток-запад, камионът го пресича
        // по Y и остава, където е спрял.
        if (this.truck) this.placeTruck(this.truckAt[1] + TRUCK_SWING - 2 * TRUCK_SWING * t);
        if (t >= 1) this.goTo(STEP.AFTER_TRUCK);
        break;
      }

      case STEP.AFTER_TRUCK:
        if (inside(this.triggers.passaggio2, p)) this.goTo(STEP.CROSSING2);
        break;

      case STEP.CROSSING2:
        // Бариерите на втория прелез се затварят. Успееш ли да излезеш на
        // релсите преди това, започва финалът; иначе оставаш затворен.
        this.timer += dt;
        this.closed[1] = Math.min(this.timer / BARRIER2_TIME, 1);
        this.setBarriers(2, 3, this.closed[1]);
        if ((car.objectUnder || '').includes('GraficaBinari01')) { this.goTo(STEP.FINALE); break; }
        if (this.timer >= BARRIER2_TIME) this.goTo(STEP.TRAPPED);
        break;

      case STEP.FINALE:
      case STEP.TRAPPED:
        // От седмата стъпка нататък играчът няма контрол (getKeys в DriveHuman).
        // `TV.theEnd()` в оригинала прелива камерата към LastCamera за три
        // секунди — оттам и широкият кадър, в който се вижда влакът.
        this.timer += dt;
        this.runTrain(this.timer / TRAIN_TIME);
        if (this.timer >= TRAIN_TIME) {
          this.state.finished = true;
          this.state.won = this.step === STEP.FINALE;
          this.step = 99;
        }
        break;
    }
  }

  cameHomeAnotherWay(p) {
    const t = this.triggers.tunnel;
    return this.world.currentZone === 1 &&
      Math.hypot(p.x - t.x, p.y - t.y) > TUNNEL_FALLBACK_DISTANCE;
  }

  /** Затвореният прелез спира колата — ?Ipercubo01 на оригинала. */
  blockAt(pair, active, car) {
    if (!active) return;
    const crossing = CROSSINGS[Math.floor(pair / 2)];
    if (!crossing) return;

    // Пътят върви изток-запад, значи преградата е отвесна линия напряко на
    // него в осевата точка. Спира движението по посоката на пътя.
    const road = new THREE.Vector3(crossing.road[0], crossing.road[1], 0).normalize();
    const side = new THREE.Vector3(-road.y, road.x, 0);

    const rel = new THREE.Vector3(
      car.position.x - crossing.mid[0], car.position.y - crossing.mid[1], 0);
    if (Math.abs(rel.dot(side)) > BARRIER_HALF_WIDTH) return;   // покрай прелеза

    // Стената е при арматурата откъм колата, не на осевата линия: иначе
    // колата прескача първата арматура и спира чак върху релсите между двете.
    const along = rel.dot(road);
    const key = 'side' + pair;
    if (this[key] === undefined || this[key] === null) this[key] = Math.sign(along) || 1;
    const wallAt = crossing.arm + CAR_HALF_LENGTH;
    const outside = along * this[key];
    if (outside >= wallAt) return;

    car.position.addScaledVector(road, this[key] * (wallAt - outside));
    if (car.velocity.dot(road) * this[key] < 0) {
      car.velocity.addScaledVector(road, -car.velocity.dot(road));
    }
  }

  /** Кратка сцена от фиксирана камера; играчът стои, докато тече. */
  playShot(name) {
    const shot = this.shots[name];
    if (!shot || !this.chase) return;
    this.chase.cut(new THREE.Vector3(...shot.at), new THREE.Vector3(...shot.look), shot.fov);
    this.forcedZone = shot.zone || null;
    this.zoneBefore = this.world.currentZone;
    this.cutscene = CUTSCENE_TIME;
    this.state.running = false;
  }

  /** theEnd: преливане за три секунди към LastCamera — неподвижна камера
   *  високо встрани от последния прелез, насочена към релсите, откъдето
   *  минава влакът. Без данните от .dir кадърът следва колата. */
  theEnd() {
    if (!this.chase) return;
    const last = this.shots.last;
    if (last) {
      this.chase.flyTo(new THREE.Vector3(...last.at), new THREE.Vector3(...last.look), 3, null, last.fov);
      return;
    }
    const p = this.car.position;
    const offset = new THREE.Vector3(26, -26, 16);
    this.chase.flyTo(p.clone().add(offset), p.clone().setZ(p.z + 3), 3, offset);
  }

  /** Отброява текущата сцена; връща true, докато играчът е спрян. */
  tickCutscene(dt) {
    if (this.cutscene <= 0) return false;
    this.cutscene -= dt;
    if (this.cutscene <= 0) {
      this.cutscene = 0;
      // Зоната се връща още преди колата да тръгне (zoneChange(1) на стъпка 3):
      // иначе първата ѝ стъпка е без настилка отдолу и тя пропада.
      if (this.forcedZone && this.zoneBefore) this.world.setZone(this.zoneBefore);
      this.forcedZone = null;
      // Обратно към MainCamera — пак рязко, без прелитане през града.
      this.chase?.release(true);
      this.state.running = true;
      return false;
    }
    return true;
  }

  /** В оригинала: sb1.rotation = (R,0,0), sb2.rotation = (180-R, 0, 0) —
   *  двете арматури се въртят една срещу друга. */
  setBarriers(a, b, closed) {
    const angle = closed * Math.PI / 2;
    for (const i of [a, b]) {
      const h = this.hinges[i];
      if (h) h.pivot.quaternion.setFromAxisAngle(h.axis, angle);
    }
  }

  runTrain(t) {
    if (!this.train || !this.trainStart) return;
    this.train.position.y = this.trainStart.y + (-30 - this.trainStart.y) * Math.min(t, 1);
  }

  /** Отнема ли се управлението? Стъпка 7 нататък — да. */
  get controlsLocked() {
    return this.step === STEP.FINALE || this.step === STEP.TRAPPED || this.step === 99;
  }

  /** getKeys: `pGoingForward = animation.step = 8`, тоест газта е само докато
   *  трае стъпка 8 — колкото и преливането на камерата. После е спирачка, и
   *  затова колата спира върху релсите, вместо да продължи напред и да падне. */
  get throttleLocked() {
    return this.step === STEP.FINALE && this.timer < FINALE_THROTTLE;
  }
}
