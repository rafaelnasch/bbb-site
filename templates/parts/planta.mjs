// Explorador da planta oficial (SPEC 6.2 P0 e 9.3, seção 6) e desenho em escala para tamanhos sem
// planta publicada. Um painel por tamanho vendido; o seletor de tamanho mostra o painel escolhido.
//
// Sem JS: a planta aparece inteira (WebP 1200/2400, AVIF 2400), com a tabela de cotas e o PDF.
// Com JS (src/js/planta.js): blocos de 512 px até 3400 px, arrastar, pinça, roda (Ctrl), +/-,
// setas, 0 recentraliza, zoom de 1x a 6x e cotas clicáveis ligadas à tabela.
//
// Só plantas com cotas validadas (data/plantas/<sha1>.json: validada=true, e d_planta.cotas_validadas)
// ganham tabela clicável e marcadores. Os valores das cotas são o texto literal do PDF.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { html, attrs, raw } from '../../build/lib/html.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { url } from '../../build/lib/url.mjs';
import { lerJson } from '../../build/lib/dados.mjs';
import { fmtMetros } from '../../build/lib/medidas.mjs';
import { paths } from '../../site.config.mjs';

/** Rótulo exibido de um tamanho: o literal da opção ou, sem opção, a medida da ficha. */
export const rotuloTam = (t) => t?.rotulo ?? t?.rotulo_ficha ?? '';

/** Link interno para um PDF publicado (caminho com espaços e colchetes codificados). */
export function urlPdf(pdfPath) {
  return url(pdfPath.split('/').map(encodeURIComponent).join('/'));
}

let manifesto = null;
function mediaPlanta(sha1) {
  if (!manifesto) manifesto = lerJson('../public/media/plantas/manifest.json')?.plantas || {};
  const m = manifesto[sha1];
  if (!m || !existsSync(join(paths.public, 'media', 'plantas', sha1, 'planta-1200.webp'))) return null;
  return m;
}

/** Dados de uma planta: mídia, cotas validadas e PDF publicado. null se não houver PDF publicado. */
export function plantaDoTamanho(p, t) {
  const rot = rotuloTam(t);
  const dp = (p.d_planta || []).find((x) => x.rotulo === rot);
  if (!dp?.pdf_path || !existsSync(join(paths.public, dp.pdf_path))) return null;
  const media = dp.sha1 ? mediaPlanta(dp.sha1) : null;
  const j = dp.sha1 ? lerJson(`plantas/${dp.sha1}.json`) : null;
  const validada = Boolean(dp.cotas_validadas && j?.validada);
  return {
    sha1: dp.sha1,
    pdf: dp.pdf_path,
    nomeArquivo: dp.nome_arquivo || dp.pdf_path.split('/').pop(),
    media,
    validada,
    cotas: validada ? (j.cotas || []).filter((c) => c.letra && c.valor_texto) : [],
    w: media?.largura_px ?? j?.largura_px ?? null,
    h: media?.altura_px ?? j?.altura_px ?? null,
  };
}

/** "Cota B, 1,415 metro" (SPEC 6.2). */
export function falaCota(c) {
  const n = Number(c.valor_m);
  return `Cota ${c.letra}, ${c.valor_texto} ${n >= 2 ? 'metros' : 'metro'}`;
}

const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;

export function tabelaCotas(pl, id) {
  return html`<div class="cotas" data-cotas>
  <table class="cotas__tabela num">
    <caption class="cotas__cap">Cotas da planta oficial, em metros.</caption>
    <thead><tr><th scope="col">Cota</th><th scope="col">Medida</th></tr></thead>
    <tbody>${pl.cotas.map((c) => html`<tr data-cota-linha="${c.letra}">
      <th scope="row"><button class="cota-btn" type="button" data-cota="${c.letra}" aria-pressed="false" aria-controls="${id}" aria-label="${falaCota(c)}">${c.letra}</button></th>
      <td><span data-campo="planta-cota" data-cota-valor="${c.letra}">${c.valor_texto}</span> m</td>
    </tr>`)}</tbody>
  </table>
</div>`;
}

// No celular a imagem estática é a WebP de 1200 px (38 KB contra 51 KB da AVIF de 2400): o zoom fino vem
// dos blocos de 512 px do planta.js.
export function explorador(p, t, pl, id, { prioridade = false } = {}) {
  const m = pl.media;
  const base = `media/plantas/${pl.sha1}`;
  const temAvif = existsSync(join(paths.public, base, 'planta-2400.avif'));
  const tem2400 = existsSync(join(paths.public, base, 'planta-2400.webp'));
  const rot = rotuloTam(t);
  const alt = `Planta técnica oficial da ${p.nome}, tamanho ${rot}`;
  const marcas = pl.cotas.flatMap((c) => (c.posicoes?.length ? c.posicoes : [{ x: c.x, y: c.y }])
    .filter((ps) => Number.isFinite(ps.x) && Number.isFinite(ps.y))
    .map((ps) => html`<button class="cota-marca" type="button" tabindex="-1" aria-hidden="true" data-cota="${c.letra}" style="left:${pct(ps.x, pl.w)};top:${pct(ps.y, pl.h)}"><span>${c.letra}</span></button>`));
  return html`<figure class="explorador" id="${id}" data-explorador${attrs({
    'data-w': pl.w,
    'data-h': pl.h,
    'data-base': url(base),
    'data-tile': m.tile || 512,
    'data-niveis': JSON.stringify((m.niveis || []).map((n) => [n.z, n.largura, n.altura, n.colunas, n.linhas])),
    'data-rotulo': rot,
    'data-sha1': pl.sha1,
  })}>
  <div class="explorador__vista" data-vista tabindex="0" role="group" aria-roledescription="explorador de planta" aria-label="${alt}. Arraste para mover, use mais e menos para ampliar e zero para recentralizar." style="aspect-ratio:${pl.w}/${pl.h}">
    <div class="explorador__plano" data-plano>
      <picture>${temAvif ? html`<source type="image/avif" media="(min-width:600px)" srcset="${url(`${base}/planta-2400.avif`)} 2400w" sizes="(min-width:1024px) 760px, 100vw">` : ''}<img${attrs({
        class: 'explorador__img',
        src: url(`${base}/planta-1200.webp`),
        srcset: tem2400 ? `${url(`${base}/planta-1200.webp`)} 1200w, ${url(`${base}/planta-2400.webp`)} 2400w` : null,
        sizes: tem2400 ? '(min-width:1024px) 760px, 100vw' : null,
        width: pl.w,
        height: pl.h,
        alt,
        loading: prioridade ? null : 'lazy',
        decoding: 'async',
        draggable: 'false',
      })}></picture>
      <div class="explorador__blocos" data-blocos aria-hidden="true"></div>
      ${marcas}
    </div>
  </div>
  <div class="explorador__ctrl" data-so-js>
    <button class="explorador__b" type="button" data-zoom="-1" aria-label="Diminuir">${raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>')}</button>
    <span class="explorador__nivel num" data-nivel aria-hidden="true">1x</span>
    <button class="explorador__b" type="button" data-zoom="1" aria-label="Ampliar">${raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>')}</button>
    <button class="explorador__b explorador__b--texto" type="button" data-zoom="0">Recentralizar</button>
  </div>
  <figcaption class="explorador__leg">Planta oficial · tamanho <span class="num">${rot}</span></figcaption>
</figure>`;
}

/** Retângulo em escala a partir das medidas publicadas (planta baixa e vista lateral). */
export function desenhoEscala(t, { titulo }) {
  const a = Number(t.a), b = Number(t.b);
  if (!(a > 0 && b > 0)) return html``;
  const menor = Math.min(a, b) * 100, maior = Math.max(a, b) * 100;
  const prof = Number(t.c) > 0 ? Number(t.c) * 100 : null;
  const m = 26; // margem em cm para as cotas
  const W = maior + m * 2, H = menor + m * 2 + (prof ? prof + m * 1.5 : 0);
  const fs = Math.max(maior, 60) / 16;
  const rotA = fmtMetros(Math.max(a, b)), rotB = fmtMetros(Math.min(a, b)), rotC = prof ? fmtMetros(t.c) : null;
  const yLat = m * 2 + menor + m * 0.5;
  return html`<figure class="desenho">
  <svg class="desenho__svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" role="img" aria-label="${titulo}">
    <defs><pattern id="g10-${Math.round(maior)}-${Math.round(menor)}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width=".4"/></pattern></defs>
    <rect x="0" y="0" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="url(#g10-${Math.round(maior)}-${Math.round(menor)})"/>
    <rect class="desenho__peca" x="${m}" y="${m}" width="${maior.toFixed(1)}" height="${menor.toFixed(1)}" rx="3"/>
    <g class="desenho__cota" font-size="${fs.toFixed(1)}">
      <path d="M${m} ${m * 0.45}H${m + maior}M${m} ${m * 0.25}v${m * 0.4}M${m + maior} ${m * 0.25}v${m * 0.4}"/>
      <text x="${(m + maior / 2).toFixed(1)}" y="${(m * 0.32).toFixed(1)}" text-anchor="middle">${rotA} m</text>
      <path d="M${m * 0.55} ${m}V${m + menor}M${m * 0.35} ${m}h${m * 0.4}M${m * 0.35} ${m + menor}h${m * 0.4}"/>
      <text x="${(m * 0.4).toFixed(1)}" y="${(m + menor / 2).toFixed(1)}" text-anchor="middle" transform="rotate(-90 ${(m * 0.4).toFixed(1)} ${(m + menor / 2).toFixed(1)})">${rotB} m</text>
    </g>
    ${prof ? html`<rect class="desenho__peca desenho__peca--lat" x="${m}" y="${yLat.toFixed(1)}" width="${maior.toFixed(1)}" height="${prof.toFixed(1)}" rx="2"/>
    <g class="desenho__cota" font-size="${fs.toFixed(1)}"><path d="M${m + maior + m * 0.45} ${yLat.toFixed(1)}v${prof.toFixed(1)}"/><text x="${(m + maior + m * 0.6).toFixed(1)}" y="${(yLat + prof / 2).toFixed(1)}" text-anchor="middle" transform="rotate(-90 ${(m + maior + m * 0.6).toFixed(1)} ${(yLat + prof / 2).toFixed(1)})">${rotC} m</text></g>` : ''}
  </svg>
  <figcaption class="desenho__leg">Desenho em escala a partir das medidas do site. Não é a planta oficial.</figcaption>
</figure>`;
}

/** PDFs publicados na página do modelo cuja medida não corresponde a nenhum tamanho da lista de opções. */
export function plantasSemTamanho(p) {
  return (p.d_plantas_sem_tamanho || []).filter((x) => x.pdf_path && existsSync(join(paths.public, x.pdf_path)));
}

/**
 * Frases da seção 6 conforme o que a página atual publica (nunca afirmar que a fábrica não publicou
 * uma planta quando há PDF na página, mesmo com medida diferente: o conflito é mostrado, não resolvido).
 *  - oficial: algum tamanho tem planta publicada com a mesma medida;
 *  - divergente: a página publica PDF(s), mas nenhum com a medida de um tamanho vendido;
 *  - nenhuma: a página não publica PDF de planta.
 */
export function situacaoPlanta(p, tamanhos) {
  if (tamanhos.some((t) => plantaDoTamanho(p, t))) return 'oficial';
  if (plantasSemTamanho(p).length) return 'divergente';
  return 'nenhuma';
}

/**
 * Seção 6: um painel por tamanho. `waPlanta(t)` devolve o link wa.me para pedir a planta.
 * @returns {{ corpo, temOficial, situacao }}
 */
export function paineisPlanta(p, tamanhos, { waPlanta, ativo = 0 }) {
  const situacao = situacaoPlanta(p, tamanhos);
  const temAvulsas = plantasSemTamanho(p).length > 0;
  // Aviso do painel sem planta: uma frase só, adequada ao caso. Quando nenhum tamanho tem planta, o texto
  // da seção já diz isso (sem repetir no painel nem falar em "tamanho" onde não há escolha).
  const avisoSem = situacao !== 'oficial' ? null
    : temAvulsas ? 'Nenhuma planta publicada na página traz a medida deste tamanho.'
      : 'Planta deste tamanho não publicada pela fábrica.';
  const paineis = tamanhos.map((t, i) => {
    const pl = plantaDoTamanho(p, t);
    const id = `planta-${i}`;
    const rot = rotuloTam(t);
    let miolo;
    if (pl?.media) {
      miolo = html`${explorador(p, t, pl, id)}
      ${pl.validada && pl.cotas.length ? tabelaCotas(pl, id) : ''}
      <p class="planta__acoes"><a class="btn btn--claro" href="${urlPdf(pl.pdf)}" download data-planta-pdf>${icone('seta-diag', { tamanho: 18 })}Baixar a planta oficial (PDF)</a></p>`;
    } else if (pl) {
      miolo = html`<p class="planta__aviso">A planta oficial deste tamanho está disponível só em PDF.</p>
      ${desenhoEscala(t, { titulo: `Desenho em escala do tamanho ${rot}` })}
      <p class="planta__acoes"><a class="btn btn--claro" href="${urlPdf(pl.pdf)}" download data-planta-pdf>${icone('seta-diag', { tamanho: 18 })}Baixar a planta oficial (PDF)</a></p>`;
    } else {
      miolo = html`${avisoSem ? html`<p class="planta__aviso">${avisoSem}</p>` : ''}
      ${desenhoEscala(t, { titulo: `Desenho em escala do tamanho ${rot}, a partir das medidas do site` })}
      <p class="planta__acoes"><a${attrs({ class: 'btn btn--fantasma', href: waPlanta(t), target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'pedir_planta', 'data-sku': p.sku })}>${icone('whatsapp', { tamanho: 18 })}Pedir a planta pelo WhatsApp</a></p>`;
    }
    return html`<div class="planta-painel" data-tam-painel="${i}"${attrs({ hidden: i !== ativo, 'data-vt-fixo': i === ativo && p.d_familia ? `planta-${p.d_familia}` : null })}>${miolo}</div>`;
  });
  return { corpo: paineis, temOficial: situacao === 'oficial', situacao };
}

/** PDFs publicados na página do modelo sem tamanho correspondente na lista de opções. */
export function plantasAvulsas(p) {
  const lista = plantasSemTamanho(p);
  if (!lista.length) return html``;
  return html`<div class="planta__avulsas">
  <p class="etiqueta">Outras plantas publicadas na página deste modelo</p>
  <ul role="list">${lista.map((x) => html`<li><a class="link" href="${urlPdf(x.pdf_path)}" download>${x.nome_arquivo || x.pdf_path.split('/').pop()}</a></li>`)}</ul>
  <p class="pequeno">A medida no nome ${lista.length > 1 ? 'destes arquivos' : 'deste arquivo'} não corresponde a nenhum tamanho da lista de opções. Confirme com o consultor qual vale para o tamanho escolhido.</p>
</div>`;
}
