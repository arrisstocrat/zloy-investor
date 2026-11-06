// The stable outer box tracks the pointer while its inner layers tilt.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

for (const stage of document.querySelectorAll('[data-depth-stage]')) {
  let frame = 0;

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    stage.style.removeProperty('--tilt-x');
    stage.style.removeProperty('--tilt-y');
  }

  stage.addEventListener('pointermove', event => {
    if (reducedMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      stage.style.setProperty('--tilt-x', (-y * 15).toFixed(2) + 'deg');
      stage.style.setProperty('--tilt-y', (x * 19).toFixed(2) + 'deg');
    });
  }, { passive: true });

  stage.addEventListener('pointerleave', reset);
  stage.addEventListener('pointercancel', reset);
  reducedMotion.addEventListener('change', reset);
}

const reveal = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('depth-in-view');
    reveal.unobserve(entry.target);
  }
}, { threshold: 0.35 });

for (const target of document.querySelectorAll('.depth-stage, [data-depth-reveal]')) {
  reveal.observe(target);
}
