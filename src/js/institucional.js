// Páginas institucionais (SPEC 9.6 e 14): busca dentro das perguntas frequentes, destaque do estado na
// tabela de prazos (sem geolocalização), abertura da pergunta pelo endereço (#faq-12) e a busca da 404.
// Sem JavaScript tudo continua legível: as perguntas, as tabelas e os links estão no HTML.
(() => {
  const d = document, w = window, BBB = w.BBB || {};
  const anunciar = (t) => (BBB.anunciar ? BBB.anunciar(t) : null);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ---------- Prazo por estado ----------
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
    anunciar(v ? `${v}: ${n} ${n === 1 ? 'linha' : 'linhas'} de prazo em destaque.` : 'Todos os estados.');
  });

  // ---------- Pergunta aberta pelo endereço ----------
  const abrir = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && d.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  };
  abrir();
  w.addEventListener('hashchange', abrir);

  // ---------- Busca nas perguntas ----------
  const q = d.querySelector('[data-faq-q]');
  if (q) {
    const itens = [...d.querySelectorAll('[data-faq-item]')];
    const textos = itens.map((it) => norm(it.textContent));
    const grupos = [...d.querySelectorAll('[data-faq-grupo]')];
    const n = d.querySelector('[data-faq-n]');
    const vazio = d.querySelector('[data-faq-vazio]');
    let t = 0;
    const filtrar = () => {
      const termos = norm(q.value).split(/[^a-z0-9,]+/).filter((x) => x.length > 1);
      let k = 0;
      itens.forEach((it, i) => {
        const ok = termos.every((x) => textos[i].includes(x));
        it.hidden = !ok;
        if (ok) k++;
        if (termos.length) it.open = ok && k <= 3;
      });
      grupos.forEach((g) => { g.hidden = !g.querySelector('[data-faq-item]:not([hidden])'); });
      if (n) {
        n.hidden = !termos.length;
        n.textContent = `${k} ${k === 1 ? 'pergunta encontrada' : 'perguntas encontradas'}`;
      }
      if (vazio) vazio.hidden = k > 0 || !termos.length;
      if (termos.length) anunciar(n?.textContent || '');
    };
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(filtrar, 140); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; filtrar(); } });
  }

  // ---------- Busca da página 404 ----------
  const f = d.querySelector('[data-busca-404]');
  if (f) {
    const campo = f.querySelector('input');
    const ir = () => {
      const v = campo.value.trim();
      const base = f.getAttribute('data-busca-404');
      w.location.href = v ? `${base}?q=${encodeURIComponent(v)}` : base;
    };
    f.querySelector('button')?.addEventListener('click', ir);
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ir(); } });
  }
})();
