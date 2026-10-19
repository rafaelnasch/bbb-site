// Busca local (SPEC 6.2 P0). O índice (dados/indice.json) só é baixado quando a página abre.
// Normaliza acento e caixa, aceita "1.70" como "1,70", tolera 1 erro por termo (Levenshtein) em termos
// de 4 letras ou mais e aceita prefixo. Todos os termos precisam casar (E). Sugere coleções reais por
// faceta (ex.: "spa 6 lugares" sugere as categorias de lugares que contêm 6).
(() => {
  const d = document, w = window, BBB = w.BBB || {};
  const raiz = d.querySelector('[data-bus]');
  if (!raiz) return;
  const $ = (s) => d.querySelector(s);
  let cfg = {};
  try { cfg = JSON.parse(raiz.querySelector('script[data-config]')?.textContent || '{}'); } catch { /* sem config */ }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'em', 'para', 'e', 'a', 'o', 'x', 'p', 'um', 'uma', 'ate', 'm', 'cm']);
  const TIPO = { banheira: 'banheira banheiras', spa: 'spa spas', ofuro: 'ofuro ofuros', sauna: 'sauna saunas', acessorio: 'acessorio acessorios' };
  const PASSO = 48;

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1,$2').replace(/(\d)\s*x\s*(\d)/g, '$1 x $2');
  const tokens = (s) => norm(s).split(/[^a-z0-9,]+/).map((t) => t.replace(/^,+|,+$/g, '')).filter(Boolean);
  const termos = (s) => tokens(s).filter((t) => !PARADAS.has(t));

  function lev1(a, b) {
    // Distância de edição <= 1 (inserção, remoção, troca ou transposição de vizinhas).
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }
  /** Peso do casamento de um termo da busca com um termo do documento (0 = não casa). */
  function casa(q, t) {
    if (q === t) return 3;
    // "170" (cm) também procura a medida publicada em metros "1,70".
    if (/^[12]\d\d$/.test(q) && t === `${q[0]},${q.slice(1)}`) return 3;
    if (/^\d/.test(q)) return t.startsWith(q) && /,/.test(q) ? 2 : 0;
    if (q.length >= 2 && t.startsWith(q)) return 2;
    if (q.length >= 4 && (lev1(q, t) || (t.length > q.length && lev1(q, t.slice(0, q.length))))) return 1;
    return 0;
  }

  let docs = [], cats = [], ultimo = '', mostrados = PASSO;

  function preparar(ind) {
    cats = (ind.cats || []).map(([path, nome, total, rot]) => {
      const r = rot || nome;
      const faixa = /(\d+)\s*a\s*(\d+)\s*lugares/i.exec(r);
      return { path, nome: r, total, toks: termos(r), faixa: faixa ? [Number(faixa[1]), Number(faixa[2])] : null };
    });
    docs = (ind.itens || []).map((it) => {
      const campos = [
        [termos(it.n), 3],
        [[norm(it.k)], 5],
        [termos(`${TIPO[it.t] || ''} ${it.fo || ''} ${it.lu || ''} ${it.ma || ''} ${it.co || ''}`), 1],
        [termos(it.ts.map((t) => t[0]).join(' ')), 1],
        [termos((it.c || []).map((i) => cats[i]?.nome || '').join(' ')), 0.5],
      ];
      return { it, campos };
    });
  }

  function pontuar(doc, qs) {
    let total = 0;
    for (const q of qs) {
      let melhor = 0;
      for (const [toks, peso] of doc.campos) for (const t of toks) { const c = casa(q, t); if (c && c * peso > melhor) melhor = c * peso; }
      if (!melhor) return 0;
      total += melhor;
    }
    return total;
  }

  function facetas(qs) {
    if (!qs.length) return [];
    const n = qs.find((q) => /^\d+$/.test(q));
    return cats.map((c) => {
      let ok = 0;
      for (const q of qs) {
        if (/^\d+$/.test(q) && c.faixa) { if (Number(q) >= c.faixa[0] && Number(q) <= c.faixa[1]) ok++; continue; }
        if (c.toks.some((t) => casa(q, t))) ok++;
      }
      return { c, ok };
    }).filter((x) => x.ok === qs.length && (qs.length > 1 || !n)).sort((a, b) => a.c.toks.length - b.c.toks.length || b.c.total - a.c.total).slice(0, 4).map((x) => x.c);
  }

  function cartao(it) {
    const li = d.createElement('li');
    li.className = 'esc-c';
    li.dataset.sku = it.k;
    const eti = [it.fo, it.lu, it.ma, it.co].filter(Boolean).join(' · ');
    const t0 = it.ts[0];
    li.innerHTML = `${it.f ? `<img class="esc-c__img" src="${esc(it.f[0])}" width="${it.f[1]}" height="${it.f[2]}" alt="" loading="lazy" decoding="async">` : '<span class="esc-c__vazia">Foto sob consulta</span>'}
<span class="esc-c__eti">${esc(eti)}</span>
<h3 class="esc-c__nome"><a href="${esc(cfg.base + it.s)}.html">${esc(it.n)}</a></h3>
${t0 ? `<span class="esc-c__tam num">${esc(t0[0])}${it.ts.length > 1 ? ` <span class="esc-c__folga">+${it.ts.length - 1} ${it.ts.length === 2 ? 'medida' : 'medidas'}</span>` : ''}</span>` : ''}
<span class="esc-c__folga num">Nº de catálogo ${esc(it.k)}</span>
<span class="esc-c__preco num">${esc(it.po || '')}</span>
<span class="esc-c__acoes">${it.d ? `<span class="selo selo--esgotado">${esc(it.d)}</span>` : ''}<button class="cart__cmp" type="button" data-comparar="${esc(it.s)}" data-nome="${esc(it.n)}" data-sku="${esc(it.k)}" aria-pressed="${BBB.comparar?.tem(it.s) ? 'true' : 'false'}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect width="7" height="16" x="3" y="4" rx="1.5"/><rect width="7" height="16" x="14" y="4" rx="1.5"/></svg><span>Comparar</span></button></span>`;
    return li;
  }

  function buscar(texto, { gravar = true } = {}) {
    const qs = termos(texto);
    const chave = qs.join(' ');
    if (chave !== ultimo) mostrados = PASSO;
    ultimo = chave;
    const lista = $('[data-bus-lista]'), nEl = $('[data-bus-n]'), vazio = $('[data-bus-vazio]'), fac = $('[data-bus-facetas]');
    const inicio = $('[data-bus-inicio]'), maisBox = $('[data-bus-mais-box]');
    if (gravar) {
      try { history.replaceState(history.state, '', texto.trim() ? `?q=${encodeURIComponent(texto.trim())}` : location.pathname); } catch { /* sem history */ }
    }
    if (!qs.length) {
      lista.replaceChildren(); nEl.hidden = true; vazio.hidden = true; fac.hidden = true; inicio.hidden = false; maisBox.hidden = true;
      return;
    }
    inicio.hidden = true;
    const res = docs.map((doc) => ({ doc, s: pontuar(doc, qs) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const fs = facetas(qs);
    fac.hidden = !fs.length;
    fac.innerHTML = fs.length ? `<p class="etiqueta">Coleções que combinam</p><ul class="col-viz__lista" role="list">${fs.map((c) => `<li><a class="chip" href="${esc(cfg.base + c.path)}">${esc(c.nome)} <span class="num">${c.total}</span></a></li>`).join('')}</ul>` : '';
    nEl.hidden = false;
    nEl.textContent = res.length ? `${res.length} ${res.length === 1 ? 'modelo encontrado' : 'modelos encontrados'} para "${texto.trim()}"` : '';
    vazio.hidden = res.length > 0;
    lista.replaceChildren(...res.slice(0, mostrados).map((x) => cartao(x.doc.it)));
    maisBox.hidden = res.length <= mostrados;
    BBB.anunciar?.(res.length ? nEl.textContent : `Nada encontrado para ${texto.trim()}.`);
  }

  const campo = $('[data-bus-q]');
  let t = null;
  campo?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => buscar(campo.value), 120); });
  campo?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(t); buscar(campo.value); } });
  $('[data-bus-mais]')?.addEventListener('click', () => { mostrados += PASSO; buscar(campo.value, { gravar: false }); });

  const q0 = new URLSearchParams(location.search).get('q') || '';
  if (campo) campo.value = q0;
  fetch(cfg.indice).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then((ind) => {
    preparar(ind);
    raiz.dataset.pronto = '1';
    buscar(campo?.value || '', { gravar: false });
  }).catch(() => {
    const n = $('[data-bus-n]');
    n.hidden = false;
    n.textContent = 'Não foi possível carregar o catálogo agora.';
  });
  if (campo && !q0) campo.focus({ preventScroll: true });
})();
