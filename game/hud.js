// HUD — двете ленти на оригинала, плюс диагностичен панел.
//
// Overlay.ls рисува четири текстури върху камерата: подложка и пълнеж за
// горивото (Power) и за каросерията (Energy). Пълнежът се движи към целта по
// една стъпка на кадър, а подложката мига, когато стойността е в последната
// пета от обхвата. Тук същото е направено с DOM, защото изходните PSD-та на
// лентите не са минали през конверсията.

const BLINK_FRACTION = 1 / 5;   // powerBlink / energyBlink в Overlay.ls

// Версията от адреса на модула — показва се в диагностиката, за да се вижда
// веднага дали браузърът не сервира стар кеширан файл.
export const BUILD = new URL(import.meta.url).searchParams.get('v') || '?';
import { NITRO } from './params.js?v=163';

/** 02:49.13 — както хронометърът в записите на оригинала. */
export function formatTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const m = Math.floor(cs / 6000);
  const sec = Math.floor(cs / 100) % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

// Рекордите стоят в браузъра на играча. Всяко четене и писане е в try:
// в частен прозорец хранилището може да липсва или да хвърля грешка —
// тогава играта просто върви без рекорди.
const RECORDS_KEY = 'ffx-records';
const KMH_PER_UNIT = 3.6;

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || {}; } catch { return {}; }
}

function saveRecords(records) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch { /* няма хранилище */ }
}

export class Hud {
  constructor(state) {
    this.state = state;
    this.fuelShown = state.fuel;
    this.bodyShown = state.body;
    this.blink = 0;

    this.el = {
      status: document.getElementById('status'),
      countdown: document.getElementById('countdown'),
      fuel: document.getElementById('fuel-fill'),
      fuelBar: document.getElementById('fuel-bar'),
      body: document.getElementById('body-fill'),
      bodyBar: document.getElementById('body-bar'),
      debug: document.getElementById('debug'),
      splash: document.getElementById('splash'),
      timer: document.getElementById('timer'),
      timerNow: document.getElementById('timer-now'),
      timerBest: document.getElementById('timer-best'),
      nitro: document.getElementById('nitro'),
      speedo: document.getElementById('speedo'),
      speedoValue: document.getElementById('speedo-value'),
    };
    this.nitroShown = null;
    this.records = loadRecords();
    this.showRecords();
  }

  /** Рекордите под хронометъра и на началния екран. */
  showRecords() {
    const r = this.records;
    const best = r.bestTime ? 'рекорд ' + formatTime(r.bestTime) : '';
    this.el.timerBest.textContent = best;
    const parts = [];
    if (r.bestTime) parts.push('най-добро време ' + formatTime(r.bestTime));
    if (r.bestPoints) parts.push('най-много точки ' + r.bestPoints.toLocaleString('bg'));
    const splash = document.getElementById('splash-records');
    if (splash) splash.textContent = parts.join(' · ');
  }

  /** Началният екран е splash.bmp на оригинала. */
  hideSplash() {
    if (this.el.splash) this.el.splash.style.display = 'none';
    this.el.timer.style.display = 'block';
    this.el.speedo.style.display = 'block';
  }

  status(text) {
    // Докато е началният екран, съобщенията вървят под картината му —
    // както „Please wait..." в оригинала.
    const press = document.getElementById('splash-press');
    if (press && this.el.splash && this.el.splash.style.display !== 'none' && !this.ready) {
      press.textContent = text || 'моля, изчакай…';
      return;
    }
    this.el.status.textContent = text ?? '';
    this.el.status.style.display = text ? 'block' : 'none';
  }

  /** Всичко е заредено: от „LOADING..." към менюто с PLAY и HOW TO PLAY. */
  showMenu() {
    this.ready = true;
    document.getElementById('splash-img').src = 'assets/ui/menu.png';
    document.getElementById('btn-play').hidden = false;
    document.getElementById('btn-howto').hidden = false;
    document.getElementById('splash-press').textContent = 'натисни PLAY или който и да е клавиш';
  }

  fatal(message) {
    this.status('ГРЕШКА: ' + message);
    this.el.status.classList.add('error');
  }

  /** Екранът с резултата — формулата е от "BehaviorScript 46 - Calcolo punti". */
  finish(reason, totals) {
    const s = this.state;
    const pct = (v, max) => Math.round(v * 100 / max) + '%';
    const points = Math.round(
      s.fuel + s.body * s.pickedRepair + 121 * s.pickedFuel + 121 * s.pickedRepair);

    // Времето е на самото бягане: от зеления светофар до релсите (или до
    // края), без паузите. simTime тече от зареждането на страницата.
    const time = formatTime(s.runTime);
    const put = (id, label, value) => {
      document.getElementById(id).innerHTML = `<span>${label}</span><b>${value}</b>`;
    };
    // „Residual:" — какво е останало; „Collect:" — какво е събрано.
    put('c-fuel', 'гориво', pct(s.fuel, totals.fuelMax));
    put('c-body', 'каросерия', pct(s.body, totals.bodyMax));
    put('c-fuelbonus', 'бидони', `${s.pickedFuel} / ${totals.fuelBonuses}`);
    put('c-repair', 'ремонти', `${s.pickedRepair} / ${totals.repairBonuses}`);
    document.getElementById('c-time').textContent = time;

    // Текстовете са от .dir: „Congratulations, you win!!", „Status: You was
    // captured.", „Status: Car destroyed, you lose.", „Status: Out of fuel,
    // you lose." и под загубите — „Mission fail: Try again!".
    const [title, sub] = {
      won: ['Поздравления, ти спечели!!', ''],
      trapped: ['Заловен си.', 'Мисията се провали: опитай пак!'],
      crash: ['Колата е унищожена — губиш.', 'Мисията се провали: опитай пак!'],
      fuel: ['Горивото свърши — губиш.', 'Мисията се провали: опитай пак!'],
    }[reason] || ['Край', ''];
    const titleEl = document.getElementById('over-title');
    titleEl.textContent = title;
    titleEl.classList.toggle('won', reason === 'won');
    document.getElementById('over-sub').textContent = sub;
    document.getElementById('over-points').textContent = points.toLocaleString('bg');

    // Време се брои за рекорд само при измъкване; точки — при всеки край.
    const r = this.records;
    const newTime = reason === 'won' && (!r.bestTime || s.runTime < r.bestTime);
    const newPoints = points > 0 && (!r.bestPoints || points > r.bestPoints);
    if (newTime) r.bestTime = +s.runTime.toFixed(2);
    if (newPoints) r.bestPoints = points;
    r.runs = (r.runs || 0) + 1;
    if (reason === 'won') r.wins = (r.wins || 0) + 1;
    saveRecords(r);
    this.showRecords();

    const record = (id, isNew, label, value) => {
      const el = document.getElementById(id);
      el.innerHTML = `<small>${label}</small>` +
        (isNew ? `<b class="new">нов рекорд!</b>` : value ? `<b>${value}</b>` : '<b>—</b>');
    };
    record('c-besttime', newTime, 'рекорд време', r.bestTime ? formatTime(r.bestTime) : '');
    record('c-bestpoints', newPoints, 'рекорд точки', r.bestPoints ? r.bestPoints.toLocaleString('bg') : '');
    document.getElementById('over').style.display = 'flex';
  }

  countdown(ms) {
    if (!ms) { this.el.countdown.style.display = 'none'; return; }
    this.el.countdown.style.display = 'block';
    const started = performance.now();
    const tick = () => {
      const left = ms - (performance.now() - started);
      if (left <= 0) { this.el.countdown.style.display = 'none'; return; }
      this.el.countdown.textContent = Math.ceil(left / 1000);
      requestAnimationFrame(tick);
    };
    tick();
  }

  update(car, world, chaser) {
    const s = this.state;
    this.el.timerNow.textContent = formatTime(s.runTime);
    // Физиката е във футове (гравитацията е -32), но градът не е в този
    // мащаб: колата е 3.8 единици дълга — колкото истинска кола в метри.
    // Скоростомерът е по онова, което се вижда, тоест единица = метър.
    const kmh = Math.round(Math.abs(car.speed || 0) * KMH_PER_UNIT);
    if (kmh !== this.kmhShown) {
      this.kmhShown = kmh;
      this.el.speedoValue.textContent = kmh;
    }
    this.el.speedo.classList.toggle('boost', !!car.boosting);
    const nitro = `${s.nitro}${car.boosting ? '+' : ''}`;
    if (nitro !== this.nitroShown) {
      this.nitroShown = nitro;
      this.el.nitro.innerHTML = 'нитро ' + '●'.repeat(s.nitro) + '<i>' + '●'.repeat(Math.max(0, NITRO.max - s.nitro)) + '</i>';
      this.el.nitro.classList.toggle('on', car.boosting);
    }

    // Пълнежът пълзи към стойността, вместо да скача — както в оригинала.
    this.fuelShown += Math.sign(s.fuel - this.fuelShown) * Math.max(1, Math.abs(s.fuel - this.fuelShown) / 24);
    if (s.body < this.bodyShown) this.bodyShown -= 1;
    else this.bodyShown += Math.max((s.body - this.bodyShown) / 2, 0);

    // Скалите са растерите на оригинала: пълната се изрязва до стойността.
    // Тази отдясно се пълни в обратната посока, както е и в Overlay.ls.
    const fuelPct = Math.max(0, Math.min(100, this.fuelShown / 40));
    const bodyPct = Math.max(0, Math.min(100, this.bodyShown));
    this.el.fuel.style.clipPath = `inset(0 ${100 - fuelPct}% 0 0)`;
    this.el.body.style.clipPath = `inset(0 0 0 ${100 - bodyPct}%)`;

    this.blink = (this.blink + 1) % 3;
    const dim = this.blink ? '0.5' : '1';
    this.el.fuelBar.style.opacity = fuelPct < BLINK_FRACTION * 100 ? dim : '1';
    this.el.bodyBar.style.opacity = bodyPct < BLINK_FRACTION * 100 ? dim : '1';

    if (!this.el.debug.classList.contains('on')) return;
    const p = car.position;
    this.el.debug.textContent =
      `зона      ${world.currentZone}\n` +
      `под колата ${car.objectUnder || '—'}\n` +
      `настилка  ${car.surface}\n` +
      `височина  ${car.height.toFixed(2)}\n` +
      `скорост   ${car.speed.toFixed(1)} ft/s  (${(car.speed * 1.097).toFixed(0)} km/h)\n` +
      `плъзгане  ${car.slideSpeed.toFixed(1)}\n` +
      `позиция   ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}\n` +
      `гориво    ${Math.round(s.fuel)}\n` +
      `каросерия ${Math.round(s.body)}\n` +
      `бонуси    ⛽ ${s.pickedFuel}  🔧 ${s.pickedRepair}\n` +
      (chaser ? `джип      ${chaser.status} · ${chaser.action}` +
                `${chaser.inGarage ? ' · извън сцената' : ''}\n` +
                `  на       ${chaser.position.distanceTo(car.position).toFixed(0)} ft` +
                `  ${chaser.isHidden() ? '(извън кадър)' : '(в кадър)'}\n` : '') +
      `версия    ${BUILD}`;
  }
}
