// Cartão de peça das coleções (SPEC 9.2): moldura com a foto e o --wall, nome literal, etiqueta
// "FORMA · LUGARES · MATERIAL · CONFIGURAÇÃO", medida do primeiro tamanho e "+N medidas", preço "por"
// e "de" riscado, selos "Planta oficial" e "Esgotado", contorno em escala e "Comparar".
// Os atributos data-* alimentam filtros, ordenação e "Ver em escala" (src/js/colecao.js); sem JS o
// cartão continua um link completo.
import { html, attrs, raw } from '../../build/lib/html.mjs';
import { url } from '../../build/lib/url.mjs';
import { picture, SIZES_CARTAO } from './foto.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { campo, CAMPOS_FACETA, fotoCartao, tamanhosProduto } from '../../build/lib/catalogo.mjs';
import { rotuloTam } from './planta.mjs';

/** Maior dimensão de encaixe (cm) entre todos os tamanhos de uma lista de produtos. */
export function escalaDaColecao(produtos) {
  let max = 0;
  for (const p of produtos) for (const { cm } of tamanhosProduto(p)) if (cm) max = Math.max(max, cm.maior);
  return Math.ceil(max) || 0;
}

/** Contorno do maior tamanho, na escala comum S (cm) da coleção; ancorado embaixo à esquerda. */
export function contorno(p, S) {
  const tams = tamanhosProduto(p).map((x) => x.cm).filter(Boolean);
  if (!tams.length || !S) return null;
  const t = tams.reduce((a, b) => (b.maior * b.menor > a.maior * a.menor ? b : a));
  // Selo com microlegenda "escala" (texto dentro do próprio SVG, sem deslocar nada): o contorno da peça vista
  // de cima, todos os cartões da coleção na mesma escala (a explicação fica acima da grade e na home). Peça
  // muito pequena perto da maior vira um traço curto: a escala é a real, nunca ampliada.
  const H = S * 1.3;
  return raw(`<svg class="cart__ctn" viewBox="0 0 ${S} ${H.toFixed(1)}" aria-hidden="true" focusable="false"><rect x=".5" y="${(S - t.menor + 0.5).toFixed(1)}" width="${Math.max(t.maior - 1, 1).toFixed(1)}" height="${Math.max(t.menor - 1, 1).toFixed(1)}" rx="2"/><text x="${(S / 2).toFixed(1)}" y="${(S * 1.25).toFixed(1)}" text-anchor="middle" font-size="${(S * 0.2).toFixed(1)}" letter-spacing="${(S * 0.015).toFixed(1)}">ESCALA</text></svg>`);
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
/** Grade das coleções: 2 colunas no celular, 2 no tablet e 3 no desktop (largura real do cartão). */
export const SIZES_GRADE = '(min-width:1024px) 400px, (min-width:600px) calc(50vw - 44px), calc(50vw - 22px)';

export function cartao(p, { pos = 0, S = 0, faixas = [], prioridade = false, lqip = true, foto = undefined, versoes = [], sizes = SIZES_CARTAO } = {}) {
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
  };
  const medida = t0 ? rotuloTam(t0.t) : '';
  return html`<li${attrs(dados)}>
<a class="cart__a" href="${url(`${p.slug}.html`)}">
<span class="cart__mol"${attrs({ style: f?.wall ? `--wall:${f.wall}` : null })}>${f ? picture(f, { classe: 'cart__img', sizes, prioridade, vt: p.slug }) : html`<span class="cart__vazia">Foto sob consulta</span>`}${contorno(p, S) || ''}</span>
${temPlanta || esgotado ? html`<span class="cart__selos">${temPlanta ? html`<span class="selo">Planta oficial</span>` : ''}${esgotado ? html`<span class="selo selo--esgotado">Esgotado</span>` : ''}</span>` : ''}
${eti.length ? html`<span class="cart__eti">${eti.join(' · ')}</span>` : ''}
<h3 class="cart__nome">${p.nome}</h3>
${versoes.length ? html`<span class="cart__vers">Também em ${versoes.join(' e ')}</span>` : ''}
${medida ? html`<span class="cart__med num">${medida}${tams.length > 1 ? html` <span>+${tams.length - 1} ${tams.length - 1 === 1 ? 'medida' : 'medidas'}</span>` : ''}</span>` : ''}
<span class="cart__preco num"><span data-campo="preco-por">${p.preco.por}</span>${p.preco.de ? html` <s class="preco-de" data-campo="preco-de">${p.preco.de}</s>` : ''}</span>
</a>
<button class="cart__cmp" type="button" data-comparar="${p.slug}" data-nome="${p.nome}" data-sku="${p.sku}" aria-pressed="false" data-so-js>${icone('comparar', { tamanho: 16 })}<span>Comparar</span></button>
</li>`;
}
