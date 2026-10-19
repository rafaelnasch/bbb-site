// Escolhedor (SPEC 9.4 e 6.2): "Escolher pelo meu espaço". Uma pergunta por tela no celular, painel
// lateral no desktop, "Tanto faz" em todas, contagem ao vivo, estado na URL. Regra de encaixe com
// rotação, grupo "quase cabe" (até 10 cm em uma dimensão) e selo "medida a confirmar" (cálculo pela
// maior das duas medidas publicadas). O resultado manda a escolha ao consultor pelo WhatsApp.
//
// O índice do catálogo (dados/indice.json) sai daqui e é usado também pela busca e pelo comparador.
// Parâmetros de URL (contrato com o módulo rápido da home): tipo, l, c (cm), folga (0, 5, 10), ns
// (ainda não sei o espaço), pessoas (1, 2, 3+, spa34, spa56, spa67, spa78), onde (banheiro, externo),
// forma, conf, mat, aq (1), max (R$), passo (1 a 8).
import { html, attrs, raw } from '../build/lib/html.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { breadcrumb } from './parts/breadcrumb.mjs';
import { AVISO_ESCALA } from './parts/escala.mjs';
import { perguntaLegivel } from './parts/faq-bloco.mjs';
import { fmtMetros } from '../build/lib/medidas.mjs';
import { FOLGAS, QUASE_CM } from '../build/lib/encaixe.mjs';
import {
  indiceCatalogo, CAT_BANHEIRO, CAT_OFURO_EXTERNO, CAT_SPA_LUGARES, faixaMedidas,
} from '../build/lib/catalogo.mjs';

const TIPOS_ESC = [['banheira', 'Banheira'], ['spa', 'Spa'], ['ofuro', 'Ofurô'], ['sauna', 'Sauna']];
const PASSOS = ['O que procura', 'Espaço', 'Pessoas', 'Onde instalar', 'Formato', 'Versão', 'Orçamento'];

function opcao(nome, valor, rotulo, { n = null, marcado = false } = {}) {
  return html`<label class="esc-op"><input type="radio" name="${nome}" value="${valor}"${attrs({ checked: marcado })}><span>${rotulo}${n != null ? html` <span class="num" data-esc-cont>${n}</span>` : ''}</span></label>`;
}

export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const produtos = D.ler('produtos.json');
  const indice = indiceCatalogo(D);
  const cats = indice.cats.map((c) => c[0]);
  const faq = new Map((D.ler('faq.json') || []).map((f) => [f.id, f]));
  const blog = (D.ler('blog-recentes.json')?.recentes || []).filter((b) => b.exibir).slice(0, 3);
  const porTipo = (t) => produtos.filter((p) => p.d_tipo === t);
  const cont = Object.fromEntries(TIPOS_ESC.map(([t]) => [t, porTipo(t).length]));
  const totalEsc = Object.values(cont).reduce((a, b) => a + b, 0);
  const faixaBanheiras = D.categorias.filter((c) => c.filtro_implicito?.tipo === 'banheira' && c.filtro_implicito?.faixa_m);
  const medBan = faixaMedidas(porTipo('banheira'));
  const waIni = D.wa('venda_principal', 'Olá! Estou escolhendo um modelo pelo site.');

  const config = {
    indice: url('dados/indice.json'),
    base: url(''),
    cats: {
      banheiro: cats.indexOf(CAT_BANHEIRO),
      externo: cats.indexOf(CAT_OFURO_EXTERNO),
      spa: Object.fromEntries(CAT_SPA_LUGARES.map(([r, p]) => [`spa${r.replace(/\D/g, '')}`, [r, cats.indexOf(p)]])),
    },
    folgas: FOLGAS,
    quase: QUASE_CM,
    pagina: abs('escolher.html'),
    dataColeta: D.dataColeta,
  };

  const form = html`<form class="esc__form" data-esc-form novalidate>
  <ol class="esc__prog" role="list" aria-label="Perguntas">${PASSOS.map((t, i) => html`<li><button type="button" class="esc__prog-b" data-esc-ir="${i + 1}"><span class="num">${String(i + 1).padStart(2, '0')}</span><span>${t}</span></button></li>`)}</ol>
  <fieldset class="esc-p" data-passo="1">
    <legend class="esc-p__q"><span class="esc-p__n num">01</span>O que você procura?</legend>
    <div class="esc-ops">${TIPOS_ESC.map(([v, r]) => opcao('tipo', v, r, { n: cont[v] }))}${opcao('tipo', '', 'Tanto faz', { n: totalEsc, marcado: true })}</div>
  </fieldset>
  <fieldset class="esc-p" data-passo="2">
    <legend class="esc-p__q"><span class="esc-p__n num">02</span>Qual é o espaço disponível?</legend>
    <p class="esc-p__ajuda">Medidas internas do local, em centímetros. A peça pode girar.</p>
    <div class="escala__linha"><label class="campo"><span class="campo__rot">Largura</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" step="1" name="l" placeholder="ex.: 90" autocomplete="off"></label><span class="escala__x" aria-hidden="true">x</span><label class="campo"><span class="campo__rot">Comprimento</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" step="1" name="c" placeholder="ex.: 170" autocomplete="off"></label></div>
    <p class="esc-p__sub" id="esc-folga-l">Folga mínima</p>
    <div class="esc-ops" role="radiogroup" aria-labelledby="esc-folga-l">${FOLGAS.map((f) => opcao('folga', String(f), `${f} cm`, { marcado: f === 0 }))}</div>
    <label class="esc-check"><input type="checkbox" name="ns" value="1"><span>Ainda não sei o espaço</span></label>
  </fieldset>
  <fieldset class="esc-p" data-passo="3">
    <legend class="esc-p__q"><span class="esc-p__n num">03</span>Quantas pessoas?</legend>
    <div class="esc-ops" data-esc-pessoas>${opcao('pessoas', '', 'Tanto faz', { marcado: true })}</div>
  </fieldset>
  <fieldset class="esc-p" data-passo="4">
    <legend class="esc-p__q"><span class="esc-p__n num">04</span>Onde vai instalar?</legend>
    <div class="esc-ops">${opcao('onde', 'banheiro', 'No banheiro')}${opcao('onde', 'externo', 'Área externa')}${opcao('onde', '', 'Não sei', { marcado: true })}</div>
    <p class="esc-nota" data-esc-onde-nota hidden></p>
  </fieldset>
  <fieldset class="esc-p" data-passo="5">
    <legend class="esc-p__q"><span class="esc-p__n num">05</span>Formato</legend>
    <div class="esc-ops" data-esc-formas>${opcao('forma', '', 'Tanto faz', { marcado: true })}</div>
  </fieldset>
  <fieldset class="esc-p" data-passo="6">
    <legend class="esc-p__q"><span class="esc-p__n num">06</span>Básica ou Completa, gel coat ou acrílico?</legend>
    <p class="esc-p__sub" id="esc-conf-l">Configuração</p>
    <div class="esc-ops" role="radiogroup" aria-labelledby="esc-conf-l">${opcao('conf', 'Básica', 'Básica')}${opcao('conf', 'Completa', 'Completa')}${opcao('conf', '', 'Tanto faz', { marcado: true })}</div>
    <p class="esc-p__sub" id="esc-mat-l">Material</p>
    <div class="esc-ops" role="radiogroup" aria-labelledby="esc-mat-l">${opcao('mat', 'Gel Coat', 'Gel Coat')}${opcao('mat', 'Acrílico', 'Acrílico')}${opcao('mat', '', 'Tanto faz', { marcado: true })}</div>
    <label class="esc-check"><input type="checkbox" name="aq" value="1"><span>Só modelos com aquecedor opcional</span></label>
    <p class="esc-nota" data-esc-aq-nota></p>
    <p class="esc-p__links"><a class="link" href="${url('guia/basica-ou-completa.html')}">Básica ou Completa?</a> <a class="link" href="${url('guia/gel-coat-ou-acrilico.html')}">Gel coat ou acrílico?</a></p>
  </fieldset>
  <fieldset class="esc-p" data-passo="7">
    <legend class="esc-p__q"><span class="esc-p__n num">07</span>Orçamento</legend>
    <input class="col-faixa" type="range" name="max" min="0" max="0" step="1" value="0" aria-label="Orçamento máximo" aria-describedby="esc-max-v">
    <p class="col-faixa__v num"><output id="esc-max-v" data-esc-max>Tanto faz</output><span data-esc-max-faixa></span></p>
  </fieldset>
  <div class="esc__nav">
    <button class="btn btn--fantasma esc__voltar" type="button" data-esc-voltar>Voltar</button>
    <button class="btn esc__avancar" type="button" data-esc-avancar><span data-esc-avancar-t>Avançar</span> <span class="esc__n" aria-live="polite"><span class="num" data-esc-n>${totalEsc}</span> <span data-esc-n-t>modelos</span></span></button>
  </div>
</form>`;

  const resultado = html`<section class="esc__res" data-esc-res aria-labelledby="esc-res-h">
  <div class="esc__resumo" data-esc-resumo hidden></div>
  <div class="esc__res-cab">
    <h2 id="esc-res-h" class="esc__res-h" tabindex="-1"><span class="num" data-esc-res-n>0</span> <span data-esc-res-t>modelos</span></h2>
    <div class="esc__res-acoes">
      <label class="col-ordem"><span class="vh">Ordenar por</span><select data-esc-ordem><option value="encaixe">Ordem do catálogo</option><option value="menor-preco">Menor preço</option><option value="maior-preco">Maior preço</option></select></label>
      <button class="col-btn" type="button" data-esc-ver-escala aria-expanded="false" aria-controls="esc-escala">${icone('regua', { tamanho: 18 })}Ver em escala</button>
    </div>
  </div>
  <div class="esc__escala sala" id="esc-escala" data-esc-escala hidden>
    <figure class="escala__fig"><svg class="escala__svg esc__escala-svg" data-esc-escala-svg role="img" aria-label="Contornos em escala"></svg>
    <figcaption class="escala__leg"><span class="escala__chave escala__chave--peca">Peças</span><span class="escala__chave escala__chave--espaco">Seu espaço</span><span>Grade de 10 cm</span></figcaption></figure>
  </div>
  <ol class="esc__lista" role="list" data-esc-lista></ol>
  <section class="esc__quase" data-esc-quase hidden aria-labelledby="esc-quase-h">
    <h3 id="esc-quase-h">Quase cabe <span class="num" data-esc-quase-n></span></h3>
    <p class="esc-nota">Passam do espaço em até ${QUASE_CM} cm numa só dimensão. Vale conferir a planta oficial e falar com a equipe.</p>
    <ol class="esc__lista esc__lista--quase" role="list" data-esc-quase-lista></ol>
  </section>
  <div class="esc__vazio" data-esc-vazio hidden>
    <p class="esc__vazio-t">Nenhum modelo atende a todas as respostas.</p>
    <p class="esc-nota" data-esc-solta-t>Estes filtros foram os que mais restringiram. Toque para soltar:</p>
    <ul class="esc__solta" role="list" data-esc-solta></ul>
  </div>
  <div class="esc__fim">
    <a${attrs({ class: 'btn btn--whats', href: waIni, target: '_blank', rel: 'noopener', 'data-esc-wa': '', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'escolhedor', 'data-campo': 'contato-numero' })}>${icone('whatsapp', { tamanho: 20 })}Enviar minha escolha ao consultor</a>
    <p class="escala__aviso">${AVISO_ESCALA}</p>
  </div>
</section>`;

  const t40 = faq.get('faq-40'), t39 = faq.get('faq-39'), t03 = faq.get('faq-03');
  const explica = html`<section class="dia secao esc-texto" aria-labelledby="esc-texto-h">
  <div class="wrap esc-texto__in">
    <div class="prosa">
      <p class="etiqueta etiqueta--linha">Guia rápido</p>
      <h2 id="esc-texto-h">Como escolher o tamanho da banheira</h2>
      <p>O catálogo publicado tem ${cont.banheira} banheiras, ${cont.spa} spas, ${cont.ofuro} ofurôs e ${cont.sauna} saunas${medBan ? html`. As banheiras vão de ${fmtMetros(medBan.min)} m a ${fmtMetros(medBan.max)} m no lado maior` : ''}. Cada tamanho vendido aparece com as medidas externas (largura x comprimento x profundidade, em metros), e a maioria dos modelos tem planta técnica oficial em PDF.</p>
      <p>Para saber se uma peça cabe, compare as medidas externas com o espaço livre do local. O escolhedor faz essa conta para todos os modelos de uma vez, girando a peça quando precisa, e separa os que passam do espaço por poucos centímetros. A conta não substitui a planta oficial nem a conversa com a equipe sobre a instalação.</p>
      ${faixaBanheiras.length ? html`<h3>Banheiras por faixa de tamanho</h3>
      <ul>${faixaBanheiras.map((c) => html`<li><a class="link" href="${url(c.d_path)}">${c.nome}</a>: <span class="num" data-campo="categoria-total">${c.total_exibido}</span> modelos</li>`)}</ul>` : ''}
      ${[t40, t39, t03].filter((f) => f && f.exibir !== false && !f.oculto_ate_decisao && f.resposta_exibida).map((f) => html`<h3>${perguntaLegivel(f.pergunta)}</h3><p data-campo="faq-resposta">${f.resposta_exibida}</p><p class="pequeno">Resposta da Banheiras Bom Banho.</p>`)}
      <h3>Guias</h3>
      <ul>
        <li><a class="link" href="${url('guia/banheira-por-tamanho.html')}">Que banheira cabe no meu espaço?</a></li>
        <li><a class="link" href="${url('guia/spa-por-lugares.html')}">Spa para quantas pessoas?</a></li>
        <li><a class="link" href="${url('guia/gel-coat-ou-acrilico.html')}">Gel coat ou acrílico?</a></li>
        <li><a class="link" href="${url('guia/basica-ou-completa.html')}">Básica ou Completa?</a></li>
      </ul>
      ${blog.length ? html`<h3>Do blog</h3><ul>${blog.map((b) => html`<li><a${attrs({ class: 'link', href: b.url, target: '_blank', rel: 'noopener' })}>${b.titulo}</a></li>`)}</ul>` : ''}
    </div>
  </div>
</section>`;

  const topo = html`<section class="sala ferr-topo" aria-labelledby="esc-h1">
  <div class="ferr-topo__fundo" aria-hidden="true"></div>
  <div class="wrap ferr-topo__in">
    ${breadcrumb([{ nome: 'Início', href: url('') }, { nome: 'Escolher pelo meu espaço' }])}
    <p class="etiqueta etiqueta--linha" data-intro style="--i:0">Escolhedor</p>
    <h1 id="esc-h1" class="ferr-topo__h1" data-intro="mascara" style="--i:1">Escolha pelo seu espaço</h1>
    <p class="ferr-topo__lead">Sete perguntas, todas com a opção "Tanto faz". A cada resposta, a contagem mostra quantos dos <span class="num">${totalEsc}</span> modelos publicados atendem.</p>
  </div>
</section>`;

  const app = html`<div class="dia esc-app">
  <div class="wrap esc is-carregando" data-esc data-passo="1">
    <script type="application/json" data-config>${raw(JSON.stringify(config).replace(/</g, '\\u003c'))}</script>
    <div class="esc__carregando" data-esc-carregando data-so-js hidden>Carregando o catálogo...</div>
    <noscript><p class="esc__semjs">O escolhedor precisa de JavaScript. Você pode ver todos os modelos em <a class="link" href="${url('banheiras.html')}">Banheiras</a>, <a class="link" href="${url('spas.html')}">Spas</a> e <a class="link" href="${url('ofuros.html')}">Ofurôs</a>, ou falar com a equipe pelo WhatsApp.</p></noscript>
    <div class="esc__grade" data-esc-grade>${form}${resultado}</div>
  </div>
</div>`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${abs('escolher.html')}#pagina`, name: 'Escolha pelo seu espaço', url: abs('escolher.html') },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: abs('') }, { '@type': 'ListItem', position: 2, name: 'Escolher pelo meu espaço', item: abs('escolher.html') }] },
    ],
  };

  return [
    {
      saida: 'escolher.html',
      html: layout({
        saida: 'escolher.html',
        titulo: 'Escolher banheira, spa ou ofurô pelo espaço | BBB',
        descricao: `Informe largura e comprimento do local e veja quais dos ${totalEsc} modelos publicados cabem, com folga, quase cabe, preço e planta oficial. Envie a escolha ao consultor.`,
        corpo: html`${topo}${app}${explica}`,
        jsonld: [jsonld],
        modulos: ['escolher'],
        ativo: 'escolher.html',
        sobre: true,
        classe: 'pg-escolher',
        critico: ['ferramenta', 'escolha'],
        // Primeira tela inteira no CSS crítico (LCP é o texto do topo): fontes e site.css depois da
        // primeira pintura, como no comparador. Os resultados esperam o site.css (escolher.js).
        fontes: [],
        cssAposPintura: true,
        fontesAposPintura: true,
        jsBaixa: true,
      }),
    },
    { saida: 'dados/indice.json', html: JSON.stringify(indice) },
  ];
}
