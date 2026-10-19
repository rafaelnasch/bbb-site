// Escolhedor (SPEC 9.4). Lê dados/indice.json só quando a página abre; filtra, conta ao vivo e guarda o
// estado na URL. Encaixe com rotação (mesma regra de build/lib/encaixe.mjs):
//   cabe se menor + folga <= menor lado do espaço e maior + folga <= maior lado do espaço;
//   quase cabe se só uma dimensão passa, por até 10 cm.
// Medida a confirmar: o índice já traz a maior das duas medidas publicadas.
(() => {
  const d = document, w = window, BBB = w.BBB || {};
  const raiz = d.querySelector('[data-esc]');
  if (!raiz) return;
  const $ = (s, r = raiz) => r.querySelector(s);
  const $$ = (s, r = raiz) => [...r.querySelectorAll(s)];
  let cfg = {};
  try { cfg = JSON.parse(raiz.querySelector('script[data-config]')?.textContent || '{}'); } catch { /* sem config */ }
  const form = $('[data-esc-form]');
  const QUASE = cfg.quase || 10;
  const NOME = { banheira: 'banheira', spa: 'spa', ofuro: 'ofurô', sauna: 'sauna' };
  const ARTIGO = { banheira: 'uma banheira', spa: 'um spa', ofuro: 'um ofurô', sauna: 'uma sauna' };
  const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fcm = (n) => (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let itens = [], passo = 1, concluido = false;

  // ---------- Encaixe ----------
  function avaliar(t, L, C, f) {
    const sMe = Math.min(L, C), sMa = Math.max(L, C);
    const r1 = (n) => Math.round(n * 10) / 10;
    const sobraMe = r1(sMe - (t[1] + f)), sobraMa = r1(sMa - (t[2] + f));
    const largEhMenor = L <= C;
    const sL = largEhMenor ? sobraMe : sobraMa, sC = largEhMenor ? sobraMa : sobraMe;
    const cabe = sobraMe >= 0 && sobraMa >= 0;
    let quase = false, excesso = 0, dim = null;
    if (!cabe) {
      const neg = [sL, sC].filter((v) => v < 0);
      if (neg.length === 1 && -neg[0] <= QUASE) { quase = true; excesso = -neg[0]; dim = sL < 0 ? 'largura' : 'comprimento'; }
    }
    return { cabe, quase, sL, sC, total: r1(sobraMe + sobraMa), excesso, dim };
  }
  function melhor(it, L, C, f) {
    let m = null;
    it.ts.forEach((t, i) => {
      if (t[1] == null || t[2] == null) return;
      const r = { i, ...avaliar(t, L, C, f) };
      if (!r.cabe && !r.quase) return;
      if (!m || (r.cabe && !m.cabe) || (r.cabe && m.cabe && r.total < m.total) || (!r.cabe && !m.cabe && r.excesso < m.excesso)) m = r;
    });
    return m;
  }

  // ---------- Estado ----------
  const radio = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value || '';
  function estado() {
    const num = (n) => { const v = Number(form.elements[n]?.value); return Number.isFinite(v) && v > 0 ? v : null; };
    const ns = form.elements.ns?.checked || false;
    const l = ns ? null : num('l'), c = ns ? null : num('c');
    const rng = form.elements.max;
    return {
      tipo: radio('tipo'), l: l && c ? l : null, c: l && c ? c : null, folga: Number(radio('folga')) || 0, ns,
      pessoas: radio('pessoas'), onde: radio('onde'), forma: radio('forma'), conf: radio('conf'), mat: radio('mat'),
      aq: form.elements.aq?.checked || false,
      max: rng && Number(rng.max) > 0 && Number(rng.value) < Number(rng.max) ? Number(rng.value) : null,
    };
  }

  const pessoasOk = (it, v) => {
    if (!v) return true;
    if (v.startsWith('spa')) { const ci = cfg.cats?.spa?.[v]?.[1]; return it.t === 'spa' && ci >= 0 && it.c.includes(ci); }
    if (it.ln == null) return false;
    return v === '3+' ? it.ln >= 3 : it.ln === Number(v);
  };
  const ondeOk = (it, v) => {
    if (v === 'banheiro' && it.t === 'banheira') return it.c.includes(cfg.cats.banheiro);
    if (v === 'externo' && it.t === 'ofuro') return it.c.includes(cfg.cats.externo);
    return true;
  };
  const precoDe = (it, ti) => (it.pf == null ? null : it.pf + (ti != null ? it.ts[ti]?.[3] || 0 : it.ts.length ? Math.min(...it.ts.map((t) => t[3] || 0)) : 0));

  /** Aplica as respostas (menos as de `ignorar`). Devolve cabem, quase e todos (sem espaço). */
  function filtrar(s, ignorar = new Set()) {
    const cabem = [], quase = [];
    for (const it of itens) {
      if (it.t === 'acessorio') continue;
      if (!ignorar.has('tipo') && s.tipo && it.t !== s.tipo) continue;
      if (!ignorar.has('pessoas') && !pessoasOk(it, s.pessoas)) continue;
      if (!ignorar.has('onde') && s.onde && !ondeOk(it, s.onde)) continue;
      if (!ignorar.has('forma') && s.forma && it.fo !== s.forma) continue;
      if (!ignorar.has('conf') && s.conf && it.co !== s.conf) continue;
      if (!ignorar.has('mat') && s.mat && it.ma !== s.mat) continue;
      if (!ignorar.has('aq') && s.aq && !('aq' in it)) continue;
      let m = null;
      if (!ignorar.has('espaco') && s.l) {
        m = melhor(it, s.l, s.c, s.folga);
        if (!m) continue;
      }
      const preco = precoDe(it, m ? m.i : null);
      if (!ignorar.has('max') && s.max != null && !(preco != null && preco <= s.max)) continue;
      (m && !m.cabe ? quase : cabem).push({ it, m, preco });
    }
    return { cabem, quase };
  }

  // ---------- Opções que dependem do tipo ----------
  function opcaoHtml(nome, valor, rot, n, marcado) {
    return `<label class="esc-op"><input type="radio" name="${nome}" value="${esc(valor)}"${marcado ? ' checked' : ''}${n === 0 && valor ? ' disabled' : ''}><span>${esc(rot)}${n != null ? ` <span class="num">${n}</span>` : ''}</span></label>`;
  }
  function montarPessoas(s) {
    const box = $('[data-esc-pessoas]');
    const atual = s.pessoas;
    const base = filtrar({ ...s, pessoas: '' }, new Set(['espaco', 'max', 'forma', 'conf', 'mat', 'aq', 'onde'])).cabem.map((x) => x.it);
    let ops;
    if (s.tipo === 'spa') ops = Object.entries(cfg.cats?.spa || {}).map(([v, [r]]) => [v, `${r} lugares`]);
    else ops = [['1', 'Individual'], ['2', '2 pessoas'], ['3+', '3 ou mais']];
    ops = ops.map(([v, r]) => [v, r, base.filter((it) => pessoasOk(it, v)).length]).filter((o) => o[2] > 0 || o[0] === atual);
    const temAtual = ops.some((o) => o[0] === atual);
    box.innerHTML = ops.map(([v, r, n]) => opcaoHtml('pessoas', v, r, n, v === atual)).join('') + opcaoHtml('pessoas', '', 'Tanto faz', base.length, !temAtual);
  }
  function montarFormas(s) {
    const box = $('[data-esc-formas]');
    const base = filtrar({ ...s, forma: '' }, new Set(['espaco', 'max', 'conf', 'mat', 'aq'])).cabem.map((x) => x.it);
    const cont = new Map();
    for (const it of base) if (it.fo) cont.set(it.fo, (cont.get(it.fo) || 0) + 1);
    if (s.forma && !cont.has(s.forma)) cont.set(s.forma, 0);
    const ops = [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    box.innerHTML = ops.map(([v, n]) => opcaoHtml('forma', v, v, n, v === s.forma)).join('') + opcaoHtml('forma', '', 'Tanto faz', base.length, !s.forma || !cont.has(s.forma));
  }
  function ajustarOrcamento(s) {
    const r = form.elements.max;
    const doTipo = itens.filter((it) => it.t !== 'acessorio' && (!s.tipo || it.t === s.tipo) && it.pf != null);
    const ps = doTipo.map((it) => precoDe(it, null));
    const mn = Math.floor(Math.min(...ps)), mx = Math.ceil(Math.max(...ps));
    if (!ps.length) return;
    if (Number(r.min) !== mn || Number(r.max) !== mx) {
      const estava = Number(r.value), noTopo = estava >= Number(r.max) || !Number(r.max);
      r.min = mn; r.max = mx;
      r.value = noTopo ? mx : Math.min(Math.max(estava, mn), mx);
    }
    $('[data-esc-max]').textContent = Number(r.value) >= mx ? 'Tanto faz' : `Até ${brl(r.value)}`;
    $('[data-esc-max-faixa]').textContent = `Preços publicados ${s.tipo ? `de ${NOME[s.tipo]}s ` : ''}de ${brl(mn)} a ${brl(mx)}, com o tamanho de menor preço.`;
  }
  function notas(s) {
    const n = $('[data-esc-onde-nota]');
    let t = '';
    if (s.onde === 'externo' && s.tipo !== 'ofuro') {
      const quem = s.tipo === 'spa' ? 'spa' : s.tipo ? NOME[s.tipo] : 'modelo';
      t = `A Banheiras Bom Banho não informa no site o uso externo de cada ${quem}. Confirme com a equipe pelo WhatsApp.`;
      if (!s.tipo) t += ' Entre os ofurôs, o filtro usa a categoria "Ofurô Externo" publicada.';
    } else if (s.onde === 'banheiro' && s.tipo && s.tipo !== 'banheira') {
      t = `A categoria "Banheira Para Banheiro" só existe para banheiras; para ${NOME[s.tipo]}s este filtro não muda o resultado.`;
    }
    n.textContent = t;
    n.hidden = !t;
    const aq = $('[data-esc-aq-nota]');
    const com = filtrar({ ...s, aq: true }, new Set(['espaco', 'max'])).cabem.length;
    aq.textContent = `O aquecedor é opcional em ${com} dos modelos destas respostas; o preço publicado aparece em cada resultado.`;
  }

  // ---------- Resultado ----------
  function textoFolga(r) {
    if (!r) return '';
    if (r.cabe) return `Sobram ${fcm(r.sL)} cm na largura e ${fcm(r.sC)} cm no comprimento.`;
    return `Quase cabe: passa ${fcm(r.excesso)} cm ${r.dim === 'largura' ? 'da largura' : 'do comprimento'}.`;
  }
  function cartao(x, i) {
    const { it, m, preco } = x;
    const li = d.createElement('li');
    li.className = 'esc-c';
    li.style.setProperty('--i', Math.min(i, 12));
    li.dataset.sku = it.k;
    const t = m ? it.ts[m.i] : it.ts.length === 1 ? it.ts[0] : null;
    const eti = [it.fo, it.lu, it.ma, it.co].filter(Boolean).join(' · ');
    const href = `${cfg.base}${it.s}.html`;
    const precoTxt = t && t[3] ? `${brl(preco)} com este tamanho` : it.po || (preco != null ? brl(preco) : '');
    li.innerHTML = `${it.f ? `<img class="esc-c__img" src="${esc(it.f[0])}" width="${it.f[1]}" height="${it.f[2]}" alt="" loading="lazy" decoding="async">` : '<span class="esc-c__vazia">Foto sob consulta</span>'}
<span class="esc-c__eti">${esc(eti)}</span>
<h3 class="esc-c__nome"><a href="${esc(href)}">${esc(it.n)}</a></h3>
${t ? `<span class="esc-c__tam num">${m ? (m.cabe ? 'Tamanho que cabe' : 'Tamanho mais próximo') : 'Tamanho'}: ${esc(t[0])}${m && it.ts.length > 1 ? ` (${it.ts.length} tamanhos)` : ''}</span>` : `<span class="esc-c__tam num">${it.ts.length} tamanhos</span>`}
${m ? `<span class="esc-c__folga${m.cabe ? '' : ' is-quase'}">${textoFolga(m)}</span>` : ''}
<span class="esc-c__preco num">${esc(precoTxt)}</span>
<span class="esc-c__acoes">${t && t[4] ? '<span class="selo selo--confirmar" title="A ficha técnica e a opção de tamanho publicadas divergem; o cálculo usa a maior das duas medidas.">Medida a confirmar</span>' : ''}${it.d ? `<span class="selo selo--esgotado">${esc(it.d)}</span>` : ''}<button class="cart__cmp" type="button" data-comparar="${esc(it.s)}" data-nome="${esc(it.n)}" data-sku="${esc(it.k)}" aria-pressed="${BBB.comparar?.tem(it.s) ? 'true' : 'false'}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect width="7" height="16" x="3" y="4" rx="1.5"/><rect width="7" height="16" x="14" y="4" rx="1.5"/></svg><span>Comparar</span></button></span>
${t && t[4] ? '<span class="esc-nota">A ficha e a opção de tamanho divergem; o cálculo usa a maior das duas medidas.</span>' : ''}`;
    return li;
  }
  const ORD = {
    encaixe: (a, b) => (a.m && b.m ? (a.m.cabe ? a.m.total - b.m.total : a.m.excesso - b.m.excesso) : 0) || (a.preco ?? Infinity) - (b.preco ?? Infinity),
    'menor-preco': (a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity),
    'maior-preco': (a, b) => (b.preco ?? -Infinity) - (a.preco ?? -Infinity),
  };

  const ROT_FILTRO = {
    tipo: (s) => `${NOME[s.tipo] || ''}`.replace(/^./, (c) => c.toUpperCase()),
    espaco: (s) => `Espaço ${s.l} x ${s.c} cm${s.folga ? `, folga ${s.folga} cm` : ''}`,
    pessoas: (s) => (s.pessoas.startsWith('spa') ? `${cfg.cats.spa[s.pessoas][0]} lugares` : s.pessoas === '1' ? 'Individual' : s.pessoas === '3+' ? '3 ou mais pessoas' : `${s.pessoas} pessoas`),
    onde: (s) => (s.onde === 'banheiro' ? 'No banheiro' : 'Área externa'),
    forma: (s) => s.forma, conf: (s) => s.conf, mat: (s) => s.mat, aq: () => 'Com aquecedor', max: (s) => `Até ${brl(s.max)}`,
  };
  const ATIVO = { tipo: (s) => s.tipo, espaco: (s) => s.l, pessoas: (s) => s.pessoas, onde: (s) => s.onde && ((s.onde === 'banheiro' && (!s.tipo || s.tipo === 'banheira')) || (s.onde === 'externo' && (!s.tipo || s.tipo === 'ofuro'))), forma: (s) => s.forma, conf: (s) => s.conf, mat: (s) => s.mat, aq: (s) => s.aq, max: (s) => s.max != null };
  function soltar(k) {
    const zera = (n) => { const r = form.querySelector(`input[name="${n}"][value=""]`); if (r) r.checked = true; };
    if (k === 'espaco') { form.elements.l.value = ''; form.elements.c.value = ''; }
    else if (k === 'aq') form.elements.aq.checked = false;
    else if (k === 'max') form.elements.max.value = form.elements.max.max;
    else zera(k);
    atualizar(true);
  }

  function desenharEscala(lista, s) {
    const svg = $('[data-esc-escala-svg]');
    if (!svg || $('[data-esc-escala]').hidden) return;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, a, p) => { const e = d.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.append(e); return e; };
    const pecas = lista.map((x) => { const t = x.m ? x.it.ts[x.m.i] : x.it.ts.reduce((a, b) => ((b[2] || 0) > (a[2] || 0) ? b : a)); return { x, me: t[1], ma: t[2] }; }).filter((p) => p.me && p.ma);
    const W = Math.max(s.l ? Math.max(s.l, s.c) : 0, ...pecas.map((p) => p.ma), 50), H = Math.max(s.l ? Math.min(s.l, s.c) : 0, ...pecas.map((p) => p.me), 50);
    const m = Math.max(W, H) * 0.08;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${(W + 2 * m).toFixed(1)} ${(H + 2 * m).toFixed(1)}`);
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'esc-grade', width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M10 0H0V10', fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.16', 'stroke-width': '.35' }, pat);
    el('rect', { width: W + 2 * m, height: H + 2 * m, fill: 'url(#esc-grade)' }, svg);
    if (s.l) el('rect', { class: 'e', x: m, y: m, width: Math.max(s.l, s.c), height: Math.min(s.l, s.c) }, svg);
    for (const p of pecas) {
      const r = el('rect', { class: `p${p.x.m && !p.x.m.cabe ? ' is-quase' : ''}`, x: m, y: m, width: p.ma, height: p.me, rx: 2 }, svg);
      el('title', {}, r).textContent = `${p.x.it.n}: ${fcm(p.ma)} x ${fcm(p.me)} cm`;
    }
    const fs = Math.max(W, H) / 32;
    const tx = el('text', { x: m, y: m * 0.7, 'font-size': fs.toFixed(1) }, svg);
    tx.textContent = s.l ? `Seu espaço: ${s.l} x ${s.c} cm · ${pecas.length} contornos` : `${pecas.length} contornos, sem o espaço informado`;
    svg.setAttribute('aria-label', `${pecas.length} peças desenhadas em escala sobre grade de 10 cm${s.l ? `, sobre o espaço de ${s.l} x ${s.c} cm` : ''}.`);
  }

  function mensagem(s, lista) {
    const linhas = [
      `Olá! Estou escolhendo ${s.tipo ? ARTIGO[s.tipo] : 'um modelo'}.${s.l ? ` Meu espaço: ${s.l} x ${s.c} cm.` : ''}${s.pessoas ? ` Pessoas: ${ROT_FILTRO.pessoas(s)}.` : ''}${s.forma ? ` Formato: ${s.forma}.` : ''}`,
      ...lista.slice(0, 5).map((x) => `${x.it.n}: ${cfg.pagina.replace(/escolher\.html$/, '')}${x.it.s}.html`),
      `${cfg.pagina}${location.search}`,
    ];
    return linhas.filter(Boolean).join('\n');
  }

  function resultado(s) {
    const { cabem, quase } = filtrar(s);
    const ordem = $('[data-esc-ordem]')?.value || 'encaixe';
    cabem.sort(ORD[ordem]);
    quase.sort(ORD.encaixe);
    const n = cabem.length;
    $('[data-esc-res-n]').textContent = n;
    $('[data-esc-res-t]').textContent = s.l ? (n === 1 ? 'modelo cabe' : 'modelos cabem') : (n === 1 ? 'modelo' : 'modelos');
    $('[data-esc-lista]').replaceChildren(...cabem.map(cartao));
    const qBox = $('[data-esc-quase]');
    const qLista = n ? quase : quase.slice(0, 6);
    qBox.hidden = !qLista.length;
    $('[data-esc-quase-n]').textContent = qLista.length;
    $('[data-esc-quase-lista]').replaceChildren(...qLista.map(cartao));
    const vazio = $('[data-esc-vazio]');
    vazio.hidden = n > 0;
    if (!n) {
      const ativos = Object.keys(ATIVO).filter((k) => ATIVO[k](s));
      const ganhos = ativos.map((k) => ({ k, n: filtrar(s, new Set([k])).cabem.length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
      $('[data-esc-solta]').replaceChildren(...ganhos.map(({ k, n: g }) => {
        const li = d.createElement('li');
        const b = d.createElement('button');
        b.type = 'button';
        b.innerHTML = `Soltar: ${esc(ROT_FILTRO[k](s))} <span class="num">+${g}</span>`;
        b.addEventListener('click', () => soltar(k));
        li.append(b);
        return li;
      }));
      $('[data-esc-solta-t]').hidden = !ganhos.length;
    }
    const wa = $('[data-esc-wa]');
    if (wa && BBB.wa) BBB.wa.texto(wa, mensagem(s, cabem.length ? cabem : qLista));
    desenharEscala([...cabem, ...(n ? quase : qLista)], s);
    // Resumo das respostas (celular, passo final)
    const res = $('[data-esc-resumo]');
    const partes = Object.keys(ATIVO).filter((k) => ATIVO[k](s)).map((k) => ROT_FILTRO[k](s));
    res.hidden = passo !== 8;
    res.innerHTML = `<span>${partes.length ? partes.map((p) => `<b>${esc(p)}</b>`).join(' · ') : 'Sem filtros'}</span><button type="button" data-esc-ir="1">Mudar respostas</button>`;
    return n;
  }

  // ---------- Passos ----------
  function irPara(p, foco = true) {
    passo = Math.max(1, Math.min(8, p));
    raiz.dataset.passo = String(passo);
    $$('.esc-p').forEach((f) => f.classList.toggle('is-atual', Number(f.dataset.passo) === passo));
    $$('[data-esc-ir]', form).forEach((b) => {
      const k = Number(b.dataset.escIr);
      b.classList.toggle('is-feito', k < passo);
      if (k === passo) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.setAttribute('aria-label', `Pergunta ${k} de 7`);
    });
    $('[data-esc-voltar]').disabled = passo === 1;
    $('[data-esc-avancar-t]').textContent = passo >= 7 ? 'Ver resultado' : 'Avançar';
    atualizar(false);
    if (passo === 8 && !concluido) { concluido = true; BBB.evento?.('escolhedor_concluido', { tipo: estado().tipo || null }); }
    if (foco && w.matchMedia('(max-width:1023px)').matches) {
      const alvo = passo === 8 ? $('#esc-res-h') : $(`.esc-p[data-passo="${passo}"] input:not([disabled])`);
      raiz.scrollIntoView({ block: 'start', behavior: BBB.lite ? 'auto' : 'smooth' });
      alvo?.focus({ preventScroll: true });
    }
  }

  function gravarUrl(s) {
    const q = new URLSearchParams();
    for (const k of ['tipo', 'pessoas', 'onde', 'forma', 'conf', 'mat']) if (s[k]) q.set(k, s[k]);
    if (s.l) { q.set('l', s.l); q.set('c', s.c); }
    if (s.folga) q.set('folga', s.folga);
    if (s.ns) q.set('ns', '1');
    if (s.aq) q.set('aq', '1');
    if (s.max != null) q.set('max', s.max);
    if (passo > 1) q.set('passo', passo);
    const qs = q.toString();
    try { history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname); } catch { /* sem history */ }
  }
  function lerUrl() {
    const q = new URLSearchParams(location.search);
    const marca = (n, v) => { const el = form.querySelector(`input[name="${n}"][value="${CSS.escape(v)}"]`); if (el) el.checked = true; return Boolean(el); };
    if (q.get('tipo')) marca('tipo', q.get('tipo'));
    if (q.get('folga')) marca('folga', q.get('folga'));
    for (const k of ['onde', 'conf', 'mat']) if (q.get(k)) marca(k, q.get(k));
    const l = Number(q.get('l')), c = Number(q.get('c'));
    if (l > 0 && c > 0) { form.elements.l.value = l; form.elements.c.value = c; }
    if (q.get('ns') === '1') form.elements.ns.checked = true;
    if (q.get('aq') === '1') form.elements.aq.checked = true;
    return { pessoas: q.get('pessoas') || '', forma: q.get('forma') || '', max: Number(q.get('max')) || null, passo: Number(q.get('passo')) || 1 };
  }

  let pendente = null;
  function atualizar(gravar = true) {
    let s = estado();
    montarPessoas(s);
    if (pendente?.pessoas) { const el = form.querySelector(`input[name="pessoas"][value="${CSS.escape(pendente.pessoas)}"]`); if (el) el.checked = true; }
    s = estado();
    montarFormas(s);
    if (pendente?.forma) { const el = form.querySelector(`input[name="forma"][value="${CSS.escape(pendente.forma)}"]`); if (el) el.checked = true; }
    s = estado();
    ajustarOrcamento(s);
    if (pendente?.max) { const r = form.elements.max; r.value = String(Math.min(Math.max(pendente.max, Number(r.min)), Number(r.max))); ajustarOrcamento(estado()); }
    pendente = null;
    s = estado();
    notas(s);
    const n = resultado(s);
    $('[data-esc-n]').textContent = n;
    $('[data-esc-n-t]').textContent = s.l ? (n === 1 ? 'cabe' : 'cabem') : (n === 1 ? 'modelo' : 'modelos');
    form.elements.l.disabled = form.elements.c.disabled = s.ns;
    if (gravar) gravarUrl(s);
  }

  // ---------- Eventos ----------
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', (e) => { if (e.target.type !== 'radio') atualizar(); });
  form.addEventListener('change', () => atualizar());
  raiz.addEventListener('click', (e) => {
    const ir = e.target.closest('[data-esc-ir]');
    if (ir) { irPara(Number(ir.dataset.escIr)); gravarUrl(estado()); return; }
    if (e.target.closest('[data-esc-voltar]')) { irPara(passo - 1); gravarUrl(estado()); return; }
    if (e.target.closest('[data-esc-avancar]')) { irPara(passo >= 7 ? 8 : passo + 1); gravarUrl(estado()); return; }
    const ve = e.target.closest('[data-esc-ver-escala]');
    if (ve) {
      const box = $('[data-esc-escala]');
      box.hidden = !box.hidden;
      ve.setAttribute('aria-expanded', String(!box.hidden));
      atualizar(false);
    }
  });
  $('[data-esc-ordem]')?.addEventListener('change', () => atualizar(false));

  // ---------- Início ----------
  const carregando = $('[data-esc-carregando]');
  fetch(cfg.indice).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then((j) => {
    itens = j.itens || [];
    pendente = lerUrl();
    const p = pendente.passo;
    carregando.hidden = true;
    $('[data-esc-grade]').hidden = false;
    irPara(p, false);
    gravarUrl(estado());
  }).catch(() => {
    carregando.textContent = 'Não foi possível carregar o catálogo agora. Veja as coleções no menu ou fale com a equipe pelo WhatsApp.';
  });
})();
