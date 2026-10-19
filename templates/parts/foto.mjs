// <picture> de uma foto do helper build/lib/midia.mjs (SPEC 7.1): width/height sempre, AVIF e WebP
// com srcset quando a mídia final existir, LQIP inline removido no load, lazy fora do primeiro viewport.
import { html, attrs } from '../../build/lib/html.mjs';

export const SIZES_CARTAO = '(min-width:1024px) 400px, (min-width:600px) 50vw, 100vw';
export const SIZES_PRODUTO = '(min-width:1024px) 640px, 100vw';

/**
 * @param foto  objeto de fotoProduto()
 * @param opts  { sizes, classe, prioridade: bool (LCP), alt (sobrescreve), vt, vtChegada }
 */
export function picture(foto, { sizes = SIZES_CARTAO, classe = '', prioridade = false, alt = null, vt = null, vtChegada = null, proporcao = false } = {}) {
  if (!foto) return html``;
  // proporcao: a proporção real da foto vai inline, para o espaço ficar reservado antes de a foto chegar
  // mesmo quando o CSS troca o aspect-ratio (moldura do produto: "auto", sem recorte).
  const estilo = [foto.lqip ? `background-image:url(${foto.lqip});background-size:cover` : null, proporcao && foto.width && foto.height ? `aspect-ratio:${foto.width}/${foto.height}` : null].filter(Boolean).join(';') || null;
  const img = html`<img${attrs({
    class: classe || null,
    src: foto.src,
    width: foto.width,
    height: foto.height,
    alt: alt ?? foto.alt ?? '',
    sizes: foto.fontes.length ? sizes : null,
    loading: prioridade ? null : 'lazy',
    decoding: prioridade ? null : 'async',
    fetchpriority: prioridade ? 'high' : null,
    style: estilo,
    'data-lqip': foto.lqip ? '' : null,
    'data-vt': vt,
    'data-vt-chegada': vtChegada,
  })}>`;
  if (!foto.fontes.length) return img;
  return html`<picture>${foto.fontes.map((f) => html`<source type="${f.type}" srcset="${f.srcset}"${attrs({ sizes })}>`)}${img}</picture>`;
}
