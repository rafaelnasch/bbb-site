// Guias (SPEC 9.5): quatro páginas 100% calculadas a partir de data/. Títulos em pergunta, nenhuma
// afirmação técnica que a empresa não publicou: só contagens, faixas, diferenças entre preços
// publicados, itens de série literais e as respostas literais da empresa (FAQ). `Article` com a data
// do build como data de atualização.
import { html, attrs, raw } from '../build/lib/html.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { formatBRL } from '../build/lib/money.mjs';
import { fmtMetros } from '../build/lib/medidas.mjs';
import { breadcrumb } from './parts/breadcrumb.mjs';
import { perguntaLegivel } from './parts/faq-bloco.mjs';
import { rotuloTam } from './parts/planta.mjs';
import { campo, tamanhosProduto, faixaMedidas, NOME_TIPO, PLURAL_TIPO } from '../build/lib/catalogo.mjs';

const HOJE = new Date().toISOString().slice(0, 10);
const TIPOS_TAB = ['banheira', 'spa', 'ofuro', 'sauna'];
/** Valor com sinal: "+R$ 612,23" ou "-R$ 1.438,77". */
const brlSinal = (n) => `${n < 0 ? '-' : '+'}${formatBRL(Math.abs(n))}`;
const pct = (n) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ORDEM_LUGARES = (v) => (/^individual/i.test(v) ? 1 : parseInt(v, 10) || 99);

/** Nome comum de duas versões irmãs: as palavras iniciais em comum, sem conectivos soltos no fim. */
function nomeDoPar(a, b) {
  const x = a.split(/\s+/), y = b.split(/\s+/);
  const out = [];
  for (let i = 0; i < Math.min(x.length, y.length) && x[i].toLowerCase() === y[i].toLowerCase(); i++) out.push(x[i]);
  while (out.length && /^(completa|completo|com|em|b[áa]sica|b[áa]sico|hidro|individual)$/i.test(out[out.length - 1])) out.pop();
  return out.join(' ') || a;
}

/** Pares de versões irmãs que diferem só em `varia` (o outro campo igual), sem conflito nome x ficha. */
function pares(D, varia, fixo) {
  const produtos = D.ler('produtos.json');
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));
  const fams = D.ler('familias.json') || {};
  const out = [];
  for (const f of Object.values(fams)) {
    const ms = f.membros.map((m) => porSlug.get(m.slug)).filter(Boolean);
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j];
        const va = campo(a, varia), vb = campo(b, varia), fa = campo(a, fixo), fb = campo(b, fixo);
        if (!va || !vb || va === vb || !fa || fa !== fb) continue;
        out.push({ familia: f.familia, tipo: f.tipo, fixo: fa, a, b, va, vb });
      }
    }
  }
  return out;
}

function contagemPorTipo(produtos, k) {
  const vals = [...new Set(produtos.filter((p) => TIPOS_TAB.includes(p.d_tipo)).map((p) => campo(p, k)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const linhas = TIPOS_TAB.map((t) => ({ t, cs: vals.map((v) => produtos.filter((p) => p.d_tipo === t && campo(p, k) === v).length) })).filter((l) => l.cs.some(Boolean));
  return { vals, linhas };
}

function tabelaContagem({ vals, linhas }, legenda) {
  return html`<div class="rolagem guia-rol" tabindex="0" role="region" aria-label="${legenda}"><table class="guia-tab">
  <caption class="vh">${legenda}</caption>
  <thead><tr><th scope="col">Tipo</th>${vals.map((v) => html`<th scope="col">${v}</th>`)}</tr></thead>
  <tbody>${linhas.map((l) => html`<tr><th scope="row">${PLURAL_TIPO[l.t].replace(/^./, (c) => c.toUpperCase())}</th>${l.cs.map((n) => html`<td class="num">${n}</td>`)}</tr>`)}</tbody>
</table></div>`;
}

/** Contornos de vários tamanhos (cm) sobrepostos a partir do mesmo canto, numa grade de 10 cm. */
function nuvem(tams, { S, destaque = [], id }) {
  const m = S * 0.05, W = S + 2 * m;
  const rects = tams.map((t) => `<rect x="${m.toFixed(1)}" y="${m.toFixed(1)}" width="${t.maior.toFixed(1)}" height="${t.menor.toFixed(1)}" rx="1.5"/>`).join('');
  const hl = destaque.map((t) => `<rect class="hl" x="${m.toFixed(1)}" y="${m.toFixed(1)}" width="${t.maior.toFixed(1)}" height="${t.menor.toFixed(1)}" rx="1.5"/>`).join('');
  const Hmax = Math.max(...tams.map((t) => t.menor), 10) + 2 * m;
  return raw(`<svg class="guia-nuvem" viewBox="0 0 ${W.toFixed(1)} ${Hmax.toFixed(1)}" role="img" aria-labelledby="${id}"><defs><pattern id="${id}-g" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width=".35"/></pattern></defs><rect width="${W.toFixed(1)}" height="${Hmax.toFixed(1)}" fill="url(#${id}-g)"/><g class="nv">${rects}</g><g class="nv-hl">${hl}</g></svg>`);
}

function faqLiteral(D, ids) {
  const porId = new Map((D.ler('faq.json') || []).map((f) => [f.id, f]));
  return ids.map((id) => porId.get(id)).filter((f) => f && f.exibir !== false && !f.oculto_ate_decisao && (f.resposta_exibida || '').trim())
    .map((f) => html`<figure class="guia-faq"><figcaption class="guia-faq__q">${perguntaLegivel(f.pergunta)}</figcaption><blockquote><p data-campo="faq-resposta">${f.resposta_exibida.trim()}</p></blockquote><p class="guia-faq__f">Resposta publicada pela Banheiras Bom Banho${/^https?:/.test(f.fonte || '') ? html` · <a${attrs({ class: 'link', href: f.fonte, target: '_blank', rel: 'noopener' })}>fonte</a>` : ''}</p></figure>`);
}

const linkProduto = (p) => html`<a class="link" href="${url(`${p.slug}.html`)}">${p.nome}</a>`;

// ---------------------------------------------------------------- guias
function guiaTamanho(D, produtos) {
  const ban = produtos.filter((p) => p.d_tipo === 'banheira');
  // Só as medidas publicadas na opção de tamanho (ou na ficha, sem opção): a, b e c em metros.
  // O envelope "maior das duas" dos modelos com medida a confirmar vale só no encaixe (escolhedor).
  const cm = (m) => Math.round(m * 1000) / 10;
  const medidas = new Map(), contornos = new Map();
  for (const p of ban) for (const t of p.d_tamanhos || []) {
    const a = Number(t.a), b = Number(t.b);
    if (!(a > 0 && b > 0)) continue;
    const me = Math.min(a, b), ma = Math.max(a, b), c = Number(t.c) > 0 ? Number(t.c) : 0;
    const km = `${me}x${ma}x${c}`, kc = `${me}x${ma}`;
    if (!medidas.has(km)) medidas.set(km, { menor: cm(me), maior: cm(ma), prof: cm(c), rotulo: rotuloTam(t), produtos: new Set() });
    medidas.get(km).produtos.add(p.slug);
    if (!contornos.has(kc)) contornos.set(kc, { menor: cm(me), maior: cm(ma) });
  }
  const tams = [...medidas.values()].sort((a, b) => a.maior - b.maior || a.menor - b.menor || a.prof - b.prof);
  const ctns = [...contornos.values()].sort((a, b) => a.maior - b.maior || a.menor - b.menor);
  const fx = { min: tams[0].maior / 100, max: tams[tams.length - 1].maior / 100 };
  const faixas = D.categorias.filter((c) => c.filtro_implicito?.tipo === 'banheira' && c.filtro_implicito?.faixa_m).sort((a, b) => a.filtro_implicito.faixa_m.min - b.filtro_implicito.faixa_m.min);
  const S = Math.ceil(Math.max(...ctns.map((t) => t.maior)));
  const menor = tams[0], maior = tams[tams.length - 1];
  const comMenor = ban.filter((p) => menor.produtos.has(p.slug));
  const comMaior = ban.filter((p) => maior.produtos.has(p.slug));
  // Lado maior em faixas de 20 cm (contagem de medidas publicadas distintas e de modelos)
  const balde = new Map();
  for (const t of tams) {
    const b = Math.floor(t.maior / 20) * 20;
    if (!balde.has(b)) balde.set(b, { b, tams: 0, prods: new Set() });
    balde.get(b).tams++;
    for (const s of t.produtos) balde.get(b).prods.add(s);
  }
  const confirmar = ban.filter((p) => p.d_medida_confirmada === false);
  return {
    saida: 'guia/banheira-por-tamanho.html',
    h1: 'Que banheira cabe no meu espaço?',
    curto: 'Banheira por tamanho',
    descricao: `As ${ban.length} banheiras publicadas em ${tams.length} medidas diferentes, de ${fmtMetros(fx.min)} a ${fmtMetros(fx.max)} m no lado maior: quantas há em cada faixa e como conferir se cabem no seu espaço.`,
    lead: html`O catálogo publicado tem <b class="num">${ban.length}</b> banheiras em <b class="num">${tams.length}</b> medidas diferentes (largura x comprimento x profundidade), de <b class="num">${fmtMetros(fx.min)} m</b> a <b class="num">${fmtMetros(fx.max)} m</b> no lado maior. Abaixo, a conta feita com as medidas externas publicadas em cada opção de tamanho.`,
    escolher: 'escolher.html?tipo=banheira&passo=2',
    corpo: html`
<section class="guia-sec" aria-labelledby="g1-a"><h2 id="g1-a">Quantos modelos há em cada faixa de tamanho?</h2>
<p>As faixas são as categorias "por tamanho" publicadas pela fábrica. Um modelo vendido em vários tamanhos aparece em mais de uma faixa.</p>
<div class="rolagem guia-rol" tabindex="0" role="region" aria-label="Banheiras por faixa de tamanho"><table class="guia-tab"><caption class="vh">Banheiras por faixa de tamanho</caption>
<thead><tr><th scope="col">Faixa</th><th scope="col">Modelos</th></tr></thead>
<tbody>${faixas.map((c) => html`<tr><th scope="row"><a class="link" href="${url(c.d_path)}">${c.nome}</a></th><td class="num" data-campo="categoria-total">${c.total_exibido}</td></tr>`)}</tbody></table></div></section>
<section class="guia-sec guia-sec--sala sala" aria-labelledby="g1-b"><h2 id="g1-b">Todos os tamanhos na mesma escala</h2>
<p id="g1-nuvem">Os ${ctns.length} contornos de planta (largura x comprimento, sem a profundidade) das ${tams.length} medidas publicadas, desenhados a partir do mesmo canto sobre uma grade de 10 cm. Em destaque, a menor (${menor.rotulo}) e a maior (${maior.rotulo}).</p>
${nuvem(ctns, { S, destaque: [menor, maior], id: 'g1-nuvem' })}
<p class="guia-nota">Contornos externos pelas medidas publicadas; o formato real de cada peça está na planta oficial.</p></section>
<section class="guia-sec" aria-labelledby="g1-c"><h2 id="g1-c">Como as medidas se distribuem pelo lado maior</h2>
<div class="rolagem guia-rol" tabindex="0" role="region" aria-label="Medidas por lado maior"><table class="guia-tab"><caption class="vh">Medidas de banheira publicadas, pelo lado maior</caption>
<thead><tr><th scope="col">Lado maior</th><th scope="col">Medidas</th><th scope="col">Modelos</th></tr></thead>
<tbody>${[...balde.values()].sort((a, b) => a.b - b.b).map((x) => html`<tr><th scope="row" class="num">De ${fmtMetros(x.b / 100)} m a menos de ${fmtMetros((x.b + 20) / 100)} m</th><td class="num">${x.tams}</td><td class="num">${x.prods.size}</td></tr>`)}</tbody></table></div>
<p>A menor medida publicada é ${menor.rotulo} (${comMenor.map((p, i) => html`${i ? ', ' : ''}${linkProduto(p)}`)}). A maior é ${maior.rotulo} (${comMaior.map((p, i) => html`${i ? ', ' : ''}${linkProduto(p)}`)}).</p>
${confirmar.length ? html`<p class="guia-nota">Em ${confirmar.length} modelos a ficha técnica e a opção de tamanho publicadas trazem medidas diferentes. As contas acima usam a medida da opção de tamanho; o escolhedor, para conferir o encaixe, usa a maior das duas, e a página de cada modelo mostra as duas versões.</p>` : ''}</section>
<section class="guia-sec" aria-labelledby="g1-d"><h2 id="g1-d">O que a fábrica responde sobre medidas</h2>${faqLiteral(D, ['faq-40', 'faq-39', 'faq-03'])}</section>`,
  };
}

function guiaLugares(D, produtos) {
  const spas = produtos.filter((p) => p.d_tipo === 'spa');
  const grupos = new Map();
  for (const p of spas) {
    const v = campo(p, 'Lugares');
    if (!v) continue;
    if (!grupos.has(v)) grupos.set(v, []);
    grupos.get(v).push(p);
  }
  const gs = [...grupos.entries()].sort((a, b) => ORDEM_LUGARES(a[0]) - ORDEM_LUGARES(b[0]));
  const cats = D.categorias.filter((c) => c.filtro_implicito?.tipo === 'spa' && c.filtro_implicito?.lugares).sort((a, b) => a.filtro_implicito.lugares.min - b.filtro_implicito.lugares.min);
  const S = Math.ceil(Math.max(...spas.flatMap((p) => tamanhosProduto(p).map((x) => x.cm?.maior || 0))));
  const ns = spas.map((p) => (campo(p, 'Lugares') ? p.d_lugares_num : null)).filter(Number.isInteger);
  return {
    saida: 'guia/spa-por-lugares.html',
    h1: 'Spa para quantas pessoas?',
    curto: 'Spa por lugares',
    descricao: `Os ${spas.length} spas publicados agrupados pelo número de lugares da ficha técnica, de ${Math.min(...ns)} a ${Math.max(...ns)}, com as medidas e o menor preço publicado de cada grupo.`,
    lead: html`São <b class="num">${spas.length}</b> spas publicados, para <b class="num">${Math.min(...ns)}</b> a <b class="num">${Math.max(...ns)}</b> pessoas segundo a ficha técnica de cada modelo. Veja quantos há em cada número de lugares e quanto espaço eles ocupam.`,
    escolher: 'escolher.html?tipo=spa&passo=3',
    corpo: html`
<section class="guia-sec" aria-labelledby="g2-a"><h2 id="g2-a">Quantos spas há para cada número de pessoas?</h2>
<div class="rolagem guia-rol" tabindex="0" role="region" aria-label="Spas por lugares"><table class="guia-tab"><caption class="vh">Spas por número de lugares</caption>
<thead><tr><th scope="col">Lugares</th><th scope="col">Modelos</th><th scope="col">Lado maior</th><th scope="col">A partir de</th></tr></thead>
<tbody>${gs.map(([v, ps]) => {
      const f = faixaMedidas(ps);
      const pm = Math.min(...ps.map((p) => p.d_preco_min).filter((x) => x > 0));
      return html`<tr><th scope="row">${v}</th><td class="num">${ps.length}</td><td class="num">${f ? (f.min === f.max ? `${fmtMetros(f.min)} m` : `${fmtMetros(f.min)} a ${fmtMetros(f.max)} m`) : 'Não publicado'}</td><td class="num">${Number.isFinite(pm) ? formatBRL(pm) : 'Não publicado'}</td></tr>`;
    })}</tbody></table></div>
<p class="guia-nota">"A partir de" é o menor preço publicado do grupo, com o tamanho de menor preço, em ${D.dataColeta}. O valor final é confirmado pelo consultor.</p></section>
<section class="guia-sec guia-sec--sala sala" aria-labelledby="g2-b"><h2 id="g2-b">O espaço de cada grupo, na mesma escala</h2>
<div class="guia-grupos">${gs.map(([v, ps], i) => {
      const tams = ps.flatMap((p) => tamanhosProduto(p).map((x) => x.cm)).filter(Boolean);
      return tams.length ? html`<figure class="guia-grupo"><figcaption id="g2-n${i}"><b>${v}</b> · ${tams.length} ${tams.length === 1 ? 'tamanho' : 'tamanhos'}</figcaption>${nuvem(tams, { S, id: `g2-n${i}` })}</figure>` : '';
    })}</div>
<p class="guia-nota">Contornos externos pelas medidas publicadas, todos na mesma escala, sobre grade de 10 cm.</p></section>
${cats.length ? html`<section class="guia-sec" aria-labelledby="g2-c"><h2 id="g2-c">Coleções de spas por lugares</h2>
<p>As faixas de lugares que a fábrica publica como coleções. Um modelo pode aparecer em mais de uma.</p>
<ul class="col-viz__lista" role="list">${cats.map((c) => html`<li><a class="chip" href="${url(c.d_path)}">${c.nome} <span class="num" data-campo="categoria-total">${c.total_exibido}</span></a></li>`)}</ul></section>` : ''}
<section class="guia-sec" aria-labelledby="g2-d"><h2 id="g2-d">Uso externo</h2><p>A Banheiras Bom Banho não informa no site o uso externo de cada spa. Confirme com a equipe pelo WhatsApp.</p></section>`,
  };
}

function guiaMaterial(D, produtos) {
  const ps = pares(D, 'Material', 'Configuracao').map((x) => {
    const gel = x.va === 'Gel Coat' ? x.a : x.b, acr = x.va === 'Gel Coat' ? x.b : x.a;
    const pg = gel.preco.valores_numericos.finalPrice, pa = acr.preco.valores_numericos.finalPrice;
    return { ...x, gel, acr, dif: Math.round((pa - pg) * 100) / 100, rel: pg ? ((pa - pg) / pg) * 100 : null };
  }).filter((x) => x.gel && x.acr && campo(x.gel, 'Material') === 'Gel Coat' && campo(x.acr, 'Material') === 'Acrílico').sort((a, b) => a.tipo.localeCompare(b.tipo) || a.gel.nome.localeCompare(b.gel.nome, 'pt-BR'));
  const cont = contagemPorTipo(produtos, 'Material');
  const difs = ps.map((x) => x.dif);
  const rels = ps.map((x) => x.rel).filter((x) => x != null);
  const maisCaro = ps.filter((x) => x.dif > 0).length;
  return {
    saida: 'guia/gel-coat-ou-acrilico.html',
    h1: 'Gel coat ou acrílico?',
    curto: 'Gel coat ou acrílico',
    descricao: `Quantos modelos há em gel coat e em acrílico, a diferença real de preço entre ${ps.length} pares de versões irmãs e a resposta da própria fábrica sobre os dois materiais.`,
    lead: html`A resposta da fábrica, a contagem de modelos por material e a diferença entre os preços publicados de <b class="num">${ps.length}</b> pares de versões irmãs, iguais em tudo menos no material.`,
    escolher: 'escolher.html?passo=6',
    corpo: html`
<section class="guia-sec" aria-labelledby="g3-a"><h2 id="g3-a">O que a fábrica diz</h2>${faqLiteral(D, ['faq-02', 'faq-04'])}</section>
<section class="guia-sec" aria-labelledby="g3-b"><h2 id="g3-b">Quantos modelos em cada material</h2>${tabelaContagem(cont, 'Modelos por material')}</section>
${ps.length ? html`<section class="guia-sec" aria-labelledby="g3-c"><h2 id="g3-c">Quanto muda o preço entre as versões irmãs</h2>
<p>Em <b class="num">${maisCaro}</b> dos <b class="num">${ps.length}</b> pares, a versão em acrílico tem preço publicado maior. A diferença (acrílico menos gel coat) vai de <b class="num">${brlSinal(Math.min(...difs))}</b> a <b class="num">${brlSinal(Math.max(...difs))}</b>${rels.length ? html`, e a mediana é de <b class="num">${pct(mediana(rels))}</b> sobre o preço da versão em gel coat` : ''}. Conta feita com o preço "por" de cada página, no tamanho padrão, em ${D.dataColeta}.</p>
<div class="rolagem guia-rol" tabindex="0" role="region" aria-label="Diferença de preço entre versões"><table class="guia-tab guia-tab--larga"><caption class="vh">Preço publicado das versões em gel coat e em acrílico</caption>
<thead><tr><th scope="col">Modelo</th><th scope="col">Configuração</th><th scope="col">Gel Coat</th><th scope="col">Acrílico</th><th scope="col">Diferença</th></tr></thead>
<tbody>${ps.map((x) => html`<tr><th scope="row">${nomeDoPar(x.gel.nome, x.acr.nome)}</th><td>${x.fixo}</td><td class="num"><a class="link" href="${url(`${x.gel.slug}.html`)}" data-campo="preco-por">${x.gel.preco.por}</a></td><td class="num"><a class="link" href="${url(`${x.acr.slug}.html`)}" data-campo="preco-por">${x.acr.preco.por}</a></td><td class="num">${brlSinal(x.dif)}${x.rel != null ? ` (${x.rel >= 0 ? '+' : '-'}${pct(Math.abs(x.rel))})` : ''}</td></tr>`)}</tbody></table></div></section>` : ''}`,
  };
}

function guiaConfiguracao(D, produtos) {
  const ps = pares(D, 'Configuracao', 'Material').map((x) => {
    const bas = x.va === 'Básica' ? x.a : x.b, com = x.va === 'Básica' ? x.b : x.a;
    const ib = bas.d_itens_de_serie_exibidos || [], ic = com.d_itens_de_serie_exibidos || [];
    const pb = bas.preco.valores_numericos.finalPrice, pc = com.preco.valores_numericos.finalPrice;
    return { ...x, bas, com, soCom: ic.filter((i) => !ib.includes(i)), soBas: ib.filter((i) => !ic.includes(i)), dif: Math.round((pc - pb) * 100) / 100 };
  }).filter((x) => campo(x.bas, 'Configuracao') === 'Básica' && campo(x.com, 'Configuracao') === 'Completa').sort((a, b) => a.tipo.localeCompare(b.tipo) || a.bas.nome.localeCompare(b.bas.nome, 'pt-BR'));
  const cont = contagemPorTipo(produtos, 'Configuracao');
  const freq = new Map();
  for (const x of ps) for (const i of x.soCom) freq.set(i, (freq.get(i) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 8);
  const difs = ps.map((x) => x.dif);
  return {
    saida: 'guia/basica-ou-completa.html',
    h1: 'Básica ou Completa?',
    curto: 'Básica ou Completa',
    descricao: `O que muda nos itens de série e no preço entre as versões Básica e Completa: ${ps.length} pares de versões irmãs comparados lado a lado, com os itens literais publicados.`,
    lead: html`A diferença entre Básica e Completa está nos itens de série publicados em cada página. Comparamos <b class="num">${ps.length}</b> pares de versões irmãs, iguais no material, e listamos o que muda.`,
    escolher: 'escolher.html?passo=6',
    corpo: html`
<section class="guia-sec" aria-labelledby="g4-a"><h2 id="g4-a">Quantos modelos em cada configuração</h2>${tabelaContagem(cont, 'Modelos por configuração')}</section>
${top.length ? html`<section class="guia-sec" aria-labelledby="g4-b"><h2 id="g4-b">Itens que mais aparecem só na Completa</h2>
<p>Texto literal do item, e em quantos dos ${ps.length} pares ele aparece só na versão Completa.</p>
<ol class="guia-top" role="list">${top.map(([i, n]) => html`<li><span data-campo="item-serie">${i}</span><span class="num">${n} ${n === 1 ? 'par' : 'pares'}</span></li>`)}</ol></section>` : ''}
${ps.length ? html`<section class="guia-sec" aria-labelledby="g4-c"><h2 id="g4-c">Lado a lado, par por par</h2>
<p>A Completa tem preço publicado maior em ${ps.filter((x) => x.dif > 0).length} dos ${ps.length} pares; a diferença (Completa menos Básica) vai de ${brlSinal(Math.min(...difs))} a ${brlSinal(Math.max(...difs))} (preço "por" no tamanho padrão, em ${D.dataColeta}).</p>
<div class="guia-pares">${ps.map((x) => html`<details class="guia-par">
<summary><span class="guia-par__n">${nomeDoPar(x.bas.nome, x.com.nome)}</span><span class="guia-par__m">${NOME_TIPO[x.tipo]} · ${x.fixo}</span><span class="guia-par__d num">${brlSinal(x.dif)}</span></summary>
<div class="guia-par__g">
<div><p class="guia-par__h"><a class="link" href="${url(`${x.bas.slug}.html`)}">Básica</a> <span class="num" data-campo="preco-por">${x.bas.preco.por}</span></p>${x.soBas.length ? html`<p class="guia-par__s">Só na Básica:</p><ul>${x.soBas.map((i) => html`<li data-campo="item-serie">${i}</li>`)}</ul>` : html`<p class="guia-par__s">Nenhum item só na Básica.</p>`}</div>
<div><p class="guia-par__h"><a class="link" href="${url(`${x.com.slug}.html`)}">Completa</a> <span class="num" data-campo="preco-por">${x.com.preco.por}</span></p>${x.soCom.length ? html`<p class="guia-par__s">Só na Completa:</p><ul>${x.soCom.map((i) => html`<li data-campo="item-serie">${i}</li>`)}</ul>` : html`<p class="guia-par__s">Nenhum item só na Completa.</p>`}</div>
</div></details>`)}</div></section>` : ''}`,
  };
}

export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const produtos = D.ler('produtos.json');
  const guias = [guiaTamanho(D, produtos), guiaLugares(D, produtos), guiaMaterial(D, produtos), guiaConfiguracao(D, produtos)];
  return guias.map((g) => {
    const outros = guias.filter((x) => x !== g);
    const trilha = [{ nome: 'Início', path: '' }, { nome: 'Escolher pelo meu espaço', path: 'escolher.html' }, { nome: g.curto, path: g.saida }];
    const corpo = html`<section class="sala ferr-topo guia-topo" aria-labelledby="guia-h1">
  <div class="ferr-topo__fundo" aria-hidden="true"></div>
  <div class="wrap ferr-topo__in">
    ${breadcrumb(trilha.map((t, i) => ({ nome: t.nome, href: i < trilha.length - 1 ? url(t.path) : null })))}
    <p class="etiqueta etiqueta--linha" data-intro style="--i:0">Guia calculado com os dados publicados</p>
    <h1 id="guia-h1" class="ferr-topo__h1" data-intro="mascara" style="--i:1">${g.h1}</h1>
    <p class="ferr-topo__lead" data-intro style="--i:2">${g.lead}</p>
  </div>
</section>
<article class="dia guia">
  <div class="wrap guia__in">
    ${g.corpo}
    <section class="guia-sec guia-cta" aria-labelledby="guia-cta-h"><h2 id="guia-cta-h">Faça a conta com o seu espaço</h2>
      <p>O escolhedor cruza as medidas do seu espaço com todos os modelos publicados, girando a peça quando precisa.</p>
      <p><a class="btn" href="${url(g.escolher)}">${icone('regua', { tamanho: 18 })}Escolher pelo meu espaço</a></p></section>
    <nav class="guia-sec" aria-labelledby="guia-outros-h"><h2 id="guia-outros-h">Outros guias</h2><ul class="col-viz__lista" role="list">${outros.map((o) => html`<li><a class="chip" href="${url(o.saida)}">${o.h1}</a></li>`)}</ul></nav>
    <p class="guia-nota">Dados publicados pela empresa, coletados em <span class="num" data-campo="data-coleta">${D.dataColeta}</span>. Atualizado em <time datetime="${HOJE}">${HOJE.split('-').reverse().join('/')}</time>.</p>
  </div>
</article>`;
    const jsonld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Article', '@id': `${abs(g.saida)}#guia`, headline: g.h1, description: g.descricao, url: abs(g.saida), inLanguage: 'pt-BR', dateModified: HOJE, author: { '@id': abs('#org') }, publisher: { '@id': abs('#org') }, mainEntityOfPage: abs(g.saida) },
        { '@type': 'Organization', '@id': abs('#org'), name: D.empresa.nome, url: abs('') },
        { '@type': 'BreadcrumbList', itemListElement: trilha.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.nome, item: abs(t.path) })) },
      ],
    };
    return {
      saida: g.saida,
      html: layout({
        saida: g.saida,
        titulo: `${g.h1} | Banheiras Bom Banho`,
        descricao: g.descricao,
        corpo,
        og: { tipo: 'article' },
        jsonld: [jsonld],
        ativo: 'escolher.html',
        sobre: true,
        classe: 'pg-guia',
        critico: ['ferramenta'],
      }),
    };
  });
}

