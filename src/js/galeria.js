// Galeria do produto (SPEC 6.2, P0): troca na moldura pelas miniaturas, lupa 2x no desktop (nunca
// acima do arquivo original), tela cheia em <dialog> com pinça até 2x (no mesmo limite), setas,
// teclado e arrasto. Legenda fixa "Imagem ilustrativa". Sem JS, as miniaturas abrem a foto maior.
(() => {
  const d = document, w = window, BBB = w.BBB;
  const gal = d.querySelector('[data-galeria]');
  if (!gal) return;
  const itens = [...gal.querySelectorAll('[data-galeria-item]')];
  const minis = [...gal.querySelectorAll('[data-galeria-mini]')];
  const pos = gal.querySelector('[data-galeria-pos]');
  const moldura = gal.querySelector('.moldura');
  const lupa = gal.querySelector('[data-galeria-lupa]');
  const btnCheia = gal.querySelector('[data-galeria-cheia]');
  const n = itens.length;
  let atual = 0;

  function ir(i) {
    atual = (i + n) % n;
    itens.forEach((a, k) => { a.hidden = k !== atual; });
    minis.forEach((m, k) => (k === atual ? m.setAttribute('aria-current', 'true') : m.removeAttribute('aria-current')));
    if (pos) pos.textContent = `· ${atual + 1} de ${n}`;
    const wall = itens[atual].dataset.wall;
    if (wall) moldura.style.setProperty('--wall', wall);
    const img = itens[atual].querySelector('img');
    if (img && !BBB.lite) img.animate?.([{ opacity: 0, transform: 'scale(1.015)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
  minis.forEach((m) => m.addEventListener('click', (e) => { e.preventDefault(); ir(+m.dataset.galeriaMini); }));

  // ---------- Lupa (desktop, ponteiro fino) ----------
  const fino = w.matchMedia('(hover: hover) and (pointer: fine)');
  const palco = gal.querySelector('[data-galeria-palco]');
  if (lupa && palco) {
    const mover = (e) => {
      if (!fino.matches) return;
      const a = itens[atual];
      const img = a.querySelector('img');
      const r = img.getBoundingClientRect();
      const grandeW = +a.dataset.grandeW || img.naturalWidth;
      const zoom = Math.min(2, grandeW / r.width);
      if (zoom < 1.2 || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { lupa.hidden = true; return; }
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const pr = palco.getBoundingClientRect();
      lupa.hidden = false;
      lupa.style.backgroundImage = `url("${a.dataset.grande}")`;
      lupa.style.backgroundSize = `${r.width * zoom}px ${r.height * zoom}px`;
      const L = lupa.offsetWidth / 2;
      lupa.style.backgroundPosition = `${-(px * zoom - L)}px ${-(py * zoom - L)}px`;
      lupa.style.transform = `translate3d(${e.clientX - pr.left - L}px,${e.clientY - pr.top - L}px,0)`;
    };
    palco.addEventListener('pointermove', mover);
    palco.addEventListener('pointerleave', () => { lupa.hidden = true; });
  }

  // ---------- Tela cheia ----------
  let dlg = null, zi = 1, tx = 0, ty = 0, voltar = null;
  const svg = (p) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  function criar() {
    dlg = d.createElement('dialog');
    dlg.className = 'tela';
    dlg.setAttribute('aria-label', 'Fotos em tela cheia');
    dlg.innerHTML = `<div class="tela__palco" data-tela-palco><img class="tela__img" alt="" draggable="false"></div>
<p class="tela__leg"><span>Imagem ilustrativa</span> <span class="num" data-tela-pos></span></p>
<button class="tela__b tela__fechar" type="button" data-tela="fechar" aria-label="Fechar">${svg('<path d="M18 6 6 18M6 6l12 12"/>')}</button>
${n > 1 ? `<button class="tela__b tela__ant" type="button" data-tela="ant" aria-label="Foto anterior">${svg('<path d="m15 18-6-6 6-6"/>')}</button><button class="tela__b tela__prox" type="button" data-tela="prox" aria-label="Próxima foto">${svg('<path d="m9 18 6-6-6-6"/>')}</button>` : ''}`;
    d.body.append(dlg);
    const img = dlg.querySelector('img');
    const palcoT = dlg.querySelector('[data-tela-palco]');
    const maxZ = () => Math.min(2, (+itens[atual].dataset.grandeW || img.naturalWidth) / (img.getBoundingClientRect().width / zi || 1));
    const aplicar = () => { img.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${zi})`; dlg.classList.toggle('is-ampliada', zi > 1.01); };
    const zerar = () => { zi = 1; tx = 0; ty = 0; aplicar(); };
    dlg.mostrar = (i) => {
      ir(i);
      const a = itens[atual];
      img.src = a.dataset.grande;
      img.alt = a.querySelector('img')?.alt || '';
      dlg.querySelector('[data-tela-pos]').textContent = n > 1 ? `${atual + 1} de ${n}` : '';
      zerar();
    };
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tela]');
      if (!b) { if (e.target === dlg || e.target === palcoT) dlg.close(); return; }
      if (b.dataset.tela === 'fechar') dlg.close();
      else dlg.mostrar(atual + (b.dataset.tela === 'prox' ? 1 : -1));
    });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' && n > 1) dlg.mostrar(atual + 1);
      else if (e.key === 'ArrowLeft' && n > 1) dlg.mostrar(atual - 1);
      else if (e.key === '+' || e.key === '=') { zi = Math.min(maxZ(), zi * 1.4); aplicar(); }
      else if (e.key === '-') { zi = Math.max(1, zi / 1.4); if (zi === 1) { tx = 0; ty = 0; } aplicar(); }
    });
    dlg.addEventListener('close', () => { d.documentElement.classList.remove('tem-tela'); voltar?.focus(); });
    // Pinça, arrasto e passar o dedo.
    const pts = new Map();
    let ini = null, x0 = 0;
    palcoT.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); palcoT.setPointerCapture?.(e.pointerId); x0 = e.clientX; ini = null; });
    palcoT.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const ant = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (!ini) ini = { dist, z: zi };
        zi = Math.max(1, Math.min(maxZ(), (ini.z * dist) / ini.dist));
        if (zi === 1) { tx = 0; ty = 0; }
        aplicar();
      } else if (zi > 1.01) {
        tx += e.clientX - ant.x; ty += e.clientY - ant.y;
        aplicar();
      }
    });
    const soltar = (e) => {
      const um = pts.size === 1 && !ini;
      pts.delete(e.pointerId);
      if (um && zi <= 1.01 && n > 1 && Math.abs(e.clientX - x0) > 50) dlg.mostrar(atual + (e.clientX < x0 ? 1 : -1));
      if (!pts.size) ini = null;
    };
    palcoT.addEventListener('pointerup', soltar);
    palcoT.addEventListener('pointercancel', soltar);
    palcoT.addEventListener('dblclick', () => { zi = zi > 1.01 ? 1 : maxZ(); if (zi === 1) { tx = 0; ty = 0; } aplicar(); });
    palcoT.addEventListener('wheel', (e) => { e.preventDefault(); zi = Math.max(1, Math.min(maxZ(), zi * Math.exp(-e.deltaY * 0.004))); if (zi === 1) { tx = 0; ty = 0; } aplicar(); }, { passive: false });
  }
  function abrir(i) {
    if (typeof HTMLDialogElement !== 'function') return false;
    if (!dlg) criar();
    voltar = d.activeElement;
    dlg.showModal();
    d.documentElement.classList.add('tem-tela');
    dlg.mostrar(i);
    dlg.querySelector('[data-tela="fechar"]').focus();
    return true;
  }
  itens.forEach((a) => a.addEventListener('click', (e) => { if (abrir(+a.dataset.galeriaItem)) e.preventDefault(); }));
  btnCheia?.addEventListener('click', (e) => { if (abrir(atual)) e.preventDefault(); });
})();
