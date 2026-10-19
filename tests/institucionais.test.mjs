// Bloco 7 (SPEC 4, 4.1, 9.6, 11.2, 14 e 15): institucionais, lojas, FAQ, manual, consultores, pontes e 404.
// Renderiza numa pasta própria (os testes rodam em paralelo).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderizar } from '../build/render.mjs';
import { gerarSeo } from '../build/seo.mjs';
import { paths, BASE_PATH, SITE_URL } from '../site.config.mjs';
import { faqsVisiveis, FORA } from '../templates/faq.mjs';
import { listaPontes, arquivoDaOrigem } from '../templates/ponte.mjs';
import { decodificarCfemail, trocarEmails } from '../build/institucional-dados.mjs';
import { dados } from '../build/lib/dados.mjs';
import { termosSaudeSpec } from '../build/lib/texto.mjs';
import { numerosProibidosEm } from '../build/lib/wa.mjs';

const DIST = join(paths.cache, 'dist-institucionais');
const ler = (n) => JSON.parse(readFileSync(join(paths.data, n), 'utf8'));
const pg = (n) => readFileSync(join(DIST, n), 'utf8');
const texto = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const wa = (h) => [...h.matchAll(/https:\/\/wa\.me\/(\d+)/g)].map((m) => m[1]);
const lojas = ler('lojas.json');
const empresa = ler('empresa.json');

const INSTITUCIONAIS = ['lojas/sobre-nos.html', 'lojas/loja-fisica.html', 'como-comprar.html', 'prazo-de-entrega.html', 'politica-devolucao-reembolso.html',
  'politica-de-privacidade.html', 'termos-de-uso.html', 'seguranca.html', 'inmetro.html', 'politica-da-qualidade.html', 'instaladores.html',
  'representantes-credenciados.html', 'seja-revendedor.html', 'vendas-corporativas.html', 'manual-usuario-instalacao.html', 'rastreio.html',
  'localizacao.html', 'loja-fabrica-de-banheiras.html', 'banheiras-instaladas.html', 'contacts.html', 'tutoriais.html', 'mapa-do-site.html'];

before(async () => {
  await renderizar({ dist: DIST });
  gerarSeo(DIST);
});

test('as 22 institucionais da SPEC 4 existem, com um H1, sem CEP da fábrica e sem marketing', () => {
  const ceps = ['37584-000', '37557-000', '37584000', '37557000'];
  const mkt = (empresa.emails || []).length ? 'marketing@' : 'marketing@';
  for (const n of [...INSTITUCIONAIS, 'lojas/loja-showrooms.html', 'perguntas-frequentes.html', 'consultores.html', '404.html']) {
    assert.ok(existsSync(join(DIST, n)), n);
    const h = pg(n);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `${n}: H1`);
    for (const c of ceps) assert.ok(!h.includes(c), `${n}: CEP ${c}`);
    assert.ok(!h.includes(mkt), `${n}: e-mail de marketing`);
    assert.deepEqual(numerosProibidosEm(h), [], `${n}: lista negra`);
    assert.deepEqual(termosSaudeSpec(texto(h)), [], `${n}: termo de saúde`);
    assert.ok(!/\[email(?:&#160;| | )protected\]/.test(h), `${n}: e-mail protegido sem decodificar`);
    assert.ok(!/\(VERIFICAR\)|Randora|ISO 9001|a maior (loja|fábrica)/i.test(texto(h)), `${n}: termo fora das regras`);
  }
});

test('e-mail protegido do Cloudflare: decodificação e troca na ordem', () => {
  // "sac@x.y" com a chave 0x12
  const k = 0x12;
  const hex = k.toString(16).padStart(2, '0') + [...'sac@x.y'].map((c) => (c.charCodeAt(0) ^ k).toString(16).padStart(2, '0')).join('');
  assert.equal(decodificarCfemail(hex), 'sac@x.y');
  const r = trocarEmails('via e-mail\n[email protected]\n.\nOutra linha [email protected] aqui', ['a@b.c', 'd@e.f']);
  assert.equal(r.texto, 'via e-mail a@b.c.\nOutra linha d@e.f aqui');
  assert.throws(() => trocarEmails('[email protected]', []));
  const inst = ler('institucionais.json');
  assert.deepEqual(inst.paginas['politica-de-privacidade'].emails_decodificados, ['contatolgpd@banheirasbombanho.com.br']);
  assert.ok(pg('politica-devolucao-reembolso.html').includes('href="mailto:sac@banheirasbombanho.com.br"'));
});

test('lojas: 9 cartões com âncora, endereço e atendimento literais; Taubaté e Goiânia sem wa.me próprio; Caraguatatuba pela busca do endereço', () => {
  const h = pg('lojas/loja-showrooms.html');
  assert.equal(lojas.length, 9);
  const grade = /<ol class="lojas__grade"[\s\S]*?<\/ol>\s*<p class="inst-fonte"/.exec(h)[0];
  const cartoes = grade.split(/(?=<li class="loja[ "])/).slice(1).map((c) => [c, /id="([^"]+)"/.exec(c)[1]]);
  assert.equal(cartoes.length, 9);
  for (const l of lojas) {
    const c = cartoes.find((m) => m[1] === l.ancora)?.[0];
    assert.ok(c, `${l.cidade}: cartão`);
    assert.ok(texto(c).includes(l.endereco_exibido), `${l.cidade}: endereço literal`);
    assert.ok(texto(c).includes(l.atendimento_literal), `${l.cidade}: atendimento literal`);
    assert.ok(c.includes(`href="${l.mapa.replace(/&/g, '&amp;')}"`), `${l.cidade}: mapa`);
    if (l.link_ativo) assert.ok(wa(c).includes(l.whatsapp), `${l.cidade}: WhatsApp da loja`);
    else {
      assert.ok(!wa(c).includes(l.whatsapp), `${l.cidade}: sem wa.me próprio`);
      assert.ok(wa(c).includes('5535992192256'), `${l.cidade}: botão de ajuda`);
    }
  }
  const car = lojas.find((l) => l.ancora === 'caraguatatuba');
  assert.ok(car.mapa.startsWith('https://www.google.com/maps/search/?api=1&query='));
  // Fábrica sem CEP; Store x9 sem openingHours e telefone só com link ativo.
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const stores = ld.flatMap((o) => o['@graph'] || [o]).filter((n) => n['@type'] === 'Store');
  assert.equal(stores.length, 9);
  for (const s of stores) {
    assert.ok(!('openingHours' in s) && !('openingHoursSpecification' in s));
    const l = lojas.find((x) => s.name === x.nome);
    assert.equal(Boolean(s.telephone), Boolean(l.link_ativo), `${l.cidade}: telephone`);
  }
});

test('consultores: os 8 na ordem do rodapé, rotulados Consultor 1 a 8, com o número formatado', () => {
  const h = pg('consultores.html');
  const D = dados();
  const cons = D.consultores();
  assert.equal(cons.length, 8);
  const ordem = [...h.matchAll(/class="cons__cartao" href="https:\/\/wa\.me\/(\d+)/g)].map((m) => m[1]);
  assert.deepEqual(ordem, cons.map((c) => c.numero));
  cons.forEach((c, i) => assert.ok(texto(h).includes(`Consultor ${i + 1} ${c.display}`), `consultor ${i + 1}`));
});

test('FAQ: só respostas literais visíveis, sem garantia, agrupadas; FAQPage só com publicadas da página', () => {
  const h = pg('perguntas-frequentes.html');
  const faq = ler('faq.json');
  const vis = faqsVisiveis(dados());
  const ids = [...h.matchAll(/<details class="faq-item" id="(faq-\d+)"/g)].map((m) => m[1]);
  assert.deepEqual([...ids].sort(), vis.map((f) => f.id).sort());
  for (const f of faq) {
    if (f.oculto_ate_decisao || f.exibir === false || FORA.includes(f.id)) assert.ok(!ids.includes(f.id), `${f.id} fora`);
  }
  assert.ok(!/garantia/i.test(texto(h).replace(/Garantia: consulte as condições do seu modelo com o consultor\./, '')), 'sem prazo de garantia');
  for (const f of vis) assert.ok(texto(h).includes(f.resposta_exibida.replace(/\s+/g, ' ').trim().slice(0, 60)), `${f.id}: resposta literal`);
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const fp = ld.flatMap((o) => o['@graph'] || [o]).find((n) => n['@type'] === 'FAQPage');
  assert.equal(fp.mainEntity.length, vis.filter((f) => f.tipo === 'publicada').length);
  for (const q of fp.mainEntity) assert.ok(vis.some((f) => f.tipo === 'publicada' && f.resposta_exibida.trim() === q.acceptedAnswer.text));
});

test('prazo de entrega: tabela HTML real com os prazos literais', () => {
  const h = pg('prazo-de-entrega.html');
  const tab = ler('politicas.json').prazo_de_entrega.tabela;
  const tds = [...h.matchAll(/<td data-campo="prazo-entrega">([^<]+)<\/td>/g)].map((m) => m[1]);
  assert.deepEqual(tds, tab.flatMap((g) => g.linhas.map((l) => l.prazo)));
  assert.equal((h.match(/<table class="inst-tab num" data-prazo>/g) || []).length, tab.length);
});

test('INMETRO: os dois organismos citados pela fonte aparecem com nota, nenhum escolhido', () => {
  const t = texto(pg('inmetro.html'));
  const c = empresa.inmetro.organismo_certificador_conflito;
  assert.ok(t.includes(c.pagina_inmetro) && t.includes(c.rodape));
  assert.ok(t.includes(empresa.inmetro.certificado));
});

test('manual: texto em HTML com sumário e âncoras, PDF original publicado, sem as páginas de garantia', () => {
  const h = pg('manual-usuario-instalacao.html');
  const m = ler('politicas.json').manual;
  assert.ok(existsSync(join(DIST, m.pdf_path)), 'PDF publicado');
  assert.ok(h.includes(`href="${BASE_PATH}/${m.pdf_path}"`));
  const ancoras = [...h.matchAll(/<nav class="inst-sumario[^"]*"[\s\S]*?<\/nav>/g)][0][0].match(/href="#([^"]+)"/g).map((x) => x.slice(7, -1));
  assert.ok(ancoras.length >= 10);
  for (const a of ancoras) assert.ok(h.includes(`id="${a}"`), `âncora ${a}`);
  for (const p of m.paginas.filter((x) => x.oculto_ate_decisao)) assert.ok(!h.includes(`id="p-${p.pagina}"`), `página ${p.pagina} oculta`);
});

test('pontes: lista dos dados, destino existente, noindex, canonical absoluto, refresh 0 e fora do sitemap', () => {
  const D = dados();
  const lista = listaPontes(D);
  assert.ok(lista.length >= 35, `${lista.length} pontes`);
  const porOrigem = new Map(lista.map((p) => [p.origem, p]));
  assert.equal(porOrigem.get('taubate').destino, 'lojas/loja-showrooms.html#taubate');
  assert.equal(porOrigem.get('catalog/product/view/id/6').destino, 'aquecedor-digital-bbb.html');
  assert.equal(porOrigem.get('iso-9001-2015').destino, 'inmetro.html');
  assert.equal(porOrigem.get('banheiras-de-hidromassagem.html').destino, 'banheiras.html');
  assert.equal(arquivoDaOrigem('catalog/category/view/id/130'), 'catalog/category/view/id/130/index.html');
  assert.ok(lista.filter((p) => p.origem.startsWith('combo')).length >= 20, 'combos');
  const sitemap = existsSync(join(DIST, 'sitemap.xml')) ? pg('sitemap.xml') : '';
  for (const p of lista) {
    const h = pg(p.saida);
    assert.match(h, /<meta name="robots" content="noindex,(no)?follow">/, p.saida);
    assert.match(h, /<meta http-equiv="refresh" content="0;url=[^"]+">/, p.saida);
    const can = /<link rel="canonical" href="([^"]+)">/.exec(h)[1];
    assert.ok(can.startsWith(`${SITE_URL}/`), `${p.saida}: canonical`);
    assert.ok(!sitemap.includes(`${SITE_URL}/${p.saida}`), `${p.saida}: fora do sitemap`);
    if (!/^https?:/.test(p.destino)) assert.ok(existsSync(join(DIST, p.destino.replace(/#.*$/, '') || 'index.html')), `${p.saida} -> ${p.destino}`);
  }
  assert.ok(existsSync(join(paths.root, 'build', 'redirects.csv')));
});

test('404: busca, escolhedor e ajuda; fora do índice', () => {
  const h = pg('404.html');
  assert.ok(h.includes(`data-busca-404="${BASE_PATH}/busca.html"`));
  assert.ok(h.includes(`href="${BASE_PATH}/escolher.html"`));
  assert.ok(wa(h).includes('5535992192256'));
  assert.match(h, /<meta name="robots" content="noindex,/);
});
