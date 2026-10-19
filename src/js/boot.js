// Primeiro script da página (inline no <head>, autorizado na CSP por hash). Antes da primeira pintura:
// marca que há JS, liga o modo lite (movimento reduzido, Save-Data, 2G) e prevê a falha do núcleo
// (se o núcleo não carregar em 4 s, nada fica escondido por reveal).
(function (d, w) {
  var e = d.documentElement, c = navigator.connection || {};
  e.classList.add('js');
  if (w.matchMedia('(prefers-reduced-motion: reduce)').matches || c.saveData || /2g/.test(c.effectiveType || '')) e.setAttribute('data-lite', '1');
  w.setTimeout(function () { if (!w.BBB) e.classList.add('rv-falhou'); }, 4000);
})(document, window);
