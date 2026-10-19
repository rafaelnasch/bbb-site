// "Cabe no meu banheiro?" (SPEC 6.2 P0): desenho em escala real sobre grade de 10 cm, com o espaço do
// cliente por cima e a folga calculada. Só usa as medidas externas publicadas; nada é estimado.
// O SVG inicial (a peça sozinha) sai no build e funciona sem JS; src/js/escala.js redesenha com o
// espaço digitado, a vista lateral (ou frontal, nas saunas) e a silhueta opcional pela altura digitada.
//
// Reutilizável: escolhedor, comparador e coleção montam o mesmo bloco com escala({...}).
import { html, attrs } from '../../build/lib/html.mjs';
import { fmtMetros } from '../../build/lib/medidas.mjs';

export const AVISO_ESCALA = 'O cálculo usa só as medidas externas publicadas. Confirme a instalação com a planta oficial e com a equipe pelo WhatsApp.';

/** Medidas usadas no encaixe de um tamanho: { menor, maior } em metros, já com a regra da maior medida. */
export function medidasEncaixe(t) {
  if (t?.encaixe?.menor && t?.encaixe?.maior) return { menor: t.encaixe.menor, maior: t.encaixe.maior };
  const a = Number(t?.a), b = Number(t?.b);
  if (!(a > 0 && b > 0)) return null;
  return { menor: Math.min(a, b), maior: Math.max(a, b) };
}

/** Atributos de dados de um tamanho, lidos pelo escala.js e pelo seletor.js. */
export function dadosTamanho(t) {
  const e = medidasEncaixe(t);
  return {
    'data-a': t?.a ?? null,
    'data-b': t?.b ?? null,
    'data-c': t?.c ?? null,
    'data-altura': t?.altura ?? null,
    'data-menor': e?.menor ?? null,
    'data-maior': e?.maior ?? null,
    'data-confirmar': t?.ficha ? '1' : null,
  };
}

/** SVG inicial da peça (planta baixa) em escala, sobre a grade de 10 cm. */
function svgInicial(e) {
  const maior = e.maior * 100, menor = e.menor * 100, m = 20;
  const W = maior + 2 * m, H = menor + 2 * m;
  return html`<svg class="escala__svg" data-escala-svg viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" role="img" aria-label="Peça em escala: ${fmtMetros(e.maior)} m por ${fmtMetros(e.menor)} m, sobre uma grade de 10 cm">
  <defs><pattern id="escala-grade" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width=".35"/></pattern></defs>
  <rect width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="url(#escala-grade)"/>
  <rect class="escala__peca" x="${m}" y="${m}" width="${maior.toFixed(1)}" height="${menor.toFixed(1)}" rx="2.5"/>
</svg>`;
}

/**
 * @param {object} o
 * @param {object} o.tamanho   item de d_tamanhos (o selecionado)
 * @param {string} o.tipo      d_tipo (sauna troca a vista lateral pela frontal)
 * @param {string} [o.id]      prefixo dos ids
 * @param {boolean} [o.segue]  acompanha o seletor de tamanho da página (evento bbb:tamanho)
 */
export function escala({ tamanho, tipo, id = 'escala', segue = false }) {
  const e = medidasEncaixe(tamanho);
  if (!e) return html``;
  const sauna = tipo === 'sauna';
  return html`<div class="escala" data-escala${attrs({ ...dadosTamanho(tamanho), 'data-tipo': tipo, 'data-vista': sauna ? 'frontal' : 'lateral', 'data-segue-tamanho': segue })}>
  <form class="escala__campos" data-escala-form data-so-js hidden>
    <p class="escala__cab">Medidas do seu espaço, em centímetros</p>
    <div class="escala__linha">
      <label class="campo"><span class="campo__rot">Largura</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" step="1" name="largura" id="${id}-largura" autocomplete="off" placeholder="ex.: 90"></label>
      <span class="escala__x" aria-hidden="true">x</span>
      <label class="campo"><span class="campo__rot">Comprimento</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" step="1" name="comprimento" id="${id}-comprimento" autocomplete="off" placeholder="ex.: 170"></label>
    </div>
    <details class="escala__mais"><summary>Mostrar uma pessoa da minha altura</summary>
      <label class="campo"><span class="campo__rot">Sua altura (cm)</span><input class="campo__in num" type="number" inputmode="numeric" min="50" max="250" step="1" name="altura" id="${id}-altura" autocomplete="off" placeholder="ex.: 170"></label>
    </details>
  </form>
  <figure class="escala__fig">
    ${svgInicial(e)}
    <figcaption class="escala__leg"><span class="escala__chave escala__chave--peca">Peça</span><span class="escala__chave escala__chave--espaco">Seu espaço</span><span>Grade de 10 cm</span></figcaption>
  </figure>
  <p class="escala__txt" data-escala-txt aria-live="polite">Medidas externas publicadas: <span class="num" data-escala-medida>${fmtMetros(e.maior)} m x ${fmtMetros(e.menor)} m${tamanho.c ? html` x ${fmtMetros(tamanho.c)} m` : ''}${tamanho.altura ? html`, altura ${fmtMetros(tamanho.altura)} m` : ''}</span>.</p>
  <p class="escala__selo" data-escala-selo${attrs({ hidden: !tamanho.ficha })}>Medida a confirmar: a ficha técnica e a opção de tamanho publicadas divergem, e o cálculo usa a maior das duas.</p>
  <p class="escala__aviso">${AVISO_ESCALA}</p>
</div>`;
}
