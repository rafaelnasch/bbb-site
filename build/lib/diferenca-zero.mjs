// SPEC 13.1 (diferença zero) e 13.2 (rastreio), sobre o HTML gerado em dist/.
//
// 13.2: todo elemento com data-campo usa uma chave de data/exibidos.map.json.
// 13.1: em cada uma das 292 páginas de produto, nome, SKU, disponibilidade, preço "por" e "de",
// rótulos de tamanho, valores da ficha, itens de série, rótulos de opção e cotas da planta, lidos
// do HTML pelos data-campo, batem com data/produtos.json (que é a cópia literal de catalog.json,
// descontado só o filtro editorial registrado em data/editorial-log.json).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../../site.config.mjs';

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decod = (s) => String(s).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]);
const esp = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const limpo = (s) => decod(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Todos os elementos com data-campo: [{ campo, attrs, texto }]. Elementos com data-campo não aninham o mesmo nome de tag. */
export function camposDoHtml(h) {
  const out = [];
  const re = /<([a-z][a-z0-9]*)\b([^>]*\sdata-campo="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g;
  for (const m of h.matchAll(re)) out.push({ tag: m[1], campo: m[3], attrs: m[2], texto: limpo(m[4]) });
  // elementos sem fechamento (a, por exemplo, sempre fecha; void elements não levam data-campo)
  return out;
}

const attr = (attrs, nome) => (new RegExp(`\\s${nome}="([^"]*)"`).exec(attrs) || [])[1];

/** 13.2 rastreio em uma página. */
export function rastreio(h, mapa) {
  const erros = [];
  for (const m of h.matchAll(/\sdata-campo="([^"]+)"/g)) if (!mapa[m[1]]) erros.push(`data-campo sem chave em exibidos.map.json: ${m[1]}`);
  return [...new Set(erros)];
}

/** 13.1 diferença zero de uma página de produto. Devolve a lista de divergências. */
export function diferencaZeroProduto(h, p) {
  const err = [];
  const cs = camposDoHtml(h);
  const de = (k) => cs.filter((c) => c.campo === k);
  const iguais = (k, esperado, { obrigatorio = true } = {}) => {
    const v = de(k);
    if (!v.length) { if (obrigatorio && esperado != null && esperado !== '') err.push(`${k} ausente`); return; }
    for (const x of v) if (x.texto !== esp(esperado)) err.push(`${k}: "${x.texto}" ≠ "${esperado}"`);
  };
  iguais('nome', p.nome);
  iguais('sku', p.sku);
  iguais('disponibilidade', p.disponibilidade);
  iguais('preco-por', p.preco?.por);
  iguais('preco-de', p.preco?.de, { obrigatorio: Boolean(p.preco?.de) });
  iguais('resumo', p.d_resumo, { obrigatorio: false });

  // Tamanhos: o conjunto exibido é exatamente o das opções de tamanho.
  const tams = (p.d_tamanhos || []).filter((t) => t.origem === 'opcao' && t.rotulo).map((t) => esp(t.rotulo));
  const tExib = de('tamanho-rotulo').map((x) => x.texto);
  const ordenar = (a) => [...a].sort();
  if (JSON.stringify(ordenar(tExib)) !== JSON.stringify(ordenar(tams))) err.push(`tamanhos exibidos [${tExib.join(' | ')}] ≠ [${tams.join(' | ')}]`);

  // Ficha: todo valor exibido é o literal do rótulo; fora acessórios, todo rótulo aparece.
  const e = p.especificacoes || {};
  const vistos = new Set();
  for (const x of de('ficha-valor')) {
    const k = attr(x.attrs, 'data-ficha');
    vistos.add(k);
    if (!(k in e)) err.push(`ficha "${k}" não existe na fonte`);
    else if (x.texto !== String(e[k]).replace(/\s+/g, ' ').trim()) err.push(`ficha ${k}: "${x.texto}" ≠ "${e[k]}"`);
  }
  if (p.d_tipo !== 'acessorio') for (const k of Object.keys(e)) if (!vistos.has(k)) err.push(`ficha ${k} não exibida`);

  // Itens de série: a lista exibida, na ordem, é a da fonte menos o filtro editorial.
  const itens = de('item-serie').map((x) => x.texto);
  const esperado = (p.d_itens_de_serie_exibidos || []).map((s) => String(s).replace(/\s+/g, ' ').trim());
  if (JSON.stringify(itens) !== JSON.stringify(esperado)) err.push(`itens de série divergem (${itens.length} exibidos, ${esperado.length} na fonte filtrada)`);

  // Opções: todo rótulo exibido existe nas opções da fonte, e todo valor de opção que não é tamanho aparece.
  const rotOp = new Set((p.opcoes_personalizaveis || []).flatMap((o) => (o.valores || []).map((v) => String(v.rotulo_exibido).replace(/\s+/g, ' ').trim())));
  const exibOp = de('opcao-rotulo').map((x) => x.texto);
  for (const r of exibOp) if (!rotOp.has(r)) err.push(`opção "${r}" não existe na fonte`);
  const naoTam = (p.opcoes_personalizaveis || []).filter((o) => !/^tamanho:?$/i.test(o.titulo)).flatMap((o) => o.valores.map((v) => String(v.rotulo_exibido).replace(/\s+/g, ' ').trim()));
  for (const r of naoTam) if (!exibOp.includes(r)) err.push(`opção "${r}" não exibida`);

  // Cotas: letra e valor exibidos existem numa planta validada deste produto.
  const pares = new Set();
  for (const dp of p.d_planta || []) {
    if (!dp.sha1) continue;
    const f = join(paths.data, 'plantas', `${dp.sha1}.json`);
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (!j.validada) continue;
    for (const c of j.cotas || []) pares.add(`${c.letra}=${c.valor_texto}`);
  }
  for (const x of de('planta-cota')) {
    const k = `${attr(x.attrs, 'data-cota-valor')}=${x.texto}`;
    if (!pares.has(k)) err.push(`cota ${k} fora das plantas validadas do produto`);
  }
  return err;
}

/** Roda 13.1 e 13.2 em dist/. */
export function verificarDiferencaZero(dist) {
  const erros = [];
  const mapaArq = join(paths.data, 'exibidos.map.json');
  if (!existsSync(mapaArq)) return { erros, pendente: '13.1 e 13.2 (exibidos.map.json ausente)' };
  const mapa = JSON.parse(readFileSync(mapaArq, 'utf8')).campos || {};
  const prods = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
  for (const p of prods) {
    const f = join(dist, `${p.slug}.html`);
    if (!existsSync(f)) continue;
    const h = readFileSync(f, 'utf8');
    for (const e of diferencaZeroProduto(h, p)) erros.push(`${p.slug}.html: 13.1 ${e}`);
  }
  return { erros, mapa };
}
