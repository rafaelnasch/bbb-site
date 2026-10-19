// Bloco 4 (produto): as 292 páginas, os casos especiais e as invariantes da SPEC 9.3, 6.2, 10.2,
// 11.1, 11.2, 12 e 13.1. Renderiza numa pasta própria (os testes rodam em paralelo).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { renderizar } from '../build/render.mjs';
import { verificarDiferencaZero, diferencaZeroProduto } from '../build/lib/diferenca-zero.mjs';
import { numerosProibidosEm, mensagemCompra } from '../build/lib/wa.mjs';
import { formatBRL } from '../build/lib/money.mjs';
import { paths, SITE_URL } from '../site.config.mjs';

const DIST = join(paths.cache, 'dist-produto');
const produtos = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
const contatos = JSON.parse(readFileSync(join(paths.data, 'contatos.json'), 'utf8')).contatos;
const meta = JSON.parse(readFileSync(join(paths.data, 'meta.json'), 'utf8'));
const P = (slug) => produtos.find((p) => p.slug === slug);
const pagina = (slug) => readFileSync(join(DIST, `${slug}.html`), 'utf8');
const texto = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const jsonld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nos = (h) => jsonld(h).flatMap((o) => [o, ...(o['@graph'] || [])]);
const waTexto = (href) => decodeURIComponent(href.split('?text=')[1] || '');
const ctaCompra = (h) => (/<a[^>]*data-cta-compra[^>]*>/.exec(h) || [''])[0].match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');

const ACQUA = 'banheira-acqua-linea-completa-com-hidro-em-acrilico';
const NAPOLE = 'spa-quadrado-napole-completo-com-hidro';
const SERENA = 'spa-quadrado-serena-completo-com-hidro-em-acrilico';
const AIR = 'air-blower-borbulhamento';

before(async () => {
  await renderizar({ dist: DIST });
});

test('292 páginas de produto, no mesmo caminho do site atual, e nada de produto-outlet', () => {
  assert.equal(produtos.length, 292);
  for (const p of produtos) assert.ok(existsSync(join(DIST, `${p.slug}.html`)), `${p.slug}.html`);
  assert.ok(!existsSync(join(DIST, 'produto-outlet.html')));
});

test('13.1 diferença zero em todas as páginas de produto', () => {
  const { erros } = verificarDiferencaZero(DIST);
  assert.deepEqual(erros, []);
  // O verificador pega divergência de fato: um preço trocado no HTML tem que falhar.
  const h = pagina(ACQUA).replace(/(data-campo="preco-por">)[^<]+/, '$1R$1,00');
  assert.ok(diferencaZeroProduto(h, P(ACQUA)).some((e) => e.startsWith('preco-por')));
});

test('Acqua Línea Acrílico: 5 tamanhos, planta por tamanho, 0,79 x 1,60 sem planta, cota B e WhatsApp', () => {
  const p = P(ACQUA);
  const h = pagina(ACQUA);
  assert.equal((h.match(/name="tamanho"/g) || []).length, 5);
  const paineis = [...h.matchAll(/<div class="planta-painel" data-tam-painel="(\d)"[^>]*>([\s\S]*?)(?=<div class="planta-painel"|<\/section>)/g)];
  assert.equal(paineis.length, 5);
  const i160 = p.d_tamanhos.findIndex((t) => t.rotulo === '0,79 x 1,60 x 0,37');
  assert.match(paineis[i160][2], /Planta deste tamanho não publicada pela fábrica/);
  assert.match(paineis[i160][2], /Desenho em escala a partir das medidas do site\. Não é a planta oficial\./);
  assert.doesNotMatch(paineis[i160][2], /data-explorador/);
  assert.match(paineis[0][2], /aria-label="Cota B, 1,415 metro"/);
  assert.match(paineis[0][2], /data-campo="planta-cota" data-cota-valor="B">1,415</);
  assert.match(paineis[0][2], /Baixar a planta oficial \(PDF\)/);
  // Sem JS, o link de compra já leva a mensagem da SPEC 10.2 com o tamanho inicial.
  const venda = contatos.find((c) => c.papel === 'venda_principal');
  const esperado = mensagemCompra({ abertura: venda.prefilled_text, nome: p.nome, sku: p.sku, tamanho: p.d_tamanhos[0].rotulo, dataColeta: meta.data_coleta, somaFormatada: formatBRL(p.preco.valores_numericos.finalPrice), url: `${SITE_URL}/${ACQUA}.html` });
  const href = ctaCompra(h);
  assert.ok(href.startsWith(`https://wa.me/${venda.numero}?text=`));
  assert.equal(waTexto(href), esperado);
  assert.match(texto(h), /Soma pelos preços publicados no site em 18\/10\/2026\. O valor final é confirmado pelo consultor\./);
});

test('Spa Napole: as duas medidas com nota e mensagem com o rótulo da opção', () => {
  const p = P(NAPOLE);
  assert.equal(p.d_medida_confirmada, false);
  const t = texto(pagina(NAPOLE));
  assert.match(t, /A ficha informa 1,96m x 1,96m x 0,85m e a opção de tamanho informa 1,97 x 1,97 x 0,86 ?\. Confirme com o consultor\./);
  assert.match(t, /Medida a confirmar/);
  const msg = waTexto(ctaCompra(pagina(NAPOLE)));
  assert.match(msg, /Tamanho: 1,97 x 1,97 x 0,86\n/);
  assert.doesNotMatch(msg, /1,96m/);
});

test('Spa Serena: sem foto, sem planta (nem a do Imola), texto sob consulta e WhatsApp', () => {
  const h = pagina(SERENA);
  assert.match(texto(h), /Foto e planta deste modelo sob consulta/);
  assert.doesNotMatch(h, /media\/p\/spa-quadrado-serena/);
  assert.doesNotMatch(h, /data-explorador/);
  assert.doesNotMatch(h, /imola/i);
  assert.ok(ctaCompra(h)?.startsWith('https://wa.me/'));
});

test('Air Blower: Esgotado, OutOfStock e "Perguntar disponibilidade" com mensagem própria', () => {
  const h = pagina(AIR);
  const p = P(AIR);
  assert.match(texto(h), /Esgotado/);
  const prod = nos(h).find((n) => n['@type'] === 'Product');
  assert.equal(prod.offers.availability, 'https://schema.org/OutOfStock');
  const a = /<a[^>]*data-wa-contexto="esgotado"[^>]*>[\s\S]*?<\/a>/.exec(h)[0];
  assert.match(a, /Perguntar disponibilidade/);
  assert.equal(waTexto(a.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&')), `Olá! Quero saber se a ${p.nome} volta a ter estoque.\n${SITE_URL}/${AIR}.html`);
  // Os preços com que ele aparece como opção, cada um onde está publicado.
  assert.match(texto(h), /R\$2\.035,20 \(em 54 modelos\) e R\$1\.920,00 \(em 1 modelo\)/);
  // Nos spas, a opção traz a nota do preço avulso.
  assert.match(texto(pagina(NAPOLE)), /Avulso, este item está publicado por R\$1\.800,00 e aparece como esgotado/);
});

test('sauna com vista frontal pela altura; acessório sem planta e sem escala; versão -1 com foto de 1080', () => {
  const sauna = pagina('sauna-compacta-bbb');
  assert.match(sauna, /data-escala[^>]*data-altura="2\.1"[^>]*data-vista="frontal"/);
  const jato = pagina('jato');
  assert.doesNotMatch(jato, /id="planta"|id="cabe"|data-explorador|data-escala/);
  const v1 = produtos.filter((p) => p.d_versao_sufixo_1);
  assert.equal(v1.length, 5);
  const capri = pagina('banheira-dupla-capri-completa-com-hidro-em-acrilico-1');
  assert.match(capri, /-1-1080\.avif 1080w/);
});

test('conflito nome x ficha: a etiqueta omite o campo e a ficha mostra as duas versões', () => {
  const h = pagina('banheira-dupla-paris-com-hidro');
  const eti = /<ul class="etiqueta prod-eti"[\s\S]*?<\/ul>/.exec(h)[0];
  assert.doesNotMatch(eti, /data-ficha="Lugares"/);
  assert.match(texto(h), /O nome do modelo diz Duplo\/Dupla e a ficha diz Individual\. Confirme com o consultor\./);
});

test('Monte a sua: preços reais, "Nenhum" quando a fonte exibe, AggregateOffer quando o tamanho muda o preço', () => {
  const paris = P('banheira-dupla-paris-com-hidro');
  const h = pagina(paris.slug);
  const volt = paris.opcoes_personalizaveis.find((o) => o.opcao_vazia_exibida);
  if (volt) assert.match(h, new RegExp(`value=""[^>]*checked[^>]*data-preco="0"[^>]*data-rotulo="${volt.opcao_vazia_exibida.rotulo_exibido}"`));
  const acqua = pagina(ACQUA);
  for (const o of P(ACQUA).opcoes_personalizaveis.filter((x) => !/^tamanho/i.test(x.titulo))) {
    for (const v of o.valores) assert.match(acqua, new RegExp(`data-preco="${v.preco_adicional || 0}" data-rotulo="${v.rotulo_exibido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
  const paraty = pagina('banheira-contemporanea-paraty-sem-hidro');
  const prod = nos(paraty).find((n) => n['@type'] === 'Product');
  assert.equal(prod.offers['@type'], 'AggregateOffer');
  assert.equal(prod.offers.lowPrice, P('banheira-contemporanea-paraty-sem-hidro').d_preco_min);
  assert.equal(prod.offers.highPrice, P('banheira-contemporanea-paraty-sem-hidro').d_preco_max);
});

test('cabeça e SEO de produto: título até 60, descrição de 140 a 160, Product, Breadcrumb e ProductGroup', () => {
  for (const p of produtos) {
    const h = pagina(p.slug);
    const t = /<title>([^<]+)<\/title>/.exec(h)[1].replace(/&amp;/g, '&');
    assert.ok(t.length <= 60 && t.endsWith(' | Banheiras Bom Banho'), `${p.slug}: título "${t}"`);
    const d = /<meta name="description" content="([^"]+)">/.exec(h)[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    assert.ok(d.length >= 140 && d.length <= 160, `${p.slug}: descrição com ${d.length}`);
    const n = nos(h);
    const prod = n.find((x) => x['@type'] === 'Product');
    assert.equal(prod.name, p.nome);
    assert.equal(prod.sku, p.sku);
    assert.equal(prod.offers.priceCurrency, 'BRL');
    assert.equal(prod.offers.price, p.preco.valores_numericos.finalPrice);
    assert.ok(!('aggregateRating' in prod) && !('priceValidUntil' in prod.offers));
    assert.ok(n.some((x) => x['@type'] === 'BreadcrumbList'));
    if (p.d_familia) assert.ok(n.some((x) => x['@type'] === 'ProductGroup'), `${p.slug} sem ProductGroup`);
  }
});

test('regras da SPEC 0 no HTML de produto: sem (VERIFICAR), sem lista negra, sem termo de saúde, sem travessão em título', () => {
  for (const p of produtos) {
    const h = pagina(p.slug);
    assert.doesNotMatch(h, /\(VERIFICAR\)/, p.slug);
    assert.deepEqual(numerosProibidosEm(h), [], p.slug);
    assert.doesNotMatch(texto(h).toLowerCase(), /(^|[^\p{L}])(cura|trata|tratamento|diabetes|celulite|varizes|circulação|emagrec|terapêutic|medicinal)/u, p.slug);
    for (const m of h.matchAll(/<(h[1-3]|title)\b[^>]*>([\s\S]*?)<\/\1>/g)) assert.ok(!m[2].includes('—'), p.slug);
  }
});

test('orçamentos da SPEC 12: HTML de produto até 40 KB gzip e JS do produto até 30 KB gzip', () => {
  let maior = 0;
  for (const p of produtos) maior = Math.max(maior, gzipSync(readFileSync(join(DIST, `${p.slug}.html`)), { level: 9 }).length);
  assert.ok(maior <= 40 * 1024, `maior HTML de produto: ${maior} B gzip`);
  // O que a página de produto carrega de fato: o núcleo e o pacote do produto (galeria, monte, seletor,
  // planta e escala num arquivo só).
  const h = pagina(ACQUA);
  const js = [...h.matchAll(/<script type="module" src="[^"]*\/assets\/js\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(js.map((f) => f.split('.')[0]).sort(), ['nucleo', 'produto']);
  const soma = js.reduce((s, f) => s + gzipSync(readFileSync(join(DIST, 'assets', 'js', f)), { level: 9 }).length, 0);
  assert.ok(soma <= 30 * 1024, `JS do produto: ${soma} B gzip`);
});

test('planta: nunca dizer que a fábrica não publicou quando a página tem PDF de planta (com medida divergente)', () => {
  const comPdf = produtos.filter((p) => (p.d_plantas_sem_tamanho || []).some((x) => x.pdf_path && existsSync(join(paths.public, x.pdf_path))));
  assert.ok(comPdf.length >= 13, `${comPdf.length} produtos com PDF sem tamanho`);
  for (const p of comPdf) {
    const t = texto(pagina(p.slug));
    assert.doesNotMatch(t, /não publicou|não publicada pela fábrica|Sem planta publicada|não publica a planta/, p.slug);
    assert.match(t, /Outras plantas publicadas na página deste modelo/, p.slug);
    assert.match(t, /não corresponde a nenhum tamanho da lista de opções/, p.slug);
  }
  // Napole: a planta publicada (1,97 x 1,97 x 0,85) aparece para conferir, com a nota.
  const nap = pagina(NAPOLE);
  assert.match(texto(nap), /publica planta em PDF, mas com medida diferente das opções de tamanho/);
  assert.match(nap, /href="[^"]*plantas\/spas\/[^"]*\.pdf" download/);
});

test('planta: uma frase só por caso, sem falar em tamanho onde não há escolha', () => {
  for (const p of produtos.filter((q) => q.d_tipo !== 'acessorio' && q.d_tamanhos?.length)) {
    const t = texto(pagina(p.slug));
    const n = (t.match(/não publica a planta deste modelo|Planta deste tamanho não publicada pela fábrica|Nenhuma planta publicada na página traz a medida deste tamanho/g) || []).length;
    if (/não publica a planta deste modelo/.test(t)) assert.equal(n, 1, `${p.slug}: frases repetidas`);
  }
  const serena = texto(pagina(SERENA));
  assert.match(serena, /O site da fábrica não publica a planta deste modelo/);
  assert.doesNotMatch(serena, /Planta deste tamanho/);
});

test('topo do produto: uma camada de arte só (poster estático ou planta ou contorno), vídeo sem poster por cima', () => {
  for (const p of produtos) {
    const h = pagina(p.slug);
    const topo = /<section class="sala prod-topo[\s\S]*?<\/section>/.exec(h)[0];
    const imgs = (topo.match(/<img /g) || []).length;
    const svgs = (topo.match(/<svg /g) || []).length - (topo.match(/class="ic/g) || []).length;
    const tipo = /prod-topo--(filme|planta|desenho|sem-arte)/.exec(topo)[1];
    if (tipo === 'filme') {
      assert.equal(imgs, 1, p.slug);
      assert.match(topo, /<video class="prod-topo__filme"/);
      assert.doesNotMatch(/<video[^>]*>/.exec(topo)[0], /poster=/, `${p.slug}: o vídeo não pode ter poster próprio`);
    } else if (tipo === 'planta') assert.equal(imgs, 1, p.slug);
    else if (tipo === 'desenho') assert.match(topo, /Não é a planta oficial\./, p.slug);
    else assert.equal(imgs, 0, p.slug);
    assert.ok(imgs + Math.max(svgs, 0) <= 2, p.slug);
  }
});

test('WhatsApp sem JS: os 8 consultores já levam a mensagem da peça; na esgotada, a de estoque', () => {
  const consult = contatos.filter((c) => /^consultor_/.test(c.papel));
  const venda = contatos.find((c) => c.papel === 'venda_principal');
  const hA = pagina(ACQUA);
  const msgA = waTexto(ctaCompra(hA));
  for (const c of consult) {
    const links = [...hA.matchAll(new RegExp(`<a[^>]*data-wa-papel="${c.papel}"[^>]*>`, 'g'))].map((m) => m[0]);
    assert.ok(links.length >= 2, `${c.papel} no cabeçalho e no rodapé`);
    for (const a of links) assert.equal(waTexto(a.match(/href="([^"]+)"/)[1].replace(/&#39;/g, "'")), msgA, c.papel);
  }
  assert.match(msgA, new RegExp(`^${venda.prefilled_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\\nModelo: `));
  const p = P(AIR);
  const hB = pagina(AIR);
  for (const c of consult) {
    for (const [a] of hB.matchAll(new RegExp(`<a[^>]*data-wa-papel="${c.papel}"[^>]*>`, 'g'))) {
      assert.equal(waTexto(a.match(/href="([^"]+)"/)[1].replace(/&#39;/g, "'")), `Olá! Quero saber se a ${p.nome} volta a ter estoque.\n${SITE_URL}/${AIR}.html`);
    }
  }
});

test('JSON-LD do produto: propriedades com o rótulo exibido e marca apontando para a Organization', () => {
  const h = pagina(ACQUA);
  const prod = nos(h).find((n) => n['@type'] === 'Product');
  const nomes = prod.additionalProperty.map((x) => x.name);
  assert.ok(nomes.includes('Configuração'));
  assert.ok(!nomes.includes('Configuracao'));
  assert.equal(prod.brand['@id'], `${SITE_URL}/#org`);
  const grupo = nos(h).find((n) => n['@type'] === 'ProductGroup');
  if (grupo) assert.equal(grupo.brand['@id'], `${SITE_URL}/#org`);
});
