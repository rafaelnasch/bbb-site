// Folha do desenho dentro do raster de 3400 px de uma planta oficial (PDF -> PNG, media-plantas.mjs):
// a área branca dentro da moldura azul da prancha, sem o cabeçalho, a marca e o carimbo. Usada pelos
// filmes da planta (films.mjs) e pela arte estática do topo do produto (plantas-topo.mjs). Nada é redesenhado.
import sharp from 'sharp';

/** Caixa da folha branca do desenho dentro do raster (linhas e colunas com maioria de pixels brancos). */
export async function caixaDaFolha(png) {
  const RED = 5;
  const { data, info } = await sharp(png).flatten({ background: '#ffffff' }).resize({ width: Math.round(3400 / RED) })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  // Azul escuro da moldura (ex.: 28,71,107). A marca d'água clara da folha não conta como azul.
  const azul = (x, y) => { const i = (y * w + x) * ch; return data[i] < 120 && data[i + 2] - data[i] > 40; };
  // Maior sequência contígua de índices em [a, b] que satisfazem f.
  const maiorFaixa = (a, b, f) => {
    let melhor = [a, b], ini = -1, tam = 0;
    for (let k = a; k <= b + 1; k++) {
      if (k <= b && f(k)) { if (ini < 0) ini = k; }
      else if (ini >= 0) { if (k - ini > tam) { tam = k - ini; melhor = [ini, k - 1]; } ini = -1; }
    }
    return tam ? melhor : null;
  };
  const fracao = (n, d) => n / Math.max(1, d);
  // 1) Moldura azul da prancha (alguns rasters têm margem branca em volta dela).
  // Extensão (primeiro e último) das linhas e colunas com muito azul: cabeçalho, rodapé e laterais.
  const extensao = (a, b, f) => { let i0 = -1, i1 = -1; for (let k = a; k <= b; k++) if (f(k)) { if (i0 < 0) i0 = k; i1 = k; } return i0 < 0 ? null : [i0, i1]; };
  const faixaY = extensao(0, h - 1, (y) => { let n = 0; for (let x = 0; x < w; x++) if (azul(x, y)) n++; return fracao(n, w) > 0.3; });
  let [bx0, bx1, by0, by1] = [0, w - 1, 0, h - 1];
  if (faixaY) {
    [by0, by1] = faixaY;
    const fx = extensao(0, w - 1, (x) => { let n = 0; for (let y = by0; y <= by1; y++) if (azul(x, y)) n++; return fracao(n, by1 - by0 + 1) > 0.3; });
    if (fx) [bx0, bx1] = fx;
  }
  // 2) Folha do desenho dentro da moldura: a região que não é azul (branco, traço, cinza e vermelho).
  const ly = maiorFaixa(by0, by1, (y) => { let n = 0; for (let x = bx0; x <= bx1; x++) if (!azul(x, y)) n++; return fracao(n, bx1 - bx0 + 1) > 0.55; });
  if (!ly) throw new Error(`Folha branca não encontrada em ${png}`);
  const [y0, y1] = ly;
  const lx = maiorFaixa(bx0, bx1, (x) => { let n = 0; for (let y = y0; y <= y1; y++) if (!azul(x, y)) n++; return fracao(n, y1 - y0 + 1) > 0.55; });
  if (!lx) throw new Error(`Folha branca não encontrada em ${png}`);
  const [x0, x1] = lx;
  const meta = await sharp(png).metadata();
  const k = meta.width / w;
  const left = Math.max(0, Math.round(x0 * k)), top = Math.max(0, Math.round(y0 * k));
  return { left, top, width: Math.min(meta.width - left, Math.round((x1 - x0 + 1) * k)), height: Math.min(meta.height - top, Math.round((y1 - y0 + 1) * k)) };
}


/** Recorte plausível de uma folha de planta (o mesmo teste dos filmes). */
export function recorteValido(cx, largura = 3400) {
  return cx.width >= 0.5 * largura && cx.width <= 0.95 * largura && cx.height / cx.width >= 0.55 && cx.height / cx.width <= 0.85;
}
