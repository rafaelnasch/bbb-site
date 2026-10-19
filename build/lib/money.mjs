// Dinheiro em BRL. Só formata e soma valores publicados; nunca cria preço.

/** "R$5.401,18" ou "R$ 5.401,18" -> 5401.18. Devolve null se não houver número. */
export function parseBRL(s) {
  if (s == null) return null;
  const m = String(s).match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/);
  if (!m) return null;
  const inteiro = m[1].replace(/\./g, '');
  const dec = (m[2] || '0').padEnd(2, '0');
  return Number(`${inteiro}.${dec}`);
}

/** Soma em centavos para não acumular erro de ponto flutuante. */
export function somaReais(...valores) {
  let c = 0;
  for (const v of valores.flat()) {
    if (v == null || Number.isNaN(Number(v))) return null;
    c += Math.round(Number(v) * 100);
  }
  return c / 100;
}

/** 5401.18 -> "5.401,18" (sem símbolo). */
export function formatNumeroBRL(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 5401.18 -> "R$ 5.401,18" (espaço comum, não NBSP). */
export function formatBRL(n) {
  const s = formatNumeroBRL(n);
  return s == null ? null : `R$ ${s}`;
}
