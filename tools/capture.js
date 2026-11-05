// Записва видео от играта за Instagram (рийл 1080×1920). Не е част от играта.
//
// Автопилотът (autopilot.js) кара, а всеки кадър се рисува ръчно през ffx.manual():
// часовникът на браузъра е спрян и кадърът е точно 1/fps секунди след предишния,
// колкото и бавно да се снима. Кадърът (картината на играта, мини картата и
// надписите от `overlay`) отива като JPEG на tools/rec_server.py → tools/shots/.
//
//   const cap = await import('./tools/capture.js?t=' + Date.now());
//   await cap.capture(window.ffx, { seconds: 17, overlay: cap.reelOverlay });
//
// После: swift encode.swift tools/shots/<папка> reel.mp4

const W = 1080, H = 1920;

export async function capture(ffx, { seconds, fps = 30, prefix = 'f', overlay = null,
  server = 'http://127.0.0.1:8799', start = 0, fromStep = null } = {}) {
  // Карането: записаното (?replay=<име>, tools/inputs.js) или автопилотът.
  let drive = null, pilot = null;
  if (ffx.replay) {
    // превъртане до първия кадър без рисуване: клавишите ги слага ffx.onStep
    if (fromStep != null && fromStep > ffx.state.step) ffx.advance((fromStep - ffx.state.step) * 0.04);
  } else {
    const ap = await import('./autopilot.js?t=' + Date.now());
    pilot = await ap.createPilot(ffx, { invulnerable: true, infiniteFuel: true });
    // функцията, която натиска клавишите: autopilot.js я дава само на ffx.advance
    const advance = ffx.advance;
    ffx.advance = (s, perStep) => { drive = perStep; };
    pilot.run(0);
    ffx.advance = advance;
  }

  // картината на играта точно в 1080×1920
  const { renderer, look } = ffx;
  const ratio = W / innerWidth;
  renderer.setPixelRatio(ratio);
  look.composer.setPixelRatio(ratio);
  look.resize();

  const step = ffx.manual();
  const comp = document.createElement('canvas');
  comp.width = W; comp.height = H;
  const ctx = comp.getContext('2d');
  const total = Math.round(seconds * fps);
  const t0 = performance.now();
  for (let f = 0; f < total; f++) {
    drive?.();
    step(1 / fps);
    ctx.drawImage(renderer.domElement, 0, 0, W, H);
    overlay?.(ctx, start + f / fps, ffx);
    const blob = await new Promise(r => comp.toBlob(r, 'image/jpeg', 0.92));
    await fetch(`${server}/shot?name=${prefix}${String(f).padStart(4, '0')}`, { method: 'POST', body: blob });
    if (f % fps === 0) console.log(`кадър ${f}/${total}, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  }
  return { frames: total, step: ffx.state.step, runTime: ffx.state.runTime, ...(pilot ? pilot.status() : {}) };
}

// ── Надписите на рийла, в стила на Скоба (жълто, черно, тесни главни букви) ──

const INK = '#141414', YELLOW = '#FFC21A', CREAM = '#F2EFE8';
const HEAD = '"Sofia Sans Extra Condensed"', MONO = '"JetBrains Mono"';

export async function loadFonts(base = '/skoba/assets/fonts/') {
  const faces = [
    ['Sofia Sans Extra Condensed', 'sofia-sans-extra-condensed-700-900', '700 900'],
    ['JetBrains Mono', 'jetbrains-mono-500', '500'],
  ];
  for (const [family, file, weight] of faces) {
    for (const part of ['cyrillic', 'latin']) {
      const face = new FontFace(family, `url(${base}${file}-${part}.woff2)`, { weight });
      document.fonts.add(await face.load());
    }
  }
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const P = (t, a, b) => clamp((t - a) / (b - a));
const out3 = x => 1 - Math.pow(1 - x, 3);

/** Редове с главни букви върху черни ленти, които изплуват отдолу един след друг. */
function block(ctx, lines, { x = 76, y, size = 150, t, at, until, gap = 10 }) {
  const fade = 1 - P(t, until - 0.25, until);
  if (t < at || fade <= 0) return y;
  ctx.save();
  ctx.font = `900 ${size}px ${HEAD}`;
  ctx.textBaseline = 'alphabetic';
  let yy = y;
  lines.forEach(([text, color = '#fff', bg = INK], j) => {
    const k = out3(P(t, at + j * 0.12, at + j * 0.12 + 0.45));
    const w = ctx.measureText(text.toUpperCase()).width;
    const h = size * 0.86;
    ctx.globalAlpha = fade * k;
    ctx.fillStyle = bg;
    ctx.fillRect(x - 16, yy + (1 - k) * 40, w + 32, h + 18);
    ctx.fillStyle = color;
    ctx.fillText(text.toUpperCase(), x, yy + h + 4 + (1 - k) * 40);
    yy += h + 18 + gap;
  });
  ctx.restore();
  return yy;
}

function mono(ctx, text, { x = 76, y, size = 38, t, at, until, color = CREAM, bg = INK }) {
  const fade = 1 - P(t, until - 0.25, until);
  if (t < at || fade <= 0) return;
  const k = out3(P(t, at, at + 0.4));
  ctx.save();
  ctx.font = `500 ${size}px ${MONO}`;
  const w = ctx.measureText(text).width;
  ctx.globalAlpha = fade * k;
  ctx.fillStyle = bg;
  ctx.fillRect(x - 14, y - size * 0.95, w + 28, size * 1.45);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Хронометърът и мини картата на играта: те са HTML, затова не са в картината на WebGL. */
function hud(ctx, ffx) {
  const s = ffx.state.runTime || 0;
  const m = Math.floor(s / 60), sec = s - m * 60;
  const text = `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
  ctx.save();
  ctx.font = `700 46px ${MONO}`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(10,13,19,.7)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - w / 2 - 22, 196, w + 44, 66, 14);
  ctx.fill();
  ctx.fillStyle = '#f4f6fa';
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, 246);
  ctx.restore();
  const map = document.getElementById('minimap');
  if (map && ffx.state.started) ctx.drawImage(map, W - 76 - 230, 300, 230, 230);
}

/** „Помните ли Shockwave игрите?“ → FFX Runner → пренесена → играйте на ffx.skoba.eu. */
export function reelOverlay(ctx, t, ffx) {
  const END = 12.2;   // преди колата да стигне стената след парка (автопилотът реже през тревата)
  if (t < END) hud(ctx, ffx);

  block(ctx, [['Помните ли'], ['Shockwave', INK, YELLOW], ['игрите?']], { y: 420, size: 170, t, at: 0.2, until: 3.2 });

  const y2 = block(ctx, [['FFX Runner'], ['от 2000-те.']], { y: 440, size: 170, t, at: 3.4, until: 6.8 });
  mono(ctx, 'Shockwave спря да работи през 2019.', { y: y2 + 60, t, at: 4.1, until: 6.8 });

  const y3 = block(ctx, [['Пренесох я'], ['в браузъра.', INK, YELLOW]], { y: 440, size: 170, t, at: 7.0, until: 10.2 });
  mono(ctx, 'Без плъгини. И на телефон.', { y: y3 + 60, t, at: 7.7, until: 10.2 });

  // финалът: тъмен лист и адресът
  if (t >= END) {
    const k = out3(P(t, END, END + 0.4));
    ctx.save();
    ctx.globalAlpha = 0.86 * k;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    block(ctx, [['Играйте'], ['безплатно', INK, YELLOW]], { y: 520, size: 190, t, at: END + 0.2, until: 99 });
    mono(ctx, 'ffx.skoba.eu', { y: 1010, size: 64, t, at: END + 0.8, until: 99, color: INK, bg: YELLOW });
    mono(ctx, 'на телефон и компютър', { y: 1110, size: 36, t, at: END + 1.1, until: 99, bg: 'transparent' });
  }
}

/** Рийлът от записаното каране (run1, 05.11.2026): два откъса — джипът блъска (0–7,2 s) и финалът
 *  с бариерата на прелеза (7,2–16,4 s). `start` на втория откъс е 7.2, затова времената са общи. */
export function runOverlay(ctx, t, ffx) {
  const END = 13.0;
  if (t < END) hud(ctx, ffx);

  block(ctx, [['Помните ли'], ['Shockwave', INK, YELLOW], ['игрите?']], { y: 420, size: 170, t, at: 0.2, until: 3.2 });

  const y2 = block(ctx, [['FFX Runner'], ['от 2000-те.']], { y: 440, size: 170, t, at: 3.4, until: 7.2 });
  mono(ctx, 'Shockwave спря да работи през 2019.', { y: y2 + 60, t, at: 4.1, until: 7.2 });

  const y3 = block(ctx, [['Пренесох я'], ['в браузъра.', INK, YELLOW]], { y: 440, size: 170, t, at: 7.4, until: 10.4 });
  mono(ctx, 'Без плъгини. И на телефон.', { y: y3 + 60, t, at: 8.0, until: 10.4 });

  if (t >= END) {
    const k = out3(P(t, END, END + 0.4));
    ctx.save();
    ctx.globalAlpha = 0.86 * k;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    block(ctx, [['Играйте'], ['безплатно', INK, YELLOW]], { y: 520, size: 190, t, at: END + 0.2, until: 99 });
    mono(ctx, 'ffx.skoba.eu', { y: 1010, size: 64, t, at: END + 0.8, until: 99, color: INK, bg: YELLOW });
    mono(ctx, 'на телефон и компютър', { y: 1110, size: 36, t, at: END + 1.1, until: 99, bg: 'transparent' });
  }
}
