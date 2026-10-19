// Contraste dos pares de token usados em texto (SPEC 13.12): AA = 4,5:1 para texto comum,
// 3:1 para texto grande e contornos de foco. Os valores são lidos de src/css/tokens.css.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../../site.config.mjs';

export function lerTokens(css = readFileSync(join(paths.src, 'css', 'tokens.css'), 'utf8')) {
  const t = {};
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8})\b/gi)) if (!(m[1] in t)) t[m[1]] = m[2];
  return t;
}

function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function razao(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [texto, fundo, mínimo, uso]. '#FFFFFF' = branco literal dos botões.
export const PARES = [
  ['--ink', '--day', 4.5, 'texto do dia'],
  ['--muted', '--day', 4.5, 'texto secundário do dia'],
  ['--ink', '--sand', 4.5, 'texto sobre areia'],
  ['--muted', '--sand', 4.5, 'texto secundário sobre areia'],
  ['--brand', '--day', 4.5, 'link e destaque azul no dia'],
  ['--porcelain', '--room', 4.5, 'texto da sala'],
  ['--porcelain', '--room-2', 4.5, 'texto da sala 2 e dia no modo escuro'],
  ['--porcelain', '--blueprint', 4.5, 'texto sobre a planta'],
  ['--porcelain', '--brand-deep', 4.5, 'barra superior'],
  ['--muted-on-dark', '--room', 4.5, 'texto secundário da sala'],
  ['--muted-on-dark', '--room-2', 4.5, 'texto secundário da sala 2'],
  ['--muted-on-dark', '--brand-deep', 4.5, 'texto secundário da barra superior'],
  ['--line', '--room', 4.5, 'etiqueta azul-clara na sala'],
  ['--ink', '--porcelain', 4.5, 'botão claro'],
  ['#FFFFFF', '--whats-btn', 4.5, 'botão de compra'],
  ['#FFFFFF', '--whats-btn-hover', 4.5, 'botão de compra (hover)'],
  ['#FFFFFF', '--brand', 4.5, 'botão azul'],
  ['#FFFFFF', '--brand-deep', 4.5, 'botão azul (hover)'],
  ['--price-old', '#FFFFFF', 4.5, 'preço antigo sobre branco'],
  ['--focus', '--day', 3, 'contorno de foco no dia'],
  ['--focus-on-dark', '--room', 3, 'contorno de foco na sala'],
  ['--focus-on-dark', '--room-2', 3, 'contorno de foco na sala 2'],
  ['--focus-on-dark', '--brand-deep', 3, 'contorno de foco na barra superior'],
  ['--focus-on-dark', '--blueprint', 3, 'contorno de foco sobre a planta'],
  ['#FFFFFF', '--whats-btn', 3, 'contorno de foco interno dos botões verdes do cabeçalho'],
];

/** Calcula todos os pares; `ok` false indica falha AA. */
export function verificarContraste(tokens = lerTokens()) {
  const cor = (k) => (k.startsWith('#') ? k : tokens[k]);
  return PARES.map(([fg, bg, min, uso]) => {
    if (!cor(fg) || !cor(bg)) throw new Error(`Token ausente em tokens.css: ${!cor(fg) ? fg : bg}`);
    const r = razao(cor(fg), cor(bg));
    return { fg, bg, fgHex: cor(fg), bgHex: cor(bg), razao: Math.round(r * 100) / 100, minimo: min, ok: r >= min, uso };
  });
}
