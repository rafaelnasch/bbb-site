// Coleção (SPEC 9.2 e 6.2): filtros (forma, lugares, material, configuração, faixa de tamanho real,
// preço e "Cabe em"), ordenação, contagem ao vivo, estado na URL e "Ver em escala" (todos os
// resultados filtrados numa régua, do menor ao maior, sobre o espaço digitado). Sem JS, todos os
// cartões ficam visíveis e são links. Encaixe: a peça pode girar (mesma regra do escolhedor, sem folga).
(() => {
  const d = document, w = window, BBB = w.BBB || {};
  const grade = d.querySelector('[data-col-grade]');
  if (!grade) return;
  const $ = (s, r = d) => r.querySelector(s);
  const form = $('[data-col-form]');
  const ordens = [...d.querySelectorAll('[data-col-ordem]')];
  const ordemSel = ordens[0];
  const ativos = $('[data-col-ativos]');
  const vazio = $('[data-col-vazio]');
  const painel = $('[data-col-escala-painel]');
  const btnEscala = $('[data-col-escala]');
  const CAMPOS = ['fo', 'lu', 'ma', 'co', 'fx'];
  const NOME_CAMPO = { fo: 'Forma', lu: 'Lugares', ma: 'Material', co: 'Configuração', fx: 'Tamanho' };
  const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const m2 = (cm) => (cm / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const itens = [...grade.children].map((li) => {
    const t = (li.dataset.t || '').split(',').filter(Boolean).map((x) => x.split(':').map(Number));
    const maior = t.length ? t.reduce((a, b) => (b[0] * b[1] > a[0] * a[1] ? b : a)) : null;
    return {
      li,
      pos: Number(li.dataset.pos),
      fo: li.dataset.fo, lu: li.dataset.lu, ma: li.dataset.ma, co: li.dataset.co,
      fx: new Set((li.dataset.fx || '').split(',').filter(Boolean)),
      p: li.dataset.p === '' ? null : Number(li.dataset.p),
      t,
      big: maior,
      menorMedida: t.length ? Math.min(...t.map((x) => x[1])) : Infinity,
      maiorMedida: t.length ? Math.max(...t.map((x) => x[1])) : -Infinity,
      nome: ($('.cart__nome', li)?.textContent || '').trim(),
      href: $('.cart__a', li)?.getAttribute('href') || '#',
    };
  });

  // Encaixe com rotação: menor lado da peça contra o menor lado do espaço (sem folga).
  const avalia = (me, ma, L, C) => {
    const sMe = Math.min(L, C), sMa = Math.max(L, C);
    return { cabe: me <= sMe + 1e-9 && ma <= sMa + 1e-9, folga: (sMe - me) + (sMa - ma) };
  };
  const cabeEm = (it, L, C) => it.t.some(([me, ma]) => avalia(me, ma, L, C).cabe);

  function estado() {
    const s = { fo: [], lu: [], ma: [], co: [], fx: [], ate: null, l: null, c: null };
    if (!form) return s;
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox' && el.checked && s[el.name]) s[el.name].push(el.value);
      else if (el.type === 'range' && Number(el.value) < Number(el.max)) s.ate = Number(el.value);
      else if (el.type === 'number' && Number(el.value) > 0) s[el.name] = Number(el.value);
    }
    if (!(s.l && s.c)) { s.l = null; s.c = null; }
    return s;
  }

  const passa = (it, s, ignorar) => {
    for (const k of ['fo', 'lu', 'ma', 'co']) if (k !== ignorar && s[k].length && !s[k].includes(it[k])) return false;
    if (ignorar !== 'fx' && s.fx.length && !s.fx.some((x) => it.fx.has(x))) return false;
    if (ignorar !== 'ate' && s.ate != null && !(it.p != null && it.p <= s.ate)) return false;
    if (ignorar !== 'cabe' && s.l && !cabeEm(it, s.l, s.c)) return false;
    return true;
  };

  function rotuloValor(k, v) {
    if (k !== 'fx') return v;
    const lab = form?.querySelector(`input[name="fx"][value="${v}"]`)?.parentElement?.querySelector('span');
    return lab ? lab.firstChild.textContent.trim() : v;
  }

  function chips(s) {
    if (!ativos) return;
    const lista = [];
    for (const k of CAMPOS) for (const v of s[k]) lista.push({ t: `${NOME_CAMPO[k]}: ${rotuloValor(k, v)}`, tirar: () => { const el = form.querySelector(`input[name="${k}"][value="${CSS.escape(v)}"]`); if (el) el.checked = false; } });
    if (s.ate != null) lista.push({ t: `Até ${brl(s.ate)}`, tirar: () => { const r = form.elements.ate; r.value = r.max; } });
    if (s.l) lista.push({ t: `Cabe em ${s.l} x ${s.c} cm`, tirar: () => { form.elements.l.value = ''; form.elements.c.value = ''; } });
    ativos.hidden = !lista.length;
    ativos.replaceChildren(...lista.map((x) => {
      const sp = d.createElement('span');
      sp.className = 'col-ativo';
      sp.append(x.t);
      const b = d.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Remover filtro ${x.t}`);
      b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      b.addEventListener('click', () => { x.tirar(); aplicar(true); });
      sp.append(b);
      return sp;
    }));
    if (lista.length > 1) {
      const l = d.createElement('button');
      l.type = 'button';
      l.className = 'col-ativos__limpar';
      l.textContent = 'Limpar tudo';
      l.addEventListener('click', limpar);
      ativos.append(l);
    }
    const nf = $('[data-col-nf]');
    if (nf) { nf.hidden = !lista.length; nf.textContent = lista.length; }
  }

  function gravarUrl(s) {
    const q = new URLSearchParams();
    for (const k of CAMPOS) for (const v of s[k]) q.append(k, v);
    if (s.ate != null) q.set('ate', s.ate);
    if (s.l) { q.set('l', s.l); q.set('c', s.c); }
    const o = ordemSel?.value;
    if (o && o !== 'posicao') q.set('ordem', o);
    const qs = q.toString();
    try { history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname); } catch { /* sem history */ }
  }

  function lerUrl() {
    const q = new URLSearchParams(location.search);
    if (form) {
      for (const k of CAMPOS) for (const v of q.getAll(k)) { const el = form.querySelector(`input[name="${k}"][value="${CSS.escape(v)}"]`); if (el) el.checked = true; }
      const ate = Number(q.get('ate'));
      if (ate && form.elements.ate) form.elements.ate.value = String(Math.min(Math.max(ate, Number(form.elements.ate.min)), Number(form.elements.ate.max)));
      const l = Number(q.get('l')), c = Number(q.get('c'));
      if (l > 0 && c > 0 && form.elements.l) { form.elements.l.value = l; form.elements.c.value = c; }
    }
    const o = q.get('ordem');
    if (o && ordemSel && [...ordemSel.options].some((x) => x.value === o)) ordens.forEach((x) => { x.value = o; });
  }

  const ORD = {
    posicao: (a, b) => a.pos - b.pos,
    'menor-medida': (a, b) => a.menorMedida - b.menorMedida || a.pos - b.pos,
    'maior-medida': (a, b) => b.maiorMedida - a.maiorMedida || a.pos - b.pos,
    'menor-preco': (a, b) => (a.p ?? Infinity) - (b.p ?? Infinity) || a.pos - b.pos,
    'maior-preco': (a, b) => (b.p ?? -Infinity) - (a.p ?? -Infinity) || a.pos - b.pos,
    nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.pos - b.pos,
  };
  function ordenar() {
    const f = ORD[ordemSel?.value] || ORD.posicao;
    grade.append(...[...itens].sort(f).map((x) => x.li));
  }

  let ultimo = itens.length;
  function aplicar(anim) {
    const s = estado();
    let n = 0;
    for (const it of itens) {
      const ok = passa(it, s);
      it.li.hidden = !ok;
      if (ok) n++;
    }
    const txt = n === 1 ? 'peça' : 'peças';
    const nEl = $('[data-col-n]');
    if (nEl) nEl.textContent = n;
    const nT = $('[data-col-n-txt]');
    if (nT) nT.textContent = txt;
    const nB = $('[data-col-n-btn]');
    if (nB) nB.textContent = n;
    if (form?.elements.ate) {
      const o = $('[data-col-ate]');
      if (o) o.textContent = Number(form.elements.ate.value) >= Number(form.elements.ate.max) ? 'Sem limite' : `Até ${brl(form.elements.ate.value)}`;
    }
    if (vazio) vazio.hidden = n > 0;
    chips(s);
    gravarUrl(s);
    if (anim && n !== ultimo && !BBB.lite) {
      grade.classList.remove('is-filtrando');
      void grade.offsetWidth;
      grade.classList.add('is-filtrando');
    }
    ultimo = n;
    if (painel && !painel.hidden) desenharEscala(s);
  }

  function limpar() {
    form?.reset();
  }

  // ---------- Ver em escala ----------
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, at) => { const e = d.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
  function desenharEscala(s = estado()) {
    const lista = $('[data-col-escala-lista]');
    if (!lista) return;
    const vis = itens.filter((it) => !it.li.hidden && it.big);
    const esp = s.l ? { me: Math.min(s.l, s.c), ma: Math.max(s.l, s.c) } : null;
    const escolha = (it) => {
      if (!esp) return { me: it.big[0], ma: it.big[1], cabe: null };
      let best = null;
      for (const [me, ma] of it.t) {
        const r = avalia(me, ma, s.l, s.c);
        if (r.cabe && (!best || r.folga < best.folga)) best = { me, ma, cabe: true, folga: r.folga };
      }
      if (best) return best;
      const menor = it.t.reduce((a, b) => (b[0] * b[1] < a[0] * a[1] ? b : a));
      return { me: menor[0], ma: menor[1], cabe: false };
    };
    const linhas = vis.map((it) => ({ it, x: escolha(it) })).sort((a, b) => a.x.ma - b.x.ma || a.x.me - b.x.me);
    const altMax = Math.max(1, ...linhas.map((l) => l.x.me), esp ? esp.me : 0);
    const k = Math.min(1.1, 170 / altMax);
    const frag = d.createDocumentFragment();
    for (const { it, x } of linhas) {
      const W = Math.max(x.ma, esp ? esp.ma : 0) * k, H = Math.max(x.me, esp ? esp.me : 0) * k;
      const li = d.createElement('li');
      const a = d.createElement('a');
      a.href = it.href;
      const svg = svgEl('svg', { width: Math.ceil(W + 2), height: Math.ceil(H + 2), viewBox: `-1 -1 ${(W + 2).toFixed(1)} ${(H + 2).toFixed(1)}`, 'aria-hidden': 'true' });
      if (esp) svg.append(svgEl('rect', { class: 'e', x: 0, y: (H - esp.me * k).toFixed(1), width: (esp.ma * k).toFixed(1), height: (esp.me * k).toFixed(1) }));
      svg.append(svgEl('rect', { class: `p${x.cabe === false ? ' nao' : ''}`, x: 0, y: (H - x.me * k).toFixed(1), width: (x.ma * k).toFixed(1), height: (x.me * k).toFixed(1), rx: 2 }));
      const n = d.createElement('span');
      n.className = 'col-escala__n';
      n.textContent = it.nome;
      const m = d.createElement('span');
      m.className = 'col-escala__m num';
      m.textContent = `${m2(x.ma)} x ${m2(x.me)} m${x.cabe === false ? ' · não cabe' : ''}`;
      a.append(svg, n, m);
      a.setAttribute('aria-label', `${it.nome}, ${m.textContent}`);
      li.append(a);
      frag.append(li);
    }
    lista.replaceChildren(frag);
    const t = $('[data-col-escala-txt]');
    if (t) {
      const cabem = esp ? linhas.filter((l) => l.x.cabe).length : null;
      const ext = linhas.length ? `de ${m2(linhas[0].x.ma)} a ${m2(linhas[linhas.length - 1].x.ma)} m` : '';
      t.textContent = linhas.length
        ? `${linhas.length} ${linhas.length === 1 ? 'peça' : 'peças'} ${ext}${esp ? `. ${cabem} ${cabem === 1 ? 'cabe' : 'cabem'} em ${s.l} x ${s.c} cm` : ''}.`
        : 'Nenhuma peça com medida publicada nos filtros atuais.';
    }
  }
  btnEscala?.addEventListener('click', () => {
    const abrir = painel.hidden;
    painel.hidden = !abrir;
    btnEscala.setAttribute('aria-expanded', String(abrir));
    if (abrir) {
      desenharEscala();
      painel.scrollIntoView({ block: 'start', behavior: BBB.lite ? 'auto' : 'smooth' });
    }
  });

  // ---------- Eventos ----------
  form?.addEventListener('input', () => aplicar(true));
  form?.addEventListener('change', () => aplicar(true));
  form?.addEventListener('reset', () => requestAnimationFrame(() => { ordens.forEach((x) => { x.value = 'posicao'; }); ordenar(); aplicar(true); }));
  form?.addEventListener('submit', (e) => { e.preventDefault(); aplicar(true); });
  d.querySelector('[data-col-limpar]')?.addEventListener('click', limpar);
  ordens.forEach((o) => o.addEventListener('change', (e) => { e.stopPropagation(); ordens.forEach((x) => { x.value = o.value; }); ordenar(); aplicar(false); }));

  lerUrl();
  ordenar();
  aplicar(false);

  // ---------- Filme da sala (coleções raiz) ----------
  const filme = d.querySelector('video[data-filme]');
  if (filme && !BBB.lite) {
    const ligar = () => {
      if (BBB.lite || filme.dataset.ok) return;
      filme.dataset.ok = '1';
      for (const [k, tp] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
        const s = d.createElement('source');
        s.src = filme.dataset[k];
        s.type = tp;
        filme.append(s);
      }
      filme.addEventListener('playing', () => filme.parentElement?.classList.add('is-tocando'), { once: true });
      filme.load();
      filme.play?.().catch(() => {});
    };
    const ocioso = () => requestAnimationFrame(() => requestAnimationFrame(() => (w.requestIdleCallback ? w.requestIdleCallback(ligar, { timeout: 4000 }) : setTimeout(ligar, 300))));
    if (d.readyState === 'complete') ocioso(); else w.addEventListener('load', ocioso, { once: true });
  }
})();
