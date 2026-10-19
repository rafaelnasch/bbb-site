// Explorador da planta oficial (SPEC 6.2, P0). Planta em blocos de 512 px até 3400 px; arrastar,
// pinça, roda (com Ctrl ou já ampliada), botões + e -, setas, 0 recentraliza; zoom de 1x a 6x.
// Cotas como <button aria-pressed>: a letra na tabela realça o marcador no desenho e vice-versa,
// e o leitor de tela ouve "Cota B, 1,415 metro". Também liga o filme da planta no topo da página
// (só depois do load, quando visível e fora do modo lite).
(() => {
  const d = document, w = window, BBB = w.BBB;
  const MAX = 6, PASSO = 1.5;

  function explorador(fig) {
    const vista = fig.querySelector('[data-vista]');
    const plano = fig.querySelector('[data-plano]');
    const camada = fig.querySelector('[data-blocos]');
    const nivelTxt = fig.querySelector('[data-nivel]');
    const W = +fig.dataset.w, H = +fig.dataset.h, T = +fig.dataset.tile || 512;
    const base = fig.dataset.base;
    let niveis = [];
    try { niveis = JSON.parse(fig.dataset.niveis || '[]').map(([z, lw, lh, c, r]) => ({ z, lw, lh, c, r })); } catch { /* sem blocos */ }
    if (!W || !H) return;
    plano.style.width = `${W}px`;
    plano.style.height = `${H}px`;
    fig.classList.add('is-ativo');

    let z = 1, x = 0, y = 0, vw = 0, vh = 0, fit = 1, raf = 0;
    const blocos = new Map();

    const medir = () => {
      // Tamanho de layout (sem transformações: o tour da home anima a escala da figura).
      vw = vista.clientWidth; vh = vista.clientHeight; fit = vw / W;
    };
    const limitar = () => {
      const s = fit * z;
      x = Math.min(0, Math.max(vw - W * s, x));
      y = Math.min(0, Math.max(vh - H * s, y));
    };
    const pedir = () => { if (!raf) raf = requestAnimationFrame(desenhar); };

    function desenhar() {
      raf = 0;
      limitar();
      const s = fit * z;
      plano.style.transform = `translate3d(${x}px,${y}px,0) scale(${s})`;
      plano.style.setProperty('--s', s);
      vista.style.touchAction = z > 1.01 ? 'none' : 'pan-y';
      fig.classList.toggle('is-ampliado', z > 1.01);
      if (nivelTxt) nivelTxt.textContent = `${z < 1.05 ? 1 : z.toFixed(1).replace('.', ',').replace(',0', '')}x`;
      carregarBlocos(s);
    }

    function carregarBlocos(s) {
      if (!niveis.length) return;
      const dpr = Math.min(w.devicePixelRatio || 1, 2);
      const precisa = W * s * dpr;
      if (precisa <= 1300) { blocos.forEach((img) => { img.hidden = true; }); return; }
      const nv = niveis.find((n) => n.lw >= precisa) || niveis[niveis.length - 1];
      const k = nv.lw / W; // pixels do nível por unidade do plano
      const x0 = -x / s, y0 = -y / s, x1 = x0 + vw / s, y1 = y0 + vh / s;
      const c0 = Math.max(0, Math.floor((x0 * k) / T)), c1 = Math.min(nv.c - 1, Math.floor((x1 * k) / T));
      const r0 = Math.max(0, Math.floor((y0 * k) / T)), r1 = Math.min(nv.r - 1, Math.floor((y1 * k) / T));
      const vivos = new Set();
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r <= r1; r++) {
          const chave = `${nv.z}/${c}_${r}`;
          vivos.add(chave);
          let img = blocos.get(chave);
          if (!img) {
            img = d.createElement('img');
            img.alt = '';
            img.decoding = 'async';
            img.draggable = false;
            const lw = Math.min(T, nv.lw - c * T), lh = Math.min(T, nv.lh - r * T);
            Object.assign(img.style, { left: `${(c * T) / k}px`, top: `${(r * T) / k}px`, width: `${lw / k + 0.6}px`, height: `${lh / k + 0.6}px`, zIndex: String(nv.z) });
            img.onload = () => img.classList.add('is-ok');
            img.src = `${base}/z${nv.z}/${c}_${r}.webp`;
            camada.append(img);
            blocos.set(chave, img);
          }
          img.hidden = false;
        }
      }
      // Blocos de outros níveis ficam (servem de reserva enquanto os novos carregam), mas só os do nível atual aparecem por cima.
      blocos.forEach((img, chave) => { if (!vivos.has(chave) && !chave.startsWith(`${nv.z}/`)) img.hidden = true; });
    }

    function zoomEm(nz, px = vw / 2, py = vh / 2) {
      nz = Math.min(MAX, Math.max(1, nz));
      const s0 = fit * z, s1 = fit * nz;
      x = px - ((px - x) * s1) / s0;
      y = py - ((py - y) * s1) / s0;
      if (nz !== z && Math.abs(nz - z) > 0.2) BBB.evento('planta_zoom', { sha1: fig.dataset.sha1, zoom: Math.round(nz * 10) / 10 });
      z = nz;
      pedir();
    }
    const recentrar = () => { z = 1; x = 0; y = 0; pedir(); };
    fig.planta = { zoomEm, recentrar, centrarEm };

    function centrarEm(px, py, caixa = null) {
      // Leva o ponto (x, y em pixels da planta) ao centro, ampliando para 2,5x se estiver em 1x (sem caixa).
      // Com caixa ({x0, y0, x1, y1} em pixels da planta), a vista não sai dela: se a caixa couber
      // inteira na vista num eixo, fica centrada nesse eixo (usado pelo tour da home).
      // Com caixa, o zoom é o que faz a caixa inteira caber na vista (todas as cotas visíveis, nunca
      // cortadas na borda), entre 1x e 2,5x.
      if (caixa) z = Math.max(1, Math.min(2.5, vw / ((caixa.x1 - caixa.x0) * fit), vh / ((caixa.y1 - caixa.y0) * fit)));
      else if (z < 2) z = 2.5;
      const s = fit * z;
      x = vw / 2 - px * s;
      y = vh / 2 - py * s;
      if (caixa) {
        const prender = (v, a0, a1, tam) => ((a1 - a0) * s <= tam ? tam / 2 - ((a0 + a1) / 2) * s : Math.min(-a0 * s, Math.max(tam - a1 * s, v)));
        x = prender(x, caixa.x0, caixa.x1, vw);
        y = prender(y, caixa.y0, caixa.y1, vh);
      }
      pedir();
    }

    // Ponteiros: arrastar com um, pinça com dois.
    const pts = new Map();
    let ini = null;
    vista.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.pointerType !== 'touch' || z > 1.01 || pts.size > 1) vista.setPointerCapture?.(e.pointerId);
      ini = null;
    });
    vista.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const ant = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = vista.getBoundingClientRect();
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
        if (!ini) ini = { dist, z };
        zoomEm((ini.z * dist) / ini.dist, cx, cy);
        e.preventDefault();
        return;
      }
      if (z <= 1.01 && e.pointerType === 'touch') return; // em 1x o dedo rola a página
      x += e.clientX - ant.x;
      y += e.clientY - ant.y;
      fig.classList.add('is-arrastando');
      pedir();
    });
    const soltar = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) ini = null;
      if (!pts.size) fig.classList.remove('is-arrastando');
    };
    vista.addEventListener('pointerup', soltar);
    vista.addEventListener('pointercancel', soltar);
    vista.addEventListener('dblclick', (e) => {
      const r = vista.getBoundingClientRect();
      zoomEm(z > 2.9 ? 1 : z * 2, e.clientX - r.left, e.clientY - r.top);
    });
    vista.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey && z <= 1.01) return; // a roda só amplia com Ctrl, ou quando já ampliada
      e.preventDefault();
      const r = vista.getBoundingClientRect();
      zoomEm(z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    vista.addEventListener('keydown', (e) => {
      const passo = 60;
      const k = e.key;
      if (k === '+' || k === '=') zoomEm(z * PASSO);
      else if (k === '-' || k === '_') zoomEm(z / PASSO);
      else if (k === '0') recentrar();
      else if (k.startsWith('Arrow') && z > 1.01) {
        if (k === 'ArrowLeft') x += passo;
        else if (k === 'ArrowRight') x -= passo;
        else if (k === 'ArrowUp') y += passo;
        else y -= passo;
        pedir();
      } else return;
      e.preventDefault();
    });
    fig.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
      const v = +b.dataset.zoom;
      if (v === 0) recentrar(); else zoomEm(v > 0 ? z * PASSO : z / PASSO);
    }));

    const ro = new ResizeObserver(() => {
      const s0 = fit * z;
      const cxp = (vw / 2 - x) / s0, cyp = (vh / 2 - y) / s0;
      medir();
      if (!vw) return;
      const s = fit * z;
      x = vw / 2 - cxp * s; y = vh / 2 - cyp * s;
      if (!s0 || !Number.isFinite(cxp)) { x = 0; y = 0; }
      pedir();
    });
    ro.observe(vista);
    medir();
    pedir();
  }

  // ---------- Cotas: tabela <-> desenho ----------
  function cotas(painel) {
    const fig = painel.querySelector('[data-explorador]');
    const todos = () => painel.querySelectorAll('[data-cota]');
    painel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cota]');
      if (!b || !painel.contains(b)) return;
      const letra = b.dataset.cota;
      const ativo = painel.dataset.cotaAtiva === letra;
      painel.dataset.cotaAtiva = ativo ? '' : letra;
      todos().forEach((x) => {
        const on = !ativo && x.dataset.cota === letra;
        if (x.classList.contains('cota-marca')) x.classList.toggle('is-ativa', on);
        else x.setAttribute('aria-pressed', String(on));
      });
      painel.querySelectorAll('[data-cota-linha]').forEach((tr) => tr.classList.toggle('is-ativa', !ativo && tr.dataset.cotaLinha === letra));
      if (ativo) return;
      const btn = painel.querySelector(`.cota-btn[data-cota="${CSS.escape(letra)}"]`);
      if (btn) BBB.anunciar(btn.getAttribute('aria-label'));
      const marca = painel.querySelector(`.cota-marca[data-cota="${CSS.escape(letra)}"]`);
      if (fig?.planta && marca && b.classList.contains('cota-btn')) {
        const W = +fig.dataset.w, H = +fig.dataset.h;
        fig.planta.centrarEm((parseFloat(marca.style.left) / 100) * W, (parseFloat(marca.style.top) / 100) * H);
      }
      if (b.classList.contains('cota-marca')) {
        const linha = painel.querySelector(`[data-cota-linha="${CSS.escape(letra)}"]`);
        linha?.scrollIntoView({ block: 'nearest', behavior: BBB.lite ? 'auto' : 'smooth' });
      }
    });
  }

  // Inicia cada explorador quando ele (ou o painel dele) fica visível.
  const iniciados = new WeakSet();
  const iniciar = (fig) => {
    if (iniciados.has(fig) || !fig.offsetWidth) return;
    iniciados.add(fig);
    explorador(fig);
  };
  const io = 'IntersectionObserver' in w ? new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && iniciar(e.target)), { rootMargin: '300px 0px' }) : null;
  d.querySelectorAll('[data-explorador]').forEach((f) => (io ? io.observe(f) : iniciar(f)));
  d.querySelectorAll('[data-tam-painel]').forEach(cotas);
  d.addEventListener('bbb:tamanho', () => requestAnimationFrame(() => d.querySelectorAll('[data-tam-painel]:not([hidden]) [data-explorador]').forEach((f) => { if (io) { io.unobserve(f); io.observe(f); } else iniciar(f); })));

  // ---------- Filme da planta no topo (P1) ----------
  const filme = d.querySelector('video[data-filme]');
  if (filme && !BBB.lite) {
    const ligar = () => {
      if (BBB.lite || filme.dataset.ok) return;
      filme.dataset.ok = '1';
      for (const [k, t] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
        const s = d.createElement('source');
        s.src = filme.dataset[k];
        s.type = t;
        filme.append(s);
      }
      // O vídeo só cobre o poster estático depois de tocar de fato (nunca duas plantas ao mesmo tempo).
      filme.addEventListener('playing', () => filme.parentElement?.classList.add('is-tocando'), { once: true });
      filme.load();
      filme.play?.().catch(() => {});
    };
    // O vídeo (até 350 KB) só começa a baixar depois de um quadro já pintado e com o navegador ocioso:
    // nunca disputa banda com a primeira tela nem entra no caminho do LCP.
    const depoisDaPintura = (fn) => requestAnimationFrame(() => requestAnimationFrame(() => (w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 300))));
    const quandoVisivel = () => {
      if (!('IntersectionObserver' in w)) return depoisDaPintura(ligar);
      const o = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) { o.disconnect(); depoisDaPintura(ligar); }
      });
      o.observe(filme);
    };
    if (d.readyState === 'complete') quandoVisivel(); else w.addEventListener('load', quandoVisivel, { once: true });
  }
})();
