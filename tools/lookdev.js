// Снимки за оглед на графиката: лист с кадри от зададени места и
// настройки, върнат като JPEG data URL. Не е част от играта.
//
//   const ld = await import('./tools/lookdev.js?t=' + Date.now());
//   const walls = await ld.facades(ffx, 4);            // стени покрай маршрута
//   ld.sheet(ffx, walls.map(w => ({ view: ld.wallView(w), label: w.name })));

export async function route() {
  const r = await fetch('assets/route.json?t=' + Date.now()).then(r => r.json());
  return r.points || r;
}

/** Фасади до маршрута: лъч встрани от точка на пътя до първата стена. */
export async function facades(ffx, count = 4, test = /^(Casa|Cinema|Cityfacade|Hotel|Windows|Store|Stazione|ST_|Brkrun|capannone)/i, every = 7) {
  const { THREE: T, world } = ffx;
  const pts = await route();
  const meshes = [];
  world.zones.forEach(z => z.traverse(o => { if (o.isMesh && !o.userData.unlit && !o.userData.generated) meshes.push(o); }));
  const rc = new T.Raycaster();
  const found = [];
  for (let i = 2; i < pts.length - 2 && found.length < count; i += every) {
    const a = pts[i], b = pts[i + 1];
    const g = world.probeDownAll(new T.Vector3(a[0], a[1], 80), 200);
    if (!g) continue;
    const o = new T.Vector3(a[0], a[1], g.point.z + 8);
    const fw = new T.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
    for (const s of [1, -1]) {
      rc.set(o, new T.Vector3(-fw.y * s, fw.x * s, 0));
      rc.far = 45;
      const h = rc.intersectObjects(meshes, false)[0];
      const name = h && [].concat(h.object.material)[0]?.map?.name;
      if (h && test.test(name || '')) {
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        n.z = 0; n.normalize();
        found.push({ i, name, p: h.point.clone(), n, along: new T.Vector3(-n.y, n.x, 0) });
        break;
      }
    }
  }
  return found;
}

/** Камера на 9 фута от стената, под ъгъл по нея. */
export function wallView(w, dist = 9, back = 14) {
  const from = w.p.clone().addScaledVector(w.n, dist).addScaledVector(w.along, -back);
  from.z += 1;
  const to = w.p.clone().addScaledVector(w.along, 6);
  to.z += 3;
  return { from, to };
}

/**
 * cells: [{ view: {from, to}, time, weather, label, before() }]
 * Всички зони са видими; размазването от скоростта е изключено.
 */
export function sheet(ffx, cells, { cols = 2, W = 960, H = 540, quality = 0.8 } = {}) {
  const { atmosphere, look, lights, renderer, camera, world } = ffx;
  const c = document.createElement('canvas');
  c.width = W * cols;
  c.height = H * Math.ceil(cells.length / cols);
  const g = c.getContext('2d');
  renderer.setAnimationLoop(null);
  const vis = world.zones.map(z => z.visible);
  world.zones.forEach(z => { z.visible = true; });
  cells.forEach((cell, k) => {
    const time = cell.time || 'day', weather = cell.weather || 'clear';
    const p = atmosphere.set(time, weather);
    look.setBloom(p.bloom);
    lights.setNight(atmosphere.isNight, weather === 'rain');
    ffx.skyline?.setTime(time, weather);
    ffx.theatre?.setTime(time, weather);
    cell.before?.();
    camera.position.copy(cell.view.from);
    camera.up.set(0, 0, 1);
    camera.lookAt(cell.view.to);
    camera.fov = cell.fov || 64.37;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    atmosphere.update(0.016, cell.view.from, camera);
    look.speedPass.uniforms.strength.value = 0;
    look.speedPass.uniforms.turn.value = 0;
    look.render();
    const x = (k % cols) * W, y = Math.floor(k / cols) * H;
    g.drawImage(renderer.domElement, x, y, W, H);
    g.fillStyle = '#fff';
    g.font = '20px sans-serif';
    g.fillText(cell.label || `${time} ${weather}`, x + 10, y + 28);
    cell.after?.();
  });
  world.zones.forEach((z, i) => { z.visible = vis[i]; });
  return c.toDataURL('image/jpeg', quality);
}
