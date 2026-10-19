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
import { breadcrumb } from './parts/breadcrumb.mjs';
import { picture, SIZES_CARTAO } from './parts/foto.mjs';
import { galeria, ordenarFotos } from './parts/galeria.mjs';
import { paineisPlanta, plantasAvulsas, rotuloTam, plantaDoTamanho } from './parts/planta.mjs';
import { escala } from './parts/escala.mjs';
import { decisao, doca } from './parts/monte.mjs';
import { ficha } from './parts/ficha.mjs';
import { entrega } from './parts/entrega.mjs';
import { faqsDoTipo, faqBloco, faqJsonLd } from './parts/faq-bloco.mjs';

// Coleção raiz de cada tipo (SPEC 3.1, d_tipo pela categoria raiz da listagem).
export const RAIZ_DO_TIPO = Object.freeze({ banheira: 'banheiras.html', spa: 'spas.html', ofuro: 'ofuros.html', sauna: 'sauna.html', acessorio: 'acessorios.html' });
const PLURAL = { banheira: 'banheiras', spa: 'spas', ofuro: 'ofurôs', sauna: 'saunas', acessorio: 'acessórios' };
const ETIQUETA = ['Forma', 'Lugares', 'Material', 'Configuracao'];
const POSTER_SIZES = '(min-width:1024px) 1180px, 40vw';

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

/** <title> com no máximo 60 caracteres, cortado por palavra no nome (SPEC 11.1). */
export function tituloProduto(nome) {
  const suf = ' | Banheiras Bom Banho';
  if ((nome + suf).length <= 60) return nome + suf;
  const palavras = String(nome).split(/\s+/);
  let t = '';
  for (const w of palavras) {
    if ((`${t} ${w}`.trim() + suf).length > 60) break;
    t = `${t} ${w}`.trim();
  }
  return (t || palavras[0]) + suf;
}

/** Meta description de 140 a 160 caracteres só com campos reais (SPEC 11.1). */
export function descricaoProduto(p, tamanhos, itens) {
  const e = p.especificacoes || {};
  const conf = new Set((p.d_conflito_nome_ficha || []).map((c) => c.campo));
  const usa = (k) => (e[k] && !conf.has(k) ? String(e[k]).toLocaleLowerCase('pt-BR') : null);
  const tipo = { banheira: 'Banheira', spa: 'Spa', ofuro: 'Ofurô', sauna: 'Sauna', acessorio: 'Acessório' }[p.d_tipo] || '';
  const desc = [usa('Forma'), usa('Lugares') && (/^\d/.test(e.Lugares) ? `para ${usa('Lugares')}` : usa('Lugares')), usa('Material') && `em ${usa('Material')}`].filter(Boolean);
  const rot = tamanhos.map(rotuloTam).filter(Boolean);
  const temPlanta = (p.d_planta || []).some((x) => x.pdf_path);
  const partes = [
    `${p.nome}.`,
    desc.length && p.d_tipo !== 'acessorio' ? `${tipo} ${desc.join(', ')}.` : null,
    rot.length === 1 ? `Medidas: ${rot[0].replace(/\s*\+\s*R\$.*$/, '')}.` : rot.length > 1 ? `${rot.length} tamanhos, de ${rot[0].replace(/\s*\+\s*R\$.*$/, '')}.` : null,
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
    'Fábrica Banheiras Bom Banho.',
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
export function parecidas(p, produtos, n = 4) {
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

/** Filme da planta (bloco 8), quando já gerado para esta planta; senão, só o poster estático. */
function filmeDaPlanta(sha1) {
  const man = filmes();
  const f = man?.planta?.[sha1];
  if (!f?.webm?.src || !f?.mp4?.src || !f?.poster) return null;
  const ok = [f.webm.src, f.mp4.src].every((s) => existsSync(join(paths.public, s)));
  const poster = f.poster.avif?.src && existsSync(join(paths.public, f.poster.avif.src)) ? f.poster.avif.src : f.poster.webp?.src;
  if (!ok || !poster || !existsSync(join(paths.public, poster))) return null;
  return { webm: url(f.webm.src), mp4: url(f.mp4.src), poster: url(poster), aria: f.aria_label || null };
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
  const { D, fotos, tamanhos, trilha, faqs } = c;
  const org = { '@id': abs('#org') };
  const imgs = fotos.map((f) => {
    const jpg = `media/p/${p.slug}/${p.slug}-${f.n}-800.jpg`;
    return existsSync(join(paths.public, jpg)) ? abs(jpg) : abs(f.src.slice(c.BASE.length));
  });
  const pol = D.ler('politicas.json') || {};
  const dias = Number((/(\d+)\s*\(/.exec(pol.desistencia?.literal || '') || [])[1]) || null;
  const disp = p.disponibilidade === 'Esgotado' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
  const precos = [...new Set(tamanhos.filter((t) => t.origem === 'opcao').map((t) => (p.preco.valores_numericos.finalPrice || 0) + (t.preco_adicional || 0)))];
  const comum = {
    priceCurrency: 'BRL',
    availability: disp,
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
    brand: { '@type': 'Brand', name: D.empresa.nome },
    manufacturer: org,
    ...(e.Material && !conf.has('Material') ? { material: e.Material } : {}),
    category: D.catPorPath.get(RAIZ_DO_TIPO[p.d_tipo])?.nome || undefined,
    additionalProperty: Object.entries(e).filter(([k]) => !conf.has(k)).map(([k, v]) => ({ '@type': 'PropertyValue', name: k, value: v })),
    offers,
  };
  const grafo = [produto];
  if (c.familia) {
    const gid = abs(`#grupo-${p.d_familia}`);
    produto.isVariantOf = { '@id': gid };
    grafo.push({
      '@type': 'ProductGroup',
      '@id': gid,
      name: c.familia.nomeGrupo,
      productGroupID: p.d_familia,
      brand: { '@type': 'Brand', name: D.empresa.nome },
      variesBy: (c.familia.variam_por || []).map((v) => (v === 'Material' ? 'https://schema.org/material' : v)),
      hasVariant: c.familia.membros.map((m) => ({ '@id': `${abs(`${m.slug}.html`)}#produto` })),
    });
  }
  grafo.push({
    '@type': 'BreadcrumbList',
    itemListElement: trilha.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.nome, ...(t.abs ? { item: t.abs } : {}) })),
  });
  const fq = faqJsonLd(faqs);
  if (fq) grafo.push(fq);
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
  <summary class="descricao__s">Descrição completa da página atual</summary>
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
  if (!/air blower/i.test(p.nome)) return html``;
  const cont = new Map();
  for (const q of produtos) {
    for (const o of q.opcoes_personalizaveis || []) {
      for (const v of o.valores || []) {
        if (!/air blower/i.test(v.nome || v.rotulo_exibido)) continue;
        const m = /R\$\s?[\d.]+,\d{2}/.exec(v.rotulo_exibido);
        if (m) cont.set(m[0], (cont.get(m[0]) || 0) + 1);
      }
    }
  }
  if (!cont.size) return html``;
  const lista = [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} (em ${n} ${n === 1 ? 'modelo' : 'modelos'})`);
  return html`<p class="monte__nota monte__nota--bloco">Como opcional dos spas, este item aparece por ${lista.join(' e ')}. Cada preço vale onde está publicado. Confirme o valor com o consultor.</p>`;
}

export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const produtos = D.ler('produtos.json');
  const familias = D.ler('familias.json') || {};
  const venda = D.contato('venda_principal');
  const abertura = venda.prefilled_text || '';
  const BASE = ctx.BASE_PATH;
  const out = [];

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
    const waCompra = D.wa('venda_principal', mensagemCompra({ abertura, nome: p.nome, sku: p.sku, tamanho: t0?.rotulo || null, dataColeta: D.dataColeta, somaFormatada: soma0, url: urlAbs }));
    const waEsgotado = D.wa('venda_principal', [`Olá! Quero saber se a ${p.nome} volta a ter estoque.`, urlAbs].join('\n'));
    const waPlanta = (t) => D.wa('venda_principal', [abertura, '', [`Quero receber a planta técnica deste modelo.`, `Modelo: ${p.nome} (SKU ${p.sku})`, rotuloTam(t) ? `Tamanho: ${rotuloTam(t)}` : null, urlAbs].filter(Boolean).join('\n')].join('\n'));
    const cx = { D, produtos, tamanhos, esgotado, waCompra, waEsgotado, abertura, urlAbs };

    // Planta do tamanho inicial: fundo da etiqueta (poster) e, se o bloco 8 já gerou, o filme.
    const plIni = t0 || tamanhos[0] ? plantaDoTamanho(p, t0 || tamanhos[0]) : null;
    const filme = plIni?.validada && plIni.sha1 ? filmeDaPlanta(plIni.sha1) : null;
    // Fundo da etiqueta: a planta inteira em versão pequena (nível 0 dos blocos) no celular, onde ela
    // fica esmaecida atrás do texto, e a de 1200 px no desktop.
    const poster = plIni?.media ? (() => {
      const base = `media/plantas/${plIni.sha1}`;
      const z0 = plIni.media.niveis?.find((n) => n.z === 0 && n.colunas === 1 && n.linhas === 1);
      const temZ0 = z0 && existsSync(join(paths.public, base, 'z0', '0_0.webp'));
      return {
        src: url(`${base}/planta-1200.webp`),
        srcset: temZ0 ? `${url(`${base}/z0/0_0.webp`)} ${z0.largura}w, ${url(`${base}/planta-1200.webp`)} 1200w` : null,
      };
    })() : null;

    const eti = camposEtiqueta(p);
    const itens = p.d_itens_de_serie_exibidos || [];
    const faqs = faqsDoTipo(D, p.d_tipo);
    const pareci = parecidas(p, produtos);
    const relacionados = (p.produtos_relacionados || [])
      .map((r) => produtos.find((q) => q.url === r.url))
      .filter((q) => q && q.slug !== p.slug);
    const planta = !acessorio && tamanhos.length ? paineisPlanta(p, tamanhos, { waPlanta }) : null;
    const comEscala = !acessorio && tamanhos.length && (t0 || tamanhos[0]).a;
    const tituloEscala = p.d_tipo === 'banheira' ? 'Cabe no meu banheiro?' : 'Cabe no meu espaço?';

    const topo = html`<section class="sala prod-topo letterbox" aria-labelledby="prod-h1">
  <div class="prod-topo__fundo" aria-hidden="true">
    ${poster ? html`<img class="prod-topo__planta"${attrs({ src: poster.src, srcset: poster.srcset, sizes: poster.srcset ? POSTER_SIZES : null, width: 1200, height: Math.round((plIni.h / plIni.w) * 1200), alt: '', fetchpriority: 'high' })}>` : ''}
    ${filme ? html`<video class="prod-topo__filme" data-filme${attrs({ 'data-webm': filme.webm, 'data-mp4': filme.mp4, poster: filme.poster, 'aria-label': filme.aria })} muted playsinline loop preload="none"></video>` : ''}
  </div>
  <div class="wrap prod-topo__in">
    ${breadcrumb(trilha.map(({ nome, href }) => ({ nome, href })))}
    <p class="etiqueta prod-topo__cat" data-intro style="--i:0">Nº de catálogo <span class="num" data-campo="sku">${p.sku}</span></p>
    <h1 id="prod-h1" class="prod-topo__h1" data-intro="mascara" style="--i:1"><span data-campo="nome">${p.nome}</span></h1>
    ${eti.length ? html`<ul class="etiqueta prod-eti" role="list" data-intro style="--i:2">${eti.map((x) => html`<li><span data-campo="ficha-valor" data-ficha="${x.k}">${x.v}</span></li>`)}</ul>` : ''}
    <p class="prod-disp${esgotado ? ' prod-disp--esgotado' : ''}" data-intro style="--i:3"><span class="prod-disp__ponto" aria-hidden="true"></span><span data-campo="disponibilidade">${p.disponibilidade}</span></p>
    <p class="prod-resumo" data-intro style="--i:4"><span class="etiqueta">Ficha em uma frase</span><span data-campo="resumo">${p.d_resumo}</span></p>
  </div>
</section>`;

    const peca = html`<div class="sala prod${acessorio ? ' prod--curto' : ''}">
  <div class="wrap prod__grade">
    <section class="prod__peca" aria-label="Fotos do modelo">${galeria(p, fotos)}</section>
    <section class="prod__decisao dia" id="comprar" aria-labelledby="dec-h">
      <h2 class="vh" id="dec-h">Preço e opções</h2>
      ${decisao(p, { ...cx, aposPreco: html`${notaPrecosComoOpcao(p, produtos)}${versoes(p, fam)}` })}
    </section>
    ${planta ? html`<section class="prod__bloco prod__planta" id="planta" aria-labelledby="planta-h">
      <div class="prod__cab"><p class="etiqueta etiqueta--linha">${planta.temOficial ? 'Planta técnica oficial' : 'Desenho em escala'}</p>
      <h2 id="planta-h">${planta.temOficial ? 'O desenho é a obra' : 'As medidas, em escala'}</h2>
      <p class="prod__lead">${planta.temOficial ? 'A planta que a fábrica publica, com as cotas. Amplie, toque numa letra para achá-la no desenho e baixe o PDF.' : 'A fábrica não publicou a planta deste modelo. O desenho abaixo usa só as medidas do site.'}</p></div>
      ${planta.corpo}
      ${plantasAvulsas(p)}
    </section>` : ''}
    ${comEscala ? html`<section class="prod__bloco prod__escala" id="cabe" aria-labelledby="cabe-h">
      <div class="prod__cab"><p class="etiqueta etiqueta--linha">Escala real</p><h2 id="cabe-h">${tituloEscala}</h2>
      <p class="prod__lead">Digite as medidas do seu espaço. O desenho mostra a peça por cima, na mesma escala, e calcula a folga.</p></div>
      ${escala({ tamanho: t0 || tamanhos[0], tipo: p.d_tipo, segue: true })}
    </section>` : ''}
    ${itens.length ? html`<section class="prod__bloco prod__itens" id="itens" aria-labelledby="itens-h">
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
    ${relacionados.length ? html`<div class="relac"><p class="monte__rot">Relacionados na página atual</p><ul class="relac__lista" role="list">${relacionados.map((q) => html`<li><a class="chip" href="${url(`${q.slug}.html`)}">${q.nome}<span class="num">${q.preco.por}</span></a></li>`)}</ul></div>` : ''}
  </div>
</section>` : ''}
${avaliacao(p)}`;

    const corpo = html`${topo}${peca}${leitura}${doca(p, cx)}`;
    const og = existsSync(join(paths.public, 'media', 'og', `${p.slug}.jpg`)) ? { imagem: `media/og/${p.slug}.jpg`, tipo: 'product' } : { tipo: 'product' };
    const modulos = acessorio ? ['galeria', 'monte'] : ['galeria', 'monte', 'seletor', 'planta', 'escala'];
    const preload = poster ? [{ href: poster.src, as: 'image', type: 'image/webp', fetchpriority: 'high', imagesrcset: poster.srcset, imagesizes: poster.srcset ? POSTER_SIZES : null }] : [];
    out.push({
      saida,
      html: layout({
        saida,
        titulo: tituloProduto(p.nome),
        descricao: descricaoProduto(p, tamanhos, itens),
        corpo,
        og,
        jsonld: [jsonLd(p, { D, fotos, tamanhos, trilha, faqs, familia: fam, BASE })],
        modulos,
        ativo: raiz,
        sobre: true,
        esperar: 'prod-h1',
        preload,
        classe: 'pg-produto',
        critico: ['peca', 'produto'],
      }),
    });
  }
  return out;
}
