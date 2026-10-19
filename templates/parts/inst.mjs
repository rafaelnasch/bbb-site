// Peças comuns das páginas institucionais (SPEC 9.6): topo em sala escura, texto literal em leitura
// longa de dia, sumário, nota de fonte e o envelope do layout. O texto vem sempre de data/ e só muda
// de forma (títulos, listas, parágrafos, e-mail virando link); nenhuma palavra é reescrita.
import { html, attrs } from '../../build/lib/html.mjs';
import { url, abs } from '../../build/lib/url.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { breadcrumb } from './breadcrumb.mjs';
import { slugify } from '../../build/lib/texto.mjs';

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Texto com e-mails como link mailto (o resto é escapado). */
export function comLinks(texto) {
  const s = String(texto ?? '');
  const out = [];
  let i = 0;
  for (const m of s.matchAll(RE_EMAIL)) {
    const e = m[0].replace(/\.$/, '');
    out.push(s.slice(i, m.index), html`<a class="link" href="mailto:${e}">${e}</a>`);
    i = m.index + e.length;
  }
  out.push(s.slice(i));
  return out;
}

const letras = (s) => (s.match(/\p{L}/gu) || []).length;
/** Linha toda em caixa alta (título da fonte, como "TROCA DO PRODUTO"). */
export const emCaixaAlta = (s) => letras(s) >= 4 && s === s.toLocaleUpperCase('pt-BR') && /\p{Lu}/u.test(s);
const RE_ITEM = /^(?:[_▪•●–-]|\d+\))\s+/u;

/**
 * Converte o texto literal (uma linha por título, item ou parágrafo) em blocos:
 *  - linha em caixa alta curta -> título de seção (h2, entra no sumário)
 *  - linha curta sem pontuação final, seguida de texto -> subtítulo (h3)
 *  - "_ item", "▪ item", "1) item" ou linha terminada em ";" -> item de lista
 *  - o resto -> parágrafo
 * @returns {{ blocos: object[], secoes: {id:string, texto:string}[] }}
 */
export function blocosDoTexto(texto, { prefixo = 's', nivelCaixaAlta = 2, jaTemH2 = false, refluir = false, subtitulos = true } = {}) {
  let linhas = String(texto ?? '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // Texto extraído de PDF (manual): a quebra de linha é a da página impressa, não um parágrafo. A linha
  // que não termina frase continua na seguinte (as palavras e a ordem não mudam).
  if (refluir) {
    const out = [];
    for (const l of linhas) {
      const ant = out[out.length - 1];
      const junta = ant != null && !/[.!?:;]$/.test(ant) && !(emCaixaAlta(ant) && ant.length <= 96) && !emCaixaAlta(l) && !RE_ITEM.test(l);
      if (junta) out[out.length - 1] = `${ant} ${l}`; else out.push(l);
    }
    linhas = out;
  }
  const blocos = [];
  const secoes = [];
  const ids = new Set();
  const novoId = (t) => {
    let base = `${prefixo}-${slugify(t).slice(0, 48) || 'secao'}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };
  // Sem h2 antes, um subtítulo vira h2: o nível do título não pula (h1 -> h3).
  let temH2 = jaTemH2;
  linhas.forEach((l, i) => {
    const prox = linhas[i + 1];
    if (RE_ITEM.test(l)) return blocos.push({ tipo: 'li', texto: l.replace(RE_ITEM, '') });
    if (emCaixaAlta(l) && l.length <= 96) {
      const id = novoId(l);
      const nivel = temH2 ? nivelCaixaAlta : 2;
      if (nivel === 2) { secoes.push({ id, texto: l }); temH2 = true; }
      return blocos.push({ tipo: `h${nivel}`, texto: l, id, caixa: true });
    }
    if (subtitulos && prox && l.length <= 72 && !/[.,;:!?)"”]$/.test(l) && l.split(' ').length <= 10) {
      const id = novoId(l);
      if (!temH2) { secoes.push({ id, texto: l, caixa: false }); temH2 = true; return blocos.push({ tipo: 'h2', texto: l, id }); }
      return blocos.push({ tipo: 'h3', texto: l, id });
    }
    if (/;$/.test(l)) return blocos.push({ tipo: 'li', texto: l });
    return blocos.push({ tipo: 'p', texto: l });
  });
  return { blocos, secoes };
}

/** Blocos em HTML (itens seguidos viram uma lista). */
export function prosa(blocos, { campo = 'institucional-texto' } = {}) {
  const out = [];
  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i];
    if (b.tipo === 'li') {
      const itens = [];
      while (blocos[i]?.tipo === 'li') itens.push(blocos[i++]);
      i--;
      out.push(html`<ul class="inst-lista">${itens.map((x) => html`<li>${comLinks(x.texto)}</li>`)}</ul>`);
    } else if (b.tipo === 'linha') {
      // Linhas de tabela do PDF (manual): uma por linha, sem marcador, na ordem do original.
      const itens = [];
      while (blocos[i]?.tipo === 'linha') itens.push(blocos[i++]);
      i--;
      out.push(html`<ul class="inst-lista inst-lista--linhas num">${itens.map((x) => html`<li>${x.texto}</li>`)}</ul>`);
    } else if (b.tipo === 'tabela') {
      out.push(tabelaDoManual(b.tabela, blocos.slice(0, i).reverse().find((x) => (x.tipo === 'h2' || x.tipo === 'h3') && x.id)));
    } else if (b.tipo === 'h2') out.push(html`<h2${attrs({ id: b.id, class: b.caixa ? 'inst-h2 inst-h2--caixa' : 'inst-h2' })}>${b.texto}</h2>`);
    else if (b.tipo === 'h3') out.push(html`<h3${attrs({ id: b.id, class: b.caixa ? 'inst-h3 inst-h3--caixa' : 'inst-h3' })}>${b.texto}</h3>`);
    else out.push(html`<p>${comLinks(b.texto)}</p>`);
  }
  return html`<div class="inst-prosa" data-campo="${campo}">${out}</div>`;
}

/**
 * Tabela do manual lida do PDF (build/manual-tabelas.mjs): células e mesclas como na página
 * impressa; a primeira coluna das linhas de dados é o rótulo da linha (<th scope="row">). O nome
 * acessível é o rótulo da configuração ou o título que vem antes (aria-labelledby).
 */
function tabelaDoManual(t, tituloAntes) {
  // Nome: o rótulo da configuração; senão o título da própria tabela; senão o último título da página.
  // A mesma tabela continua por várias páginas do PDF: o nome leva a página, para cada região ser única.
  const nome = t.rotulo ? `${t.rotulo}, página ${t.pagina} do manual` : null;
  const titulo = nome ? null : (tituloAntes?.id || null);
  const cab = t.linhas.slice(0, t.cabecalho);
  const corpo = t.linhas.slice(t.cabecalho);
  const celula = (c, tag, extra = {}) => {
    const partes = String(c.texto).split('\n');
    return html`<${tag}${attrs({ rowspan: c.rs || null, colspan: c.cs || null, ...extra })}>${partes.map((x, k) => html`${k ? html`<br>` : ''}${x}`)}</${tag}>`;
  };
  return html`<div${attrs({ class: 'rolagem inst-mtab-rol', tabindex: '0', role: 'region', 'aria-labelledby': titulo, 'aria-label': nome })}><table${attrs({ class: `inst-tab inst-mtab${t.linhas[0]?.length > 3 ? ' inst-mtab--larga' : ''}`, id: `tab-${t.id}`, 'aria-labelledby': titulo, 'aria-label': nome, 'data-campo': 'manual-tabela', 'data-pagina': String(t.pagina) })}>
    ${cab.length ? html`<thead>${cab.map((l) => html`<tr>${l.map((c) => celula(c, 'th', { scope: c.cs ? 'colgroup' : 'col' }))}</tr>`)}</thead>` : ''}
    <tbody>${corpo.map((l) => {
      // Linha que continua uma célula mesclada de cima não tem a primeira coluna: nenhuma célula é rótulo.
      const completa = l.length === Math.max(...corpo.map((x) => x.reduce((n, c) => n + (c.cs || 1), 0)));
      return html`<tr>${l.map((c, j) => celula(c, t.rotulo_linha && j === 0 && completa ? 'th' : 'td', t.rotulo_linha && j === 0 && completa ? { scope: c.rs ? 'rowgroup' : 'row' } : {}))}</tr>`;
    })}</tbody>
  </table></div>`;
}

/** Sumário "Nesta página" (âncoras das seções). */
export function sumario(secoes, { titulo = 'Nesta página', classe = '' } = {}) {
  if (!secoes || secoes.length < 2) return '';
  return html`<nav class="inst-sumario ${classe}" aria-labelledby="inst-sum-h">
  <h2 class="etiqueta etiqueta--linha" id="inst-sum-h">${titulo}</h2>
  <ol role="list">${secoes.map((s, i) => html`<li><a href="#${s.id}"><span class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span${attrs({ class: s.caixa === false ? null : 'inst-sumario__caixa' })}>${s.texto}</span></a></li>`)}</ol>
</nav>`;
}

/** Nota da fonte: de onde o texto veio e quando foi coletado. */
export function notaFonte(D, fonte, { prefixo = 'Texto publicado pela Banheiras Bom Banho no site atual' } = {}) {
  const f = Array.isArray(fonte) ? fonte[0] : fonte;
  const href = /^https?:/.test(f || '') ? f.split(' ')[0] : null;
  return html`<p class="inst-fonte">${icone('ponto', { tamanho: 14 })}<span>${prefixo}${href ? html` (<a${attrs({ class: 'link', href, target: '_blank', rel: 'noopener' })}>página de origem</a>)` : ''}, coletado em <span class="num" data-campo="data-coleta">${D.dataColeta}</span>.</span></p>`;
}

/** Topo das páginas institucionais (sala escura, como os guias e as ferramentas). */
export function topo({ trilha, etiqueta = null, h1, lead = null, extra = '', id = 'inst-h1', classe = '' }) {
  return html`<section class="sala ferr-topo inst-topo ${classe}" aria-labelledby="${id}">
  <div class="ferr-topo__fundo" aria-hidden="true"></div>
  <div class="wrap ferr-topo__in">
    ${breadcrumb(trilha.map((t, i) => ({ nome: t.nome, href: i < trilha.length - 1 ? url(t.path) : null })))}
    ${etiqueta ? html`<p class="etiqueta etiqueta--linha" data-intro style="--i:0">${etiqueta}</p>` : ''}
    <h1 id="${id}" class="ferr-topo__h1 inst-h1" data-intro="mascara" style="--i:1">${h1}</h1>
    ${lead ? html`<p class="ferr-topo__lead" data-intro style="--i:2">${lead}</p>` : ''}
    ${extra}
  </div>
</section>`;
}

/** Botão de WhatsApp de um papel de contatos.json (link funciona sem JS). */
export function botaoWhats(D, papel, { rotulo, contexto, texto, classe = 'btn btn--whats' } = {}) {
  return html`<a${attrs({ class: classe, href: texto === undefined ? D.wa(papel) : D.wa(papel, texto), target: '_blank', rel: 'noopener', 'data-wa-papel': papel, 'data-wa-contexto': contexto, 'data-campo': 'contato-numero' })}>${icone('whatsapp', { tamanho: 20 })}${rotulo}</a>`;
}

/** Trilha a partir de [{nome, path}] (a primeira é sempre o Início). */
export const inicio = { nome: 'Início', path: '' };

/** JSON-LD comum: página + trilha + referência à organização. */
export function jsonldPagina(D, { saida, nome, descricao, tipo = 'WebPage', trilha, extra = [] }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': tipo, '@id': `${abs(saida)}#pagina`, url: abs(saida), name: nome, description: descricao, inLanguage: 'pt-BR', isPartOf: { '@id': abs('#site') }, publisher: { '@id': abs('#org') } },
      { '@type': 'WebSite', '@id': abs('#site'), url: abs(''), name: D.empresa.nome, inLanguage: 'pt-BR' },
      { '@type': 'Organization', '@id': abs('#org'), name: D.empresa.nome, url: abs('') },
      { '@type': 'BreadcrumbList', itemListElement: trilha.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.nome, item: abs(t.path) })) },
      ...extra,
    ],
  };
}

/** Envelope do layout para as páginas institucionais (CSS crítico do topo e do corpo). */
export function pagina(ctx, { saida, titulo, descricao, corpo, trilha, tipo = 'WebPage', extraLd = [], ativo = null, modulos = [], robots, og, jsonld }) {
  const nome = trilha[trilha.length - 1].nome;
  return {
    saida,
    html: ctx.layout({
      saida,
      titulo,
      descricao,
      corpo,
      robots,
      og,
      jsonld: jsonld || [jsonldPagina(ctx.dados, { saida, nome, descricao, tipo, trilha, extra: extraLd })],
      ativo,
      modulos,
      sobre: true,
      classe: 'pg-inst',
      critico: ['ferramenta', 'inst'],
      cssBloqueante: true,
    }),
  };
}
