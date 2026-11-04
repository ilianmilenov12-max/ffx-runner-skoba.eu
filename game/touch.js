// Бутони на екрана за телефон и таблет. Показват се само на устройство с
// докосване — при първото докосване или ако екранът е „груб" показалец.
// Всеки бутон държи един клавиш, докато пръстът е върху него; няколко
// пръста едновременно работят (pointer events).

export function bindTouch(car, { onPause }) {
  const root = document.getElementById('touch');
  if (!root) return;

  const show = () => {
    root.classList.add('on');
    document.body.classList.add('touch');
  };
  if (matchMedia('(pointer: coarse)').matches) show();
  addEventListener('touchstart', show, { once: true, passive: true });

  for (const b of root.querySelectorAll('[data-key]')) {
    const key = b.dataset.key;
    const down = e => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('down');
      car.keys[key] = 1;
    };
    const up = e => {
      e.preventDefault();
      b.classList.remove('down');
      car.keys[key] = 0;
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  document.getElementById('touch-pause')?.addEventListener('click', onPause);
}
