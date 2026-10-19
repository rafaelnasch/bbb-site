// Reveal (SPEC 6.1): [data-reveal] entra com 700 ms e escalonamento de 70 ms.
// Onde há animation-timeline: view(), o CSS faz tudo e este módulo só marca o estado final.
// Com lite: estado final imediato.
(() => {
  const d = document, w = window, BBB = w.BBB;
  // Escalonamento automático dos filhos diretos de [data-reveal-grupo].
  d.querySelectorAll('[data-reveal-grupo]').forEach((g) => {
    [...g.children].filter((el) => el.hasAttribute('data-reveal')).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
  });
  const els = [...d.querySelectorAll('[data-reveal]')];
  const porCss = w.CSS?.supports?.('animation-timeline: view()') && !w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tudo = (lista) => lista.forEach((el) => el.classList.add('is-in'));
  if (BBB.lite || porCss || !('IntersectionObserver' in w)) {
    tudo(els);
    BBB.revelar = (el) => el.classList.add('is-in');
    return;
  }
  const io = new IntersectionObserver((entradas) => {
    entradas.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  els.forEach((el) => io.observe(el));
  BBB.revelar = (el) => io.observe(el);
  // Se o modo lite ligar no meio da visita, tudo aparece.
  w.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => e.matches && tudo(els));
})();
