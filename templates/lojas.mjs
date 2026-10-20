// Lojas e showrooms (SPEC 4 linha 9, 9.6, 11.2 Store e 15): as 9 lojas de data/lojas.json com nome,
// endereço e atendimento literais, "Como chegar" pelo link de mapa publicado e o WhatsApp da loja.
//  - Fábrica: endereço sem CEP (conflito 37584-000 x 37557-000, SPEC 15).
//  - Taubaté e Goiânia: número com 8 dígitos escrito como no site, sem link; o botão leva à ajuda,
//    como a própria página de lojas do site atual faz (link_ativo=false em contatos.json).
//  - Caraguatatuba: o link de mapa publicado repete o de Taubaté; o "Como chegar" é a busca do Google
//    Maps pelo endereço literal (mapa_derivado_do_endereco), e a página diz isso.
// Âncora por cidade (#taubate etc.), usada pelas páginas-ponte das URLs antigas.
import { html, attrs, raw } from '../build/lib/html.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { mapaLojas } from '../build/lib/mapa-lojas.mjs';
import { topo, inicio, pagina, notaFonte, botaoWhats, jsonldPagina } from './parts/inst.mjs';

/** Store (SPEC 11.2): endereço literal (fábrica sem CEP), hasMap, telefone só com link ativo, sem horário. */
export function storeJsonLd(D, l) {
  const c = D.contato(l.whatsapp_papel);
  return {
    '@type': 'Store',
    '@id': abs(`lojas/loja-showrooms.html#${l.ancora}`),
    name: l.nome,
    url: abs(`lojas/loja-showrooms.html#${l.ancora}`),
    address: { '@type': 'PostalAddress', streetAddress: l.endereco_exibido, addressLocality: l.cidade, addressRegion: l.uf, addressCountry: 'BR' },
    hasMap: l.mapa,
    ...(c.link_ativo && c.status === 'ativo' ? { telephone: `+${c.numero}` } : {}),
    parentOrganization: { '@id': abs('#org') },
  };
}

function cartao(D, l, i) {
  const c = D.contato(l.whatsapp_papel);
  const ativo = c.link_ativo && c.status === 'ativo';
  const fabrica = l.n === 1;
  return html`<li class="loja${fabrica ? ' loja--fabrica' : ''}" id="${l.ancora}" data-reveal style="--i:${i % 3}">
  <article aria-labelledby="loja-${l.ancora}">
    <p class="loja__n num" aria-hidden="true">${String(l.n).padStart(2, '0')}</p>
    <p class="etiqueta">${fabrica ? 'Loja da fábrica' : 'Showroom'} · ${l.uf}</p>
    <h2 class="loja__cidade" id="loja-${l.ancora}">${l.cidade}</h2>
    <p class="loja__nome" data-campo="loja-nome">${l.nome}</p>
    <address class="loja__end">${icone('local', { tamanho: 18 })}<span data-campo="loja-endereco">${l.endereco_exibido}</span></address>
    <p class="loja__tel">${icone('telefone', { tamanho: 18 })}<span><span class="vh">Atendimento: </span><span class="num" data-campo="loja-telefone">${l.atendimento_literal}</span>${ativo ? '' : html`<span class="loja__aviso">Número publicado com 8 dígitos; para falar com a loja, use o WhatsApp de ajuda.</span>`}</span></p>
    <p class="loja__acoes">
      <a${attrs({ class: 'btn btn--fantasma', href: l.mapa, target: '_blank', rel: 'noopener' })}>${icone('local', { tamanho: 18 })}Como chegar</a>
      ${ativo
        ? botaoWhats(D, l.whatsapp_papel, { rotulo: 'WhatsApp da loja', contexto: `loja_${l.ancora}`, texto: '' })
        : botaoWhats(D, 'ajuda', { rotulo: 'Preciso de ajuda', contexto: `loja_${l.ancora}_sem_link` })}
    </p>
    ${l.mapa_derivado_do_endereco ? html`<p class="loja__obs">O link de mapa publicado para esta loja repete o de outra cidade; "Como chegar" busca o endereço acima no mapa.</p>` : ''}
  </article>
</li>`;
}

export function paginas(ctx) {
  const D = ctx.dados;
  const inst = D.ler('institucionais.json')?.paginas?.['lojas/loja-showrooms'];
  const chamada = (inst?.texto_exibido || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).filter((l) => !/^Loja Showrooms$/i.test(l));
  // "Venha conhecer as / lojas da / Banheiras Bom Banho!" é uma frase quebrada pelo tema: junta-se aqui.
  const frase = chamada.join(' ').replace(/\s+/g, ' ');
  const [lead, chamadaWhats] = frase.split(/(?<=!)\s+/);
  const trilha = [inicio, { nome: 'Lojas e showrooms', path: 'lojas/loja-showrooms.html' }];
  const M = mapaLojas(D.lojas);
  const ufs = [...new Set(D.lojas.map((l) => l.uf))];
  const mapa = html`<figure class="mapa lojas-mapa">
    <div class="mapa__quadro" style="aspect-ratio:${M.regiao.w}/${M.regiao.h}">
      <svg class="mapa__svg" viewBox="0 0 ${M.regiao.w} ${M.regiao.h}" aria-hidden="true" focusable="false"><defs><pattern id="lj-grade" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width=".3"/></pattern></defs><rect width="${M.regiao.w}" height="${M.regiao.h}" fill="url(#lj-grade)"/><path class="mapa__terra" d="${M.regiao.d}"/>${M.pontos.map((pt) => raw(`<circle class="mapa__onda" cx="${(pt.x * M.regiao.w / 100).toFixed(1)}" cy="${(pt.y * M.regiao.h / 100).toFixed(1)}" r="2.6"/><circle class="mapa__ponto" cx="${(pt.x * M.regiao.w / 100).toFixed(1)}" cy="${(pt.y * M.regiao.h / 100).toFixed(1)}" r="1.1"/>`))}</svg>
      <ol class="mapa__lista" role="list">${M.rotulos.map((r) => html`<li class="mapa__item mapa__item--${r.lado}${r.fabrica ? ' is-fabrica' : ''}" style="left:${r.x}%;top:${r.y}%">${r.lojas.map((l, i) => html`${i ? html`<span class="mapa__sep" aria-hidden="true">·</span>` : ''}<a href="#${l.ancora}"><span class="vh">${l.nome}: </span><span aria-hidden="true">${l.cidade}</span></a>`)}</li>`)}</ol>
        <ul class="mapa__rotulos" aria-hidden="true">${M.rotulos.map((r) => html`<li class="mapa__item mapa__item--${r.lado}${r.fabrica ? ' is-fabrica' : ''}" style="left:${r.x}%;top:${r.y}%"><span>${r.lojas.map((l) => l.cidade).join(' e ')}</span></li>`)}</ul>
      <svg class="mapa__pais" viewBox="0 0 ${M.pais.w} ${M.pais.h}" aria-hidden="true" focusable="false"><path d="${M.pais.d}"/><rect x="${M.pais.caixa.x}" y="${M.pais.caixa.y}" width="${M.pais.caixa.w}" height="${M.pais.caixa.h}"/></svg>
    </div>
    <figcaption class="mapa__leg">O ponto marca a cidade.</figcaption>
  </figure>`;

  const corpo = html`${topo({
    trilha, etiqueta: 'Lojas', h1: html`<span class="num">${D.lojas.length}</span> lojas para ver as peças de perto`,
    lead: lead || null,
    extra: html`<p class="inst-topo__acoes" data-intro style="--i:3">${botaoWhats(D, 'ajuda', { rotulo: chamadaWhats || 'Fale com um representante agora!', contexto: 'lojas_topo' })}</p>`,
    classe: 'lojas-topo',
  })}
<section class="sala lojas-mapa-sec" aria-label="Mapa das lojas">
  <div class="wrap lojas-mapa-sec__in">
    ${mapa}
    <nav class="lojas-indice" aria-label="Lojas por estado">${ufs.map((uf) => html`<div><p class="etiqueta">${uf}</p><ul role="list">${D.lojas.filter((l) => l.uf === uf).map((l) => html`<li><a href="#${l.ancora}">${l.cidade}</a></li>`)}</ul></div>`)}</nav>
  </div>
</section>
<section class="dia lojas" aria-label="Endereços">
  <div class="wrap">
    <ol class="lojas__grade" role="list">${D.lojas.map((l, i) => cartao(D, l, i))}</ol>
    ${notaFonte(D, D.lojas[0]?.fonte, { prefixo: 'Endereços e telefones publicados pela Banheiras Bom Banho' })}
  </div>
</section>`;

  const descricao = `Endereços das ${D.lojas.length} lojas da Banheiras Bom Banho em ${ufs.join(', ')}: loja da fábrica e showrooms, com mapa, telefone e WhatsApp de cada uma.`;
  return [pagina(ctx, {
    saida: 'lojas/loja-showrooms.html',
    titulo: 'Lojas e showrooms | Banheiras Bom Banho',
    descricao,
    corpo,
    trilha,
    ativo: 'lojas/loja-showrooms.html',
    jsonld: [jsonldPagina(D, { saida: 'lojas/loja-showrooms.html', nome: 'Lojas e showrooms', descricao, trilha, extra: D.lojas.map((l) => storeJsonLd(D, l)) })],
  })];
}
