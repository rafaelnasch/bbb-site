// Bloco 9 (SPEC 11, 13.7 e 14, linha "SEO"): JSON-LD por tipo, cabeça única, sitemaps, robots, llms,
// dados abertos, OG/Twitter e CSP. Renderiza numa pasta própria (os testes rodam em paralelo).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderizar } from '../build/render.mjs';
import { gerarSeo, urlCodificada, robotsTxt } from '../build/seo.mjs';
import { verificarSeo } from '../build/lib/seo-checks.mjs';
import { organizacao, consolidar, validarJsonLd, ORG_ID } from '../build/lib/jsonld.mjs';
import { tituloProduto, titulosUnicos } from '../templates/produto.mjs';
import { nomeDeBusca, tituloColecao } from '../templates/colecao.mjs';
import { dados } from '../build/lib/dados.mjs';
import { paths, SITE_URL, BASE_PATH, INDEXAR } from '../site.config.mjs';

const DIST = join(paths.cache, 'dist-seo');
const ler = (n) => JSON.parse(readFileSync(join(paths.data, n), 'utf8'));
const pg = (n) => readFileSync(join(DIST, n), 'utf8');
const ld = (h) => {
  const b = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  return { blocos: b, nos: b.flatMap((o) => o['@graph'] || [o]) };
};
const produtos = ler('produtos.json');
const ACQUA = 'banheira-acqua-linea-completa-com-hidro-em-acrilico';
let resumo;

before(async () => {
  await renderizar({ dist: DIST, sistema: false });
  resumo = gerarSeo(DIST);
});

test('Organization: completa, sem taxID, sem legalName e sem CEP; telefones só de contatos ativos', () => {
  const org = organizacao(dados());
  assert.equal(org['@id'], ORG_ID);
  for (const k of ['taxID', 'legalName']) assert.equal(org[k], undefined);
  assert.equal(org.address.postalCode, undefined);
  assert.equal(org.address.addressCountry, 'BR');
  assert.deepEqual(org.contactPoint.map((c) => c.contactType), ['sales', 'customer support', 'customer service', 'order tracking']);
  const ativos = new Set(ler('contatos.json').contatos.filter((c) => c.status === 'ativo').map((c) => `+${c.numero}`.replace(/\D/g, '')));
  for (const c of org.contactPoint) assert.ok(ativos.has(c.telephone.replace(/\D/g, '')), c.telephone);
  assert.equal(org.contactPoint[0].hoursAvailable.length, 2);
  assert.ok(org.sameAs.some((u) => /youtube\.com\/@bbbbanheiras/.test(u)));
  assert.ok(org.sameAs.some((u) => /reclameaqui/.test(u)));
});

test('validarJsonLd reprova Product sem preço, AggregateOffer invertida, FAQ de garantia e campos proibidos', () => {
  const org = organizacao(dados());
  const base = (n) => ({ '@context': 'https://schema.org', '@graph': [n, org] });
  const prod = { '@type': 'Product', name: 'X', sku: 'Y', url: `${SITE_URL}/x.html`, description: 'd', image: [`${SITE_URL}/a.jpg`], brand: { '@id': ORG_ID }, offers: { '@type': 'Offer', priceCurrency: 'BRL', availability: 'https://schema.org/InStock', price: 10 } };
  assert.deepEqual(validarJsonLd(base(prod)), []);
  assert.ok(validarJsonLd(base({ ...prod, offers: { ...prod.offers, price: undefined } })).some((e) => /price/.test(e)));
  assert.ok(validarJsonLd(base({ ...prod, offers: { '@type': 'AggregateOffer', priceCurrency: 'BRL', availability: 'https://schema.org/InStock', lowPrice: 9, highPrice: 5, offerCount: 2 } })).some((e) => /lowPrice/.test(e)));
  assert.ok(validarJsonLd(base({ ...prod, aggregateRating: { ratingValue: 5 } })).some((e) => /aggregateRating/.test(e)));
  assert.ok(validarJsonLd(base({ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Qual a garantia?', acceptedAnswer: { '@type': 'Answer', text: '2 anos' } }] })).some((e) => /garantia/.test(e)));
  assert.ok(validarJsonLd({ '@context': 'https://schema.org', '@graph': [{ ...org, taxID: '1' }] }).some((e) => /taxID/.test(e)));
  assert.ok(validarJsonLd(base({ '@type': 'HowTo', name: 'x' })).some((e) => /HowTo/.test(e)));
  // consolidar troca o nó mínimo pela Organization completa e junta tudo num só @graph
  const c = consolidar([{ '@context': 'https://schema.org', '@graph': [prod, { '@type': 'Organization', '@id': ORG_ID, name: 'mínimo' }] }]);
  assert.equal(c['@graph'].filter((n) => n['@id'] === ORG_ID).length, 1);
  assert.ok(c['@graph'].find((n) => n['@id'] === ORG_ID).contactPoint.length);
});

test('todas as páginas: um bloco JSON-LD, Organization em todas, Breadcrumb fora da home, verificação completa sem erros', () => {
  assert.deepEqual(verificarSeo(DIST), []);
  for (const s of ['index.html', 'banheiras.html', `${ACQUA}.html`, 'perguntas-frequentes.html', 'lojas/loja-showrooms.html', 'guia/gel-coat-ou-acrilico.html', 'busca.html', 'comparar.html', '404.html']) {
    const { blocos, nos } = ld(pg(s));
    assert.equal(blocos.length, 1, s);
    const org = nos.find((n) => n['@id'] === ORG_ID);
    assert.ok(org && !('taxID' in org) && !('legalName' in org), s);
    if (!['index.html', '404.html'].includes(s)) assert.ok(nos.some((n) => n['@type'] === 'BreadcrumbList'), `${s} sem BreadcrumbList`);
  }
});

test('Product, Offer/AggregateOffer, ProductGroup, ItemList, FAQPage, Store e Article nos lugares certos', () => {
  const acqua = ld(pg(`${ACQUA}.html`)).nos;
  const prod = acqua.find((n) => n['@type'] === 'Product');
  assert.equal(prod.offers['@type'], 'Offer'); // os 5 tamanhos têm o mesmo preço publicado
  // Tamanho que muda o preço: AggregateOffer com a faixa publicada
  const varia = produtos.find((p) => p.d_preco_min > 0 && p.d_preco_max > p.d_preco_min);
  const ag = ld(pg(`${varia.slug}.html`)).nos.find((n) => n['@type'] === 'Product').offers;
  assert.equal(ag['@type'], 'AggregateOffer');
  assert.equal(ag.lowPrice, varia.d_preco_min);
  assert.equal(ag.highPrice, varia.d_preco_max);
  assert.equal(prod.offers.hasMerchantReturnPolicy.merchantReturnDays, 7);
  assert.ok(prod.image.every((u) => u.startsWith(`${SITE_URL}/media/p/`)));
  const grupo = acqua.find((n) => n['@type'] === 'ProductGroup');
  assert.ok(grupo.hasVariant.some((v) => v['@id'] === prod['@id']));
  assert.ok(grupo.variesBy.includes('https://schema.org/material'));
  // Esgotado = OutOfStock
  const esg = produtos.find((p) => p.disponibilidade === 'Esgotado');
  assert.equal(ld(pg(`${esg.slug}.html`)).nos.find((n) => n['@type'] === 'Product').offers.availability, 'https://schema.org/OutOfStock');
  // Coleção: ItemList na ordem de categorias.json
  const cat = ler('categorias.json').find((c) => c.d_path === 'spas/5-a-6-lugares.html');
  const cp = ld(pg(cat.d_path)).nos.find((n) => n['@type'] === 'CollectionPage');
  assert.deepEqual(cp.mainEntity.itemListElement.map((x) => x.url), cat.produtos.map((s) => `${SITE_URL}/${s}.html`));
  assert.equal(ld(pg('perguntas-frequentes.html')).nos.filter((n) => n['@type'] === 'FAQPage').length, 1);
  const stores = ld(pg('lojas/loja-showrooms.html')).nos.filter((n) => n['@type'] === 'Store');
  assert.equal(stores.length, ler('lojas.json').length);
  for (const s of stores) assert.ok(!('openingHours' in s) && !s.address.postalCode && s.parentOrganization['@id'] === ORG_ID);
  const art = ld(pg('guia/banheira-por-tamanho.html')).nos.find((n) => n['@type'] === 'Article');
  assert.match(art.dateModified, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(art.author['@id'], ORG_ID);
  const home = ld(pg('index.html')).nos;
  assert.ok(home.find((n) => n['@type'] === 'WebSite').potentialAction.target.urlTemplate.endsWith('/busca.html?q={search_term_string}'));
});

test('títulos de produto: nome literal, até 60, únicos entre as versões gel coat e acrílico', () => {
  assert.equal(tituloProduto('Spa Quadrado Napole COMPLETO com hidro'), 'Spa Quadrado Napole COMPLETO com hidro | Banheiras Bom Banho');
  assert.equal(tituloProduto('Banheira Acqua Línea COMPLETA com hidro em Acrílico'), 'Banheira Acqua Línea COMPLETA com hidro em Acrílico | BBB');
  // Acima de 60: corte só no fim, por palavra, com reticências; nunca some um trecho do meio do nome.
  const longo = tituloProduto('Banheira Dupla Fortaleza Excellence COMPLETA C/ Hidro Em Acrílico');
  assert.ok(longo.length <= 60 && longo.endsWith('…'), longo);
  assert.ok('Banheira Dupla Fortaleza Excellence COMPLETA C/ Hidro Em Acrílico'.startsWith(longo.slice(0, -1)), longo);
  assert.match(longo, /C\/ Hidro/);
  assert.ok('Banheira Redonda Sensuale com abas COMPLETA com hidro em acrílico'.startsWith(tituloProduto('Banheira Redonda Sensuale com abas COMPLETA com hidro em acrílico').slice(0, -1)));
  assert.ok(!/\| BBB$/.test(tituloProduto('Aquecedor Digital com Sensor de Nível - BBB')));
  const t = titulosUnicos(produtos);
  assert.equal(new Set(t.values()).size, produtos.length);
  for (const v of t.values()) assert.ok(v.length <= 60 && !/\s(com|em|de)…?$/.test(v), v);
  for (const p of produtos) {
    const base = t.get(p.slug).replace(/ \| (Banheiras Bom Banho|BBB)$/, '').replace(` (${p.sku})`, '');
    const nome = p.nome.replace(/\s+/g, ' ').trim();
    assert.ok(base === nome || (base.endsWith('…') && nome.startsWith(base.slice(0, -1))), `${p.slug}: "${t.get(p.slug)}"`);
  }
});

test('títulos de coleção: mantém o título atual forte e gera o fraco a partir do nome e da trilha', () => {
  const D = dados();
  const cat = (p) => D.categorias.find((c) => c.d_path === p);
  const tri = (...n) => n.map((x) => ({ nome: x[0], path: x[1] }));
  assert.equal(tituloColecao(cat('spas/quadrados.html'), tri(['Início', ''], ['Spas', 'spas.html'], ['Spas Quadrados', 'spas/quadrados.html']), new Set(['spa'])), 'Spas Quadrados - Banheiras Bom Banho');
  assert.equal(nomeDeBusca(cat('spas/3-a-4-lugares.html'), tri(['Início', ''], ['Spas', 'spas.html'], ['3 a 4 Lugares', 'spas/3-a-4-lugares.html']), new Set(['spa'])), 'Spas de 3 a 4 lugares');
  assert.equal(nomeDeBusca(cat('ofuro-externo/ofuro-com-hidro.html'), tri(['Início', ''], ['Ofurô Externo', 'ofuro-externo.html'], ['Ofurô com hidro', 'ofuro-externo/ofuro-com-hidro.html']), new Set(['ofuro'])), 'Ofurô Externo com hidro');
  assert.equal(nomeDeBusca(cat('kids.html'), tri(['Início', ''], ['Kids', 'kids.html']), new Set(['banheira'])), 'Banheiras Kids');
  // banheiras.html: título atual cortado por superlativo; fica o trecho literal sem superlativo
  assert.equal(pg('banheiras.html').match(/<title>([^<]+)/)[1], 'Banheiras de Hidromassagem | Banheiras Bom Banho');
  assert.doesNotMatch(pg('lancamentos.html').match(/<title>([^<]+)/)[1], /^Spas Lan/);
});

test('sitemaps: índice com 4 filhos, produtos com image:image, só canônicas indexáveis, pontes de fora, PDFs codificados', () => {
  const idx = pg('sitemap.xml');
  for (const s of ['sitemap-produtos.xml', 'sitemap-colecoes.xml', 'sitemap-paginas.xml', 'sitemap-plantas.xml']) assert.ok(idx.includes(`<loc>${SITE_URL}/${s}</loc>`), s);
  const sp = pg('sitemap-produtos.xml');
  assert.equal((sp.match(/<url>/g) || []).length, resumo.produtos);
  assert.equal(resumo.produtos, produtos.length);
  assert.ok((sp.match(/<image:image>/g) || []).length >= produtos.length - 1);
  assert.match(sp, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  const todas = ['sitemap-produtos.xml', 'sitemap-colecoes.xml', 'sitemap-paginas.xml'].map(pg).join('\n');
  for (const n of ['busca.html', 'comparar.html', '404.html', 'sobre-nos.html', 'banheiras-de-hidromassagem.html', '_sistema.html']) assert.ok(!todas.includes(`${SITE_URL}/${n}</loc>`), `${n} no sitemap`);
  assert.equal(resumo.colecoes, ler('categorias.json').length - 2);
  const pl = pg('sitemap-plantas.xml');
  assert.ok(!/<loc>[^<]*[\s[\]][^<]*<\/loc>/.test(pl), 'PDF sem codificação');
  assert.ok(pl.includes(`${SITE_URL}/manual/manual-do-usuario.pdf`));
  assert.equal(urlCodificada(`${SITE_URL}/plantas/spas/A b [GC].pdf`), `${SITE_URL}/plantas/spas/A%20b%20%5BGC%5D.pdf`);
  assert.match(sp, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test('robots.txt segue INDEXAR: prévia com Disallow total; virada com os robôs liberados e o sitemap', () => {
  const r = pg('robots.txt');
  if (!INDEXAR) {
    assert.match(r, /User-agent: \*\nDisallow: \/\n/);
    assert.doesNotMatch(r, /^Sitemap:/m);
  }
  assert.match(robotsTxt(false), /User-agent: \*\nDisallow: \/\n/);
  const txt = robotsTxt(true);
  const bp = BASE_PATH.replace(/[/.]/g, (c) => `\\${c}`);
  assert.match(txt, new RegExp(`^User-agent: \\*\\nAllow: /\\nDisallow: ${bp}/busca\\.html\\nDisallow: ${bp}/comparar\\.html\\nDisallow: ${bp}/\\*\\?\\*`));
  for (const ua of ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot', 'DuckDuckBot']) assert.ok(txt.includes(`User-agent: ${ua}\nAllow: /\nDisallow: ${BASE_PATH}/busca.html\nDisallow: ${BASE_PATH}/comparar.html\nDisallow: ${BASE_PATH}/*?*\n`), ua);
  assert.ok(txt.endsWith(`\nSitemap: ${SITE_URL}/sitemap.xml\n`));
  assert.doesNotMatch(txt, /^Disallow: \/$/m);
});

test('llms.txt, llms-full.txt e dados/catalogo.json: completos, com fonte e data, sem dado fora dos JSON', () => {
  const l = pg('llms.txt');
  assert.match(l, /^# Banheiras Bom Banho\n\n> /);
  for (const s of ['llms-full.txt', 'dados/catalogo.json', 'perguntas-frequentes.html', 'manual-usuario-instalacao.html', 'guia/gel-coat-ou-acrilico.html']) assert.ok(l.includes(`${SITE_URL}/${s}`), s);
  for (const c of ler('contatos.json').contatos.filter((x) => x.status === 'ativo' && /^(venda_principal|ajuda|rastreio|sac|consultor_\d)$/.test(x.papel))) assert.ok(l.includes(`https://wa.me/${c.numero}`), c.papel);
  assert.doesNotMatch(l, /CEP|37584|37557/);
  assert.match(l, /segundo a empresa/);
  const f = pg('llms-full.txt');
  for (const p of produtos) assert.ok(f.includes(`- Nº de catálogo (SKU): ${p.sku}\n`), p.slug);
  assert.doesNotMatch(f, /\(VERIFICAR\)|BANHEIRA COLORIDA/);
  assert.doesNotMatch(f, /\d+ anos? de garantia/i);
  const napole = produtos.find((p) => p.slug === 'spa-quadrado-napole-completo-com-hidro');
  if (napole?.d_medida_confirmada === false) assert.match(f, /a ficha informa 1,96m x 1,96m x 0,85m e a opção de tamanho informa 1,97 x 1,97 x 0,86/);
  const cat = JSON.parse(pg('dados/catalogo.json'));
  assert.equal(cat.produtos.length, produtos.length);
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));
  for (const x of cat.produtos) {
    const p = porSlug.get(x.slug);
    assert.equal(x.nome, p.nome);
    assert.equal(x.preco.valor, p.preco.valores_numericos.finalPrice);
    assert.ok(x.fonte && x.coletado_em, x.slug);
    // Horário de Brasília com offset; o mesmo instante da fonte em UTC ao lado.
    if (/Z$/.test(p.coletado_em)) {
      assert.match(x.coletado_em, /-03:00$/);
      assert.equal(new Date(x.coletado_em).getTime(), new Date(p.coletado_em).getTime());
      assert.equal(x.coletado_em_utc, p.coletado_em);
    }
  }
  // Air Blower: a nota de preço por contexto da página também no llms-full
  const ab = produtos.find((p) => /air blower/i.test(p.nome));
  if (ab) {
    const bloco = f.slice(f.indexOf(`### ${ab.nome}\n`)).split('\n### ')[0];
    assert.match(bloco, /Preço como opcional: Como opcional dos spas, este item aparece por R\$\s?[\d.]+,\d{2} \(em \d+ modelos?\)/);
  }
});

test('meta e dados estruturados de produto: medida a confirmar fora da description, concordância, sem manufacturer, FAQPage única, ProductGroup por material', () => {
  const grupos = new Map();
  const material = new Map();
  for (const p of produtos) {
    const h = pg(`${p.slug}.html`);
    const d = /<meta name="description" content="([^"]+)">/.exec(h)[1];
    if (p.d_medida_confirmada === false) {
      assert.doesNotMatch(d, /\d+,\d+\s*x\s*\d+,\d+/, `${p.slug}: ${d}`);
      assert.match(d, /medida a confirmar/i, p.slug);
    }
    assert.doesNotMatch(d, /\b(Spa|Ofurô) (quadrada|redonda)\b/, `${p.slug}: ${d}`);
    assert.doesNotMatch(d, /Fábrica Banheiras Bom Banho/, p.slug);
    assert.equal(/<meta property="og:title" content="([^"]+)">/.exec(h)[1].replace(/&amp;/g, '&'), p.nome);
    const n = ld(h).nos;
    const prod = n.find((x) => x['@type'] === 'Product');
    assert.ok(!('manufacturer' in prod), p.slug);
    assert.ok(!n.some((x) => x['@type'] === 'FAQPage'), `${p.slug} com FAQPage`);
    material.set(prod['@id'], prod.material);
    const g = n.find((x) => x['@type'] === 'ProductGroup');
    if (g) {
      assert.deepEqual(g.variesBy, ['https://schema.org/material']);
      grupos.set(g['@id'], g.hasVariant.map((v) => v['@id']));
    }
  }
  for (const [gid, ids] of grupos) {
    const mats = ids.map((i) => material.get(i));
    assert.ok(mats.every(Boolean) && new Set(mats).size === mats.length, `${gid}: ${mats}`);
  }
  for (const c of ler('categorias.json').filter((x) => /\.html$/.test(x.d_path || '') && existsSync(join(DIST, x.d_path)))) assert.ok(!ld(pg(c.d_path)).nos.some((x) => x['@type'] === 'FAQPage'), c.d_path);
  assert.ok(!ld(pg('index.html')).nos.some((x) => x['@type'] === 'FAQPage'));
  for (const s of ['contacts.html', 'escolher.html', 'vendas-corporativas.html']) assert.ok(/<title>([^<]+)/.exec(pg(s))[1].length <= 60, s);
});

test('cabeça: OG e Twitter completos, og:url igual ao canonical, CSP por meta e robots conforme INDEXAR', () => {
  for (const s of ['index.html', `${ACQUA}.html`, 'banheiras.html', 'sobre-nos.html']) {
    const h = pg(s);
    const can = /<link rel="canonical" href="([^"]+)">/.exec(h)[1];
    assert.equal(/<meta property="og:url" content="([^"]+)">/.exec(h)[1], can, s);
    assert.match(h, /<meta property="og:locale" content="pt_BR">/);
    assert.match(h, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(h, /<meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;/);
    if (!INDEXAR) assert.match(h, /<meta name="robots" content="noindex,nofollow">/);
  }
  assert.equal(/<meta property="og:type" content="([^"]+)">/.exec(pg(`${ACQUA}.html`))[1], 'product');
  assert.ok(existsSync(join(DIST, 'site.webmanifest')) && existsSync(join(DIST, '.nojekyll')));
});
