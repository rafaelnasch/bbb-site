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
import { termosSaudeSpec, superlativos } from '../build/lib/texto.mjs';
import { indiceDoManual, linhaDeTabela } from '../templates/parts/manual.mjs';
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

// ---------------------------------------------------------------- correções do verificador (bloco 7)

const ent = (s) => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const norm = (s) => ent(String(s)).replace(/\s+/g, ' ').trim();
// Palavra com hífen no fim da linha impressa continua colada no HTML ("tomando-" / "se").
const normHifen = (s) => norm(s).replace(/(\p{L})- (?=\p{Ll})/gu, '$1-');

test('manual: todo parágrafo, item, título e linha exibidos é recorte contínuo do texto original da página', () => {
  const h = pg('manual-usuario-instalacao.html');
  const m = ler('politicas.json').manual;
  const secoes = [...h.matchAll(/<section class="inst-pagina" id="p-(\d+)"[\s\S]*?<\/section>/g)];
  assert.ok(secoes.length >= 30, `${secoes.length} páginas`);
  let n = 0;
  const falhas = [];
  for (const [sec, num] of secoes) {
    const pgm = m.paginas.find((x) => x.pagina === Number(num));
    // Texto da página com as palavras partidas pela extração unidas (texto_grafia, conferido no PDF).
    const original = normHifen(pgm.texto_grafia ?? pgm.texto);
    const prosa = /<div class="inst-prosa"[^>]*>([\s\S]*)<\/div>/.exec(sec)[1];
    for (const [, , conteudo] of prosa.matchAll(/<(p|li|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const t = normHifen(conteudo.replace(/<[^>]+>/g, ''));
      if (!t) continue;
      n++;
      if (!original.includes(t)) falhas.push(`p. ${num}: ${t.slice(0, 120)}`);
    }
  }
  assert.ok(n > 200, `${n} blocos`);
  assert.deepEqual(falhas, []);
  // Os dois casos apontados: nenhuma frase colada de pedaços.
  const t = texto(h);
  assert.ok(!t.includes('cada cliente, fáceis de limpar'), 'p. 2');
  assert.ok(!t.includes('para que tenhamos uma Não é recomendado'), 'p. 12');
  assert.ok(!t.includes('como um filtro, reconhecido'), 'p. 38');
});

test('manual: sumário é o índice do PDF, sem fragmento nem linha de tabela; tabela nunca vira título', () => {
  const h = pg('manual-usuario-instalacao.html');
  const m = ler('politicas.json').manual;
  const indice = indiceDoManual(m.paginas.find((x) => x.pagina === 3).texto_exibido).map((e) => e.texto);
  assert.ok(indice.length >= 20);
  const nav = /<nav class="inst-sumario[^"]*"[\s\S]*?<\/nav>/.exec(h)[0];
  const itens = [...nav.matchAll(/<li><a href="#([^"]+)">[\s\S]*?<span[^>]*>([^<]+)<\/span><\/a><\/li>/g)].map((x) => ({ id: x[1], texto: ent(x[2]) }));
  assert.ok(itens.length >= 15 && itens.length <= indice.length, `${itens.length} entradas`);
  for (const x of itens) {
    assert.ok(indice.includes(x.texto), `entrada fora do índice: ${x.texto}`);
    assert.ok(new RegExp(`<h2 id="${x.id}"`).test(h), `âncora h2 ${x.id}`);
  }
  assert.ok(!itens.some((x) => /garantia/i.test(x.texto)), 'sem garantia no sumário');
  const titulos = [...h.matchAll(/<h[23] id="m\d+-[^"]*"[^>]*>([^<]+)<\/h[23]>/g)].map((x) => ent(x[1]));
  for (const t of titulos) {
    assert.ok(!linhaDeTabela(t), `linha de tabela como título: ${t}`);
    assert.ok(!/[;,]$/.test(t), `fragmento como título: ${t}`);
  }
  for (const f of ['DENTRO DA BANHEIRA;', 'QUALQUER NIVEL QUE ESTEJA ACIMA DO SOLO.', 'AQUECEDOR);', 'LEPONO 1CV 127 5,91 0,75 10', 'SENSUALE REDONDA 215,42']) {
    assert.ok(!titulos.includes(f), `título indevido: ${f}`);
  }
  assert.ok(/<tr><th scope="row">Motobomba LEPONO<\/th><td>1CV<\/td><td>127<\/td><td>5,91<\/td><td>0,75<\/td><td>10<\/td><\/tr>/.test(h), 'linha da tabela da p. 27 como linha de <table>');
});

test('manual: nivelamento de volta, superlativo do ozônio fora', () => {
  const h = texto(pg('manual-usuario-instalacao.html'));
  assert.ok(h.includes('NIVELAMENTO DA BANHEIRA NO LOCAL ONDE SERÁ INSTALADA:'));
  assert.ok(h.includes('tomando-se a superfície das bordas como referência'));
  assert.ok(!/mais seguro e eficaz|do mundo/.test(h));
  const p38 = ler('politicas.json').manual.paginas.find((x) => x.pagina === 38);
  assert.ok(p38.trechos_ocultos.some((o) => /mais seguro e eficaz/.test(o.texto)), 'registro em trechos_ocultos');
  // Detectores: uso técnico de "referência" fica; posição de mercado sai.
  assert.deepEqual(superlativos('tomando-se a superfície das bordas como referência e sempre após'), []);
  assert.deepEqual(superlativos('que tem como referência o Código de Defesa do Consumidor'), []);
  assert.ok(superlativos('tornou-se referência na fabricação de banheiras').length);
  assert.ok(superlativos('é referência em banheiras').length);
  assert.ok(superlativos('reconhecido como o mais seguro e eficaz método').length);
  assert.ok(superlativos('método de tratamento de água do mundo').length);
});

test('desistência: só frases literais inteiras, nunca cortadas', () => {
  const pol = ler('politicas.json');
  const t = pol.troca_devolucao_reembolso.texto;
  assert.ok(pol.desistencia.pontos_chave.length >= 3);
  for (const k of [pol.desistencia.literal, ...pol.desistencia.pontos_chave]) {
    assert.ok(t.includes(k), `literal: ${k.slice(0, 60)}`);
    assert.match(k, /[.;!?]$/, `frase inteira: ${k.slice(0, 60)}`);
    const depois = t.slice(t.indexOf(k) + k.length);
    assert.ok(depois === '' || /^\s/.test(depois), `termina onde a frase termina: ${k.slice(0, 60)}`);
  }
  const h = texto(pg('como-comprar.html'));
  assert.ok(h.includes('após esse prazo, as solicitações não mais serão acatadas'));
  assert.ok(h.includes('poderá ser verificado em até duas fatura subsequentes'));
});

test('FAQ: 44 itens fora da garantia, cada ausência com decisão registrada', () => {
  const faq = ler('faq.json');
  const inst = ler('institucionais.json');
  const vis = new Set(faqsVisiveis(dados()).map((f) => f.id));
  const naoGarantia = faq.filter((f) => !f.oculto_ate_decisao);
  assert.equal(naoGarantia.length, 44);
  for (const f of naoGarantia) {
    if (vis.has(f.id)) continue;
    assert.ok(inst.decisoes.some((d) => d.item.includes(f.id)), `${f.id} fora sem decisão registrada`);
  }
  for (const id of ['faq-34', 'faq-38']) assert.ok(vis.has(id), `${id} visível`);
  assert.ok(inst.decisoes.some((d) => /42 de 44/.test(d.item) && d.aprovacao_do_dono === 'pendente'));
});

test('pontes: toda URL 200 do site atual tem página ou ponte (menos /outlet); script depois do link', () => {
  const D = dados();
  const lista = listaPontes(D);
  const porOrigem = new Map(lista.map((p) => [p.origem, p]));
  const meta = ler('meta.json');
  for (const p of meta.paginas_institucionais_e_blog.filter((x) => x.status === 200)) {
    const c = p.url.replace(/^https?:\/\/www\.banheirasbombanho\.com\.br\/?/, '');
    if (!c || c === 'outlet') continue;
    const arq = arquivoDaOrigem(c);
    assert.ok(existsSync(join(DIST, arq)), `${c}: sem página nem ponte (${arq})`);
  }
  assert.equal(porOrigem.get('downloads').destino, 'manual-usuario-instalacao.html');
  assert.equal(porOrigem.get('situacao-rastreio').destino, 'rastreio.html');
  assert.equal(porOrigem.get('sucesso').destino, 'rastreio.html');
  assert.equal(porOrigem.get('sauna/por-tamanho/sauna-de-1-30-x-1-10-x-2-00.html').destino, 'sauna.html');
  const csv = readFileSync(join(paths.root, 'build', 'redirects.csv'), 'utf8');
  for (const o of ['/beneficios-cromoterapia', '/beneficios-da-hidromassagem', '/downloads', '/situacao-rastreio', '/sucesso']) assert.ok(csv.includes(`"${o}"`), o);
  // Combos com modelo no endereço vão para a coleção do modelo (nunca para a home).
  for (const p of lista.filter((x) => /^combo-/.test(x.origem))) assert.ok(['banheiras.html', 'spas.html'].includes(p.destino), `${p.origem} -> ${p.destino}`);
  const h = pg('taubate.html');
  assert.ok(h.indexOf('<script>') > h.indexOf('id="destino"'), 'script depois do link');
  assert.ok(!/<head>[\s\S]*<script>[\s\S]*<\/head>/.test(h), 'nenhum script no head');
});

test('depoimentos dos projetos: opinião assinada com nota; nenhum depoimento com saúde', () => {
  const h = pg('banheiras-instaladas.html');
  const inst = ler('institucionais.json');
  for (const d of inst.depoimentos_projetos) {
    assert.ok(texto(h).includes(norm(d.texto)), d.autor);
    assert.deepEqual(termosSaudeSpec(d.texto), []);
  }
  assert.ok(texto(h).includes('Opiniões de clientes, assinadas'));
});

// ---------------------------------------------------------------- correções do verificador (bloco 7, rodada 2)

const secaoDoManual = (h, n) => new RegExp(`<section class="inst-pagina" id="p-${n}"[\\s\\S]*?</section>`).exec(h)?.[0] || '';
const linhasDaTabela = (t) => [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/g)].map((c) => norm(c[2].replace(/<br>/g, ' ').replace(/<[^>]+>/g, ''))));

test('manual: tabelas das p. 7, 18, 27, 30 e de peso e carga são <table> reais, com as células pareadas como no PDF', () => {
  const h = pg('manual-usuario-instalacao.html');
  for (const n of [7, 18, 27, 30, 32, 33, 34, 35, 36, 37]) assert.ok(/<table\b/.test(secaoDoManual(h, n)), `p. ${n} sem <table>`);
  // p. 7: sintoma, causa e medida na mesma linha; o sintoma mesclado cobre as três primeiras causas.
  const p7 = secaoDoManual(h, 7);
  const t7 = linhasDaTabela(p7);
  assert.deepEqual(t7[0], ['Sintoma', 'Possível causa', 'Medida a tomar']);
  assert.deepEqual(t7[1], ['Não se inicia função nenhuma.', 'Falha na alimentação eléctrica.', 'Verifique se existe tensão na rede.']);
  assert.ok(/<th rowspan="3" scope="rowgroup">Não se inicia função nenhuma\.<\/th>/.test(p7));
  assert.deepEqual(t7[3], ['Há pouca água na banheira.', 'Encha a banheira até o nível do ladrão cobrindo todos os bicos.']);
  assert.deepEqual(t7[5], ['Bomba não liga', 'Conector dos painéis mal encaixados ou amassados', 'Desencaixar o plug do painel da central de comando e verificar os pinos']);
  assert.deepEqual(t7[6], ['Banheira não aquece', 'Tempo inferior ao mínimo necessário para aquecimento', 'Aguardar tempo mínimo: Spas: 1,5h Banheiras: 40min']);
  // O título e o cabeçalho vêm antes do conteúdo, e o título não sai colado em parágrafo.
  assert.ok(p7.indexOf('TABELA DE DEFEITOS') < p7.indexOf('<table'));
  assert.ok(p7.indexOf('<table') < p7.indexOf('CUIDADOS IMPORTANTES'), 'tabela acima de Cuidados importantes, como no PDF');
  const tp7 = texto(p7);
  assert.ok(!tp7.includes('Bomba não liga Banheira não aquece'));
  assert.ok(!tp7.includes('amassados Verifique se existe'));
  // p. 18: bitola e disjuntor por componente; o título inteiro; nada da tabela fora dela.
  const p18 = secaoDoManual(h, 18);
  const t18 = linhasDaTabela(p18);
  assert.deepEqual(t18[0], ['Acessórios', 'Bitola (mm²)', 'DISJUNTOR (A)', 'TIPO DISJUNTOR', 'Tensão (V)']);
  assert.deepEqual(t18[4], ['Moto bomba bifásico', '6', 'Ver tabela pág. 26', '-', '127']);
  assert.deepEqual(t18[5], ['-', '220']);
  assert.deepEqual(t18[6], ['Acionador', '6', '10', '-', '127/220']);
  assert.deepEqual(t18[9], ['Controlador 8 funções', '6', '10', '-', '127/220']);
  assert.ok(/<h[23][^>]*>DADOS TÉCNICOS PARA INSTALAÇÃO ELÉTRICA<\/h[23]>/.test(p18), 'título inteiro');
  assert.ok(!/<li>[^<]*Acionador/.test(p18) && !/<p>[^<]*Bitola/.test(p18), 'tabela fora de <p>/<li>');
  assert.ok(!/Frequência em Hz|Corrente em A com/.test(p18), 'texto sem lugar visível na página impressa fica fora');
  // p. 27 e p. 30.
  const t27 = linhasDaTabela(secaoDoManual(h, 27));
  assert.deepEqual(t27[0], ['Equipamento', 'Potência nominal', 'Tensão nominal V', 'Corrente nominal A', 'Consumo aproximado KW', 'Disjuntor recomendado A']);
  assert.deepEqual(t27[6], ['Aquecedor', '5000 W', '127', '39,37', '5', 'Ver modelo pág. 20']);
  const p30 = secaoDoManual(h, 30);
  const t30 = linhasDaTabela(p30);
  assert.deepEqual(t30[0], ['Acessórios', 'Diâmetro das tubulações (mm)']);
  assert.deepEqual(t30[2], ['Aquecedor', "40 ou 32 (Se D'aqua Storm - 40)"]);
  assert.deepEqual(t30[11], ['Jatos', 'Ar = 20']);
  assert.deepEqual(t30[12], ['Água = 32']);
  assert.ok(p30.indexOf('<table') < p30.indexOf('CUIDADOS NA MONTAGEM DO RALO'));
  // Peso e carga: modelo e valor na mesma linha.
  const t32 = linhasDaTabela(secaoDoManual(h, 32));
  assert.deepEqual(t32[0], ['Modelo', 'Carga do produto sob o piso (cheio) - Kg/m²']);
  assert.deepEqual(t32[1], ['ACQUA LINEA', '141,34']);
  assert.deepEqual(linhasDaTabela(secaoDoManual(h, 37)).at(-1), ['VITORIANA', '253,58']);
  // Toda tabela do manual tem nome acessível.
  for (const [t] of h.matchAll(/<table\b[^>]*data-campo="manual-tabela"[^>]*>/g)) assert.ok(/aria-label(ledby)?="[^"]+"/.test(t), t);
});

test('manual: sem palavra partida pela extração do PDF, e cada correção no editorial-log', () => {
  const t = texto(pg('manual-usuario-instalacao.html'));
  for (const s of ['originam -se', 'proce sso', 'abasteciment o', 'dispos itivo', 'comp onentes', 'estocá -lo', 'nivele -a', 'fio -terra', 'magneto- térmico', 'atenção ,', 'vice- versa']) assert.ok(!t.includes(s), s);
  for (const s of ['originam-se durante um mau processo', 'abastecimento', 'dispositivo DR', 'componentes energizados', 'estocá-lo', 'nivele-a', 'fio-terra', 'magneto-térmico', 'Leia com atenção, pois']) assert.ok(t.includes(s), s);
  const log = ler('editorial-log.json').itens.filter((x) => x.regra === 'palavra_partida_na_extracao');
  assert.ok(log.length >= 15);
  for (const x of log) assert.equal(x.antes.replace(/\s+/g, ''), x.depois.replace(/\s+/g, ''), 'correção só muda espaços');
  // O literal da extração continua no dado; a grafia corrigida fica ao lado.
  const p7 = ler('politicas.json').manual.paginas.find((x) => x.pagina === 7);
  assert.ok(p7.texto.includes('originam -se durante um mau proce sso') && p7.texto_grafia.includes('originam-se durante um mau processo'));
});
