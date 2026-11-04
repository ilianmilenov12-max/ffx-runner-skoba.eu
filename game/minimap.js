// Мини карта в горния десен ъгъл. Няма я в оригинала — там маршрутът не е
// указан никъде и се разбира само с каране.
//
// Картата е самият град, сниман отгоре веднъж при зареждане. Върху нея:
// маршрутът пред колата (записан от истинско каране, assets/route.json),
// колите на противника и призракът. Завърта се така, че колата винаги
// гледа нагоре.

import * as THREE from 'three';

// Покрива целия маршрут с малко отгоре; около два фута на пиксел.
const BOUNDS = { minX: -850, maxX: 1150, minY: -1850, maxY: 650 };
const IMAGE_W = 1024;
const RADIUS_FT = 320;           // колко фута във всяка посока се виждат
const AHEAD_FT = 900;            // докъде напред се рисува маршрутът
const REACH_FT = 45;             // толкова близо до точка — минава на следващата

export class Minimap {
  constructor(canvas, route) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.route = route || [];
    this.index = 0;
    this.image = null;
    this.enabled = true;
    const w = BOUNDS.maxX - BOUNDS.minX, h = BOUNDS.maxY - BOUNDS.minY;
    this.ftPerPx = w / IMAGE_W;
    this.imageH = Math.round(h / this.ftPerPx);
  }

  /** Снима града отгоре с отделен рендерер — веднъж, при зареждане. */
  capture(world, scene, hide = []) {
    const w = BOUNDS.maxX - BOUNDS.minX, h = BOUNDS.maxY - BOUNDS.minY;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(IMAGE_W, this.imageH);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 1, 3000);
    cam.position.set((BOUNDS.minX + BOUNDS.maxX) / 2, (BOUNDS.minY + BOUNDS.maxY) / 2, 1500);
    cam.up.set(0, 1, 0);
    cam.lookAt(cam.position.x, cam.position.y, 0);

    // Всички зони видими, без мъгла, небе и фон.
    const zones = world.zones.map(z => z.visible);
    world.zones.forEach(z => { z.visible = true; });
    const fog = scene.fog, bg = scene.background;
    scene.fog = null;
    scene.background = new THREE.Color(0x151a24);
    const hidden = hide.filter(Boolean).map(o => [o, o.visible]);
    hidden.forEach(([o]) => { o.visible = false; });

    renderer.render(scene, cam);
    const image = document.createElement('canvas');
    image.width = IMAGE_W;
    image.height = this.imageH;
    image.getContext('2d').drawImage(renderer.domElement, 0, 0);
    this.image = image;

    world.zones.forEach((z, i) => { z.visible = zones[i]; });
    scene.fog = fog;
    scene.background = bg;
    hidden.forEach(([o, v]) => { o.visible = v; });
    renderer.dispose();
    renderer.forceContextLoss();
  }

  /** Докъде по маршрута е стигнала колата — само напред. */
  follow(pos) {
    const r = this.route;
    if (!r.length) return;
    let best = this.index, bestD = Infinity;
    for (let k = this.index; k < Math.min(r.length, this.index + 14); k++) {
      const d = Math.hypot(r[k][0] - pos.x, r[k][1] - pos.y);
      if (d < bestD) { bestD = d; best = k; }
    }
    this.index = best;
    if (bestD < REACH_FT && this.index < r.length - 1) this.index++;
  }

  draw(car, others = []) {
    const c = this.canvas, ctx = this.ctx;
    const size = c.width;
    ctx.clearRect(0, 0, size, size);
    if (!this.enabled || !this.image) return;

    const pos = car.position;
    const fwd = car.forwardVector;
    const heading = Math.atan2(fwd.y, fwd.x);
    const scale = (size / 2) / RADIUS_FT;              // пиксела на фут
    const toMap = (x, y) => [(x - pos.x) * scale, -(y - pos.y) * scale];

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#151a24';
    ctx.fillRect(0, 0, size, size);

    ctx.translate(size / 2, size / 2);
    ctx.rotate(heading - Math.PI / 2);

    // Градът.
    const ix = (pos.x - BOUNDS.minX) / this.ftPerPx;
    const iy = (BOUNDS.maxY - pos.y) / this.ftPerPx;
    const k = this.ftPerPx * scale;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.image, -ix * k, -iy * k, this.image.width * k, this.image.height * k);
    ctx.globalAlpha = 1;

    // Маршрутът пред колата.
    const r = this.route;
    if (r.length) {
      ctx.beginPath();
      let [x0, y0] = toMap(pos.x, pos.y);
      ctx.moveTo(x0, y0);
      let dist = 0, px = pos.x, py = pos.y;
      for (let i = this.index; i < r.length && dist < AHEAD_FT; i++) {
        dist += Math.hypot(r[i][0] - px, r[i][1] - py);
        px = r[i][0]; py = r[i][1];
        const [x, y] = toMap(px, py);
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = Math.max(3, size / 45);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
      ctx.stroke();
    }

    // Противникът и призракът.
    for (const o of others) {
      if (!o || o.hidden) continue;
      const [x, y] = toMap(o.position.x, o.position.y);
      if (Math.hypot(x, y) > size / 2) continue;
      ctx.beginPath();
      ctx.arc(x, y, o.radius || 4, 0, Math.PI * 2);
      ctx.fillStyle = o.color;
      ctx.fill();
    }
    ctx.restore();

    // Колата — винаги в центъра, с муцуната нагоре.
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    const s = size / 22;
    ctx.moveTo(0, -s * 1.3);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s * 0.5);
    ctx.lineTo(-s, s);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0a0d13';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(223, 229, 240, 0.35)';
    ctx.stroke();
  }
}
