// Perguntas frequentes (SPEC 4 linha 11, 9.6, 11.2 FAQPage e 14): só respostas literais de data/faq.json
// (resposta_exibida, o literal menos o filtro editorial), agrupadas por tema na ordem da SPEC, com busca
// na página, link "fonte" em cada item e a marca de pergunta redigida pelo site. Fora da página:
// garantia (oculto_ate_decisao, SPEC 15), itens com exibir=false e os listados em institucionais.json
// (decisoes), como a resposta que ensina a usar o carrinho do site antigo.
import { html, attrs } from '../build/lib/html.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { perguntaLegivel } from './parts/faq-bloco.mjs';
import { topo, inicio, pagina, jsonldPagina, botaoWhats, comLinks } from './parts/inst.mjs';
import { slugify } from '../build/lib/texto.mjs';

export const TEMAS = Object.freeze(['Escolher', 'Materiais', 'Itens e opcionais', 'Pagamento', 'Entrega', 'Instalação', 'Cuidados', 'Pós-venda']);
// Itens fora da página por decisão registrada em data/institucionais.json (decisoes).
export const FORA = Object.freeze(['faq-01']);
// Links de navegação ao lado da resposta (o texto da resposta não muda).
const VER_TAMBEM = Object.freeze({
  'faq-03': [['Escolher pelo meu espaço', 'escolher.html']],
  'faq-05': [['Como comprar', 'como-comprar.html']],
  'faq-06': [['Manual do usuário e instalação', 'manual-usuario-instalacao.html'], ['Instaladores', 'instaladores.html']],
  'faq-11': [['Manual do usuário e instalação', 'manual-usuario-instalacao.html'], ['Instaladores', 'instaladores.html']],
  'faq-21': [['Prazo de entrega por estado', 'prazo-de-entrega.html']],
  'faq-22': [['Prazo de entrega por estado', 'prazo-de-entrega.html']],
  'faq-26': [['Rastrear um pedido', 'rastreio.html']],
  'faq-28': [['Troca, devolução e reembolso', 'politica-devolucao-reembolso.html']],
  'faq-35': [['Vendas corporativas', 'vendas-corporativas.html']],
  'faq-36': [['Instaladores', 'instaladores.html']],
  'faq-37': [['Instaladores', 'instaladores.html']],
  'faq-39': [['Que banheira cabe no meu espaço?', 'guia/banheira-por-tamanho.html']],
  'faq-40': [['Escolher pelo meu espaço', 'escolher.html']],
  'faq-02': [['Gel coat ou acrílico?', 'guia/gel-coat-ou-acrilico.html']],
});

/** Itens que aparecem na página, na ordem da fonte. */
export function faqsVisiveis(D) {
  return (D.ler('faq.json') || []).filter((f) => f.exibir !== false && !f.oculto_ate_decisao && (f.resposta_exibida || '').trim() && !FORA.includes(f.id));
}

/** "https://...pdf (p.11)" -> { href, rotulo } */
function fonteDe(f) {
  const m = /^(https?:\/\/\S+)(?:\s+\((.+)\))?$/.exec(String(f.fonte || '').trim());
  return m ? { href: m[1], extra: m[2] || null } : null;
}

/** A resposta literal em parágrafos: as listas "- ITEM" e "1. ..." da fonte viram linhas. */
function resposta(f) {
  const partes = String(f.resposta_exibida).split(/\s+(?=-\s+[A-ZÁ-Ú]{3,}|\d\.\s+[A-Z])/).map((s) => s.trim()).filter(Boolean);
  return partes.map((p) => html`<p data-campo="faq-resposta">${comLinks(p)}</p>`);
}

export function paginas(ctx) {
  const D = ctx.dados;
  const itens = faqsVisiveis(D);
  const trilha = [inicio, { nome: 'Perguntas frequentes', path: 'perguntas-frequentes.html' }];
  const grupos = TEMAS.map((t) => ({ t, id: `tema-${slugify(t)}`, fs: itens.filter((f) => f.tema === t) })).filter((g) => g.fs.length);
  const semTema = itens.filter((f) => !TEMAS.includes(f.tema));
  if (semTema.length) throw new Error(`FAQ com tema fora da lista: ${semTema.map((f) => f.id).join(', ')}`);

  const item = (f) => {
    const fo = fonteDe(f);
    const ver = VER_TAMBEM[f.id] || [];
    return html`<details class="faq-item" id="${f.id}" data-faq-item>
  <summary class="faq-item__q">${perguntaLegivel(f.pergunta)}</summary>
  <div class="faq-item__r">${resposta(f)}
    <p class="faq-item__fonte">${f.tipo === 'redigida_resposta_literal' ? html`<span class="faq-item__marca">Pergunta redigida pelo site; resposta com o texto da empresa.</span> ` : ''}${fo ? html`<a${attrs({ class: 'link link--texto', href: fo.href, target: '_blank', rel: 'noopener' })}>fonte${fo.extra ? ` (${fo.extra})` : ''}</a>` : ''}${ver.map(([n, p]) => html` · <a class="link" href="${url(p)}">${n}</a>`)}</p>
  </div>
</details>`;
  };

  const corpo = html`${topo({
    trilha, etiqueta: 'Dúvidas', h1: 'Perguntas frequentes',
    lead: html`<span class="num">${itens.length}</span> respostas com o texto publicado pela empresa, em <span class="num">${grupos.length}</span> temas.`,
    extra: html`<div class="faq-busca" data-so-js><label class="vh" for="faq-q">Buscar nas perguntas</label><span class="faq-busca__ic" aria-hidden="true">${icone('busca', { tamanho: 20 })}</span><input id="faq-q" class="faq-busca__in" type="search" data-faq-q placeholder="Buscar nas perguntas: frete, cores, aquecedor..." autocomplete="off" enterkeyhint="search"></div>`,
  })}
<article class="dia inst faq">
  <div class="wrap inst__grade">
    <aside class="inst__lado">
      <nav class="inst-sumario" aria-labelledby="faq-temas-h"><h2 class="etiqueta etiqueta--linha" id="faq-temas-h">Temas</h2>
        <ol role="list">${grupos.map((g, i) => html`<li><a href="#${g.id}"><span class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span>${g.t}</span><span class="num faq-conta">${g.fs.length}</span></a></li>`)}</ol></nav>
      <div class="inst-ajuda"><p class="inst-ajuda__t">Não achou a resposta?</p>${botaoWhats(D, 'ajuda', { rotulo: 'Preciso de ajuda', contexto: 'faq', classe: 'btn btn--whats btn--bloco' })}<p class="inst-ajuda__s">Garantia: consulte as condições do seu modelo com o consultor.</p></div>
    </aside>
    <div class="inst__corpo">
      <p class="faq-n" data-faq-n aria-live="polite" hidden></p>
      ${grupos.map((g) => html`<section class="faq-grupo" id="${g.id}" aria-labelledby="${g.id}-h" data-faq-grupo>
        <h2 class="inst-h2" id="${g.id}-h">${g.t}</h2>
        <div class="faq-bloco">${g.fs.map(item)}</div>
      </section>`)}
      <div class="faq-vazio" data-faq-vazio hidden><p>Nenhuma pergunta com esses termos.</p><p class="inst-acoes"><a class="btn" href="${url('busca.html')}">${icone('busca', { tamanho: 18 })}Buscar no catálogo</a>${botaoWhats(D, 'ajuda', { rotulo: 'Preciso de ajuda', contexto: 'faq_vazio', classe: 'btn btn--whats' })}</p></div>
      <p class="inst-fonte">${icone('ponto', { tamanho: 14 })}<span>Respostas publicadas pela Banheiras Bom Banho no site atual e no manual, coletadas em <span class="num" data-campo="data-coleta">${D.dataColeta}</span>. Cada item leva à página de origem.</span></p>
    </div>
  </div>
</article>`;

  const descricao = 'Perguntas frequentes sobre banheiras, spas e ofurôs da Banheiras Bom Banho: gel coat ou acrílico, cores, opcionais, pagamento, prazo de entrega e instalação.';
  // FAQPage só com itens tipo=publicada visíveis na página (SPEC 11.2), sem garantia.
  const pub = itens.filter((f) => f.tipo === 'publicada');
  const faqPage = {
    '@type': 'FAQPage',
    '@id': `${abs('perguntas-frequentes.html')}#faq`,
    mainEntity: pub.map((f) => ({ '@type': 'Question', name: perguntaLegivel(f.pergunta), acceptedAnswer: { '@type': 'Answer', text: f.resposta_exibida.trim() } })),
  };
  return [pagina(ctx, {
    saida: 'perguntas-frequentes.html',
    titulo: 'Perguntas frequentes | Banheiras Bom Banho',
    descricao,
    corpo,
    trilha,
    modulos: ['institucional'],
    jsonld: [jsonldPagina(D, { saida: 'perguntas-frequentes.html', nome: 'Perguntas frequentes', descricao, trilha, extra: [faqPage] })],
  })];
}
