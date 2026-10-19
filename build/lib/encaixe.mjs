// Regra de encaixe do escolhedor (SPEC 9.4), a mesma usada pela coleção ("Cabe em") e pelo comparador.
// Só usa as medidas externas publicadas; a peça pode girar.
//
//   cabe:       min(a,b) + folga <= min(espaço)  e  max(a,b) + folga <= max(espaço)
//   quase cabe: uma dimensão só passa do espaço, por até 10 cm (a outra cabe)
//
// Produto com medida a confirmar (ficha x opção de tamanho): o tamanho já traz `encaixe` com a maior
// das duas medidas (data/produtos.json), e o cálculo usa ela.
//
// O mesmo algoritmo roda no navegador (src/js/escolher.js, colecao.js e comparar.js), sobre os
// números em centímetros de dados/indice.json gerados por `tamanhoCm`. Os testes conferem os dois.
import { medidasEncaixe } from '../../templates/parts/escala.mjs';

export const QUASE_CM = 10;
export const FOLGAS = Object.freeze([0, 5, 10]);

/** Metros publicados -> centímetros sem erro de ponto flutuante (0,795 -> 79,5). */
export const cm = (m) => Math.round(Number(m) * 1000) / 10;

/** Medidas de encaixe de um tamanho em cm: { menor, maior, confirmar } ou null. */
export function tamanhoCm(t) {
  const e = medidasEncaixe(t);
  if (!e) return null;
  return { menor: cm(e.menor), maior: cm(e.maior), confirmar: Boolean(t.ficha) };
}

/**
 * Avalia um tamanho (em cm) contra o espaço digitado.
 * @returns {{ cabe:boolean, quase:boolean, sobraMenor:number, sobraMaior:number, folgaTotal:number,
 *             excesso:number, dimExcedida:'largura'|'comprimento'|null, sobraL:number, sobraC:number }}
 */
export function avaliarTamanho(t, { largura, comprimento, folga = 0 }) {
  const L = Number(largura), C = Number(comprimento), f = Number(folga) || 0;
  const sMenor = Math.min(L, C), sMaior = Math.max(L, C);
  const sobraMenor = r1(sMenor - (t.menor + f));
  const sobraMaior = r1(sMaior - (t.maior + f));
  const largEhMenor = L <= C;
  const sobraL = largEhMenor ? sobraMenor : sobraMaior;
  const sobraC = largEhMenor ? sobraMaior : sobraMenor;
  const cabe = sobraMenor >= 0 && sobraMaior >= 0;
  let quase = false, excesso = 0, dimExcedida = null;
  if (!cabe) {
    const neg = [sobraL, sobraC].filter((v) => v < 0);
    if (neg.length === 1 && -neg[0] <= QUASE_CM) {
      quase = true;
      excesso = -neg[0];
      dimExcedida = sobraL < 0 ? 'largura' : 'comprimento';
    }
  }
  return { cabe, quase, sobraMenor, sobraMaior, sobraL, sobraC, folgaTotal: r1(sobraMenor + sobraMaior), excesso, dimExcedida };
}

/**
 * Melhor tamanho de um produto para o espaço: entre os que cabem, o de menor folga total (melhor
 * aproveitamento); senão, entre os que quase cabem, o de menor excesso. null se nenhum.
 */
export function melhorTamanho(tamanhos, espaco) {
  let melhor = null;
  tamanhos.forEach((t, i) => {
    if (!t) return;
    const r = { i, ...avaliarTamanho(t, espaco) };
    if (!r.cabe && !r.quase) return;
    if (!melhor) { melhor = r; return; }
    if (r.cabe && !melhor.cabe) { melhor = r; return; }
    if (r.cabe && melhor.cabe && r.folgaTotal < melhor.folgaTotal) { melhor = r; return; }
    if (!r.cabe && !melhor.cabe && r.excesso < melhor.excesso) melhor = r;
  });
  return melhor;
}

/** Frase do "quase cabe": "passa 4 cm do comprimento". */
export function fraseQuase(r) {
  return `passa ${fmtCm(r.excesso)} cm ${r.dimExcedida === 'largura' ? 'da largura' : 'do comprimento'}`;
}

export const fmtCm = (n) => (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const r1 = (n) => Math.round(n * 10) / 10;
