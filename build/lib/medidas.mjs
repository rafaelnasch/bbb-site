// Medidas publicadas: só converte texto em número (vírgula para ponto). Nada é estimado.

const reDecimal = /\d+\s?,\s?\d+|\d+\.\d+|\d+/g;

/** "0,79m" -> 0.79 ; "0, 84" -> 0.84 ; "1.20" -> 1.2 ; inteiro sem separador -> null (ilegível). */
export function numeroMedida(token) {
  if (token == null) return null;
  const t = String(token).trim().replace(/\s/g, '');
  if (/^\d+,\d+$/.test(t)) return Number(t.replace(',', '.'));
  if (/^\d+\.\d+$/.test(t)) return Number(t);
  return null;
}

/** Valor único da ficha ("1,41m") -> 1.41. Vários valores ou texto não numérico -> null. */
export function valorUnicoFicha(s) {
  if (s == null) return null;
  const tokens = String(s).match(reDecimal) || [];
  if (tokens.length !== 1) return null;
  return numeroMedida(tokens[0]);
}

/**
 * Rótulo de tamanho ("0,79 x 1,41 x 0,37", "1,10x0,70x0,48", "1,60 x 1,60  0,43",
 * "0,84 x 1,65 x 0,48 + R$1.360,75") -> { a, b, c, tokens, formato_irregular }.
 * Tokens sem separador decimal ("051", "89") ficam null: não se adivinha a unidade.
 */
export function parseRotuloTamanho(rotulo) {
  const base = String(rotulo ?? '').split(/\+\s*R\$/)[0];
  const tokens = base.match(reDecimal) || [];
  const nums = tokens.map(numeroMedida);
  // Regra de leitura (registrada em data/editorial-log.json): um token com vírgula decimal e espaço
  // depois dela ("0, 84") é lido como o mesmo número sem o espaço, porque o separador decimal está
  // escrito. Token sem separador ("051", "89") fica null: aí seria preciso adivinhar onde vai a vírgula.
  const leituras = tokens
    .map((tk, i) => ({ token: tk, lido: nums[i] }))
    .filter((x) => /\s/.test(x.token) && x.lido != null)
    .map((x) => ({ ...x, regra: 'espaco_apos_virgula_decimal_ignorado' }));
  const canon = /^\s*\d+,\d+\s*[xX]\s*\d+,\d+\s*[xX]\s*\d+,\d+\s*$/.test(base);
  return {
    a: nums[0] ?? null,
    b: nums[1] ?? null,
    c: nums[2] ?? null,
    tokens,
    leituras,
    formato_irregular: !canon || tokens.length !== 3 || nums.some((n) => n == null),
  };
}

/** Números decimais presentes num nome de arquivo de planta. */
export function numerosNoNome(nome) {
  return (String(nome).match(/\d+,\d+/g) || []).map((t) => Number(t.replace(',', '.')));
}

/**
 * Uma medida do nome do PDF corresponde a uma medida do rótulo quando é igual ou quando,
 * tendo 3 casas (ex.: 1,195 ou 0,435), o rótulo é ela truncada em 2 casas (1,19 ou 0,43).
 * Nunca por arredondamento livre: 0,81 não casa com 0,80.
 */
export function medidaCasa(doPdf, doRotulo) {
  if (Math.abs(doPdf - doRotulo) < 0.0005) return true;
  const trunc = Math.floor(doPdf * 100 + 1e-6) / 100;
  return Math.abs(trunc - doRotulo) < 0.0005;
}

/**
 * Casa as medidas do nome do PDF com as do rótulo como multiconjuntos.
 * Rótulo com 2 medidas (profundidade ilegível) casa com PDF de 3 que contenha as duas.
 */
export function mesmasMedidas(doPdf, doRotulo) {
  if (!doPdf.length || !doRotulo.length) return false;
  if (doRotulo.length === doPdf.length) {
    const a = [...doPdf].sort((p, q) => p - q);
    const b = [...doRotulo].sort((p, q) => p - q);
    return a.every((v, i) => medidaCasa(v, b[i]));
  }
  if (doRotulo.length === 2 && doPdf.length === 3) {
    const resto = [...doPdf];
    return doRotulo.every((r) => {
      const i = resto.findIndex((v) => medidaCasa(v, r));
      if (i < 0) return false;
      resto.splice(i, 1);
      return true;
    });
  }
  return false;
}

/** Formata metros em pt-BR com 2 casas: 1.41 -> "1,41". */
export function fmtMetros(n) {
  return n == null ? null : Number(n).toFixed(2).replace('.', ',');
}
