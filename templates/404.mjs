// Página 404 (SPEC 4 linha 13 e 14): fora do índice, com busca no catálogo, escolhedor, as coleções com
// a contagem real e o botão de ajuda pelo WhatsApp. O GitHub Pages serve este arquivo para qualquer
// endereço inexistente do site; por isso todos os links são absolutos (url() com BASE_PATH).
import { html } from '../build/lib/html.mjs';
import { url } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { RAIZ_TIPO } from '../build/lib/catalogo.mjs';
import { botaoWhats } from './parts/inst.mjs';

export function paginas(ctx) {
  const D = ctx.dados;
  const raizes = Object.values(RAIZ_TIPO).map((p) => D.catPorPath.get(p)).filter(Boolean);
  const corpo = html`<section class="sala ferr-topo inst-topo p404" aria-labelledby="p404-h1">
  <div class="ferr-topo__fundo" aria-hidden="true"></div>
  <div class="wrap ferr-topo__in p404__in">
    <p class="p404__num num" aria-hidden="true">404</p>
    <p class="etiqueta etiqueta--linha" data-intro style="--i:0">Página não encontrada</p>
    <h1 id="p404-h1" class="ferr-topo__h1" data-intro="mascara" style="--i:1">Este endereço não leva a nenhuma peça</h1>
    <p class="ferr-topo__lead" data-intro style="--i:2">O link pode ter mudado. Procure o modelo pelo nome, escolha pelo seu espaço ou fale com a equipe.</p>
    <div class="faq-busca p404__busca" data-busca-404="${url('busca.html')}" data-so-js hidden>
      <label class="vh" for="p404-q">Buscar no catálogo</label>
      <span class="faq-busca__ic" aria-hidden="true">${icone('busca', { tamanho: 20 })}</span>
      <input id="p404-q" class="faq-busca__in" type="search" placeholder="Nome do modelo, nº de catálogo ou medida" autocomplete="off" enterkeyhint="search">
      <button class="btn btn--claro" type="button">Buscar</button>
    </div>
    <p class="inst-topo__acoes" data-intro style="--i:3">
      <a class="btn btn--claro" href="${url('escolher.html')}">${icone('regua', { tamanho: 18 })}Escolher pelo meu espaço</a>
      <noscript><a class="btn btn--fantasma" href="${url('busca.html')}">${icone('busca', { tamanho: 18 })}Buscar no catálogo</a></noscript>
      ${botaoWhats(D, 'ajuda', { rotulo: 'Preciso de ajuda', contexto: '404' })}
    </p>
  </div>
</section>
<section class="dia inst p404__col" aria-labelledby="p404-col">
  <div class="wrap">
    <h2 id="p404-col" class="inst-h2">Coleções</h2>
    <ul class="col-viz__lista p404__lista" role="list">${raizes.map((c) => html`<li><a class="chip" href="${url(c.d_path)}">${c.nome} <span class="num" data-campo="categoria-total">${c.total_exibido}</span></a></li>`)}<li><a class="chip" href="${url('')}">Página inicial</a></li><li><a class="chip" href="${url('mapa-do-site.html')}">Mapa do site</a></li></ul>
  </div>
</section>`;
  return [{
    saida: '404.html',
    html: ctx.layout({
      saida: '404.html',
      titulo: 'Página não encontrada | Banheiras Bom Banho',
      descricao: 'Este endereço não existe no site da Banheiras Bom Banho. Busque o modelo pelo nome, escolha pelo seu espaço ou fale com a equipe pelo WhatsApp.',
      corpo,
      robots: 'noindex,follow',
      jsonld: [],
      modulos: ['institucional'],
      sobre: true,
      classe: 'pg-inst pg-404',
      critico: ['ferramenta', 'inst'],
    }),
  }];
}
