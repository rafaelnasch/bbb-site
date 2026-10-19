// Páginas institucionais (SPEC 4 linha 10, 9.6 e 15). Texto literal da empresa (data/institucionais.json,
// politicas.json, empresa.json, contatos.json) com tipografia nova, títulos, listas e tabelas em HTML real.
// O que está pendente com a empresa segue a tabela da seção 15: garantia sem prazo, CEP da fábrica e
// marketing omitidos, representantes sem nome, ISO fora, organismo do INMETRO com as duas versões.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { html, attrs, raw } from '../build/lib/html.mjs';
import { url } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { paths } from '../site.config.mjs';
import { picture } from './parts/foto.mjs';
import { linhaCanal, listaConsultores, horarioEmLinhas } from './parts/gaveta-whats.mjs';
import { numerosDeclarados, reclameAqui, cidadeDaFabrica } from './home.mjs';
import { mapaLojas } from '../build/lib/mapa-lojas.mjs';
import { CATEGORIAS_PONTE, NOME_TIPO, TIPOS, RAIZ_TIPO } from '../build/lib/catalogo.mjs';
import { blocosDoManual, indiceDoManual } from './parts/manual.mjs';
import { blocosDoTexto, prosa, sumario, notaFonte, topo, botaoWhats, inicio, pagina, comLinks, emCaixaAlta } from './parts/inst.mjs';

const P = (D, k) => {
  const p = D.ler('institucionais.json')?.paginas?.[k];
  if (!p) throw new Error(`institucionais.json sem a página ${k}: rode npm run normalize`);
  return p;
};
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decodificar = (s) => String(s || '').replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENT[m]);
const linhasDe = (t) => String(t || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

// ------------------------------------------------------------------ fotos da fábrica
export function fotosFabrica(D) {
  const p = join(paths.public, 'media', 'fabrica', 'manifest.json');
  if (!existsSync(p)) return [];
  const m = D.ler('../public/media/fabrica/manifest.json');
  // Fotos com telefone fora dos contatos no muro: fora até a revisão (data/institucionais.json).
  const fora = new Set((D.ler('institucionais.json')?.fotos_fabrica_fora || []).map((x) => x.sha1));
  return (m.fotos || []).filter((f) => !fora.has(f.sha1)).filter((f) => f.fontes?.['image/webp']?.every(([s]) => existsSync(join(paths.public, s)))).map((f) => {
    const webp = f.fontes['image/webp'], avif = f.fontes['image/avif'] || [];
    return {
      n: f.n,
      width: f.largura,
      height: f.altura,
      alt: f.alt_publicado ? f.alt_publicado.replace(/\s*\|\s*.*$/, '').replace(/:\s*Venha conhecer$/, '') : 'Foto da galeria da fábrica publicada pela empresa',
      src: url(webp[webp.length - 1][0]),
      lqip: f.lqip,
      fontes: [
        ...(avif.length ? [{ type: 'image/avif', srcset: avif.map(([s, l]) => `${url(s)} ${l}w`).join(', ') }] : []),
        { type: 'image/webp', srcset: webp.map(([s, l]) => `${url(s)} ${l}w`).join(', ') },
      ],
    };
  });
}

function galeriaFabrica(D, { max = 8 } = {}) {
  const fotos = fotosFabrica(D).slice(0, max);
  if (!fotos.length) return '';
  return html`<ul class="inst-fotos" role="list">${fotos.map((f, i) => html`<li class="inst-foto${i === 0 && f.width / f.height > 2 ? ' inst-foto--larga' : ''}" data-reveal style="--i:${i % 4}"><figure>${picture(f, { sizes: '(min-width:1024px) 420px, (min-width:600px) 50vw, 100vw' })}<figcaption class="vh">${f.alt}</figcaption></figure></li>`)}</ul>
<p class="inst-legenda">Fotos da galeria da fábrica publicada pela empresa.</p>`;
}

/** Ficha da fábrica: endereço sem CEP, mapa, telefone fixo e horário (SPEC 10.4 e 15). */
function fichaFabrica(D, { comMapa = true } = {}) {
  const E = D.empresa;
  return html`<dl class="inst-ficha">
  <div><dt>${icone('fabrica')}Fábrica</dt><dd data-campo="empresa-endereco">${E.endereco_fabrica}</dd></div>
  <div><dt>${icone('telefone')}Telefone</dt><dd><a class="link num" href="${E.telefone_fixo.tel}" data-campo="empresa-telefone">${E.telefone_fixo.display}</a></dd></div>
  <div><dt>${icone('relogio')}Horário</dt><dd data-campo="empresa-horario">${horarioEmLinhas(E.horario.literal)}</dd></div>
  ${comMapa && E.mapa_fabrica?.link ? html`<div><dt>${icone('local')}Mapa</dt><dd><a${attrs({ class: 'link', href: E.mapa_fabrica.link, target: '_blank', rel: 'noopener' })}>Como chegar à fábrica${icone('externo', { tamanho: 14 })}</a></dd></div>` : ''}
</dl>`;
}

function numerosEmpresa(D, i = 0) {
  const nd = D.empresa.numeros_declarados?.[i];
  const nums = numerosDeclarados(nd?.literal);
  if (!nums.length) return '';
  return html`<figure class="inst-nums">
  <dl data-campo="empresa-numeros">${nums.map((x) => html`<div>${x.valor ? html`<dt class="num">${x.valor}</dt><dd>${x.rotulo}</dd>` : html`<dt class="vh">Número declarado</dt><dd>${x.rotulo}</dd>`}</div>`)}</dl>
  <figcaption>Números segundo a empresa${nd.fonte ? html` (<a${attrs({ class: 'link', href: nd.fonte, target: '_blank', rel: 'noopener' })}>fonte</a>)` : ''}.</figcaption>
</figure>`;
}

/** Corpo padrão: sumário e ações ao lado, texto no meio. */
function corpoLeitura({ lado = '', conteudo }) {
  return html`<article class="dia inst">
  <div class="wrap inst__grade">
    <aside class="inst__lado">${lado}</aside>
    <div class="inst__corpo">${conteudo}</div>
  </div>
</article>`;
}

function ajudaLado(D, contexto, { papel = 'ajuda', rotulo = 'Preciso de ajuda', titulo = 'Dúvidas sobre este texto?' } = {}) {
  return html`<div class="inst-ajuda">
  <p class="inst-ajuda__t">${titulo}</p>
  ${botaoWhats(D, papel, { rotulo, contexto, classe: 'btn btn--whats btn--bloco' })}
</div>`;
}

// ------------------------------------------------------------------ páginas de texto literal
/** Política, termos, segurança: o texto literal inteiro em leitura longa, com sumário das seções. */
function paginaDeTexto(ctx, { chave, saida, h1, titulo, descricao, trilha, etiqueta, lado = '', pularPrimeira = true, depois = '' }) {
  const D = ctx.dados;
  const p = P(D, chave);
  const ls = linhasDe(p.texto_exibido);
  if (pularPrimeira && ls.length && ls[0].toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ') === h1.toLocaleLowerCase('pt-BR')) ls.shift();
  const { blocos, secoes } = blocosDoTexto(ls.join('\n'));
  const corpo = html`${topo({ trilha, etiqueta, h1 })}
${corpoLeitura({ lado: html`${sumario(secoes)}${lado}`, conteudo: html`${prosa(blocos)}${depois}${notaFonte(D, p.fonte)}` })}`;
  return pagina(ctx, { saida, titulo, descricao, corpo, trilha });
}

// ------------------------------------------------------------------ Sobre nós
function sobreNos(ctx) {
  const D = ctx.dados, E = D.empresa;
  const trilha = [inicio, { nome: 'Sobre nós', path: 'lojas/sobre-nos.html' }];
  const empresa = E.textos_integrais?.empresa;
  const { blocos } = blocosDoTexto(linhasDe(empresa?.texto_exibido).filter((l) => !/^(CONHEÇA A BBB.*|A EMPRESA)$/i.test(l)).join('\n'), { nivelCaixaAlta: 3, jaTemH2: true });
  const ra = reclameAqui(E.reclame_aqui);
  const deps = (E.depoimentos || []).filter((d) => d.autor && d.texto);
  const loc = cidadeDaFabrica(E.endereco_fabrica);
  const corpo = html`${topo({ trilha, etiqueta: 'A empresa', h1: 'Sobre nós', lead: loc ? html`Fábrica de banheiras, spas e ofurôs em ${loc.cidade}, ${loc.uf}.` : null })}
<article class="dia inst inst--sobre">
  <div class="wrap inst__largo">
    <section class="inst-bloco" aria-labelledby="sn-empresa">
      <h2 id="sn-empresa" class="inst-h2">A empresa</h2>
      <div class="inst-colunas">${prosa(blocos, { campo: 'empresa-texto' })}<div>${numerosEmpresa(D, 0)}</div></div>
    </section>
    ${galeriaFabrica(D, { max: 3 })}
    ${deps.length ? html`<section class="inst-bloco" id="depoimentos" aria-labelledby="sn-dep">
      <h2 id="sn-dep" class="inst-h2">Depoimentos</h2>
      <div class="inst-deps">${deps.map((d, i) => html`<figure class="inst-dep" data-reveal style="--i:${i}"><blockquote><p data-campo="depoimento">${d.texto}</p></blockquote><figcaption>${d.autor}</figcaption></figure>`)}</div>
      <p class="inst-legenda">Depoimentos publicados pela empresa na página Sobre nós.</p>
    </section>` : ''}
    <section class="inst-bloco inst-provas" aria-labelledby="sn-provas">
      <h2 id="sn-provas" class="inst-h2">Certificação e reputação</h2>
      <div class="inst-cartoes">
        ${E.inmetro?.certificado ? html`<div class="inst-cartao">${icone('escudo', { tamanho: 22 })}<p class="inst-cartao__t">Certificação INMETRO</p><p>Certificado nº <span class="num" data-campo="empresa-inmetro">${E.inmetro.certificado}</span>.</p><p><a class="link" href="${url('inmetro.html')}">Ver a certificação</a></p></div>` : ''}
        ${ra ? html`<div class="inst-cartao">${icone('pessoas', { tamanho: 22 })}<p class="inst-cartao__t">Reclame Aqui</p><p>Reputação ${ra.reputacao}, nota <span class="num" data-campo="ra-nota">${ra.nota}</span>${ra.resolve ? html`, <span class="num" data-campo="ra-resolve">${ra.resolve}</span> das reclamações resolvidas` : ''} (período de <span data-campo="ra-periodo">${ra.periodo}</span>, consultado em ${ra.consultado}).</p><p><a${attrs({ class: 'link', href: ra.url, target: '_blank', rel: 'noopener' })}>Ver no Reclame Aqui${icone('externo', { tamanho: 14 })}</a></p></div>` : ''}
        <div class="inst-cartao">${icone('loja', { tamanho: 22 })}<p class="inst-cartao__t">Lojas</p><p>A loja da fábrica e os showrooms, com endereço e WhatsApp de cada um.</p><p><a class="link" href="${url('lojas/loja-showrooms.html')}">Ver as ${D.lojas.length} lojas</a></p></div>
      </div>
    </section>
    <section class="inst-bloco" aria-labelledby="sn-fab"><h2 id="sn-fab" class="inst-h2">Onde fica a fábrica</h2>${fichaFabrica(D)}</section>
    ${notaFonte(D, empresa?.source_url || E.fonte)}
  </div>
</article>`;
  return pagina(ctx, {
    saida: 'lojas/sobre-nos.html',
    titulo: 'Sobre nós | Banheiras Bom Banho',
    descricao: `Conheça a Banheiras Bom Banho: fábrica de banheiras, spas e ofurôs${loc ? ` em ${loc.cidade}, ${loc.uf}` : ''}, certificação INMETRO, depoimentos de clientes e lojas.`,
    corpo,
    trilha,
    tipo: 'AboutPage',
  });
}

// ------------------------------------------------------------------ Fábrica (loja física) e Conheça a BBB
function fabrica(ctx, { saida, chave, h1, titulo, descricao, etiqueta }) {
  const D = ctx.dados;
  const p = P(D, chave);
  const trilha = [inicio, { nome: 'Sobre nós', path: 'lojas/sobre-nos.html' }, { nome: h1, path: saida }];
  // "ALGUNS DE NOSSOS PROJETOS FINALIZADOS" legenda a galeria de projetos do site atual; aqui as fotos são
  // só da fábrica, então o título fica de fora para não legendar errado.
  const ls = linhasDe(p.texto_exibido).filter((l) => !/^(Nossa Fábrica|CONHEÇA NOSSA FÁBRICA|ALGUNS DE NOSSOS PROJETOS FINALIZADOS|CONHEÇA A BBB BANHEIRAS BOM BANHO)$/i.test(l));
  const { blocos } = blocosDoTexto(ls.join('\n'), { nivelCaixaAlta: 2 });
  const corpo = html`${topo({ trilha, etiqueta, h1 })}
<article class="dia inst inst--fabrica">
  <div class="wrap inst__largo">
    <div class="inst-colunas">${prosa(blocos)}<div>${fichaFabrica(D)}</div></div>
    ${galeriaFabrica(D)}
    ${numerosEmpresa(D, 0)}
    <p class="inst-acoes"><a class="btn" href="${url('lojas/loja-showrooms.html')}">${icone('loja', { tamanho: 18 })}Ver as lojas e showrooms</a>${botaoWhats(D, 'venda_principal', { rotulo: 'Comprar pelo WhatsApp', contexto: `inst_${chave}` })}</p>
    ${notaFonte(D, p.fonte)}
  </div>
</article>`;
  return pagina(ctx, { saida, titulo, descricao, corpo, trilha, tipo: 'AboutPage' });
}

// ------------------------------------------------------------------ Como comprar
function comoComprar(ctx) {
  const D = ctx.dados;
  const pol = D.ler('politicas.json');
  const trilha = [inicio, { nome: 'Como comprar', path: 'como-comprar.html' }];
  const pag = String(pol.pagamento?.literal || '');
  const formas = pag.split(/\s+(?=\d\.\s)/).map((s) => s.trim()).filter(Boolean)
    .map((f) => { const m = /^(\d\.\s[^:]{1,60}:)\s+(.+)$/.exec(f); return m ? { rotulo: m[1], texto: m[2] } : { rotulo: null, texto: f }; });
  const desist = pol.desistencia?.pontos_chave || [];
  const corpo = html`${topo({ trilha, etiqueta: 'Compra', h1: 'Como comprar', lead: 'Você escolhe a peça no site e fecha o pedido com um consultor da fábrica pelo WhatsApp, com o modelo, o tamanho e os opcionais já na mensagem.' })}
<article class="dia inst">
  <div class="wrap inst__largo">
    <ol class="inst-passos" role="list">
      <li data-reveal style="--i:0"><span class="inst-passos__n num" aria-hidden="true">01</span><h2 class="inst-h3">Escolha a peça</h2><p>Pelo seu espaço, pela coleção ou pela busca. Cada modelo mostra fotos, medidas, planta e o preço publicado.</p><p><a class="link" href="${url('escolher.html')}">Escolher pelo meu espaço</a></p></li>
      <li data-reveal style="--i:1"><span class="inst-passos__n num" aria-hidden="true">02</span><h2 class="inst-h3">Monte e envie pelo WhatsApp</h2><p>Na página do modelo, escolha tamanho, voltagem, cor e adicionais. O botão de compra leva tudo para a conversa. O valor final é confirmado pelo consultor.</p><p>${botaoWhats(D, 'venda_principal', { rotulo: 'Comprar pelo WhatsApp', contexto: 'como_comprar' })}</p></li>
      <li data-reveal style="--i:2"><span class="inst-passos__n num" aria-hidden="true">03</span><h2 class="inst-h3">Pague e acompanhe</h2><p>O consultor confirma o pedido e a forma de pagamento. Depois, o rastreio é feito pelo WhatsApp do rastreio.</p><p><a class="link" href="${url('rastreio.html')}">Rastrear um pedido</a></p></li>
    </ol>
    <div class="inst-colunas inst-colunas--topo">
      <section class="inst-bloco" aria-labelledby="cc-pag"><h2 id="cc-pag" class="inst-h2">Formas de pagamento</h2>
        <div class="inst-pag">${formas.map((f) => html`<p>${f.rotulo ? html`<span class="inst-pag__forma" data-campo="pagamento">${f.rotulo}</span> ` : ''}<span data-campo="pagamento">${f.texto}</span></p>`)}</div>
        ${notaFonte(D, pol.pagamento?.fonte)}
      </section>
      <section class="inst-bloco" aria-labelledby="cc-ent"><h2 id="cc-ent" class="inst-h2">Entrega</h2>
        ${pol.entrega?.literal ? html`<p data-campo="prazo-entrega">${pol.entrega.literal}</p>` : ''}
        <p><a class="link" href="${url('prazo-de-entrega.html')}">Prazo de entrega por estado</a></p>
        ${pol.instalacao?.literal ? html`<h3 class="inst-h3">Instalação</h3><p data-campo="institucional-texto">${pol.instalacao.literal}</p>` : ''}
        ${pol.art_rrt?.literal ? html`<p data-campo="institucional-texto">${pol.art_rrt.literal}</p>` : ''}
        <p><a class="link" href="${url('manual-usuario-instalacao.html')}">Manual do usuário e instalação</a> · <a class="link" href="${url('instaladores.html')}">Instaladores</a></p>
      </section>
    </div>
    ${desist.length ? html`<section class="inst-bloco" aria-labelledby="cc-des"><h2 id="cc-des" class="inst-h2">Desistência e cancelamento</h2>
      <ul class="inst-lista" data-campo="institucional-texto">${desist.map((x) => html`<li>${x}</li>`)}</ul>
      <p><a class="link" href="${url('politica-devolucao-reembolso.html')}">Política de troca, devolução e reembolso</a></p></section>` : ''}
    <section class="inst-bloco inst-cta" aria-labelledby="cc-cta"><h2 id="cc-cta" class="inst-h2">Prefere falar com alguém antes?</h2>
      <p>Escolha um consultor de venda ou peça ajuda pelo WhatsApp.</p>
      <p class="inst-acoes"><a class="btn" href="${url('consultores.html')}">${icone('pessoas', { tamanho: 18 })}Escolher meu consultor</a>${botaoWhats(D, 'ajuda', { rotulo: 'Preciso de ajuda', contexto: 'como_comprar', classe: 'btn btn--fantasma' })}</p>
    </section>
  </div>
</article>`;
  return pagina(ctx, {
    saida: 'como-comprar.html',
    titulo: 'Como comprar | Banheiras Bom Banho',
    descricao: 'Como comprar uma banheira, spa ou ofurô da Banheiras Bom Banho: escolha no site, envie pelo WhatsApp a um consultor, formas de pagamento, entrega e desistência.',
    corpo,
    trilha,
  });
}

// ------------------------------------------------------------------ Prazo de entrega
function siglas(tabela) {
  const v = new Set();
  for (const g of tabela) for (const l of g.linhas) for (const s of l.estados.match(/\b[A-Z]{2}\b/g) || []) v.add(s);
  return [...v].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function tabelasPrazo(tabela) {
  const ufs = siglas(tabela);
  return html`${ufs.length ? html`<p class="inst-uf" data-so-js hidden><label class="inst-uf__campo"><span>Destacar o seu estado</span><select data-prazo-uf><option value="">Todos</option>${ufs.map((u) => html`<option value="${u}">${u}</option>`)}</select></label></p>` : ''}
  <div class="inst-prazos">${tabela.map((g) => html`<div class="rolagem" tabindex="0" role="region" aria-label="Prazos: ${g.grupo}">
    <table class="inst-tab num" data-prazo>
      <caption>${g.grupo}</caption>
      <thead><tr><th scope="col">Estados</th><th scope="col">Prazo</th></tr></thead>
      <tbody>${g.linhas.map((l) => html`<tr data-ufs="${(l.estados.match(/\b[A-Z]{2}\b/g) || []).join(' ')}"><th scope="row">${l.estados}</th><td data-campo="prazo-entrega">${l.prazo}</td></tr>`)}</tbody>
    </table></div>`)}</div>`;
}

function prazoDeEntrega(ctx) {
  const D = ctx.dados;
  const pol = D.ler('politicas.json');
  const pz = pol.prazo_de_entrega || {};
  const p = P(D, 'prazo-de-entrega');
  const trilha = [inicio, { nome: 'Prazo de entrega', path: 'prazo-de-entrega.html' }];
  const ls = linhasDe(p.texto_exibido);
  // Antes da tabela: o texto de envio e entrega. A tabela em texto vira <table> (politicas.json.tabela);
  // as notas com "*" ficam depois dela.
  const iTab = ls.findIndex((l) => /^Prazo de Entrega:$/i.test(l));
  const antes = ls.slice(ls[0] && /^Prazo de Entrega$/i.test(ls[0]) ? 1 : 0, iTab >= 0 ? iTab : ls.length);
  const notas = ls.filter((l) => l.startsWith('*'));
  const { blocos } = blocosDoTexto(antes.join('\n'), { nivelCaixaAlta: 3 });
  const corpo = html`${topo({ trilha, etiqueta: 'Entrega', h1: 'Prazo de entrega', lead: 'Prazo estimado por estado, em dias úteis, e as condições de entrega publicadas pela empresa.' })}
${corpoLeitura({
    lado: html`<div class="inst-ajuda"><p class="inst-ajuda__t">Pedido já feito?</p>${botaoWhats(D, 'rastreio', { rotulo: 'Rastrear pelo WhatsApp', contexto: 'prazo_de_entrega', classe: 'btn btn--whats btn--bloco' })}<p class="inst-ajuda__s">Antes de comprar, o prazo do seu pedido é confirmado pelo consultor.</p></div>`,
    conteudo: html`${prosa(blocos)}
    <h2 class="inst-h2" id="prazos">Prazo por estado</h2>
    ${tabelasPrazo(Array.isArray(pz.tabela) ? pz.tabela : [])}
    ${notas.length ? html`<div class="inst-notas" data-campo="prazo-entrega">${notas.map((n) => html`<p>${n}</p>`)}</div>` : ''}
    ${pol.prazo_outras_cores?.literal ? html`<p class="inst-notas"><span data-campo="prazo-entrega">${pol.prazo_outras_cores.literal}</span> <span class="inst-legenda">(texto publicado na descrição dos modelos)</span></p>` : ''}
    ${notaFonte(D, p.fonte)}`,
  })}`;
  return pagina(ctx, {
    saida: 'prazo-de-entrega.html',
    titulo: 'Prazo de entrega por estado | Banheiras Bom Banho',
    descricao: 'Prazo de entrega por estado de banheiras, spas e ofurôs da Banheiras Bom Banho, em dias úteis, e as condições: térreo, sem zona rural e conferência na entrega.',
    corpo,
    trilha,
    modulos: ['institucional'],
  });
}

// ------------------------------------------------------------------ INMETRO
function inmetro(ctx) {
  const D = ctx.dados, E = D.empresa;
  const p = P(D, 'inmetro');
  const trilha = [inicio, { nome: 'Sobre nós', path: 'lojas/sobre-nos.html' }, { nome: 'Certificação INMETRO', path: 'inmetro.html' }];
  const ls = linhasDe(p.texto_exibido).filter((l) => !/^Certificação Inmetro$/i.test(l) && !/^Site de busca Inmetro$/i.test(l));
  const pares = ls.map((l) => { const m = /^([^:]{3,40}):\s*(.+)$/.exec(l); return m ? { k: m[1], v: m[2] } : { k: null, v: l }; });
  const conflito = E.inmetro?.organismo_certificador_conflito;
  const corpo = html`${topo({ trilha, etiqueta: 'Certificação', h1: 'Certificação INMETRO', lead: html`Certificado nº <span class="num" data-campo="empresa-inmetro">${E.inmetro.certificado}</span>, com os dados publicados pela empresa.` })}
${corpoLeitura({
    lado: E.inmetro?.link_consulta ? html`<div class="inst-ajuda"><p class="inst-ajuda__t">Consulte o certificado</p><a${attrs({ class: 'btn btn--fantasma btn--bloco', href: E.inmetro.link_consulta, target: '_blank', rel: 'noopener' })}>Site de busca do Inmetro${icone('externo', { tamanho: 16 })}</a></div>` : '',
    conteudo: html`<h2 class="inst-h2" id="certificado">Dados do certificado</h2>
    <dl class="inst-dados" data-campo="institucional-texto">${pares.map((x) => (x.k ? html`<div><dt>${x.k}</dt><dd>${x.v}</dd></div>` : html`<div><dd>${x.v}</dd></div>`))}</dl>
    ${notaFonte(D, p.fonte)}
    ${E.inmetro?.rodape_literal ? html`<h2 class="inst-h2" id="texto-rodape">Texto do rodapé do site</h2><p data-campo="institucional-texto">${E.inmetro.rodape_literal}</p>` : ''}
    ${conflito ? html`<div class="inst-aviso" role="note">${icone('boia', { tamanho: 20 })}<p>A página de certificação cita o organismo <b>${conflito.pagina_inmetro}</b>, e o texto do rodapé cita <b>${conflito.rodape}</b>. As duas versões estão no site da empresa; confirme com a equipe qual vale para o seu modelo.</p></div>` : ''}`,
  })}`;
  return pagina(ctx, {
    saida: 'inmetro.html',
    titulo: 'Certificação INMETRO | Banheiras Bom Banho',
    descricao: `Certificação INMETRO da Banheiras Bom Banho: certificado nº ${E.inmetro.certificado}, classe do produto, tipo, laboratório de ensaio e norma, como publicados.`,
    corpo,
    trilha,
  });
}

// ------------------------------------------------------------------ Política da qualidade
function politicaQualidade(ctx) {
  const D = ctx.dados;
  const p = P(D, 'politica-da-qualidade');
  const trilha = [inicio, { nome: 'Sobre nós', path: 'lojas/sobre-nos.html' }, { nome: 'Política da qualidade', path: 'politica-da-qualidade.html' }];
  const ls = linhasDe(p.texto_exibido);
  // Cabeçalho do documento ("Emissão:" / "03/08/2021" ...), código, título, texto e local/data.
  const meta = [];
  let i = 0;
  while (i < ls.length && !/^POLÍTICA DA QUALIDADE$/i.test(ls[i])) {
    if (/:$/.test(ls[i]) && ls[i + 1]) { meta.push([ls[i].replace(/:$/, ''), ls[i + 1]]); i += 2; } else if (/^REV\.$/.test(ls[i]) && ls[i + 1]) { meta.push(['Revisão', ls[i + 1]]); i += 2; } else i++;
  }
  const resto = ls.slice(i + 1);
  const codigo = resto[0] && /^[A-Z]{2}-\d+$/.test(resto[0]) ? resto.shift() : null;
  const fecho = resto.length && /^\p{L}+, \d/u.test(resto[resto.length - 1]) ? resto.pop() : null;
  const corpo = html`${topo({ trilha, etiqueta: 'Qualidade', h1: 'Política da qualidade' })}
<article class="dia inst">
  <div class="wrap inst__estreito">
    <figure class="inst-doc" data-campo="institucional-texto">
      <figcaption class="inst-doc__cab"><span class="etiqueta">${codigo || 'Documento'}</span><dl>${meta.map(([k, v]) => html`<div><dt>${k}</dt><dd class="num">${v}</dd></div>`)}</dl></figcaption>
      <blockquote><p>${resto.join(' ')}</p></blockquote>
      ${fecho ? html`<p class="inst-doc__fecho">${fecho}</p>` : ''}
    </figure>
    ${notaFonte(D, p.fonte)}
  </div>
</article>`;
  return pagina(ctx, { saida: 'politica-da-qualidade.html', titulo: 'Política da qualidade | Banheiras Bom Banho', descricao: 'Política da qualidade da Banheiras Bom Banho (FR-001): fabricação de banheiras, spas e ofurôs de hidromassagem e melhoria contínua, como publicado pela empresa.', corpo, trilha });
}

// ------------------------------------------------------------------ Instaladores
function instaladores(ctx) {
  const D = ctx.dados;
  const I = D.ler('institucionais.json').instaladores;
  const pol = D.ler('politicas.json');
  const trilha = [inicio, { nome: 'Instaladores', path: 'instaladores.html' }];
  const ufs = [...new Set(I.lista.map((x) => x.uf))];
  const tel = (t) => `tel:+55${t.replace(/\D/g, '')}`;
  const corpo = html`${topo({ trilha, etiqueta: 'Instalação', h1: 'Instaladores', lead: pol.instalacao?.literal || null })}
${corpoLeitura({
    lado: html`<div class="inst-ajuda"><p class="inst-ajuda__t">Antes de instalar</p><p class="inst-ajuda__s">Confira a planta oficial do seu modelo e o manual de instalação.</p><a class="btn btn--fantasma btn--bloco" href="${url('manual-usuario-instalacao.html')}">Manual do usuário e instalação</a></div>`,
    conteudo: html`<p class="inst-intro" data-campo="institucional-texto">${I.intro_literal}</p>
    ${ufs.map((uf) => html`<section class="inst-bloco" aria-labelledby="uf-${uf.toLowerCase()}"><h2 class="inst-h2" id="uf-${uf.toLowerCase()}">${uf}</h2>
      <div class="rolagem" tabindex="0" role="region" aria-label="Instaladores em ${uf}"><table class="inst-tab">
        <thead><tr><th scope="col">Cidade</th><th scope="col">Técnico</th><th scope="col">Telefone</th></tr></thead>
        <tbody>${I.lista.filter((x) => x.uf === uf).map((x) => html`<tr data-campo="instalador"><td>${x.cidade}</td><th scope="row">${x.tecnico}</th><td><a class="link num" href="${tel(x.telefone)}">${x.telefone}</a></td></tr>`)}</tbody>
      </table></div></section>`)}
    ${pol.art_rrt?.literal ? html`<h2 class="inst-h2" id="art">Apartamento ou sacada</h2><p data-campo="institucional-texto">${pol.art_rrt.literal}</p>` : ''}
    ${notaFonte(D, I.fonte, { prefixo: 'Lista publicada pela Banheiras Bom Banho no site atual' })}`,
  })}`;
  return pagina(ctx, { saida: 'instaladores.html', titulo: 'Instaladores de banheiras e spas | Banheiras Bom Banho', descricao: `Lista de instaladores publicada pela Banheiras Bom Banho em ${ufs.join(', ')}, com cidade e telefone, e as orientações de instalação do manual.`, corpo, trilha });
}

// ------------------------------------------------------------------ Representantes, revenda, corporativo
function representantes(ctx) {
  const D = ctx.dados;
  const trilha = [inicio, { nome: 'Representantes credenciados', path: 'representantes-credenciados.html' }];
  const corpo = html`${topo({ trilha, etiqueta: 'Atendimento comercial', h1: 'Representantes credenciados', lead: 'Fale direto com um consultor de venda da fábrica pelo WhatsApp.' })}
<article class="dia inst">
  <div class="wrap inst__largo">
    <div class="inst-colunas inst-colunas--topo">
      <section class="inst-bloco" aria-labelledby="rc-cons"><h2 id="rc-cons" class="inst-h2">Consultores de venda</h2>${listaConsultores({ contexto: 'representantes' })}</section>
      <section class="inst-bloco" aria-labelledby="rc-mais"><h2 id="rc-mais" class="inst-h2">Outros canais</h2><ul class="canais">${linhaCanal('venda_principal', { contexto: 'representantes' })}${linhaCanal('ajuda', { contexto: 'representantes' })}</ul>
        <p><a class="link" href="${url('lojas/loja-showrooms.html')}">Lojas e showrooms</a> · <a class="link" href="${url('seja-revendedor.html')}">Seja um revendedor</a></p></section>
    </div>
  </div>
</article>`;
  return pagina(ctx, { saida: 'representantes-credenciados.html', titulo: 'Representantes credenciados | Banheiras Bom Banho', descricao: 'Fale com um consultor de venda da Banheiras Bom Banho pelo WhatsApp: os números de atendimento comercial da fábrica, na ordem do site.', corpo, trilha });
}

function sejaRevendedor(ctx) {
  const D = ctx.dados;
  const p = P(D, 'seja-revendedor');
  const trilha = [inicio, { nome: 'Seja um revendedor', path: 'seja-revendedor.html' }];
  const corpo = html`${topo({ trilha, etiqueta: 'Revenda', h1: 'Seja um revendedor', lead: 'Conte pelo WhatsApp sua cidade, seu estado e como trabalha. A equipe da fábrica responde por lá.' })}
<article class="dia inst">
  <div class="wrap inst__estreito">
    <p class="inst-acoes">${botaoWhats(D, 'ajuda', { rotulo: 'Falar com a equipe', contexto: 'seja_revendedor' })}<a class="btn btn--fantasma" href="${url('vendas-corporativas.html')}">Vendas corporativas</a></p>
    ${numerosEmpresa(D, 1)}
    ${notaFonte(D, p.fonte)}
  </div>
</article>`;
  return pagina(ctx, { saida: 'seja-revendedor.html', titulo: 'Seja um revendedor | Banheiras Bom Banho', descricao: 'Quer revender banheiras, spas e ofurôs da Banheiras Bom Banho? Fale com a equipe da fábrica pelo WhatsApp e conte sua cidade e seu estado.', corpo, trilha });
}

function vendasCorporativas(ctx) {
  const D = ctx.dados;
  const p = P(D, 'vendas-corporativas');
  const trilha = [inicio, { nome: 'Vendas corporativas', path: 'vendas-corporativas.html' }];
  const ls = linhasDe(p.texto_exibido);
  // A chamada do tema quebra "Encontre / Banheiras / para seu negócio!" em três linhas: aqui é uma frase só.
  const lead = ls.find((l) => /^Atendimento exclusivo/i.test(l));
  const iEnc = ls.findIndex((l) => /^Encontre$/i.test(l));
  const chamada = iEnc >= 0 ? ls.slice(iEnc, iEnc + 3).join(' ') : null;
  const valorize = ls.find((l) => /^Valorize/i.test(l));
  const iIn = ls.findIndex((l) => /^INMETRO$/.test(l));
  const inm = iIn >= 0 ? ls[iIn + 1] : null;
  const corpo = html`${topo({ trilha, etiqueta: 'Corporativo', h1: 'Vendas corporativas', lead: lead || null })}
<article class="dia inst">
  <div class="wrap inst__largo">
    <div class="inst-colunas">
      <div class="inst-prosa" data-campo="institucional-texto">
        ${chamada ? html`<h2 class="inst-h2">${chamada}</h2>` : ''}
        ${valorize ? html`<p class="inst-intro">${valorize}</p>` : ''}
        ${inm ? html`<h3 class="inst-h3 inst-h3--caixa">INMETRO</h3><p>${inm}. <a class="link" href="${url('inmetro.html')}">Ver a certificação</a></p>` : ''}
        <p class="inst-acoes">${botaoWhats(D, 'ajuda', { rotulo: 'Fale com a equipe', contexto: 'vendas_corporativas' })}<a class="btn btn--fantasma" href="${url('banheiras-instaladas.html')}">Ver os projetos</a></p>
      </div>
      <div>${numerosEmpresa(D, 1)}</div>
    </div>
    ${notaFonte(D, p.fonte)}
  </div>
</article>`;
  return pagina(ctx, { saida: 'vendas-corporativas.html', titulo: 'Vendas corporativas: construtoras e hotéis | BBB', descricao: 'Vendas corporativas da Banheiras Bom Banho para construtoras, incorporadoras e hotéis: banheiras, spas e ofurôs com condições especiais, pelo WhatsApp.', corpo, trilha });
}

// ------------------------------------------------------------------ Manual
function manual(ctx) {
  const D = ctx.dados;
  const m = D.ler('politicas.json').manual;
  const pi = P(D, 'manual-usuario-instalacao');
  const trilha = [inicio, { nome: 'Manual do usuário e instalação', path: 'manual-usuario-instalacao.html' }];
  const pdf = join(paths.public, m.pdf_path);
  const mb = existsSync(pdf) ? (statSync(pdf).size / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : null;
  // Abertura literal da página do manual (sem o título e o rótulo do botão).
  const intro = linhasDe(pi.texto_exibido).filter((l) => !/^Manual do Usuário e Instalação de/i.test(l) && !/^Baixar agora/i.test(l));
  // Páginas do PDF em HTML: a 1 é a capa e a 3 é o índice do PDF, que vira o sumário (só as linhas do
  // índice com título correspondente no texto exibido; regras em parts/manual.mjs).
  const exibir = (m.paginas || []).filter((pg) => pg.pagina !== 1 && pg.pagina !== 3 && !pg.oculto_ate_decisao && !pg.sem_texto_exibido);
  const indice = indiceDoManual((m.paginas || []).find((pg) => pg.pagina === 3)?.texto_exibido);
  const { paginas: paginasM, secoes } = blocosDoManual(exibir, indice);
  const paginas = paginasM.filter((pg) => pg.blocos.length);
  const corpo = html`${topo({
    trilha, etiqueta: 'Suporte', h1: 'Manual do usuário e instalação',
    lead: intro[0] || null,
    extra: html`<p class="inst-topo__acoes" data-intro style="--i:3"><a class="btn btn--claro" href="${url(m.pdf_path)}" download>${icone('seta-dir', { tamanho: 18 })}Baixar o manual em PDF<span class="inst-topo__peso">${m.paginas_total} páginas${mb ? `, ${mb} MB` : ''}</span></a></p>`,
  })}
${corpoLeitura({
    lado: html`${sumario(secoes, { titulo: 'Seções do manual', classe: 'inst-sumario--longo' })}<div class="inst-ajuda"><p class="inst-ajuda__t">Assistência técnica</p>${botaoWhats(D, 'sac', { rotulo: 'Falar com o SAC', contexto: 'manual', classe: 'btn btn--whats btn--bloco' })}<p class="inst-ajuda__s">Consulte as condições de garantia do seu modelo com o consultor.</p></div>`,
    conteudo: html`
    ${paginas.map((pg) => html`<section class="inst-pagina" id="p-${pg.n}" aria-label="Página ${pg.n} do manual"><p class="inst-pagina__n num" aria-hidden="true">p. ${pg.n}</p>${prosa(pg.blocos, { campo: 'manual-texto' })}</section>`)}
    <p class="inst-legenda">Algumas páginas do PDF trazem desenhos e esquemas que não estão neste texto: veja o arquivo original. As páginas sobre garantia ficam de fora até a confirmação da empresa; consulte as condições do seu modelo com o consultor.</p>
    ${notaFonte(D, m.url_fonte, { prefixo: 'Texto do manual publicado pela Banheiras Bom Banho' })}`,
  })}`;
  return pagina(ctx, {
    saida: 'manual-usuario-instalacao.html',
    titulo: 'Manual do usuário e instalação | Banheiras Bom Banho',
    descricao: 'Manual do usuário e instalação de banheiras, spas e ofurôs da Banheiras Bom Banho: cuidados, limpeza, rede elétrica, hidráulica e montagem, com o PDF original.',
    corpo,
    trilha,
    tipo: 'WebPage',
  });
}

// ------------------------------------------------------------------ Rastreio, localização, atendimento, tutoriais
function rastreio(ctx) {
  const D = ctx.dados;
  const r = D.ler('politicas.json').rastreio || {};
  const trilha = [inicio, { nome: 'Rastreio', path: 'rastreio.html' }];
  const corpo = html`${topo({ trilha, etiqueta: 'Pós-venda', h1: 'Rastrear meu pedido', lead: 'O rastreio é feito pelo WhatsApp do rastreio de pedidos. Tenha em mãos os dados abaixo.' })}
<article class="dia inst">
  <div class="wrap inst__estreito">
    <ol class="inst-campos" role="list" data-campo="institucional-texto">${(r.campos || []).map((c, i) => html`<li><span class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${c}</li>`)}</ol>
    <p class="inst-acoes">${botaoWhats(D, 'rastreio', { rotulo: 'Rastrear pelo WhatsApp', contexto: 'rastreio' })}${botaoWhats(D, 'sac', { rotulo: 'Falar com o SAC', contexto: 'rastreio', classe: 'btn btn--fantasma' })}</p>
    ${notaFonte(D, r.fonte, { prefixo: 'Campos pedidos pela página de rastreio do site atual' })}
  </div>
</article>`;
  return pagina(ctx, { saida: 'rastreio.html', titulo: 'Rastrear pedido | Banheiras Bom Banho', descricao: 'Rastreie seu pedido da Banheiras Bom Banho pelo WhatsApp do rastreio: tenha em mãos o CNPJ da nota, o número do pedido e o e-mail.', corpo, trilha });
}

function mapaFigura(D, { foco = null } = {}) {
  const M = mapaLojas(D.lojas);
  return html`<figure class="mapa inst-mapa">
  <div class="mapa__quadro" style="aspect-ratio:${M.regiao.w}/${M.regiao.h}">
    <svg class="mapa__svg" viewBox="0 0 ${M.regiao.w} ${M.regiao.h}" aria-hidden="true" focusable="false"><path class="mapa__terra" d="${M.regiao.d}"/>${M.pontos.map((pt) => raw(`<circle class="mapa__ponto" cx="${(pt.x * M.regiao.w / 100).toFixed(1)}" cy="${(pt.y * M.regiao.h / 100).toFixed(1)}" r="${foco && pt.loja.n === foco ? 1.6 : 1.1}"/>`))}</svg>
    <ol class="mapa__lista" role="list">${M.pontos.map((pt) => html`<li class="mapa__item mapa__item--${pt.lado}${pt.loja.n === 1 ? ' is-fabrica' : ''}" style="left:${pt.x}%;top:${pt.y}%"><a href="${url(`lojas/loja-showrooms.html#${pt.loja.ancora}`)}"><span class="vh">${pt.loja.nome}: </span><span aria-hidden="true">${pt.loja.cidade}</span></a></li>`)}</ol>
  </div>
  <figcaption class="mapa__leg">Cidades com loja da Banheiras Bom Banho. A fábrica está destacada.</figcaption>
</figure>`;
}

function localizacao(ctx) {
  const D = ctx.dados;
  const p = P(D, 'localizacao');
  const ls = linhasDe(p.texto_exibido);
  const trilha = [inicio, { nome: 'Onde estamos', path: 'localizacao.html' }];
  const loc = D.empresa.localizacao_texto || [];
  const corpo = html`${topo({ trilha, etiqueta: 'Localização', h1: 'Onde estamos', lead: ls.find((l) => !/^Onde Estamos$/i.test(l)) || null })}
<article class="sala inst inst--sala">
  <div class="wrap inst__largo">
    <div class="inst-colunas">
      <div>
        ${loc.map((x) => html`<p class="inst-intro" data-campo="empresa-texto">${x.literal}.</p>`)}
        ${fichaFabrica(D)}
        <p class="inst-acoes"><a class="btn btn--claro" href="${url('lojas/loja-showrooms.html')}">${icone('loja', { tamanho: 18 })}Ver todas as lojas</a></p>
      </div>
      ${mapaFigura(D, { foco: 1 })}
    </div>
    ${notaFonte(D, p.fonte)}
  </div>
</article>`;
  const c = cidadeDaFabrica(D.empresa.endereco_fabrica);
  const onde = c ? ` em ${c.cidade}, ${c.uf}` : '';
  return pagina(ctx, { saida: 'localizacao.html', titulo: `Onde estamos: fábrica${onde} | Banheiras Bom Banho`, descricao: `Como chegar à fábrica da Banheiras Bom Banho${onde}: endereço, mapa, telefone fixo e horário de atendimento, e as cidades com loja.`, corpo, trilha });
}

function atendimento(ctx) {
  const D = ctx.dados, E = D.empresa;
  const trilha = [inicio, { nome: 'Atendimento', path: 'contacts.html' }];
  const corpo = html`${topo({ trilha, etiqueta: 'Fale conosco', h1: 'Atendimento', lead: 'Cada assunto tem o seu canal de WhatsApp. Os links abrem a conversa com a mensagem pronta quando ela existe.' })}
<article class="dia inst">
  <div class="wrap inst__largo">
    <div class="inst-colunas inst-colunas--topo">
      <section class="inst-bloco" aria-labelledby="at-canais"><h2 id="at-canais" class="inst-h2">Canais por assunto</h2>
        <ul class="canais">${linhaCanal('venda_principal', { contexto: 'atendimento', titulo: 'Compra' })}${linhaCanal('ajuda', { contexto: 'atendimento' })}${linhaCanal('rastreio', { contexto: 'atendimento' })}${linhaCanal('sac', { contexto: 'atendimento' })}</ul>
      </section>
      <section class="inst-bloco" aria-labelledby="at-cons"><h2 id="at-cons" class="inst-h2">Consultores de venda</h2>${listaConsultores({ contexto: 'atendimento_consultores' })}<p><a class="link" href="${url('consultores.html')}">Ver os consultores</a></p></section>
    </div>
    <section class="inst-bloco" aria-labelledby="at-outros"><h2 id="at-outros" class="inst-h2">Telefone, e-mail e horário</h2>
      <dl class="inst-ficha inst-ficha--larga">
        <div><dt>${icone('telefone')}Telefone fixo</dt><dd><a class="link num" href="${E.telefone_fixo.tel}" data-campo="empresa-telefone">${E.telefone_fixo.display}</a></dd></div>
        ${E.emails.map((m) => html`<div><dt>${icone('email')}${m.uso === 'canal LGPD' ? 'Dados pessoais (LGPD)' : m.uso === 'Email Comercial' ? 'Comercial' : 'SAC, trocas e devoluções'}</dt><dd><a class="link" href="mailto:${m.email}" data-campo="empresa-email">${m.email}</a></dd></div>`)}
        <div><dt>${icone('relogio')}Horário</dt><dd data-campo="empresa-horario">${horarioEmLinhas(E.horario.literal)}</dd></div>
        <div><dt>${icone('fabrica')}Fábrica</dt><dd data-campo="empresa-endereco">${E.endereco_fabrica}</dd></div>
      </dl>
    </section>
    <p class="inst-acoes"><a class="btn" href="${url('lojas/loja-showrooms.html')}">${icone('loja', { tamanho: 18 })}Lojas e showrooms</a><a class="btn btn--fantasma" href="${url('perguntas-frequentes.html')}">Perguntas frequentes</a></p>
  </div>
</article>`;
  return pagina(ctx, { saida: 'contacts.html', titulo: 'Atendimento: WhatsApp, telefone e e-mail | BBB', descricao: 'Canais de atendimento da Banheiras Bom Banho: WhatsApp para compra, ajuda, rastreio e SAC, consultores de venda, telefone fixo, e-mails e horário.', corpo, trilha, tipo: 'ContactPage' });
}

function tutoriais(ctx) {
  const D = ctx.dados;
  const T = D.ler('institucionais.json').tutoriais;
  const trilha = [inicio, { nome: 'Tutoriais', path: 'tutoriais.html' }];
  const corpo = html`${topo({ trilha, etiqueta: 'Suporte', h1: 'Tutoriais BBB', lead: 'Vídeos da Banheiras Bom Banho sobre montagem, instalação e cuidados, publicados no canal do YouTube.' })}
<article class="dia inst">
  <div class="wrap inst__largo">
    <ol class="inst-videos" role="list">${T.videos.map((v, i) => html`<li data-reveal style="--i:${i}"><a${attrs({ class: 'inst-video', href: v.url, target: '_blank', rel: 'noopener' })}><span class="inst-video__play" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></span><span class="num inst-video__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="inst-video__t">${v.titulo.replace(/^Banheiras Bom Banho:\s*/, '')}</span><span class="inst-video__s">YouTube${icone('externo', { tamanho: 14 })}</span></a></li>`)}</ol>
    <p class="inst-acoes"><a${attrs({ class: 'btn btn--fantasma', href: T.canal, target: '_blank', rel: 'noopener' })}>${icone('youtube', { tamanho: 18 })}Canal no YouTube</a><a class="btn" href="${url('manual-usuario-instalacao.html')}">Manual do usuário e instalação</a></p>
    ${notaFonte(D, T.fonte, { prefixo: 'Vídeos listados na página de tutoriais do site atual' })}
  </div>
</article>`;
  return pagina(ctx, { saida: 'tutoriais.html', titulo: 'Tutoriais em vídeo | Banheiras Bom Banho', descricao: 'Tutoriais em vídeo da Banheiras Bom Banho: montagem e instalação elétrica, instalação hidráulica e cuidados e manutenção com spa, no canal do YouTube.', corpo, trilha });
}

// ------------------------------------------------------------------ Projetos (banheiras instaladas)
function projetos(ctx) {
  const D = ctx.dados;
  const I = D.ler('institucionais.json');
  const p = P(D, 'banheiras-instaladas');
  const trilha = [inicio, { nome: 'Projetos', path: 'banheiras-instaladas.html' }];
  const lista = (xs) => html`<ul class="inst-projetos" role="list">${xs.map((x, i) => html`<li data-reveal style="--i:${i % 3}"><a href="${url(`busca.html?q=${encodeURIComponent(x.nome)}`)}"><span class="inst-projetos__n">${x.nome}</span><span class="inst-projetos__l">${x.legenda}</span>${icone('seta-dir', { tamanho: 18 })}</a></li>`)}</ul>`;
  const corpo = html`${topo({ trilha, etiqueta: 'Banheiras instaladas', h1: 'Projetos', lead: 'Modelos instalados em projetos de clientes, com o nome e a legenda publicados pela empresa. Cada nome abre a busca do catálogo.' })}
<article class="dia inst">
  <div class="wrap inst__largo">
    ${I.depoimentos_projetos.length ? html`<section class="inst-bloco" aria-labelledby="pj-dep"><h2 id="pj-dep" class="inst-h2">O que os clientes falam</h2>
      <div class="inst-deps">${I.depoimentos_projetos.map((d, i) => html`<figure class="inst-dep" data-reveal style="--i:${i}"><blockquote><p data-campo="institucional-texto">${d.texto}</p></blockquote><figcaption>${d.autor}</figcaption></figure>`)}</div>
      <p class="inst-legenda">Opiniões de clientes, assinadas, como publicadas pela empresa no site atual. Não são afirmações da Banheiras Bom Banho.</p></section>` : ''}
    <div class="inst-colunas inst-colunas--topo">
      ${I.projetos.banheiras.length ? html`<section class="inst-bloco" aria-labelledby="pj-ban"><h2 id="pj-ban" class="inst-h2">Projetos de banheiras</h2>${lista(I.projetos.banheiras)}</section>` : ''}
      ${I.projetos.spas.length ? html`<section class="inst-bloco" aria-labelledby="pj-spa"><h2 id="pj-spa" class="inst-h2">Projetos de spas</h2>${lista(I.projetos.spas)}</section>` : ''}
    </div>
    <p class="inst-acoes"><a class="btn" href="${url('vendas-corporativas.html')}">Vendas corporativas</a>${botaoWhats(D, 'venda_principal', { rotulo: 'Comprar pelo WhatsApp', contexto: 'projetos', classe: 'btn btn--whats' })}</p>
    ${notaFonte(D, p.fonte)}
  </div>
</article>`;
  return pagina(ctx, { saida: 'banheiras-instaladas.html', titulo: 'Projetos: banheiras e spas instalados | Banheiras Bom Banho', descricao: 'Projetos de banheiras e spas da Banheiras Bom Banho instalados em casas de clientes, com os modelos usados e depoimentos publicados pela empresa.', corpo, trilha });
}

// ------------------------------------------------------------------ Mapa do site
function mapaDoSite(ctx, outras) {
  const D = ctx.dados;
  const trilha = [inicio, { nome: 'Mapa do site', path: 'mapa-do-site.html' }];
  const produtos = D.ler('produtos.json');
  const cats = D.categorias.filter((c) => !CATEGORIAS_PONTE.includes(c.d_path));
  const raiz = new Set(Object.values(RAIZ_TIPO));
  const grupos = TIPOS.map((t) => ({ t, ps: produtos.filter((p) => p.d_tipo === t).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) })).filter((g) => g.ps.length);
  const corpo = html`${topo({ trilha, etiqueta: 'Navegação', h1: 'Mapa do site', lead: html`Todas as páginas: <span class="num">${cats.length}</span> coleções, <span class="num">${produtos.length}</span> modelos, guias e páginas de atendimento.` })}
<article class="dia inst">
  <div class="wrap inst__largo inst-mapa-site">
    <section aria-labelledby="ms-col"><h2 id="ms-col" class="inst-h2">Coleções</h2>
      <p class="inst-notas">Ao lado de cada coleção, quantos itens a listagem dela exibe no site. Mais abaixo, os modelos aparecem por tipo, com a contagem de modelos publicados de cada tipo: uma listagem pode incluir modelos de outro tipo, e alguns modelos não estão em nenhuma listagem, por isso os dois números podem diferir.</p>
      <ul class="inst-colunas-lista">${cats.sort((a, b) => (raiz.has(b.d_path) - raiz.has(a.d_path)) || a.d_path.localeCompare(b.d_path)).map((c) => html`<li><a class="link" href="${url(c.d_path)}">${c.nome}</a> <span class="inst-conta-rot"><span class="num" data-campo="categoria-total">${c.total_exibido}</span> na listagem</span></li>`)}</ul></section>
    <section aria-labelledby="ms-pg"><h2 id="ms-pg" class="inst-h2">Escolha, atendimento e empresa</h2>
      <ul class="inst-colunas-lista">${outras.map(([nome, path]) => html`<li><a class="link" href="${url(path)}">${nome}</a></li>`)}</ul></section>
    ${grupos.map((g) => html`<section aria-labelledby="ms-${g.t}"><h2 id="ms-${g.t}" class="inst-h2">${NOME_TIPO[g.t]}${g.ps.length > 1 ? 's' : ''} <span class="inst-conta"><span class="num">${g.ps.length}</span> ${g.ps.length > 1 ? 'modelos publicados' : 'modelo publicado'}</span></h2>
      <ul class="inst-colunas-lista">${g.ps.map((p) => html`<li><a class="link" href="${url(`${p.slug}.html`)}">${p.nome}</a></li>`)}</ul></section>`)}
  </div>
</article>`;
  return pagina(ctx, { saida: 'mapa-do-site.html', titulo: 'Mapa do site | Banheiras Bom Banho', descricao: `Mapa do site da Banheiras Bom Banho: ${cats.length} coleções, ${produtos.length} modelos de banheiras, spas, ofurôs, saunas e acessórios, guias de escolha e páginas de atendimento.`, corpo, trilha });
}

// ------------------------------------------------------------------ registro
export function paginas(ctx) {
  const D = ctx.dados;
  const c = cidadeDaFabrica(D.empresa.endereco_fabrica);
  const onde = c ? ` em ${c.cidade}, ${c.uf}` : '';
  const out = [
    sobreNos(ctx),
    fabrica(ctx, { saida: 'lojas/loja-fisica.html', chave: 'loja-fisica', h1: 'Conheça nossa fábrica', etiqueta: 'Fábrica', titulo: 'Conheça a fábrica | Banheiras Bom Banho', descricao: `Conheça a fábrica da Banheiras Bom Banho${onde}: fotos, endereço, telefone e horário. Visite e veja as peças de perto.` }),
    fabrica(ctx, { saida: 'loja-fabrica-de-banheiras.html', chave: 'loja-fabrica-de-banheiras', h1: 'Conheça a BBB Banheiras Bom Banho', etiqueta: 'A empresa', titulo: 'Loja de fábrica de banheiras | Banheiras Bom Banho', descricao: `A Banheiras Bom Banho fabrica banheiras, spas e ofurôs${onde}: a empresa, a equipe, os produtos, fotos e o endereço da fábrica.` }),
    comoComprar(ctx),
    prazoDeEntrega(ctx),
    paginaDeTexto(ctx, {
      chave: 'politica-devolucao-reembolso', saida: 'politica-devolucao-reembolso.html', h1: 'Política de troca, devolução e reembolso', etiqueta: 'Pós-venda',
      titulo: 'Troca, devolução e reembolso | Banheiras Bom Banho',
      descricao: 'Troca, devolução e reembolso na Banheiras Bom Banho: conferência na entrega, desistência em até 7 dias corridos, avaria, defeito, cancelamento e ressarcimento.',
      trilha: [inicio, { nome: 'Troca, devolução e reembolso', path: 'politica-devolucao-reembolso.html' }],
      lado: ajudaLado(D, 'devolucao', { papel: 'sac', rotulo: 'Falar com o SAC', titulo: 'Troca, avaria ou devolução?' }),
    }),
    paginaDeTexto(ctx, {
      chave: 'politica-de-privacidade', saida: 'politica-de-privacidade.html', h1: 'Política de Privacidade', etiqueta: 'Privacidade',
      titulo: 'Política de privacidade | Banheiras Bom Banho',
      descricao: 'Política de privacidade e de cookies da Banheiras Bom Banho: dados pessoais, canal da LGPD, cookies e compromisso do usuário.',
      trilha: [inicio, { nome: 'Política de privacidade', path: 'politica-de-privacidade.html' }],
    }),
    paginaDeTexto(ctx, {
      chave: 'termos-de-uso', saida: 'termos-de-uso.html', h1: 'Termos de Uso', etiqueta: 'Termos',
      titulo: 'Termos de uso | Banheiras Bom Banho',
      descricao: 'Termos de uso do site da Banheiras Bom Banho: quem opera o site, restrições ao uso de textos e imagens, direitos autorais e uso das marcas publicadas.',
      trilha: [inicio, { nome: 'Termos de uso', path: 'termos-de-uso.html' }],
    }),
    paginaDeTexto(ctx, {
      chave: 'seguranca', saida: 'seguranca.html', h1: 'Segurança e Sigilo', etiqueta: 'Segurança',
      titulo: 'Segurança e sigilo dos dados | Banheiras Bom Banho',
      descricao: 'Segurança e sigilo na Banheiras Bom Banho: como os dados do pedido são usados e quais informações são necessárias para comprar.',
      trilha: [inicio, { nome: 'Segurança e sigilo', path: 'seguranca.html' }],
    }),
    inmetro(ctx),
    politicaQualidade(ctx),
    instaladores(ctx),
    representantes(ctx),
    sejaRevendedor(ctx),
    vendasCorporativas(ctx),
    manual(ctx),
    rastreio(ctx),
    localizacao(ctx),
    projetos(ctx),
    atendimento(ctx),
    tutoriais(ctx),
  ];
  const outras = [
    ['Escolher pelo meu espaço', 'escolher.html'], ['Comparar modelos', 'comparar.html'], ['Buscar no catálogo', 'busca.html'],
    ['Que banheira cabe no meu espaço?', 'guia/banheira-por-tamanho.html'], ['Spa para quantas pessoas?', 'guia/spa-por-lugares.html'],
    ['Gel coat ou acrílico?', 'guia/gel-coat-ou-acrilico.html'], ['Básica ou Completa?', 'guia/basica-ou-completa.html'],
    ['Lojas e showrooms', 'lojas/loja-showrooms.html'], ['Consultores', 'consultores.html'], ['Perguntas frequentes', 'perguntas-frequentes.html'],
    ...out.map((p) => [decodificar(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(p.html)?.[1].replace(/<[^>]+>/g, '').trim()), p.saida]),
  ];
  out.push(mapaDoSite(ctx, outras));
  return out;
}

export { emCaixaAlta, comLinks };
