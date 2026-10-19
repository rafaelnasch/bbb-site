// Manual do usuário (SPEC 9.6): tabelas e grafia lidas do PDF com pdfjs-dist.
//
// O texto do manual vem de _recon/html/pdf/manual-do-usuario.txt, uma extração que (1) desmonta as
// tabelas, coluna por coluna, e (2) põe espaços dentro de palavras ("proce sso", "originam -se").
// Este módulo usa o próprio PDF para as duas coisas:
//
// 1) Tabelas. Cada tabela é descrita abaixo pela grade desenhada no PDF (bordas de coluna e de
//    linha em pontos, medidas na página renderizada) e pelas células mescladas. O conteúdo de cada
//    célula são os itens de texto do pdfjs cujo centro cai dentro dela. Nada é digitado: a grade só
//    diz onde cada texto do PDF está. O build falha se (a) sobrar item de texto dentro da tabela sem
//    célula, (b) um item não couber inteiro na faixa da sua célula, ou (c) os caracteres das
//    células (mais os itens omitidos) não forem exatamente os do trecho do texto que a tabela
//    substitui. Tabela de duas colunas com uma linha de texto por célula (peso e carga) usa o modo
//    `por_linha`: cada linha de base do PDF é uma linha da tabela.
// 2) Grafia. Palavra que a extração partiu ("abasteciment o") é unida quando a forma unida existe
//    no texto do pdfjs da mesma página e a forma partida não existe. Cada correção vai para o
//    editorial-log.
import { readFileSync } from 'node:fs';
// pdfjs só é carregado no normalize (o template usa só trechoDaTabela).
const abrirPdf = async (pdf) => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return getDocument({ data: new Uint8Array(readFileSync(pdf)), verbosity: 0 }).promise;
};

/**
 * Grades das tabelas do manual. Coordenadas em pontos, de cima para baixo (página 595 x 842).
 * - colunas/linhas: bordas da grade; mesclas: [linha, coluna, linhas, colunas].
 * - titulo: linhas iniciais da grade que são o título da tabela (viram texto antes dela).
 * - cabecalho: quantas linhas da grade, depois do título, são cabeçalho (<th scope="col">).
 * - txt_de / txt_ate: primeira e última linha do texto do manual que a tabela substitui
 *   (txt_ate é a última ocorrência depois de txt_de).
 * - inserir_antes: no PDF a tabela fica acima desta linha do texto (a extração a pôs no fim).
 * - omitir: itens dentro da área que não aparecem na página impressa (não vão ao HTML; log).
 */
export const TABELAS_MANUAL = [
  {
    id: 'tabela-de-defeitos', pagina: 7,
    colunas: [57.7, 209.6, 348.2, 538.4],
    linhas: [251.3, 274.0, 296.8, 312.8, 335.9, 360.4, 392.3, 423.9, 458.9, 490.9],
    mesclas: [[0, 0, 1, 3], [2, 0, 3, 1]],
    titulo: 1, cabecalho: 1, rotulo_linha: true,
    txt_de: 'Não se inicia função nenhuma.', txt_ate: 'Desobstruir ralo',
    inserir_antes: 'CUIDADOS IMPORTANTES',
  },
  {
    id: 'dados-tecnicos-instalacao-eletrica', pagina: 18,
    colunas: [33.3, 207.6, 289.3, 385.7, 493.1, 562.1],
    linhas: [151.1, 203.4, 232.0, 248.4, 275.3, 304.8, 320.8, 337.2, 353.2, 369.6, 386.0, 408.4],
    mesclas: [[0, 0, 1, 5], [2, 0, 2, 1], [5, 0, 2, 1], [5, 1, 2, 1], [5, 2, 2, 1]],
    titulo: 1, cabecalho: 1, rotulo_linha: true,
    txt_de: 'A seguir tabela com dados básicos para instalação segura baseada no manual de instalação dos nossos componentes',
    txt_ate: 'Controlador 8 funções 6 10 - 127/220',
  },
  {
    // Etiqueta desenhada (logo e símbolo de classe são imagem). Abaixo dela o arquivo traz texto que
    // não aparece na página impressa (tensão, potência, frequência e corrente sem moldura nem
    // posição visível): fica fora do HTML até a empresa confirmar.
    id: 'etiqueta-de-especificacao', pagina: 18, rotulo: 'Etiqueta com dados técnicos',
    colunas: [174.7, 255.1, 356.6],
    linhas: [636.9, 669.4, 680.3, 691.7, 702.6, 713.6],
    mesclas: [[0, 0, 1, 2], [1, 0, 1, 2], [2, 0, 1, 2], [3, 0, 1, 2]],
    titulo: 0, cabecalho: 0,
    omitir: { caixa: [170, 720, 410, 810], motivo: 'texto_invisivel_no_pdf' },
    txt_de: 'Fabricante: Banheiras Bom Banho', txt_ate: '-',
  },
  {
    id: 'informacoes-tecnicas-do-produto', pagina: 27,
    colunas: [66.5, 162.1, 219.8, 297.2, 366.3, 442.9, 528.8],
    linhas: [247.5, 299.7, 332.2, 367.5, 402.9, 438.2, 473.6, 508.9, 543.9, 579.3],
    mesclas: [],
    titulo: 0, cabecalho: 1, rotulo_linha: true,
    txt_de: 'Equipamento Potência', txt_ate: 'pág. 20',
  },
  {
    id: 'dados-tecnicos-instalacao-hidraulica', pagina: 30,
    colunas: [138.9, 258.9, 456.0],
    linhas: [103.6, 155.3, 184.0, 200.4, 218.1, 234.5, 250.9, 267.3, 283.3, 299.7, 316.2, 332.2, 348.6, 370.9, 399.9, 415.5, 436.6],
    mesclas: [[0, 0, 1, 2], [12, 0, 2, 1], [14, 0, 2, 1]],
    titulo: 1, cabecalho: 1, rotulo_linha: true,
    txt_de: 'DADOS TÉCNICOS PARA INSTALAÇÃO HIDRÁULICA', txt_ate: 'Água = 32',
    inserir_antes: 'CUIDADOS NA MONTAGEM DO RALO',
  },
  ...[
    [32, [100, 115, 480, 602], 'ÁUSTRIA 178,52'],
    [33, [100, 142, 480, 645], 'ESSENCIALE 152,18'],
    [34, [100, 170, 480, 563], 'LYON 195,36'],
    [35, [100, 142, 480, 722], 'ROMA 174,04'],
    [36, [100, 142, 480, 722], 'VENEZA 168,69'],
    [37, [100, 70, 480, 155], 'VITORIANA 253,58'],
  ].map(([pagina, caixa, ate]) => ({
    id: `peso-e-carga-p${pagina}`, pagina, modo: 'por_linha', caixa, divisa: 265,
    rotulo: 'Tabela de peso e carga aplicada ao piso', rotulo_linha: true,
    cabecalho: pagina === 37 ? 0 : 1,
    txt_de: pagina === 37 ? 'VERONA 185,86' : 'Modelo Carga do produto sob o piso (cheio) - Kg/m²', txt_ate: ate,
  })),
];

const compacto = (s) => String(s).replace(/\s+/g, ' ').trim();
const semEspaco = (s) => String(s).replace(/\s+/g, '');
const multiconjunto = (s) => [...semEspaco(s)].sort().join('');

async function itensDaPagina(doc, n) {
  const pg = await doc.getPage(n);
  const H = pg.getViewport({ scale: 1 }).height;
  const tc = await pg.getTextContent();
  return tc.items.filter((it) => it.str && it.str.trim()).map((it) => {
    const fs = it.height || Math.abs(it.transform[3]);
    const x = it.transform[4];
    const base = H - it.transform[5];
    return { texto: it.str.trim(), x, w: it.width, base, fs, cx: x + it.width / 2, cy: base - 0.35 * fs, topo: base - 0.8 * fs, fundo: base + 0.2 * fs };
  });
}

/** Junta os itens de uma célula em texto: linhas pela linha de base, palavra com hífen no fim da
 *  linha continua colada ("magneto-" + "térmico"), quebra de linha depois de ":" e antes de "Rótulo:". */
function textoDaCelula(itens) {
  const ord = [...itens].sort((a, b) => a.base - b.base || a.x - b.x);
  const linhas = [];
  for (const it of ord) {
    const l = linhas[linhas.length - 1];
    if (l && Math.abs(l.base - it.base) < 3) l.partes.push(it.texto);
    else linhas.push({ base: it.base, partes: [it.texto] });
  }
  let out = '';
  for (const l of linhas.map((x) => x.partes.join(' '))) {
    if (!out) { out = l; continue; }
    if (/\p{L}-$/u.test(out) && /^\p{Ll}/u.test(l)) out += l;
    else if (/:$/.test(out) || /^\p{L}+: \S/u.test(l)) out += `\n${l}`;
    else out += ` ${l}`;
  }
  return out;
}

function grade(t, itens) {
  const { colunas: C, linhas: L } = t;
  const nl = L.length - 1;
  const nc = C.length - 1;
  const ocupado = Array.from({ length: nl }, () => Array(nc).fill(null));
  const celulas = [];
  for (const [r, c, rs, cs] of t.mesclas) {
    const cel = { r, c, rs, cs, itens: [] };
    celulas.push(cel);
    for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) {
      if (ocupado[i][j]) throw new Error(`${t.id}: mescla sobreposta em ${i},${j}`);
      ocupado[i][j] = cel;
    }
  }
  for (let i = 0; i < nl; i++) for (let j = 0; j < nc; j++) if (!ocupado[i][j]) {
    const cel = { r: i, c: j, rs: 1, cs: 1, itens: [] };
    celulas.push(cel);
    ocupado[i][j] = cel;
  }
  const dentro = (it) => it.cx > C[0] && it.cx < C[nc] && it.cy > L[0] && it.cy < L[nl];
  const omitir = t.omitir?.caixa;
  const omitidos = omitir ? itens.filter((it) => it.cx > omitir[0] && it.cx < omitir[2] && it.cy > omitir[1] && it.cy < omitir[3]) : [];
  for (const it of itens.filter(dentro)) {
    const i = L.findIndex((y, k) => k < nl && it.cy > y && it.cy < L[k + 1]);
    const j = C.findIndex((x, k) => k < nc && it.cx > x && it.cx < C[k + 1]);
    const cel = ocupado[i][j];
    if (it.topo < L[cel.r] - 2 || it.fundo > L[cel.r + cel.rs] + 2) throw new Error(`${t.id}: "${it.texto}" atravessa a borda da célula (${i},${j})`);
    cel.itens.push(it);
  }
  celulas.sort((a, b) => a.r - b.r || a.c - b.c);
  const usados = itens.filter(dentro);
  return { nl, celulas, usados, omitidos };
}

function porLinha(t, itens) {
  const [x0, y0, x1, y1] = t.caixa;
  const usados = itens.filter((it) => it.cx > x0 && it.cx < x1 && it.cy > y0 && it.cy < y1).sort((a, b) => a.base - b.base || a.x - b.x);
  const linhas = [];
  for (const it of usados) {
    const l = linhas[linhas.length - 1];
    if (l && Math.abs(l.base - it.base) < 3) l.itens.push(it);
    else linhas.push({ base: it.base, itens: [it] });
  }
  const celulas = [];
  linhas.forEach((l, r) => {
    const cols = [l.itens.filter((it) => it.cx < t.divisa), l.itens.filter((it) => it.cx >= t.divisa)];
    if (cols.some((c) => c.length !== 1)) throw new Error(`${t.id}: linha ${r} sem uma célula por coluna (${l.itens.map((i) => i.texto).join(' | ')})`);
    if (r >= (t.cabecalho || 0) && !/^\d+,\d+$/.test(cols[1][0].texto)) throw new Error(`${t.id}: valor não numérico na linha ${r}: ${cols[1][0].texto}`);
    cols.forEach((c, j) => celulas.push({ r, c: j, rs: 1, cs: 1, itens: c }));
  });
  return { nl: linhas.length, celulas, usados, omitidos: [] };
}

/** Lê as tabelas do PDF: [{ id, pagina, ..., titulo:[{texto, destaque}], cabecalho, linhas:[[{texto, rs, cs}]], omitidos }] */
export async function lerTabelasDoManual(pdf) {
  const doc = await abrirPdf(pdf);
  const cache = new Map();
  const itensDe = async (n) => { if (!cache.has(n)) cache.set(n, await itensDaPagina(doc, n)); return cache.get(n); };
  const out = [];
  for (const t of TABELAS_MANUAL) {
    const itens = await itensDe(t.pagina);
    const g = t.modo === 'por_linha' ? porLinha(t, itens) : grade(t, itens);
    const nt = t.titulo || 0;
    // Título: corridas de itens pelo tamanho da fonte; a de fonte maior é o título, as outras são
    // texto (p. 18: a frase de abertura e o título dividem a mesma célula).
    const titulo = [];
    for (const cel of g.celulas.filter((c) => c.r < nt)) {
      const ord = [...cel.itens].sort((a, b) => a.base - b.base || a.x - b.x);
      const maior = Math.max(...ord.map((i) => i.fs));
      const corridas = [];
      for (const it of ord) {
        const destaque = it.fs >= maior - 0.5;
        const ult = corridas[corridas.length - 1];
        if (ult && ult.destaque === destaque) ult.itens.push(it); else corridas.push({ destaque, itens: [it] });
      }
      for (const c of corridas) titulo.push({ texto: compacto(textoDaCelula(c.itens)), destaque: c.destaque || corridas.length === 1 });
    }
    const linhas = [];
    for (let r = nt; r < g.nl; r++) {
      linhas.push(g.celulas.filter((c) => c.r === r).map((c) => ({ texto: textoDaCelula(c.itens), ...(c.rs > 1 ? { rs: c.rs } : {}), ...(c.cs > 1 ? { cs: c.cs } : {}) })));
    }
    for (const l of linhas) for (const c of l) if (!c.texto) c.vazia = true;
    out.push({
      id: t.id, pagina: t.pagina, rotulo: t.rotulo || null, rotulo_linha: !!t.rotulo_linha,
      txt_de: t.txt_de, txt_ate: t.txt_ate, inserir_antes: t.inserir_antes || null,
      titulo, cabecalho: t.cabecalho || 0, linhas,
      omitidos: g.omitidos.map((i) => i.texto), omitidos_motivo: t.omitir?.motivo || null,
      _caracteres: multiconjunto([...g.usados, ...g.omitidos].map((i) => i.texto).join('')),
    });
  }
  return out;
}

/**
 * Trecho do texto da página que a tabela substitui: índices [de, ate] nas linhas (comparação sem
 * diferença de espaços). Confere que os caracteres do trecho são exatamente os da tabela.
 */
export function trechoDaTabela(linhas, t) {
  const L = linhas.map(compacto);
  const de = L.indexOf(compacto(t.txt_de));
  const ate = L.lastIndexOf(compacto(t.txt_ate));
  if (de < 0 || ate < de) throw new Error(`manual p. ${t.pagina}, ${t.id}: trecho "${t.txt_de}" … "${t.txt_ate}" não encontrado no texto exibido`);
  return { de, ate };
}

export function conferirCaracteres(linhas, t) {
  const { de, ate } = trechoDaTabela(linhas, t);
  const doTexto = multiconjunto(linhas.slice(de, ate + 1).join(''));
  if (doTexto !== t._caracteres) throw new Error(`manual p. ${t.pagina}, ${t.id}: os caracteres da tabela não batem com o trecho do texto que ela substitui`);
}

/**
 * Grafia: une partes de palavra que a extração separou, quando a forma unida existe no texto do
 * pdfjs da página e a forma separada não existe. Grava `texto_grafia` na página (o literal da
 * extração continua em `texto`) e devolve a lista de correções.
 */
export async function corrigirGrafiaDoManual(pdf, paginas) {
  const doc = await abrirPdf(pdf);
  const correcoes = [];
  for (const pg of paginas) {
    if (pg.pagina > doc.numPages) continue;
    const itens = await itensDaPagina(doc, pg.pagina);
    const corrido = ` ${compacto(itens.map((i) => i.texto).join(' '))} `;
    const palavras = new Set(corrido.trim().split(' '));
    const corrigido = pg.texto.split('\n').map((linha) => {
      const tok = linha.split(/(\s+)/);
      let mudou = false;
      for (let i = 0; i + 2 < tok.length; i += 2) {
        const a = tok[i];
        const b = tok[i + 2];
        if (!a || !b) continue;
        if (palavras.has(a + b) && !corrido.includes(` ${a} ${b} `) && !corrido.includes(` ${a} ${b}`)) {
          tok.splice(i, 3, a + b);
          mudou = true;
          i -= 2;
        }
      }
      const nova = tok.join('');
      if (mudou) correcoes.push({ pagina: pg.pagina, antes: linha.trim(), depois: nova.trim() });
      return nova;
    }).join('\n');
    // O literal da extração fica em `texto`; a versão com as palavras unidas, em `texto_grafia`.
    if (corrigido !== pg.texto) pg.texto_grafia = corrigido;
  }
  return correcoes;
}
