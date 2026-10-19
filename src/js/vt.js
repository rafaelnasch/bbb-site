// View Transitions entre páginas (SPEC 6.1). Roda inline no <head>, junto do boot, porque o evento
// pagereveal dispara antes da primeira pintura e um módulo adiado chegaria tarde.
//
// Marcação usada pelos templates:
//   data-vt="<slug>"          foto do cartão, dentro do link para a página da peça;
//   data-vt-chegada="<slug>"  moldura da peça na página de produto (o destino da transição);
//   data-vt-fixo="<chave>"    elemento que se mantém entre páginas (ex.: a planta entre versões irmãs).
// Os nomes são dados só na hora da troca, nunca a todos os cartões (custo zero fora da transição).
(function (d, w) {
  if (!('onpagereveal' in w)) return;
  var nome = function (k) { return 'vt-' + String(k).replace(/[^a-z0-9_-]/gi, '-'); };
  var lite = function () { return d.documentElement.hasAttribute('data-lite'); };
  var nomear = function (els) {
    var usados = {};
    els.forEach(function (par) {
      var el = par[0], n = nome(par[1]);
      if (!el || usados[n]) return;
      usados[n] = 1;
      el.style.viewTransitionName = n;
    });
    return els.map(function (p) { return p[0]; }).filter(Boolean);
  };
  var cartaoPara = function (href) {
    if (!href) return null;
    var alvo = new URL(href, location.href).pathname, links = d.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].pathname === alvo) { var f = links[i].querySelector('[data-vt]'); if (f) return f; }
    }
    return null;
  };
  var marcados = function (extra) {
    var pares = [];
    d.querySelectorAll('[data-vt-chegada]').forEach(function (el) { pares.push([el, el.getAttribute('data-vt-chegada')]); });
    if (extra) pares.push([extra, extra.getAttribute('data-vt')]);
    d.querySelectorAll('[data-vt-fixo]').forEach(function (el) { pares.push([el, el.getAttribute('data-vt-fixo')]); });
    return pares;
  };
  w.addEventListener('pageswap', function (e) {
    if (!e.viewTransition) return;
    if (lite()) { e.viewTransition.skipTransition(); return; }
    var url = e.activation && e.activation.entry && e.activation.entry.url;
    nomear(marcados(cartaoPara(url)));
  });
  w.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    if (lite()) { e.viewTransition.skipTransition(); return; }
    var de = w.navigation && w.navigation.activation && w.navigation.activation.from;
    var els = nomear(marcados(cartaoPara(de && de.url)));
    e.viewTransition.finished.finally(function () { els.forEach(function (el) { el.style.viewTransitionName = ''; }); });
  });
  w.addEventListener('pageshow', function (e) {
    if (e.persisted) d.querySelectorAll('[style*="view-transition-name"]').forEach(function (el) { el.style.viewTransitionName = ''; });
  });
})(document, window);
