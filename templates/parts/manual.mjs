// Manual do usuário em HTML (SPEC 9.6): o texto do PDF (data/politicas.json manual.paginas[].texto_exibido)
// vira blocos de leitura sem reescrever palavra. Regras próprias do texto de PDF:
//  - a quebra de linha é a da página impressa: a linha que não termina frase continua na seguinte, mas
//    só dentro do mesmo trecho (o normalize separa por linha em branco o que vinha antes e depois de
//    uma frase retirada; os dois lados nunca se juntam);
//  - linhas em caixa alta seguidas: só se juntam quando continuam um item de lista ("• DURANTE O
//    BANHO, ... DENTRO DA BANHEIRA;"), nunca para formar título;
//  - linha de tabela (caixa alta com número decimal ou três números) fica como linha, nunca título;
//  - título: linha em caixa alta curta, sem pontuação de continuação, seguida de texto (a última linha
//    da página só quando é capítulo do índice). Vira h2 quando
//    corresponde a uma linha do índice do próprio PDF (p. 3); os demais são h3;
//  - o sumário é o índice do PDF: o texto literal de cada linha do índice, ligado ao título
//    correspondente. Linha do índice sem título correspondente no texto exibido fica fora.
import { slugify, semAcento } from '../../build/lib/texto.mjs';
import { trechoDaTabela } from '../../build/manual-tabelas.mjs';

const letras = (s) => (s.match(/\p{L}/gu) || []).length;
const caixaAlta = (s) => letras(s) >= 4 && s === s.toLocaleUpperCase('pt-BR') && /\p{Lu}/u.test(s);
const RE_ITEM = /^(?:[_▪•●–-]|\d+\))\s+/u;
const fechaFrase = (s) => /[.!?:;]["”)]?$/.test(s);
/** Linha de tabela do PDF ("LEPONO 1CV 127 5,91 0,75 10", "SENSUALE REDONDA 215,42"). */
export const linhaDeTabela = (s) => {
  const nums = (s.match(/\d+/g) || []).length;
  if (caixaAlta(s)) return /\d+,\d+/.test(s) || nums >= 3;
  // Linha de tabela em caixa mista ("Aquecedor 5000 W 127 39,37 5 Ver modelo"): curta, com decimal,
  // quatro números ou mais e sem pontuação de frase no fim.
  return s.length <= 64 && /\d+,\d+/.test(s) && nums >= 4 && !/[.;:!?)]$/.test(s);
};
// Rótulo de célula que o PDF põe na linha de cima ("Motobomba" antes de "LEPONO 1CV 127 ...").
const rotuloDeCelula = (s) => s.length <= 24 && letras(s) >= 4 && !/\d/.test(s) && !/[.;:!?,]$/.test(s) && !RE_ITEM.test(s);

const PALAVRAS_VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'os', 'as', 'ao', 'aos', 'para', 'com', 'em', 'no', 'na']);
const palavras = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w.length >= 3 && !PALAVRAS_VAZIAS.has(w));

/** Linhas do índice do PDF (p. 3): [{ texto, pagina }], na ordem impressa. */
export function indiceDoManual(textoIndice) {
  const out = [];
  for (const l of String(textoIndice || '').split('\n')) {
    const m = /^(.*?\S)\s*\.{3,}\s*(\d+)$/.exec(l.trim());
    if (m) out.push({ texto: m[1].trim(), pagina: Number(m[2]) });
  }
  return out;
}

/** Junta as linhas de um trecho conforme as regras do cabeçalho. */
function refluir(linhas) {
  const out = [];
  for (const l of linhas) {
    const ant = out[out.length - 1];
    let junta = false;
    // Tabela: o rótulo da linha de cima entra na linha da tabela; o resto curto da célula ("pág. 20")
    // continua nela.
    if (ant != null && linhaDeTabela(l) && rotuloDeCelula(ant) && !linhaDeTabela(ant)) { out[out.length - 1] = `${ant} ${l}`; continue; }
    if (ant != null && linhaDeTabela(ant) && !linhaDeTabela(l) && l.length <= 12 && /\d/.test(l) && !caixaAlta(l) && !RE_ITEM.test(l)) { out[out.length - 1] = `${ant} ${l}`; continue; }
    if (ant != null && !fechaFrase(ant) && !RE_ITEM.test(l) && !linhaDeTabela(l) && !linhaDeTabela(ant)) {
      if (!caixaAlta(ant) && !caixaAlta(l)) junta = true;
      // Item de lista em caixa alta que continua na linha seguinte.
      else if (caixaAlta(ant) && caixaAlta(l) && RE_ITEM.test(ant)) junta = true;
    }
    // Palavra com hífen no fim da linha impressa ("tomando-" / "se", "vice-" / "versa") continua colada.
    if (junta) out[out.length - 1] = /\p{L}-$/u.test(ant) && /^\p{Ll}/u.test(l) ? `${ant}${l}` : `${ant} ${l}`; else out.push(l);
  }
  return out;
}

/**
 * Blocos de todas as páginas do manual e o sumário a partir do índice do PDF.
 * @param {{pagina:number, texto_exibido:string}[]} paginas  páginas a exibir (sem capa e índice)
 * @param {{texto:string, pagina:number}[]} indice
 * @returns {{ paginas: {n:number, blocos:object[]}[], secoes: {id:string, texto:string, caixa:false}[] }}
 */
export function blocosDoManual(paginas, indice) {
  const ids = new Set();
  const novoId = (pg, t) => {
    const base = `m${pg}-${slugify(t).slice(0, 48) || 'secao'}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };
  const titulos = [];
  const saida = paginas.map((pg) => {
    const linhasPg = [];
    let ls = String(pg.texto_exibido || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
    // Tabelas lidas do PDF (build/manual-tabelas.mjs): o trecho que a extração desmontou sai do texto
    // e a tabela entra no lugar (ou acima da linha onde o PDF a desenha). O título da tabela vira
    // linha própria (título ou parágrafo, pelas regras de sempre).
    for (const t of pg.tabelas || []) {
      const { de, ate } = trechoDaTabela(ls, t);
      const antes = t.titulo.map((x) => x.texto);
      const bloco = ['', ...antes, { tabela: t }, ''];
      ls.splice(de, ate - de + 1, ...(t.inserir_antes ? [''] : bloco));
      if (t.inserir_antes) {
        const k = ls.findIndex((l) => typeof l === 'string' && l === t.inserir_antes);
        if (k < 0) throw new Error(`manual p. ${pg.pagina}: linha "${t.inserir_antes}" não encontrada para a tabela ${t.id}`);
        ls.splice(k, 0, ...bloco);
      }
    }
    if (ls[0] === String(pg.pagina)) ls = ls.slice(1);
    // Trechos separados por linha em branco não se juntam.
    let trecho = [];
    const fecha = () => { if (trecho.length) linhasPg.push(...refluir(trecho)); trecho = []; };
    for (const l of ls) {
      if (typeof l === 'object') { fecha(); linhasPg.push(l); } else if (l) trecho.push(l); else fecha();
    }
    fecha();
    const blocos = linhasPg.map((l, i) => {
      if (typeof l === 'object') return { tipo: 'tabela', tabela: l.tabela };
      const prox = linhasPg[i + 1];
      if (RE_ITEM.test(l)) return { tipo: 'li', texto: l.replace(RE_ITEM, '') };
      if (linhaDeTabela(l)) return { tipo: 'linha', texto: l };
      // Última linha da página (o texto do capítulo é desenho no PDF): só vale como título se for
      // capítulo do índice; senão volta a parágrafo.
      if (caixaAlta(l) && l.length <= 80 && !/[;,]$/.test(l) && (prox == null || typeof prox === 'object' || !linhaDeTabela(prox))) {
        const b = { tipo: 'titulo', texto: l, id: novoId(pg.pagina, l), pagina: pg.pagina, sem_corpo: prox == null };
        titulos.push(b);
        return b;
      }
      if (/;$/.test(l)) return { tipo: 'li', texto: l };
      return { tipo: 'p', texto: l };
    });
    return { n: pg.pagina, blocos };
  });

  // Índice do PDF -> título do texto: todas as palavras da linha do índice no título (ou todas menos
  // uma, quando a linha tem quatro ou mais), a partir de duas páginas antes do número impresso. A linha
  // mais longa escolhe primeiro ("Informações para utilização e conservação do produto" antes de
  // "Utilização do produto").
  const secoes = [];
  const usados = new Set();
  for (const e of [...indice].sort((a, b) => palavras(b.texto).length - palavras(a.texto).length)) {
    const pe = palavras(e.texto);
    if (!pe.length) continue;
    const t = titulos.find((x) => {
      if (usados.has(x.id) || x.pagina < e.pagina - 2) return false;
      const pt = new Set(palavras(x.texto));
      const faltam = pe.filter((w) => !pt.has(w)).length;
      return faltam === 0 || (pe.length >= 4 && faltam === 1);
    });
    if (!t) continue;
    usados.add(t.id);
    t.capitulo = true;
    secoes.push({ id: t.id, texto: e.texto, caixa: false, ordem: titulos.indexOf(t) });
  }
  secoes.sort((a, b) => a.ordem - b.ordem);
  // Níveis: capítulo do índice é h2; os outros títulos, h3 (h2 enquanto nenhum capítulo abriu, para
  // o nível não pular de h1 para h3).
  let abriu = false;
  for (const t of titulos) {
    if (t.sem_corpo && !t.capitulo) { t.tipo = 'p'; delete t.id; continue; }
    if (t.capitulo) abriu = true;
    t.tipo = t.capitulo || !abriu ? 'h2' : 'h3';
    t.caixa = true;
  }
  return { paginas: saida, secoes: secoes.map(({ ordem, ...s }) => s) };
}
