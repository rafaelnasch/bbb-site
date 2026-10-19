// Núcleo de todas as páginas (SPEC 6.1): modo lite, gavetas, cabeçalho, comparador (contador e
// bandeja), anúncios para leitor de tela, LQIP das fotos e dataLayer. Sem dependências.
(() => {
  const d = document, w = window, H = d.documentElement;
  const BBB = (w.BBB = w.BBB || {});
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  BBB.$ = $;
  BBB.$$ = $$;

  // CSS fora do crítico: baixado sem bloquear a pintura e ligado aqui (sem JS, vale o <noscript>).
  $$('link[data-css-tardio]').forEach((l) => { l.media = 'all'; });

  // Modo lite: movimento reduzido, Save-Data ou rede 2G. Flag global em <html data-lite="1">.
  const conn = navigator.connection || {};
  const mqR = w.matchMedia('(prefers-reduced-motion: reduce)');
  const lite = () => mqR.matches || !!conn.saveData || /2g/.test(conn.effectiveType || '');
  const aplicarLite = () => {
    BBB.lite = lite();
    if (BBB.lite) H.dataset.lite = '1';
    else delete H.dataset.lite;
  };
  aplicarLite();
  mqR.addEventListener?.('change', aplicarLite);
  conn.addEventListener?.('change', aplicarLite);

  // Eventos (nenhum script de analytics é carregado; só a fila).
  w.dataLayer = w.dataLayer || [];
  BBB.evento = (event, dados = {}) => {
    try { w.dataLayer.push({ event, ...dados }); } catch { /* sem fila */ }
  };

  // Anúncios em aria-live.
  const vivo = $('#anuncio');
  BBB.anunciar = (t) => {
    if (!vivo) return;
    vivo.textContent = '';
    setTimeout(() => { vivo.textContent = t; }, 60);
  };

  // Armazenamento local sempre protegido (janela privada, bloqueio de site).
  BBB.store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };

  // Módulos sob demanda com nome de arquivo com hash (lista em <script type="application/json">).
  let mapa = {};
  try { mapa = JSON.parse($('#bbb-assets')?.textContent || '{}'); } catch { /* sem mapa */ }
  BBB.asset = (n) => mapa[n];
  BBB.carregar = (n) => (mapa[n] ? import(mapa[n]) : Promise.reject(new Error(`módulo ${n}`)));

  // Controles que só fazem sentido com JS.
  $$('[data-so-js]').forEach((el) => { el.hidden = false; });

  // ---------- Gavetas (<dialog> modal: foco preso pelo navegador, Esc fecha) ----------
  let voltarPara = null;
  const controles = (id, v) => $$(`[data-gaveta-abrir="${id}"]`).forEach((b) => b.setAttribute('aria-expanded', v));
  BBB.abrirGaveta = (id, foco) => {
    const g = d.getElementById(id);
    if (!g || typeof g.showModal !== 'function') return false;
    $$('dialog.gaveta[open]').forEach((x) => x !== g && x.close());
    if (!g.open) {
      voltarPara = d.activeElement;
      g.showModal();
      controles(id, 'true');
    }
    const alvo = foco && g.querySelector(`[data-foco="${foco}"]`);
    if (alvo) {
      if (alvo.tagName === 'DETAILS') alvo.open = true;
      (alvo.querySelector('summary') || alvo).focus();
      alvo.scrollIntoView({ block: 'start' });
    }
    return true;
  };
  $$('dialog.gaveta').forEach((g) => {
    g.addEventListener('close', () => {
      controles(g.id, 'false');
      if (voltarPara && d.contains(voltarPara)) voltarPara.focus();
      voltarPara = null;
    });
  });

  // ---------- Comparador: até 3 peças, localStorage "bbb:comparar" (SPEC 6.1) ----------
  const CHAVE = 'bbb:comparar', MAX = 3;
  const ler = () => {
    const v = BBB.store.get(CHAVE);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.slug === 'string').slice(0, MAX) : [];
  };
  let comp = ler();
  const base = () => ($('[data-comparar-contador]')?.getAttribute('href') || '').split('?')[0];
  // Leva também o tamanho escolhido de cada peça (t) e o espaço do cliente (l, c), quando vieram do escolhedor.
  const destino = () => {
    if (!comp.length) return base();
    const e = comp.findLast((x) => x.l && x.c);
    return `${base()}?p=${comp.map((x) => encodeURIComponent(x.slug)).join(',')}${comp.some((x) => x.t) ? `&t=${comp.map((x) => x.t || 0).join(',')}` : ''}${e ? `&l=${e.l}&c=${e.c}` : ''}`;
  };
  const pintar = () => {
    const n = comp.length;
    $$('[data-comparar-n]').forEach((e) => { e.textContent = n; e.dataset.n = n; });
    $$('[data-comparar-contador]').forEach((a) => {
      a.dataset.n = n;
      a.href = destino();
      a.setAttribute('aria-label', `Comparar modelos: ${n} de ${MAX} escolhidos`);
    });
    $$('[data-comparar]').forEach((b) => b.setAttribute('aria-pressed', String(comp.some((x) => x.slug === b.dataset.comparar))));
    const band = $('[data-bandeja]');
    if (!band) return;
    band.hidden = !n;
    const lista = $('[data-bandeja-lista]', band);
    lista.replaceChildren(...comp.map((x) => {
      const li = d.createElement('li');
      li.className = 'bandeja__item';
      const s = d.createElement('span');
      s.textContent = x.nome || x.slug;
      const b = d.createElement('button');
      b.type = 'button';
      b.className = 'bandeja__rem';
      b.dataset.compararRem = x.slug;
      b.setAttribute('aria-label', `Tirar ${x.nome || x.slug} da comparação`);
      b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      li.append(s, b);
      return li;
    }));
    const ir = $('[data-bandeja-ir]', band);
    if (ir) ir.href = destino();
    H.style.setProperty('--bandeja-h', n ? `${band.offsetHeight}px` : '0px');
  };
  const salvar = () => { BBB.store.set(CHAVE, comp); pintar(); };
  BBB.comparar = {
    lista: () => comp.slice(),
    max: MAX,
    tem: (slug) => comp.some((x) => x.slug === slug),
    add(item) {
      if (!item?.slug || this.tem(item.slug)) return true;
      if (comp.length >= MAX) {
        BBB.anunciar(`Você já escolheu ${MAX} modelos. Tire um para incluir outro.`);
        return false;
      }
      const t = Number(item.t), l = Number(item.l), c = Number(item.c);
      comp.push({ slug: item.slug, nome: item.nome || item.slug, ...(t > 0 ? { t } : {}), ...(l > 0 && c > 0 ? { l, c } : {}) });
      salvar();
      BBB.evento('comparar_add', { slug: item.slug, sku: item.sku || null });
      BBB.anunciar(`${item.nome || item.slug} entrou na comparação. ${comp.length} de ${MAX}.`);
      return true;
    },
    remover(slug) {
      const x = comp.find((i) => i.slug === slug);
      comp = comp.filter((i) => i.slug !== slug);
      salvar();
      if (x) BBB.anunciar(`${x.nome} saiu da comparação.`);
    },
    definir(lista) {
      comp = (lista || []).filter((x) => x && x.slug).slice(0, MAX);
      salvar();
    },
    limpar() { comp = []; salvar(); BBB.anunciar('Comparação vazia.'); },
  };
  w.addEventListener('storage', (e) => { if (e.key === CHAVE) { comp = ler(); pintar(); } });

  // ---------- Cliques delegados ----------
  d.addEventListener('click', (e) => {
    const t = e.target;
    const abre = t.closest('[data-gaveta-abrir]');
    if (abre && BBB.abrirGaveta(abre.dataset.gavetaAbrir, abre.dataset.gavetaFoco)) { e.preventDefault(); return; }
    const fecha = t.closest('[data-gaveta-fechar]');
    if (fecha) { fecha.closest('dialog')?.close(); return; }
    if (t.matches?.('dialog.gaveta')) {
      const r = t.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) t.close();
      return;
    }
    const tog = t.closest('[data-comparar]');
    if (tog) {
      e.preventDefault();
      const slug = tog.dataset.comparar;
      if (BBB.comparar.tem(slug)) BBB.comparar.remover(slug);
      else BBB.comparar.add({ slug, nome: tog.dataset.nome, sku: tog.dataset.sku, t: tog.dataset.t, l: tog.dataset.l, c: tog.dataset.c });
      return;
    }
    const rem = t.closest('[data-comparar-rem]');
    if (rem) { BBB.comparar.remover(rem.dataset.compararRem); return; }
    if (t.closest('[data-comparar-limpar]')) BBB.comparar.limpar();
  });

  // ---------- Cabeçalho: opaco no topo, vidro ao rolar; sobre a sala escura, transparente no topo ----------
  const cab = $('.cab');
  if (cab) {
    let pend = false;
    const marca = () => { pend = false; cab.classList.toggle('is-rolado', w.scrollY > 8); };
    w.addEventListener('scroll', () => { if (!pend) { pend = true; requestAnimationFrame(marca); } }, { passive: true });
    marca();
  }

  // ---------- LQIP: o borrão sai quando a foto carrega ----------
  const limpar = (img) => { img.style.backgroundImage = ''; img.removeAttribute('data-lqip'); };
  d.addEventListener('load', (e) => { if (e.target.tagName === 'IMG' && e.target.hasAttribute('data-lqip')) limpar(e.target); }, true);
  $$('img[data-lqip]').forEach((i) => i.complete && i.naturalWidth && limpar(i));

  pintar();
})();
