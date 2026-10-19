// Gaveta de WhatsApp (SPEC 6.1 e 10.1): comprar, escolher consultor, ajuda, rastreio, SAC e lojas.
// Números e textos saem de data/contatos.json; o link funciona sem JS.
import { html, attrs } from '../../build/lib/html.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { url } from '../../build/lib/url.mjs';
import { dados } from '../../build/lib/dados.mjs';

// Rótulo e ícone por papel. O número exibido é sempre o `display` literal de contatos.json.
export const CANAIS = Object.freeze({
  venda_principal: { titulo: 'Comprar pelo WhatsApp', icone: 'whatsapp', classe: 'canal--venda', sync: 'venda' },
  ajuda: { titulo: 'Preciso de ajuda', icone: 'boia' },
  rastreio: { titulo: 'Rastrear pedido', icone: 'caminhao' },
  sac: { titulo: 'SAC', icone: 'fone' },
});

/** Uma linha de canal (link wa.me) com rótulo, número exibido e contexto do evento. */
export function linhaCanal(papel, { contexto, titulo = null, tag = 'li' } = {}) {
  const D = dados();
  const c = D.contato(papel);
  const def = CANAIS[papel] || { titulo: papel, icone: 'whatsapp' };
  const a = html`<a${attrs({
    class: `canal ${def.classe || ''}`.trim(),
    href: D.wa(papel),
    target: '_blank',
    rel: 'noopener',
    'data-wa-papel': papel,
    'data-wa-contexto': contexto,
    'data-wa-sync': def.sync || null,
    'data-campo': 'contato-numero',
  })}><span class="canal__ic">${icone(def.icone, { tamanho: 20 })}</span><span><span class="canal__t">${titulo || def.titulo}</span><span class="canal__s num" data-campo="contato-display">${c.display}</span></span>${icone('seta-diag', { tamanho: 18 })}</a>`;
  return tag ? html`<li>${a}</li>` : a;
}

/** Lista dos 8 consultores na ordem do rodapé, rotulados "Consultor 1" a "Consultor 8" (SPEC 9.6). */
export function listaConsultores({ contexto }) {
  const D = dados();
  return html`<ol class="consultores">${D.consultores().map(
    (c, i) => html`<li><a${attrs({
      class: 'consultor',
      href: D.wa(c.papel),
      target: '_blank',
      rel: 'noopener',
      'data-wa-papel': c.papel,
      'data-wa-contexto': contexto,
      'data-wa-sync': 'venda',
      'data-campo': 'contato-numero',
    })}><b>Consultor ${c.ordem_rodape ?? i + 1}</b><span class="num" data-campo="contato-display">${c.display}</span></a></li>`,
  )}</ol>`;
}

export function gavetaWhats() {
  const D = dados();
  const nLojas = D.lojas.length;
  return html`<dialog class="gaveta gaveta--folha dia" id="gaveta-whats" aria-labelledby="gw-titulo">
  <div class="gaveta__topo"><span class="etiqueta">Atendimento pelo WhatsApp</span><button class="gaveta__fechar" type="button" data-gaveta-fechar aria-label="Fechar">${icone('x', { tamanho: 20 })}</button></div>
  <div class="gaveta__corpo">
    <p class="gaveta__titulo" id="gw-titulo">Fale com a Banheiras Bom Banho</p>
    <ul class="canais" style="margin-top:16px">
      ${linhaCanal('venda_principal', { contexto: 'gaveta' })}
      <li><details data-foco="consultores"><summary class="canal"><span class="canal__ic">${icone('pessoas', { tamanho: 20 })}</span><span><span class="canal__t">Escolher meu consultor</span><span class="canal__s">${D.consultores().length} consultores de venda</span></span>${icone('chevron-baixo', { tamanho: 18 })}</summary>${listaConsultores({ contexto: 'gaveta_consultores' })}</details></li>
      ${linhaCanal('ajuda', { contexto: 'gaveta' })}
      ${linhaCanal('rastreio', { contexto: 'gaveta' })}
      ${linhaCanal('sac', { contexto: 'gaveta' })}
      <li><a class="canal" href="${url('lojas/loja-showrooms.html')}"><span class="canal__ic">${icone('loja', { tamanho: 20 })}</span><span><span class="canal__t">Lojas</span><span class="canal__s">${nLojas} lojas e showrooms</span></span>${icone('seta-dir', { tamanho: 18 })}</a></li>
    </ul>
    <p class="gaveta__nota"><span class="vh">Horário: </span><span data-campo="empresa-horario">${D.empresa.horario.literal}</span></p>
  </div>
</dialog>`;
}
