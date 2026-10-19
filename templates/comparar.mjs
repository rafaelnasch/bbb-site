// Comparador (SPEC 6.2 e 9): até 3 peças, contornos sobrepostos na mesma escala com o campo "meu
// espaço", tabela semântica com <th scope>, "Mostrar só as diferenças" e WhatsApp com os 3 modelos.
// As peças vêm da URL (?p=slug,slug,slug) ou da bandeja (localStorage "bbb:comparar"). A página não é
// indexável (noindex,follow). Dados: dados/indice.json (do escolhedor) e dados/fichas.json (daqui).
import { html, attrs, raw } from '../build/lib/html.mjs';
import { breadcrumb as breadcrumbLd } from '../build/lib/jsonld.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { breadcrumb } from './parts/breadcrumb.mjs';
import { AVISO_ESCALA } from './parts/escala.mjs';
import { fichasComparador } from '../build/lib/catalogo.mjs';

export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const fichas = fichasComparador(D);
  const waIni = D.wa('venda_principal', 'Quero ajuda para decidir entre modelos do site.');
  const config = {
    indice: url('dados/indice.json'),
    fichas: url('dados/fichas.json'),
    base: url(''),
    site: abs(''),
    pagina: abs('comparar.html'),
    dataColeta: D.dataColeta,
  };

  const topo = html`<section class="sala ferr-topo cmp-topo" aria-labelledby="cmp-h1">
  <div class="ferr-topo__fundo" aria-hidden="true"></div>
  <div class="wrap ferr-topo__in">
    ${breadcrumb([{ nome: 'Início', href: url('') }, { nome: 'Comparar modelos' }])}
    <p class="etiqueta etiqueta--linha" data-intro style="--i:0">Comparador</p>
    <h1 id="cmp-h1" class="ferr-topo__h1" data-intro="mascara" style="--i:1">Comparar modelos</h1>
    <p class="ferr-topo__lead" data-intro style="--i:2">Até três peças lado a lado, com as medidas na mesma escala e os dados publicados pela fábrica.</p>
  </div>
  <div class="wrap cmp-planta is-vazio" data-cmp-planta>
    <figure class="escala__fig cmp-fig">
      <svg class="escala__svg cmp-svg" data-cmp-svg role="img" aria-label="Contornos em escala"></svg>
      <figcaption class="cmp-leg" data-cmp-leg><span class="cmp-leg__vazio">Escolha até três modelos para ver os contornos na mesma escala.</span></figcaption>
    </figure>
    <form class="cmp-espaco" data-cmp-espaco>
      <p class="escala__cab">Meu espaço, em centímetros</p>
      <div class="escala__linha"><label class="campo"><span class="campo__rot">Largura</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" name="l" placeholder="ex.: 90" autocomplete="off"></label><span class="escala__x" aria-hidden="true">x</span><label class="campo"><span class="campo__rot">Comprimento</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" name="c" placeholder="ex.: 170" autocomplete="off"></label></div>
      <p class="escala__txt" data-cmp-txt aria-live="polite"></p>
      <p class="escala__aviso">Os contornos são as medidas externas publicadas, sobrepostas a partir do mesmo canto. A planta oficial de cada modelo está na tabela. ${AVISO_ESCALA}</p>
    </form>
  </div>
</section>`;

  const app = html`<div class="dia ferr-app cmp-app">
  <div class="wrap cmp" data-cmp>
    <script type="application/json" data-config>${raw(JSON.stringify(config).replace(/</g, '\\u003c'))}</script>
    <noscript><p class="cmp-vazio__t">O comparador precisa de JavaScript. Veja os modelos em <a class="link" href="${url('banheiras.html')}">Banheiras</a>, <a class="link" href="${url('spas.html')}">Spas</a> e <a class="link" href="${url('ofuros.html')}">Ofurôs</a>.</p></noscript>
    <div class="cmp-vazio" data-cmp-vazio data-so-js hidden>
      <p class="cmp-vazio__t">Nenhum modelo escolhido ainda.</p>
      <p>Toque em "Comparar" nos cartões das coleções, no escolhedor ou na página de cada peça. Ou procure pelo nome:</p>
    </div>
    <div class="cmp-add" data-cmp-add data-so-js hidden>
      <label class="campo"><span class="campo__rot">Incluir um modelo</span><input class="campo__in" type="search" data-cmp-busca placeholder="Nome ou nº de catálogo" autocomplete="off" aria-controls="cmp-sug" aria-autocomplete="list"></label>
      <ul class="cmp-sug" id="cmp-sug" role="listbox" data-cmp-sug hidden></ul>
    </div>
    <div class="cmp-corpo" data-cmp-corpo data-so-js hidden>
      <div class="cmp-acoes">
        <label class="esc-check"><input type="checkbox" data-cmp-dif><span>Mostrar só as diferenças</span></label>
        <a${attrs({ class: 'btn btn--whats', href: waIni, target: '_blank', rel: 'noopener', 'data-cmp-wa': '', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'comparador', 'data-campo': 'contato-numero' })}>${icone('whatsapp', { tamanho: 20 })}Pedir ajuda para decidir</a>
      </div>
      <div class="rolagem cmp-rol" tabindex="0" role="region" aria-labelledby="cmp-cap">
        <table class="cmp-tab" data-cmp-tab>
          <caption id="cmp-cap" class="vh">Comparação dos modelos escolhidos</caption>
          <thead data-cmp-thead></thead>
          <tbody data-cmp-tbody></tbody>
        </table>
      </div>
      <p class="cmp-nota">Preços e medidas publicados pela empresa, coletados em <span class="num" data-campo="data-coleta">${D.dataColeta}</span>. O valor final é confirmado pelo consultor.</p>
    </div>
    <p class="esc__carregando" data-cmp-carregando data-so-js hidden>Carregando...</p>
  </div>
</div>`;

  return [
    {
      saida: 'comparar.html',
      html: layout({
        saida: 'comparar.html',
        titulo: 'Comparar modelos | Banheiras Bom Banho',
        descricao: 'Compare até três banheiras, spas ou ofurôs lado a lado: medidas na mesma escala, ficha técnica, itens de série, planta oficial e preços publicados pela fábrica.',
        corpo: html`${topo}${app}`,
        robots: 'noindex,follow',
        jsonld: [{ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', '@id': `${abs('comparar.html')}#pagina`, name: 'Comparar modelos', url: abs('comparar.html'), inLanguage: 'pt-BR' }, breadcrumbLd([{ nome: 'Início', path: '' }, { nome: 'Comparar modelos', path: 'comparar.html' }])] }],
        modulos: ['comparar'],
        sobre: true,
        classe: 'pg-comparar',
        bandeja: false,
        critico: ['ferramenta', 'escolha'],
        // Primeira tela inteira no CSS crítico: fontes e site.css depois da primeira pintura (LCP é texto).
        fontes: [],
        cssAposPintura: true,
        fontesAposPintura: true,
        jsBaixa: true,
      }),
    },
    { saida: 'dados/fichas.json', html: JSON.stringify(fichas) },
  ];
}
