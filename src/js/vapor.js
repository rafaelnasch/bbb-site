// Vapor (SPEC 6.2, P1): topo da home e abertura do produto ([data-vapor]). Canvas 2D em baixa
// resolução com nuvens suaves que sobem e se desfazem; o elemento nunca passa de 8% de opacidade
// (CSS .vapor__cv.is-viva). Depois do load, pausa fora da tela; desligado no modo lite.
(() => {
  const d = document, w = window, BBB = w.BBB || {};
  const alvos = [...d.querySelectorAll('[data-vapor]')];
  if (!alvos.length) return;

  function montar(el) {
    if (el.dataset.vaporOk) return;
    const cv = d.createElement('canvas');
    cv.className = 'vapor__cv';
    cv.setAttribute('aria-hidden', 'true');
    const cx = cv.getContext('2d');
    if (!cx) return;
    el.dataset.vaporOk = '1';
    el.append(cv);
    const K = 0.25; // um quarto da resolução: o vapor é borrado por natureza
    // Sprite de uma nuvem: gradiente radial branco, desenhado uma vez.
    const sp = d.createElement('canvas');
    sp.width = sp.height = 64;
    const sx = sp.getContext('2d');
    const g = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    sx.fillStyle = g;
    sx.fillRect(0, 0, 64, 64);

    let W = 1, H = 1, raf = 0, vis = true, t0 = performance.now();
    const N = w.matchMedia('(max-width:700px)').matches ? 10 : 18;
    const nuvens = [];
    const nova = (inicio) => ({
      x: Math.random(),
      y: inicio ? Math.random() : 1.1,
      r: 0.12 + Math.random() * 0.22,
      v: 0.012 + Math.random() * 0.018,
      f: Math.random() * 6.28,
      a: 0.35 + Math.random() * 0.5,
    });
    for (let i = 0; i < N; i++) nuvens.push(nova(true));
    const medir = () => {
      const r = el.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width * K));
      H = Math.max(1, Math.round(r.height * K));
      cv.width = W;
      cv.height = H;
    };
    let ant = performance.now();
    function quadro(agora) {
      raf = 0;
      const dt = Math.min(0.05, (agora - ant) / 1000);
      ant = agora;
      const t = (agora - t0) / 1000;
      cx.clearRect(0, 0, W, H);
      for (let i = 0; i < nuvens.length; i++) {
        const n = nuvens[i];
        n.y -= n.v * dt;
        if (n.y < -0.3) { nuvens[i] = nova(false); continue; }
        const vida = Math.min(1, (1.1 - n.y) * 2.2) * Math.min(1, (n.y + 0.3) * 2.5);
        const x = (n.x + Math.sin(t * 0.25 + n.f) * 0.04) * W;
        const raio = n.r * Math.max(W, H) * (1.25 - n.y * 0.4);
        cx.globalAlpha = n.a * vida;
        cx.drawImage(sp, x - raio, n.y * H - raio, raio * 2, raio * 2);
      }
      cx.globalAlpha = 1;
      if (!cv.classList.contains('is-viva')) cv.classList.add('is-viva');
      if (vis && !d.hidden && !BBB.lite) raf = requestAnimationFrame(quadro);
    }
    const ligar = () => { if (!raf && vis && !d.hidden && !BBB.lite) { ant = performance.now(); raf = requestAnimationFrame(quadro); } };
    if ('ResizeObserver' in w) new ResizeObserver(medir).observe(el); else w.addEventListener('resize', medir);
    if ('IntersectionObserver' in w) new IntersectionObserver((es) => { vis = es.some((x) => x.isIntersecting); ligar(); }).observe(el);
    d.addEventListener('visibilitychange', ligar);
    w.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { if (e.matches) cv.remove(); });
    medir();
    ligar();
  }

  const iniciar = () => { if (!BBB.lite) alvos.forEach(montar); };
  const ocioso = () => requestAnimationFrame(() => requestAnimationFrame(() => (w.requestIdleCallback ? w.requestIdleCallback(iniciar, { timeout: 3000 }) : setTimeout(iniciar, 400))));
  if (d.readyState === 'complete') ocioso(); else w.addEventListener('load', ocioso, { once: true });
})();
