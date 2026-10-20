// Arquivos de rastreio, GEO e AEO sobre dist/ (SPEC 11.3 e 11.4), depois do render:
//   sitemap.xml (índice) + sitemap-produtos.xml (com image:image), sitemap-colecoes.xml,
//   sitemap-paginas.xml e sitemap-plantas.xml (PDFs oficiais e manual);
//   robots.txt conforme INDEXAR; llms.txt; llms-full.txt; dados/catalogo.json (dados abertos).
//
// Decisão do dono do projeto (sobrepõe a SPEC 1.1): a prévia sai com INDEXAR=false. Os sitemaps, o
// llms e os dados abertos são gerados completos do mesmo jeito (com as páginas que seriam indexáveis),
// para a virada ser só trocar a variável; o que muda com INDEXAR=false é o robots.txt ("Disallow: /",
// sem a linha Sitemap) e o meta robots das páginas (noindex,nofollow, aplicado no layout).
//
// O que é indexável vem do registro do render (.cache/paginas.json: robots pretendido de cada página e
// canonical), porque com INDEXAR=false o HTML sai forçado em noindex. Só entra no sitemap página com
// robots pretendido "index", canonical igual ao próprio endereço e sem refresh (pontes ficam fora).
//
// Nenhum dado é digitado aqui: tudo sai de data/ e do HTML gerado. Regras da SPEC 0 valem igual:
// sem garantia, sem CEP, sem superlativo, conflito da fonte mostrado com as duas versões.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { paths, SITE_URL, BASE_PATH, INDEXAR, DATA_COLETA } from '../site.config.mjs';
import { abs } from './lib/url.mjs';
import { dados } from './lib/dados.mjs';
import { cidadeDaFabrica } from './lib/jsonld.mjs';
import { NOME_TIPO, PLURAL_TIPO, RAIZ_TIPO, CATEGORIAS_PONTE, rotuloCategoria, notaPrecosComoOpcaoTexto, avisoAvulsoSuspensoTexto, avulsoSuspenso } from './lib/catalogo.mjs';
import { perguntaLegivel } from '../templates/parts/faq-bloco.mjs';
import { faqsVisiveis } from '../templates/faq.mjs';
import { rotuloFicha } from '../templates/parts/ficha.mjs';

export const SITEMAPS = ['sitemap-produtos.xml', 'sitemap-colecoes.xml', 'sitemap-paginas.xml', 'sitemap-plantas.xml'];

/** Robôs com bloco próprio no robots.txt (SPEC 11.3). Cada bloco repete as regras, porque um robô que
 *  tem bloco com o próprio nome ignora o bloco "*". */
export const ROBOS = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot', 'DuckDuckBot'];

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** URL absoluta com cada segmento do caminho codificado (espaços, colchetes e acentos dos PDFs e slugs). */
export function urlCodificada(u) {
  if (!u.startsWith(`${SITE_URL}/`)) return encodeURI(u);
  const resto = u.slice(SITE_URL.length + 1);
  const [caminho, frag] = resto.split('#');
  const cod = caminho.split('/').map((s) => encodeURIComponent(decodeURIComponentSeguro(s))).join('/');
  return `${SITE_URL}/${cod}${frag != null ? `#${frag}` : ''}`;
}
function decodeURIComponentSeguro(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function arquivos(dir, ext) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...arquivos(p, ext));
    else if (n.toLowerCase().endsWith(ext)) out.push(p);
  }
  return out;
}

function nosJsonLd(h) {
  const out = [];
  for (const [, j] of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const o = JSON.parse(j);
      out.push(...(o['@graph'] || [o]));
    } catch { /* o validate.mjs reprova JSON-LD inválido */ }
  }
  return out;
}

function hojeISO() {
  return (process.env.BUILD_DATE || new Date().toISOString()).slice(0, 10);
}

/**
 * Arquivo do registro do render para uma pasta de saída: .cache/paginas.json para dist/; para outra
 * pasta (testes renderizam em paralelo em .cache/dist-*), um arquivo irmão "<pasta>.paginas.json".
 */
export function caminhoDoRegistro(dist = paths.dist) {
  return resolve(dist) === resolve(paths.dist) ? join(paths.cache, 'paginas.json') : `${resolve(dist)}.paginas.json`;
}

/** Lê o registro do render; sem ele, o seo não sabe o que é indexável e falha (rode o render antes). */
export function registro(dist = paths.dist) {
  const f = caminhoDoRegistro(dist);
  if (!existsSync(f)) throw new Error(`seo: ${relative(paths.root, f)} ausente; rode node build/render.mjs antes`);
  return JSON.parse(readFileSync(f, 'utf8'));
}

/** Páginas que entram no sitemap: robots pretendido index, canonical próprio, arquivo existente sem refresh. */
export function indexaveis(regs, dist = paths.dist) {
  return regs.filter((r) => {
    if (/noindex/i.test(r.robots)) return false;
    if (r.canonical !== abs(r.caminho)) return false;
    if (/^_/.test(r.saida)) return false;
    const f = join(dist, r.saida);
    if (!existsSync(f)) return false;
    return !/<meta http-equiv="refresh"/i.test(readFileSync(f, 'utf8'));
  });
}

function urlset(entradas, { imagens = false } = {}) {
  const ns = imagens ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : '';
  const corpo = entradas.map((e) => {
    const img = (e.imagens || []).map((i) => `\n    <image:image><image:loc>${xml(urlCodificada(i))}</image:loc></image:image>`).join('');
    return `  <url>\n    <loc>${xml(urlCodificada(e.loc))}</loc>\n    <lastmod>${e.lastmod}</lastmod>${img}\n  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>\n${corpo}\n</urlset>\n`;
}

/** robots.txt (SPEC 11.3). O parâmetro existe para o teste conferir os dois modos sem trocar o ambiente. */
export function robotsTxt(indexar = INDEXAR) {
  if (!indexar) {
    return [
      '# Prévia do novo site da Banheiras Bom Banho: fora dos buscadores até a virada de domínio.',
      '# Com INDEXAR=true este arquivo libera os robôs e aponta o sitemap.',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }
  const regras = ['Allow: /', `Disallow: ${BASE_PATH}/busca.html`, `Disallow: ${BASE_PATH}/comparar.html`, `Disallow: ${BASE_PATH}/*?*`];
  const blocos = ['*', ...ROBOS].map((ua) => [`User-agent: ${ua}`, ...regras].join('\n'));
  return `${blocos.join('\n\n')}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

// ---------------------------------------------------------------------------------------------
// Catálogo em texto e dados abertos (SPEC 11.4)

function precoTexto(p) {
  const v = p.preco?.valores_numericos?.finalPrice;
  if (!v || p.preco?.sob_consulta) return 'Preço sob consulta.';
  return `${p.preco.por}${p.preco.de ? ` (de ${p.preco.de})` : ''}`;
}

/** Valor da ficha com o conflito nome × ficha mostrado com as duas versões (SPEC 0.3). */
function fichaComConflito(p) {
  const e = p.especificacoes || {};
  const conf = new Map((p.d_conflito_nome_ficha || []).map((c) => [c.campo, c]));
  return Object.entries(e).map(([k, v]) => {
    const c = conf.get(k);
    return { rotulo: rotuloFicha(k), valor: v, nota: c ? `o nome do modelo diz ${c.nome_diz} e a ficha diz ${c.ficha_diz}; confirme com o consultor` : null };
  });
}

function tamanhosDe(p) {
  const fmt = (n) => `R$${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (p.d_tamanhos || []).map((t) => {
    const rot = t.rotulo ?? t.rotulo_ficha ?? '';
    const ficha = t.ficha ? ['Comprimento', 'Largura', 'Profundidade', 'Altura'].filter((k) => t.ficha[k]).map((k) => t.ficha[k]).join(' x ') : null;
    return {
      rotulo: rot,
      preco_adicional: t.origem === 'opcao' && t.preco_adicional ? t.preco_adicional : 0,
      texto: `${rot}${t.origem === 'opcao' && t.preco_adicional ? ` (+ ${fmt(t.preco_adicional)})` : ''}${ficha && p.d_medida_confirmada === false ? ` [a ficha informa ${ficha} e a opção de tamanho informa ${rot}; confirme com o consultor]` : ''}`,
    };
  }).filter((t) => t.rotulo);
}

function linhasProduto(p, imagens, produtos = [], politicas = null) {
  const L = [];
  L.push(`### ${p.nome}`);
  L.push('');
  L.push(`- Nº de catálogo (SKU): ${p.sku}`);
  L.push(`- Página: ${urlCodificada(abs(`${p.slug}.html`))}`);
  L.push(`- Tipo: ${NOME_TIPO[p.d_tipo] || p.d_tipo}`);
  for (const f of fichaComConflito(p)) L.push(`- ${f.rotulo}: ${f.valor}${f.nota ? ` (${f.nota})` : ''}`);
  const tams = tamanhosDe(p);
  if (tams.length) L.push(`- Tamanhos publicados (${tams.length}): ${tams.map((t) => t.texto).join('; ')}`);
  const itens = p.d_itens_de_serie_exibidos || [];
  if (itens.length) L.push(`- Itens de série: ${itens.join('; ')}`);
  // Itens avulsos suspensos (SPEC 15): as duas versões da fonte lado a lado, como na coluna de decisão.
  const aviso = avisoAvulsoSuspensoTexto(p, politicas);
  L.push(aviso ? `- Disponibilidade: ${aviso}` : `- Disponibilidade: ${p.disponibilidade}`);
  L.push(`- Preço publicado em ${DATA_COLETA}: ${precoTexto(p)}. O valor final é confirmado pelo consultor.`);
  const notaOpcao = notaPrecosComoOpcaoTexto(p, produtos);
  if (notaOpcao) L.push(`- Preço como opcional: ${notaOpcao}`);
  const pdfs = (p.d_planta || []).filter((x) => x.pdf_path).map((x) => `${x.rotulo}: ${urlCodificada(abs(x.pdf_path))}`);
  if (pdfs.length) L.push(`- Planta oficial (PDF): ${pdfs.join('; ')}`);
  if (imagens.length) L.push(`- Fotos: ${imagens.length} (imagens ilustrativas)`);
  L.push(`- Fonte: ${urlCodificada(decodeURIComponentSeguro(p.fonte || p.url))} (coletado em ${DATA_COLETA})`);
  L.push('');
  return L;
}

function faqPublicada(D) {
  return faqsVisiveis(D).filter((f) => f.tipo === 'publicada' && !/garantia/i.test(`${f.pergunta} ${f.tema} ${f.resposta_exibida}`));
}

function contatosPorFinalidade(D) {
  const L = [];
  const linha = (papel, rotulo) => {
    let c;
    try { c = D.contato(papel); } catch { return; }
    if (c.status !== 'ativo' || !c.link_ativo) return;
    L.push(`- ${rotulo}: ${c.display} (https://wa.me/${c.numero})`);
  };
  linha('venda_principal', 'Comprar (vendas)');
  for (const c of D.consultores()) linha(c.papel, `Consultor ${c.papel.replace('consultor_', '')}`);
  linha('ajuda', 'Ajuda para escolher ou dúvidas');
  linha('rastreio', 'Rastrear pedido');
  linha('sac', 'SAC (pós-venda)');
  return L;
}

function cabecalhoEmpresa(D) {
  const E = D.empresa;
  const local = cidadeDaFabrica(E.endereco_fabrica);
  const L = [];
  L.push(`# ${E.nome}`);
  L.push('');
  L.push(`> ${E.nome}${E.alternate_name ? ` (${E.alternate_name})` : ''} fabrica banheiras, spas e ofurôs de hidromassagem${local ? ` em ${local.cidade}, ${local.uf}` : ''} e vende direto da fábrica, com atendimento pelo WhatsApp. Este arquivo resume o site com dados publicados pela própria empresa, coletados em ${DATA_COLETA}.`);
  L.push('');
  return L;
}

function blocoEmpresa(D) {
  const E = D.empresa;
  const L = [];
  L.push('## A empresa');
  L.push('');
  if (E.endereco_fabrica) L.push(`- Fábrica: ${E.endereco_fabrica}`);
  if (E.telefone_fixo?.display) L.push(`- Telefone fixo: ${E.telefone_fixo.display}`);
  if (E.horario?.literal) L.push(`- Horário: ${E.horario.literal}`);
  for (const e of E.emails || []) L.push(`- E-mail (${e.uso}): ${e.email}`);
  if (E.inmetro?.certificado) L.push(`- Certificação INMETRO: certificado nº ${E.inmetro.certificado} (${urlCodificada(abs('inmetro.html'))})`);
  for (const n of E.numeros_declarados || []) L.push(`- Números declarados (segundo a empresa): ${n.literal}`);
  const ra = E.reclame_aqui;
  if (ra?.url && ra.reputacao && ra.periodo && ra.consultado_em) L.push(`- Reclame Aqui: reputação ${ra.reputacao}, nota ${ra.nota}, resolve ${ra.resolve} (${ra.periodo}; consultado em ${ra.consultado_em.split('-').reverse().join('/')}): ${ra.url}`);
  const redes = (E.redes || []).filter((r) => r.principal);
  if (redes.length) L.push(`- Redes: ${redes.map((r) => `${r.rede} ${r.url}`).join('; ')}`);
  L.push('');
  return L;
}

function blocoComprar(D) {
  const pol = D.ler('politicas.json') || {};
  const L = [];
  L.push('## Como comprar');
  L.push('');
  L.push(`1. Escolha o modelo, o tamanho e os opcionais no site (${urlCodificada(abs('escolher.html'))} ajuda a escolher pelo espaço disponível).`);
  L.push('2. Envie a escolha pelo WhatsApp de vendas ou de um consultor; o valor final e o prazo são confirmados pelo consultor.');
  if (pol.pagamento?.literal) L.push(`3. Pagamento, como publicado: ${pol.pagamento.literal}`);
  L.push('');
  if (pol.entrega?.literal) L.push(`Entrega: ${pol.entrega.literal}`);
  if (pol.instalacao?.literal) L.push(`Instalação: ${pol.instalacao.literal}`);
  if (pol.desistencia?.literal) L.push(`Desistência: ${pol.desistencia.literal}`);
  L.push('Garantia: consulte as condições de garantia do seu modelo com o consultor.');
  L.push('');
  L.push('## WhatsApp por finalidade');
  L.push('');
  L.push(...contatosPorFinalidade(D));
  L.push('');
  return L;
}

function blocoLojas(D) {
  const L = ['## Lojas', ''];
  for (const l of D.lojas) {
    let c = null;
    try { c = D.contato(l.whatsapp_papel); } catch { c = null; }
    const wa = c && c.status === 'ativo' && c.link_ativo ? ` WhatsApp ${c.display}.` : ' Contato pelo WhatsApp de ajuda.';
    L.push(`- ${l.nome}: ${l.endereco_exibido}.${wa} ${urlCodificada(abs(`lojas/loja-showrooms.html#${l.ancora}`))}`);
  }
  L.push('');
  return L;
}

function blocoPrazos(D) {
  const tab = D.ler('politicas.json')?.prazo_de_entrega?.tabela || [];
  if (!tab.length) return [];
  const L = ['## Prazo de entrega por estado (dias úteis, como publicado)', ''];
  for (const g of tab) {
    L.push(`${g.grupo}:`);
    for (const l of g.linhas || []) L.push(`- ${l.estados}: ${l.prazo}`);
    L.push('');
  }
  return L;
}

export function gerarLlms(D, { imagensPorSlug = new Map(), colecoesIndexaveis = [] } = {}) {
  const produtos = D.ler('produtos.json') || [];
  const raizes = Object.entries(RAIZ_TIPO).map(([t, p]) => ({ t, c: D.catPorPath.get(p) })).filter((x) => x.c);
  const guias = [
    ['guia/banheira-por-tamanho.html', 'Que banheira cabe no meu espaço?'],
    ['guia/spa-por-lugares.html', 'Spa para quantas pessoas?'],
    ['guia/gel-coat-ou-acrilico.html', 'Gel coat ou acrílico?'],
    ['guia/basica-ou-completa.html', 'Básica ou Completa?'],
  ].filter(([s]) => existsSync(join(paths.dist, s)));
  const link = (s) => urlCodificada(abs(s));

  // llms.txt: mapa curto do site
  const L = [...cabecalhoEmpresa(D)];
  L.push(`Preços e medidas são os publicados pela empresa em ${DATA_COLETA}; o valor final é confirmado pelo consultor. Fotos são ilustrativas. A planta técnica oficial de cada tamanho, quando publicada, está em PDF na página do produto.`);
  L.push('');
  L.push(...blocoEmpresa(D));
  L.push(...blocoComprar(D));
  L.push('## Coleções');
  L.push('');
  L.push('Contagem de cada coleção: modelos listados na página da coleção. O catálogo em texto (llms-full.txt) agrupa por tipo de produto, e a contagem pode diferir quando a listagem do site inclui um modelo de outro tipo ou deixa de fora um item sem coleção.');
  L.push('');
  for (const { t, c } of raizes) L.push(`- [${c.nome}](${link(c.d_path)}): ${c.total_exibido} ${c.total_exibido === 1 ? NOME_TIPO[t].toLowerCase() : PLURAL_TIPO[t]}`);
  for (const c of colecoesIndexaveis) {
    if (Object.values(RAIZ_TIPO).includes(c.d_path)) continue;
    L.push(`- [${rotuloCategoria(c, D)}](${link(c.d_path)}): ${c.total_exibido} ${c.total_exibido === 1 ? 'modelo' : 'modelos'}`);
  }
  L.push('');
  L.push('## Escolher e comparar');
  L.push('');
  L.push(`- [Escolher pelo meu espaço](${link('escolher.html')}): informa largura e comprimento e mostra o que cabe, com folga`);
  for (const [s, t] of guias) L.push(`- [${t}](${link(s)})`);
  L.push('');
  L.push('## Atendimento e documentos');
  L.push('');
  L.push(`- [Perguntas frequentes](${link('perguntas-frequentes.html')})`);
  L.push(`- [Manual do usuário e instalação](${link('manual-usuario-instalacao.html')}) (PDF: ${link('manual/manual-do-usuario.pdf')})`);
  L.push(`- [Prazo de entrega por estado](${link('prazo-de-entrega.html')})`);
  L.push(`- [Como comprar](${link('como-comprar.html')})`);
  L.push(`- [Lojas e showrooms](${link('lojas/loja-showrooms.html')})`);
  L.push(`- [Atendimento](${link('contacts.html')})`);
  L.push(`- [Troca, devolução e reembolso](${link('politica-devolucao-reembolso.html')})`);
  L.push('');
  L.push('## Dados completos');
  L.push('');
  L.push(`- [Catálogo inteiro em texto](${link('llms-full.txt')}): ${produtos.length} modelos com SKU, ficha, tamanhos, itens de série e preço publicado`);
  L.push(`- [Dados abertos do catálogo (JSON)](${link('dados/catalogo.json')}): os mesmos dados com fonte e data de coleta por produto`);
  L.push(`- [Mapa do site](${link('mapa-do-site.html')}) e [sitemap](${link('sitemap.xml')})`);
  L.push('');
  const llms = `${L.join('\n')}`;

  // llms-full.txt: catálogo inteiro + FAQ + prazos + políticas
  const F = [...cabecalhoEmpresa(D)];
  F.push(`Catálogo completo com ${produtos.length} modelos, perguntas frequentes publicadas, prazos e políticas. Preços publicados em ${DATA_COLETA}; o valor final é confirmado pelo consultor. Quando a fonte traz duas versões de uma informação, as duas aparecem com nota.`);
  F.push('');
  F.push(...blocoEmpresa(D));
  F.push(...blocoComprar(D));
  F.push(...blocoLojas(D));
  F.push(...blocoPrazos(D));
  F.push('## Catálogo');
  F.push('');
  for (const tipo of Object.keys(RAIZ_TIPO)) {
    const lista = produtos.filter((p) => p.d_tipo === tipo);
    if (!lista.length) continue;
    F.push(`## ${PLURAL_TIPO[tipo][0].toUpperCase()}${PLURAL_TIPO[tipo].slice(1)} (${lista.length})`);
    F.push('');
    // Mesma base do llms.txt quando possível; se a listagem da coleção traz outro número, as duas
    // contagens aparecem com a explicação (nenhuma é escolhida).
    const raizCat = D.catPorPath.get(RAIZ_TIPO[tipo]);
    if (raizCat && raizCat.total_exibido !== lista.length) {
      F.push(`Contagem por tipo de produto: ${lista.length}. A página da coleção [${raizCat.nome}](${link(raizCat.d_path)}) lista ${raizCat.total_exibido}, porque a listagem do site inclui ou deixa de fora modelos de outro tipo (por exemplo, um spa listado entre os ofurôs ou um acessório sem coleção).`);
      F.push('');
    }
    for (const p of lista) F.push(...linhasProduto(p, imagensPorSlug.get(p.slug) || [], produtos, D.ler('politicas.json')));
  }
  F.push('## Perguntas frequentes (respostas publicadas pela empresa)');
  F.push('');
  for (const f of faqPublicada(D)) {
    F.push(`### ${perguntaLegivel(f.pergunta)}`);
    F.push('');
    F.push(String(f.resposta_exibida).trim());
    const fonte = /^(https?:\/\/\S+)(.*)$/.exec(String(f.fonte || '').trim());
    if (fonte) F.push(`Fonte: ${urlCodificada(decodeURIComponentSeguro(fonte[1]))}${fonte[2]}`);
    F.push('');
  }
  const full = F.join('\n');
  return { llms, full };
}

/**
 * Instante ISO em UTC ("2026-10-19T02:07:38Z") no horário de Brasília com o offset explícito
 * ("2026-10-18T23:07:38-03:00"): o mesmo instante, para a leitura direta bater com "coletado em 18/10/2026".
 * Valor que não é instante ISO volta como está.
 */
export function horaDeBrasilia(iso) {
  const d = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(iso || '')) || Number.isNaN(d.getTime())) return iso;
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  const local = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
  const off = Math.round((local - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sinal = off < 0 ? '-' : '+';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  const frac = /T\d{2}:\d{2}:\d{2}(\.\d+)/.exec(String(iso))?.[1] || '';
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}${frac}${sinal}${hh}:${mm}`;
}

export function catalogoAberto(D, { imagensPorSlug = new Map() } = {}) {
  const produtos = D.ler('produtos.json') || [];
  const politicas = D.ler('politicas.json');
  // Alertas da fonte que mudam a leitura de disponibilidade ou preço (SPEC 15), com o texto literal e a
  // fonte: as duas versões ficam no dado, nenhuma é escolhida (regra 0.3).
  const alertas = (p) => {
    const a = [];
    const s = avulsoSuspenso(p, politicas);
    if (s) a.push({ tipo: 'itens_avulsos_suspensos', disponibilidade_no_catalogo: p.disponibilidade, texto_da_pagina_de_prazos: s.literal, fonte: s.fonte, nota: 'As duas informações são publicadas pela empresa. Confirme com o consultor antes de comprar.' });
    const n = notaPrecosComoOpcaoTexto(p, produtos);
    if (n) a.push({ tipo: 'preco_como_opcional', nota: n });
    return a;
  };
  return {
    titulo: `Catálogo publicado pela ${D.empresa.nome}`,
    descricao: 'Dados do catálogo como publicados no site atual da empresa, sem alteração; campos com prefixo d_ são derivados (contas sobre os dados publicados). Preço e disponibilidade valem para a data de coleta; o valor final é confirmado pelo consultor.',
    coletado_em: DATA_COLETA,
    site: abs(''),
    total: produtos.length,
    produtos: produtos.map((p) => ({
      slug: p.slug,
      url: urlCodificada(abs(`${p.slug}.html`)),
      nome: p.nome,
      sku: p.sku,
      tipo: p.d_tipo,
      disponibilidade: p.disponibilidade,
      ...(alertas(p).length ? { alertas: alertas(p) } : {}),
      preco: { por: p.preco?.por ?? null, de: p.preco?.de ?? null, valor: p.preco?.valores_numericos?.finalPrice ?? null, valor_de: p.preco?.valores_numericos?.oldPrice ?? null, moeda: 'BRL' },
      especificacoes: p.especificacoes || {},
      conflitos_nome_ficha: p.d_conflito_nome_ficha || [],
      tamanhos: tamanhosDe(p).map((t) => ({ rotulo: t.rotulo, preco_adicional: t.preco_adicional })),
      d_medida_confirmada: p.d_medida_confirmada !== false,
      itens_de_serie: p.d_itens_de_serie_exibidos || [],
      plantas_pdf: (p.d_planta || []).filter((x) => x.pdf_path).map((x) => ({ tamanho: x.rotulo, url: urlCodificada(abs(x.pdf_path)) })),
      imagens: (imagensPorSlug.get(p.slug) || []).map(urlCodificada),
      categorias: (p.d_categorias_paths || []).filter((c) => !CATEGORIAS_PONTE.includes(c)).map((c) => urlCodificada(abs(c))),
      d_resumo: p.d_resumo || null,
      fonte: p.fonte || p.url,
      // Horário de Brasília com offset (o mesmo instante da fonte); o original em UTC fica ao lado.
      coletado_em: horaDeBrasilia(p.coletado_em) || DATA_COLETA,
      ...(p.coletado_em && horaDeBrasilia(p.coletado_em) !== p.coletado_em ? { coletado_em_utc: p.coletado_em } : {}),
    })),
  };
}

export function gerarSeo(dist = paths.dist) {
  const D = dados();
  const hoje = hojeISO();
  const regs = indexaveis(registro(dist), dist);
  const produtos = D.ler('produtos.json') || [];
  const slugs = new Set(produtos.map((p) => `${p.slug}.html`));
  const colPaths = new Set(D.categorias.map((c) => c.d_path));

  // Imagens publicadas de cada produto: as do Product do JSON-LD (as mesmas do resultado rico).
  const imagensPorSlug = new Map();
  for (const p of produtos) {
    const f = join(dist, `${p.slug}.html`);
    if (!existsSync(f)) continue;
    const prod = nosJsonLd(readFileSync(f, 'utf8')).find((n) => [].concat(n['@type']).includes('Product'));
    imagensPorSlug.set(p.slug, [].concat(prod?.image || []));
  }

  const grupos = { produtos: [], colecoes: [], paginas: [] };
  for (const r of regs) {
    const e = { loc: r.canonical, lastmod: hoje };
    if (slugs.has(r.saida)) grupos.produtos.push({ ...e, imagens: imagensPorSlug.get(r.saida.replace(/\.html$/, '')) || [] });
    else if (colPaths.has(r.saida)) grupos.colecoes.push(e);
    else grupos.paginas.push(e);
  }
  for (const g of Object.values(grupos)) g.sort((a, b) => (a.loc < b.loc ? -1 : 1));
  const pdfs = [...arquivos(join(dist, 'plantas'), '.pdf'), ...arquivos(join(dist, 'manual'), '.pdf')]
    .map((f) => ({ loc: abs(relative(dist, f).split('\\').join('/')), lastmod: hoje }))
    .sort((a, b) => (a.loc < b.loc ? -1 : 1));

  // Com INDEXAR=false (prévia), todas as páginas saem com noindex: os sitemaps saem vazios (SPEC 14:
  // nenhuma URL noindex dentro do sitemap). A estrutura fica pronta e se enche ao ligar INDEXAR.
  const so = (lista) => (INDEXAR ? lista : []);
  writeFileSync(join(dist, 'sitemap-produtos.xml'), urlset(so(grupos.produtos), { imagens: true }));
  writeFileSync(join(dist, 'sitemap-colecoes.xml'), urlset(so(grupos.colecoes)));
  writeFileSync(join(dist, 'sitemap-paginas.xml'), urlset(so(grupos.paginas)));
  writeFileSync(join(dist, 'sitemap-plantas.xml'), urlset(so(pdfs)));
  writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAPS.map((s) => `  <sitemap>\n    <loc>${xml(abs(s))}</loc>\n    <lastmod>${hoje}</lastmod>\n  </sitemap>`).join('\n')}\n</sitemapindex>\n`);
  writeFileSync(join(dist, 'robots.txt'), robotsTxt());

  const colecoesIndexaveis = D.categorias.filter((c) => grupos.colecoes.some((e) => e.loc === abs(c.d_path)));
  const { llms, full } = gerarLlms(D, { imagensPorSlug, colecoesIndexaveis });
  writeFileSync(join(dist, 'llms.txt'), `${llms}\n`);
  writeFileSync(join(dist, 'llms-full.txt'), `${full}\n`);
  mkdirSync(join(dist, 'dados'), { recursive: true });
  writeFileSync(join(dist, 'dados', 'catalogo.json'), `${JSON.stringify(catalogoAberto(D, { imagensPorSlug }))}\n`);

  return {
    indexar: INDEXAR,
    produtos: grupos.produtos.length,
    imagens: grupos.produtos.reduce((s, e) => s + e.imagens.length, 0),
    colecoes: grupos.colecoes.length,
    paginas: grupos.paginas.length,
    pdfs: pdfs.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = gerarSeo();
  console.log(`seo: robots.txt (${r.indexar ? 'indexa' : 'Disallow: /'}) · sitemaps${r.indexar ? '' : ' vazios na prévia (com INDEXAR=true)'}: ${r.produtos} produtos (${r.imagens} imagens), ${r.colecoes} coleções, ${r.paginas} páginas, ${r.pdfs} PDFs · llms.txt, llms-full.txt, dados/catalogo.json`);
}
