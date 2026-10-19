// Seletor de tamanho (SPEC 6.2, P0): rádios reais num <fieldset>. A troca cruza a planta (800 ms),
// avisa as outras ferramentas (evento bbb:tamanho com as medidas publicadas do tamanho) e mantém a
// planta escolhida como elemento fixo da View Transition entre versões irmãs.
(() => {
  const d = document, BBB = window.BBB;
  const form = d.querySelector('[data-monte]');
  if (!form) return;
  const paineis = [...d.querySelectorAll('[data-tam-painel]')];
  const vtFixo = paineis.find((p) => p.dataset.vtFixo)?.dataset.vtFixo || null;
  const num = (v) => (v == null || v === '' ? null : Number(v));

  const detalhe = (el) => ({
    i: num(el.dataset.i) ?? 0,
    rotulo: el.dataset.rotulo || '',
    a: num(el.dataset.a), b: num(el.dataset.b), c: num(el.dataset.c), altura: num(el.dataset.altura),
    menor: num(el.dataset.menor), maior: num(el.dataset.maior), confirmar: el.dataset.confirmar === '1',
  });

  function mostrar(i) {
    paineis.forEach((p) => {
      const on = Number(p.dataset.tamPainel) === i;
      if (on === !p.hidden) return;
      p.hidden = !on;
      if (vtFixo) {
        if (on) p.dataset.vtFixo = vtFixo;
        else delete p.dataset.vtFixo;
      }
      if (on && !BBB.lite) {
        p.classList.remove('is-entrando');
        void p.offsetWidth;
        p.classList.add('is-entrando');
      }
    });
  }

  form.addEventListener('change', (e) => {
    const r = e.target;
    if (r.name !== 'tamanho' || !r.checked) return;
    const det = detalhe(r);
    mostrar(det.i);
    d.dispatchEvent(new CustomEvent('bbb:tamanho', { detail: det }));
  });

  // Estado restaurado pelo navegador (voltar): alinha o painel ao rádio marcado.
  const marcado = form.querySelector('input[name="tamanho"]:checked');
  if (marcado && Number(marcado.dataset.i) !== 0) {
    mostrar(Number(marcado.dataset.i));
    d.dispatchEvent(new CustomEvent('bbb:tamanho', { detail: detalhe(marcado) }));
  }
})();
