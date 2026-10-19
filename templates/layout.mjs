// Layout de todas as páginas (SPEC 5, 6.1 e 11.1): cabeça completa, cabeçalho, <main>, rodapé,
// gavetas, bandeja do comparador e scripts. Os templates de página só fornecem o conteúdo do <main>.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { html, raw, attrs, render } from '../build/lib/html.mjs';
import { url, abs, caminhoDaSaida } from '../build/lib/url.mjs';
import { INDEXAR, paths } from '../site.config.mjs';
import { barraTopo, cabecalho, gavetaMenu } from './parts/header.mjs';
import { rodape } from './parts/footer.mjs';
import { gavetaWhats } from './parts/gaveta-whats.mjs';
import { icone } from '../build/lib/icons.mjs';

let A = null; // assets do build (build/lib/assets.mjs)

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
 * @param {string} [p.cssCritico] CSS crítico extra do tipo de página (já minificado)
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
  const jsonld = (p.jsonld || []).map((o) => raw(`<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`));

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
${A.preload.map((h) => html`<link rel="preload" href="${h}" as="font" type="font/woff2" crossorigin>`)}
${(p.preload || []).map((l) => html`<link rel="preload"${attrs({ href: l.href, as: l.as, type: l.type, fetchpriority: l.fetchpriority, imagesrcset: l.imagesrcset, imagesizes: l.imagesizes })}>`)}
<style>${raw(A.cssCritico)}${raw(p.cssCritico || '')}</style>
<link rel="stylesheet" href="${A.cssSite}" media="print" data-css-tardio>
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
<script type="application/json" id="bbb-assets">${raw(JSON.stringify(mapaModulos).replace(/</g, '\\u003c'))}</script>
<script type="module" src="${A.nucleo}"></script>
${Object.values(mapaModulos).map((src) => html`<script type="module" src="${src}"></script>`)}
</head>
<body${attrs({ class: p.classe || null })}>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
${barraTopo()}
${cabecalho({ ativo: p.ativo, sobre: p.sobre })}
<main id="conteudo" tabindex="-1">
${p.corpo}
</main>
${rodape()}
${gavetaMenu({ ativo: p.ativo })}
${gavetaWhats()}
<div class="bandeja" data-bandeja hidden role="region" aria-label="Modelos para comparar">
  <div class="wrap bandeja__in">
    <span class="bandeja__rot">Comparar</span>
    <ol class="bandeja__lista" data-bandeja-lista></ol>
    <div class="bandeja__acoes">
      <button class="bandeja__limpar" type="button" data-comparar-limpar>Limpar</button>
      <a class="btn btn--claro" href="${url('comparar.html')}" data-bandeja-ir>${icone('comparar', { tamanho: 18 })}Comparar <span class="num" data-comparar-n>0</span></a>
    </div>
  </div>
</div>
<div id="anuncio" class="vh" aria-live="polite" aria-atomic="true"></div>
</body>
</html>
`;
  return render(doc);
}
