// "Cabe no meu banheiro?" (SPEC 6.2, P0). SVG em escala real (1 unidade = 1 cm) sobre grade de 10 cm:
// a peça, o espaço digitado por cima, a folga em cada dimensão e a vista lateral com a profundidade
// (nas saunas, a vista frontal com a altura). A peça pode girar: menor lado da peça contra o menor
// lado do espaço. A silhueta humana só aparece se a pessoa digitar a própria altura.
// Só medidas externas publicadas; o aviso de instalação é fixo no HTML.
(() => {
  const d = document, BBB = window.BBB;
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const m2 = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cm = (v) => Math.round(Number(v) * 1000) / 10; // metros publicados -> cm sem erro de ponto flutuante

  function el(tag, at = {}, pai) {
    const e = d.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(at)) e.setAttribute(k, v);
    if (pai) pai.append(e);
    return e;
  }
  const texto = (pai, x, y, t, at = {}) => { const e = el('text', { x, y, ...at }, pai); e.textContent = t; return e; };

  function bloco(raiz) {
    const svg = raiz.querySelector('[data-escala-svg]');
    const form = raiz.querySelector('[data-escala-form]');
    const txt = raiz.querySelector('[data-escala-txt]');
    const selo = raiz.querySelector('[data-escala-selo]');
    const frontal = raiz.dataset.vista === 'frontal';
    let med = ler(raiz.dataset);
    let ultimoCabe = null;
    let ultimaLarg = 0;

    function ler(o) {
      const n = (v) => (v == null || v === '' ? null : Number(v));
      const a = n(o.a), b = n(o.b);
      const menor = n(o.menor) ?? Math.min(a, b), maior = n(o.maior) ?? Math.max(a, b);
      return { a, b, c: n(o.c), altura: n(o.altura), menor, maior, confirmar: o.confirmar === '1' || o.confirmar === true };
    }
    const campo = (nome) => {
      const v = Number(String(form?.elements[nome]?.value || '').replace(',', '.'));
      return Number.isFinite(v) && v > 0 ? v : null;
    };

    function desenhar(anunciar) {
      const pMenor = cm(med.menor), pMaior = cm(med.maior);
      const L = campo('largura'), C = campo('comprimento'), alt = campo('altura');
      const temEspaco = L && C;
      const sMaior = temEspaco ? Math.max(L, C) : 0, sMenor = temEspaco ? Math.min(L, C) : 0;
      // Vista de baixo: horizontal = comprimento (o maior lado), vertical = largura.
      const lateralW = frontal ? cm(med.a ?? med.menor) : pMaior;
      const lateralH = frontal ? (med.altura ? cm(med.altura) : 0) : (med.c ? cm(med.c) : 0);
      const pessoaW = alt ? alt * 0.3 : 0;
      const planoW = Math.max(pMaior, sMaior), planoH = Math.max(pMenor, sMenor);
      const altLat = Math.max(lateralH, alt || 0);
      const dims = (m) => {
        const W = Math.max(planoW, lateralW + (alt ? pessoaW + 24 : 0)) + 2 * m;
        const yLat = m + planoH + m * 1.6;
        return { W, yLat, Hs: yLat + (lateralH || alt ? altLat + m * 0.9 : 0) };
      };
      // Rótulos com pelo menos 12 px na tela: o tamanho da letra compensa a escala do viewBox (no celular
      // a peça de 2 m cabe em 330 px e uma letra fixa em cm ficaria com 7 px). A margem cresce junto.
      let { W, yLat, Hs } = dims(22);
      const larg = svg.getBoundingClientRect().width || svg.parentElement?.clientWidth || 0;
      const escalaPx = larg ? Math.min(larg / W, 520 / Hs) : 1;
      const fs = Math.max(W / 34, 6, 12 / escalaPx);
      const m = Math.max(22, fs * 1.4);
      ({ W, yLat, Hs } = dims(m));
      ultimaLarg = larg;
      svg.replaceChildren();
      svg.setAttribute('viewBox', `0 0 ${fmt2(W)} ${fmt2(Hs)}`);
      const defs = el('defs', {}, svg);
      const pat = el('pattern', { id: 'escala-grade', width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, defs);
      el('path', { d: 'M10 0H0V10', fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.16', 'stroke-width': '.35' }, pat);
      el('rect', { width: fmt2(W), height: fmt2(Hs), fill: 'url(#escala-grade)' }, svg);

      const cx = m + planoW / 2, cy = m + planoH / 2;
      if (temEspaco) {
        el('rect', { class: 'escala__espaco', x: fmt2(cx - sMaior / 2), y: fmt2(cy - sMenor / 2), width: sMaior, height: sMenor }, svg);
      }
      // Cantos arredondados proporcionais (a forma real só existe na planta oficial; aqui é o contorno externo).
      const peca = el('rect', { class: 'escala__peca', x: fmt2(cx - pMaior / 2), y: fmt2(cy - pMenor / 2), width: pMaior, height: pMenor, rx: fmt2(Math.min(pMenor * 0.14, 14)) }, svg);
      const g = el('g', { class: 'escala__rot', 'font-size': fmt2(fs) }, svg);
      texto(g, fmt2(cx), fmt2(cy - pMenor / 2 - fs * 0.5), `${m2(med.maior)} m`, { 'text-anchor': 'middle' });
      texto(g, fmt2(cx - pMaior / 2 - fs * 0.45), fmt2(cy), `${m2(med.menor)} m`, { 'text-anchor': 'middle', transform: `rotate(-90 ${fmt2(cx - pMaior / 2 - fs * 0.45)} ${fmt2(cy)})` });

      let frase;
      let cabe = null;
      if (temEspaco) {
        const fM = sMenor - pMenor, fC = sMaior - pMaior;
        // Folga reportada nos rótulos que a pessoa digitou.
        const largEhMenor = L <= C;
        const fL = largEhMenor ? fM : fC, fCo = largEhMenor ? fC : fM;
        cabe = fL >= 0 && fCo >= 0;
        const parte = (v, nome) => (v >= 0 ? `sobram ${fmt(v)} cm ${nome === 'largura' ? 'na largura' : 'no comprimento'}` : `passa ${fmt(-v)} cm ${nome === 'largura' ? 'da largura' : 'do comprimento'}`);
        frase = cabe
          ? `Cabe. Sobram ${fmt(fL)} cm na largura e ${fmt(fCo)} cm no comprimento (cerca de ${fmt(fL / 2)} cm e ${fmt(fCo / 2)} cm de cada lado).`
          : `Não cabe: ${[parte(fL, 'largura'), parte(fCo, 'comprimento')].join(' e ')}.`;
        peca.classList.toggle('is-nao', !cabe);
        const gs = el('g', { class: 'escala__rot escala__rot--espaco', 'font-size': fmt2(fs) }, svg);
        texto(gs, fmt2(cx), fmt2(cy + sMenor / 2 + fs * 1.15), `Seu espaço: ${fmt(L)} x ${fmt(C)} cm`, { 'text-anchor': 'middle' });
      } else {
        frase = `Medidas externas publicadas: ${m2(med.maior)} m x ${m2(med.menor)} m${med.c ? ` x ${m2(med.c)} m` : ''}${med.altura ? `, altura ${m2(med.altura)} m` : ''}. Digite o seu espaço para ver a folga.`;
      }

      if (lateralH || alt) {
        const chao = yLat + altLat;
        el('path', { class: 'escala__chao', d: `M${m} ${fmt2(chao)}H${fmt2(W - m)}` }, svg);
        if (lateralH) {
          el('rect', { class: 'escala__peca escala__peca--lat', x: m, y: fmt2(chao - lateralH), width: lateralW, height: lateralH, rx: 2 }, svg);
          const gl = el('g', { class: 'escala__rot', 'font-size': fmt2(fs) }, svg);
          texto(gl, m, fmt2(chao - lateralH - fs * 0.5), frontal ? `Vista frontal · altura ${m2(med.altura)} m` : `Vista lateral · profundidade ${m2(med.c)} m`);
        }
        if (alt) {
          const px = m + lateralW + 24 + pessoaW / 2;
          pessoa(svg, px, chao, alt);
          const gp = el('g', { class: 'escala__rot', 'font-size': fmt2(fs) }, svg);
          texto(gp, fmt2(px), fmt2(chao - alt - fs * 0.5), `Você · ${fmt(alt)} cm`, { 'text-anchor': 'middle' });
        }
      }

      const alt1 = `${frase}${med.confirmar ? ' Medida a confirmar: o cálculo usa a maior das duas medidas publicadas.' : ''}`;
      svg.setAttribute('aria-label', `Desenho em escala sobre grade de 10 cm. ${alt1}`);
      if (txt) txt.textContent = frase;
      if (selo) selo.hidden = !med.confirmar;
      if (temEspaco && anunciar && cabe !== ultimoCabe) BBB.evento('cabe_no_espaco', { cabe, largura: L, comprimento: C, sku: raiz.closest('[data-sku]')?.dataset.sku || d.querySelector('[data-monte]')?.dataset.sku || null });
      ultimoCabe = cabe;
    }

    // Silhueta simples (cabeça, tronco e pernas) na escala da altura digitada.
    function pessoa(svg, cx, chao, h) {
      const k = h / 170;
      const g = el('g', { class: 'escala__pessoa', transform: `translate(${fmt2(cx)} ${fmt2(chao)}) scale(${k.toFixed(4)})` }, svg);
      el('circle', { cx: 0, cy: -158, r: 11 }, g);
      for (const [x, y, wd, ht, rx] of [[-15, -142, 30, 62, 8], [-24, -140, 8, 58, 4], [16, -140, 8, 58, 4], [-14, -84, 12, 84, 5], [2, -84, 12, 84, 5]]) el('rect', { x, y, width: wd, height: ht, rx }, g);
    }

    form?.addEventListener('input', () => desenhar(true));
    form?.addEventListener('submit', (e) => { e.preventDefault(); desenhar(true); });
    if (raiz.hasAttribute('data-segue-tamanho')) {
      d.addEventListener('bbb:tamanho', (e) => { med = ler(e.detail); desenhar(false); });
    }
    desenhar(false);
    // Largura mudou (giro da tela, painel aberto): redesenha para manter os rótulos legíveis.
    if ('ResizeObserver' in window) {
      let pend = false;
      new ResizeObserver(() => {
        if (pend) return;
        pend = true;
        requestAnimationFrame(() => {
          pend = false;
          const w = svg.getBoundingClientRect().width;
          if (w && Math.abs(w - ultimaLarg) > 24) desenhar(false);
        });
      }).observe(svg);
    }
  }
  const fmt2 = (n) => String(Math.round(n * 100) / 100);

  d.querySelectorAll('[data-escala]').forEach(bloco);
})();
