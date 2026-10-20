// Bloco 5 (coleções e escolha): 58 coleções (as 2 categorias do Magento sem .html são pontes), regra de
// encaixe com rotação e "quase cabe", índice local da busca e do escolhedor, fichas do comparador e os
// 4 guias calculados. Renderiza numa pasta própria (os testes rodam em paralelo).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { HtmlValidate } from 'html-validate';
import { renderizar } from '../build/render.mjs';
import { avaliarTamanho, melhorTamanho, tamanhoCm, cm } from '../build/lib/encaixe.mjs';
import { CATEGORIAS_PONTE, campo } from '../build/lib/catalogo.mjs';
import { textoCategoria } from '../templates/colecao.mjs';
import { numerosProibidosEm } from '../build/lib/wa.mjs';
import { paths, BASE_PATH, INDEXAR } from '../site.config.mjs';

const DIST = join(paths.cache, 'dist-colecao');
const produtos = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
const categorias = JSON.parse(readFileSync(join(paths.data, 'categorias.json'), 'utf8'));
const porSlug = new Map(produtos.map((p) => [p.slug, p]));
const pagina = (s) => readFileSync(join(DIST, s), 'utf8');
const jsonld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).flatMap((o) => [o, ...(o['@graph'] || [])]);
const texto = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const COLECOES = categorias.filter((c) => !CATEGORIAS_PONTE.includes(c.d_path));

before(async () => {
  await renderizar({ dist: DIST });
});

test('58 coleções no mesmo caminho, com a mesma lista e ordem de categorias.json (peças sem foto no fim)', () => {
  assert.equal(categorias.length, 60);
  assert.equal(COLECOES.length, 58);
  for (const c of COLECOES) {
    const h = pagina(c.d_path);
    const slugs = [...h.matchAll(/<li class="cart" data-slug="([^"]+)"/g)].map((m) => m[1]);
    // Ordem do catálogo, com os modelos sem foto publicada no fim (QA: a primeira impressão da coleção é
    // uma peça). A posição do catálogo continua em data-pos e no ItemList do JSON-LD.
    const semFoto = new Set(slugs.filter((s) => new RegExp(`data-slug="${s}"[^>]*data-sf="1"`).test(h)));
    assert.deepEqual(slugs, [...c.produtos.filter((s) => !semFoto.has(s)), ...c.produtos.filter((s) => semFoto.has(s))], `${c.d_path}: ordem dos cartões`);
    for (const s of slugs) assert.equal(Number(new RegExp(`data-slug="${s}" data-pos="(\\d+)"`).exec(h)?.[1]), c.produtos.indexOf(s), `${c.d_path}: data-pos de ${s}`);
    if (semFoto.size) assert.match(h, /sem foto publicada aparece/, `${c.d_path}: nota das peças sem foto`);
    assert.equal(slugs.length, c.total_exibido, `${c.d_path}: total`);
    const tot = /data-campo="categoria-total">(\d+)</.exec(h);
    assert.equal(Number(tot?.[1]), c.total_exibido, `${c.d_path}: contagem do topo`);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `${c.d_path}: um h1`);
  }
  for (const p of CATEGORIAS_PONTE) assert.ok(!existsSync(join(DIST, p)) || !/class="cart"/.test(readFileSync(join(DIST, p, 'index.html'), 'utf8')), `${p} fica para a ponte`);
});

test('cartão: nome, preço por e de literais, link sem JS para a página do produto', () => {
  const h = pagina('spas.html');
  const lis = [...h.matchAll(/<li class="cart"[\s\S]*?<\/li>/g)].map((m) => m[0]);
  assert.equal(lis.length, 55);
  for (const li of lis) {
    const slug = /data-slug="([^"]+)"/.exec(li)[1];
    const p = porSlug.get(slug);
    const nome = /<h3 class="cart__nome">([\s\S]*?)<\/h3>/.exec(li)[1].replace(/&amp;/g, '&');
    assert.equal(nome, p.nome);
    assert.match(li, new RegExp(`data-campo="preco-por">${p.preco.por.replace(/[$.]/g, '\\$&')}<`));
    if (p.preco.de) assert.match(li, new RegExp(`data-campo="preco-de">${p.preco.de.replace(/[$.]/g, '\\$&')}<`));
    const href = /<a class="cart__a" href="([^"]+)"/.exec(li)[1];
    assert.equal(href, `${BASE_PATH}/${slug}.html`);
    assert.ok(existsSync(join(DIST, `${slug}.html`)));
    // botão Comparar só com JS
    assert.match(li, /data-comparar="[^"]+"[^>]*data-so-js/);
  }
  // Selos "Esgotado" e "Planta oficial" só quando o dado sustenta
  for (const c of COLECOES) {
    for (const [li] of pagina(c.d_path).matchAll(/<li class="cart"[\s\S]*?<\/li>/g)) {
      const p = porSlug.get(/data-slug="([^"]+)"/.exec(li)[1]);
      assert.equal(/selo--esgotado/.test(li), p.disponibilidade === 'Esgotado', `${p.slug}: selo esgotado`);
      assert.equal(/>Planta oficial</.test(li), (p.d_planta || []).some((x) => x.pdf_path), `${p.slug}: selo planta`);
    }
  }
});

test('versões irmãs: um cartão por família com chips de versão e preço literal; as demais ficam no HTML', () => {
  const h = pagina('banheiras.html');
  const lis = [...h.matchAll(/<li class="cart"[\s\S]*?<\/li>/g)].map((m) => m[0]);
  const porFam = new Map();
  for (const li of lis) {
    const gr = /data-gr="([^"]+)"/.exec(li)?.[1];
    if (!gr) { assert.doesNotMatch(li, /data-agrupada/); continue; }
    porFam.set(gr, [...(porFam.get(gr) || []), li]);
  }
  assert.ok(porFam.size > 20, 'famílias agrupadas');
  for (const [gr, membros] of porFam) {
    assert.ok(membros.length >= 2, gr);
    // só a primeira da grade aparece; as outras levam data-agrupada (sem JS, todas aparecem)
    assert.equal(membros.filter((li) => !/data-agrupada/.test(li)).length, 1, gr);
    assert.doesNotMatch(membros[0], /data-agrupada/, `${gr}: a primeira da grade é a visível`);
    for (const li of membros) {
      for (const m of membros) {
        const q = porSlug.get(/data-slug="([^"]+)"/.exec(m)[1]);
        assert.equal(q.d_familia, gr);
        assert.match(li, new RegExp(`data-v="${q.slug}"[\\s\\S]*?data-campo="preco-por">${q.preco.por.replace(/[$.]/g, '\\$&')}<`), `${gr}: chip de ${q.slug}`);
      }
    }
  }
});

test('etiqueta e filtros omitem campo em conflito entre nome e ficha', () => {
  const h = pagina('ofuros.html');
  const li = /<li class="cart" data-slug="ofuro-duplo-toquio-com-hidro"[^>]*>/.exec(h)[0];
  assert.match(li, /data-lu=""/, 'Lugares em conflito fica fora do filtro');
  const corpo = /<li class="cart" data-slug="ofuro-duplo-toquio-com-hidro"[\s\S]*?<\/li>/.exec(h)[0];
  assert.doesNotMatch(/<span class="cart__eti">([^<]*)</.exec(corpo)[1], /Individual/);
});

test('frase factual, texto da categoria, chip implícito e frete promocional sem a campanha vencida', () => {
  const sp = texto(pagina('spas.html'));
  assert.match(sp, /55 spas, de [\d,]+ a [\d,]+ m, para \d a \d pessoas\./);
  const canto = pagina('banheiras/banheira-de-canto.html');
  assert.match(canto, /<a class="col-chip" href="[^"]*\/banheiras\.html"><span>Forma: De Canto<\/span>/);
  const frete = texto(pagina('frete-promocional.html'));
  assert.doesNotMatch(frete, /31\/08|Frete Promocional Gel Coat/i);
  assert.equal(textoCategoria('A\nBanheiras Bom Banho\né fabricante\n. Veja'), 'A Banheiras Bom Banho é fabricante. Veja');
});

test('HTML de coleção dentro de 60 KB gzip e JSON-LD CollectionPage com ItemList na ordem', () => {
  for (const c of COLECOES) {
    const h = pagina(c.d_path);
    const gz = gzipSync(Buffer.from(h)).length;
    assert.ok(gz <= 60 * 1024, `${c.d_path}: ${gz} B gzip`);
    const cp = jsonld(h).find((n) => n['@type'] === 'CollectionPage');
    assert.ok(cp, `${c.d_path}: CollectionPage`);
    assert.equal(cp.mainEntity.numberOfItems, c.total_exibido);
    // Ordem exibida (SPEC 11.2): a do catálogo, com as peças sem foto publicada no fim, como na grade.
    const semFoto = new Set(produtos.filter((p) => p.d_sem_foto).map((p) => p.slug));
    const ordem = [...c.produtos.filter((s) => !semFoto.has(s)), ...c.produtos.filter((s) => semFoto.has(s))];
    assert.deepEqual(cp.mainEntity.itemListElement.map((x) => x.url.split('/').pop()), ordem.map((s) => `${s}.html`));
    assert.ok(jsonld(h).some((n) => n['@type'] === 'BreadcrumbList'));
  }
});

test('encaixe: rotação, folga, quase cabe até 10 cm e maior medida quando a medida é a confirmar', () => {
  const t = { menor: 79, maior: 141 };
  assert.equal(avaliarTamanho(t, { largura: 90, comprimento: 170 }).cabe, true);
  assert.equal(avaliarTamanho(t, { largura: 170, comprimento: 90 }).cabe, true, 'a peça gira');
  const r = avaliarTamanho(t, { largura: 90, comprimento: 170 });
  assert.equal(r.sobraL, 11);
  assert.equal(r.sobraC, 29);
  assert.equal(avaliarTamanho(t, { largura: 90, comprimento: 170, folga: 10 }).sobraL, 1);
  const q = avaliarTamanho(t, { largura: 90, comprimento: 137 });
  assert.equal(q.cabe, false);
  assert.equal(q.quase, true);
  assert.equal(q.excesso, 4);
  assert.equal(q.dimExcedida, 'comprimento');
  assert.equal(avaliarTamanho(t, { largura: 90, comprimento: 130 }).quase, false, 'passa 11 cm: não é quase');
  assert.equal(avaliarTamanho(t, { largura: 75, comprimento: 137 }).quase, false, 'duas dimensões passam');
  // 0,795 publicado vira 79,5 cm, sem erro de ponto flutuante
  assert.equal(cm(0.795), 79.5);
  // medida a confirmar (ficha x opção): encaixe pela maior das duas
  const sev = porSlug.get('banheira-de-canto-sevilha-com-hidro-em-acrilico');
  const t0 = tamanhoCm(sev.d_tamanhos[0]);
  assert.deepEqual(t0, { menor: 136, maior: 150, confirmar: true });
  assert.equal(avaliarTamanho(t0, { largura: 140, comprimento: 140 }).cabe, false, 'a opção diz 1,36 x 1,36, mas a ficha diz 1,50');
  assert.equal(produtos.filter((p) => p.d_medida_confirmada === false).length, 12);
  // melhor tamanho: o que cabe com menor folga
  const acqua = porSlug.get('banheira-acqua-linea-completa-com-hidro-em-acrilico');
  const ts = acqua.d_tamanhos.map(tamanhoCm);
  const m = melhorTamanho(ts, { largura: 90, comprimento: 170 });
  assert.equal(acqua.d_tamanhos[m.i].rotulo, '0,79 x 1,69 x 0,37');
});

test('o encaixe do navegador (escolher.js) é o mesmo do build em todas as medidas publicadas', () => {
  const src = readFileSync(join(paths.src, 'js', 'escolher.js'), 'utf8');
  const corpo = /function avaliar\(t, L, C, f\) \{([\s\S]*?)\n {2}\}\n/.exec(src)[1];
  const avaliarJs = new Function('t', 'L', 'C', 'f', 'QUASE', corpo.replace(/QUASE/g, 'QUASE'));
  const espacos = [[90, 170], [170, 90], [80, 150], [100, 100], [150, 210], [75, 137], [120, 120], [200, 260]];
  let n = 0;
  for (const p of produtos) {
    for (const t of p.d_tamanhos || []) {
      const c = tamanhoCm(t);
      if (!c) continue;
      for (const [L, C] of espacos) for (const f of [0, 5, 10]) {
        const a = avaliarTamanho(c, { largura: L, comprimento: C, folga: f });
        const b = avaliarJs([null, c.menor, c.maior], L, C, f, 10);
        assert.equal(b.cabe, a.cabe);
        assert.equal(b.quase, a.quase);
        if (a.quase) { assert.equal(b.excesso, a.excesso); assert.equal(b.dim, a.dimExcedida); }
        n++;
      }
    }
  }
  assert.ok(n > 10000, `${n} combinações`);
});

test('dados/indice.json: 292 produtos, medidas em cm iguais às do build, sem campo em conflito, até 40 KB gzip', () => {
  const raw = readFileSync(join(DIST, 'dados', 'indice.json'));
  assert.ok(gzipSync(raw).length <= 40 * 1024, `${gzipSync(raw).length} B gzip`);
  const ind = JSON.parse(raw);
  assert.equal(ind.itens.length, 292);
  assert.equal(ind.cats.length, 58);
  for (const it of ind.itens) {
    const p = porSlug.get(it.s);
    assert.ok(p);
    assert.equal(it.n, p.nome);
    assert.equal(it.k, p.sku);
    assert.equal(it.po, p.preco.por);
    assert.equal(it.pf, p.preco.valores_numericos.finalPrice);
    p.d_tamanhos.forEach((t, i) => {
      const c = tamanhoCm(t);
      assert.equal(it.ts[i][1], c ? c.menor : null);
      assert.equal(it.ts[i][2], c ? c.maior : null);
      assert.equal(it.ts[i][0], t.rotulo ?? t.rotulo_ficha);
    });
    for (const [k, ch] of [['Forma', 'fo'], ['Lugares', 'lu'], ['Material', 'ma'], ['Configuracao', 'co']]) assert.equal(it[ch] ?? null, campo(p, k));
  }
  assert.deepEqual(numerosProibidosEm(raw.toString()), []);
  const fichas = JSON.parse(readFileSync(join(DIST, 'dados', 'fichas.json'), 'utf8'));
  for (const p of produtos) assert.deepEqual(fichas[p.slug].e, p.especificacoes || {});
  for (const p of produtos.filter((x) => x.d_medida_confirmada === false)) assert.ok(fichas[p.slug].fd, `${p.slug}: medida da ficha para o comparador`);
});

test('escolhedor, comparador e busca: cabeça, robots, WhatsApp de contato ativo e configuração', () => {
  const esc = pagina('escolher.html');
  assert.match(esc, /Como escolher o tamanho da banheira/);
  for (const g of ['guia/banheira-por-tamanho.html', 'guia/spa-por-lugares.html', 'guia/gel-coat-ou-acrilico.html', 'guia/basica-ou-completa.html']) assert.ok(esc.includes(`${BASE_PATH}/${g}`), g);
  assert.match(esc, /href="https:\/\/wa\.me\/5535992194882\?text=[^"]*"[^>]*data-esc-wa/);
  const robots = (h) => /<meta name="robots" content="([^"]+)">/.exec(h)[1];
  assert.equal(robots(esc), INDEXAR ? 'index,follow' : 'noindex,nofollow');
  for (const s of ['comparar.html', 'busca.html']) assert.equal(robots(pagina(s)), INDEXAR ? 'noindex,follow' : 'noindex,nofollow');
  const busca = pagina('busca.html');
  assert.match(busca, /href="https:\/\/wa\.me\/5535992192256[^"]*"[^>]*data-wa-contexto="busca_vazia"/);
  for (const s of ['escolher.html', 'comparar.html', 'busca.html']) {
    const cfg = JSON.parse(/<script type="application\/json" data-config>([\s\S]*?)<\/script>/.exec(pagina(s))[1]);
    assert.equal(cfg.indice, `${BASE_PATH}/dados/indice.json`);
  }
});

test('4 guias calculados: Article com data, números batem com data/', () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const spas = produtos.filter((p) => p.d_tipo === 'spa');
  const g2 = pagina('guia/spa-por-lugares.html');
  assert.match(texto(g2), new RegExp(`São ${spas.length} spas publicados`));
  const ban = produtos.filter((p) => p.d_tipo === 'banheira');
  assert.match(texto(pagina('guia/banheira-por-tamanho.html')), new RegExp(`tem ${ban.length} banheiras`));
  for (const s of ['guia/banheira-por-tamanho.html', 'guia/spa-por-lugares.html', 'guia/gel-coat-ou-acrilico.html', 'guia/basica-ou-completa.html']) {
    const h = pagina(s);
    const art = jsonld(h).find((n) => n['@type'] === 'Article');
    assert.ok(art, `${s}: Article`);
    assert.equal(art.dateModified, hoje);
    assert.match(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(h)[1], /\?$/, `${s}: título em pergunta`);
  }
  // Gel coat ou acrílico: a resposta literal da empresa (faq-02) e preços literais das irmãs
  const g3 = pagina('guia/gel-coat-ou-acrilico.html');
  const faq02 = JSON.parse(readFileSync(join(paths.data, 'faq.json'), 'utf8')).find((f) => f.id === 'faq-02');
  assert.ok(texto(g3).includes(faq02.resposta_exibida.trim().replace(/\s+/g, ' ')));
  for (const [, preco] of g3.matchAll(/data-campo="preco-por">([^<]+)</g)) assert.ok(produtos.some((p) => p.preco.por === preco), preco);
  // Básica ou Completa: todo item listado existe literal nos itens exibidos de algum produto
  const g4 = pagina('guia/basica-ou-completa.html');
  const itens = new Set(produtos.flatMap((p) => p.d_itens_de_serie_exibidos || []));
  for (const [, i] of g4.matchAll(/data-campo="item-serie">([^<]+)</g)) assert.ok(itens.has(i.replace(/&amp;/g, '&')), i);
});

test('html-validate sem erros nas páginas do bloco', async () => {
  const hv = new HtmlValidate({ extends: ['html-validate:standard', 'html-validate:document'], rules: { 'require-sri': 'off' } });
  for (const s of ['escolher.html', 'comparar.html', 'busca.html', 'banheiras.html', 'spas/5-a-6-lugares.html', 'frete-promocional.html', 'acessorios.html', 'sauna.html',
    'guia/banheira-por-tamanho.html', 'guia/spa-por-lugares.html', 'guia/gel-coat-ou-acrilico.html', 'guia/basica-ou-completa.html']) {
    const r = await hv.validateFile(join(DIST, s));
    const erros = r.results.flatMap((x) => x.messages).filter((m) => m.severity === 2);
    assert.deepEqual(erros.map((m) => `${m.ruleId} ${m.message} (linha ${m.line})`), [], s);
  }
});
