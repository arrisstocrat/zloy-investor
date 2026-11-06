const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const colors = [
  '#35213e', '#482651', '#63305e', '#85396e', '#b34586',
  '#e45ca1', '#fa7ab9', '#ffa3d3', '#ffd3e9', '#ffede3'
];

for (const banner of document.querySelectorAll('.pixel-banner')) {
  const canvas = banner.querySelector('[data-pixel-wave]');
  const toggle = banner.querySelector('[data-wave-toggle]');
  const context = canvas?.getContext('2d');
  if (!context || !toggle) continue;

  let columns = 0;
  let rows = 0;
  let frame = 0;
  let phase = 0;
  let previousTime = 0;
  let visible = false;
  let paused = reducedMotion.matches;

  function paint() {
    context.fillStyle = '#241429';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const across = x / columns;
        const down = y / rows;
        const crest = Math.sin(across * 8 - down * 5 - phase * 0.8)
          + 0.64 * Math.cos(across * 13 + down * 9 + phase * 0.54);
        const index = Math.max(0, Math.min(colors.length - 1, Math.floor((crest + 1.5) * 3.1)));
        context.fillStyle = colors[index];
        context.fillRect(x * 8, y * 8, 6, 6);
      }
    }
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.ceil(bounds.width);
    canvas.height = Math.ceil(bounds.height);
    columns = Math.ceil(canvas.width / 8);
    rows = Math.ceil(canvas.height / 8);
    paint();
  }

  function tick(time) {
    frame = 0;
    if (paused || !visible || document.hidden) return;
    if (!previousTime || time - previousTime >= 42) {
      phase += previousTime ? Math.min(time - previousTime, 84) / 1000 : 0;
      previousTime = time;
      paint();
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.textContent = paused ? 'Включить анимацию' : 'Пауза анимации';
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  toggle.addEventListener('click', () => {
    paused = !paused;
    sync();
  });
  reducedMotion.addEventListener('change', event => {
    paused = event.matches;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  new ResizeObserver(resize).observe(banner);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(banner);
  sync();
}
