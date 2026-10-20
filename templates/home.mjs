// Home (SPEC 9.1): a galeria inteira numa página. Ritmo noite e dia (SPEC 5.1):
//  1. Abertura (sala): H1, botão "Escolher pelo meu espaço", três portas com a contagem real e uma
//     foto parada da galeria publicada (FOTO_ABERTURA). Água WebGL e vapor atrás do texto; o LCP é o
//     texto ou a foto, nunca o canvas, que só nasce depois do load.
//  2. Comece pelo seu espaço (dia): escolhedor rápido com contagem ao vivo, mesma regra do escolher.html.
//  3. Salas da galeria (sala): uma faixa por coleção, 3 peças na ordem do site atual, contorno em escala.
//  4. O desenho é a obra (planta): planta oficial da Acqua Línea 0,79 x 1,41 x 0,37 com o explorador.
//     No desktop, a planta fica fixa e as cotas acendem ao rolar (JS próprio, sem GSAP), só sem modo lite.
//  5. Lançamentos 2026 (sala): os 3 primeiros spas da categoria (menos fotos lado a lado) e o link da coleção.
//  6. A fábrica (dia), 7. Prova (dia), 8. Como comprar (dia), 9. Lojas (sala, mapa SVG sem iframe),
//  10. Perguntas frequentes e Do blog (dia).
// Todo número e texto da empresa vem de data/ (SPEC 0.1); o que é derivado leva a regra no comentário.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { html, attrs, raw } from '../build/lib/html.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { paths } from '../site.config.mjs';
import { cartao, escalaDaColecao } from './parts/cartao.mjs';
import { picture } from './parts/foto.mjs';
import { fotoProduto } from '../build/lib/midia.mjs';
import { faqBloco } from './parts/faq-bloco.mjs';
import { AVISO_ESCALA } from './parts/escala.mjs';
import { explorador, tabelaCotas, plantaDoTamanho, rotuloTam, urlPdf } from './parts/planta.mjs';
import { campo, indiceCatalogo, fotoCartao, produtosDaCategoria, CAT_BANHEIRO, CAT_OFURO_EXTERNO, CAT_SPA_LUGARES } from '../build/lib/catalogo.mjs';
import { QUASE_CM } from '../build/lib/encaixe.mjs';
import { mapaLojas } from '../build/lib/mapa-lojas.mjs';
import { tardio } from './parts/tardio.mjs';
import { cidadeDaFabrica, horarioSchema, organizacao, website } from '../build/lib/jsonld.mjs';

export { cidadeDaFabrica, horarioSchema };

// Escolhas editoriais da home (quais coleções e peças mostrar); nenhum dado da empresa aqui.
export const PORTAS = Object.freeze([
  ['banheiras.html', 'banheiras', 'Banheiras'],
  ['spas.html', 'spas', 'Spas'],
  ['ofuros.html', 'ofuros', 'Ofurôs'],
]);
// Redesenho (20/10/2026, rodada 2): quatro salas com fotos na home (uma curadoria, não o catálogo
// inteiro); as demais viram uma lista tipográfica com a contagem real e o link da coleção.
export const SALAS = Object.freeze([
  ['banheiras/banheira-retangular.html', 'Retangulares'],
  ['banheiras/banheira-de-canto.html', 'De canto'],
  ['banheiras/banheiras-redondas.html', 'Redondas', 'lista'],
  ['banheiras/banheira-dupla.html', 'Duplas', 'lista'],
  ['spas/quadrados.html', 'Spas quadrados'],
  ['spas/redondos.html', 'Spas redondos', 'lista'],
  ['ofuros.html', 'Ofurôs'],
]);
export const PECAS_POR_SALA = 3;
export const OBRA = Object.freeze({ slug: 'banheira-acqua-linea-completa-com-hidro-em-acrilico', tamanho: 0 });
// Passos do tour da planta no desktop: letras de cota (os valores vêm da planta validada).
const OBRA_PASSOS = Object.freeze(['A', 'B', 'H']);
export const LANCAMENTOS = 'lancamentos.html';
// Redesenho (20/10/2026): três peças lado a lado, não seis; o resto fica no link da coleção.
export const LANC_NA_HOME = 3;
// Perguntas da home: só tipo=publicada e sem garantia (o filtro roda de novo abaixo).
export const FAQ_HOME = Object.freeze(['faq-03', 'faq-02', 'faq-05', 'faq-14', 'faq-11', 'faq-06']);
const TIPOS_RAPIDO = [['banheira', 'Banheira'], ['spa', 'Spa'], ['ofuro', 'Ofurô'], ['sauna', 'Sauna']];
const PESSOAS_GERAL = [['1', 'Individual'], ['2', '2 pessoas'], ['3+', '3 ou mais']];

// Seções abaixo da primeira tela com content-visibility (templates/parts/tardio.mjs): só as pesadas e
// de altura estável entre larguras, a galeria das salas (28 cartões) e o rodapé. A altura reservada é a
// MENOR altura real do conteúdo medida em cada faixa de largura (320 a 599, 600 a 1023 e 1024 a 1920 px),
// arredondada para baixo: a página nunca fica mais alta que o conteúdo, e a barra de rolagem e a tecla
// End levam aonde devem. As demais seções têm altura que varia muito com a largura e não são puladas.
// Se o conteúdo mudar, o teste e2e "alturas reservadas" acusa a diferença e mostra a medida nova.
export const ALTURA_SALAS = Object.freeze({ m: 3150, t: 3100, d: 2650 });
export const ALTURA_RODAPE = Object.freeze({ m: 2950, t: 2150, d: 1600 });
const pad2 = (n) => String(n).padStart(2, '0');
const dataBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/** Números declarados: "+ DE 80 COLABORADORES DIRETOS" -> { valor: '+ DE 80', rotulo: 'COLABORADORES DIRETOS' }. */
export function numerosDeclarados(literal) {
  return String(literal || '').split('|').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(\+\s*(?:DE\s+)?[\d.,]+)\s+(.+)$/i.exec(s);
    return m ? { valor: m[1], rotulo: m[2], literal: s } : { valor: null, rotulo: s, literal: s };
  });
}

/** "+ DE 20.000" -> prefixo "+ DE " em tamanho menor e o número em destaque; o texto continua literal. */
function valorDeclarado(valor) {
  const m = /^(\+\s*(?:DE\s+)?)(.+)$/i.exec(valor);
  return m ? html`<span class="home-fab__pre">${m[1]}</span><span class="home-fab__v">${m[2]}</span>` : valor;
}

/** Reclame Aqui (empresa.json): só formatação dos números publicados, com período e data da consulta. */
export function reclameAqui(ra) {
  if (!ra?.url || !ra.nota) return null;
  const nota = String(ra.nota).replace(/\s*\/\s*/, '/').replace(/(\d)\.(\d)/, '$1,$2');
  const pct = /([\d.]+)\s*%/.exec(ra.resolve || '');
  const resolve = pct ? `${String(Math.round(Number(pct[1]) * 10) / 10).replace('.', ',')}%` : null;
  const per = /(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2})\/(\d{2})\/(\d{4})/.exec(ra.periodo || '');
  const periodo = per ? (per[3] === per[6] ? `${per[1]}/${per[2]} a ${per[4]}/${per[5]}/${per[6]}` : `${per[1]}/${per[2]}/${per[3]} a ${per[4]}/${per[5]}/${per[6]}`) : null;
  const consultado = dataBR(ra.consultado_em);
  if (!periodo || !consultado) return null; // sem período e data, o número não é publicado (SPEC 9.1)
  return { url: ra.url, reputacao: ra.reputacao || null, nota, resolve, periodo, consultado };
}

// Foto da abertura (redesenho, rodada 3): uma peça inteira de perto, com volume e luz, parada. Substitui a
// vitrine de filmes (posters de 720 px comprimidos, com franja do recorte) que derrubava a primeira impressão.
// Escolha editorial: produto e posição da foto na galeria publicada; nenhum dado novo.
export const FOTO_ABERTURA = Object.freeze({ slug: 'banheira-retangular-monte-verde-completa-com-hidro-em-acrilico', n: 2 });
export const SIZES_ABERTURA = '(min-width:1024px) 46vw, 100vw';

/** Fotos da fábrica (build/media-fabrica.mjs). */
function fotosFabrica(D) {
  const p = join(paths.public, 'media', 'fabrica', 'manifest.json');
  if (!existsSync(p)) return { fotos: [], titulo: null, fonte: null };
  const m = D.ler('../public/media/fabrica/manifest.json');
  // Fotos com telefone fora dos contatos no muro: fora até a revisão (data/institucionais.json).
  const fora = new Set((D.ler('institucionais.json')?.fotos_fabrica_fora || []).map((x) => x.sha1));
  const fotos = (m.fotos || []).filter((f) => !fora.has(f.sha1)).filter((f) => f.fontes?.['image/webp']?.every(([s]) => existsSync(join(paths.public, s)))).map((f) => {
    const webp = f.fontes['image/webp'], avif = f.fontes['image/avif'] || [];
    return {
      n: f.n,
      width: f.largura,
      height: f.altura,
      alt: f.alt_publicado ? f.alt_publicado.replace(/\s*\|\s*.*$/, '') : 'Foto da galeria de fotos da fábrica publicada pela empresa',
      src: url(webp[webp.length - 1][0]),
      lqip: f.lqip,
      fontes: [
        ...(avif.length ? [{ type: 'image/avif', srcset: avif.map(([s, l]) => `${url(s)} ${l}w`).join(', ') }] : []),
        { type: 'image/webp', srcset: webp.map(([s, l]) => `${url(s)} ${l}w`).join(', ') },
      ],
    };
  });
  return { fotos, titulo: m.titulo_publicado, fonte: m.pagina_fonte };
}

// ------------------------------------------------------------------ escolhedor rápido
/** Mesmas regras de src/js/escolher.js (pessoasOk), sobre o índice do catálogo. */
function pessoasOk(it, v, cfg) {
  if (!v) return true;
  if (v.startsWith('spa')) { const ci = cfg.cats.spa[v]?.[1]; return it.t === 'spa' && ci >= 0 && it.c.includes(ci); }
  if (it.ln == null) return false;
  return v === '3+' ? it.ln >= 3 : it.ln === Number(v);
}
/** Opções de pessoas como o escolher.html mostra para um tipo: só as que têm algum modelo. */
export function opcoesPessoas(itens, tipo, cfg) {
  const base = itens.filter((it) => it.t !== 'acessorio' && (!tipo || it.t === tipo));
  const ops = tipo === 'spa' ? Object.entries(cfg.cats.spa).map(([v, [r]]) => [v, `${r} lugares`]) : PESSOAS_GERAL;
  return ops.map(([v, r]) => [v, r, base.filter((it) => pessoasOk(it, v, cfg)).length]).filter((o) => o[2] > 0);
}

// Tipo de peça de cada porta (d_tipo), para explicar quando a coleção lista peça de outro tipo.
const TIPO_DA_PORTA = Object.freeze({ banheiras: 'banheira', spas: 'spa', ofuros: 'ofuro' });
const NOME_TIPO = Object.freeze({ banheira: 'banheira', spa: 'spa', ofuro: 'ofurô', sauna: 'sauna', acessorio: 'acessório' });

/**
 * A porta mostra o total exibido da coleção; o escolhedor conta por tipo de peça. Quando a coleção
 * lista peças de outro tipo (ex.: um spa na listagem de ofurôs), a nota diz quais, com o nome literal.
 */
export function notasDeContagem(D, porSlug) {
  return PORTAS.map(([path, id, nome]) => {
    const cat = D.catPorPath.get(path);
    const tipo = TIPO_DA_PORTA[id];
    if (!cat || !tipo) return null;
    const outros = produtosDaCategoria(cat, porSlug).filter((p) => p.d_tipo && p.d_tipo !== tipo);
    if (!outros.length) return null;
    return { nome, total: cat.total_exibido, tipo, outros: outros.map((p) => ({ nome: p.nome, tipo: NOME_TIPO[p.d_tipo] || p.d_tipo })) };
  }).filter(Boolean);
}

function escolhedorRapido(D, indice, porSlug) {
  const cats = indice.cats.map((c) => c[0]);
  const cfg = {
    indice: url('dados/indice.json'),
    escolher: url('escolher.html'),
    quase: QUASE_CM,
    cats: {
      banheiro: cats.indexOf(CAT_BANHEIRO),
      externo: cats.indexOf(CAT_OFURO_EXTERNO),
      spa: Object.fromEntries(CAT_SPA_LUGARES.map(([r, p]) => [`spa${r.replace(/\D/g, '')}`, [r, cats.indexOf(p)]])),
    },
  };
  const itens = indice.itens.filter((it) => it.t !== 'acessorio');
  const cont = Object.fromEntries(TIPOS_RAPIDO.map(([t]) => [t, itens.filter((it) => it.t === t).length]));
  const total = itens.length;
  const opsIni = opcoesPessoas(indice.itens, '', cfg);
  const notas = notasDeContagem(D, porSlug);
  const op = (nome, valor, rot, n, marcado) => html`<label class="esc-op"><input type="radio" name="${nome}" value="${valor}"${attrs({ checked: marcado })}><span>${rot}${n != null ? html` <span class="num">${n}</span>` : ''}</span></label>`;
  return html`<section class="dia secao home-esc" id="espaco" aria-labelledby="home-esc-h" data-home-esc>
  <script type="application/json" data-config>${raw(JSON.stringify(cfg).replace(/</g, '\\u003c'))}</script>
  <div class="wrap home-esc__in">
    <div class="home-esc__cab" data-reveal>
      <p class="etiqueta etiqueta--linha">Escolher pelo espaço</p>
      <h2 id="home-esc-h">Comece pelo seu espaço</h2>
      <p class="lead">Diga o que procura, para quantas pessoas e quanto espaço tem. A contagem mostra na hora quantos dos <span class="num">${total}</span> modelos publicados cabem, com a peça podendo girar.</p>
    </div>
    <form class="home-esc__form" data-home-esc-form data-so-js aria-describedby="home-esc-aviso">
      <fieldset class="home-esc__fs">
        <legend class="home-esc__q"><span class="num">01</span>O que você procura?</legend>
        <div class="esc-ops">${TIPOS_RAPIDO.map(([v, r]) => op('tipo', v, r, cont[v], false))}${op('tipo', '', 'Tanto faz', total, true)}</div>
        ${notas.length ? html`<p class="home-esc__nota">Contagem por tipo de peça. ${notas.map((n) => html`A coleção ${n.nome} exibe <span class="num">${n.total}</span> modelos porque também lista ${n.outros.map((o, i) => html`${i ? ', ' : ''}${o.nome} (${o.tipo})`)}. `)}</p>` : ''}
      </fieldset>
      <fieldset class="home-esc__fs">
        <legend class="home-esc__q"><span class="num">02</span>Quantas pessoas?</legend>
        <div class="esc-ops" data-home-pessoas>${opsIni.map(([v, r]) => op('pessoas', v, r, null, false))}${op('pessoas', '', 'Tanto faz', null, true)}</div>
      </fieldset>
      <fieldset class="home-esc__fs">
        <legend class="home-esc__q"><span class="num">03</span>Qual é o espaço, em centímetros?</legend>
        <div class="escala__linha"><label class="campo"><span class="campo__rot">Largura</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" step="1" name="l" placeholder="ex.: 90" autocomplete="off"></label><span class="escala__x" aria-hidden="true">x</span><label class="campo"><span class="campo__rot">Comprimento</span><input class="campo__in num" type="number" inputmode="numeric" min="1" max="3000" step="1" name="c" placeholder="ex.: 170" autocomplete="off"></label></div>
      </fieldset>
      <div class="home-esc__fim">
        <a class="btn home-esc__ir" href="${url('escolher.html')}" data-home-esc-ir>${icone('regua', { tamanho: 20 })}<span><span data-home-esc-t>Ver os</span> <span class="num" data-home-esc-n>${total}</span> <span data-home-esc-u>modelos</span></span>${icone('seta-dir', { tamanho: 18 })}</a>
        <p class="home-esc__vivo vh" aria-live="polite" data-home-esc-vivo></p>
        <p class="home-esc__mais"><a class="link" href="${url('escolher.html')}">Escolhedor completo</a></p>
      </div>
    </form>
    <noscript><p class="home-esc__semjs"><a class="btn" href="${url('escolher.html')}">${icone('regua', { tamanho: 20 })}Abrir o escolhedor</a></p></noscript>
    <p class="escala__aviso home-esc__aviso" id="home-esc-aviso">${AVISO_ESCALA}</p>
  </div>
</section>`;
}

// ------------------------------------------------------------------ página
export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const produtos = D.ler('produtos.json');
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));
  const E = D.empresa;
  const local = cidadeDaFabrica(E.endereco_fabrica);
  if (!local) throw new Error('home: cidade da fábrica não encontrada no endereço publicado');
  const indice = indiceCatalogo(D);
  const temAgua = Boolean(ctx.assets?.modulos?.agua);
  const temVapor = Boolean(ctx.assets?.modulos?.vapor);
  // Duas contagens: modelos com PDF de planta publicado na própria página (plantas_pdf) e, entre eles,
  // os que têm ao menos uma planta com a tabela de cotas lida e conferida contra o tamanho vendido
  // (d_planta[].cotas_validadas). PDF só ligado pelo nome do arquivo não conta como cota conferida.
  const pecas = produtos.filter((p) => p.d_tipo !== 'acessorio');
  const comPdf = pecas.filter((p) => (p.plantas_pdf || []).length).length;
  const comCotas = pecas.filter((p) => (p.d_planta || []).some((x) => x.pdf_path && x.cotas_validadas)).length;
  const totalPecas = produtos.filter((p) => p.d_tipo !== 'acessorio').length;

  // 1. Abertura ---------------------------------------------------------------
  const portas = PORTAS.map(([path, id, nome], i) => {
    const cat = D.catPorPath.get(path);
    if (!cat) return null;
    // A porta é só texto (nome e contagem), numa linha separada por régua fina.
    return html`<li class="porta" data-intro style="--i:${4 + i}">
  <a class="porta__a" href="${url(path)}"${attrs({ 'data-porta-id': id })}><span class="porta__nome">${nome}</span><span class="porta__n"><span class="num" data-campo="categoria-total">${cat.total_exibido}</span><span class="porta__u"> modelos</span></span></a>
</li>`;
  }).filter(Boolean);
  // Foto da abertura: no celular logo abaixo das portas (botão e portas seguem na primeira tela), no desktop à direita, sangrando até a borda.
  const pAbre = porSlug.get(FOTO_ABERTURA.slug);
  const fAbre = pAbre ? fotoProduto(FOTO_ABERTURA.slug, FOTO_ABERTURA.n) : null;
  const fotoAbre = fAbre ? html`<figure class="abre-foto">
    <div class="abre-foto__mol">${picture(fAbre, { sizes: SIZES_ABERTURA, classe: 'abre-foto__img', prioridade: true, alt: '' })}</div>
    <figcaption class="abre-foto__leg"><a class="abre-foto__a" href="${url(`${pAbre.slug}.html`)}">${pAbre.nome}</a><span class="abre-foto__nota">Imagem ilustrativa</span></figcaption>
  </figure>` : '';

  const abertura = html`<section class="sala home-abre" aria-labelledby="home-h1">
  <div class="home-abre__agua" aria-hidden="true"${attrs({ 'data-agua': temAgua ? '' : null })}></div>
  ${temVapor ? html`<div class="home-abre__vapor" aria-hidden="true" data-vapor></div>` : ''}
  <div class="wrap home-abre__in">
    <p class="etiqueta etiqueta--linha" data-intro style="--i:0">Fábrica em ${local.cidade}, ${local.uf}</p>
    <h1 id="home-h1" class="home-abre__h1">Banheiras, spas e ofurôs de hidromassagem, direto da fábrica em ${local.cidade}, ${local.uf}</h1>
    <p class="home-abre__lead" data-intro style="--i:2"><span class="num">${totalPecas}</span> modelos, <span class="num">${comPdf}</span> deles com a planta oficial da fábrica para baixar. Escolha pelo tamanho do seu espaço e feche com um consultor pelo WhatsApp.</p>
    <p class="home-abre__acoes" data-intro style="--i:3"><a class="btn btn--claro home-abre__cta" href="${url('escolher.html')}">${icone('regua', { tamanho: 20 })}Escolher pelo meu espaço</a><a class="home-abre__rolar" href="#salas">Conhecer as salas${icone('chevron-baixo', { tamanho: 18 })}</a></p>
    <ul class="portas" role="list" aria-label="Coleções">${portas}</ul>
    ${fotoAbre}
  </div>
</section>`;

  // 3. Salas da galeria ------------------------------------------------------
  // Regras das salas (sem dado novo): na ordem do site atual, só peças com foto, uma peça por família
  // (as versões irmãs viram a linha "Também em ..."), sem repetir peça de uma sala anterior e sem repetir
  // a foto de capa. O tipo da sala vem da coleção raiz (um spa listado entre os ofurôs fica de fora).
  const usados = new Set();
  const fotosUsadas = new Set();
  if (fAbre?.sha1) fotosUsadas.add(fAbre.sha1); // a foto da abertura não se repete logo abaixo
  const tipoDaSala = (path) => ({ 'banheiras': 'banheira', 'spas': 'spa', 'ofuros': 'ofuro' })[path.split('/')[0].replace(/\.html$/, '')] || null;
  // Chave do modelo: a família revisada; sem família, o nome literal sem o material (só para não mostrar
  // duas vezes a mesma peça lado a lado; nenhum dado novo).
  const nomeBase = (n) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(em )?(acrilico|gel coat)\b/g, '').replace(/\s+/g, ' ').trim();
  const chave = (p) => p.d_familia || nomeBase(p.nome);
  const escolherDaSala = (cat, path) => {
    const tipo = tipoDaSala(path);
    const out = [];
    const famsDaSala = new Set();
    for (const p of produtosDaCategoria(cat, porSlug)) {
      if (out.length >= PECAS_POR_SALA) break;
      if (p.d_sem_foto || usados.has(p.slug) || (tipo && p.d_tipo !== tipo)) continue;
      const fam = chave(p);
      if (famsDaSala.has(fam) || usados.has(`k:${fam}`)) continue;
      const foto = fotoCartao(p.slug, fotosUsadas);
      if (!foto || (foto.sha1 && fotosUsadas.has(foto.sha1))) continue;
      famsDaSala.add(fam);
      out.push({ p, foto });
    }
    for (const { p, foto } of out) {
      usados.add(p.slug);
      usados.add(`k:${chave(p)}`);
      if (foto.sha1) fotosUsadas.add(foto.sha1);
    }
    const daSala = produtosDaCategoria(cat, porSlug);
    return out.map(({ p, foto }) => {
      const mat = campo(p, 'Material');
      const irmas = daSala.filter((q) => q.slug !== p.slug && chave(q) === chave(p) && campo(q, 'Material') && campo(q, 'Material') !== mat);
      return { p, foto, versoes: [...new Set(irmas.map((q) => campo(q, 'Material')))] };
    });
  };
  const comFoto = SALAS.filter((x) => x[2] !== 'lista');
  const salas = comFoto.map(([path, nome], i) => {
    const cat = D.catPorPath.get(path);
    if (!cat) return null;
    const escolhidas = escolherDaSala(cat, path);
    const lista = escolhidas.map((x) => x.p);
    if (!lista.length) return null;
    const S = escalaDaColecao(lista);
    const id = `sala-${i + 1}`;
    return html`<section class="sala-faixa" aria-labelledby="${id}-h">
  <header class="sala-faixa__cab" data-reveal>
    <p class="etiqueta"><span class="num">Sala ${pad2(i + 1)}</span></p>
    <h3 id="${id}-h" class="sala-faixa__h">${nome}</h3>
    <a class="sala-faixa__ver" href="${url(path)}"><span>Ver as <span class="num" data-campo="categoria-total">${cat.total_exibido}</span> peças<span class="vh"> da coleção ${cat.nome}</span></span>${icone('seta-dir', { tamanho: 18 })}</a>
  </header>
  <div class="rolagem sala-faixa__rol" tabindex="0" role="region" aria-label="${nome}: ${lista.length} peças, role para os lados">
    <ol class="sala-faixa__lista" role="list">${escolhidas.map(({ p, foto, versoes }, j) => cartao(p, { pos: j, S, lqip: false, foto, versoes, meta: false }))}</ol>
  </div>
</section>`;
  }).filter(Boolean);
  const maisSalas = SALAS.filter((x) => x[2] === 'lista').map(([path, nome]) => {
    const cat = D.catPorPath.get(path);
    return cat ? html`<li><a class="home-salas__mais-a" href="${url(path)}"><span class="home-salas__mais-n">${nome}</span><span class="home-salas__mais-c"><span class="num" data-campo="categoria-total">${cat.total_exibido}</span> peças</span>${icone('seta-dir', { tamanho: 18 })}</a></li>` : null;
  }).filter(Boolean);
  const galeria = html`<section class="sala secao home-salas" id="salas"${attrs(tardio(ALTURA_SALAS))} aria-labelledby="home-salas-h">
  <div class="wrap">
    <div class="home-salas__cab" data-reveal>
      <p class="etiqueta etiqueta--linha">A galeria</p>
      <h2 id="home-salas-h">Salas da galeria</h2>
      <p class="lead">Uma sala por formato, com peças diferentes de cada coleção na ordem do catálogo.</p>
    </div>
    ${salas}
    ${maisSalas.length ? html`<nav class="home-salas__mais" aria-labelledby="home-salas-mais-h"><h3 class="etiqueta" id="home-salas-mais-h">Outras salas</h3><ul role="list">${maisSalas}</ul></nav>` : ''}
  </div>
</section>`;

  // 4. O desenho é a obra ------------------------------------------------------
  let obra = html``;
  const pObra = porSlug.get(OBRA.slug);
  const tObra = pObra?.d_tamanhos?.[OBRA.tamanho];
  const plObra = pObra && tObra ? plantaDoTamanho(pObra, tObra) : null;
  if (plObra?.media && plObra.validada && plObra.cotas.length) {
    const rot = rotuloTam(tObra);
    const passos = OBRA_PASSOS.map((l) => plObra.cotas.find((c) => c.letra === l)).filter(Boolean);
    obra = html`<section class="sala sala--planta secao home-obra" aria-labelledby="home-obra-h" data-obra>
  <div class="wrap home-obra__in" data-tam-painel="0">
    <div class="home-obra__texto">
      <div data-reveal>
        <p class="etiqueta etiqueta--linha">A planta oficial</p>
        <h2 id="home-obra-h">O desenho é a obra</h2>
        <p class="lead"><span class="num">${comPdf}</span> dos <span class="num">${totalPecas}</span> modelos têm planta técnica oficial publicada, e você baixa o PDF. Em <span class="num">${comCotas}</span> deles, a tabela de cotas do arquivo foi conferida com o tamanho vendido.</p>
        <p class="home-obra__peca">Na tela: <a class="link" href="${url(`${pObra.slug}.html`)}">${pObra.nome}</a>, tamanho <span class="num">${rot}</span>.</p>
      </div>
      ${passos.length ? html`<ol class="home-obra__passos" role="list" aria-hidden="true" data-obra-passos>
        <li class="home-obra__passo" data-obra-passo=""><span class="home-obra__pn num">01</span><span class="home-obra__pt">A peça inteira, como a fábrica desenhou</span><span class="home-obra__pd">A mesma planta do PDF, ampliável até seis vezes.</span></li>
        ${passos.map((c, i) => html`<li class="home-obra__passo" data-obra-passo="${c.letra}"><span class="home-obra__pn num">${pad2(i + 2)}</span><span class="home-obra__pt">Cota ${c.letra} <span class="num">${c.valor_texto} m</span></span><span class="home-obra__pd">${i === 0 ? 'Cada letra do desenho corresponde a uma linha da tabela.' : i === 1 ? 'Medida impressa na planta oficial.' : 'Medidas em metros, como impressas na planta.'}</span></li>`)}
      </ol>` : ''}
      <div class="home-obra__tabela">${tabelaCotas(plObra, 'home-planta')}</div>
      <p class="home-obra__acoes"><a class="btn btn--claro" href="${urlPdf(plObra.pdf)}" download data-planta-pdf>${icone('seta-diag', { tamanho: 18 })}Baixar a planta oficial (PDF)</a><a class="link" href="${url(`${pObra.slug}.html`)}">Ver a peça</a></p>
    </div>
    <div class="home-obra__fixa">${explorador(pObra, tObra, plObra, 'home-planta')}</div>
  </div>
</section>`;
  }

  // 5. Lançamentos 2026 -------------------------------------------------------
  let lancamentos = html``;
  const catL = D.catPorPath.get(LANCAMENTOS);
  if (catL) {
    const lista = produtosDaCategoria(catL, porSlug);
    // Sem imagem de destaque: o filme repetia as mesmas seis peças dos cartões logo abaixo.
    const S = escalaDaColecao(lista);
    lancamentos = html`<section class="sala sala--2 secao home-lanc" aria-labelledby="home-lanc-h">
  <div class="wrap">
    <div class="home-lanc__cab">
      <div data-reveal>
        <p class="etiqueta etiqueta--linha">Novidades</p>
        <h2 id="home-lanc-h">${catL.nome}</h2>
        <p class="lead"><span class="num" data-campo="categoria-total">${catL.total_exibido}</span> modelos na coleção ${catL.nome}, com fotos publicadas pela empresa.</p>
        <p><a class="link" href="${url(LANCAMENTOS)}">Ver a coleção ${catL.nome}</a></p>
      </div>
    </div>
    <ol class="col-grade home-lanc__grade" role="list">${lista.slice(0, LANC_NA_HOME).map((p, i) => cartao(p, { pos: i, S, lqip: false, meta: false }))}</ol>
  </div>
</section>`;
  }

  // 6. A fábrica -------------------------------------------------------------
  const nums = numerosDeclarados(E.numeros_declarados?.[0]?.literal);
  const ff = fotosFabrica(D);
  const mosaico = ff.fotos.filter((f) => f.width >= f.height && f.width / f.height < 2).slice(0, 5);
  const fabrica = html`<section class="dia secao home-fab" aria-labelledby="home-fab-h">
  <div class="wrap home-fab__in">
    <div class="home-fab__texto" data-reveal>
      <p class="etiqueta etiqueta--linha">A fábrica</p>
      <h2 id="home-fab-h">Feita em ${local.cidade}, ${local.uf}</h2>
      <p class="home-fab__end">${icone('fabrica', { tamanho: 22 })}<span data-campo="empresa-endereco">${E.endereco_fabrica}</span></p>
      ${nums.length ? html`<dl class="home-fab__nums">${nums.map((x) => html`<div class="home-fab__num" data-campo="empresa-numeros">${x.valor ? html`<dt class="num">${valorDeclarado(x.valor)}</dt><dd>${x.rotulo}</dd>` : html`<dt class="vh">Número declarado</dt><dd>${x.rotulo}</dd>`}</div>`)}</dl>
      <p class="home-fab__nota">Números segundo a empresa.</p>` : ''}
      ${E.inmetro?.certificado ? html`<p class="home-fab__selo">${icone('escudo', { tamanho: 22 })}<span>Certificação INMETRO, certificado nº <span class="num" data-campo="empresa-inmetro">${E.inmetro.certificado}</span>. <a class="link" href="${url('inmetro.html')}">Ver a certificação</a></span></p>` : ''}
      <p><a class="link" href="${url('lojas/loja-fisica.html')}">Conhecer a fábrica e as lojas</a></p>
    </div>
    ${mosaico.length ? html`<div class="home-fab__fotos" data-reveal-grupo>${mosaico.map((f, i) => html`<figure class="home-fab__foto home-fab__foto--${i + 1}" data-reveal>${picture(f, { classe: 'home-fab__img', sizes: '(min-width:1024px) 400px, 50vw' })}</figure>`)}<p class="home-fab__leg">Fotos da galeria ${ff.titulo ? html`"${ff.titulo.split('/')[0].trim().toLocaleLowerCase('pt-BR').replace(/^./, (c) => c.toUpperCase())}"` : ''} publicada pela empresa.</p></div>` : ''}
  </div>
</section>`;

  // 7. Prova ------------------------------------------------------------------
  const ra = reclameAqui(E.reclame_aqui);
  const deps = (E.depoimentos || []).filter((d) => d.autor && d.texto);
  const prova = ra || deps.length ? html`<section class="dia dia--areia secao home-prova" aria-labelledby="home-prova-h">
  <div class="wrap home-prova__in">
    <div class="home-prova__cab" data-reveal>
      <p class="etiqueta etiqueta--linha">Quem já comprou</p>
      <h2 id="home-prova-h">O que dizem da Banheiras Bom Banho</h2>
    </div>
    ${ra ? html`<div class="home-ra" data-reveal>
      <p class="home-ra__fonte">Reclame Aqui</p>
      <p class="home-ra__nota"><span class="num" data-campo="ra-nota">${ra.nota}</span></p>
      <p class="home-ra__txt">${ra.reputacao ? html`Reputação <b>${ra.reputacao}</b>${ra.resolve ? ', ' : '. '}` : ''}${ra.resolve ? html`<span data-campo="ra-resolve"><span class="num">${ra.resolve}</span> das reclamações resolvidas</span>. ` : ''}</p>
      <p class="home-ra__per" data-campo="ra-periodo">Período de ${ra.periodo}, consultado em ${ra.consultado}.</p>
      <p><a class="link" href="${ra.url}" target="_blank" rel="noopener">Ver a página no Reclame Aqui${icone('externo', { tamanho: 16 })}</a></p>
    </div>` : ''}
    ${deps.length ? html`<div class="home-deps" data-reveal-grupo>${deps.map((d) => html`<figure class="home-dep" data-reveal><blockquote><p data-campo="depoimento">${d.texto}</p></blockquote><figcaption>${d.autor}</figcaption></figure>`)}<p class="home-deps__fonte">Depoimentos publicados na página <a class="link" href="${url('lojas/sobre-nos.html')}">Sobre nós</a>.</p></div>` : ''}
  </div>
</section>` : html``;

  // 8. Como comprar -----------------------------------------------------------
  const pag = D.ler('politicas.json')?.pagamento?.literal || '';
  // Texto literal da empresa, em parágrafos (a numeração já vem no texto): o rótulo em caixa alta antes
  // dos dois-pontos vira uma etiqueta pequena; o resto segue no corpo. Juntos, reproduzem o literal.
  const formas = pag.split(/\s+(?=\d\.\s)/).map((s) => s.trim()).filter(Boolean)
    .map((f) => { const m = /^(\d\.\s[^:]{1,60}:)\s+(.+)$/.exec(f); return m ? { rotulo: m[1], texto: m[2] } : { rotulo: null, texto: f }; });
  const waVenda = D.wa('venda_principal');
  const comprar = html`<section class="dia secao home-comprar" aria-labelledby="home-comprar-h">
  <div class="wrap">
    <div class="home-comprar__cab" data-reveal>
      <p class="etiqueta etiqueta--linha">Como comprar</p>
      <h2 id="home-comprar-h">Três passos, com um consultor do começo ao fim</h2>
    </div>
    <ol class="home-passos" role="list" data-reveal-grupo>
      <li class="home-passo" data-reveal><span class="home-passo__n num">01</span><h3>Escolha a peça</h3><p>Pelo seu espaço, pela coleção ou pela busca. Cada modelo mostra fotos, medidas, planta e o preço publicado.</p><p><a class="link" href="${url('escolher.html')}">Escolher pelo meu espaço</a></p></li>
      <li class="home-passo" data-reveal><span class="home-passo__n num">02</span><h3>Fale com um consultor</h3><p>Pelo WhatsApp, com o modelo, o tamanho e os opcionais já na mensagem. O valor final é confirmado pelo consultor.</p><p><a${attrs({ class: 'btn btn--whats', href: waVenda, target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'home_como_comprar', 'data-campo': 'contato-numero' })}>${icone('whatsapp', { tamanho: 20 })}Comprar pelo WhatsApp</a></p></li>
      <li class="home-passo" data-reveal><span class="home-passo__n num">03</span><h3>Pague como preferir</h3>${formas.length ? html`<div class="home-passo__pag">${formas.map((f) => html`<p>${f.rotulo ? html`<span class="home-passo__forma" data-campo="pagamento">${f.rotulo}</span> ` : ''}<span data-campo="pagamento">${f.texto}</span></p>`)}</div>` : ''}<p><a class="link" href="${url('prazo-de-entrega.html')}">Prazo de entrega por estado</a> · <a class="link" href="${url('como-comprar.html')}">Como comprar</a></p></li>
    </ol>
  </div>
</section>`;

  // 9. Lojas ------------------------------------------------------------------
  const M = mapaLojas(D.lojas);
  const lojas = html`<section class="sala secao home-lojas" aria-labelledby="home-lojas-h">
  <div class="wrap home-lojas__in">
    <div class="home-lojas__texto" data-reveal>
      <p class="etiqueta etiqueta--linha">Lojas</p>
      <h2 id="home-lojas-h">Veja as peças de perto em <span class="num">${D.lojas.length}</span> cidades</h2>
      <p class="lead">A loja da fábrica e os showrooms. Endereço, mapa e WhatsApp de cada uma estão na página de lojas.</p>
      <p><a class="btn btn--claro" href="${url('lojas/loja-showrooms.html')}">${icone('loja', { tamanho: 20 })}Ver endereços e horários</a></p>
    </div>
    <figure class="mapa" data-reveal>
      <div class="mapa__quadro" style="aspect-ratio:${M.regiao.w}/${M.regiao.h}">
        <svg class="mapa__svg" viewBox="0 0 ${M.regiao.w} ${M.regiao.h}" aria-hidden="true" focusable="false"><defs><pattern id="mapa-grade" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width=".3"/></pattern></defs><rect width="${M.regiao.w}" height="${M.regiao.h}" fill="url(#mapa-grade)"/><path class="mapa__terra" d="${M.regiao.d}"/>${M.pontos.map((pt) => raw(`<circle class="mapa__onda" cx="${(pt.x * M.regiao.w / 100).toFixed(1)}" cy="${(pt.y * M.regiao.h / 100).toFixed(1)}" r="2.6"/><circle class="mapa__ponto" cx="${(pt.x * M.regiao.w / 100).toFixed(1)}" cy="${(pt.y * M.regiao.h / 100).toFixed(1)}" r="1.1"/>`))}</svg>
        <ol class="mapa__lista" role="list">${M.rotulos.map((r) => html`<li class="mapa__item mapa__item--${r.lado}${r.fabrica ? ' is-fabrica' : ''}" style="left:${r.x}%;top:${r.y}%">${r.lojas.map((l, i) => html`${i ? html`<span class="mapa__sep" aria-hidden="true">·</span>` : ''}<a href="${url(`lojas/loja-showrooms.html#${l.ancora}`)}"><span class="vh">${l.nome}: </span><span aria-hidden="true">${l.cidade}</span></a>`)}</li>`)}</ol>
        <ul class="mapa__rotulos" aria-hidden="true">${M.rotulos.map((r) => html`<li class="mapa__item mapa__item--${r.lado}${r.fabrica ? ' is-fabrica' : ''}" style="left:${r.x}%;top:${r.y}%"><span>${r.lojas.map((l) => l.cidade).join(' e ')}</span></li>`)}</ul>
        <svg class="mapa__pais" viewBox="0 0 ${M.pais.w} ${M.pais.h}" aria-hidden="true" focusable="false"><path d="${M.pais.d}"/><rect x="${M.pais.caixa.x}" y="${M.pais.caixa.y}" width="${M.pais.caixa.w}" height="${M.pais.caixa.h}"/></svg>
      </div>
      <figcaption class="mapa__leg">Cidades com loja da Banheiras Bom Banho. O ponto marca a cidade; o endereço está na página de lojas.</figcaption>
    </figure>
  </div>
</section>`;

  // 10. Perguntas e blog ------------------------------------------------------
  const faqTodas = new Map((D.ler('faq.json') || []).map((f) => [f.id, f]));
  const faqs = FAQ_HOME.map((id) => faqTodas.get(id)).filter((f) => f && f.tipo === 'publicada' && f.exibir !== false && !f.oculto_ate_decisao && !/garantia/i.test(`${f.pergunta} ${f.tema}`) && (f.resposta_exibida || '').trim());
  const blog = (D.ler('blog-recentes.json')?.recentes || []).filter((b) => b.exibir).slice(0, 3);
  const fim = html`<section class="dia secao home-fim" aria-labelledby="home-faq-h">
  <div class="wrap home-fim__in">
    <div class="home-faq">
      <p class="etiqueta etiqueta--linha">Dúvidas</p>
      <h2 id="home-faq-h">Perguntas frequentes</h2>
      ${faqBloco(faqs)}
      <p><a class="link" href="${url('perguntas-frequentes.html')}">Todas as perguntas</a></p>
    </div>
    ${blog.length ? html`<section class="home-blog" aria-labelledby="home-blog-h">
      <p class="etiqueta etiqueta--linha">Blog</p>
      <h2 id="home-blog-h">Do blog</h2>
      <ul class="home-blog__lista" role="list">${blog.map((b) => html`<li><a class="home-blog__a"${attrs({ href: b.url, target: '_blank', rel: 'noopener' })}><span class="home-blog__data num">${dataBR(b.publicado_em) || ''}</span><span class="home-blog__t">${b.titulo}</span><span class="home-blog__r">${b.resumo}</span></a></li>`)}</ul>
    </section>` : ''}
  </div>
</section>`;

  // Cabeça e dados estruturados -------------------------------------------------
  const nB = D.contagem('banheiras.html'), nS = D.contagem('spas.html'), nO = D.contagem('ofuros.html');
  const titulo = 'Banheiras, spas e ofurôs com hidro | Banheiras Bom Banho';
  let descricao = `${nB} banheiras, ${nS} spas e ${nO} ofurôs de hidromassagem da fábrica em ${local.cidade}, ${local.uf}, com medidas, planta oficial e preços publicados. Compra pelo WhatsApp.`;
  if (descricao.length > 160) descricao = `${nB} banheiras, ${nS} spas e ${nO} ofurôs de hidromassagem da fábrica em ${local.cidade}, ${local.uf}. Compra pelo WhatsApp.`;
  // Organization completa e WebSite com SearchAction (build/lib/jsonld.mjs; o layout consolida o grafo).
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      organizacao(D),
      website(D, { busca: true }),
    ],
  };
  const modulos = ['home', ...(temAgua ? ['agua'] : []), ...(temVapor ? ['vapor'] : []), ...(plObra?.validada ? ['planta'] : [])];

  return [{
    saida: 'index.html',
    html: layout({
      saida: 'index.html',
      titulo,
      descricao,
      corpo: html`${abertura}${escolhedorRapido(D, indice, porSlug)}${galeria}${obra}${lancamentos}${fabrica}${prova}${comprar}${lojas}${fim}`,
      jsonld: [jsonld],
      modulos,
      ativo: '',
      sobre: true,
      classe: 'pg-home',
      critico: ['home'],
      fontes: ['fonts/newsreader-titulo.woff2'],
      modulosTardios: true,
      cssAposPintura: true,
      fontesAposPintura: true,
      rodapeTardio: ALTURA_RODAPE,
    }),
  }];
}
