// Comparador (SPEC 6.2 P0): até 3 peças da URL (?p=) ou da bandeja; contornos sobrepostos na mesma
// escala, com "meu espaço"; tabela semântica com "Mostrar só as diferenças"; WhatsApp com os 3.
// Tudo o que aparece vem de dados/indice.json e dados/fichas.json (rótulos literais da ficha).
(() => {
  const d = document, w = window, BBB = w.BBB || {};
  const raiz = d.querySelector('[data-cmp]');
  if (!raiz) return;
  const $ = (s, r = d) => r.querySelector(s);
  let cfg = {};
  try { cfg = JSON.parse(raiz.querySelector('script[data-config]')?.textContent || '{}'); } catch { /* sem config */ }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fcm = (n) => (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const CORES = [['var(--glow)', ''], ['var(--line)', '7 4'], ['#F4A6C0', '2 3']];
  const ROT = { Configuracao: 'Configuração', frete: 'Frete' };
  const ORDEM = ['Forma', 'Lugares', 'Material', 'Configuracao', 'Comprimento', 'Largura', 'Profundidade', 'Altura', 'frete'];
  let porSlug = new Map(), fichas = {}, sel = [], tam = {};

  function lerUrl() {
    const q = new URLSearchParams(location.search);
    const p = (q.get('p') || '').split(',').map((s) => s.trim()).filter((s) => porSlug.has(s)).slice(0, 3);
    const t = (q.get('t') || '').split(',');
    p.forEach((s, i) => { const n = Number(t[i]); if (Number.isInteger(n) && n >= 0) tam[s] = n; });
    return p;
  }
  function gravarUrl() {
    // Vírgulas sem codificar: o endereço fica legível para quem copia e manda (slugs já são seguros).
    const q = sel.length ? `?p=${sel.map(encodeURIComponent).join(',')}${sel.some((s) => tam[s]) ? `&t=${sel.map((s) => tam[s] || 0).join(',')}` : ''}` : '';
    try { history.replaceState(history.state, '', q || location.pathname); } catch { /* sem history */ }
  }
  const tamanho = (it) => it.ts[Math.min(tam[it.s] || 0, it.ts.length - 1)] || null;
  const espaco = () => {
    const f = $('[data-cmp-espaco]');
    const l = Number(f?.elements.l.value), c = Number(f?.elements.c.value);
    return l > 0 && c > 0 ? { l, c } : null;
  };

  // ---------- Contornos sobrepostos ----------
  function desenhar() {
    const svg = $('[data-cmp-svg]');
    const its = sel.map((s) => porSlug.get(s));
    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, a, p) => { const e = d.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.append(e); return e; };
    const pecas = its.map((it, i) => ({ it, i, t: tamanho(it) })).filter((x) => x.t && x.t[1] && x.t[2]);
    const sp = espaco();
    const W = Math.max(60, ...pecas.map((x) => x.t[2]), sp ? Math.max(sp.l, sp.c) : 0);
    const H = Math.max(40, ...pecas.map((x) => x.t[1]), sp ? Math.min(sp.l, sp.c) : 0);
    const m = Math.max(W, H) * 0.06;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${(W + 2 * m).toFixed(1)} ${(H + 2 * m).toFixed(1)}`);
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'cmp-grade', width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M10 0H0V10', fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.16', 'stroke-width': '.35' }, pat);
    el('rect', { width: W + 2 * m, height: H + 2 * m, fill: 'url(#cmp-grade)' }, svg);
    if (sp) el('rect', { class: 'cmp-svg__esp', x: m, y: m, width: Math.max(sp.l, sp.c), height: Math.min(sp.l, sp.c) }, svg);
    for (const x of pecas) {
      const [cor, dash] = CORES[x.i];
      el('rect', { x: m, y: m, width: x.t[2], height: x.t[1], rx: 2, fill: 'none', stroke: cor, 'stroke-width': 2, 'stroke-dasharray': dash, 'vector-effect': 'non-scaling-stroke' }, svg);
    }
    const leg = $('[data-cmp-leg]');
    leg.innerHTML = pecas.map((x) => `<span class="cmp-leg__i"><svg width="28" height="10" aria-hidden="true"><path d="M1 5h26" stroke="${CORES[x.i][0]}" stroke-width="2.5" stroke-dasharray="${CORES[x.i][1]}"/></svg>${esc(x.it.n)} <span class="num">${fcm(x.t[2])} x ${fcm(x.t[1])} cm</span>${x.t[4] ? ' · medida a confirmar' : ''}</span>`).join('') + (sp ? '<span class="cmp-leg__i"><span class="escala__chave escala__chave--espaco">Seu espaço</span></span>' : '') + '<span class="cmp-leg__i">Grade de 10 cm</span>';
    const txt = $('[data-cmp-txt]');
    if (sp) {
      const sMe = Math.min(sp.l, sp.c), sMa = Math.max(sp.l, sp.c);
      txt.textContent = pecas.map((x) => {
        const a = sMe - x.t[1], b = sMa - x.t[2];
        return `${x.it.n}: ${a >= 0 && b >= 0 ? `cabe, sobram ${fcm(a)} e ${fcm(b)} cm` : `não cabe, ${a < 0 ? `passa ${fcm(-a)} cm do lado menor` : ''}${a < 0 && b < 0 ? ' e ' : ''}${b < 0 ? `passa ${fcm(-b)} cm do lado maior` : ''}`}`;
      }).join('. ') + '.';
    } else txt.textContent = 'Digite o seu espaço para ver a folga de cada modelo.';
    svg.setAttribute('aria-label', `Contornos de ${pecas.length} modelos na mesma escala, sobre grade de 10 cm. ${txt.textContent}`);
  }

  // ---------- Tabela ----------
  function linhas(its) {
    const L = [];
    const add = (rot, vals, opts = {}) => L.push({ rot, vals, ...opts });
    add('Preço', its.map((it) => {
      const t = tamanho(it);
      const extra = t && t[3] ? `<br><span class="cmp-sub">${brl(it.pf + t[3])} com este tamanho</span>` : '';
      return `<span class="num cmp-preco">${esc(it.po || '')}</span>${it.de ? ` <s class="preco-de num">${esc(it.de)}</s>` : ''}${extra}`;
    }));
    add('Disponibilidade', its.map((it) => esc(it.d || 'Disponível')));
    add('Tamanho', its.map((it) => {
      const t = tamanho(it);
      if (!t) return 'Não publicado';
      const fd = fichas[it.s]?.fd?.[t[0]];
      return `<span class="num">${esc(t[0])}</span>${fd ? `<span class="cmp-sub">Medida a confirmar: a ficha informa ${esc(fd)}.</span>` : ''}`;
    }));
    add('Tamanhos vendidos', its.map((it) => `${it.ts.length || 'Nenhum'}${it.ts.length > 1 ? ` <span class="cmp-sub num">${it.ts.map((t) => esc(t[0])).join('; ')}</span>` : ''}`));
    const chaves = [];
    for (const it of its) for (const k of Object.keys(fichas[it.s]?.e || {})) if (!chaves.includes(k)) chaves.push(k);
    chaves.sort((a, b) => (ORDEM.indexOf(a) + 1 || 99) - (ORDEM.indexOf(b) + 1 || 99));
    for (const k of chaves) {
      add(ROT[k] || k, its.map((it) => {
        const f = fichas[it.s] || {};
        const v = f.e?.[k];
        if (v == null || v === '') return 'Não publicado';
        return `<span class="num">${esc(v)}</span>${f.cf?.[k] ? `<span class="cmp-sub">O nome do modelo diz ${esc(f.cf[k])}. Confirme com o consultor.</span>` : ''}`;
      }));
    }
    add('Itens de série', its.map((it) => {
      const i = fichas[it.s]?.i || [];
      return i.length ? `<ul class="cmp-itens">${i.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : 'Não publicado';
    }), { alto: true });
    add('Aquecedor opcional', its.map((it) => ('aq' in it ? esc(it.aq || 'Sim') : 'Não publicado')));
    add('Planta oficial', its.map((it) => {
      const t = tamanho(it);
      const pl = t && fichas[it.s]?.pl?.[t[0]];
      if (!pl) return it.t === 'acessorio' ? 'Não se aplica' : 'Planta deste tamanho não publicada pela fábrica';
      return `${pl[1] ? `<img class="cmp-planta-img" src="${esc(pl[1])}" width="1200" height="${pl[2] || 860}" alt="Planta oficial: ${esc(it.n)}, ${esc(t[0])}" loading="lazy" decoding="async">` : ''}<a class="link" href="${esc(pl[0])}" target="_blank" rel="noopener">Baixar a planta oficial (PDF)</a>`;
    }), { semDif: true });
    add('Nº de catálogo', its.map((it) => `<span class="num">${esc(it.k)}</span>`));
    return L;
  }

  function tabela() {
    const its = sel.map((s) => porSlug.get(s));
    const thead = $('[data-cmp-thead]');
    thead.innerHTML = `<tr><td class="cmp-canto"></td>${its.map((it, i) => {
      const opts = it.ts.length > 1 ? `<label class="cmp-tam"><span class="vh">Tamanho de ${esc(it.n)}</span><select data-cmp-tam="${esc(it.s)}">${it.ts.map((t, j) => `<option value="${j}"${j === (tam[it.s] || 0) ? ' selected' : ''}>${esc(t[0])}</option>`).join('')}</select></label>` : '';
      return `<th scope="col" class="cmp-col" style="--cor:${CORES[i][0]}"><span class="cmp-col__fio" aria-hidden="true"></span>${it.f ? `<img class="cmp-col__img" src="${esc(it.f[0])}" width="${it.f[1]}" height="${it.f[2]}" alt="" loading="lazy" decoding="async">` : '<span class="cmp-col__vazia">Foto sob consulta</span>'}<a class="cmp-col__nome" href="${esc(cfg.base + it.s)}.html">${esc(it.n)}</a>${opts}<button class="cmp-col__tirar" type="button" data-cmp-tirar="${esc(it.s)}">Tirar da comparação</button></th>`;
    }).join('')}</tr>`;
    const tbody = $('[data-cmp-tbody]');
    const so = $('[data-cmp-dif]')?.checked;
    tbody.innerHTML = linhas(its).map((l) => {
      const iguais = !l.semDif && its.length > 1 && l.vals.every((v) => v === l.vals[0]);
      return `<tr${iguais ? ' data-igual' : ''}${iguais && so ? ' hidden' : ''}><th scope="row">${esc(l.rot)}</th>${l.vals.map((v) => `<td>${v}</td>`).join('')}</tr>`;
    }).join('');
    const wa = $('[data-cmp-wa]');
    if (wa && BBB.wa) {
      const nomes = its.map((it) => it.n);
      const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
      BBB.wa.texto(wa, [`Quero ajuda para decidir entre ${lista}.`, ...its.map((it) => `${cfg.site}${it.s}.html`)].join('\n'));
    }
  }

  function render() {
    const vazio = !sel.length;
    $('[data-cmp-vazio]').hidden = !vazio;
    $('[data-cmp-corpo]').hidden = vazio;
    $('[data-cmp-planta]').hidden = vazio;
    $('[data-cmp-add]').hidden = sel.length >= 3;
    gravarUrl();
    if (vazio) return;
    tabela();
    desenhar();
  }

  function sincronizar() {
    const lista = (BBB.comparar?.lista() || []).map((x) => x.slug).filter((s) => porSlug.has(s));
    if (lista.join() !== sel.join()) { sel = lista; render(); }
  }

  // ---------- Incluir pela busca ----------
  const busca = $('[data-cmp-busca]'), sug = $('[data-cmp-sug]');
  busca?.addEventListener('input', () => {
    const q = norm(busca.value).trim();
    if (q.length < 2) { sug.hidden = true; sug.replaceChildren(); return; }
    const ts = q.split(/\s+/);
    const achados = [...porSlug.values()].filter((it) => !sel.includes(it.s) && ts.every((t) => norm(`${it.n} ${it.k}`).includes(t))).slice(0, 8);
    sug.innerHTML = achados.map((it) => `<li role="option"><button type="button" data-cmp-incluir="${esc(it.s)}">${esc(it.n)} <span class="num">${esc(it.po || '')}</span></button></li>`).join('') || '<li class="cmp-sug__nada">Nenhum modelo com esse nome.</li>';
    sug.hidden = false;
  });

  d.addEventListener('click', (e) => {
    const inc = e.target.closest('[data-cmp-incluir]');
    if (inc) {
      const it = porSlug.get(inc.dataset.cmpIncluir);
      if (it && BBB.comparar?.add({ slug: it.s, nome: it.n, sku: it.k })) { busca.value = ''; sug.hidden = true; }
      sincronizar();
      return;
    }
    const tirar = e.target.closest('[data-cmp-tirar]');
    if (tirar) { BBB.comparar?.remover(tirar.dataset.cmpTirar); sincronizar(); return; }
    if (e.target.closest('[data-comparar-rem],[data-comparar-limpar]')) requestAnimationFrame(sincronizar);
  });
  d.addEventListener('change', (e) => {
    const s = e.target.closest('[data-cmp-tam]');
    if (s) { tam[s.dataset.cmpTam] = Number(s.value); render(); return; }
    if (e.target.closest('[data-cmp-dif]')) {
      const so = e.target.checked;
      d.querySelectorAll('[data-cmp-tbody] tr[data-igual]').forEach((tr) => { tr.hidden = so; });
      BBB.anunciar?.(so ? 'Mostrando só as linhas que mudam entre os modelos.' : 'Mostrando todas as linhas.');
    }
  });
  $('[data-cmp-espaco]')?.addEventListener('input', desenhar);
  $('[data-cmp-espaco]')?.addEventListener('submit', (e) => e.preventDefault());
  w.addEventListener('storage', (e) => { if (e.key === 'bbb:comparar') requestAnimationFrame(sincronizar); });

  const carregando = $('[data-cmp-carregando]');
  carregando.hidden = false;
  Promise.all([cfg.indice, cfg.fichas].map((u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))))).then(([ind, fic]) => {
    porSlug = new Map((ind.itens || []).map((it) => [it.s, it]));
    fichas = fic || {};
    carregando.hidden = true;
    const daUrl = lerUrl();
    if (daUrl.length && BBB.comparar) BBB.comparar.definir(daUrl.map((s) => ({ slug: s, nome: porSlug.get(s).n })));
    sel = daUrl.length ? daUrl : (BBB.comparar?.lista() || []).map((x) => x.slug).filter((s) => porSlug.has(s));
    render();
  }).catch(() => { carregando.textContent = 'Não foi possível carregar os dados agora.'; });
})();
