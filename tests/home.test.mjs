// Bloco 6 (home, SPEC 9.1, 12 e 14): contagens reais, salas na ordem do catálogo, lançamentos, prova com
// fonte e data, nenhum CEP, nenhum recurso externo na carga, JSON-LD, orçamento de JS e CSS crítico,
// água e vapor fora do caminho do LCP. Renderiza numa pasta própria (os testes rodam em paralelo).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { HtmlValidate } from 'html-validate';
import { renderizar } from '../build/render.mjs';
import { paths, BASE_PATH } from '../site.config.mjs';
import { PORTAS, SALAS, PECAS_POR_SALA, FAQ_HOME, numerosDeclarados, reclameAqui, horarioSchema, cidadeDaFabrica, opcoesPessoas } from '../templates/home.mjs';
import { mapaLojas } from '../build/lib/mapa-lojas.mjs';
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

test('salas: 7 faixas, 4 peças cada, na ordem da listagem do site atual, contagem real e contorno', () => {
  const faixas = [...h.matchAll(/<section class="sala-faixa"[\s\S]*?<\/section>/g)].map((m) => m[0]);
  assert.equal(faixas.length, SALAS.length);
  SALAS.forEach(([path], i) => {
    const slugs = [...faixas[i].matchAll(/<li class="cart" data-slug="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(slugs, cat(path).produtos.slice(0, PECAS_POR_SALA), `${path}: ordem`);
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

test('perguntas: só publicadas e sem garantia; FAQPage com as mesmas; 3 posts reais do blog', () => {
  const ids = new Map(faq.map((f) => [f.id, f]));
  const exib = FAQ_HOME.map((id) => ids.get(id)).filter((f) => f.tipo === 'publicada' && f.exibir !== false && !f.oculto_ate_decisao);
  const qs = [...h.matchAll(/<summary class="faq-item__q">([^<]+)</g)].map((m) => m[1]);
  assert.equal(qs.length, exib.length);
  assert.ok(qs.length >= 5 && qs.length <= 6);
  assert.doesNotMatch(qs.join(' '), /garantia/i);
  const blocos = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const nos = blocos.flatMap((o) => o['@graph'] || [o]);
  const fp = nos.find((n) => n['@type'] === 'FAQPage');
  assert.equal(fp.mainEntity.length, exib.length);
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
  const mods = JSON.parse(/<script type="application\/json" id="bbb-assets">([\s\S]*?)<\/script>/.exec(h)[1]);
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
