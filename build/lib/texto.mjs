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

/** Lista os termos de saúde encontrados (forma original do trecho). */
export function termosSaude(texto) {
  const alvo = semAcento(texto).toLowerCase();
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
