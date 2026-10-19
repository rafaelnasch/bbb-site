// Páginas-ponte (SPEC 4.1): substituem o 301 no GitHub Pages para as URLs antigas que respondem 200 no
// site atual (duplicadas, renomeadas, sem .html) e para os combos que não são publicados. HTML mínimo:
// canonical absoluto no destino, robots noindex, meta refresh de 0 s (funciona sem JS), location.replace()
// e link visível. Ficam fora do sitemap (seo.mjs pula meta refresh). A mesma lista vai para
// build/redirects.csv, usada nos 301 reais do Cloudflare na virada de domínio.
//
// A lista sai dos dados (catalog.json via data/meta.json e categorias.json), não da memória:
//  - categorias do Magento sem .html (CATEGORIAS_PONTE) e aliases de categoria (skipped.alias_de);
//  - a duplicata do produto 6 (skipped: "mesmo product_id 6 da URL canônica ...");
//  - produtos cujo endereço atual difere do arquivo gerado (slug com acento do Aquecedor);
//  - as páginas institucionais renomeadas ou vazias da tabela da SPEC 4.1 e as demais URLs 200 do site
//    atual sem página equivalente (benefícios, downloads, etapas do rastreio, categoria de sauna vazia);
//  - combos (skipped) para a coleção raiz do modelo citado no endereço.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { esc } from '../build/lib/html.mjs';
import { url, abs, SITE_URL } from '../build/lib/url.mjs';
import { INDEXAR, paths } from '../site.config.mjs';
import { CATEGORIAS_PONTE, RAIZ_TIPO } from '../build/lib/catalogo.mjs';

const SITE_ATUAL = 'https://www.banheirasbombanho.com.br/';
const caminho = (u) => String(u).replace(/^https?:\/\/www\.banheirasbombanho\.com\.br\//, '');

// Páginas institucionais da tabela da SPEC 4.1 (origem -> destino). Os caminhos de origem são conferidos
// contra data/meta.json (paginas_institucionais_e_blog): só entra o que o site atual de fato publica.
const INSTITUCIONAIS = Object.freeze([
  ['sobre-nos', 'lojas/sobre-nos.html'],
  ['loja-fisica', 'lojas/loja-fisica.html'],
  ['loja-showrooms2', 'lojas/loja-showrooms.html'],
  ['taubate', 'lojas/loja-showrooms.html#@taubate'],
  ['vendas-corporativas2', 'vendas-corporativas.html'],
  ['depoimentos', 'lojas/sobre-nos.html#depoimentos'],
  ['tutorial.html', 'manual-usuario-instalacao.html'],
  ['tutorial/tutorial-cuidados-e-manutenc-o-com-spa.html', 'manual-usuario-instalacao.html'],
  ['tutorial/tutorial-montagem-e-instalac-o-eletrica.html', 'manual-usuario-instalacao.html'],
  ['tutorial/tutorial-montagem-e-instalac-o-hidraulica.html', 'manual-usuario-instalacao.html'],
  ['lojas/manual-do-usuario.html', 'manual-usuario-instalacao.html'],
  ['blog.html', '@blog'],
  ['lojas.html', 'lojas/loja-showrooms.html'],
  ['energia-solar-fotovoltaica.html', ''],
  ['iso-9001-2015', 'inmetro.html'],
  // URLs que respondem 200 no site atual e não têm página equivalente no site novo (decisões em
  // data/institucionais.json, `decisoes`). /outlet fica fora (SPEC 4: não publicar).
  ['beneficios-cromoterapia', '', 'página de benefícios com afirmações de saúde, não publicada (SPEC 0.5); vai para a página inicial'],
  ['beneficios-da-hidromassagem', '', 'página de benefícios com afirmações de saúde, não publicada (SPEC 0.5); vai para a página inicial'],
  ['downloads', 'manual-usuario-instalacao.html', 'materiais de apoio: o manual em texto e o PDF original'],
  ['situacao-rastreio', 'rastreio.html', 'etapa do rastreio do site atual; o rastreio novo é pelo WhatsApp'],
  ['sucesso', 'rastreio.html', 'página de confirmação do formulário de rastreio do site atual'],
  ['sauna/por-tamanho/sauna-de-1-30-x-1-10-x-2-00.html', 'sauna.html', 'categoria do site atual sem produtos; vai para a coleção de saunas'],
]);

/** Arquivo em dist/ que responde pelo caminho antigo no GitHub Pages. */
export function arquivoDaOrigem(origem) {
  const o = origem.replace(/^\/+/, '').replace(/\/+$/, '');
  if (/\.html$/.test(o)) return o;
  if (o.includes('/')) return `${o}/index.html`; // catalog/category/view/id/130 -> pasta com index.html
  return `${o}.html`; // /sobre-nos é servido por sobre-nos.html
}

function destinoCombo(origem, produtos) {
  const resto = origem.replace(/\.html(\.html)?$/, '').replace(/-1$/, '')
    .replace(/^combo-(?:basico|basic|premium|premum)-?/, '').replace(/^combo-/, '').replace(/-c-hidro-/, '-com-hidro-');
  if (!resto || /^combos?($|\/)/.test(resto)) return '';
  const p = produtos.find((x) => x.slug === resto) || produtos.find((x) => x.slug.endsWith(`-${resto}`) || x.slug.endsWith(resto));
  if (p && RAIZ_TIPO[p.d_tipo]) return RAIZ_TIPO[p.d_tipo];
  if (/(^|-)spa-/.test(resto)) return RAIZ_TIPO.spa;
  if (/(^|-)banheira-/.test(resto)) return RAIZ_TIPO.banheira;
  return '';
}

/** Lista de pontes: [{ origem, saida, destino (caminho interno ou URL externa), motivo }]. */
export function listaPontes(D) {
  const meta = D.meta || {};
  const produtos = D.ler('produtos.json') || [];
  const lojas = D.lojas || [];
  const publicadas = new Set((meta.paginas_institucionais_e_blog || []).filter((p) => p.status === 200).map((p) => caminho(p.url)));
  const skipped = meta.skipped || [];
  const out = [];
  const add = (origem, destino, motivo) => {
    const saida = arquivoDaOrigem(origem);
    if (out.some((x) => x.saida === saida)) return;
    out.push({ origem, saida, destino, motivo });
  };

  for (const c of CATEGORIAS_PONTE) add(c, RAIZ_TIPO.banheira, 'categoria do Magento sem .html, mesma listagem de banheiras.html');
  for (const s of skipped) {
    if (s.alias_de) add(caminho(s.url), caminho(s.alias_de), 'redireciona no site atual');
    const dup = /mesmo product_id \d+ da URL canônica (https?:\/\/\S+)/.exec(s.reason || '');
    if (dup) {
      const alvo = caminho(dup[1]);
      const p = produtos.find((x) => x.d_path === alvo || `${x.slug}.html` === alvo);
      if (p) add(caminho(s.url), `${p.slug}.html`, 'duplicata do mesmo produto no site atual');
    }
  }
  for (const p of produtos) {
    if (p.d_path && p.d_path !== `${p.slug}.html` && !p.d_path.includes('/')) add(p.d_path, `${p.slug}.html`, 'endereço atual com acento; a página nova usa o slug sem acento');
  }
  const blog = /(https?:\/\/blog\.[^/\s]+)/.exec(D.ler('blog-recentes.json')?.fonte || '')?.[1] || null;
  for (const [origem, destino0, motivo] of INSTITUCIONAIS) {
    if (!publicadas.has(origem)) continue;
    let destino = destino0;
    if (destino === '@blog') { if (!blog) continue; destino = `${blog}/`; }
    const m = /#@(\w+)$/.exec(destino);
    if (m) {
      const l = lojas.find((x) => x.ancora === m[1]);
      destino = l ? destino.replace(/#@\w+$/, `#${l.ancora}`) : destino.replace(/#@\w+$/, '');
    }
    add(origem, destino, motivo || 'página antiga substituída (SPEC 4.1)');
  }
  for (const s of skipped) {
    const o = caminho(s.url);
    if (!/^combo/.test(o)) continue;
    const d = destinoCombo(o, produtos);
    add(o, d, d ? 'combo não publicado; vai para a coleção do modelo citado' : 'lista de combos não publicada (sem modelo no endereço); vai para a página inicial');
  }
  return out;
}

// O script fica no fim do <body>, depois do link: no <head> o #destino ainda não existe.
const SCRIPT = "location.replace(document.getElementById('destino').href)";
const HASH = `sha256-${createHash('sha256').update(SCRIPT).digest('base64')}`;

function ogPadrao() {
  return existsSync(join(paths.public, 'media', 'og', 'padrao.jpg')) ? 'media/og/padrao.jpg' : 'brand/og-padrao.jpg';
}

export function htmlPonte(p, nomeDestino) {
  const externo = /^https?:/.test(p.destino);
  const href = externo ? p.destino : url(p.destino);
  const canonical = externo ? abs(p.saida.replace(/(^|\/)index\.html$/, '$1')) : abs(p.destino.replace(/#.*$/, ''));
  const robots = INDEXAR ? 'noindex,follow' : 'noindex,nofollow';
  const csp = `default-src 'self'; img-src 'self' data:; script-src '${HASH}'; style-src 'unsafe-inline'; base-uri 'self'; form-action 'none'`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
<title>Página movida | Banheiras Bom Banho</title>
<meta name="description" content="${esc(`Este endereço mudou. O conteúdo está em: ${nomeDestino}.`)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:image" content="${esc(abs(ogPadrao()))}">
<meta http-equiv="refresh" content="${esc(`0;url=${href}`)}">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071C2B;color:#F3F6F8;font:400 1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:24px}main{max-width:36rem}h1{font:300 1.75rem/1.2 Georgia,serif;margin:0 0 .5em}a{color:#F3F6F8}</style>
</head>
<body>
<main>
<h1>Esta página mudou de endereço</h1>
<p>Você está sendo levado para <a id="destino" href="${esc(href)}">${esc(nomeDestino)}</a>.</p>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

function nomeDe(D, destino) {
  if (/^https?:/.test(destino)) return 'Blog da Banheiras Bom Banho';
  const d = destino.replace(/#.*$/, '');
  if (d === '') return 'Página inicial da Banheiras Bom Banho';
  const cat = D.catPorPath.get(d);
  if (cat) return cat.nome;
  const p = (D.ler('produtos.json') || []).find((x) => `${x.slug}.html` === d);
  if (p) return p.nome;
  const NOMES = {
    'lojas/sobre-nos.html': 'Sobre nós', 'lojas/loja-fisica.html': 'Conheça nossa fábrica', 'lojas/loja-showrooms.html': 'Lojas e showrooms',
    'vendas-corporativas.html': 'Vendas corporativas', 'manual-usuario-instalacao.html': 'Manual do usuário e instalação', 'inmetro.html': 'Certificação INMETRO',
    'rastreio.html': 'Rastreio do pedido',
  };
  return NOMES[d] || 'Banheiras Bom Banho';
}

export function paginas(ctx) {
  const D = ctx.dados;
  const lista = listaPontes(D);
  // build/redirects.csv: origem (site atual), destino (caminho novo, sem BASE_PATH) e motivo.
  const csv = ['origem,destino,motivo', ...lista.map((p) => [`/${p.origem}`, /^https?:/.test(p.destino) ? p.destino : `/${p.destino}`, p.motivo].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n') + '\n';
  const arq = join(paths.root, 'build', 'redirects.csv');
  if (!existsSync(arq) || readFileSync(arq, 'utf8') !== csv) writeFileSync(arq, csv);
  return lista.map((p) => ({ saida: p.saida, html: htmlPonte(p, nomeDe(D, p.destino)) }));
}

export { SITE_URL, SITE_ATUAL };
