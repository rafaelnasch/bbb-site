// Dados compartilhados das ferramentas de escolha (SPEC 6.2 e 9.2 a 9.5): coleção, escolhedor,
// comparador, busca e guias. Tudo sai de data/ já normalizado; aqui só se filtra, conta, ordena e
// converte medidas publicadas em números (SPEC 0.2). Campo em conflito entre nome e ficha
// (d_conflito_nome_ficha) não entra em filtro nem em etiqueta: fica como desconhecido, nunca escolhido.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../../site.config.mjs';
import { url } from './url.mjs';
import { fotosProduto } from './midia.mjs';
import { tamanhoCm, cm } from './encaixe.mjs';
import { rotuloTam, plantaDoTamanho, urlPdf } from '../../templates/parts/planta.mjs';
import { ordenarFotos } from '../../templates/parts/galeria.mjs';
import { fmtMetros } from './medidas.mjs';

export const TIPOS = Object.freeze(['banheira', 'spa', 'ofuro', 'sauna', 'acessorio']);
export const NOME_TIPO = Object.freeze({ banheira: 'Banheira', spa: 'Spa', ofuro: 'Ofurô', sauna: 'Sauna', acessorio: 'Acessório' });
export const PLURAL_TIPO = Object.freeze({ banheira: 'banheiras', spa: 'spas', ofuro: 'ofurôs', sauna: 'saunas', acessorio: 'acessórios' });
export const RAIZ_TIPO = Object.freeze({ banheira: 'banheiras.html', spa: 'spas.html', ofuro: 'ofuros.html', sauna: 'sauna.html', acessorio: 'acessorios.html' });
export const CAMPOS_FACETA = Object.freeze(['Forma', 'Lugares', 'Material', 'Configuracao']);
export const ROTULO_CAMPO = Object.freeze({ Forma: 'Forma', Lugares: 'Lugares', Material: 'Material', Configuracao: 'Configuração' });

// Categorias reais usadas como filtro pelo escolhedor (SPEC 9.4, perguntas 3 e 4).
export const CAT_BANHEIRO = 'banheiras/banheira-para-banheiro.html';
export const CAT_OFURO_EXTERNO = 'ofuro-externo.html';
export const CAT_SPA_LUGARES = Object.freeze([
  ['3 a 4', 'spas/3-a-4-lugares.html'],
  ['5 a 6', 'spas/5-a-6-lugares.html'],
  ['6 a 7', 'spas/6-a-7-lugares.html'],
  ['7 a 8', 'spas/7-a-8-lugares.html'],
]);
// Páginas de categoria do Magento sem .html: viram páginas-ponte (SPEC 4.1), não coleções.
export const CATEGORIAS_PONTE = Object.freeze(['catalog/category/view/id/130', 'catalog/category/view/id/131']);

/** Valor literal de um campo da ficha, ou null se ausente ou em conflito com o nome. */
export function campo(p, k) {
  const conf = (p.d_conflito_nome_ficha || []).some((c) => c.campo === k);
  const v = p.especificacoes?.[k];
  return conf || v == null || v === '' ? null : String(v);
}

/** Foto do cartão: a primeira de fundo azul (as de fundo vermelho vão para o fim, SPEC 6.2). */
export function fotoCartao(slug, evitar = null) {
  const fs = ordenarFotos(fotosProduto(slug));
  // Cartões vizinhos com a mesma foto (versões irmãs repetem a galeria): usa a próxima foto da própria
  // galeria que não seja a do vizinho, quando existir (mesma ordem: fundo azul antes do vermelho).
  if (evitar?.size) return fs.find((f) => !f.sha1 || !evitar.has(f.sha1)) || fs[0] || null;
  return fs[0] || null;
}

/** Menor arquivo WebP de uma foto (para cartões montados no navegador): { src, w, h }. */
export function fotoPequena(f) {
  if (!f) return null;
  const webp = f.fontes.find((x) => x.type === 'image/webp');
  if (webp) {
    const [src, w] = webp.srcset.split(/,\s+/)[0].trim().split(/\s+/);
    const largura = parseInt(w, 10);
    return { src, w: largura, h: Math.round((f.height / f.width) * largura) };
  }
  return { src: f.src, w: f.width, h: f.height };
}

/** Tamanhos do produto com medidas de encaixe (cm). Sem medida numérica: fica de fora do encaixe. */
export function tamanhosProduto(p) {
  return (p.d_tamanhos || []).map((t) => ({ t, rotulo: rotuloTam(t), cm: tamanhoCm(t) }));
}

/** Menor e maior dimensão publicadas da coleção, contando as duas versões quando ficha e opção divergem. */
export function faixaMedidas(produtos) {
  const vals = [];
  for (const p of produtos) {
    for (const t of p.d_tamanhos || []) {
      const a = Number(t.a), b = Number(t.b);
      if (a > 0 && b > 0) vals.push(Math.max(a, b));
      const n = t.ficha?.num;
      if (n) {
        const fx = [n.Comprimento, n.Largura].filter((x) => x > 0);
        if (fx.length === 2) vals.push(Math.max(...fx));
      }
    }
  }
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

export function faixaLugares(produtos) {
  const ns = produtos.map((p) => (campo(p, 'Lugares') ? p.d_lugares_num : null)).filter((n) => Number.isInteger(n));
  if (!ns.length) return null;
  return { min: Math.min(...ns), max: Math.max(...ns) };
}

/** "55 spas, de 1,50 a 2,65 m, para 3 a 8 pessoas" (SPEC 9.2), só com o que os dados sustentam. */
export function fraseColecao(produtos, total) {
  const tipos = new Set(produtos.map((p) => p.d_tipo));
  const nome = tipos.size === 1 ? PLURAL_TIPO[[...tipos][0]] : 'peças';
  const um = { banheiras: 'banheira', spas: 'spa', 'ofurôs': 'ofurô', saunas: 'sauna', 'acessórios': 'acessório', 'peças': 'peça' }[nome];
  const partes = [`${total} ${total === 1 ? um : nome}`];
  if (!tipos.has('acessorio')) {
    const m = faixaMedidas(produtos);
    if (m) partes.push(m.min === m.max ? `de ${fmtMetros(m.min)} m` : `de ${fmtMetros(m.min)} a ${fmtMetros(m.max)} m`);
    const l = faixaLugares(produtos);
    if (l) partes.push(l.min === l.max ? `para ${l.min} ${l.min === 1 ? 'pessoa' : 'pessoas'}` : `para ${l.min} a ${l.max} pessoas`);
  }
  return partes.join(', ');
}

/** Produtos de uma categoria na ordem da listagem. */
export function produtosDaCategoria(cat, porSlug) {
  return (cat.produtos || []).map((s) => porSlug.get(s)).filter(Boolean);
}

const semAcento = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Nome da categoria com a coleção raiz na frente quando ele sozinho não diz o tipo ("Spas · 5 a 6 Lugares"). */
export function rotuloCategoria(c, D) {
  const partes = c.d_path.split('/');
  if (partes.length < 2) return c.nome;
  const raiz = D.catPorPath.get(`${partes[0]}.html`);
  if (!raiz) return c.nome;
  const r = semAcento(raiz.nome).replace(/s$/, '');
  return semAcento(c.nome).includes(r) ? c.nome : `${raiz.nome} · ${c.nome}`;
}

/**
 * Índice leve do catálogo (dados/indice.json), lido pelo escolhedor, pela busca e pelo comparador.
 * Chaves curtas para caber no orçamento (SPEC 12: índice <= 40 KB gzip).
 */
export function indiceCatalogo(D) {
  // Ordem do catálogo: a posição nas listagens das coleções raiz do site atual (banheiras, spas, ofurôs,
  // sauna, acessórios); o escolhedor usa esta ordem quando não há espaço informado.
  const pos = new Map();
  for (const raiz of Object.values(RAIZ_TIPO)) for (const sl of D.catPorPath.get(raiz)?.produtos || []) if (!pos.has(sl)) pos.set(sl, pos.size);
  const produtos = [...D.ler('produtos.json')].sort((a, b) => (pos.get(a.slug) ?? Infinity) - (pos.get(b.slug) ?? Infinity));
  const cats = D.categorias.filter((c) => !CATEGORIAS_PONTE.includes(c.d_path));
  const idxCat = new Map(cats.map((c, i) => [c.d_path, i]));
  const itens = produtos.map((p) => {
    const f = fotoPequena(fotoCartao(p.slug));
    const ts = tamanhosProduto(p).map(({ t, rotulo, cm: m }) => [
      rotulo,
      m ? m.menor : null,
      m ? m.maior : null,
      t.preco_adicional || 0,
      m?.confirmar ? 1 : 0,
      t.c ? cm(t.c) : t.altura ? cm(t.altura) : null,
    ]);
    const o = {
      s: p.slug,
      n: p.nome,
      k: p.sku,
      t: p.d_tipo,
      pf: p.preco?.valores_numericos?.finalPrice ?? null,
      po: p.preco?.por || null,
      ts,
      c: (p.d_categorias_paths || []).map((x) => idxCat.get(x)).filter((x) => x != null),
    };
    const fo = campo(p, 'Forma'), lu = campo(p, 'Lugares'), ma = campo(p, 'Material'), co = campo(p, 'Configuracao');
    if (fo) o.fo = fo;
    if (lu) { o.lu = lu; if (Number.isInteger(p.d_lugares_num)) o.ln = p.d_lugares_num; }
    if (ma) o.ma = ma;
    if (co) o.co = co;
    if (p.preco?.de) o.de = p.preco.de;
    if (p.disponibilidade && p.disponibilidade !== 'Disponível') o.d = p.disponibilidade;
    if (p.d_aquecedor != null) o.aq = p.d_aquecedor_rotulo || null;
    if (f) o.f = [f.src, f.w, f.h];
    if ((p.d_planta || []).some((x) => x.pdf_path)) o.pl = 1;
    if (p.d_medida_confirmada === false) o.mc = 1;
    return o;
  });
  return {
    sobre: 'Índice do catálogo publicado pela Banheiras Bom Banho, gerado de data/produtos.json. Medidas em cm (ts: rótulo literal, menor, maior, preço adicional, medida a confirmar, profundidade ou altura).',
    coletado_em: D.dataColeta,
    cats: cats.map((c) => [c.d_path, c.nome, c.total_exibido, rotuloCategoria(c, D)]),
    itens,
  };
}

/**
 * Fichas para o comparador (dados/fichas.json): rótulos literais da ficha, itens de série exibidos,
 * conflitos nome x ficha e as plantas oficiais por tamanho.
 */
export function fichasComparador(D) {
  const produtos = D.ler('produtos.json');
  const out = {};
  for (const p of produtos) {
    const pl = {};
    for (const t of p.d_tamanhos || []) {
      const x = plantaDoTamanho(p, t);
      if (!x) continue;
      const thumb = x.media && existsSync(join(paths.public, 'media', 'plantas', x.sha1, 'planta-1200.webp')) ? url(`media/plantas/${x.sha1}/planta-1200.webp`) : null;
      pl[rotuloTam(t)] = [urlPdf(x.pdf), thumb, x.w && x.h ? Math.round((x.h / x.w) * 1200) : null];
    }
    const conf = {};
    for (const c of p.d_conflito_nome_ficha || []) conf[c.campo] = c.nome_diz;
    const fichaDiv = {};
    for (const t of p.d_tamanhos || []) if (t.ficha && t.rotulo) fichaDiv[t.rotulo] = [t.ficha.Comprimento, t.ficha.Largura, t.ficha.Profundidade].filter(Boolean).join(' x ');
    out[p.slug] = {
      e: p.especificacoes || {},
      i: p.d_itens_de_serie_exibidos || [],
      ...(Object.keys(conf).length ? { cf: conf } : {}),
      ...(Object.keys(fichaDiv).length ? { fd: fichaDiv } : {}),
      ...(Object.keys(pl).length ? { pl } : {}),
    };
  }
  return out;
}

/**
 * Preços com que um item vendido avulso (Air Blower) aparece como opcional em outros modelos (SPEC 15:
 * cada preço onde aparece, com nota). Devolve [{ preco: 'R$ 2.035,20', modelos: 54 }, ...] em ordem de
 * frequência, lidos dos rótulos literais das opções; vazio para os demais produtos.
 */
export function precosComoOpcao(p, produtos) {
  if (!/air blower/i.test(p.nome)) return [];
  const cont = new Map();
  for (const q of produtos) {
    for (const o of q.opcoes_personalizaveis || []) {
      for (const v of o.valores || []) {
        if (!/air blower/i.test(v.nome || v.rotulo_exibido)) continue;
        const m = /R\$\s?[\d.]+,\d{2}/.exec(v.rotulo_exibido);
        if (m) cont.set(m[0], (cont.get(m[0]) || 0) + 1);
      }
    }
  }
  return [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([preco, modelos]) => ({ preco, modelos }));
}

/** Texto da nota de preço por contexto (página do produto e llms-full.txt dizem a mesma coisa). */
export function notaPrecosComoOpcaoTexto(p, produtos) {
  const lista = precosComoOpcao(p, produtos);
  if (!lista.length) return null;
  const partes = lista.map(({ preco, modelos }) => `${preco} (em ${modelos} ${modelos === 1 ? 'modelo' : 'modelos'})`);
  return `Como opcional dos spas, este item aparece por ${partes.join(' e ')}. Cada preço vale onde está publicado. Confirme o valor com o consultor.`;
}

/**
 * Conflito da fonte (SPEC 0.3 e 15): o catálogo traz alguns acessórios como "Disponível", e a página de
 * prazos (politicas.itens_avulsos_suspensos) diz que os itens avulsos citados estão temporariamente fora
 * de venda. A lista de itens sai do próprio texto literal ("...itens avulsos: aquecedores, acionadores e
 * cromoterapia; ..."); o acessório casa pelo início do nome. Devolve a nota com as duas versões, sem
 * escolher nenhuma, ou null.
 */
export function avulsoSuspenso(p, politicas) {
  const lit = politicas?.itens_avulsos_suspensos?.literal;
  if (!lit || p.d_tipo !== 'acessorio') return null;
  const m = /avulsos:\s*([^;]+);/i.exec(lit);
  if (!m) return null;
  const sem = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const itens = m[1].split(/,|\se\s/).map(sem).filter(Boolean).map((t) => t.replace(/ores$/, 'or'));
  const nome = sem(p.nome);
  if (!itens.some((t) => nome.startsWith(t))) return null;
  return {
    disponibilidade: p.disponibilidade,
    literal: lit.replace(/^\*\s*/, ''),
    fonte: politicas.itens_avulsos_suspensos.fonte,
  };
}

/**
 * availability do Offer no JSON-LD (SPEC 11.2), ou null quando a fonte se contradiz sobre a venda do item
 * (itens avulsos suspensos, SPEC 15): o catálogo diz "Disponível" e a página de prazos diz que o item está
 * temporariamente fora de venda. O dado estruturado não escolhe nenhuma das duas versões (regra 0.3).
 */
export function disponibilidadeSchema(p, politicas) {
  if (avulsoSuspenso(p, politicas)) return null;
  return p.disponibilidade === 'Esgotado' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
}

/** Texto do aviso dos itens avulsos suspensos para as saídas em texto (llms-full.txt e catalogo.json). */
export function avisoAvulsoSuspensoTexto(p, politicas) {
  const n = avulsoSuspenso(p, politicas);
  if (!n) return null;
  return `No catálogo: ${n.disponibilidade}. A página de prazos de entrega informa: “${n.literal}” As duas informações são publicadas pela empresa. Confirme com o consultor antes de comprar.`;
}
