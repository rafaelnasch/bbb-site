// WhatsApp, o checkout (SPEC 10). Os links wa.me já saem prontos no HTML (funcionam sem JS) com o
// número validado no build; aqui só se registra o clique e se reescreve o texto quando o estado muda.
// O número de um link nunca é trocado no navegador.
(() => {
  const d = document, BBB = window.BBB;
  const linhas = (arr) => arr.filter((l) => l != null && String(l).trim() !== '').join('\n');

  const wa = {
    linhas,
    /** Troca só o texto de um link wa.me existente (texto vazio = sem mensagem). */
    texto(a, texto) {
      const m = /^https:\/\/wa\.me\/(\d+)/.exec(a.getAttribute('href') || '');
      if (!m) return;
      a.setAttribute('href', `https://wa.me/${m[1]}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`);
    },
    /** Aplica a mensagem de venda (com o contexto da peça) a todos os links de venda e de consultores. */
    venda(texto) {
      d.querySelectorAll('a[data-wa-sync="venda"]').forEach((a) => wa.texto(a, texto));
    },
    /** Mesmo formato de build/lib/wa.mjs#mensagemCompra (SPEC 10.2). */
    compra({ abertura, nome, sku, tamanho, voltagem, cor, adicionais, dataColeta, somaFormatada, url }) {
      return [
        abertura,
        '',
        linhas([
          nome ? `Modelo: ${nome}${sku ? ` (SKU ${sku})` : ''}` : null,
          tamanho ? `Tamanho: ${tamanho}` : null,
          voltagem ? `Voltagem: ${voltagem}` : null,
          cor ? `Cor: ${cor}` : null,
          adicionais && adicionais.length ? `Adicionais: ${adicionais.join(', ')}` : null,
          somaFormatada && dataColeta ? `Valor pelos preços do site em ${dataColeta}: ${somaFormatada}` : null,
          url,
        ]),
      ].join('\n');
    },
  };
  BBB.wa = wa;

  // whatsapp_click {contexto, papel, sku} (SPEC 6.1)
  d.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="https://wa.me/"]');
    if (!a) return;
    BBB.evento('whatsapp_click', {
      contexto: a.dataset.waContexto || 'pagina',
      papel: a.dataset.waPapel || null,
      sku: a.dataset.sku || a.closest('[data-sku]')?.dataset.sku || null,
    });
  });
})();
