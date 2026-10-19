// Seções da home abaixo da primeira tela com content-visibility: o navegador pula o layout e a pintura
// delas até chegarem perto da tela. A altura reservada (contain-intrinsic-block-size) é a menor altura
// real do conteúdo medida em cada faixa de largura (celular até 599 px, tablet de 600 a 1023 px e desktop
// a partir de 1024 px), arredondada para baixo: a página nunca fica mais alta que o conteúdo, e a barra
// de rolagem e a tecla End apontam para o lugar certo (teste e2e "alturas reservadas" em
// tests/e2e/home.spec.mjs). Depois de pintada, a seção guarda a altura real (auto).
//
// A troca por faixa vai inteira no estilo inline, sem regra no CSS crítico (que está no teto de 14 KB):
// clamp((100vw - 599px) * 100000, ...) vale 0 abaixo de 600 px e a diferença inteira a partir dele, um
// degrau com o mesmo corte das media queries (100vw e as media queries contam a barra de rolagem).
// Ex.: {m:4750,t:4850,d:4000} -> calc(4750px + degrau(600, +100px) + degrau(1024, -850px)).

const degrau = (corte, delta) => {
  if (!delta) return '';
  const x = `(100vw - ${corte - 1}px) * 100000`;
  return delta > 0 ? ` + clamp(0px, ${x}, ${delta}px)` : ` - clamp(0px, ${x}, ${-delta}px)`;
};

/** Valor de contain-intrinsic-block-size para as alturas {m,t,d} (px) do celular, tablet e desktop. */
export function alturaReservada(a) {
  for (const k of ['m', 't', 'd']) if (!(Number.isInteger(a?.[k]) && a[k] > 0)) throw new Error(`tardio: altura ${k} inválida`);
  return `calc(${a.m}px${degrau(600, a.t - a.m)}${degrau(1024, a.d - a.t)})`;
}

/** Atributos da seção pulada (data-cv marca para o tour da planta recalcular quando ela for pintada). */
export function tardio(a) {
  if (!a) return { style: null, 'data-cv': null };
  return { style: `content-visibility:auto;contain-intrinsic-block-size:auto ${alturaReservada(a)}`, 'data-cv': '' };
}
