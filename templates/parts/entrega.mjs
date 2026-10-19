// Entrega e pagamento no produto (SPEC 9.3, seção 11): tabela de prazo por estado com seletor de
// estado (sem geolocalização), térreo, sem área rural, desistência, garantia sob consulta, manual e
// canal. Textos e prazos literais de data/politicas.json; nenhum prazo de garantia é publicado.
import { html, attrs } from '../../build/lib/html.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { url } from '../../build/lib/url.mjs';

/** Siglas citadas na tabela literal, na ordem em que aparecem (para o seletor de estado). */
function siglas(tabela) {
  const vistas = new Set();
  for (const g of tabela) for (const l of g.linhas) for (const s of l.estados.match(/\b[A-Z]{2}\b/g) || []) vistas.add(s);
  return [...vistas].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function entrega(D) {
  const pol = D.ler('politicas.json') || {};
  const pz = pol.prazo_de_entrega || {};
  const tabela = Array.isArray(pz.tabela) ? pz.tabela : [];
  const ufs = siglas(tabela);
  const ressalva = String(pz.ressalva || '').replace(/^"|"$/g, '');
  const youtube = typeof D.empresa.youtube === 'string' ? D.empresa.youtube : D.empresa.youtube?.url;
  return html`<div class="entrega">
  <div class="entrega__prazo">
    <h3 class="entrega__h">Prazo de entrega por estado</h3>
    ${ufs.length ? html`<p class="entrega__uf" data-so-js hidden><label class="campo campo--inline"><span class="campo__rot">Seu estado</span><select class="campo__in" data-prazo-uf><option value="">Todos</option>${ufs.map((u) => html`<option value="${u}">${u}</option>`)}</select></label></p>` : ''}
    ${tabela.map((g) => html`<div class="rolagem" tabindex="0" role="region" aria-label="Prazos: ${g.grupo}">
      <table class="prazo num" data-prazo>
        <caption class="prazo__cap">${g.grupo}</caption>
        <thead><tr><th scope="col">Estados</th><th scope="col">Prazo</th></tr></thead>
        <tbody>${g.linhas.map((l) => html`<tr data-ufs="${(l.estados.match(/\b[A-Z]{2}\b/g) || []).join(' ')}"><th scope="row">${l.estados}</th><td data-campo="prazo-entrega">${l.prazo}</td></tr>`)}</tbody>
      </table>
    </div>`)}
    ${ressalva ? html`<p class="entrega__nota" data-campo="prazo-entrega">${ressalva}</p>` : ''}
  </div>
  <ul class="entrega__lista" role="list">
    ${pol.entrega?.literal ? html`<li>${icone('caminhao', { tamanho: 22 })}<span data-campo="prazo-entrega">${pol.entrega.literal}</span></li>` : ''}
    ${pol.pagamento?.literal ? html`<li>${icone('escudo', { tamanho: 22 })}<span data-campo="pagamento">${pol.pagamento.literal}</span></li>` : ''}
    ${pol.desistencia?.literal ? html`<li>${icone('relogio', { tamanho: 22 })}<span>${pol.desistencia.literal}${/[.;!?]$/.test(pol.desistencia.literal) ? '' : '.'}</span></li>` : ''}
    ${pol.garantia?.texto_exibido ? html`<li>${icone('boia', { tamanho: 22 })}<span>${pol.garantia.texto_exibido}</span></li>` : ''}
  </ul>
  <p class="entrega__links">
    <a class="link" href="${url('prazo-de-entrega.html')}">Prazo de entrega</a>
    <a class="link" href="${url('manual-usuario-instalacao.html')}">Manual do usuário e instalação</a>
    ${youtube ? html`<a${attrs({ class: 'link', href: youtube, target: '_blank', rel: 'noopener' })}>Canal no YouTube${icone('externo', { tamanho: 14 })}</a>` : ''}
  </p>
</div>`;
}
