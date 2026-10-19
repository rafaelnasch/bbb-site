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
  // Lista ampliada: instrução de instalação e ventilação do manual, sem afirmação de saúde.
  { re: /mau cheiro e bacterias/g, motivo: 'instrução de instalação do manual (água parada)' },
  { re: /adequadas de saude e conforto/g, motivo: 'instrução de ventilação do manual' },
  // Nome do acessório (luzes de cromoterapia): a palavra sozinha fica. A frase que atribui efeito
  // a ela continua caindo pelos outros termos ("terapia alternativa", "benefícios" etc.).
  { re: /(?<![\p{L}\p{N}])cromoterapia(?![\p{L}\p{N}])/gu, motivo: 'nome do acessório (cromoterapia)' },
];

// Afirmação de saúde implícita (decisão do dono do projeto, 18/10/2026: "sem claims de saúde").
// A lista da SPEC 0.5 é fechada e deixa passar afirmações como "ajuda a combater a insônia",
// "relaxamento muscular" ou "sem alergias, sem irritação de pele". Estes padrões ampliam a
// checagem para o vocabulário de efeito no corpo. Casamento por palavra inteira (sem acento,
// minúsculas); "\\p{L}*" marca as formas com sufixo. "tensão" no singular fica de fora (é
// elétrica no manual e nas fichas). Qualquer composto com "terapi" casa (aromaterapia,
// hidroterapia, terapia); "cromoterapia" sozinha é nome de acessório e sai pelas exceções fixas.
// "bem-estar" e "qualidade de vida" entram pela mesma decisão (efeito no corpo sem prova); se o dono
// liberar, basta tirar daqui: FAQ, empresa, manual, categorias, produtos e blog usam a mesma lista.
export const TERMOS_SAUDE_IMPLICITA = [
  'saude', 'insoni\\p{L}*', 'sono', 'dor', 'dores', 'muscul\\p{L}*', 'estress\\p{L}*', 'stress',
  'ansiedad\\p{L}*', 'alivi\\p{L}*', '\\p{L}*terapi\\p{L}*', 'terapeut\\p{L}*', 'fisioterap\\p{L}*',
  'alergi\\p{L}*', 'alergic\\p{L}*', 'pele', 'bacteri\\p{L}*', 'inflama\\p{L}*', 'otite',
  'respirat\\p{L}*', 'respiracao', 'vias aereas', 'articulac\\p{L}*', 'artrit\\p{L}*', 'reumat\\p{L}*',
  'fibromialg\\p{L}*', 'sanguine\\p{L}*', 'pressao arterial', 'hipertens\\p{L}*', 'endorfina',
  'imunidade', 'imunolog\\p{L}*', 'doen\\p{L}*', 'calorias', 'desintox\\p{L}*', 'toxinas?',
  'menstrua\\p{L}*', 'enxaquec\\p{L}*', 'tensoes', 'mente e (?:do )?corpo', 'beneficios',
  'bem[- ]?estar', 'qualidade de vida',
];

const reSaudeImplicita = new RegExp(
  `(?<![\\p{L}\\p{N}])(${TERMOS_SAUDE_IMPLICITA.join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
);

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
  for (const m of alvo.matchAll(reSaudeImplicita)) achados.add(m[1]);
  return [...achados];
}

/**
 * Lista os termos de saúde encontrados (sem acento, minúsculas), fora das exceções fixas:
 * a lista da SPEC 0.5 (por início de palavra) e a lista ampliada de afirmação implícita.
 */
export function termosSaude(texto) {
  const alvo = semExcecoes(semAcento(texto).toLowerCase());
  const achados = new Set();
  for (const m of alvo.matchAll(reSaude)) achados.add(m[1]);
  for (const m of alvo.matchAll(reSaudeImplicita)) achados.add(m[1]);
  return [...achados];
}

/** Só os termos da lista fechada da SPEC 0.5 (para separar no log o que é da lista ampliada). */
export function termosSaudeSpec(texto) {
  const alvo = semExcecoes(semAcento(texto).toLowerCase());
  return [...new Set([...alvo.matchAll(reSaude)].map((m) => m[1]))];
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

// ---------------------------------------------------------------------------
// Superlativo não comprovado e certificação não confirmada (SPEC 0.5 e 15)
// ---------------------------------------------------------------------------

// Padrões sobre o texto sem acento, em minúsculas e com os espaços (inclusive quebras de linha)
// reduzidos a um. Só a forma superlativa ou de ranking: "o melhor", "os melhores", "a maior",
// "a única com", "líder", "referência", "mais vendidos". O comparativo sem artigo ("maior
// durabilidade", "experiência ainda melhor", "os itens que melhor atendem") não é afirmação de
// posição no mercado e fica.
export const PADROES_SUPERLATIVO = [
  { re: /(?<![\p{L}\p{N}])(?:o|a|os|as|pelo|pela|pelos|pelas|no|na|do|da)\s+(?:melhor|melhores|maior|maiores)(?![\p{L}\p{N}])/u, rotulo: 'o melhor / a maior' },
  { re: /(?<![\p{L}\p{N}])melhores(?![\p{L}\p{N}])/u, rotulo: 'melhores' },
  { re: /(?<![\p{L}\p{N}])melhor\s+(?:custo|preco|qualidade|desempenho|oportunidade|opcao|valor)/u, rotulo: 'melhor + atributo' },
  { re: /(?<![\p{L}\p{N}])ha de melhor(?![\p{L}\p{N}])/u, rotulo: 'o que há de melhor' },
  { re: /(?<![\p{L}\p{N}])lider(?:es)?(?![\p{L}\p{N}])/u, rotulo: 'líder' },
  { re: /(?<![\p{L}\p{N}])(?:tornou-se|tornou se|e|somos|como)\s+referencia(?![\p{L}\p{N}])/u, rotulo: 'referência' },
  { re: /(?<![\p{L}\p{N}])(?:a|o|somos a|somos o)\s+unic[ao]s?(?![\p{L}\p{N}])/u, rotulo: 'a única' },
  { re: /(?<![\p{L}\p{N}])unic[ao]s?\s+(?:com|empresa|certificad\p{L}*|fabrica|loja)(?![\p{L}\p{N}])/u, rotulo: 'única com' },
  { re: /(?<![\p{L}\p{N}])mais\s+(?:complet|vendid|desejad|procurad)\p{L}*/u, rotulo: 'mais completa / vendida / desejada' },
  { re: /(?<![\p{L}\p{N}])sem duvida(?![\p{L}\p{N}])/u, rotulo: 'sem dúvida' },
];

// Certificação sem número nem certificadora publicados (SPEC 15: ISO 9001 fora até a empresa enviar).
export const PADROES_CERTIFICACAO = [
  { re: /(?<![\p{L}\p{N}])iso\s*9001/u, rotulo: 'ISO 9001' },
];

function alvoNormalizado(texto) {
  return semAcento(texto).toLowerCase().replace(/\s+/g, ' ');
}

/** Rótulos dos padrões de superlativo encontrados no texto. */
export function superlativos(texto) {
  const alvo = alvoNormalizado(texto);
  return PADROES_SUPERLATIVO.filter((p) => p.re.test(alvo)).map((p) => p.rotulo);
}

/** Rótulos de certificação não confirmada (ISO 9001). */
export function certificacoesNaoConfirmadas(texto) {
  const alvo = alvoNormalizado(texto);
  return PADROES_CERTIFICACAO.filter((p) => p.re.test(alvo)).map((p) => p.rotulo);
}

/** Forma comparável de uma frase: sem acento, minúsculas, só letras e números separados por um espaço. */
export function chaveFrase(s) {
  return semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Detector de autodeclarações da empresa (empresa.claims_nao_publicar). Cada claim é quebrado em
 * frases; uma frase do texto casa quando contém a frase do claim ou está contida nela (com pelo
 * menos 24 caracteres comparáveis, para não casar título curto como "Banheiras").
 */
export function detectorDeClaims(claims) {
  const chaves = [...new Set(claims.flatMap((c) => frases(String(c).replace(/\s+/g, ' ')))
    .map(chaveFrase).filter((k) => k.length >= 24))];
  return (frase) => {
    const k = chaveFrase(frase);
    if (k.length < 24) return [];
    return chaves.filter((c) => k.includes(c) || c.includes(k));
  };
}

/**
 * Detectores editoriais na ordem de prioridade. Cada um devolve a lista de termos achados.
 * `claims` (opcional) liga o detector de autodeclarações.
 */
export function detectoresEditoriais({ claims = null } = {}) {
  const d = [
    { regra: 'termo_de_saude', fn: termosSaude },
    { regra: 'superlativo_nao_comprovado', fn: superlativos },
    { regra: 'certificacao_nao_confirmada', fn: certificacoesNaoConfirmadas },
  ];
  if (claims) d.push({ regra: 'autodeclaracao_nao_publicar', fn: detectorDeClaims(claims) });
  d.push({
    regra: 'termo_proibido_literal',
    fn: (f) => TERMOS_PROIBIDOS_LITERAIS.filter((t) => f.toLowerCase().includes(t.toLowerCase())),
  });
  return d;
}

/** Primeira regra editorial que a frase viola: { regra, termos } ou null. */
export function violacaoEditorial(frase, detectores = detectoresEditoriais()) {
  for (const { regra, fn } of detectores) {
    const termos = fn(frase);
    if (termos.length) return { regra, termos };
  }
  return null;
}

/**
 * Filtro editorial por frase, em uma linha por vez (descrição de produto, resposta de FAQ): a frase
 * que viola qualquer regra sai inteira. Devolve { texto, removidos: [{ frase, regra, termos }] }.
 */
export function filtrarFrasesEditorial(texto, detectores = detectoresEditoriais()) {
  if (texto == null) return { texto: texto ?? null, removidos: [] };
  const removidos = [];
  const linhas = String(texto).split('\n').map((linha) => {
    const partes = frases(linha);
    const mantidas = partes.filter((f) => {
      const v = violacaoEditorial(f, detectores);
      if (v) { removidos.push({ frase: f, ...v }); return false; }
      return true;
    });
    return { nova: mantidas.join(' '), mudou: mantidas.length !== partes.length };
  });
  const saida = linhas.filter((l) => !(l.mudou && l.nova.trim() === '')).map((l) => l.nova);
  return { texto: saida.join('\n'), removidos };
}

/**
 * Como filtrarFrasesEditorial, mas a frase pode atravessar quebras de linha (texto institucional,
 * categoria, página do manual). O texto que fica é byte a byte o original.
 */
export function filtrarFrasesEditorialMultilinha(texto, detectores = detectoresEditoriais()) {
  if (texto == null) return { texto: texto ?? null, removidos: [] };
  const partes = String(texto).split(/(?<=[.!?])(\s+)(?=\S)/u);
  const removidos = [];
  let out = '';
  for (let i = 0; i < partes.length; i += 2) {
    const frase = partes[i];
    const sep = partes[i + 1] ?? '';
    const v = violacaoEditorial(frase, detectores);
    if (v) {
      removidos.push({ frase, ...v });
      // A quebra de linha que vinha depois da frase cortada substitui o espaço que vinha antes
      // dela, para o texto seguinte não colar na linha anterior ("Sul. EQUIPE").
      if (/\n/.test(sep) && out && !/\n[ \t]*$/u.test(out)) out = out.replace(/[ \t]+$/u, '') + sep;
      continue;
    }
    out += frase + sep;
  }
  return { texto: out.replace(/\s+$/u, ''), removidos };
}
