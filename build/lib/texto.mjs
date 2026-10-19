// Regras de texto público (SPEC 0.5 e 13.4). Usado pelo normalize (filtro editorial),
// pelo validador e pelos testes. Casamento sem acento e por início de palavra.

export const TERMOS_SAUDE = [
  'cura', 'trata', 'tratamento', 'diabetes', 'celulite', 'varizes',
  'circulação', 'emagrec', 'terapêutic', 'medicinal',
];

// Proibidos no texto visível além dos de saúde.
export const TERMOS_PROIBIDOS_LITERAIS = ['(VERIFICAR)', 'BANHEIRA COLORIDA', 'a maior loja', 'lorem'];

export function semAcento(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '');
}

const reSaude = new RegExp(
  `(?<![\\p{L}\\p{N}])(${TERMOS_SAUDE.map((t) => semAcento(t).toLowerCase()).join('|')})`,
  'giu',
);

// Expressões fixas em que uma palavra da lista não faz afirmação de saúde: o nome do imposto
// (ICMS), a área de circulação de um cômodo, o tratamento da água do spa e o tratamento de dados
// pessoais (LGPD). Só estas formas exatas saem da checagem; qualquer outro uso continua proibido
// ("melhorando a circulação do sangue", "tratamento natural para curar").
export const EXCECOES_NAO_SAUDE = [
  { re: /imposto sobre circulacao de mercadorias/g, motivo: 'nome do imposto (ICMS)' },
  { re: /area de circulacao/g, motivo: 'espaço livre do cômodo' },
  { re: /(?<![\p{L}\p{N}])trat\p{L}*\s+(?:(?:d[aeo]s?|a|o)\s+)?agua(?![\p{L}\p{N}])/gu, motivo: 'tratamento da água do spa' },
  { re: /(?<![\p{L}\p{N}])tratando de materiais/gu, motivo: 'texto do manual sobre materiais' },
  { re: /(?<![\p{L}\p{N}])trat\p{L}*\s+(?:(?:de|dos)\s+)?(?:seus\s+)?dados(?![\p{L}\p{N}])/gu, motivo: 'tratamento de dados pessoais (LGPD)' },
];

function semExcecoes(alvo) {
  let s = alvo;
  for (const { re } of EXCECOES_NAO_SAUDE) s = s.replace(re, (m) => ' '.repeat(m.length));
  return s;
}

/** Termos da lista sem descontar as exceções (para auditoria). */
export function termosSaudeBrutos(texto) {
  const alvo = semAcento(texto).toLowerCase();
  const achados = new Set();
  for (const m of alvo.matchAll(reSaude)) achados.add(m[1]);
  return [...achados];
}

/** Lista os termos de saúde encontrados (forma original do trecho), fora das exceções fixas. */
export function termosSaude(texto) {
  const alvo = semExcecoes(semAcento(texto).toLowerCase());
  const achados = new Set();
  for (const m of alvo.matchAll(reSaude)) achados.add(m[1]);
  return [...achados];
}

export function temTermoSaude(texto) {
  return termosSaude(texto).length > 0;
}

/** Termos proibidos de qualquer natureza (saúde + literais). */
export function termosProibidos(texto) {
  const s = String(texto ?? '');
  const achados = termosSaude(s);
  const baixo = s.toLowerCase();
  for (const t of TERMOS_PROIBIDOS_LITERAIS) if (baixo.includes(t.toLowerCase())) achados.push(t);
  return achados;
}

/** Divide um parágrafo em frases sem perder pontuação nem espaços originais. */
export function frases(linha) {
  return String(linha).split(/(?<=[.!?])\s+(?=\S)/u);
}

/**
 * Filtro editorial (SPEC 3.1): remove frases inteiras com termo de saúde.
 * Devolve { texto, removidos: [{ frase, termos }] }. Não altera o restante.
 */
export function filtrarFrasesSaude(texto) {
  if (texto == null) return { texto: texto ?? null, removidos: [] };
  const removidos = [];
  const linhas = String(texto).split('\n').map((linha) => {
    const partes = frases(linha);
    const mantidas = partes.filter((f) => {
      const t = termosSaude(f);
      if (t.length) {
        removidos.push({ frase: f, termos: t });
        return false;
      }
      return true;
    });
    return { original: linha, nova: mantidas.join(' '), mudou: mantidas.length !== partes.length };
  });
  const saida = linhas.filter((l) => !(l.mudou && l.nova.trim() === '')).map((l) => l.nova);
  return { texto: saida.join('\n'), removidos };
}

/** Converte qualquer texto em slug ASCII. */
export function slugify(s) {
  return semAcento(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Como filtrarFrasesSaude, mas a frase pode atravessar quebras de linha (texto de categoria,
 * em que cada link vira uma linha). A frase com termo de saúde sai inteira, de ponto a ponto;
 * o resto do texto, com as quebras originais, fica igual.
 */
export function filtrarFrasesSaudeMultilinha(texto) {
  if (texto == null) return { texto: texto ?? null, removidos: [] };
  const partes = String(texto).split(/(?<=[.!?])(\s+)(?=\S)/u);
  // partes alterna [frase, separador, frase, separador, ...]
  const removidos = [];
  let out = '';
  for (let i = 0; i < partes.length; i += 2) {
    const frase = partes[i];
    const sep = partes[i + 1] ?? '';
    const t = termosSaude(frase);
    if (t.length) {
      removidos.push({ frase, termos: t });
      continue;
    }
    out += frase + sep;
  }
  return { texto: out.replace(/\s+$/u, ''), removidos };
}
