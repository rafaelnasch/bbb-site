// "Monte a sua" (SPEC 6.2, P0) e doca de compra no celular. Total = finalPrice + tamanho +
// opções escolhidas, só com preco_adicional publicado. A mensagem de compra (SPEC 10.2) vai para
// todos os links de venda e de consultores; a troca de preço é anunciada em aria-live.
(() => {
  const d = document, w = window, H = d.documentElement, BBB = w.BBB;
  const form = d.querySelector('[data-monte]');
  if (!form) return;
  const ds = form.dataset;
  const esgotado = ds.esgotado === '1';
  const brl = (n) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cent = (v) => Math.round(Number(v || 0) * 100);
  const totalEl = d.querySelector('output[data-total]');
  const doca = d.querySelector('[data-doca]');
  const docaTam = doca?.querySelector('[data-doca-tam]');
  const docaTot = doca?.querySelector('[data-doca-total]');
  let ultimo = totalEl?.textContent || '';
  let tAnuncio = 0;

  function estado() {
    let c = cent(ds.preco);
    const s = { tamanho: null, voltagem: null, cor: null, outros: [], adicionais: [] };
    const tam = form.querySelector('input[name="tamanho"]:checked');
    if (tam) { c += cent(tam.dataset.preco); s.tamanho = tam.dataset.rotulo; }
    form.querySelectorAll('[data-grupo]').forEach((g) => {
      g.querySelectorAll('input:checked').forEach((i) => {
        c += cent(i.dataset.preco);
        const rot = i.dataset.rotulo;
        if (!rot) return;
        if (g.dataset.grupo === 'adicionais') s.adicionais.push(rot);
        else if (g.dataset.grupo === 'voltagem') s.voltagem = rot;
        else if (g.dataset.grupo === 'cor') s.cor = rot;
        else s.outros.push(`${g.dataset.titulo}: ${rot}`);
      });
    });
    s.total = c / 100;
    return s;
  }

  function mensagem(s) {
    const L = BBB.wa.linhas;
    return [
      ds.abertura,
      '',
      L([
        `Modelo: ${ds.nome}${ds.sku ? ` (SKU ${ds.sku})` : ''}`,
        s.tamanho ? `Tamanho: ${s.tamanho}` : null,
        s.voltagem ? `Voltagem: ${s.voltagem}` : null,
        s.cor ? `Cor: ${s.cor}` : null,
        ...s.outros,
        s.adicionais.length ? `Adicionais: ${s.adicionais.join(', ')}` : null,
        ds.coleta ? `Valor pelos preços do site em ${ds.coleta}: ${brl(s.total)}` : null,
        ds.url,
      ]),
    ].join('\n');
  }

  function atualizar(anunciar) {
    const s = estado();
    const txt = brl(s.total);
    if (totalEl && txt !== ultimo) {
      totalEl.textContent = txt;
      if (!BBB.lite) { totalEl.classList.remove('is-novo'); void totalEl.offsetWidth; totalEl.classList.add('is-novo'); }
      if (anunciar) {
        clearTimeout(tAnuncio);
        tAnuncio = setTimeout(() => BBB.anunciar(`Total pelos preços publicados: ${txt}`), 250);
      }
      ultimo = txt;
    }
    if (docaTot) docaTot.textContent = txt;
    if (docaTam && s.tamanho) docaTam.textContent = s.tamanho;
    if (!esgotado) BBB.wa.venda(mensagem(s));
  }

  form.addEventListener('change', () => atualizar(true));
  form.addEventListener('submit', (e) => e.preventDefault());
  atualizar(false);

  // ---------- Prazo por estado (sem geolocalização) ----------
  const uf = d.querySelector('[data-prazo-uf]');
  uf?.addEventListener('change', () => {
    const v = uf.value;
    let n = 0;
    d.querySelectorAll('[data-prazo] tbody tr').forEach((tr) => {
      const on = Boolean(v) && (tr.dataset.ufs || '').split(' ').includes(v);
      if (on) n++;
      tr.classList.toggle('is-uf', on);
      tr.classList.toggle('is-fora', Boolean(v) && !on);
    });
    if (v) BBB.anunciar(`${v}: ${n} ${n === 1 ? 'linha' : 'linhas'} de prazo em destaque.`);
  });

  // ---------- Doca de compra (celular): aparece quando a coluna de decisão já passou ----------
  if (!doca) return;
  const alvo = d.querySelector('#comprar') || form;
  const mq = w.matchMedia('(max-width: 1023px)');
  let passou = false;
  const aplicar = () => {
    const ver = mq.matches && passou;
    if (ver === !doca.hidden) return;
    doca.hidden = !ver;
    H.style.setProperty('--doca-h', ver ? `${doca.offsetHeight}px` : '0px');
  };
  // Rolagem com rAF (e não IntersectionObserver): um salto direto para baixo, por âncora ou tecla End,
  // não cruza a coluna e o observador não dispararia.
  let pend = false;
  const medir = () => {
    pend = false;
    passou = alvo.getBoundingClientRect().bottom < 0;
    aplicar();
  };
  w.addEventListener('scroll', () => { if (!pend) { pend = true; requestAnimationFrame(medir); } }, { passive: true });
  medir();
  mq.addEventListener?.('change', aplicar);
})();
