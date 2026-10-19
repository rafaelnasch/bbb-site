// A peça na moldura + galeria (SPEC 6.2 e 9.3, seção 3). Funciona sem JS: a foto principal aparece
// na moldura e as miniaturas são links para a foto maior. Com JS (src/js/galeria.js): troca na
// moldura, lupa até 2x no desktop (nunca acima do original), tela cheia com pinça até 2x, setas,
// teclado e arrasto. Fotos de fundo vermelho vêm depois das de fundo azul. Legenda fixa.
import { html, attrs } from '../../build/lib/html.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { picture, SIZES_PRODUTO } from './foto.mjs';

/** Ordena as fotos: fundo azul primeiro, fundo vermelho depois, mantendo a ordem da fonte. */
export function ordenarFotos(fotos) {
  return [...fotos.filter((f) => !f.vermelho), ...fotos.filter((f) => f.vermelho)];
}

/** Maior arquivo servido de uma foto (para a lupa e a tela cheia): { src, w }. */
export function maiorArquivo(foto) {
  let melhor = null;
  for (const f of foto.fontes) {
    if (f.type !== 'image/webp') continue;
    for (const item of f.srcset.split(/,\s+/)) {
      const [src, w] = item.trim().split(/\s+/);
      const n = Number.parseInt(w, 10);
      if (!melhor || n > melhor.w) melhor = { src, w: n };
    }
  }
  return melhor || { src: foto.src, w: foto.width };
}

/**
 * @param {object} p   produto de data/produtos.json
 * @param {Array}  fotos  fotosProduto(slug)
 */
export function galeria(p, fotos) {
  const lista = ordenarFotos(fotos);
  if (!lista.length) {
    return html`<div class="galeria galeria--vazia">
  <figure class="moldura moldura--peca moldura--vazia letterbox" data-vt-chegada="${p.slug}">
    <div class="moldura__vazia">${icone('ponto', { tamanho: 22 })}<p>Foto e planta deste modelo sob consulta</p></div>
  </figure>
</div>`;
  }
  const principal = lista[0];
  const wall = principal.wall ? `--wall:${principal.wall}` : null;
  const total = lista.length;
  return html`<div class="galeria" data-galeria data-n-fotos="${total}">
  <figure class="moldura moldura--peca letterbox"${attrs({ style: wall, 'data-vt-chegada': p.slug })}>
    <div class="galeria__palco" data-galeria-palco>
      ${lista.map((f, i) => {
        const m = maiorArquivo(f);
        return html`<a${attrs({
          class: 'galeria__foto',
          href: m.src,
          'data-galeria-item': i,
          'data-grande': m.src,
          'data-grande-w': m.w,
          'data-w': f.width,
          'data-h': f.height,
          'data-wall': f.wall || null,
          hidden: i > 0,
          'aria-label': `Ampliar a foto ${i + 1} de ${total}: ${f.alt}`,
        })}>${picture(f, { classe: 'moldura__img', sizes: SIZES_PRODUTO, prioridade: false })}</a>`;
      })}
      <span class="galeria__lupa" data-galeria-lupa aria-hidden="true" hidden></span>
    </div>
  </figure>
  <div class="galeria__base">
    <p class="moldura__leg">Imagem ilustrativa${total > 1 ? html` <span class="num" data-galeria-pos>· 1 de ${total}</span>` : ''}</p>
    <a class="galeria__cheia" href="${maiorArquivo(principal).src}" data-galeria-cheia>${icone('seta-diag', { tamanho: 16 })}Tela cheia</a>
  </div>
  ${total > 1
    ? html`<ol class="galeria__mini" role="list" aria-label="Fotos do modelo">${lista.map((f, i) => html`<li><a${attrs({
        class: 'galeria__mini-item',
        href: maiorArquivo(f).src,
        'data-galeria-mini': i,
        'aria-current': i === 0 ? 'true' : null,
        'aria-label': `Foto ${i + 1} de ${total}`,
      })}>${picture(f, { classe: 'galeria__mini-img', alt: '', sizes: '88px' })}</a></li>`)}</ol>`
    : ''}
</div>`;
}
