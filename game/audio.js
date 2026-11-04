// Двигателят — пренаписан soundController от "BehaviorScript 33 - DriveHuman".
//
// Оригиналът няма питч-шифт: звукът на двигателя е верига от отделни семпли
// (на празен ход, пет предавки, превключване нагоре и надолу, буксуване,
// презвъртане), които се подменят според скоростта и според това дали
// текущият семпъл е на свършване. Затова и колата звучи както звучи — тук
// машината на състоянията е пренесена такава, каквато е.

import { CAR } from './params.js?v=167';

// sndList от beginSprite: състояние → файл.
const SAMPLES = {
  prima: '1', seconda: '2', terza: '3', quarta: '4', quinta: '5',
  sgommata: 'sgommata', fuorigiri: 'fuorigiri', minimo: 'minimo',
  ridotta: 'ridotta', medio: 'medio', manetta: 'manetta',
  scalatina: 'AsfaltoToErba', scalata: 'scalata', retro: 'retro+loop',
  frenata: 'freno', slittamento: 'screech',
  crash1: 'crash3', crash2: 'crash',
  impatto1: 'crash1', impatto2: 'impatto', impatto3: 'crash4',
  impattosuolo: 'impatto', ribaltamento: 'ribaltamento',
  benz: 'Benz', mecc: 'Mecc', explode: 'EXPLODE', gatewhine: 'gatewhine',
  treno: 'Treno', camion: 'SFXCamion',
};

const SND_OVERLAP = 0.150;   // sndOverlap = 150 ms
const SLIDING_SPEED = 5;     // sndSlidingSpeed
const BRAKES_SPEED = 25;     // sndBrakesSpeed

// sndGearSpeed: праг на скоростта → предавка. realMaxSpeed = pMaxSpeed / 3.
const realMax = CAR.maxSpeed / 3;
const GEARS = [
  [0, 'retro'],
  [Math.trunc(realMax / 5), 'prima'],
  [Math.trunc(realMax / 3), 'seconda'],
  [Math.trunc(realMax / 2), 'terza'],
  [Math.trunc(realMax * 2 / 3), 'quarta'],
  [CAR.maxSpeed * 10, 'quinta'],
];

const gearAt = index => GEARS[index - 1][0];          // getPropAt(n)

function gearNear(speed) {                            // findPosNear
  let best = GEARS[0], bestDist = Infinity;
  for (const g of GEARS) {
    const d = Math.abs(g[0] - speed);
    if (d < bestDist) { bestDist = d; best = g; }
  }
  return best[1];
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.ready = false;

    this.status = 'minimo';       // sndStatus
    this.engineWait = 0;          // sndEngineWait
    this.collisionWait = 0;       // sndCollisionWait
    this.brakes = false;          // sndBrakes
    this.current = null;          // активният източник на канала за двигателя
    this.effects = null;
  }

  /** Браузърите пускат звук чак след действие на потребителя. */
  async resume() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    this.ctx = new AudioContext();
    await Promise.all(Object.values(SAMPLES).map(async name => {
      if (this.buffers.has(name)) return;
      const res = await fetch(`assets/sfx/${encodeURIComponent(name)}.wav`);
      this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
    }));
    this.ready = true;
    this.nextStatus('minimo');
  }

  /** sndNextStatus: сменя семпъла; percentage казва каква част от него да се чуе. */
  nextStatus(status, percentage) {
    this.status = status;
    if (!this.ready) return;
    const buffer = this.buffers.get(SAMPLES[status]);
    if (!buffer) return;

    this.current?.source.stop();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    if (status === 'retro') { source.loop = true; source.loopStart = 2.724; }
    source.connect(this.ctx.destination);
    const offset = percentage === undefined ? 0 : buffer.duration * (1 - percentage);
    source.start(0, offset);
    this.current = { source, buffer, startedAt: this.ctx.currentTime, offset };
    this.engineWait = 2;
  }

  get elapsed() {
    if (!this.current) return 0;
    return this.current.offset + (this.ctx.currentTime - this.current.startedAt);
  }

  get nearlyFinished() {
    if (!this.current) return true;
    return this.current.buffer.duration - this.elapsed < SND_OVERLAP;
  }

  get percentage() {
    if (!this.current) return 0;
    return this.elapsed / this.current.buffer.duration;
  }

  update(car, state) {
    if (!this.ready || !state.running) return;
    if (this.collisionWait > 0) this.collisionWait--;
    if (this.engineWait > 0) { this.engineWait--; return; }

    let running = 0;
    if (this.collisionWait === 0) {
      if (car.input.forward) running = 1;
      else if (car.input.backward) running = -1;
    }

    const airborne = car.height >= CAR.maxHeight;
    const grass = car.surface === 'grass';
    const speed = Math.abs(car.speed);
    const near = this.nearlyFinished;

    if (airborne) {
      this._airborne(running, near);
      this._stopEffects();
      return;
    }
    this._grounded(car, running, near, grass, speed);
    this._effects(car, speed);
  }

  _airborne(running, near) {
    switch (this.status) {
      case 'minimo': if (running) this.nextStatus('sgommata'); break;
      case 'fuorigiri': if (!running) this.nextStatus('scalata'); break;
      case 'sgommata':
        if (running) { if (near) this.nextStatus('fuorigiri'); }
        else this.nextStatus('scalata', this.percentage);
        break;
      case 'scalata':
        if (!running) { if (near) this.nextStatus('minimo'); }
        else this.nextStatus('sgommata');
        break;
      default: this.nextStatus(running ? 'sgommata' : 'scalata');
    }
  }

  _grounded(car, running, near, grass, speed) {
    const down = pct => this.nextStatus('scalata', pct);
    switch (this.status) {
      case 'retro':
        if (running === 1) this.nextStatus('prima');
        else if (running === 0) this.nextStatus('minimo');
        break;
      case 'minimo':
        if (running === 1) this.nextStatus(grass ? 'ridotta' : 'prima');
        else if (running === -1 && car.speed <= 0) this.nextStatus('retro');
        break;
      case 'medio':
        if (running === 1) { if (!grass) this.nextStatus('seconda'); }
        else down(0.8);
        break;
      case 'ridotta':
        if (running === 1) {
          if (!grass) this.nextStatus('seconda');
          else if (near) this.nextStatus('medio');
        } else down(0.8);
        break;
      case 'prima':
        if (running === 1) {
          if (grass) this.nextStatus('ridotta');
          else if (near || speed > gearAt(2)) this.nextStatus('seconda');
        } else down(0.8);
        break;
      case 'seconda':
        if (running === 1) {
          if (grass) this.nextStatus('scalatina', 0.8);
          else if (near || speed > gearAt(3)) this.nextStatus('terza');
        } else down(0.6);
        break;
      case 'terza':
        if (running === 1) {
          if (grass) this.nextStatus('scalatina', 0.6);
          else if (near || speed > gearAt(4)) this.nextStatus('quarta');
        } else down(0.4);
        break;
      case 'quarta':
        if (running === 1) {
          if (grass) this.nextStatus('scalatina', 0.2);
          else if (near || speed > gearAt(5)) this.nextStatus('quinta');
        } else down(0.2);
        break;
      case 'quinta':
        if (running === 1) {
          if (grass) this.nextStatus('scalatina');
          else if (near) this.nextStatus('manetta');
        } else down();
        break;
      case 'manetta':
        if (running <= 0) down();
        else if (grass) this.nextStatus('scalatina');
        break;
      case 'fuorigiri':
      case 'sgommata':
        if (!running) down();
        else this.nextStatus(gearNear(Math.trunc(speed)));
        break;
      case 'scalata':
        if (running === 1) this.nextStatus(gearNear(Math.trunc(speed)));
        else if (running === -1 && car.speed <= 0) this.nextStatus('retro');
        else if (near) this.nextStatus('minimo');
        break;
      case 'scalatina':
        if (running === 1) {
          if (!grass) this.nextStatus('seconda');
          else if (near) this.nextStatus('medio');
        } else down(0.6);
        break;
    }
  }

  _effects(car, speed) {
    if (car.input.brake) {
      if (!this.brakes && speed > BRAKES_SPEED) {
        this._playEffect('frenata');
        this.brakes = true;
      }
    } else {
      this.brakes = false;
    }

    const skidding = Math.abs(car.slideSpeed) > SLIDING_SPEED || car.sgommata;
    if (skidding) {
      if (!this.effects && car.surface === 'track') this._playEffect('slittamento');
    } else if (!this.brakes) {
      this._stopEffects();
    }
  }

  _playEffect(status) {
    const buffer = this.buffers.get(SAMPLES[status]);
    if (!buffer) return;
    this.effects?.stop();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.onended = () => { if (this.effects === source) this.effects = null; };
    source.start();
    this.effects = source;
  }

  _stopEffects() {
    if (!this.effects) return;
    this.effects.stop();
    this.effects = null;
  }

  crash(kind) {
    this._oneShot(kind);
    this.collisionWait = 1;
  }

  pickup(type) { this._oneShot(type === 'benz' ? 'benz' : 'mecc'); }

  /** Звуците на сценария: влакът и камионът, по канал 8 в оригинала. */
  sequence(name) { this._oneShot(name); }

  /** Краят: взрив или замиращ двигател, и тишина след това. */
  gameOver(sample) {
    this.current?.source.stop();
    this.current = null;
    this._stopEffects();
    this._oneShot(sample);
  }

  _oneShot(status) {
    if (!this.ready) return;
    const buffer = this.buffers.get(SAMPLES[status]);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start();
  }
}
