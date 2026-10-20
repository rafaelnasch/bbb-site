// Cartão de peça das coleções (SPEC 9.2): moldura com a foto e o --wall, nome literal, etiqueta
// "FORMA · LUGARES · MATERIAL · CONFIGURAÇÃO", medida do primeiro tamanho e "+N medidas", preço "por"
// e "de" riscado, selos "Planta oficial" e "Esgotado" na linha de metadados e "Comparar".
// Os atributos data-* alimentam filtros, ordenação e "Ver em escala" (src/js/colecao.js); sem JS o
// cartão continua um link completo.
import { html, attrs, raw } from '../../build/lib/html.mjs';
import { url } from '../../build/lib/url.mjs';
import { picture, SIZES_CARTAO } from './foto.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { campo, CAMPOS_FACETA, fotoCartao, tamanhosProduto } from '../../build/lib/catalogo.mjs';
import { rotuloTam } from './planta.mjs';

/** Maior tamanho (pela área) de cada peça, em cm: é o que o contorno do cartão desenha. */
function maiorTamanho(p) {
  const tams = tamanhosProduto(p).map((x) => x.cm).filter(Boolean);
  return tams.length ? tams.reduce((a, b) => (b.maior * b.menor > a.maior * a.menor ? b : a)) : null;
}

/**
 * Quadro comum dos contornos de uma lista de peças (cm): largura = maior comprimento e altura = maior
 * largura entre os tamanhos desenhados. Todas as peças entram na mesma escala nos dois eixos, então uma
 * peça quadrada sai quadrada e nenhuma é cortada.
 */
export function escalaDaColecao(produtos) {
  let S = 0, A = 0;
  for (const p of produtos) {
    const t = maiorTamanho(p);
    if (t) { S = Math.max(S, t.maior); A = Math.max(A, t.menor); }
  }
  return S ? { S: Math.ceil(S), A: Math.ceil(A) } : 0;
}

/**
 * --wall do cartão dentro de uma faixa estreita de azul-petróleo: a cor média das bordas de cada foto
 * (media-photos.mjs) variava muito de uma foto para outra e a grade parecia uma colagem. A foto não muda;
 * só o passe-partout e o halo da moldura ficam numa mesma luz.
 */
export function wallNaFaixa(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, sat = 0;
  if (d) {
    sat = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const lim = (v, a, z) => Math.min(z, Math.max(a, v));
  // Faixa: matiz 198 a 206, saturação 34% a 46%, luminosidade 18% a 24% (em volta do --room-2 elevado).
  const H = lim(h || 202, 198, 206), S = lim(sat, 0.34, 0.46), L = lim(l, 0.18, 0.24);
  const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m0 = L - c / 2;
  const [r1, g1, b1] = H < 240 && H >= 180 ? [0, x, c] : [0, c, x];
  return `#${[r1, g1, b1].map((v) => Math.round((v + m0) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Forma do desenho: elipse para "Redonda" (a ficha diz redonda), retângulo nas demais (medidas externas). */
function formaDoDesenho(p) {
  return /redond/i.test(campo(p, 'Forma') || '') ? 'elipse' : 'ret';
}

function figura(forma, x, y, w, h) {
  return forma === 'elipse'
    ? `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}"/>`
    : `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(w, h) * 0.06 > 1 ? (Math.min(w, h) * 0.06).toFixed(1) : 1}"/>`;
}

/**
 * Contorno do maior tamanho, no quadro comum Q = {S, A} (cm) da coleção: a peça vista de cima, apoiada
 * numa régua do comprimento da maior peça. Largura e altura usam a mesma escala (a razão real entre as
 * medidas publicadas); peça pequena perto da maior fica pequena (a escala é a real, nunca ampliada).
 */
export function contorno(p, Q) {
  const t = maiorTamanho(p);
  if (!t || !Q?.S) return null;
  const S = Q.S, r = S * 0.03, folga = r * 3;
  const H = Math.max(Q.A, t.menor) + folga;
  const w = Math.max(t.maior, 1), h = Math.max(t.menor, 1);
  const y0 = H - folga - h;
  return raw(`<svg class="cart__ctn" viewBox="-1 -1 ${S + 2} ${(H + 2).toFixed(1)}" aria-hidden="true" focusable="false">${figura(formaDoDesenho(p), 0, y0, w, h)}<path class="cart__ctn-regua" d="M0 ${(H - r).toFixed(1)}H${S}M0 ${(H - r * 2.2).toFixed(1)}V${H.toFixed(1)}M${S} ${(H - r * 2.2).toFixed(1)}V${H.toFixed(1)}"/></svg>`);
}

/** Cartão sem foto publicada: a peça desenhada pelas medidas do site, no lugar de uma caixa vazia. */
function desenhoSemFoto(p, medida) {
  const tams = tamanhosProduto(p).map((x) => x.cm).filter(Boolean);
  const nota = html`<span class="cart__vazia-txt"><span>Foto sob consulta</span>${medida ? html`<span class="num">${medida}</span>` : ''}</span>`;
  if (!tams.length) return html`<span class="cart__vazia">${nota}</span>`;
  const t = tams[0];
  const M = 100, k = 52 / t.maior, w = t.maior * k, h = t.menor * k;
  const svg = raw(`<svg class="cart__vazia-svg" viewBox="0 0 ${M} ${M}" aria-hidden="true" focusable="false">${figura(formaDoDesenho(p), (M - w) / 2, (M - h) / 2 - 12, w, h)}</svg>`);
  return html`<span class="cart__vazia cart__vazia--desenho">${svg}${nota}</span>`;
}

/**
 * @param p        produto de data/produtos.json
 * @param o.pos    posição na listagem atual (ordem padrão)
 * @param o.S      escala comum da coleção (cm), para o contorno
 * @param o.faixas índices das faixas de tamanho reais a que o produto pertence
 * @param o.prioridade  foto no primeiro viewport (sem lazy)
 * @param o.lqip   borrão inline (só nos primeiros cartões: abaixo da dobra, o fundo --wall da moldura
 *                 faz o papel de espera e o HTML da coleção fica no orçamento de 60 KB gzip)
 */
/** Grade das coleções: 2 colunas no celular, 2 no tablet, 3 no desktop e 4 a partir de 1200 px (largura real do cartão). */
export const SIZES_GRADE = '(min-width:1024px) 310px, (min-width:600px) calc(50vw - 44px), calc(50vw - 22px)';

/**
 * Versões irmãs presentes na mesma lista (família revisada em data/familias.csv): rótulo com o que muda
 * entre elas (material e configuração literais da ficha) e o preço "por" literal de cada uma.
 * @returns Map slug -> { id, itens:[{slug, rotulo, por}] } só para famílias com 2 ou mais peças na lista
 */
export function gruposDeVersoes(lista) {
  const fam = new Map();
  for (const p of lista) if (p.d_familia) fam.set(p.d_familia, [...(fam.get(p.d_familia) || []), p]);
  const out = new Map();
  for (const [id, ps] of fam) {
    if (ps.length < 2) continue;
    const variam = ['Material', 'Configuracao'].filter((k) => new Set(ps.map((q) => campo(q, k) || '')).size > 1);
    let itens = ps.map((q) => ({ slug: q.slug, rotulo: variam.map((k) => campo(q, k)).filter(Boolean).join(' · '), por: q.preco.por }));
    // Sem diferença legível na ficha (ou rótulos repetidos): o nº de catálogo literal distingue as versões.
    if (itens.some((x) => !x.rotulo) || new Set(itens.map((x) => x.rotulo)).size < itens.length) {
      itens = ps.map((q, i) => ({ ...itens[i], rotulo: q.sku ? `Nº ${q.sku}` : q.nome }));
    }
    const g = { id, itens };
    for (const q of ps) out.set(q.slug, g);
  }
  return out;
}

export function cartao(p, { pos = 0, S = 0, faixas = [], prioridade = false, lqip = true, foto = undefined, versoes = [], sizes = SIZES_CARTAO, grupo = null, agrupada = false, meta = true } = {}) {
  const f0 = foto === undefined ? fotoCartao(p.slug) : foto;
  const f = f0 && !lqip ? { ...f0, lqip: null } : f0;
  const tams = tamanhosProduto(p);
  const t0 = tams[0];
  const eti = CAMPOS_FACETA.map((k) => campo(p, k)).filter(Boolean);
  const esgotado = p.disponibilidade === 'Esgotado';
  const temPlanta = (p.d_planta || []).some((x) => x.pdf_path);
  const medidasCm = tams.filter((x) => x.cm).map((x) => `${x.cm.menor}:${x.cm.maior}`).join(',');
  const dados = {
    class: 'cart',
    'data-slug': p.slug,
    'data-pos': pos,
    'data-fo': campo(p, 'Forma') || '',
    'data-lu': campo(p, 'Lugares') || '',
    'data-ma': campo(p, 'Material') || '',
    'data-co': campo(p, 'Configuracao') || '',
    'data-p': p.d_preco_min ?? p.preco?.valores_numericos?.finalPrice ?? '',
    'data-t': medidasCm || null,
    'data-fx': faixas.length ? faixas.join(',') : null,
    // Rótulos literais dos tamanhos ("Toque num tamanho" nas respostas da coleção filtra por eles)
    'data-tr': tams.map((x) => x.rotulo).filter(Boolean).join('|') || null,
    // Sem foto publicada: vai para o fim da ordem padrão (colecao.js), sem sair da posição do catálogo (data-pos).
    'data-sf': f ? null : '1',
    // Versões irmãs: só a primeira da ordem aparece, com as outras em chips (colecao.js refaz ao filtrar).
    'data-gr': grupo ? grupo.id : null,
    'data-agrupada': agrupada ? '' : null,
  };
  const medida = t0 ? rotuloTam(t0.t) : '';
  // Redesenho (20/10/2026, rodada 2): sem o contorno em escala no cartão (lia como amostra de cor; a escala
  // fica no produto e em "Ver em escala"). Etiqueta e selos numa linha só de metadados, em texto, logo
  // abaixo da foto; na home (meta: false) o cartão leva só nome, medida e preço.
  const selos = [temPlanta ? html`<span class="selo">Planta oficial</span>` : '', esgotado ? html`<span class="selo selo--esgotado">Esgotado</span>` : ''].filter(Boolean);
  const linhaMeta = (meta && eti.length) || selos.length
    ? html`<span class="cart__meta">${meta && eti.length ? html`<span class="cart__eti">${eti.join(' · ')}</span>` : ''}${selos.length ? html`<span class="cart__selos">${selos}</span>` : ''}</span>`
    : '';
  return html`<li${attrs(dados)}>
<a class="cart__a" href="${url(`${p.slug}.html`)}">
<span class="cart__mol"${attrs({ style: f?.wall && !f.vermelho && wallNaFaixa(f.wall) ? `--wall:${wallNaFaixa(f.wall)}` : null })}>${f ? picture(f, { classe: 'cart__img', sizes, prioridade, vt: p.slug }) : desenhoSemFoto(p, medida)}</span>
${linhaMeta}
<h3 class="cart__nome">${p.nome}</h3>
${versoes.length ? html`<span class="cart__vers">Também em ${versoes.join(' e ')}</span>` : ''}
<span class="cart__base">
${medida ? html`<span class="cart__med num"><span class="cart__med-t">${medida}${tams.length > 1 ? html` <span>+${tams.length - 1} ${tams.length - 1 === 1 ? 'medida' : 'medidas'}</span>` : ''}</span></span>` : ''}
<span class="cart__preco num"><span data-campo="preco-por">${p.preco.por}</span>${p.preco.de ? html` <s class="preco-de" data-campo="preco-de">${p.preco.de}</s>` : ''}</span>
</span>
</a>
${grupo ? html`<div class="cart__vs" role="list" aria-label="Versões desta peça">${grupo.itens.map((v) => html`<span role="listitem" data-v="${v.slug}">${v.slug === p.slug
    ? html`<span class="cart__v" aria-current="true"><span>${v.rotulo}</span> <span class="num" data-campo="preco-por">${v.por}</span></span>`
    : html`<a class="cart__v" href="${url(`${v.slug}.html`)}"><span>${v.rotulo}</span> <span class="num" data-campo="preco-por">${v.por}</span></a>`}</span>`)}</div>` : ''}
<button class="cart__cmp" type="button" data-comparar="${p.slug}" data-nome="${p.nome}" data-sku="${p.sku}" aria-pressed="false" data-so-js>${icone('comparar', { tamanho: 16 })}<span>Comparar</span></button>
</li>`;
}
