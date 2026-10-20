// Página de produto (SPEC 9.3, 6.2 P0, 10.2, 11.1 e 11.2): 292 páginas, uma por URL atual, no mesmo
// caminho <slug>.html. Ordem fixa das seções (sala = S, dia = D):
//   1 etiqueta de entrada (S) · 2 ficha em uma frase (S) · 3 moldura e galeria (S) · 4 coluna de
//   decisão (D) · 5 outras versões (D) · 6 explorador da planta (S, azul de prancheta) · 7 cabe no
//   meu banheiro (S) · 8 o que vem na peça · 9 ficha técnica (D) · 10 descrição (D) · 11 entrega e
//   pagamento (D) · 12 perguntas (D) · 13 peças parecidas (D) · 14 avaliação (D, só onde existir).
// Casos especiais: Spa Serena (sem foto e sem planta), versões -1, esgotados (Air Blower e
// Pré-filtro), saunas (vista frontal pela altura), acessórios (página curta) e os produtos sem planta.
//
// Nenhum dado literal da empresa vive aqui: tudo sai de data/ por build/lib/dados.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { html, attrs, raw } from '../build/lib/html.mjs';
import { icone } from '../build/lib/icons.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { fotosProduto, fotoProduto } from '../build/lib/midia.mjs';
import { formatBRL } from '../build/lib/money.mjs';
import { mensagemCompra } from '../build/lib/wa.mjs';
import { paths } from '../site.config.mjs';
import { notaPrecosComoOpcaoTexto, disponibilidadeSchema } from '../build/lib/catalogo.mjs';
import { breadcrumb } from './parts/breadcrumb.mjs';
import { picture, SIZES_CARTAO } from './parts/foto.mjs';
import { galeria, ordenarFotos } from './parts/galeria.mjs';
import { paineisPlanta, plantasAvulsas, rotuloTam, plantaDoTamanho, situacaoPlanta } from './parts/planta.mjs';
import { escala } from './parts/escala.mjs';
import { decisao, doca } from './parts/monte.mjs';
import { ficha, rotuloFicha } from './parts/ficha.mjs';
import { entrega } from './parts/entrega.mjs';
import { faqsDoTipo, faqBloco } from './parts/faq-bloco.mjs';

// Coleção raiz de cada tipo (SPEC 3.1, d_tipo pela categoria raiz da listagem).
export const RAIZ_DO_TIPO = Object.freeze({ banheira: 'banheiras.html', spa: 'spas.html', ofuro: 'ofuros.html', sauna: 'sauna.html', acessorio: 'acessorios.html' });
const PLURAL = { banheira: 'banheiras', spa: 'spas', ofuro: 'ofurôs', sauna: 'saunas', acessorio: 'acessórios' };
const ETIQUETA = ['Forma', 'Lugares', 'Material', 'Configuracao'];
// Planta de fundo (sem filme): no celular, a versão pequena (nível 0, cerca de 6 KB) basta para a faixa
// esmaecida; a planta legível e ampliável está no explorador.
const POSTER_SIZES = '(min-width:1024px) 62vw, 50vw';
// Blocos abaixo da dobra só são montados perto da tela, e as imagens lazy deles só baixam então. Vai
// inline (e não no site.css, que chega depois) para valer já na primeira montagem da página.
const CV = 'content-visibility:auto;contain-intrinsic-size:auto 900px';
// Texto da seção 6 por situação da planta (templates/parts/planta.mjs#situacaoPlanta).
const LEAD_PLANTA = Object.freeze({
  oficial: 'A planta que a fábrica publica, com as cotas, para baixar em PDF.',
  divergente: 'A página deste modelo publica planta em PDF, mas com medida diferente das opções de tamanho. O desenho abaixo usa só as medidas do site, e os PDFs estão logo depois para conferir.',
  nenhuma: 'O site da fábrica não publica a planta deste modelo. O desenho abaixo usa só as medidas do site.',
});

// Ícones de item de série por palavra-chave do texto literal (SPEC 5.6), desenho Lucide (ISC).
const IC_ITEM = [
  [/mini\s*jato/i, '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/>'],
  [/jato|bico/i, '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>'],
  [/motobomba|motor|bomba/i, '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'],
  [/apoio de cabe|encosto/i, '<path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/><path d="M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 18h18"/>'],
  [/al[çc]a/i, '<path d="M5 15V9a7 7 0 0 1 14 0v6"/><path d="M3 15h4M17 15h4"/>'],
  [/ralo|suc[çc][ãa]o|ladr[ãa]o/i, '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'],
  [/aquecedor/i, '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'],
  [/cromoterapia|led|luz/i, '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'],
  [/oz[ôo]nio|ar\b|arejador|blower/i, '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'],
  [/entrada de [áa]gua|sa[íi]da de [áa]gua|tubula|[áa]gua/i, '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'],
];
function iconeItem(texto) {
  const hit = IC_ITEM.find(([re]) => re.test(texto));
  if (!hit) return icone('ponto', { tamanho: 22 });
  return raw(`<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${hit[1]}</svg>`);
}

/** Campos da etiqueta, sem os que divergem entre nome e ficha (conflito mostrado na ficha, não escolhido). */
function camposEtiqueta(p) {
  if (p.d_tipo === 'acessorio') return [];
  const conf = new Set((p.d_conflito_nome_ficha || []).map((c) => c.campo));
  const e = p.especificacoes || {};
  return ETIQUETA.filter((k) => e[k] && !conf.has(k)).map((k) => ({ k, v: e[k] }));
}

/**
 * <title> de produto até 60 caracteres (SPEC 11.1). O nome literal nunca é alterado no meio: cabe com
 * " | Banheiras Bom Banho", ou com " | BBB" (sigla que o site atual já usa), ou sozinho; se passar de 60,
 * é cortado só no fim, por palavra, sem terminar em preposição, e leva reticências para mostrar o corte.
 * O og:title leva o nome literal completo (não tem o limite de 60).
 */
export function tituloProduto(nome) {
  const n = String(nome).replace(/\s+/g, ' ').trim();
  const sufixos = /\bBBB\b/.test(n) ? [' | Banheiras Bom Banho'] : [' | Banheiras Bom Banho', ' | BBB'];
  for (const suf of sufixos) if ((n + suf).length <= 60) return n + suf;
  if (n.length <= 60) return n;
  return cortarNoFim(n, 59) + '…';
}

/** Corta por palavra até `max` caracteres, sem terminar em preposição ou conjunção. */
function cortarNoFim(s, max) {
  const palavras = s.split(' ');
  let t = '';
  for (const w of palavras) {
    if (`${t} ${w}`.trim().length > max) break;
    t = `${t} ${w}`.trim();
  }
  let antes;
  do { antes = t; t = t.replace(/\s+(com|em|de|da|do|e|c\/|sem)$/i, ''); } while (t !== antes);
  return t || palavras[0];
}

/** Títulos únicos entre os produtos: em colisão, o nº de catálogo (SKU literal) desempata. */
export function titulosUnicos(produtos) {
  const t = new Map(produtos.map((p) => [p.slug, tituloProduto(p.nome)]));
  const conta = new Map();
  for (const v of t.values()) conta.set(v, (conta.get(v) || 0) + 1);
  for (const p of produtos) {
    if (conta.get(t.get(p.slug)) < 2) continue;
    const suf = ` (${p.sku})`;
    const nome = String(p.nome).replace(/\s+/g, ' ').trim();
    t.set(p.slug, nome.length + suf.length <= 60 ? nome + suf : `${cortarNoFim(nome, 60 - suf.length - 1)}…${suf}`);
  }
  return t;
}

/** Meta description de 140 a 160 caracteres só com campos reais (SPEC 11.1). */
export function descricaoProduto(p, tamanhos, itens) {
  const e = p.especificacoes || {};
  const conf = new Set((p.d_conflito_nome_ficha || []).map((c) => c.campo));
  const usa = (k) => (e[k] && !conf.has(k) ? String(e[k]).toLocaleLowerCase('pt-BR') : null);
  const tipo = { banheira: 'Banheira', spa: 'Spa', ofuro: 'Ofurô', sauna: 'Sauna', acessorio: 'Acessório' }[p.d_tipo] || '';
  // Concordância da forma literal da ficha com o gênero do tipo (spa e ofurô são masculinos), como no d_resumo.
  const masc = p.d_tipo === 'spa' || p.d_tipo === 'ofuro';
  const forma = usa('Forma') && (masc ? usa('Forma').replace(/^redonda$/, 'redondo').replace(/^quadrada$/, 'quadrado') : usa('Forma'));
  const desc = [forma, usa('Lugares') && (/^\d/.test(e.Lugares) ? `para ${usa('Lugares')}` : usa('Lugares')), usa('Material') && `em ${usa('Material')}`].filter(Boolean);
  const rot = tamanhos.map(rotuloTam).filter(Boolean);
  const temPlanta = (p.d_planta || []).some((x) => x.pdf_path);
  const partes = [
    `${p.nome}.`,
    desc.length && p.d_tipo !== 'acessorio' ? `${tipo} ${desc.join(', ')}.` : null,
    // Ficha e opção de tamanho divergem (SPEC 15): nenhuma das duas medidas vai para o resultado de busca.
    p.d_medida_confirmada === false
      ? (rot.length > 1 ? `${rot.length} tamanhos, medida a confirmar com o consultor.` : 'Medida a confirmar com o consultor.')
      : rot.length === 1 ? `Medidas: ${rot[0].replace(/\s*\+\s*R\$.*$/, '')}.` : rot.length > 1 ? `${rot.length} tamanhos, de ${rot[0].replace(/\s*\+\s*R\$.*$/, '')}.` : null,
    itens.length >= 2 ? `Com ${itens[0]} e ${itens[1]}.` : itens.length === 1 ? `Com ${itens[0]}.` : null,
    temPlanta ? 'Planta oficial, preço e compra pelo WhatsApp com consultor.' : 'Preço publicado e compra pelo WhatsApp com consultor.',
  ].filter(Boolean);
  let out = '';
  for (const parte of partes) {
    const cand = `${out} ${parte}`.trim();
    if (cand.length > 160) continue;
    out = cand;
  }
  // Complementos genéricos (sem dado da empresa) até a faixa de 140 a 160 caracteres.
  const extras = [
    'Banheiras Bom Banho.',
    p.d_tipo === 'acessorio' ? 'Veja a descrição e as opções.' : 'Veja a ficha técnica e as opções.',
    'Tire dúvidas com a equipe.',
    'Fale com o consultor.',
    'Preço publicado.',
    'Veja os detalhes.',
  ];
  for (const extra of extras) {
    if (out.length >= 140) break;
    if (out.toLowerCase().includes(extra.replace(/\.$/, '').toLowerCase())) continue;
    if (`${out} ${extra}`.length <= 160) out = `${out} ${extra}`;
  }
  if (out.length > 160) out = `${out.slice(0, 157).replace(/\s+\S*$/, '')}...`;
  return out;
}

/** Peças parecidas (SPEC 9.3, seção 13): mesmo tipo, forma e lugares, medida próxima; sem as irmãs. */
export function parecidas(p, produtos, n = 3) {
  if (p.d_tipo === 'acessorio' || !p.d_maior) return [];
  const e = p.especificacoes || {};
  const fora = (q) => q.slug === p.slug || (p.d_familia && q.d_familia === p.d_familia);
  const base = produtos.filter((q) => !fora(q) && q.d_tipo === p.d_tipo && q.d_maior && q.especificacoes?.Forma === e.Forma);
  const mesmo = base.filter((q) => q.especificacoes?.Lugares === e.Lugares);
  const lista = (mesmo.length >= 2 ? mesmo : base)
    .map((q) => ({ q, d: Math.abs(q.d_maior - p.d_maior) + Math.abs((q.d_menor || 0) - (p.d_menor || 0)) }))
    .sort((a, b) => a.d - b.d || a.q.d_preco_min - b.q.d_preco_min);
  const vistos = new Set();
  const out = [];
  for (const { q } of lista) {
    const k = q.d_familia || q.slug; // uma peça por família
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(q);
    if (out.length >= n) break;
  }
  return out;
}

function cartaoMini(q) {
  const f = fotoProduto(q.slug, 1);
  const t = q.d_tamanhos?.[0];
  return html`<li class="mini" data-reveal>
  <a class="mini__a" href="${url(`${q.slug}.html`)}">
    ${f ? html`<span class="moldura mini__mol"${attrs({ style: f.wall ? `--wall:${f.wall}` : null })}>${picture(f, { classe: 'moldura__img', sizes: SIZES_CARTAO, vt: q.slug })}</span>` : html`<span class="moldura moldura--vazia mini__mol"><span class="pequeno">Foto sob consulta</span></span>`}
    <span class="mini__nome">${q.nome}</span>
    ${t ? html`<span class="mini__med num">${rotuloTam(t)}${q.d_tamanhos.length > 1 ? ` +${q.d_tamanhos.length - 1}` : ''}</span>` : ''}
    <span class="mini__preco num">${q.preco.por}</span>
  </a>
</li>`;
}

// Celular (até 599 px): a arte do topo some (passava por trás do título) e a imagem nem é baixada.
const VAZIO_TOPO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/** Arte estática do topo para planta sem filme (build/plantas-topo.mjs): só a folha do desenho. */
let _topo;
function topoPlanta(sha1) {
  if (_topo === undefined) {
    const f = join(paths.public, 'media', 'plantas', 'topo.json');
    try { _topo = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).plantas || {} : {}; } catch { _topo = {}; }
  }
  const t = _topo[sha1];
  if (!t) return null;
  const rel = (w, e) => `media/plantas/${sha1}/topo-${w}.${e}`;
  if (![600, 1200].every((w) => ['avif', 'webp'].every((e) => existsSync(join(paths.public, rel(w, e)))))) return null;
  const ss = (e) => `${url(rel(600, e))} 600w, ${url(rel(1200, e))} 1200w`;
  return { webp: url(rel(1200, 'webp')), avif: url(rel(1200, 'avif')), srcsetAvif: ss('avif'), srcsetWebp: ss('webp'), w: t.largura, h: t.altura };
}

/** Filme da planta (bloco 8), quando já gerado para esta planta; senão, só o poster estático. */
function filmeDaPlanta(sha1) {
  const man = filmes();
  const f = man?.planta?.[sha1];
  if (!f?.webm?.src || !f?.mp4?.src || !f?.poster) return null;
  const ok = [f.webm.src, f.mp4.src].every((s) => existsSync(join(paths.public, s)));
  const poster = f.poster.avif?.src && existsSync(join(paths.public, f.poster.avif.src)) ? f.poster.avif.src : f.poster.webp?.src;
  if (!ok || !poster || !existsSync(join(paths.public, poster))) return null;
  const webp = f.poster.webp?.src && existsSync(join(paths.public, f.poster.webp.src)) ? url(f.poster.webp.src) : null;
  const avif = f.poster.avif?.src && existsSync(join(paths.public, f.poster.avif.src)) ? url(f.poster.avif.src) : null;
  // Primeiro o formato menor deste filme (o WebM costuma sair maior que o MP4) e, em tela estreita, a versão de 640 px.
  const ordem = (f.mp4.bytes || 0) <= (f.webm.bytes || Infinity) ? 'mp4,webm' : 'webm,mp4';
  const leve = f.mp4_640?.src && existsSync(join(paths.public, f.mp4_640.src)) ? url(f.mp4_640.src) : null;
  return { webm: url(f.webm.src), mp4: url(f.mp4.src), leve, ordem, poster: url(poster), posterWebp: webp, posterAvif: avif, w: f.largura || 1280, h: f.altura || 720, aria: f.aria_label || null };
}
let _filmes;
function filmes() {
  if (_filmes === undefined) {
    const p = join(paths.public, 'media', 'filmes', 'manifest.json');
    try { _filmes = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { _filmes = null; }
  }
  return _filmes;
}

function jsonLd(p, c) {
  const { D, fotos, tamanhos, trilha } = c;
  const org = { '@id': abs('#org') };
  const imgs = fotos.map((f) => {
    const jpg = `media/p/${p.slug}/${p.slug}-${f.n}-800.jpg`;
    return existsSync(join(paths.public, jpg)) ? abs(jpg) : abs(f.src.slice(c.BASE.length));
  });
  const pol = D.ler('politicas.json') || {};
  const dias = Number((/(\d+)\s*\(/.exec(pol.desistencia?.literal || '') || [])[1]) || null;
  // Itens avulsos suspensos: sem availability (o catálogo e a página de prazos divergem; SPEC 15).
  const disp = disponibilidadeSchema(p, pol);
  const precos = [...new Set(tamanhos.filter((t) => t.origem === 'opcao').map((t) => (p.preco.valores_numericos.finalPrice || 0) + (t.preco_adicional || 0)))];
  const comum = {
    priceCurrency: 'BRL',
    ...(disp ? { availability: disp } : {}),
    url: abs(`${p.slug}.html`),
    seller: org,
    ...(dias ? { hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'BR', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: dias } } : {}),
  };
  const offers = precos.length > 1
    ? { '@type': 'AggregateOffer', lowPrice: Math.min(...precos), highPrice: Math.max(...precos), offerCount: tamanhos.filter((t) => t.origem === 'opcao').length, price: p.preco.valores_numericos.finalPrice, ...comum }
    : { '@type': 'Offer', price: p.preco.valores_numericos.finalPrice, ...comum };
  const e = p.especificacoes || {};
  const conf = new Set((p.d_conflito_nome_ficha || []).map((x) => x.campo));
  const produto = {
    '@type': 'Product',
    '@id': `${abs(`${p.slug}.html`)}#produto`,
    name: p.nome,
    sku: p.sku,
    url: abs(`${p.slug}.html`),
    ...(imgs.length ? { image: imgs } : {}),
    description: p.d_resumo,
    brand: org,
    ...(e.Material && !conf.has('Material') ? { material: e.Material } : {}),
    category: D.catPorPath.get(RAIZ_DO_TIPO[p.d_tipo])?.nome || undefined,
    additionalProperty: Object.entries(e).filter(([k]) => !conf.has(k)).map(([k, v]) => ({ '@type': 'PropertyValue', name: rotuloFicha(k), value: v })),
    offers,
  };
  // A marca aponta para a Organization (sem manufacturer: a fonte não diz quem fabrica cada item) (SPEC 11.2); o nó mínimo vai no próprio grafo para a
  // referência resolver nesta página (o bloco de SEO completa os demais campos pelo mesmo @id).
  const grafo = [produto, { '@type': 'Organization', '@id': org['@id'], name: D.empresa.nome, url: abs('') }];
  const sub = c.grupo;
  if (sub) {
    const gid = abs(`#grupo-${sub.id}`);
    produto.isVariantOf = { '@id': gid };
    grafo.push({
      '@type': 'ProductGroup',
      '@id': gid,
      name: sub.nome,
      productGroupID: sub.id,
      brand: org,
      // Variantes em várias páginas (padrão do Google para ProductGroup multipágina): o grupo tem a URL
      // da primeira versão (a mesma em todas as páginas do grupo); a variante desta página vai pelo @id
      // do Product completo e cada irmã de outra página pelo @id com a URL da página dela (um @id de
      // outro documento sozinho não é resolvido; com @type Product sem oferta, o validador acusaria
      // campos obrigatórios).
      url: abs(`${sub.membros[0].slug}.html`),
      variesBy: ['https://schema.org/material'],
      hasVariant: sub.membros.map((m) => (m.slug === p.slug
        ? { '@id': `${abs(`${m.slug}.html`)}#produto` }
        : { '@id': `${abs(`${m.slug}.html`)}#produto`, url: abs(`${m.slug}.html`) })),
    });
  }
  grafo.push({
    '@type': 'BreadcrumbList',
    itemListElement: trilha.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.nome, ...(t.abs ? { item: t.abs } : {}) })),
  });
  // Sem FAQPage aqui: as mesmas perguntas se repetem em centenas de produtos, e a diretriz do Google pede
  // marcar uma única instância (perguntas-frequentes.html). A FAQ segue visível na página.
  return { '@context': 'https://schema.org', '@graph': grafo };
}

/** Prefixo comum das versões irmãs ("Banheira Acqua Línea"), só para o nome do ProductGroup. */
function prefixoComum(nomes) {
  const ps = nomes.map((n) => n.split(/\s+/));
  const out = [];
  for (let i = 0; i < ps[0].length; i++) {
    const w = ps[0][i];
    if (ps.every((x) => x[i] === w) && !/^(completa|completo|com|em|b[áa]sica|b[áa]sico)$/i.test(w)) out.push(w);
    else break;
  }
  return out.join(' ') || nomes[0];
}

/**
 * ProductGroup do dado estruturado (SPEC 11.2): o schema.org só reconhece variação por propriedades como
 * material, e não por "configuração". Por isso o grupo marcado reúne as versões irmãs da MESMA
 * configuração (Básica ou Completa) que diferem só no material, cada uma com material próprio na ficha.
 * Família que só varia por configuração, ou com material repetido ou em conflito, fica sem ProductGroup
 * (as irmãs continuam ligadas na página por "Outras versões desta peça").
 */
export function grupoSchema(p, fam, porSlug) {
  if (!fam || fam.membros.length < 2 || !(fam.variam_por || []).includes('Material')) return null;
  const semConflito = (m) => {
    const q = porSlug.get(m.slug);
    return q && m.Material && !(q.d_conflito_nome_ficha || []).some((c) => c.campo === 'Material');
  };
  const eu = fam.membros.find((m) => m.slug === p.slug);
  if (!eu || !semConflito(eu)) return null;
  const porConfig = (fam.variam_por || []).includes('Configuracao');
  const membros = fam.membros.filter((m) => semConflito(m) && (!porConfig || m.Configuracao === eu.Configuracao));
  if (membros.length < 2 || new Set(membros.map((m) => m.Material)).size !== membros.length) return null;
  const sufixo = porConfig && eu.Configuracao ? `-${eu.Configuracao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  const nome = prefixoComum(membros.map((m) => m.nome));
  return { id: `${fam.familia || p.d_familia}${sufixo}`, nome: porConfig && eu.Configuracao ? `${nome} (${eu.Configuracao})` : nome, membros };
}

function versoes(p, fam) {
  if (!fam || fam.membros.length < 2) return html``;
  const campos = fam.variam_por?.length ? fam.variam_por : ['Material', 'Configuracao'];
  return html`<nav class="versoes" aria-labelledby="versoes-h">
  <p class="monte__rot" id="versoes-h">Outras versões desta peça</p>
  <ul class="versoes__lista" role="list">${fam.membros.map((m) => {
    const rot = campos.map((k) => m[k]).filter(Boolean).join(' · ');
    const corpo = html`<span class="versoes__rot">${rot}</span><span class="versoes__preco num">${m.preco_por}</span>`;
    return html`<li>${m.slug === p.slug
      ? html`<span class="versoes__chip" aria-current="page">${corpo}</span>`
      : html`<a class="versoes__chip" href="${url(`${m.slug}.html`)}">${corpo}</a>`}</li>`;
  })}</ul>
</nav>`;
}

function itensDeSerie(p) {
  const itens = p.d_itens_de_serie_exibidos || [];
  if (!itens.length) return html``;
  return html`<ol class="itens" role="list" data-reveal-grupo>${itens.map((it, i) => html`<li class="itens__i" data-reveal style="--i:${Math.min(i, 8)}">${iconeItem(it)}<span data-campo="item-serie">${it}</span></li>`)}</ol>`;
}

function descricao(p) {
  const t = String(p.d_descricao_exibida || '').trim();
  if (!t) return html``;
  const linhas = t.split('\n').map((l) => l.trim()).filter(Boolean);
  return html`<details class="descricao">
  <summary class="descricao__s">Descrição completa</summary>
  <div class="prosa descricao__t">${linhas.map((l) => html`<p>${l}</p>`)}</div>
</details>`;
}

function avaliacao(p) {
  if (!p.avaliacoes?.length) return html``;
  return html`<section class="dia secao secao--curta" aria-labelledby="aval-h">
  <div class="wrap">
    <h2 id="aval-h">Avaliação de cliente</h2>
    ${p.avaliacoes.map((a) => html`<figure class="aval">
      <blockquote class="aval__q"><p class="aval__t">${a.titulo}</p><p>${a.texto}</p></blockquote>
      <figcaption class="aval__a">${a.autor}${a.data ? html`, <span class="num">${a.data}</span>` : ''}</figcaption>
    </figure>`)}
  </div>
</section>`;
}

/** Nota da página avulsa do Air Blower: os preços com que ele aparece como opção (SPEC 15). */
function notaPrecosComoOpcao(p, produtos) {
  const t = notaPrecosComoOpcaoTexto(p, produtos);
  return t ? html`<p class="monte__nota monte__nota--bloco">${t}</p>` : html``;
}

/**
 * Links de venda e dos 8 consultores (data-wa-sync="venda": cabeçalho, gaveta, rodapé, doca) já saem do
 * build com a mensagem da peça no estado inicial (SPEC 10.1: mesma abertura + contexto do produto), e
 * não só pelo JS. Na página esgotada, todos esses links (compra e consultores) levam a mesma mensagem de
 * estoque (SPEC 10.2): a peça gera uma mensagem só, qualquer que seja o botão. O número nunca muda.
 */
export function comContextoDeVenda(pagina, texto, { soConsultores = false } = {}) {
  const q = `?text=${encodeURIComponent(texto).replace(/'/g, '&#39;')}`;
  return String(pagina).replace(/<a\b[^>]*\bdata-wa-sync="venda"[^>]*>/g, (tag) => {
    if (soConsultores && !/\bdata-wa-papel="consultor_/.test(tag)) return tag;
    return tag.replace(/href="https:\/\/wa\.me\/(\d+)(?:\?text=[^"]*)?"/, (_, n) => `href="https://wa.me/${n}${q}"`);
  });
}

export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const produtos = D.ler('produtos.json');
  const familias = D.ler('familias.json') || {};
  const venda = D.contato('venda_principal');
  const abertura = venda.prefilled_text || '';
  const BASE = ctx.BASE_PATH;
  const out = [];
  const titulos = titulosUnicos(produtos);
  const porSlug = new Map(produtos.map((q) => [q.slug, q]));

  for (const p of produtos) {
    const saida = `${p.slug}.html`;
    const urlAbs = abs(saida);
    const tamanhos = p.d_tamanhos || [];
    const esgotado = p.disponibilidade === 'Esgotado';
    const acessorio = p.d_tipo === 'acessorio';
    const fotos = ordenarFotos(fotosProduto(p.slug));
    const t0 = tamanhos.find((t) => t.origem === 'opcao') || null;
    const raiz = RAIZ_DO_TIPO[p.d_tipo] || 'acessorios.html';
    const cat = D.catPorPath.get(raiz);
    const trilha = [
      { nome: 'Início', href: url(''), abs: abs('') },
      { nome: cat?.nome || PLURAL[p.d_tipo], href: url(raiz), abs: abs(raiz) },
      { nome: p.nome },
    ];
    const fam = p.d_familia && familias[p.d_familia]?.membros?.length > 1
      ? { ...familias[p.d_familia], nomeGrupo: prefixoComum(familias[p.d_familia].membros.map((m) => m.nome)) }
      : null;

    const soma0 = formatBRL((p.preco.valores_numericos.finalPrice || 0) + (t0?.preco_adicional || 0));
    const msgCompra = mensagemCompra({ abertura, nome: p.nome, sku: p.sku, tamanho: t0?.rotulo || null, dataColeta: D.dataColeta, somaFormatada: soma0, url: urlAbs });
    const msgEsgotado = [`Olá! Quero saber se a ${p.nome} volta a ter estoque.`, urlAbs].join('\n');
    const waCompra = D.wa('venda_principal', msgCompra);
    const waEsgotado = D.wa('venda_principal', msgEsgotado);
    // Linha "Tamanho:" só com o rótulo literal da opção (SPEC 10.2); sem opção de tamanho, a medida da
    // ficha não entra na mensagem (nome, SKU e link já identificam a peça).
    const waPlanta = (t) => D.wa('venda_principal', [abertura, '', [`Quero receber a planta técnica deste modelo.`, `Modelo: ${p.nome} (SKU ${p.sku})`, t.origem === 'opcao' && rotuloTam(t) ? `Tamanho: ${rotuloTam(t)}` : null, urlAbs].filter(Boolean).join('\n')].join('\n'));
    const cx = { D, produtos, tamanhos, esgotado, waCompra, waEsgotado, abertura, urlAbs };

    // Planta do tamanho inicial: fundo da etiqueta (poster) e, se o bloco 8 já gerou, o filme.
    const plIni = t0 || tamanhos[0] ? plantaDoTamanho(p, t0 || tamanhos[0]) : null;
    const filme = plIni?.validada && plIni.sha1 ? filmeDaPlanta(plIni.sha1) : null;
    // Arte da etiqueta: UMA camada só. Com filme (bloco 8), o poster do filme como imagem estática (é o
    // último quadro, a planta legível) e o vídeo no mesmo quadro, por cima, só depois de tocar. Sem
    // filme, a planta inteira (nível 0 dos blocos no celular, 1200 px no desktop). A imagem estática não
    // tem animação de entrada, para ser pintada na primeira passada (LCP).
    const arte = filme ? {
      tipo: 'filme',
      src: filme.posterWebp || filme.poster,
      avif: filme.posterAvif,
      w: filme.w,
      h: filme.h,
      preload: filme.posterAvif ? { href: filme.posterAvif, type: 'image/avif' } : { href: filme.posterWebp || filme.poster, type: 'image/webp' },
    } : plIni?.media && topoPlanta(plIni.sha1) ? (() => {
      // Plano B sem filme: só a folha do desenho, com o tratamento do poster dos filmes (build/plantas-topo.mjs).
      const t = topoPlanta(plIni.sha1);
      return {
        tipo: 'planta-folha',
        src: t.webp,
        avif: t.avif,
        srcsetAvif: t.srcsetAvif,
        srcset: t.srcsetWebp,
        w: t.w,
        h: t.h,
        preload: { type: 'image/avif', imagesrcset: t.srcsetAvif, imagesizes: POSTER_SIZES },
      };
    })() : plIni?.media ? (() => {
      const base = `media/plantas/${plIni.sha1}`;
      const z0 = plIni.media.niveis?.find((n) => n.z === 0 && n.colunas === 1 && n.linhas === 1);
      const temZ0 = z0 && existsSync(join(paths.public, base, 'z0', '0_0.webp'));
      const src = url(`${base}/planta-1200.webp`);
      const srcset = temZ0 ? `${url(`${base}/z0/0_0.webp`)} ${z0.largura}w, ${src} 1200w` : null;
      return {
        tipo: 'planta',
        src,
        srcset,
        w: 1200,
        h: Math.round((plIni.h / plIni.w) * 1200),
        preload: { href: src, type: 'image/webp', imagesrcset: srcset, imagesizes: srcset ? POSTER_SIZES : null },
      };
    })() : null;
    // Sem planta nem filme, o topo fica só com título e metadados (o desenho derivado repetia o da seção
    // "Cabe no meu banheiro?"; redesenho, rodada 2).

    // Sem planta, filme nem medidas (acessórios): o nº de catálogo literal, grande e vazado, ocupa o alto
    // da etiqueta como numa plaqueta de museu (só quando é um código curto). A caixa tem a largura da
    // etiqueta e altura fixa (entrelinha em em): a troca de fonte muda só os glifos, não a caixa (CLS).
    const numeroGrande = !arte && acessorio && p.sku && String(p.sku).length <= 6;

    const eti = camposEtiqueta(p);
    const itens = p.d_itens_de_serie_exibidos || [];
    const faqs = faqsDoTipo(D, p.d_tipo);
    const pareci = parecidas(p, produtos);
    const relacionados = (p.produtos_relacionados || [])
      .map((r) => produtos.find((q) => q.url === r.url))
      .filter((q) => q && q.slug !== p.slug);
    const comEscala = !acessorio && tamanhos.length && (t0 || tamanhos[0]).a;
    // Sem planta oficial publicada, "As medidas, em escala" e "Cabe no meu banheiro?" viram uma seção só
    // (a sala escura com o campo do espaço): a peça em escala aparece uma vez (redesenho, rodada 2).
    const semOficial = !acessorio && tamanhos.length && situacaoPlanta(p, tamanhos) !== 'oficial';
    const fundir = Boolean(semOficial && comEscala);
    const planta = !acessorio && tamanhos.length ? paineisPlanta(p, tamanhos, { waPlanta, semDesenho: fundir }) : null;
    const tituloEscala = p.d_tipo === 'banheira' ? 'Cabe no meu banheiro?' : 'Cabe no meu espaço?';

    const topo = html`<section class="sala prod-topo letterbox${arte ? ` prod-topo--${arte.tipo}` : ' prod-topo--sem-arte'}" aria-labelledby="prod-h1">
  ${!arte && numeroGrande ? html`<div class="prod-topo__fundo" aria-hidden="true" style="position:absolute;inset:0;z-index:-1;overflow:hidden"><p class="prod-topo__num" style="position:absolute;left:0;right:0;top:calc(var(--cab-h) + 8px);margin:0;overflow:hidden;contain:layout paint;text-align:right;font:300 clamp(9rem,58vw,24rem)/.8 var(--f-display);letter-spacing:-.04em;color:transparent;-webkit-text-stroke:1px color-mix(in srgb,var(--line) 40%,transparent);white-space:nowrap">${p.sku}</p></div>` : ''}
  ${arte ? html`<div class="prod-topo__fundo" aria-hidden="true">
    <div class="prod-topo__arte" style="aspect-ratio:${arte.w}/${arte.h}${arte.tipo === 'filme' || arte.tipo === 'planta-folha' ? ';opacity:.7' : arte.tipo === 'desenho' ? ';color:var(--line);opacity:.75;--arte-w:36%;--arte-d:5%;bottom:auto' : ''}">
      ${arte.svg || ''}${arte.svg ? '' : html`<picture><source media="(max-width:599px)" srcset="${VAZIO_TOPO}">${arte.avif ? html`<source type="image/avif"${attrs({ srcset: arte.srcsetAvif || arte.avif, sizes: arte.srcsetAvif ? POSTER_SIZES : null })}>` : ''}<img class="prod-topo__img"${attrs({ src: arte.src, srcset: arte.srcset, sizes: arte.srcset ? POSTER_SIZES : null, width: arte.w, height: arte.h, alt: '', decoding: 'sync', style: arte.tipo === 'planta' ? 'opacity:.45;filter:invert(1) hue-rotate(180deg);mix-blend-mode:screen' : null })}></picture>
      ${filme ? html`<video class="prod-topo__filme" data-filme${attrs({ 'data-webm': filme.webm, 'data-mp4': filme.mp4, 'data-mp4-leve': filme.leve, 'data-ordem': filme.ordem, 'aria-label': filme.aria, width: arte.w, height: arte.h })} muted playsinline loop preload="none"></video>` : ''}`}
    </div>
  </div>` : ''}
  <div class="wrap prod-topo__in">
    ${breadcrumb(trilha.map(({ nome, href }) => ({ nome, href })))}
    <p class="etiqueta prod-topo__cat" data-intro style="--i:0">Nº de catálogo <span class="num" data-campo="sku">${p.sku}</span></p>
    <h1 id="prod-h1" class="prod-topo__h1" data-intro="mascara" style="--i:1"><span data-campo="nome">${p.nome}</span></h1>
    ${eti.length ? html`<ul class="etiqueta prod-eti" role="list" data-intro style="--i:2">${eti.map((x) => html`<li><span data-campo="ficha-valor" data-ficha="${x.k}">${x.v}</span></li>`)}</ul>` : ''}
    <p class="prod-disp${esgotado ? ' prod-disp--esgotado' : ''}" data-intro style="--i:3"><span class="prod-disp__ponto" aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:${esgotado ? 'var(--glow)' : '#5fd38a'}"></span><span data-campo="disponibilidade">${p.disponibilidade}</span></p>
  </div>
</section>`;

    const peca = html`<div class="sala prod${acessorio ? ' prod--curto' : ''}">
  <div class="wrap prod__grade">
    <section class="prod__peca" aria-label="Fotos do modelo">${galeria(p, fotos)}</section>
    <section class="prod__decisao dia" id="comprar" aria-labelledby="dec-h">
      <h2 class="vh" id="dec-h">Preço e opções</h2>
      ${decisao(p, { ...cx, aposPreco: html`${notaPrecosComoOpcao(p, produtos)}${versoes(p, fam)}` })}
    </section>
    <section class="prod__bloco prod__resumo" aria-label="Ficha em uma frase"><p class="prod-resumo"><span class="etiqueta">Ficha em uma frase</span><span data-campo="resumo">${p.d_resumo}</span></p></section>
    ${planta && fundir ? html`<section class="prod__bloco prod__planta prod__escala sala-escura" id="cabe" style="${CV}" aria-labelledby="cabe-h">
      <div class="prod__cab"><p class="etiqueta etiqueta--linha">Desenho em escala</p><h2 id="cabe-h">${tituloEscala}</h2>
      <p class="prod__lead">${LEAD_PLANTA[planta.situacao]}</p></div>
      ${escala({ tamanho: t0 || tamanhos[0], tipo: p.d_tipo, segue: true })}
      <p class="desenho__leg prod__escala-leg">Desenho em escala a partir das medidas do site. Não é a planta oficial.</p>
      <div id="planta">${planta.corpo}</div>
      ${plantasAvulsas(p)}
    </section>` : ''}
    ${planta && !fundir ? html`<section class="prod__bloco prod__planta sala-escura" id="planta" style="${CV}" aria-labelledby="planta-h">
      <div class="prod__cab"><p class="etiqueta etiqueta--linha">${planta.temOficial ? 'Planta técnica oficial' : 'Desenho em escala'}</p>
      <h2 id="planta-h">${planta.temOficial ? 'O desenho é a obra' : 'As medidas, em escala'}</h2>
      <p class="prod__lead">${LEAD_PLANTA[planta.situacao]}</p></div>
      ${planta.corpo}
      ${plantasAvulsas(p)}
    </section>` : ''}
    ${comEscala && !fundir ? html`<section class="prod__bloco prod__escala" id="cabe" style="${CV}" aria-labelledby="cabe-h">
      <div class="prod__cab"><p class="etiqueta etiqueta--linha">Escala real</p><h2 id="cabe-h">${tituloEscala}</h2>
      <p class="prod__lead">A peça vista de cima, em escala real.</p></div>
      ${escala({ tamanho: t0 || tamanhos[0], tipo: p.d_tipo, segue: true })}
    </section>` : ''}
    ${itens.length ? html`<section class="prod__bloco prod__itens" id="itens" style="${CV}" aria-labelledby="itens-h">
      <div class="prod__cab"><p class="etiqueta etiqueta--linha">Itens de série</p><h2 id="itens-h">O que vem na peça</h2></div>
      ${itensDeSerie(p)}
    </section>` : ''}
  </div>
</div>`;

    const leitura = html`<section class="dia secao secao--curta" id="ficha" aria-labelledby="ficha-h">
  <div class="wrap prod-leitura">
    <div class="prod-leitura__cab"><p class="etiqueta etiqueta--linha">Dados publicados pela empresa</p><h2 id="ficha-h">Ficha técnica</h2></div>
    <div class="prod-leitura__corpo">${ficha(p, tamanhos)}${descricao(p)}</div>
  </div>
</section>
<section class="dia dia--areia secao secao--curta" id="entrega" aria-labelledby="entrega-h">
  <div class="wrap prod-leitura">
    <div class="prod-leitura__cab"><p class="etiqueta etiqueta--linha">Depois da compra</p><h2 id="entrega-h">Entrega e pagamento</h2></div>
    <div class="prod-leitura__corpo">${entrega(D)}</div>
  </div>
</section>
${faqs.length ? html`<section class="dia secao secao--curta" aria-labelledby="faq-h">
  <div class="wrap prod-leitura">
    <div class="prod-leitura__cab"><p class="etiqueta etiqueta--linha">Perguntas frequentes</p><h2 id="faq-h">Perguntas sobre ${PLURAL[p.d_tipo] || 'este modelo'}</h2>
    <p><a class="link" href="${url('perguntas-frequentes.html')}">Todas as perguntas</a></p></div>
    <div class="prod-leitura__corpo">${faqBloco(faqs)}</div>
  </div>
</section>` : ''}
${pareci.length || relacionados.length ? html`<section class="dia secao secao--curta" aria-labelledby="parec-h">
  <div class="wrap">
    <p class="etiqueta etiqueta--linha">Mesma forma, medida próxima</p>
    <h2 id="parec-h" class="prod-parec__h">Peças parecidas</h2>
    ${pareci.length ? html`<ul class="minis" role="list" data-reveal-grupo>${pareci.map(cartaoMini)}</ul>` : ''}
    ${relacionados.length ? html`<div class="relac"><p class="monte__rot">Peças relacionadas</p><ul class="relac__lista" role="list">${relacionados.map((q) => html`<li><a class="chip" href="${url(`${q.slug}.html`)}">${q.nome}<span class="num">${q.preco.por}</span></a></li>`)}</ul></div>` : ''}
  </div>
</section>` : ''}
${avaliacao(p)}`;

    const corpo = html`${topo}${peca}${leitura}${doca(p, cx)}`;
    // og:title e twitter:title com o nome literal completo (sem o limite de 60 do <title>).
    const og = { tipo: 'product', titulo: p.nome, ...(existsSync(join(paths.public, 'media', 'og', `${p.slug}.jpg`)) ? { imagem: `media/og/${p.slug}.jpg` } : {}) };
    const modulos = acessorio ? ['galeria', 'monte'] : ['produto'];
    // A arte da etiqueta é fundo (celular e desktop); o LCP é a foto da peça, pedida com prioridade alta
    // pelo próprio <img>. A arte só é pré-carregada no desktop, sem disputar banda no celular.
    const preload = arte?.preload ? [{ as: 'image', ...arte.preload, media: '(min-width:1024px)' }] : [];
    out.push({
      saida,
      html: comContextoDeVenda(layout({
        saida,
        titulo: titulos.get(p.slug),
        descricao: descricaoProduto(p, tamanhos, itens),
        corpo,
        og,
        jsonld: [jsonLd(p, { D, fotos, tamanhos, trilha, grupo: grupoSchema(p, fam, porSlug), BASE })],
        semImagem: !fotos.length,
        semDisponibilidade: !disponibilidadeSchema(p, D.ler('politicas.json')),
        modulos,
        ativo: raiz,
        sobre: true,
        esperar: 'prod-h1',
        preload,
        classe: 'pg-produto',
        critico: ['peca', 'produto'],
        // A foto da peça é o LCP: fontes (90 KB) e site.css depois da primeira pintura (a primeira tela está
        // inteira no CSS crítico; o texto usa o fallback com métrica ajustada) e o JS em prioridade baixa.
        fontes: [],
        cssAposPintura: true,
        fontesAposPintura: true,
        jsBaixa: true,
      }), esgotado ? msgEsgotado : msgCompra),
    });
  }
  return out;
}
