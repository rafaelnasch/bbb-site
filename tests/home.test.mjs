// Bloco 6 (home, SPEC 9.1, 12 e 14): contagens reais, salas na ordem do catálogo, lançamentos, prova com
// fonte e data, nenhum CEP, nenhum recurso externo na carga, JSON-LD, orçamento de JS e CSS crítico,
// água e vapor fora do caminho do LCP. Renderiza numa pasta própria (os testes rodam em paralelo).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { HtmlValidate } from 'html-validate';
import { renderizar } from '../build/render.mjs';
import { paths, BASE_PATH } from '../site.config.mjs';
import { PORTAS, SALAS, PECAS_POR_SALA, FAQ_HOME, ALTURA_SALAS, ALTURA_RODAPE, numerosDeclarados, reclameAqui, horarioSchema, cidadeDaFabrica, opcoesPessoas } from '../templates/home.mjs';
import { mapaLojas } from '../build/lib/mapa-lojas.mjs';
import { alturaReservada } from '../templates/parts/tardio.mjs';
import { validar } from '../build/validate.mjs';

const DIST = join(paths.cache, 'dist-home');
const ler = (n) => JSON.parse(readFileSync(join(paths.data, n), 'utf8'));
const produtos = ler('produtos.json');
const categorias = ler('categorias.json');
const empresa = ler('empresa.json');
const lojas = ler('lojas.json');
const faq = ler('faq.json');
const cat = (p) => categorias.find((c) => c.d_path === p);
let h = '';
const texto = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ');

before(async () => {
  await renderizar({ dist: DIST });
  h = readFileSync(join(DIST, 'index.html'), 'utf8');
});

test('H1 único com a cidade da fábrica lida do endereço publicado', () => {
  assert.equal((h.match(/<h1[\s>]/g) || []).length, 1);
  const loc = cidadeDaFabrica(empresa.endereco_fabrica);
  assert.ok(loc, 'cidade da fábrica');
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(h)[1];
  assert.equal(texto(h1).trim(), `Banheiras, spas e ofurôs de hidromassagem, direto da fábrica em ${loc.cidade}, ${loc.uf}`);
});

test('portas com a contagem real (total_exibido) de cada coleção', () => {
  const portas = [...h.matchAll(/<li class="porta"[\s\S]*?<\/li>/g)].map((m) => m[0]);
  assert.equal(portas.length, PORTAS.length);
  PORTAS.forEach(([path], i) => {
    assert.ok(portas[i].includes(`href="${BASE_PATH}/${path}"`), `${path}: link`);
    const n = /data-campo="categoria-total">(\d+)</.exec(portas[i])?.[1];
    assert.equal(Number(n), cat(path).total_exibido, `${path}: contagem`);
  });
});

test('salas: 7 faixas, 4 peças distintas cada, na ordem da listagem do site atual, contagem real e contorno', () => {
  const faixas = [...h.matchAll(/<section class="sala-faixa"[\s\S]*?<\/section>/g)].map((m) => m[0]);
  assert.equal(faixas.length, SALAS.length);
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));
  const vistos = new Set();
  SALAS.forEach(([path], i) => {
    const slugs = [...faixas[i].matchAll(/<li class="cart" data-slug="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(slugs.length, PECAS_POR_SALA, `${path}: 4 peças`);
    // Ordem do site atual (subsequência da listagem), com foto e sem repetir peça de outra sala.
    const ordem = cat(path).produtos;
    const pos = slugs.map((s) => ordem.indexOf(s));
    assert.ok(pos.every((x, k) => x >= 0 && (k === 0 || x > pos[k - 1])), `${path}: ordem da listagem`);
    for (const s of slugs) {
      assert.ok(!porSlug.get(s).d_sem_foto, `${s}: sem foto`);
      assert.ok(!vistos.has(s), `${s}: repetida entre salas`);
      vistos.add(s);
    }
    assert.equal(Number(/data-campo="categoria-total">(\d+)</.exec(faixas[i])[1]), cat(path).total_exibido);
    assert.ok(faixas[i].includes(`href="${BASE_PATH}/${path}"`));
  });
  assert.ok((h.match(/class="cart__ctn"/g) || []).length >= 20, 'contornos em escala nos cartões');
});

test('lançamentos 2026: os 6 spas reais da categoria, na ordem', () => {
  const sec = /<section class="sala sala--2 secao home-lanc"[\s\S]*?<\/section>/.exec(h)[0];
  const slugs = [...sec.matchAll(/<li class="cart" data-slug="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(slugs, cat('lancamentos.html').produtos);
  assert.equal(slugs.length, 6);
});

test('cartões: nome e preços literais de produtos.json', () => {
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));
  for (const m of h.matchAll(/<li class="cart" data-slug="([^"]+)"[\s\S]*?<\/li>/g)) {
    const p = porSlug.get(m[1]);
    assert.ok(m[0].includes(`>${p.preco.por}<`), `${p.slug}: preço por`);
    if (p.preco.de) assert.ok(m[0].includes(`>${p.preco.de}<`), `${p.slug}: preço de`);
  }
});

test('o desenho é a obra: planta validada da Acqua Línea 0,79 x 1,41 x 0,37 com cotas literais e PDF', () => {
  const sec = /<section class="sala sala--planta secao home-obra"[\s\S]*?<\/section>/.exec(h)?.[0];
  assert.ok(sec, 'seção da planta');
  assert.match(sec, /Cada peça tem planta técnica oficial com as cotas, e você baixa o PDF/);
  const p = produtos.find((x) => x.slug === 'banheira-acqua-linea-completa-com-hidro-em-acrilico');
  const dp = p.d_planta.find((x) => x.rotulo === '0,79 x 1,41 x 0,37');
  assert.equal(dp.cotas_validadas, true);
  const pl = ler(`plantas/${dp.sha1}.json`);
  const exib = [...sec.matchAll(/data-cota-valor="([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(exib, pl.cotas.map((c) => [c.letra, c.valor_texto]));
  assert.match(sec, /data-explorador/);
  assert.match(sec, /href="[^"]+\.pdf" download/);
  assert.match(sec, /data-gsap="[^"]+vendor\/gsap\.min\.js"/);
  assert.ok(existsSync(join(DIST, 'vendor', 'gsap.min.js')) && existsSync(join(DIST, 'vendor', 'ScrollTrigger.min.js')));
});

test('fábrica: endereço sem CEP, números "segundo a empresa", INMETRO com o número, sem ISO', () => {
  assert.ok(h.includes(`data-campo="empresa-endereco">${empresa.endereco_fabrica.replace(/&/g, '&amp;')}<`));
  assert.doesNotMatch(texto(h), /\b\d{5}-\d{3}\b/, 'nenhum CEP');
  assert.doesNotMatch(texto(h), /CEP:?\s*\d/i);
  const nums = numerosDeclarados(empresa.numeros_declarados[0].literal);
  for (const n of nums) assert.ok(h.includes(n.rotulo), n.literal);
  assert.match(texto(h), /segundo a empresa/i);
  assert.ok(h.includes(`data-campo="empresa-inmetro">${empresa.inmetro.certificado}<`));
  assert.doesNotMatch(texto(h), /ISO\s*9001/i);
});

test('prova: Reclame Aqui com nota, período e data da consulta, link oficial; depoimentos reais com nome', () => {
  const ra = reclameAqui(empresa.reclame_aqui);
  assert.equal(ra.nota, '8,8/10');
  assert.equal(ra.resolve, '87%');
  assert.equal(ra.periodo, '01/04 a 30/09/2026');
  assert.equal(ra.consultado, '18/10/2026');
  const t = texto(h);
  assert.ok(t.includes('Período de 01/04 a 30/09/2026, consultado em 18/10/2026'));
  assert.ok(t.includes('Reputação Ótima'));
  assert.ok(h.includes(`href="${empresa.reclame_aqui.url}"`));
  for (const d of empresa.depoimentos) {
    assert.ok(h.includes(`data-campo="depoimento">${d.texto}<`), d.autor);
    assert.ok(t.includes(d.autor));
  }
});

test('como comprar: pagamento literal e botão de compra com o número de venda', () => {
  const pag = ler('politicas.json').pagamento.literal;
  const partes = [...h.matchAll(/data-campo="pagamento">([^<]+)</g)].map((m) => m[1]);
  assert.equal(partes.join(' '), pag);
  // Numeração só a do texto literal: parágrafos, sem lista com marcador.
  const passo = /<div class="home-passo__pag">[\s\S]*?<\/div>/.exec(h)?.[0] || '';
  assert.ok(passo, 'formas de pagamento em parágrafos');
  assert.doesNotMatch(passo, /<[ou]l|<li/);
  assert.equal((passo.match(/<p>/g) || []).length, (pag.match(/\d\.\s/g) || []).length);
  assert.match(h, /href="https:\/\/wa\.me\/5535992194882\?text=[^"]+"[^>]*data-wa-contexto="home_como_comprar"/);
});

test('lojas: 9 cidades no mapa SVG, sem iframe, cada uma com link para a âncora da página de lojas', () => {
  const itens = [...h.matchAll(/<li class="mapa__item[^"]*"[^>]*><a href="([^"]+)">/g)].map((m) => m[1]);
  assert.equal(itens.length, lojas.length);
  assert.equal(lojas.length, 9);
  lojas.forEach((l, i) => assert.equal(itens[i], `${BASE_PATH}/lojas/loja-showrooms.html#${l.ancora}`));
  assert.doesNotMatch(h, /<iframe/);
  const M = mapaLojas(lojas);
  for (const p of M.pontos) assert.ok(p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100, p.loja.cidade);
});

test('perguntas: só publicadas e sem garantia, sem FAQPage repetido; 3 posts reais do blog', () => {
  const ids = new Map(faq.map((f) => [f.id, f]));
  const exib = FAQ_HOME.map((id) => ids.get(id)).filter((f) => f.tipo === 'publicada' && f.exibir !== false && !f.oculto_ate_decisao);
  const qs = [...h.matchAll(/<summary class="faq-item__q">([^<]+)</g)].map((m) => m[1]);
  assert.equal(qs.length, exib.length);
  assert.ok(qs.length >= 5 && qs.length <= 6);
  assert.doesNotMatch(qs.join(' '), /garantia/i);
  const blocos = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const nos = blocos.flatMap((o) => o['@graph'] || [o]);
  // FAQPage só em perguntas-frequentes.html (instância única da FAQ repetida); aqui a FAQ fica só visível.
  assert.ok(!nos.some((n) => n['@type'] === 'FAQPage'));
  const blog = ler('blog-recentes.json').recentes.filter((b) => b.exibir).slice(0, 3);
  for (const b of blog) assert.ok(h.includes(`href="${b.url}"`), b.titulo);
  assert.ok(nos.find((n) => n['@type'] === 'WebSite')?.potentialAction?.target?.urlTemplate.endsWith('/busca.html?q={search_term_string}'));
  const org = nos.find((n) => n['@type'] === 'Organization');
  assert.equal(org.taxID, undefined);
  assert.equal(org.legalName, undefined);
  assert.equal(org.address.postalCode, undefined);
  assert.deepEqual(horarioSchema(empresa.horario.literal).map((x) => [x.dayOfWeek.length, x.opens, x.closes]), [[4, '07:00', '17:00'], [1, '07:00', '16:00']]);
});

test('escolhedor rápido: opções de pessoas iguais às do escolher.html e contagem inicial dos 279', () => {
  const indice = JSON.parse(readFileSync(join(DIST, 'dados', 'indice.json'), 'utf8'));
  const cfg = JSON.parse(/<section class="dia secao home-esc"[\s\S]*?<script type="application\/json" data-config>([\s\S]*?)<\/script>/.exec(h)[1]);
  const ops = opcoesPessoas(indice.itens, '', cfg).map((o) => o[0]);
  const exib = [.../data-home-pessoas>([\s\S]*?)<\/div>/.exec(h)[1].matchAll(/value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(exib, [...ops, '']);
  const total = indice.itens.filter((it) => it.t !== 'acessorio').length;
  assert.equal(Number(/data-home-esc-n>(\d+)</.exec(h)[1]), total);
  assert.ok(opcoesPessoas(indice.itens, 'spa', cfg).every((o) => o[0].startsWith('spa')));
});

test('primeira carga sem recurso de terceiros; LCP não é canvas (água e vapor só nascem no navegador)', () => {
  const carga = h.replace(/<link rel="(?:canonical|manifest)"[^>]*>/g, '').replace(/<a\b[^>]*>/g, '');
  for (const m of carga.matchAll(/<(?:img|script|link|source|video)\b[^>]*\s(?:src|href|srcset|poster)="(https?:[^"]+)"/g)) {
    assert.fail(`recurso externo na carga: ${m[1]}`);
  }
  assert.doesNotMatch(h, /<canvas/);
  assert.match(h, /class="home-abre__agua" aria-hidden="true" data-agua/);
});

test('orçamento: JS da home <= 25 KB gzip (sem o GSAP do desktop), CSS crítico <= 14 KB, HTML válido', async () => {
  const mods = JSON.parse(/<script type="application\/json" id="bbb-assets"[^>]*>([\s\S]*?)<\/script>/.exec(h)[1]);
  const nucleo = /<script type="module" src="([^"]+nucleo[^"]+)"/.exec(h)[1];
  const arq = (u) => readFileSync(join(DIST, u.slice(BASE_PATH.length)));
  const inline = /<script>([\s\S]*?)<\/script>/.exec(h)[1];
  const total = [nucleo, ...Object.values(mods)].reduce((s, u) => s + gzipSync(arq(u), { level: 9 }).length, 0) + gzipSync(inline).length;
  assert.ok(total <= 25 * 1024, `JS da home ${total} B gzip`);
  for (const m of ['home', 'agua', 'vapor']) assert.ok(mods[m], `módulo ${m}`);
  const css = /<style>([\s\S]*?)<\/style>/.exec(h)[1];
  assert.ok(Buffer.byteLength(css) <= 14 * 1024, `CSS crítico ${Buffer.byteLength(css)} B`);
  const hv = new HtmlValidate({ extends: ['html-validate:standard', 'html-validate:document'], rules: { 'require-sri': 'off' } });
  const r = await hv.validateFile(join(DIST, 'index.html'));
  const erros = r.results.flatMap((x) => x.messages).filter((m) => m.severity === 2);
  assert.deepEqual(erros.map((e) => `${e.ruleId}: ${e.message}`), []);
});

test('validador do build sem falhas na saída com a home', async () => {
  const { erros } = await validar(DIST);
  assert.deepEqual(erros.filter((e) => e.startsWith('index.html') || !/\.html:/.test(e)), []);
});

test('LCP: H1 com o subconjunto da Fraunces pré-carregado, que cobre todo o texto do H1; módulos e CSS do site depois da pintura', () => {
  const cobertos = new Set([...readFileSync(join(paths.src, 'fonts', 'fraunces-titulo.txt'), 'utf8').replace(/\n$/, '')]);
  const h1 = texto(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(h)[1]).trim();
  const faltam = [...new Set([...h1])].filter((c) => !cobertos.has(c));
  assert.deepEqual(faltam, [], 'rode node build/fontes-titulo.mjs depois de mudar o H1');
  assert.match(h, /<link rel="preload" href="[^"]*fraunces-titulo\.[0-9a-f]{10}\.woff2" as="font" type="font\/woff2" crossorigin fetchpriority="high">/);
  assert.doesNotMatch(h, /rel="preload" href="[^"]*fraunces-var-latin/, 'na home o preload é só o do H1');
  assert.match(h, /font-family:"Fraunces Titulo"/);
  // Módulos da página e CSS do site só depois da primeira pintura (core.js), fora do caminho do LCP.
  assert.doesNotMatch(h, /<script type="module" src="[^"]*assets\/js\/(?!nucleo)/, 'só o núcleo no <head>');
  const ass = /<script type="application\/json" id="bbb-assets"([^>]*)>([^<]*)</.exec(h);
  const tardios = /data-tardios="([^"]+)"/.exec(ass[1])?.[1].split(' ') || [];
  assert.deepEqual(tardios.sort(), Object.keys(JSON.parse(ass[2])).sort());
  for (const m of ['home', 'agua', 'vapor', 'planta']) assert.ok(tardios.includes(m), m);
  assert.match(ass[1], /data-css="[^"]*assets\/site\.[0-9a-f]{10}\.css"/);
  assert.doesNotMatch(h, /<link rel="stylesheet" href="[^"]*site\.[0-9a-f]{10}\.css" media="print"/);
  assert.match(h, /<noscript><link rel="stylesheet" href="[^"]*site\.[0-9a-f]{10}\.css"><\/noscript>/, 'sem JS, o CSS vem pelo noscript');
});

test('abertura: vitrine decorativa com os filmes das portas, recortados na foto; contagens reais', () => {
  const v = /<div class="vitrine"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(h)?.[0] || '';
  assert.match(v, /aria-hidden="true"/);
  for (const [path, id] of PORTAS) {
    if (!h.includes(`data-porta="${id}"`)) continue;
    assert.match(v, new RegExp(`data-cena="${id}"`));
    assert.match(v, new RegExp(`data-cena-leg="${id}"[\\s\\S]*?>${cat(path).total_exibido}<`));
  }
  assert.doesNotMatch(h, /porta__video/, 'o filme toca na vitrine, não na miniatura');
});

test('fábrica: o prefixo "+ DE" fica menor, mas o texto do número continua literal', () => {
  const nums = numerosDeclarados(empresa.numeros_declarados?.[0]?.literal).filter((x) => x.valor);
  const dts = [...h.matchAll(/<div class="home-fab__num"[^>]*><dt class="num">([\s\S]*?)<\/dt>/g)].map((m) => texto(m[1]).replace(/\s+/g, ' ').trim());
  assert.deepEqual(dts, nums.map((x) => x.valor.replace(/\s+/g, ' ').trim()));
});

test('escolhedor rápido explica quando a coleção lista peça de outro tipo (contagem por tipo)', () => {
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));
  for (const [path, id, nome] of PORTAS) {
    const tipo = { banheiras: 'banheira', spas: 'spa', ofuros: 'ofuro' }[id];
    const outros = cat(path).produtos.map((s) => porSlug.get(s)).filter((p) => p && p.d_tipo !== tipo);
    const nota = /<p class="home-esc__nota">([\s\S]*?)<\/p>/.exec(h)?.[1] || '';
    if (!outros.length) continue;
    assert.match(texto(nota), new RegExp(`A coleção ${nome} exibe ${cat(path).total_exibido} modelos`));
    for (const p of outros) assert.ok(texto(nota).includes(p.nome), p.nome);
  }
});

test('content-visibility só na galeria das salas e no rodapé, com altura reservada por faixa de largura', () => {
  const abre = /<section class="sala home-abre"[^>]*>/.exec(h)[0];
  assert.doesNotMatch(abre, /content-visibility/);
  const tag = (c) => new RegExp(`<section class="[^"]*\\b${c}\\b[^"]*"[^>]*>`).exec(h)?.[0] || '';
  // Seções de altura muito variável entre larguras não são puladas (reservar errado mentiria na rolagem).
  for (const c of ['home-esc', 'home-obra', 'home-lanc', 'home-fab', 'home-prova', 'home-comprar', 'home-lojas', 'home-fim']) {
    assert.doesNotMatch(tag(c), /content-visibility/, c);
  }
  assert.doesNotMatch(h, /<section class="sala-faixa"[^>]*content-visibility/, 'sem content-visibility aninhado nas faixas');
  const esperado = (a) => alturaReservada(a).replace(/[()*+]/g, (x) => `\\${x}`);
  assert.match(tag('home-salas'), new RegExp(`content-visibility:auto;contain-intrinsic-block-size:auto ${esperado(ALTURA_SALAS)}" data-cv`));
  assert.match(h, new RegExp(`<footer class="rodape sala" id="rodape" style="content-visibility:auto;contain-intrinsic-block-size:auto ${esperado(ALTURA_RODAPE)}" data-cv`));
});

test('altura reservada: degraus nos mesmos cortes das media queries (600 e 1024 px)', () => {
  assert.equal(alturaReservada({ m: 4750, t: 4850, d: 4000 }), 'calc(4750px + clamp(0px, (100vw - 599px) * 100000, 100px) - clamp(0px, (100vw - 1023px) * 100000, 850px))');
  assert.equal(alturaReservada({ m: 900, t: 900, d: 900 }), 'calc(900px)');
  assert.throws(() => alturaReservada({ m: 1, t: 0, d: 1 }));
});

test('abertura: nenhuma foto atrás do título; as portas trazem a foto real da coleção, versionada', () => {
  const ab = /<section class="sala home-abre"[\s\S]*?<\/section>/.exec(h)[0];
  assert.doesNotMatch(ab, /abre-peca/, 'sem peça sobreposta ao H1');
  // Antes do H1 só há água, vapor e textos: nenhuma imagem.
  assert.doesNotMatch(ab.slice(0, ab.indexOf('<h1')), /<img|<picture|<video/);
  const versionados = new Set(execSync('git ls-files public/media/home', { cwd: paths.raiz || join(paths.public, '..') }).toString().trim().split('\n'));
  for (const [, id] of PORTAS) {
    const a = new RegExp(`<a class="porta__a"[^>]*data-porta-id="${id}"[\\s\\S]*?</a>`).exec(ab)?.[0] || '';
    assert.match(a, new RegExp(`src="${BASE_PATH}/media/home/porta-${id}-240\\.webp"`), id);
    assert.match(a, new RegExp(`srcset="${BASE_PATH}/media/home/porta-${id}-240\\.avif 240w, ${BASE_PATH}/media/home/abertura-${id}-484\\.avif 484w"`), id);
    assert.doesNotMatch(a, /loading="lazy"/, `${id}: primeira tela, sem lazy`);
    for (const f of [`porta-${id}-240.avif`, `porta-${id}-240.webp`, `abertura-${id}-484.avif`, `abertura-${id}-484.webp`]) {
      assert.ok(versionados.has(`public/media/home/${f}`), `${f} versionado (o build de publicação não tem os filmes)`);
    }
  }
});

test('abertura: fontes inteiras fora do CSS crítico da home, pedidas com o site.css', () => {
  const inline = /<style>([\s\S]*?)<\/style>/.exec(h)[1];
  assert.doesNotMatch(inline, /@font-face\{font-family:(Fraunces|"?Open Sans"?);/);
  assert.match(inline, /@font-face\{font-family:"?Fraunces Titulo"?;/);
  assert.match(inline, /Open Sans Fallback/);
  const css = /data-css="([^"]+)"/.exec(h)[1].slice(BASE_PATH.length + 1);
  const site = readFileSync(join(paths.dist, css), 'utf8');
  assert.match(site, /@font-face\{font-family:Fraunces;/);
  assert.match(site, /@font-face\{font-family:"?Open Sans"?;/);
  // Páginas sem fontes depois da pintura (institucionais) continuam com as fontes no CSS crítico; coleção,
  // produto e comparador também pedem as fontes só com o site.css (o LCP é a foto ou o texto da ferramenta).
  const outra = readFileSync(join(paths.dist, 'como-comprar.html'), 'utf8');
  assert.match(/<style>([\s\S]*?)<\/style>/.exec(outra)[1], /@font-face\{font-family:Fraunces;/);
  const col = readFileSync(join(paths.dist, 'banheiras.html'), 'utf8');
  assert.doesNotMatch(/<style>([\s\S]*?)<\/style>/.exec(col)[1], /@font-face\{font-family:Fraunces;/);
});

test('vitrine do desktop: cena com o filme ou, sem ele, a foto recortada parada', () => {
  const v = /<div class="vitrine"[\s\S]*?<div class="vitrine__leg">/.exec(h)?.[0] || '';
  assert.ok(v, 'vitrine presente (os recortes de media/home são versionados)');
  for (const [, id] of PORTAS) {
    const cena = new RegExp(`<div class="vitrine__cena([^"]*)"[^>]*data-cena="${id}">([\\s\\S]*?)</div>`).exec(v);
    assert.ok(cena, id);
    if (/recorte/.test(cena[1])) assert.match(cena[2], /<video/);
    else assert.match(cena[2], new RegExp(`abertura-${id}-484\\.webp`));
  }
});

test('lançamentos: texto derivado, sem afirmar a origem das fotos além de "publicadas pela empresa"', () => {
  const sec = /<section class="sala sala--2 secao home-lanc"[\s\S]*?<\/section>/.exec(h)[0];
  const c = cat('lancamentos.html');
  assert.match(texto(sec), new RegExp(`${c.total_exibido} modelos na coleção ${c.nome}, com fotos publicadas pela empresa\\.`));
  assert.doesNotMatch(texto(sec), /reais da fábrica|fotos reais/);
});

// Filmes (public/media/filmes, gerados por build/films.mjs): no build de publicação (CI), a home precisa
// deles versionados; sem eles a vitrine e os lançamentos caem para a foto, e a imersão anunciada some.
test('publicação: filmes das portas e dos lançamentos presentes no build de CI', { skip: !process.env.CI && 'só no CI (localmente os filmes podem estar fora do git)' }, () => {
  const man = join(paths.public, 'media', 'filmes', 'manifest.json');
  assert.ok(existsSync(man), 'public/media/filmes/manifest.json ausente: commite os filmes antes do deploy');
  const col = JSON.parse(readFileSync(man, 'utf8')).colecao || {};
  for (const id of [...PORTAS.map(([, i]) => i), 'lancamentos']) {
    const f = col[id];
    assert.ok(f, `filme ${id} no manifest`);
    for (const src of [f.webm?.src, f.mp4?.src, f.poster?.avif?.src]) assert.ok(src && existsSync(join(paths.public, src)), `${id}: ${src} ausente`);
  }
  assert.match(h, /data-vitrine/);
  assert.match(h, /home-lanc__video/);
});
