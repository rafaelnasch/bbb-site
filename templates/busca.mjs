// Busca (SPEC 6.2 e 14): índice local dados/indice.json carregado só quando a página abre; normaliza
// acento, tolera 1 erro por termo (distância de Levenshtein), sugere coleções por faceta ("spa 6
// lugares"). Sem resultado: escolhedor e WhatsApp de ajuda. Página não indexável (noindex,follow).
import { html, attrs, raw } from '../build/lib/html.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { breadcrumb } from './parts/breadcrumb.mjs';
import { RAIZ_TIPO } from '../build/lib/catalogo.mjs';

export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const raizes = Object.values(RAIZ_TIPO).map((p) => D.catPorPath.get(p)).filter(Boolean);
  const config = { indice: url('dados/indice.json'), base: url(''), escolher: url('escolher.html') };

  const topo = html`<section class="sala ferr-topo bus-topo" aria-labelledby="bus-h1">
  <div class="ferr-topo__fundo" aria-hidden="true"></div>
  <div class="wrap ferr-topo__in">
    ${breadcrumb([{ nome: 'Início', href: url('') }, { nome: 'Buscar' }])}
    <h1 id="bus-h1" class="ferr-topo__h1" data-intro="mascara" style="--i:0">Buscar no catálogo</h1>
    <div class="bus-campo" data-so-js hidden>
      <label class="vh" for="bus-q">Nome, nº de catálogo, forma, lugares ou medida</label>
      <span class="bus-campo__ic" aria-hidden="true">${icone('busca', { tamanho: 22 })}</span>
      <input class="bus-campo__in" id="bus-q" type="search" data-bus-q placeholder="Ex.: acqua línea, spa 6 lugares, 1,70" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-describedby="bus-ajuda">
    </div>
    <p class="ferr-topo__lead" id="bus-ajuda">Procure pelo nome do modelo, pelo nº de catálogo, pela forma, pelo número de lugares ou por uma medida publicada. Erros de digitação e acentos são tolerados.</p>
  </div>
</section>`;

  const app = html`<div class="dia ferr-app bus-app">
  <div class="wrap bus" data-bus>
    <script type="application/json" data-config>${raw(JSON.stringify(config).replace(/</g, '\\u003c'))}</script>
    <noscript><p>A busca precisa de JavaScript. Veja as coleções: ${raizes.map((c, i) => html`${i ? ', ' : ''}<a class="link" href="${url(c.d_path)}">${c.nome}</a>`)}.</p></noscript>
    <div class="bus-facetas" data-bus-facetas hidden aria-live="polite"></div>
    <p class="bus-n" data-bus-n aria-live="polite" data-so-js hidden></p>
    <ol class="esc__lista bus-lista" role="list" data-bus-lista></ol>
    <p data-bus-mais-box hidden><button class="btn btn--fantasma" type="button" data-bus-mais>Mostrar mais</button></p>
    <div class="bus-vazio" data-bus-vazio hidden>
      <p class="bus-vazio__t">Nada encontrado com esses termos.</p>
      <p>Tente outra palavra, escolha pelo seu espaço ou fale com a equipe.</p>
      <p class="bus-vazio__acoes"><a class="btn" href="${url('escolher.html')}">${icone('regua', { tamanho: 18 })}Escolher pelo meu espaço</a>
      <a${attrs({ class: 'btn btn--whats', href: D.wa('ajuda'), target: '_blank', rel: 'noopener', 'data-wa-papel': 'ajuda', 'data-wa-contexto': 'busca_vazia', 'data-campo': 'contato-numero' })}>${icone('whatsapp', { tamanho: 20 })}Preciso de ajuda</a></p>
    </div>
    <nav class="bus-inicio" data-bus-inicio aria-labelledby="bus-inicio-h">
      <h2 id="bus-inicio-h" class="etiqueta etiqueta--linha">Coleções</h2>
      <ul class="col-viz__lista" role="list">${raizes.map((c) => html`<li><a class="chip" href="${url(c.d_path)}">${c.nome} <span class="num" data-campo="categoria-total">${c.total_exibido}</span></a></li>`)}<li><a class="chip" href="${url('escolher.html')}">${icone('regua', { tamanho: 16 })}Escolher pelo meu espaço</a></li></ul>
    </nav>
  </div>
</div>`;

  return [{
    saida: 'busca.html',
    html: layout({
      saida: 'busca.html',
      titulo: 'Buscar no catálogo | Banheiras Bom Banho',
      descricao: 'Busque banheiras, spas, ofurôs, saunas e acessórios pelo nome, nº de catálogo, forma, lugares ou medida. Tolera acentos e erros de digitação.',
      corpo: html`${topo}${app}`,
      robots: 'noindex,follow',
      jsonld: [{ '@context': 'https://schema.org', '@type': 'SearchResultsPage', name: 'Buscar no catálogo', url: abs('busca.html') }],
      modulos: ['busca'],
      sobre: true,
      classe: 'pg-busca',
      critico: ['ferramenta'],
    }),
  }];
}
