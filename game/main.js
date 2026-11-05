// Свързва всичко: свят, кола, камера, бонуси, HUD.
//
// Симулацията върви на фиксирани стъпки от 0.04 s (havok.timeStep), а
// рисуването — с честотата на екрана.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World } from './world.js?v=167';
import { PlayerCar } from './car.js?v=167';
import { Chaser } from './chaser.js?v=167';
import { Ambusher } from './ambusher.js?v=167';
import { StreetDriver } from './driver.js?v=167';
import { Trail } from './trail.js?v=167';
import { makeShadow, updateShadow } from './shadow.js?v=167';
import { Particles } from './particles.js?v=167';
import { Sequence } from './sequence.js?v=167';
import { ChaseCamera } from './camera.js?v=167';
import { Hud, BUILD } from './hud.js?v=167';
import { Engine } from './audio.js?v=167';
import { BONUSES } from './data.js?v=167';
import { addOriginal, stepBarriers } from './original.js?v=167';
import { Look } from './look.js?v=167';
import { Effects } from './effects.js?v=167';
import { Ghost } from './ghost.js?v=167';
import { Minimap } from './minimap.js?v=167';
import { settings, pauseMenu } from './settings.js?v=167';
import { bindTouch } from './touch.js?v=167';
import { Atmosphere } from './atmosphere.js?v=167';
import { addLights } from './lights.js?v=167';
import { buildSkyline } from './skyline.js?v=167';
import { applyRelief } from './relief.js?v=167';
import { buildFacadeDetails } from './facade.js?v=167';
import { buildTheatre } from './theatre.js?v=167';
import { applyNormals, applyGroundDetail } from './normals.js?v=167';
import { t } from './i18n.js?v=167';
import {
  TIMESTEP, FUEL_MAX, BODY_MAX, FUEL_BONUS, BODY_BONUS,
  START_DELAY_MS, BONUS_HEIGHT, BONUS_RADIUS, WORLD_SCALE, CAMERA, RESTITUTION, NITRO,
} from './params.js?v=167';

const state = {
  fuel: FUEL_MAX,
  body: BODY_MAX,
  outOfFuel: false,
  destroyed: false,
  started: false,
  finished: false,
  shown: false,
  won: false,
  paused: false,
  pickedFuel: 0,
  pickedRepair: 0,
  running: false,
  simTime: 0,
  runTime: 0,     // хронометърът: от зеленото до релсите, без паузите
  nitro: NITRO.charges,
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8d0);  // ако небето остане извън кадър
const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 1, 1000);
// Мъгла, отражения по колите и размазване при скорост (look.js).
const look = new Look(renderer, scene, camera);
// Слънце и сенки, небе, време на деня и дъжд (atmosphere.js).
const atmosphere = new Atmosphere(scene, renderer, look.fog);

const hud = new Hud(state);
const engine = new Engine();

boot().catch(err => {
  hud.fatal(err.message);
  console.error(err);
});

async function boot() {
  console.log('FFX Runner — версия', BUILD);
  checkVersion();
  hud.status(t('loadingWorld'));
  const world = await new World().load('assets/world.glb');
  scene.add(world.root);
  look.sharpen(world.root);
  world.enableShadows();
  // Прозорците по фасадите стават ниши (relief.js) — къде са, знае
  // tools/windows.py, който ги е намерил по текстурите.
  const masks = await fetch(`assets/masks/index.json?v=${BUILD}`).then(r => r.json()).catch(() => ({}));
  // Зърното на повърхностите: паваж, тухли, керемиди (normals.js). Върви
  // първо, за да го наследи и кожата на фасадите.
  const grain = applyNormals(renderer, world.root);
  const groundDetail = applyGroundDetail(renderer, world.groundMaterials());
  // Истинските ниши по стените (facade.js): където ги има, шейдърът за ниши
  // (relief.js) е излишен.
  const facades = buildFacadeDetails(world, masks);
  const relief = applyRelief(world.root, masks, facades.covered);
  // Кинотеатърът: козирка, табела и афиши на ръка (theatre.js).
  const theatre = buildTheatre(world, masks.Cinema?.wall);
  atmosphere.ground = world.groundMaterials();
  atmosphere.set(settings.time, settings.weather);
  if (world.missing.length) {
    console.warn('липсват в .glb:', world.missing);
  }

  hud.status(t('loadingCars'));
  const cars = await new GLTFLoader().loadAsync('assets/cars.glb');
  look.polishCars(cars.scene);

  // Каквото конверсията е загубила — извадено от оригиналния .dir
  // (tools/w3d/extract.py): невидимите стени и рампи, паркираните коли,
  // оградите, липсващите къщи, камерите и тригерите на сценария.
  const original = await fetch(`assets/original.json?v=${BUILD}`).then(r => r.json());
  const { barriers } = addOriginal(world, scene, original, name => buildCarModel(cars, name));

  const start = findStart(world);
  const car = new PlayerCar(world, state);
  car.placeAt(start.position, start.heading);

  const body = buildCarModel(cars, 'AutoPlayer');
  scene.add(body);

  // Джипът чака горе на надлеза, в улицата, по която маршрутът завива на
  // запад (y ≈ -820), с муцуна на изток. Точното му място е било в сцената
  // на Director, която конверсията не е пренесла, но agguato1 го издава:
  // докато играчът изкачва рампата, джипът пълзи по X към неговото платно, а
  // щом излезе горе, тръгва с +X насреща — тоест е чакал на запад от завоя.
  // Това е колата, която във видеото изскача отсреща на седмата секунда.
  const chaser = new Chaser(world, car, camera);
  const ahead = new THREE.Vector3(Math.cos(start.heading), Math.sin(start.heading), 0);
  {
    const lurk = world.probeDown(new THREE.Vector3(-115, -820, 60), 120);
    chaser.placeAt(lurk ? lurk.point.clone().setZ(lurk.point.z + 0.3)
                        : new THREE.Vector3(-115, -820, 15.3), 0);
  }
  const chaserBody = buildCarModel(cars, 'JeepCPU01');
  scene.add(chaserBody);

  // Вторият джип не гони, а причаква по маршрута — деветте места са в
  // ambusher.js, извадени от aiGoTo на оригинала.
  const ambusher = new Ambusher(world, car, camera);
  const ambusherBody = buildCarModel(cars, 'FurgoneCPU');
  scene.add(ambusherBody);

  // Третата кола не знае улиците — върви по следата, която играчът оставя.
  const trail = new Trail();
  const driver = new StreetDriver(world, car, camera, trail);
  driver.placeAt(start.position.clone().addScaledVector(ahead, -30), start.heading);
  const driverBody = buildCarModel(cars, 'AutoParcB01');
  scene.add(driverBody);

  // Всяка кола си има петно за сянка — в оригинала е отделен плосък модел.
  const shadows = [
    [car, makeShadow(scene, car.size), () => body.position],
    [chaser, makeShadow(scene, chaser.size), () => chaserBody.position],
    [ambusher, makeShadow(scene, ambusher.size), () => ambusherBody.position],
    [driver, makeShadow(scene, driver.size), () => driverBody.position],
  ];


  const particles = new Particles(scene);
  // Димът скрива фона, затова е в отделен слой с нормално смесване.
  const smoke = new Particles(scene, THREE.NormalBlending);
  const effects = new Effects(scene, particles, smoke);
  // Призракът на най-бързото измъкване (ghost.js).
  const ghost = new Ghost(scene, buildCarModel(cars, 'AutoPlayer'));

  // Мини картата: градът, сниман отгоре, и маршрутът пред колата.
  const route = await fetch(`assets/route.json?v=${BUILD}`).then(r => r.json()).catch(() => null);
  const mapCanvas = document.getElementById('minimap');
  const minimap = new Minimap(mapCanvas, route && route.points);
  // Картонените силуети на небостъргачите стават истински сгради (skyline.js).
  const skyline = buildSkyline(world, route && route.points);
  const bonuses = buildBonuses(scene);

  // Небето се мести с колата всеки кадър. За да става това в координатите на
  // играта, а не в неразвъртяното glTF пространство, го изваждаме от света и
  // го закачаме за сцената — attach пази трансформацията непроменена.
  const sky = world.objects.get('cielo') || null;
  if (sky) scene.attach(sky);
  look.keepClear(sky);
  atmosphere.replaceOldSky(sky);
  const chase = new ChaseCamera(world, car, sky);
  camera.up.set(0, 0, 1);
  camera.near = CAMERA.near;
  camera.far = CAMERA.far;
  camera.updateProjectionMatrix();

  // Сценарият: прелезите, тунелът, камионът и финалът с влака.
  const sequence = new Sequence(world, car, state, engine, chase, original);
  const truckBody = buildCarModel(cars, 'Camion');
  scene.add(truckBody);
  sequence.attachTruck(truckBody);

  // Картата се снима на дневна светлина, каквото и да е времето в играта.
  const timeNow = [atmosphere.time, atmosphere.weather];
  atmosphere.set('day', 'clear');
  minimap.capture(world, scene, [sky, atmosphere.sky, atmosphere.dome, atmosphere.rain, atmosphere.stars, ...skyline.meshes]);
  atmosphere.set(...timeNow);
  world.setZone(1);
  // Паузата — с менюто за настройки. Оригиналът спира и звуците.
  // Фаровете, стоповете и уличните лампи по маршрута (lights.js) — нощем.
  const lights = addLights(scene, world, body, [chaserBody, ambusherBody, driverBody],
    route && route.points);
  look.aoIgnore.push(...lights.glowObjects, atmosphere.rain, atmosphere.stars);
  const buildNote = document.getElementById('pause-build');
  const showBuild = () => { if (buildNote) buildNote.textContent = t('version') + BUILD; };
  showBuild();
  addEventListener('ffx-lang', showBuild);
  const menu = pauseMenu(s => {
    const preset = atmosphere.set(s.time, s.weather);
    look.setBloom(preset.bloom);
    look.setAO(s.quality === 'high');
    // Релефът е евтин и не зависи от „графика": на него стои отделен ключ,
    // за да се вижда веднага какво прави.
    const reliefOn = s.relief !== false;
    relief.setEnabled(reliefOn);
    groundDetail.setScale(reliefOn ? 1 : 0);
    grain.setScale(reliefOn ? 1 : 0);
    facades.setVisible(reliefOn);
    theatre.setVisible(reliefOn);
    // „Ниско" рисува и с по-малко пиксели — на Retina това е най-голямата печалба.
    const ratio = Math.min(devicePixelRatio, s.quality === 'high' ? 2 : 1.25);
    if (renderer.getPixelRatio() !== ratio) {
      renderer.setPixelRatio(ratio);
      look.composer.setPixelRatio(ratio);
      look.resize();
    }
    atmosphere.setShadowQuality(s.quality === 'high' ? 4096 : 2048);
    lights.setNight(atmosphere.isNight, s.weather === 'rain');
    skyline.setTime(s.time, s.weather);
    theatre.setTime(s.time, s.weather);
    look.blurOn = s.blur;
    look.fogOn = s.fog;
    ghost.enabled = s.ghost;
    minimap.enabled = s.map;
    mapCanvas.style.visibility = s.map ? 'visible' : 'hidden';
  }, { onResume: () => setPaused(false), onRestart: () => location.reload() });
  const setPaused = on => {
    if (!state.started || state.finished) return;
    state.paused = on;
    state.running = !on;
    menu.show(on);
  };
  const togglePause = () => setPaused(!state.paused);
  bindInput(car, togglePause);
  bindTouch(car, { onPause: togglePause });

  // Достъп от конзолата за настройка и диагностика.
  window.ffx = { world, car, chaser, ambusher, driver, trail, sequence, chase, scene, camera, state, bonuses, engine, THREE, barriers, original, look, renderer, ghost, minimap, atmosphere, lights, skyline, relief, grain, groundDetail, facades, theatre };

  // AttesaSemaforo.ls: светофарът стои на червено три секунди, после се
  // завърта на зелено и бягството започва.
  const light = world.objects.get('semaforo');
  hud.showMenu();

  // Началният екран е splash.bmp на оригинала. Натискането е и жестът, с
  // който браузърът позволява звук.
  let begun = false;
  const begin = () => {
    if (begun) return;
    begun = true;
    engine.resume();
    hud.hideSplash();
    mapCanvas.style.display = 'block';
    hud.countdown(START_DELAY_MS);
    setTimeout(() => {
      state.running = true;
      state.started = true;
      hud.countdown(0);
      if (light) light.rotateZ(Math.PI / 2);
    }, START_DELAY_MS);
  };
  // splash3 на оригинала: PLAY и HOW TO PLAY. Щракване където и да е или
  // клавиш също пускат играта, както беше досега.
  const howto = document.getElementById('howto');
  document.getElementById('btn-play').addEventListener('click', e => { e.stopPropagation(); begin(); });
  document.getElementById('btn-howto').addEventListener('click', e => {
    e.stopPropagation();
    howto.classList.add('on');
  });
  howto.addEventListener('click', () => howto.classList.remove('on'));
  // авторите, лицензът и езикът са линкове: щракването по тях не бива да пуска играта
  for (const el of document.querySelectorAll('#splash .credits, #splash .lang')) {
    el.addEventListener('click', e => e.stopPropagation());
  }
  document.getElementById('splash').addEventListener('click', () => {
    if (!howto.classList.contains('on')) begin();
  });
  addEventListener('keydown', e => {
    if (begun) return;
    if (howto.classList.contains('on')) { howto.classList.remove('on'); return; }
    if (['p', 'd', 'r', 'shift'].includes(e.key.toLowerCase())) return;
    begin();
  });

  // Краят: листът стои, докато не натиснеш клавиш или щракнеш — Restart.ls
  // на оригинала пуска отначало с всеки клавиш. Първата секунда се прескача,
  // за да не го затвори стрелката, която още е натисната.
  let sheetAt = 0;
  const restartSoon = () => {
    if (sheetAt && performance.now() - sheetAt > 1000) location.reload();
  };
  addEventListener('keydown', restartSoon);
  document.getElementById('over').addEventListener('click', restartSoon);
  const showSheet = reason => {
    hud.finish(reason, endTotals());
    sheetAt = performance.now();
  };

  // Симулацията е на фиксирани 25 Hz, екранът обикновено е на 60. Затова се
  // пази състоянието отпреди последната стъпка и това, което се рисува, се
  // интерполира между двете — иначе колата и камерата подскачат на всеки кадър.
  const before = {
    car: car.position.clone(), carQ: car.quaternion.clone(),
    cpu: chaser.position.clone(), cpuQ: chaser.quaternion.clone(),
    amb: ambusher.position.clone(), ambQ: ambusher.quaternion.clone(),
    drv: driver.position.clone(), drvQ: driver.quaternion.clone(),
    cam: chase.position.clone(), camQ: chase.quaternion.clone(),
  };

  let last = performance.now();
  let accumulator = 0;

  // Една стъпка на симулацията. Отделена е от рисуването, за да може
  // тестовият автопилот да превърта играта без браузърът да рисува —
  // Chrome спира requestAnimationFrame, щом прозорецът не е отпред.
  let endReason = null, endAt = 0;

  function stepOnce() {
    state.simTime += TIMESTEP;
    // Хронометърът спира, щом изходът е решен — на релсите или в капана
    // (управлението се отнема), или когато колата е унищожена. Сцените
    // влизат във времето, както и в оригинала.
    if (state.started && !state.paused && !state.finished && !sequence.controlsLocked) {
      state.runTime += TIMESTEP;
      ghost.record(car, state.runTime);
      minimap.follow(car.position);
    }

    before.car.copy(car.position);
    before.carQ.copy(car.quaternion);
    before.cpu.copy(chaser.position);
    before.cpuQ.copy(chaser.quaternion);
    before.amb.copy(ambusher.position);
    before.ambQ.copy(ambusher.quaternion);
    before.drv.copy(driver.position);
    before.drvQ.copy(driver.quaternion);
    before.cam.copy(chase.position);
    before.camQ.copy(chase.quaternion);

    // Докато тече сцена, играчът стои и колите на противника не се движат.
    const inCutscene = sequence.tickCutscene(TIMESTEP);
    const running = state.running && !state.destroyed;
    // Сценарият се буди чак след светофара, но после върви винаги.
    // Не бива да виси на state.running: самата кинематика го занулява, за
    // да спре играча, и тогава бариерата замръзва по средата на движението.
    if (state.started) sequence.update(TIMESTEP, car);

    // Докато тече сцена, колата стои наистина — замразена на място, заедно
    // с колите на противника. Само да ѝ отнемем управлението не стига: тя
    // продължава по инерция и се забива в бариерата, докато гледаш сцената.
    // А ако я спрем до нула, щом сцената свърши, противникът се забива с
    // пълна скорост в неподвижната кола. Затова скоростите се пазят и след
    // сцената всичко продължава точно оттам, където е било.
    if (sequence.controlsLocked) {
      // getKeys в DriveHuman: от седмата стъпка нататък играчът не управлява.
      car.keys.left = 0; car.keys.right = 0; car.keys.backward = 0;
      car.keys.forward = sequence.throttleLocked ? 1 : 0;
      car.keys.brake = sequence.throttleLocked ? 0 : 1;
    }
    if (!inCutscene) {
      car.step(TIMESTEP, state.simTime, running);
      effects.step(car, state);
    }
    // По време на финала играчът е без контрол — тогава колите на
    // противника спират, за да не го доубият, докато тече сцената.
    if (running && !inCutscene && !sequence.controlsLocked) {
      // Следата се пуска само по настилка, както в DriveHuman.
      if (car.surface === 'track') {
        trail.drop(car.position, car.forwardVector, state.simTime);
      }
      chaser.step(TIMESTEP, state.simTime);
      ambusher.step(TIMESTEP, state.simTime);
      driver.step(TIMESTEP, state.simTime);
      resolveCarCollision(car, chaser, state.simTime);
      resolveCarCollision(car, ambusher, state.simTime);
      resolveCarCollision(car, driver, state.simTime);
      // Оградите при канала: 50 кг срещу 600 — отхвърчат, колата само
      // леко губи скорост и поема малък удар.
      const knocked = stepBarriers(barriers, car, world, TIMESTEP);
      if (knocked) car.registerImpact('Transenna', knocked * BARRIER_IMPACT, false);
      if (car.boosting) particles.burst('nitro', car.position.clone()
        .addScaledVector(car.forwardVector, -2.2).setZ(car.position.z + 0.5));
    }
    collectBonuses(car, bonuses, particles);
    if (car.inWater) particles.burst('aqua', car.contact);
    // Сцената при прелеза държи зона 11 видима (zoneChange(11) в оригинала),
    // макар колата да е в зона 1.
    if (sequence.forcedZone) world.setZone(sequence.forcedZone);
    else followZone(world, car);
    if (car.lastImpact) {
      engine.crash(car.lastImpact.kind);
      effects.impact(car, car.lastImpact);
      car.lastImpact = null;
    }
    engine.update(car, state);
    chase.update(state.simTime, TIMESTEP);

    // Краят: каросерията на нула (animation.nextStep(12) в оригинала) или
    // изчерпано гориво (стъпка 13). И двете спират движението.
    if (state.finished && !state.shown) {
      state.shown = true;
      state.running = false;
      // Ново най-добро време — това бягане става призрак.
      const best = hud.records.bestTime;
      if (state.won && (!best || state.runTime < best)) ghost.keep(state.runTime);
      showSheet(state.won ? 'won' : 'trapped');
    }
    if (!state.finished && (state.destroyed || state.outOfFuel)) {
      state.finished = true;
      state.shown = true;
      state.running = false;
      engine.gameOver(state.destroyed ? 'explode' : 'gatewhine');
      if (state.destroyed) particles.burst('boom', car.position.clone().setZ(car.position.z + 1));
      // „Attesa 5 sec" на оригинала: сцената тече още пет секунди — взривът,
      // колата изчезва — и чак тогава идва листът с резултата.
      endReason = state.destroyed ? 'crash' : 'fuel';
      endAt = state.simTime;
    }
    if (endReason && state.simTime - endAt >= END_WAIT) {
      showSheet(endReason);
      endReason = null;
    }
  }

  const loop = now => {
    const frame = Math.min((now - last) / 1000, 0.25);
    accumulator += frame;
    last = now;

    while (accumulator >= TIMESTEP) {
      accumulator -= TIMESTEP;
      stepOnce();
    }

    const alpha = accumulator / TIMESTEP;
    body.position.lerpVectors(before.car, car.position, alpha);
    body.quaternion.slerpQuaternions(before.carQ, car.quaternion, alpha);
    chaserBody.visible = !chaser.inGarage;
    chaserBody.position.lerpVectors(before.cpu, chaser.position, alpha);
    chaserBody.quaternion.slerpQuaternions(before.cpuQ, chaser.quaternion, alpha);
    ambusherBody.position.lerpVectors(before.amb, ambusher.position, alpha);
    ambusherBody.quaternion.slerpQuaternions(before.ambQ, ambusher.quaternion, alpha);
    driverBody.position.lerpVectors(before.drv, driver.position, alpha);
    driverBody.quaternion.slerpQuaternions(before.drvQ, driver.quaternion, alpha);
    camera.position.lerpVectors(before.cam, chase.position, alpha);
    camera.quaternion.slerpQuaternions(before.camQ, chase.quaternion, alpha);
    atmosphere.update(frame, car.position, camera);
    relief.update(camera, atmosphere.lightDir);
    lights.update(state.simTime, car);
    look.update(car.velocity.length(), {
      paused: state.paused, inShot: chase.inShot, baseFov: chase.fov,
      yawRate: car.angularVelocity.z,
    });

    particles.update(frame);
    smoke.update(frame);
    ghost.show(state.runTime, state.started);
    // Attesa 5 sec.3: при взрив колата избледнява за секунда и половина.
    if (state.destroyed) fadeCar(body, 1 - (state.simTime - endAt) / 1.5);
    for (const [vehicle, shadow, drawn] of shadows) updateShadow(shadow, vehicle, drawn());
    for (const b of bonuses) if (b.visible) b.rotation.z += 0.05;

    hud.update(car, world, chaser);
    minimap.draw(car, [
      { position: chaser.position, hidden: chaser.inGarage, color: '#ff5a4f' },
      { position: ambusher.position, hidden: ambusher.inGarage, color: '#ff5a4f' },
      { position: driver.position, color: '#ff8f4f', radius: 3 },
      { position: ghost.model.position, hidden: !ghost.model.visible, color: '#7fb8ff' },
    ]);
    look.render();
  };
  renderer.setAnimationLoop(loop);

  // За записване на видео (tools/capture.js): спира часовника на браузъра и връща функция,
  // която рисува един кадър, все едно са минали `seconds` секунди. Така видеото излиза гладко,
  // колкото и бавно да се снима всеки кадър.
  window.ffx.manual = () => {
    renderer.setAnimationLoop(null);
    let clock = last;
    return seconds => { clock += seconds * 1000; loop(clock); };
  };

  // За тестове: превърта `seconds` секунди симулация наведнъж. `perStep` се
  // вика преди всяка стъпка — там автопилотът натиска клавишите. Камерата
  // се нагласява ръчно, защото без рисуване никой друг не я обновява, а
  // колите на противника гледат през нея дали са в кадър.
  window.ffx.advance = (seconds, perStep) => {
    const steps = Math.round(seconds / TIMESTEP);
    for (let k = 0; k < steps; k++) {
      if (perStep && perStep() === false) break;
      stepOnce();
      camera.position.copy(chase.position);
      camera.quaternion.copy(chase.quaternion);
      camera.updateMatrixWorld();
    }
  };

  // Записвачът за тестове (tools/recorder.js) се включва веднъж от конзолата
  // и после оцелява при R: флагът му е в sessionStorage.
  let recording = false;
  try { recording = !!sessionStorage.getItem('ffx-rec-on'); } catch { /* забранено */ }
  if (recording) {
    import(`../tools/recorder.js?v=${BUILD}`)
      .then(m => m.start(window.ffx))
      .catch(err => console.warn('записвачът не тръгна:', err));
  }
}

/** Стартът е на светофара — зона 1, точно както в оригинала. */
function findStart(world) {
  const light = world.objects.get('semaforo');
  const probe = new THREE.Vector3();
  if (light) {
    light.getWorldPosition(probe);
  } else {
    probe.set(-17, -974, 40);
  }
  probe.z += 30;

  // Сваляме колата на пътя под светофара.
  const hit = world.probeDown(probe, 120);
  const position = hit ? hit.point.clone().setZ(hit.point.z + 0.5) : probe;
  return { position, heading: START_HEADING };
}

// Колко секунди след взрив или празен резервоар до листа с резултата.
const END_WAIT = 5;

function fadeCar(model, opacity) {
  const k = Math.max(0, Math.min(1, opacity));
  model.traverse(c => {
    if (!c.isMesh) return;
    for (const m of [].concat(c.material)) {
      if (!m) continue;
      m.transparent = true;
      m.opacity = k;
    }
  });
  model.visible = k > 0.01;
}

// Каква част от скоростта на колата се брои за удар в ограда. Тя е 50 кг и
// отстъпва веднага — Havok би дал малко, не цялата скорост на колата.
const BARRIER_IMPACT = 0.4;

// Посоката на старта не е записана в скриптовете — светофарът гледа натам.
const START_HEADING = Math.PI / 2;

// cars.glb е в същия мащаб като света, затова се умножава по WORLD_SCALE като
// него. В cars.blend обаче колите са наредени една до друга около началото на
// координатите и всяка е с дължината си по Y, докато forward в Director е +X —
// затова моделът се центрира върху себе си и се завърта.
const MODEL_YAW = -Math.PI / 2;

function buildCarModel(cars, name) {
  const group = new THREE.Group();
  const source = cars.scene.getObjectByName(name);
  if (!source) { console.warn(name + ' липсва в cars.glb'); return group; }

  const model = source.clone(true);
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);

  // glTF е Y-нагоре, светът тук е Z-нагоре.
  const holder = new THREE.Group();
  holder.rotation.x = Math.PI / 2;
  holder.scale.setScalar(WORLD_SCALE);
  holder.add(model);

  // Начало в средата по X/Y и в основата по Z — както е в оригиналния модел.
  const probe = new THREE.Group();
  probe.add(holder);
  probe.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(probe);
  const centre = box.getCenter(new THREE.Vector3());
  holder.position.set(-centre.x, -centre.y, -box.min.z);

  const yaw = new THREE.Group();
  yaw.rotation.z = MODEL_YAW;
  yaw.add(holder);
  group.add(yaw);
  return group;
}

function buildBonuses(scene) {
  const fuelMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x6b4c00 });
  const repairMat = new THREE.MeshStandardMaterial({ color: 0x6fd3ff, emissive: 0x004a66 });
  const geo = new THREE.OctahedronGeometry(1.2);   // колата е 3.8 фута

  return BONUSES.map(b => {
    const mesh = new THREE.Mesh(geo, b.type === 'benz' ? fuelMat : repairMat);
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2] + BONUS_HEIGHT);
    mesh.userData.type = b.type;
    scene.add(mesh);
    return mesh;
  });
}

function collectBonuses(car, bonuses, particles) {
  for (const b of bonuses) {
    if (!b.visible) continue;
    if (b.position.distanceToSquared(car.position) > BONUS_RADIUS * BONUS_RADIUS) continue;
    b.visible = false;
    particles.burst('bonus', b.position);
    if (b.userData.type === 'benz') {
      state.fuel = Math.min(state.fuel + FUEL_BONUS, FUEL_MAX);
      state.pickedFuel++;
      state.nitro = Math.min(state.nitro + 1, NITRO.max);   // бидонът зарежда и нитрото
      engine.pickup('benz');
    } else {
      state.body = Math.min(state.body + BODY_BONUS, BODY_MAX);
      state.pickedRepair++;
      engine.pickup('mecc');
    }
  }
}

// Двете коли са твърди тела само една за друга — светът ги спира с лъчи, но
// помежду си се разделят като две сфери. Ударът влиза в havok_callback на
// играча с име, съдържащо "CPU", за да мине по клона за щети от преследвача.
function resolveCarCollision(car, chaser, simTime) {
  if (chaser.inGarage) return;
  const delta = car.position.clone().sub(chaser.position);
  const reach = car.radius + chaser.radius;
  const dist = delta.length();
  if (dist >= reach || dist < 1e-4) { chaser.touchingPlayer = false; return; }

  // Havok подава сблъсък като събитие, не на всеки кадър, докато двете тела се
  // допират. Ако начисляваме щети непрекъснато, едно продължително остъргване
  // изяжда половината каросерия — затова броим само започването на допира.
  const firstTouch = !chaser.touchingPlayer;
  chaser.touchingPlayer = true;

  // Разделянето е само по хоризонтала — две коли се избутват настрани,
  // не се изстрелват нагоре.
  const n = delta.setZ(0);
  if (n.lengthSq() < 1e-6) return;
  n.normalize();
  const overlap = reach - dist;
  car.position.addScaledVector(n, overlap / 2);
  chaser.position.addScaledVector(n, -overlap / 2);

  const closing = chaser.velocity.dot(n) - car.velocity.dot(n);
  if (closing <= 0) return;

  const exchange = closing * (1 + RESTITUTION) / 2;
  car.velocity.addScaledVector(n, exchange);
  chaser.velocity.addScaledVector(n, -exchange);

  if (firstTouch) {
    car.registerImpact('JeepCPU01', closing, false);
    chaser.onHitPlayer(simTime);
  }
}

/** Сверява версията на заредената страница с тази на диска.
 *
 *  index.html няма версия в адреса си, а Apache праща само Last-Modified —
 *  браузърът спокойно я кешира и тогава се зарежда стар main.js с нови
 *  модули или обратно. Затова питаме за version.txt без кеш и, ако не
 *  съвпада, презареждаме веднъж с нов адрес.
 */
async function checkVersion() {
  try {
    const res = await fetch('version.txt', { cache: 'no-store' });
    const latest = (await res.text()).trim();
    if (!latest || latest === BUILD) return;
    if (new URL(location.href).searchParams.get('v') === latest) return;
    console.warn(`страницата е кеширана (${BUILD}), презареждам на ${latest}`);
    location.replace(`${location.pathname}?v=${latest}`);
  } catch { /* няма version.txt — нищо страшно */ }
}

function endTotals() {
  return {
    fuelMax: FUEL_MAX, bodyMax: BODY_MAX,
    fuelBonuses: BONUSES.filter(b => b.type === 'benz').length,
    repairBonuses: BONUSES.filter(b => b.type === 'mecc').length,
  };
}

function followZone(world, car) {
  const zone = world.zoneFromObjectName(car.objectUnder);
  if (zone) world.setZone(zone);
}

function bindInput(car, togglePause) {
  const keys = {
    ArrowUp: 'forward', ArrowDown: 'backward',
    ArrowLeft: 'left', ArrowRight: 'right', ' ': 'brake', Shift: 'nitro',
  };
  const set = (e, value) => {
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    car.keys[action] = value;
  };
  addEventListener('keydown', e => { engine.resume(); set(e, 1); });
  addEventListener('keyup', e => set(e, 0));

  // keyManager от Initialize.ls: P спира играта, R започва отначало.
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'p' && !state.finished) togglePause();
    if (k === 'r') location.reload();
  });
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  look.resize();
});
