// Home (SPEC 9.1): escolhedor rápido com contagem ao vivo, filmes das portas e dos lançamentos, e o
// tour da planta no desktop (P2: GSAP + ScrollTrigger vendorizados, só >= 1024 px e sem modo lite).
//
// Escolhedor rápido: mesma regra de src/js/escolher.js (tipo, pessoas e encaixe com rotação, folga 0),
// sobre o mesmo índice (dados/indice.json, baixado só quando a seção chega perto da tela). A contagem
// é a de "cabem" do escolher.html para as mesmas respostas, e o link leva o estado na URL.
(() => {
  const d = document, w = window, BBB = w.BBB || {};
  const ocioso = (fn) => requestAnimationFrame(() => requestAnimationFrame(() => (w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 300))));
  const aposLoad = (fn) => (d.readyState === 'complete' ? ocioso(fn) : w.addEventListener('load', () => ocioso(fn), { once: true }));
  const visivel = (el, fn, margem = '200px 0px') => {
    if (!('IntersectionObserver' in w)) return fn();
    const o = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { o.disconnect(); fn(); } }, { rootMargin: margem });
    o.observe(el);
  };

  // ---------------------------------------------------------------- escolhedor rápido
  const raiz = d.querySelector('[data-home-esc]');
  const form = raiz?.querySelector('[data-home-esc-form]');
  if (raiz && form) {
    let cfg = {};
    try { cfg = JSON.parse(raiz.querySelector('script[data-config]')?.textContent || '{}'); } catch { /* sem config */ }
    const ir = raiz.querySelector('[data-home-esc-ir]');
    const nEl = raiz.querySelector('[data-home-esc-n]');
    const tEl = raiz.querySelector('[data-home-esc-t]');
    const uEl = raiz.querySelector('[data-home-esc-u]');
    const vivo = raiz.querySelector('[data-home-esc-vivo]');
    const boxP = raiz.querySelector('[data-home-pessoas]');
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    let itens = null, pedido = null, ultimo = null;

    // Mesmo encaixe do escolher.js: cabe se menor+folga <= menor lado e maior+folga <= maior lado.
    const cabe = (t, L, C) => {
      if (t[1] == null || t[2] == null) return false;
      const r1 = (n) => Math.round(n * 10) / 10;
      return r1(Math.min(L, C) - t[1]) >= 0 && r1(Math.max(L, C) - t[2]) >= 0;
    };
    const pessoasOk = (it, v) => {
      if (!v) return true;
      if (v.startsWith('spa')) { const ci = cfg.cats?.spa?.[v]?.[1]; return it.t === 'spa' && ci >= 0 && it.c.includes(ci); }
      if (it.ln == null) return false;
      return v === '3+' ? it.ln >= 3 : it.ln === Number(v);
    };
    const radio = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value || '';
    const num = (n) => { const v = Number(form.elements[n]?.value); return Number.isFinite(v) && v > 0 ? v : null; };
    const estado = () => {
      const l = num('l'), c = num('c');
      return { tipo: radio('tipo'), pessoas: radio('pessoas'), l: l && c ? l : null, c: l && c ? c : null };
    };

    // Opções de pessoas por tipo, como o escolher.html: só as que têm algum modelo; a atual fica.
    function montarPessoas(s) {
      if (!itens) return;
      const base = itens.filter((it) => it.t !== 'acessorio' && (!s.tipo || it.t === s.tipo));
      let ops = s.tipo === 'spa' ? Object.entries(cfg.cats?.spa || {}).map(([v, [r]]) => [v, `${r} lugares`]) : [['1', 'Individual'], ['2', '2 pessoas'], ['3+', '3 ou mais']];
      ops = ops.map(([v, r]) => [v, r, base.filter((it) => pessoasOk(it, v)).length]).filter((o) => o[2] > 0);
      const atual = ops.some((o) => o[0] === s.pessoas) ? s.pessoas : '';
      const chave = `${s.tipo}|${atual}`;
      if (boxP.dataset.chave === chave) return;
      boxP.dataset.chave = chave;
      const op = (v, r, marcado) => `<label class="esc-op"><input type="radio" name="pessoas" value="${esc(v)}"${marcado ? ' checked' : ''}><span>${esc(r)}</span></label>`;
      boxP.innerHTML = ops.map(([v, r]) => op(v, r, v === atual)).join('') + op('', 'Tanto faz', !atual);
    }
    function contar(s) {
      let n = 0;
      for (const it of itens) {
        if (it.t === 'acessorio') continue;
        if (s.tipo && it.t !== s.tipo) continue;
        if (!pessoasOk(it, s.pessoas)) continue;
        if (s.l && !it.ts.some((t) => cabe(t, s.l, s.c))) continue;
        n++;
      }
      return n;
    }
    function destino(s) {
      const q = new URLSearchParams();
      if (s.tipo) q.set('tipo', s.tipo);
      if (s.pessoas) q.set('pessoas', s.pessoas);
      if (s.l) { q.set('l', s.l); q.set('c', s.c); }
      if ([...q.keys()].length) q.set('passo', '8');
      const qs = q.toString();
      return `${cfg.escolher}${qs ? `?${qs}` : ''}`;
    }
    function atualizar() {
      if (!itens) { carregar(); return; }
      montarPessoas(estado());
      const s = estado();
      const n = contar(s);
      ir.href = destino(s);
      if (n !== ultimo) {
        nEl.textContent = n;
        if (ultimo != null) { ir.classList.remove('is-mudou'); void ir.offsetWidth; ir.classList.add('is-mudou'); }
        ultimo = n;
      }
      tEl.textContent = n ? (n === 1 ? 'Ver o' : 'Ver os') : 'Nenhum';
      uEl.textContent = s.l ? (n === 1 ? 'que cabe' : 'que cabem') : (n === 1 ? 'modelo' : 'modelos');
      ir.classList.toggle('is-zero', !n);
      const frase = s.l ? `${n} ${n === 1 ? 'modelo cabe' : 'modelos cabem'} em ${s.l} x ${s.c} cm.` : `${n} ${n === 1 ? 'modelo' : 'modelos'}.`;
      clearTimeout(atualizar.t);
      atualizar.t = setTimeout(() => { vivo.textContent = frase; }, 450);
    }
    function carregar() {
      if (pedido) return pedido;
      pedido = fetch(cfg.indice).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then((j) => {
        itens = j.itens || [];
        atualizar();
      }).catch(() => { pedido = null; });
      return pedido;
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); w.location.href = ir.href; });
    form.addEventListener('input', atualizar);
    form.addEventListener('change', atualizar);
    form.addEventListener('focusin', carregar, { once: true });
    visivel(raiz, () => aposLoad(carregar), '400px 0px');
    ir.addEventListener('click', () => BBB.evento?.('home_escolhedor_rapido', { ...estado(), n: ultimo }));
  }

  // ---------------------------------------------------------------- filmes
  const ligarFilme = (v, alvo) => {
    if (BBB.lite || v.dataset.ok) return;
    v.dataset.ok = '1';
    for (const [k, tp] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const s = d.createElement('source');
      s.src = v.dataset[k];
      s.type = tp;
      v.append(s);
    }
    v.addEventListener('playing', () => alvo.classList.add('is-tocando'), { once: true });
    v.load();
  };
  // Lançamentos: toca quando visível, pausa fora da tela.
  const lanc = d.querySelector('.home-lanc__filme video[data-home-filme]');
  if (lanc && !BBB.lite) {
    const moldura = lanc.closest('.home-lanc__filme');
    aposLoad(() => {
      if (!('IntersectionObserver' in w)) return;
      new IntersectionObserver((es) => es.forEach((e) => {
        if (BBB.lite) return;
        if (e.isIntersecting) { ligarFilme(lanc, moldura); lanc.play?.().catch(() => {}); } else lanc.pause?.();
      }), { threshold: 0.25 }).observe(lanc);
    });
  }

  // Vitrine da abertura (desktop): a porta sob o ponteiro ou com foco escolhe a coleção; sozinha, a
  // vitrine passa pelas coleções a cada CICLO ms. Filmes só depois do load, visíveis e fora do modo lite.
  const vit = d.querySelector('[data-vitrine]');
  const mqVit = w.matchMedia('(min-width:1024px)');
  if (vit) {
    const CICLO = 8000;
    const cenas = [...vit.querySelectorAll('[data-cena]')];
    const legs = [...vit.querySelectorAll('[data-cena-leg]')];
    const portasF = [...d.querySelectorAll('[data-porta]')];
    let ativa = cenas[0]?.dataset.cena, timer = 0, visivelV = true, emCima = false, vivo = false;
    vit.style.setProperty('--ciclo', `${CICLO}ms`);
    const tocar = () => {
      cenas.forEach((c) => {
        const v = c.querySelector('video[data-home-filme]');
        if (!v) return;
        if (vivo && c.dataset.cena === ativa && visivelV && !BBB.lite) { ligarFilme(v, c); v.play?.().catch(() => {}); } else v.pause?.();
      });
    };
    const ciclo = () => {
      clearTimeout(timer);
      vit.classList.remove('is-ciclo');
      if (!vivo || emCima || !visivelV || BBB.lite) return;
      void vit.offsetWidth;
      vit.classList.add('is-ciclo');
      timer = setTimeout(() => {
        const i = cenas.findIndex((c) => c.dataset.cena === ativa);
        mostrar(cenas[(i + 1) % cenas.length].dataset.cena);
        ciclo();
      }, CICLO);
    };
    function mostrar(id) {
      if (!id) return;
      ativa = id;
      cenas.forEach((c) => c.classList.toggle('is-ativa', c.dataset.cena === id));
      legs.forEach((l) => l.classList.toggle('is-ativa', l.dataset.cenaLeg === id));
      portasF.forEach((a) => a.classList.toggle('is-ativa', vivo && a.dataset.porta === id));
      tocar();
    }
    portasF.forEach((a) => {
      const entrar = () => { if (!mqVit.matches) return; emCima = true; mostrar(a.dataset.porta); ciclo(); };
      const sair = () => { emCima = false; ciclo(); };
      a.addEventListener('pointerenter', entrar);
      a.addEventListener('focus', entrar);
      a.addEventListener('pointerleave', sair);
      a.addEventListener('blur', sair);
    });
    const ligarVit = () => {
      if (vivo || BBB.lite || !mqVit.matches) return;
      vivo = true;
      if ('IntersectionObserver' in w) {
        new IntersectionObserver((es) => { visivelV = es.some((e) => e.isIntersecting); tocar(); ciclo(); }, { threshold: 0.2 }).observe(vit);
      }
      d.addEventListener('visibilitychange', () => { visivelV = !d.hidden; tocar(); ciclo(); });
      mostrar(ativa);
      ciclo();
    };
    aposLoad(ligarVit);
    mqVit.addEventListener?.('change', (e) => { if (e.matches) aposLoad(ligarVit); });
  }

  // ---------------------------------------------------------------- tour da planta (P2, desktop)
  const obra = d.querySelector('[data-obra]');
  const passos = obra?.querySelector('[data-obra-passos]');
  const mqDesk = w.matchMedia('(min-width:1024px)');
  if (obra && passos) {
    obra.querySelectorAll('.cota-marca').forEach((m, i) => m.style.setProperty('--k', i));
    let iniciado = false;
    const fig = obra.querySelector('[data-explorador]');
    const lista = [...passos.querySelectorAll('[data-obra-passo]')];
    let atual = null;
    const ativar = (letra) => {
      if (letra === atual) return;
      atual = letra;
      lista.forEach((li) => li.classList.toggle('is-ativo', li.dataset.obraPasso === letra));
      obra.querySelectorAll('.cota-marca').forEach((m) => m.classList.toggle('is-ativa', Boolean(letra) && m.dataset.cota === letra));
      obra.querySelectorAll('[data-cota-linha]').forEach((tr) => tr.classList.toggle('is-ativa', Boolean(letra) && tr.dataset.cotaLinha === letra));
      const p = fig?.planta;
      if (!p) return;
      const marca = letra && obra.querySelector(`.cota-marca[data-cota="${CSS.escape(letra)}"]`);
      if (marca) p.centrarEm((parseFloat(marca.style.left) / 100) * Number(fig.dataset.w), (parseFloat(marca.style.top) / 100) * Number(fig.dataset.h), caixa());
      else p.recentrar();
    };
    // Enquadramento do tour: a área do desenho onde estão as cotas, com folga de 6%. Assim a câmera
    // não mostra a margem azul da folha oficial (cabeçalho e rodapé da prancha).
    let caixaMemo = null;
    const caixa = () => {
      if (caixaMemo) return caixaMemo;
      const W = Number(fig?.dataset.w), H = Number(fig?.dataset.h);
      const ms = [...obra.querySelectorAll('.cota-marca')].map((m) => [parseFloat(m.style.left) / 100, parseFloat(m.style.top) / 100]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      if (!W || !H || !ms.length) return null;
      const F = 0.06;
      const x0 = Math.max(0, Math.min(...ms.map((m) => m[0])) - F), x1 = Math.min(1, Math.max(...ms.map((m) => m[0])) + F);
      const y0 = Math.max(0, Math.min(...ms.map((m) => m[1])) - F), y1 = Math.min(1, Math.max(...ms.map((m) => m[1])) + F);
      caixaMemo = { x0: x0 * W, x1: x1 * W, y0: y0 * H, y1: y1 * H };
      return caixaMemo;
    };
    const script = (src) => new Promise((ok, falha) => {
      if (!src) { falha(new Error('sem src')); return; }
      const s = d.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = falha;
      d.head.append(s);
    });
    const iniciar = () => {
      if (iniciado || BBB.lite || !mqDesk.matches) return;
      iniciado = true;
      script(obra.dataset.gsap).then(() => script(obra.dataset.scrolltrigger)).then(() => {
        const { gsap, ScrollTrigger } = w;
        if (!gsap || !ScrollTrigger) throw new Error('gsap');
        gsap.registerPlugin(ScrollTrigger);
        obra.classList.add('is-tour');
        const mm = gsap.matchMedia();
        mm.add('(min-width:1024px) and (prefers-reduced-motion:no-preference)', () => {
          lista.forEach((li) => ScrollTrigger.create({
            trigger: li,
            start: 'top 58%',
            end: 'bottom 58%',
            onToggle: (st) => { if (st.isActive) ativar(li.dataset.obraPasso); },
          }));
          gsap.to(passos, {
            '--prog': 1,
            ease: 'none',
            scrollTrigger: { trigger: passos, start: 'top 58%', end: 'bottom 58%', scrub: 0.4 },
          });
          gsap.from(fig, { scale: 0.94, opacity: 0.4, ease: 'none', scrollTrigger: { trigger: obra, start: 'top 85%', end: 'top 25%', scrub: 0.6 } });
          return () => { obra.classList.remove('is-tour'); ativar(null); };
        });
        // Seções com content-visibility mudam de altura quando são pintadas: recalcula as posições.
        let rt = 0;
        const refazer = () => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 120); };
        d.querySelectorAll('main > section[style*="content-visibility"]').forEach((s) => s.addEventListener('contentvisibilityautostatechange', refazer));
        // Mexer na planta com o ponteiro devolve o controle a quem está usando.
        fig?.addEventListener('pointerdown', () => obra.classList.add('is-manual'));
      }).catch(() => { iniciado = false; });
    };
    visivel(obra, () => aposLoad(iniciar), '600px 0px');
    mqDesk.addEventListener?.('change', (e) => { if (e.matches) visivel(obra, () => aposLoad(iniciar), '600px 0px'); });
  }
})();
