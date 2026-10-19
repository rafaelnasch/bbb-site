// Coleções (SPEC 9.2, 4 e 11): uma página por categoria de data/categorias.json, no mesmo caminho do
// site atual, com a mesma lista e a mesma ordem de produtos. Topo em sala escura (trilha, H1, frase
// factual calculada, filme da sala nas coleções raiz), barra de filtros fixa (dia), grade com todos os
// cartões no HTML (sem paginação) e, no rodapé, respostas diretas calculadas, perguntas do tema,
// coleções vizinhas e posts reais do blog.
//
// As duas categorias do Magento sem .html (catalog/category/view/id/130 e 131) são páginas-ponte
// (SPEC 4.1) e ficam com o template ponte; "frete-promocional" sai sem o texto da promoção vencida.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { html, attrs } from '../build/lib/html.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { formatBRL } from '../build/lib/money.mjs';
import { paths } from '../site.config.mjs';
import { breadcrumb } from './parts/breadcrumb.mjs';
import { cartao, escalaDaColecao, SIZES_GRADE } from './parts/cartao.mjs';
import { faqsDoTipo, faqBloco } from './parts/faq-bloco.mjs';
import { rotuloTam } from './parts/planta.mjs';
import {
  campo, CAMPOS_FACETA, ROTULO_CAMPO, CATEGORIAS_PONTE, RAIZ_TIPO, PLURAL_TIPO, fraseColecao, produtosDaCategoria, fotoCartao,
} from '../build/lib/catalogo.mjs';

// Coleções cujo texto atual é campanha vencida (SPEC 4: "frete-promocional.html sem o texto da promoção").
const SEM_TEXTO = new Set(['frete-promocional.html']);
const FILME_RAIZ = { 'banheiras.html': 'banheiras', 'spas.html': 'spas', 'ofuros.html': 'ofuros', 'sauna.html': 'saunas', 'lancamentos.html': 'lancamentos' };
const ORDENS = [
  ['posicao', 'Ordem do catálogo'],
  ['menor-medida', 'Menor medida'],
  ['maior-medida', 'Maior medida'],
  ['menor-preco', 'Menor preço'],
  ['maior-preco', 'Maior preço'],
  ['nome', 'Nome'],
];

const ORDEM_LUGARES = (v) => (/^individual/i.test(v) ? 1 : parseInt(v, 10) || 99);

/** Texto da categoria: o HTML quebrado em linhas vira prosa contínua (sem mudar palavra nenhuma). */
export function textoCategoria(t) {
  return String(t || '')
    .split('\n').map((l) => l.trim()).filter(Boolean).join(' ')
    .replace(/\s+([.,:;!?])/g, '$1')
    .trim();
}

/** Trilha: Início, as categorias-mãe que existem pelo caminho, a atual. */
function trilhaDe(cat, D) {
  const itens = [{ nome: 'Início', path: '' }];
  const partes = cat.d_path.replace(/\.html$/, '').split('/');
  for (let i = 1; i < partes.length; i++) {
    const p = `${partes.slice(0, i).join('/')}.html`;
    const mae = D.catPorPath.get(p);
    if (mae) itens.push({ nome: mae.nome, path: p });
  }
  itens.push({ nome: cat.nome, path: cat.d_path });
  return itens;
}

/** Filtro implícito da página como chip removível (link para a coleção raiz do tipo). */
function chipImplicito(cat, D) {
  const fi = cat.filtro_implicito || {};
  const raiz = fi.tipo && RAIZ_TIPO[fi.tipo];
  if (!raiz || raiz === cat.d_path) return null;
  const rot = fi.forma ? `Forma: ${fi.forma}`
    : fi.lugares ? `${fi.lugares.min} a ${fi.lugares.max} lugares`
      : fi.faixa_m ? `De ${String(fi.faixa_m.min.toFixed(2)).replace('.', ',')} a ${String(fi.faixa_m.max.toFixed(2)).replace('.', ',')} m`
        : null;
  if (!rot) return null;
  const nomeRaiz = D.catPorPath.get(raiz)?.nome || PLURAL_TIPO[fi.tipo];
  return html`<a class="col-chip" href="${url(raiz)}"><span>${rot}</span>${icone('x', { tamanho: 16 })}<span class="vh">Remover este filtro e ver todas as ${nomeRaiz}</span></a>`;
}

/** Faixas de tamanho reais (categorias "por tamanho" com faixa em metros) dos tipos presentes. */
function faixasReais(D, tipos) {
  return D.categorias.filter((c) => c.filtro_implicito?.faixa_m && tipos.has(c.filtro_implicito.tipo))
    .sort((a, b) => a.filtro_implicito.tipo.localeCompare(b.filtro_implicito.tipo) || a.filtro_implicito.faixa_m.min - b.filtro_implicito.faixa_m.min);
}

function valoresFaceta(produtos, k) {
  const cont = new Map();
  for (const p of produtos) {
    const v = campo(p, k);
    if (v) cont.set(v, (cont.get(v) || 0) + 1);
  }
  const vs = [...cont.entries()];
  if (k === 'Lugares') vs.sort((a, b) => ORDEM_LUGARES(a[0]) - ORDEM_LUGARES(b[0]));
  else vs.sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  return vs;
}

function formulario(cat, produtos, faixas, precoMin, precoMax) {
  const grupos = CAMPOS_FACETA.map((k) => ({ k, vs: valoresFaceta(produtos, k) })).filter((g) => g.vs.length > 1);
  const nomes = { Forma: 'fo', Lugares: 'lu', Material: 'ma', Configuracao: 'co' };
  const fx = faixas.map((c, i) => ({ c, i, n: produtos.filter((p) => (p.d_categorias_paths || []).includes(c.d_path)).length })).filter((x) => x.n > 0);
  const temMedida = produtos.some((p) => p.d_tipo !== 'acessorio' && p.d_maior);
  return html`<dialog class="gaveta gaveta--folha dia col-filtros" id="col-filtros" aria-labelledby="col-filtros-h">
  <div class="gaveta__topo"><h2 class="gaveta__titulo" id="col-filtros-h">Filtrar</h2><button class="gaveta__fechar" type="button" data-gaveta-fechar aria-label="Fechar filtros">${icone('x', { tamanho: 20 })}</button></div>
  <form class="gaveta__corpo col-form" data-col-form>
    <label class="col-ordem col-ordem--folha campo"><span class="campo__rot">Ordenar por</span><select data-col-ordem>${ORDENS.map(([v, t]) => html`<option value="${v}">${t}</option>`)}</select></label>
    ${grupos.map((g) => html`<fieldset class="col-fs"><legend class="col-fs__l">${ROTULO_CAMPO[g.k]}</legend><div class="col-ops">${g.vs.map(([v, n]) => html`<label class="col-op"><input type="checkbox" name="${nomes[g.k]}" value="${v}"><span>${v} <span class="num">${n}</span></span></label>`)}</div></fieldset>`)}
    ${fx.length > 1 ? html`<fieldset class="col-fs"><legend class="col-fs__l">Faixa de tamanho</legend><div class="col-ops">${fx.map(({ c, i, n }) => html`<label class="col-op"><input type="checkbox" name="fx" value="${i}"><span>${c.nome} <span class="num">${n}</span></span></label>`)}</div></fieldset>` : ''}
    ${precoMax > precoMin ? html`<fieldset class="col-fs"><legend class="col-fs__l">Preço até</legend>
      <input class="col-faixa" type="range" name="ate" min="${Math.floor(precoMin)}" max="${Math.ceil(precoMax)}" step="1" value="${Math.ceil(precoMax)}" aria-label="Preço até" aria-describedby="col-ate-v">
      <p class="col-faixa__v num"><output id="col-ate-v" data-col-ate>Sem limite</output><span>de ${formatBRL(precoMin)} a ${formatBRL(precoMax)}, pelo menor preço publicado de cada peça</span></p></fieldset>` : ''}
    ${temMedida ? html`<fieldset class="col-fs"><legend class="col-fs__l">Cabe em (cm)</legend>
      <div class="escala__linha"><label class="campo"><span class="campo__rot">Largura</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" name="l" placeholder="ex.: 90" autocomplete="off"></label><span class="escala__x" aria-hidden="true">x</span><label class="campo"><span class="campo__rot">Comprimento</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" name="c" placeholder="ex.: 170" autocomplete="off"></label></div>
      <p class="col-nota">Usa só as medidas externas publicadas, com a peça podendo girar. Confirme a instalação com a planta oficial e com a equipe pelo WhatsApp.</p></fieldset>` : ''}
    <div class="col-form__base"><button class="btn btn--fantasma" type="reset">Limpar</button><button class="btn" type="submit" data-gaveta-fechar>Mostrar <span class="num" data-col-n-btn>${produtos.length}</span> peças</button></div>
  </form>
</dialog>`;
}

/** Respostas diretas calculadas (SPEC 11.4). */
function respostas(cat, produtos) {
  const tipos = new Set(produtos.map((p) => p.d_tipo));
  if (tipos.has('acessorio') && tipos.size === 1) return html``;
  const porTam = new Map();
  for (const p of produtos) for (const t of p.d_tamanhos || []) {
    const r = rotuloTam(t);
    if (!r) continue;
    if (!porTam.has(r)) porTam.set(r, { r, ps: new Set(), a: Math.max(t.a || 0, t.b || 0), m: Math.min(t.a || 0, t.b || 0) });
    porTam.get(r).ps.add(p.slug);
  }
  const tams = [...porTam.values()].map((t) => ({ ...t, n: t.ps.size })).sort((a, b) => a.a - b.a || a.m - b.m || a.r.localeCompare(b.r));
  const lug = valoresFaceta(produtos, 'Lugares');
  const mat = valoresFaceta(produtos, 'Material');
  const conf = valoresFaceta(produtos, 'Configuracao');
  const nomeMin = cat.nome.toLocaleLowerCase('pt-BR') === cat.nome ? cat.nome : cat.nome.charAt(0) + cat.nome.slice(1).toLocaleLowerCase('pt-BR');
  return html`<section class="col-resp" aria-labelledby="col-resp-h">
  <h2 id="col-resp-h">Respostas sobre ${nomeMin}</h2>
  ${tams.length ? html`<div class="col-resp__b"><h3>Quais tamanhos existem nesta coleção?</h3>
    <p>${tams.length} ${tams.length === 1 ? 'tamanho publicado' : 'tamanhos publicados'}, como aparecem nas opções de cada peça (largura x comprimento x profundidade, em metros). Toque num tamanho para ver os modelos desta coleção.</p>
    <ul class="col-tams num" role="list">${tams.map((t) => html`<li><a href="${url(`${cat.d_path}?tam=${encodeURIComponent(t.r)}`)}" data-col-tam="${t.r}">${t.r}<span>${t.n} ${t.n === 1 ? 'modelo' : 'modelos'}</span></a></li>`)}</ul></div>` : ''}
  ${lug.length ? html`<div class="col-resp__b"><h3>Para quantas pessoas?</h3>
    <p>Pela ficha técnica de cada peça: ${lug.map(([v, n], i) => html`${i ? (i === lug.length - 1 ? ' e ' : ', ') : ''}<b>${n}</b> ${n === 1 ? 'peça' : 'peças'} ${/^individual/i.test(v) ? 'individual' + (n === 1 ? '' : 'is') : `de ${v.toLocaleLowerCase('pt-BR')}`}`)}.</p></div>` : ''}
  ${mat.length || conf.length ? html`<div class="col-resp__b"><h3>Qual a diferença entre as versões?</h3>
    <p>${mat.length ? html`Material: ${mat.map(([v, n], i) => html`${i ? ' e ' : ''}<b>${n}</b> em ${v}`)}. ` : ''}${conf.length ? html`Configuração: ${conf.map(([v, n], i) => html`${i ? ' e ' : ''}<b>${n}</b> ${v}`)}.` : ''}</p>
    <p class="col-resp__links"><a class="link" href="${url('guia/gel-coat-ou-acrilico.html')}">Gel coat ou acrílico?</a><a class="link" href="${url('guia/basica-ou-completa.html')}">Básica ou Completa?</a></p></div>` : ''}
</section>`;
}

function vizinhas(cat, D) {
  const raiz = cat.d_path.split('/')[0].replace(/\.html$/, '');
  const tipo = cat.filtro_implicito?.tipo;
  return D.categorias.filter((c) => c.d_path !== cat.d_path && !CATEGORIAS_PONTE.includes(c.d_path)
    && (c.d_path.startsWith(`${raiz}/`) || c.d_path === `${raiz}.html` || (tipo && c.filtro_implicito?.tipo === tipo && !c.d_path.includes('/'))))
    .slice(0, 14);
}

/**
 * Nome de busca da coleção, a partir do nome literal e da trilha real: "3 a 4 Lugares" sob Spas vira
 * "Spas de 3 a 4 lugares"; "Por Tamanho" sob Sauna vira "Sauna por tamanho"; "Kids" na raiz, com só
 * banheiras na lista, vira "Banheiras Kids". Nenhuma palavra que não esteja no nome, na trilha ou no tipo.
 */
export function nomeDeBusca(cat, trilha, tipos) {
  let n = String(cat.nome).trim();
  if (n.length > 3 && n === n.toLocaleUpperCase('pt-BR')) n = n[0] + n.slice(1).toLocaleLowerCase('pt-BR');
  const temTipo = /banheir|spa|ofur|sauna/i.test(n);
  const pai = trilha.length > 2 ? trilha[trilha.length - 2].nome : null;
  const minus = (x) => (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(x) ? x[0].toLocaleLowerCase('pt-BR') + x.slice(1) : x);
  if (pai && /^por tamanho$/i.test(n)) return `${pai} por tamanho`;
  // Subcoleção de uma página de palavra-chave (Ofurô com hidro sob Ofurô Externo): junta as duas.
  const paiPath = trilha.length > 2 ? trilha[trilha.length - 2].path : null;
  if (pai && temTipo && !Object.values(RAIZ_TIPO).includes(paiPath) && !/^por tamanho$/i.test(pai)) {
    const [p0, ...pr] = n.split(' ');
    return p0 === pai.split(' ')[0] ? `${pai} ${pr.join(' ')}` : `${n} (${pai})`;
  }
  if (pai && !temTipo && !/^por tamanho$/i.test(pai)) return /^\d/.test(n) ? `${pai} de ${minus(n).replace(/ Lugares$/i, ' lugares')}` : `${pai} ${minus(n)}`;
  if (!pai && !temTipo && tipos.size === 1 && !/\s/.test(n)) {
    const t = PLURAL_TIPO[[...tipos][0]];
    if (t) return `${t[0].toLocaleUpperCase('pt-BR')}${t.slice(1)} ${n}`;
  }
  return n;
}

/**
 * <title> da coleção (SPEC 11.1): o título atual da empresa quando existe e é forte; senão, um gerado
 * a partir do nome de busca, mantendo a palavra-chave que a página já mira. Fraco = ausente (cortado pelo
 * filtro editorial), curto (até 20 caracteres), todo em caixa alta, começando por número ou no padrão
 * automático "X - Por Tamanho - Y" do Magento.
 */
export function tituloColecao(cat, trilha, tipos) {
  const t = String(cat.d_meta_exibida?.title || '').replace(/\s+/g, ' ').trim();
  const fraco = !t || t.length <= 20 || t === t.toLocaleUpperCase('pt-BR') || /^\d/.test(t) || / - Por Tamanho - /i.test(t);
  if (!fraco) return t;
  let n = nomeDeBusca(cat, trilha, tipos);
  // Coleção raiz cujo título foi cortado (superlativo): o trecho literal sem superlativo do título atual.
  if (!t && trilha.length === 2 && cat.meta?.title) {
    const seg = String(cat.meta.title).split(/\s+-\s+/)[0].trim();
    if (seg && seg !== cat.meta.title && !/melhor|maior|única|unica/i.test(seg)) n = seg;
  }
  for (const suf of [' | Banheiras Bom Banho', ' | BBB']) if ((n + suf).length <= 60) return n + suf;
  return n.slice(0, 60);
}

function descricaoGerada(cat, frase, nome = cat.nome) {
  let d = `${nome}: ${frase}. Fotos, medidas, planta oficial e preços publicados pela fábrica. Compra pelo WhatsApp com consultor.`;
  if (d.length > 160) d = `${nome}: ${frase}. Medidas, planta e preços publicados; compra pelo WhatsApp.`;
  if (d.length > 160) d = `${d.slice(0, 157).replace(/\s+\S*$/, '')}...`;
  return d;
}

export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const produtos = D.ler('produtos.json');
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));
  const blog = (D.ler('blog-recentes.json')?.recentes || []).filter((b) => b.exibir).slice(0, 3);
  const filmes = (() => {
    const p = join(paths.public, 'media', 'filmes', 'manifest.json');
    try { return existsSync(p) ? D.ler('../public/media/filmes/manifest.json') : null; } catch { return null; }
  })();
  const temAgua = Boolean(ctx.assets?.modulos?.agua);
  const out = [];

  for (const cat of D.categorias) {
    if (CATEGORIAS_PONTE.includes(cat.d_path)) continue;
    const lista = produtosDaCategoria(cat, porSlug);
    const tipos = new Set(lista.map((p) => p.d_tipo));
    const S = escalaDaColecao(lista);
    const faixas = faixasReais(D, tipos);
    const precos = lista.map((p) => p.d_preco_min ?? p.preco?.valores_numericos?.finalPrice).filter((x) => x > 0);
    const pMin = precos.length ? Math.min(...precos) : 0, pMax = precos.length ? Math.max(...precos) : 0;
    const frase = fraseColecao(lista, cat.total_exibido);
    const trilha = trilhaDe(cat, D);
    const texto = SEM_TEXTO.has(cat.d_path) ? '' : textoCategoria(cat.d_descricao_exibida);
    const tipoUnico = tipos.size === 1 ? [...tipos][0] : null;
    const faqs = tipoUnico ? faqsDoTipo(D, tipoUnico) : [];
    const viz = vizinhas(cat, D);
    const chip = chipImplicito(cat, D);
    const idFilme = FILME_RAIZ[cat.d_path];
    const fm = idFilme && filmes?.colecao?.[idFilme];
    const filme = fm?.webm?.src && fm?.mp4?.src && fm?.poster && [fm.webm.src, fm.mp4.src].every((s) => existsSync(join(paths.public, s)))
      ? { webm: url(fm.webm.src), mp4: url(fm.mp4.src), avif: fm.poster.avif?.src ? url(fm.poster.avif.src) : null, webp: fm.poster.webp?.src ? url(fm.poster.webp.src) : null, w: fm.largura || 1280, h: fm.altura || 720 }
      : null;

    const fundo = filme ? html`<div class="col-topo__fundo" aria-hidden="true"><div class="col-topo__filme">${filme.avif ? html`<picture><source type="image/avif" srcset="${filme.avif}">` : ''}<img class="col-topo__poster"${attrs({ src: filme.webp || filme.avif, width: filme.w, height: filme.h, alt: '' })}>${filme.avif ? html`</picture>` : ''}<video class="col-topo__video" data-filme${attrs({ 'data-webm': filme.webm, 'data-mp4': filme.mp4, width: filme.w, height: filme.h })} muted playsinline loop preload="none"></video></div></div>`
      : html`<div class="col-topo__fundo col-topo__fundo--agua" aria-hidden="true"${attrs({ 'data-agua': temAgua ? '' : null })}></div>`;

    // Atalhos das subcoleções da mesma raiz, com a contagem real (total_exibido), logo abaixo do título.
    const raizPath = `${cat.d_path.split('/')[0].replace(/\.html$/, '')}.html`;
    const subs = D.categorias.filter((c) => !CATEGORIAS_PONTE.includes(c.d_path) && c.d_path.startsWith(raizPath.replace(/\.html$/, '/'))
      && c.total_exibido > 0 && !/^por tamanho$/i.test(String(c.nome).trim()) && c.d_path.split('/').length === 2).slice(0, 12);
    const subsRot = `Coleções de ${String(D.catPorPath.get(raizPath)?.nome || cat.nome).toLocaleLowerCase('pt-BR')}`;
    // Rápidos: forma e lugares, que filtram a grade direto (mesmos campos da gaveta de filtros).
    const rapidos = ['Forma', 'Lugares'].map((k) => ({ k, vs: valoresFaceta(lista, k) })).filter((g) => g.vs.length > 1);
    const topo = html`<section class="sala col-topo letterbox${filme ? ' col-topo--filme' : ''}" aria-labelledby="col-h1">
  ${fundo}
  <div class="wrap col-topo__in">
    ${breadcrumb(trilha.map((t, i) => ({ nome: t.nome, href: i < trilha.length - 1 ? url(t.path) : null })))}
    <p class="etiqueta etiqueta--linha" data-intro style="--i:0">Coleção</p>
    <h1 id="col-h1" class="col-topo__h1" data-intro="mascara" style="--i:1">${cat.nome}</h1>
    <p class="col-topo__frase" data-intro style="--i:2"><span class="num" data-campo="categoria-total">${frase.split(' ')[0]}</span>${frase.slice(frase.indexOf(' '))}.</p>
    ${chip ? html`<p class="col-topo__chips" data-intro style="--i:3"><span class="vh">Filtro desta página:</span>${chip}</p>` : ''}
    ${subs.length ? html`<nav class="col-subs" aria-label="${subsRot}" data-intro style="--i:3"><div class="rolagem col-subs__rol" tabindex="-1"><ul class="col-subs__lista" role="list">${subs.map((c) => html`<li><a class="col-chip col-chip--sub" href="${url(c.d_path)}"${attrs({ 'aria-current': c.d_path === cat.d_path ? 'page' : null })}><span>${c.nome}</span><span class="num" data-campo="categoria-total">${c.total_exibido}</span></a></li>`)}</ul></div></nav>` : ''}
    ${texto ? html`<details class="col-sobre" data-intro style="--i:4"><summary>Sobre esta coleção</summary><p class="prosa" data-campo="categoria-descricao">${texto}</p></details>` : ''}
  </div>
</section>`;

    const barra = html`<div class="dia col-barra" data-col-barra>
  <div class="wrap col-barra__in">
    <p class="col-barra__n" aria-live="polite"><span class="num" data-col-n>${lista.length}</span> <span data-col-n-txt>${lista.length === 1 ? 'peça' : 'peças'}</span></p>
    <div class="col-barra__acoes" data-so-js>
      <button class="col-btn" type="button" data-gaveta-abrir="col-filtros" aria-haspopup="dialog" aria-expanded="false">${icone('menu', { tamanho: 18 })}Filtrar<span class="col-btn__n num" data-col-nf hidden></span></button>
      <label class="col-ordem col-ordem--barra"><span class="vh">Ordenar por</span><select data-col-ordem>${ORDENS.map(([v, t]) => html`<option value="${v}">${t}</option>`)}</select></label>
      ${S ? html`<button class="col-btn" type="button" data-col-escala aria-expanded="false" aria-controls="col-escala">${icone('regua', { tamanho: 18 })}<span><span class="col-btn__x">Ver em </span><span class="col-btn__e">escala</span></span></button>` : ''}
    </div>
  </div>
  <div class="wrap col-ativos" data-col-ativos hidden></div>
</div>`;

    const grade = html`<section class="dia col-pecas" aria-labelledby="col-pecas-h">
  <h2 class="vh" id="col-pecas-h">Peças da coleção ${cat.nome}</h2>
  <div class="wrap">
    ${S ? html`<div class="col-escala sala" id="col-escala" data-col-escala-painel hidden>
      <div class="col-escala__cab"><p class="etiqueta etiqueta--linha">Mesma escala, do menor ao maior</p><p class="col-escala__txt" data-col-escala-txt></p></div>
      <div class="rolagem col-escala__rol" tabindex="0" role="region" aria-label="Peças em escala, role para os lados"><ol class="col-escala__lista" role="list" data-col-escala-lista></ol></div>
      <p class="escala__aviso"><span data-col-escala-aviso>O desenho usa só as medidas externas publicadas, com o maior tamanho de cada peça.</span> Confirme a instalação com a planta oficial e com a equipe pelo WhatsApp.</p>
    </div>` : ''}
    ${rapidos.length ? html`<div class="col-rapidos"><div class="rolagem col-rapidos__rol"><ul class="col-rapidos__lista" role="list">${rapidos.flatMap((g) => g.vs.map(([v, n]) => html`<li><button class="col-chip col-chip--rap" type="button" data-col-rapido="${{ Forma: 'fo', Lugares: 'lu' }[g.k]}" data-valor="${v}" aria-pressed="false">${v}<span class="num">${n}</span></button></li>`))}</ul></div></div>` : ''}
    ${S ? html`<p class="col-legenda"><span class="col-legenda__selo" aria-hidden="true">escala</span>O selo mostra a peça vista de cima, todas na mesma escala.</p>` : ''}
    <ol class="col-grade" role="list" data-col-grade>${(() => {
      // Cartões vizinhos não repetem a mesma foto (versões irmãs têm a mesma galeria): cada cartão evita
      // as fotos dos dois anteriores, quando a própria galeria tiver outra.
      const recentes = [];
      return lista.map((p, i) => {
        const fx = faixas.map((c, j) => ((p.d_categorias_paths || []).includes(c.d_path) ? j : -1)).filter((j) => j >= 0);
        const foto = fotoCartao(p.slug, new Set(recentes));
        recentes.push(foto?.sha1 || null);
        if (recentes.length > 2) recentes.shift();
        return cartao(p, { pos: i, S, faixas: fx, prioridade: i < 2, lqip: i < 6, foto, sizes: SIZES_GRADE });
      });
    })()}</ol>
    <div class="col-vazio" data-col-vazio hidden>
      <p class="col-vazio__t">Nenhuma peça desta coleção atende a todos os filtros.</p>
      <p><button class="btn btn--fantasma" type="button" data-col-limpar>Limpar os filtros</button> <a class="btn" href="${url('escolher.html')}">${icone('regua', { tamanho: 18 })}Escolher pelo meu espaço</a></p>
    </div>
  </div>
</section>`;

    const rodape = html`<section class="dia dia--areia secao col-rodape">
  <div class="wrap col-rodape__in">
    ${respostas(cat, lista)}
    ${faqs.length ? html`<section class="col-faq" aria-labelledby="col-faq-h"><h2 id="col-faq-h">Perguntas frequentes</h2>${faqBloco(faqs)}<p><a class="link" href="${url('perguntas-frequentes.html')}">Todas as perguntas</a></p></section>` : ''}
    ${viz.length ? html`<nav class="col-viz" aria-labelledby="col-viz-h"><h2 id="col-viz-h">Coleções vizinhas</h2><ul class="col-viz__lista" role="list">${viz.map((c) => html`<li><a class="chip" href="${url(c.d_path)}">${c.nome} <span class="num">${c.total_exibido}</span></a></li>`)}</ul></nav>` : ''}
    ${blog.length ? html`<section class="col-blog" aria-labelledby="col-blog-h"><h2 id="col-blog-h">Do blog</h2><ul class="col-blog__lista" role="list">${blog.map((b) => html`<li><a${attrs({ href: b.url, rel: 'noopener', target: '_blank' })}><span class="col-blog__t">${b.titulo}</span><span class="col-blog__r">${b.resumo}</span></a></li>`)}</ul></section>` : ''}
  </div>
</section>`;

    const meta = cat.d_meta_exibida || {};
    const titulo = tituloColecao(cat, trilha, tipos);
    // Descrição atual da empresa quando existe e não é só o título repetido; senão, gerada dos dados.
    const dAtual = String(meta.description || '').replace(/\s+/g, ' ').trim();
    const descricao = dAtual && dAtual.length >= 70 && dAtual !== String(meta.title || '').trim() ? dAtual : descricaoGerada(cat, frase, nomeDeBusca(cat, trilha, tipos));
    const jsonld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${abs(cat.d_path)}#colecao`,
          name: cat.nome,
          url: abs(cat.d_path),
          description: descricao,
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: lista.length,
            itemListOrder: 'https://schema.org/ItemListOrderAscending',
            itemListElement: lista.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`${p.slug}.html`), name: p.nome })),
          },
        },
        { '@type': 'BreadcrumbList', itemListElement: trilha.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.nome, item: abs(t.path) })) },
      ],
    };
    // Sem filme, a primeira foto da grade costuma ser o LCP: pré-carregada com o mesmo srcset e sizes do
    // cartão (SPEC 12: LCP da coleção é o H1 ou a primeira foto).
    // Com filme, o poster é o LCP só no desktop (no celular ele é fundo esmaecido e a foto do cartão é o LCP).
    const f0 = lista[0] ? fotoCartao(lista[0].slug) : null;
    const av0 = f0?.fontes?.find((x) => x.type === 'image/avif');
    const preCartao = av0 ? { as: 'image', type: 'image/avif', fetchpriority: 'high', imagesrcset: av0.srcset, imagesizes: SIZES_GRADE } : null;
    const preload = filme?.avif
      ? [{ href: filme.avif, as: 'image', type: 'image/avif', fetchpriority: 'high', media: '(min-width:1024px)' }, ...(preCartao ? [{ ...preCartao, media: '(max-width:1023px)' }] : [])]
      : preCartao ? [preCartao] : [];
    out.push({
      saida: cat.d_path,
      html: layout({
        saida: cat.d_path,
        titulo,
        descricao,
        corpo: html`${topo}${barra}${grade}${formulario(cat, lista, faixas, pMin, pMax)}${rodape}`,
        og: existsSync(join(paths.public, 'media', 'og', `${cat.d_path.replace(/\.html$/, '').replace(/\//g, '--')}.jpg`))
          ? { imagem: `media/og/${cat.d_path.replace(/\.html$/, '').replace(/\//g, '--')}.jpg` } : {},
        jsonld: [jsonld],
        modulos: temAgua && !filme ? ['colecao', 'agua'] : ['colecao'],
        ativo: trilha[1]?.path || cat.d_path,
        sobre: true,
        preload,
        classe: 'pg-colecao',
        critico: ['colecao'],
        // LCP é a foto (poster ou primeiro cartão): as fontes (90 KB) e o site.css só são pedidos depois
        // da primeira pintura (o texto usa o fallback com métrica ajustada até lá, sem CLS) e o JS vai em
        // prioridade baixa, para nada disputar banda com a foto.
        fontes: [],
        cssAposPintura: true,
        fontesAposPintura: true,
        jsBaixa: true,
      }),
    });
  }
  return out;
}
