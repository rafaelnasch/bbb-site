// Layout de todas as páginas (SPEC 5, 6.1 e 11.1): cabeça completa, cabeçalho, <main>, rodapé,
// gavetas, bandeja do comparador e scripts. Os templates de página só fornecem o conteúdo do <main>.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { html, raw, attrs, render } from '../build/lib/html.mjs';
import { url, abs, caminhoDaSaida } from '../build/lib/url.mjs';
import { INDEXAR, paths } from '../site.config.mjs';
import { LIMITES, FONT_FACES_INTEIRAS } from '../build/lib/assets.mjs';
import { barraTopo, cabecalho, gavetaMenu } from './parts/header.mjs';
import { rodape } from './parts/footer.mjs';
import { gavetaWhats } from './parts/gaveta-whats.mjs';
import { icone } from '../build/lib/icons.mjs';
import { consolidar, serializar } from '../build/lib/jsonld.mjs';

let A = null; // assets do build (build/lib/assets.mjs)

/**
 * Registro das páginas renderizadas nesta execução (saída, canonical, robots pretendido, título e
 * descrição). O render.mjs grava em .cache/paginas.json; o seo.mjs monta os sitemaps a partir dele,
 * porque com INDEXAR=false o robots do HTML sai forçado em noindex e não diz mais o que é indexável.
 */
export const PAGINAS = [];

/** Chamado uma vez pelo render.mjs depois de construirAssets(). */
export function configurarLayout(assets) {
  A = assets;
}

export function csp(inlineHash) {
  return [
    "default-src 'self'",
    "img-src 'self' data:",
    "media-src 'self'",
    `script-src 'self' '${inlineHash}'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self'",
    'frame-src https://www.google.com https://www.youtube-nocookie.com',
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

function ogPadrao() {
  if (existsSync(join(paths.public, 'media', 'og', 'padrao.jpg'))) return 'media/og/padrao.jpg';
  return 'brand/og-padrao.jpg';
}

/**
 * @param {object} p
 * @param {string} p.saida        arquivo em dist (ex.: 'banheiras.html'); define o canonical
 * @param {string} p.titulo       <title> único
 * @param {string} p.descricao    meta description única
 * @param {*}      p.corpo        Html do <main> (contém o único <h1>)
 * @param {string} [p.robots]     'index,follow' (padrão) ou 'noindex,follow'; INDEXAR=false força noindex,nofollow
 * @param {string} [p.canonical]  caminho canônico, se diferente da saída
 * @param {object} [p.og]         { imagem: caminho em dist, largura, altura, tipo }
 * @param {Array}  [p.jsonld]     objetos JSON-LD (serializados com JSON.stringify)
 * @param {Array}  [p.modulos]    ferramentas de src/js carregadas na página (ex.: ['planta'])
 * @param {string} [p.ativo]      caminho do item de menu atual
 * @param {boolean}[p.sobre]      cabeçalho transparente sobre a sala escura do topo
 * @param {string} [p.esperar]    id de elemento que segura a primeira pintura (View Transition)
 * @param {Array}  [p.preload]    [{ href, as, type, fetchpriority, imagesrcset, imagesizes }]
 * @param {string} [p.classe]     classe do <body>
 * @param {Array}  [p.critico]    extras de src/css/critico/ inline nesta página (ex.: ['peca'])
 * @param {string} [p.cssCritico] CSS crítico extra do tipo de página (já minificado)
 * @param {Array}  [p.fontes]     fontes pré-carregadas (chaves de assets.fontes, ex.: 'fonts/fraunces-titulo.woff2');
 *                                padrão: a Fraunces inteira (SPEC 5.3). A home pré-carrega só o subconjunto do H1.
 * @param {boolean}[p.modulosTardios] módulos da página só pedidos depois do load (core.js), fora do caminho do LCP
 * @param {boolean}[p.cssAposPintura] o CSS do site só é pedido depois da primeira pintura (core.js); a primeira
 *                                tela tem de estar inteira no CSS crítico. Sem JS, o <noscript> carrega o CSS
 * @param {boolean}[p.fontesAposPintura] tira do CSS crítico as @font-face da Fraunces e da Open Sans (vêm no
 *                                site.css, pedido depois da primeira pintura): na primeira pintura só a fonte do H1
 *                                é baixada; o resto usa o fallback com métricas ajustadas. Exige cssAposPintura
 * @param {object} [p.rodapeTardio] alturas reservadas {m,t,d} (px, iguais ou menores que as reais) para pular o
 *                                layout do rodapé até ele chegar perto da tela (templates/parts/tardio.mjs); usado na home
 * @param {boolean}[p.bandeja]   false omite a bandeja do comparador (no próprio comparador ela só cobriria a página)
 * @param {boolean}[p.semImagem] Product sem foto publicada (Spa Serena): a validação do JSON-LD aceita Product sem image
 */
export function layout(p) {
  if (!A) throw new Error('layout: configurarLayout(assets) não foi chamado');
  const caminho = p.canonical ?? caminhoDaSaida(p.saida);
  const canonical = abs(caminho);
  const robots = INDEXAR ? p.robots || 'index,follow' : 'noindex,nofollow';
  const og = p.og || {};
  const ogImg = abs(og.imagem || ogPadrao());
  const mapaModulos = Object.fromEntries((p.modulos || []).map((m) => {
    if (!A.modulos[m]) throw new Error(`Módulo JS inexistente: ${m}`);
    return [m, A.modulos[m]];
  }));
  if (p.fontesAposPintura && !p.cssAposPintura) throw new Error(`${p.saida}: fontesAposPintura exige cssAposPintura`);
  const base = p.fontesAposPintura ? A.cssCritico.replace(FONT_FACES_INTEIRAS, '') : A.cssCritico;
  const critico = base + (p.critico || []).map((n) => {
    if (A.criticos[n] == null) throw new Error(`CSS crítico inexistente: critico/${n}.css`);
    return A.criticos[n];
  }).join('') + (p.cssCritico || '');
  if (Buffer.byteLength(critico) > LIMITES.cssCritico) {
    throw new Error(`${p.saida}: CSS crítico inline com ${Buffer.byteLength(critico)} bytes (teto ${LIMITES.cssCritico})`);
  }
  const preloadFontes = p.fontes ? p.fontes.map((k) => {
    if (!A.fontes[k]) throw new Error(`Fonte inexistente para preload: ${k}`);
    return A.fontes[k];
  }) : A.preload;
  // Um só bloco por página, com a Organization completa em todas (build/lib/jsonld.mjs, SPEC 11.2).
  const jsonld = raw(`<script type="application/ld+json">${serializar(consolidar(p.jsonld || [], { saida: p.saida, semImagem: p.semImagem }))}</script>`);
  PAGINAS.push({ saida: p.saida, caminho, canonical, robots: p.robots || 'index,follow', titulo: p.titulo, descricao: p.descricao });

  const doc = html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp(A.inlineHash)}">
<title>${p.titulo}</title>
<meta name="description" content="${p.descricao}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<script>${raw(A.inlineJs)}</script>
${p.esperar ? html`<link rel="expect" href="#${p.esperar}" blocking="render">` : ''}
${preloadFontes.map((h) => html`<link rel="preload" href="${h}" as="font" type="font/woff2" crossorigin${attrs({ fetchpriority: p.fontes ? 'high' : null })}>`)}
${(p.preload || []).map((l) => html`<link rel="preload"${attrs({ href: l.href, as: l.as, type: l.type, fetchpriority: l.fetchpriority, imagesrcset: l.imagesrcset, imagesizes: l.imagesizes })}>`)}
<style>${raw(critico)}</style>
${p.cssAposPintura ? '' : html`<link rel="stylesheet" href="${A.cssSite}" media="print" data-css-tardio>`}
<noscript><link rel="stylesheet" href="${A.cssSite}"></noscript>
<meta name="theme-color" content="#071C2B">
<link rel="icon" href="${url('brand/favicon-32.png')}" type="image/png" sizes="32x32">
<link rel="icon" href="${url('brand/favicon-192.png')}" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${url('brand/apple-touch-icon.png')}">
<link rel="manifest" href="${url('site.webmanifest')}">
<meta property="og:type" content="${og.tipo || 'website'}">
<meta property="og:site_name" content="Banheiras Bom Banho">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${og.titulo || p.titulo}">
<meta property="og:description" content="${og.descricao || p.descricao}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImg}">
<meta property="og:image:width" content="${og.largura || 1200}">
<meta property="og:image:height" content="${og.altura || 630}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${og.titulo || p.titulo}">
<meta name="twitter:description" content="${og.descricao || p.descricao}">
<meta name="twitter:image" content="${ogImg}">
${jsonld}
<script type="application/json" id="bbb-assets"${attrs({ 'data-tardios': p.modulosTardios ? Object.keys(mapaModulos).join(' ') : null, 'data-css': p.cssAposPintura ? A.cssSite : null })}>${raw(JSON.stringify(mapaModulos).replace(/</g, '\\u003c'))}</script>
<script type="module" src="${A.nucleo}"></script>
${p.modulosTardios ? '' : Object.values(mapaModulos).map((src) => html`<script type="module" src="${src}"></script>`)}
</head>
<body${attrs({ class: p.classe || null })}>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
${barraTopo()}
${cabecalho({ ativo: p.ativo, sobre: p.sobre })}
<main id="conteudo" tabindex="-1">
${p.corpo}
</main>
${rodape({ tardio: p.rodapeTardio || null })}
${gavetaMenu({ ativo: p.ativo })}
${gavetaWhats()}
${p.bandeja === false ? '' : html`<div class="bandeja" data-bandeja hidden role="region" aria-label="Modelos para comparar">
  <div class="wrap bandeja__in">
    <span class="bandeja__rot">Comparar</span>
    <ol class="bandeja__lista" data-bandeja-lista></ol>
    <div class="bandeja__acoes">
      <button class="bandeja__limpar" type="button" data-comparar-limpar>Limpar</button>
      <a class="btn btn--claro" href="${url('comparar.html')}" data-bandeja-ir>${icone('comparar', { tamanho: 18 })}Comparar <span class="num" data-comparar-n>0</span></a>
    </div>
  </div>
</div>`}
<div id="anuncio" class="vh" aria-live="polite" aria-atomic="true"></div>
</body>
</html>
`;
  return render(doc);
}
