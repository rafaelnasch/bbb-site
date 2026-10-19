// Coluna de decisão do produto (SPEC 6.2 e 9.3, seção 4): preço "por" e "de", seletor de tamanho,
// "Monte a sua" com os preços reais das opções, total, botão de compra pelo WhatsApp, consultor e
// comparar. Os rótulos das opções são literais (rotulo_exibido); a soma usa só finalPrice e
// preco_adicional publicados. src/js/monte.js recalcula o total e a mensagem; seletor.js troca a planta.
import { html, attrs } from '../../build/lib/html.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { url } from '../../build/lib/url.mjs';
import { formatBRL } from '../../build/lib/money.mjs';
import { rotuloTam, plantaDoTamanho, plantasSemTamanho } from './planta.mjs';
import { dadosTamanho } from './escala.mjs';
import { avulsoSuspenso } from '../../build/lib/catalogo.mjs';

export const RE_TAMANHO = /^tamanho:?$/i;
export const NOTA_SOMA = (data) => `Soma pelos preços publicados no site em ${data}. O valor final é confirmado pelo consultor.`;

/** Nome de exibição do grupo de opções (o título da fonte vem em caixa alta em parte do catálogo). */
export function nomeGrupo(titulo) {
  const t = String(titulo || '').replace(/:$/, '').trim();
  if (/^op[çc][õo]es adicionais$/i.test(t) || /^acess[óo]rios$/i.test(t)) return 'Adicionais';
  const min = t.toLocaleLowerCase('pt-BR');
  return min.charAt(0).toLocaleUpperCase('pt-BR') + min.slice(1);
}

/** Papel da opção na mensagem do WhatsApp (SPEC 10.2): voltagem, cor ou adicionais; outros vão como "Título: valor". */
function papelGrupo(titulo) {
  const t = String(titulo || '').toLowerCase();
  if (/^voltagem/.test(t)) return 'voltagem';
  if (/^cor$/.test(t)) return 'cor';
  return 'outro';
}

/** Produto avulso citado num alerta opcao_x_produto_avulso (para a nota ao lado da opção). */
function avulsoDoAlerta(p, produtos) {
  const al = (p.alertas_da_fonte || []).find((a) => a.tipo === 'opcao_x_produto_avulso');
  const m = al && /'([^']+)'/.exec(al.detalhe || '');
  const u = al && /(https?:\/\/\S+?\.html)/.exec(al.detalhe || '');
  if (!m || !u) return null;
  const prod = produtos.find((x) => x.url === u[1]);
  return prod ? { nomeOpcao: m[1].toLowerCase(), prod } : null;
}

function precoBloco(p, { esgotado }) {
  return html`<div class="preco" data-preco-bloco>
  <p class="preco__por num"><span class="vh">${p.preco.por_label || 'Preço'}: </span><span data-campo="preco-por">${p.preco.por}</span></p>
  ${p.preco.de ? html`<p class="preco__de num"><span class="vh">${p.preco.de_label || 'Preço anterior'}: </span><span class="preco-de" data-campo="preco-de">${p.preco.de}</span></p>` : ''}
  ${esgotado ? html`<p class="selo selo--esgotado" data-campo="disponibilidade">${p.disponibilidade}</p>` : ''}
</div>`;
}

// Conflito da fonte ao lado do preço e da disponibilidade (SPEC 15): as duas versões, sem escolher.
function notaAvulsoSuspenso(p, D) {
  const n = avulsoSuspenso(p, D.ler('politicas.json'));
  if (!n) return html``;
  return html`<div class="monte__nota monte__nota--bloco monte__nota--conflito" data-conflito="avulso-suspenso">
  <p><span class="selo-disp">${icone('info', { tamanho: 18 })}No catálogo: <b data-campo="disponibilidade">${n.disponibilidade}</b></span></p>
  <p>A página de prazos de entrega informa: “<span data-campo="itens-avulsos-suspensos">${n.literal}</span>” Confirme com o consultor antes de comprar.</p>
</div>`;
}

function seletorTamanho(p, tamanhos) {
  const comOpcao = tamanhos.filter((t) => t.origem === 'opcao' && t.rotulo);
  if (!comOpcao.length) {
    const t = tamanhos[0];
    if (!t) return html``;
    return html`<div class="seletor seletor--fixo"${attrs({ 'data-seletor-fixo': '', ...dadosTamanho(t), 'data-rotulo': rotuloTam(t) })}>
  <p class="monte__rot">Medidas da ficha</p>
  <p class="seletor__fixo num" data-campo="tamanho-ficha">${t.rotulo_ficha}</p>
</div>`;
  }
  const semMedida = plantasSemTamanho(p).length ? 'Sem planta desta medida' : 'Sem planta publicada';
  return html`<fieldset class="seletor" data-seletor>
  <legend class="monte__rot">Tamanho <span class="monte__n num">${comOpcao.length === 1 ? '1 opção' : `${comOpcao.length} opções`}</span></legend>
  <div class="seletor__lista">${comOpcao.map((t, i) => {
    const pl = plantaDoTamanho(p, t);
    return html`<label class="seletor__op">
      <input class="seletor__in" type="radio" name="tamanho"${attrs({ value: t.value_id || String(i), checked: i === 0, 'data-i': i, 'data-preco': t.preco_adicional || 0, 'data-rotulo': t.rotulo, ...dadosTamanho(t) })}>
      <span class="seletor__cartao">
        <span class="seletor__rot num" data-campo="tamanho-rotulo">${t.rotulo}</span>
        <span class="seletor__meta">${pl ? html`<span class="selo selo--planta">Planta oficial</span>` : html`<span class="selo selo--sem">${semMedida}</span>`}${t.ficha ? html`<span class="selo selo--confirmar">Medida a confirmar</span>` : ''}</span>
      </span>
    </label>`;
  })}</div>
</fieldset>`;
}

function grupoRadio(o, gi) {
  const nome = `op-${o.option_id || gi}`;
  const vazio = o.opcao_vazia_exibida;
  const papel = papelGrupo(o.titulo);
  return html`<fieldset class="monte__grupo" data-grupo="${papel}" data-titulo="${nomeGrupo(o.titulo)}">
  <legend class="monte__rot">${nomeGrupo(o.titulo)}${o.obrigatorio ? '' : html` <span class="monte__n">opcional</span>`}</legend>
  <div class="monte__chips">
    ${vazio ? html`<label class="chip-op"><input type="radio" name="${nome}" value=""${attrs({ checked: Boolean(vazio.marcada_por_padrao), 'data-preco': 0, 'data-rotulo': vazio.rotulo_exibido })}><span>${vazio.rotulo_exibido}</span></label>` : ''}
    ${o.valores.map((v) => html`<label class="chip-op"><input type="radio" name="${nome}"${attrs({ value: v.value_id, 'data-preco': v.preco_adicional || 0, 'data-rotulo': v.rotulo_exibido })}><span data-campo="opcao-rotulo">${v.rotulo_exibido}</span></label>`)}
  </div>
</fieldset>`;
}

function grupoCheckbox(o, gi, { avulso, notaAquecedor }) {
  return html`<fieldset class="monte__grupo" data-grupo="adicionais" data-titulo="${nomeGrupo(o.titulo)}">
  <legend class="monte__rot">${nomeGrupo(o.titulo)} <span class="monte__n">opcionais</span></legend>
  <ul class="monte__adic" role="list">${o.valores.map((v) => {
    const nota = avulso && String(v.nome || v.rotulo_exibido).toLowerCase().includes(avulso.nomeOpcao)
      ? html`<span class="monte__nota">Avulso, este item está publicado por <span class="num">${avulso.prod.preco.por}</span>${avulso.prod.disponibilidade === 'Esgotado' ? ' e aparece como esgotado' : ''}. Confirme o valor com o consultor.</span>`
      : '';
    return html`<li><label class="adic">
      <input type="checkbox" name="op-${o.option_id || gi}"${attrs({ value: v.value_id, 'data-preco': v.preco_adicional || 0, 'data-rotulo': v.rotulo_exibido })}>
      <span class="adic__caixa" aria-hidden="true"></span>
      <span class="adic__t"><span data-campo="opcao-rotulo">${v.rotulo_exibido}</span>${nota}</span>
    </label></li>`;
  })}</ul>
  ${notaAquecedor ? html`<p class="monte__nota">Esta página publica mais de uma opção de aquecedor, com preços diferentes. Confirme com o consultor.</p>` : ''}
</fieldset>`;
}

/**
 * @param {object} p produto
 * @param {object} c contexto: { D, produtos, tamanhos, waCompra, abertura, urlAbs, esgotado, waEsgotado }
 */
export function decisao(p, c) {
  const { D, produtos, tamanhos, esgotado } = c;
  const outras = (p.opcoes_personalizaveis || []).filter((o) => !RE_TAMANHO.test(o.titulo));
  const avulso = avulsoDoAlerta(p, produtos);
  const t0 = tamanhos.find((t) => t.origem === 'opcao') || null;
  const total0 = formatBRL((p.preco.valores_numericos.finalPrice || 0) + (t0?.preco_adicional || 0));
  const temEscolha = outras.length > 0 || tamanhos.filter((t) => t.origem === 'opcao').length > 1;

  return html`<div class="decisao__in" data-sku="${p.sku}">
  <p class="etiqueta decisao__eti">${esgotado ? 'Disponibilidade' : 'Preço publicado'} · <span class="num" data-campo="data-coleta">${D.dataColeta}</span></p>
  ${precoBloco(p, { esgotado })}
  ${notaAvulsoSuspenso(p, D)}
  ${c.aposPreco || ''}
  <form class="monte" data-monte novalidate${attrs({
    'aria-label': 'Monte a sua',
    'data-nome': p.nome,
    'data-sku': p.sku,
    'data-preco': p.preco.valores_numericos.finalPrice,
    'data-url': c.urlAbs,
    'data-abertura': c.abertura,
    'data-coleta': D.dataColeta,
    'data-esgotado': esgotado ? '1' : null,
  })}>
    ${seletorTamanho(p, tamanhos)}
    ${temEscolha && outras.length ? html`<p class="monte__titulo">Monte a sua</p>` : ''}
    ${outras.map((o, gi) => (o.tipo === 'checkbox'
      ? grupoCheckbox(o, gi, { avulso, notaAquecedor: p.d_aquecedor_conflito && /adicionais|acess/i.test(o.titulo) })
      : grupoRadio(o, gi)))}
  </form>
  <div class="decisao__pe">
  ${esgotado ? '' : html`<div class="total" data-total-bloco>
      <p class="total__linha"><span class="total__rot">Total</span><output class="total__valor num" data-total aria-live="off">${total0}</output></p>
      <p class="total__nota">${NOTA_SOMA(D.dataColeta)}</p>
    </div>`}
  <div class="decisao__acoes">
    ${esgotado
      ? html`<a${attrs({ class: 'btn btn--whats btn--bloco', href: c.waEsgotado, target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'esgotado', 'data-sku': p.sku })}>${icone('whatsapp', { tamanho: 20 })}Perguntar disponibilidade</a>`
      : html`<a${attrs({ class: 'btn btn--whats btn--bloco', href: c.waCompra, target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'produto', 'data-wa-sync': 'venda', 'data-sku': p.sku, 'data-cta-compra': '' })}>${icone('whatsapp', { tamanho: 20 })}Comprar pelo WhatsApp</a>`}
    <div class="decisao__sec">
      <a class="decisao__link" href="${url('consultores.html')}" data-gaveta-abrir="gaveta-whats" data-gaveta-foco="consultores">${icone('pessoas', { tamanho: 18 })}Escolher meu consultor</a>
      <button class="decisao__link" type="button" data-comparar="${p.slug}" data-nome="${p.nome}" data-sku="${p.sku}" aria-pressed="false">${icone('comparar', { tamanho: 18 })}Comparar</button>
    </div>
  </div>
  </div>
</div>`;
}

/** Doca de compra fixa no celular (SPEC 6.2). Escondida até o bloco de preço sair da tela. */
export function doca(p, c) {
  const t0 = c.tamanhos.find((t) => t.origem === 'opcao') || null;
  const total0 = formatBRL((p.preco.valores_numericos.finalPrice || 0) + (t0?.preco_adicional || 0));
  return html`<div class="doca" data-doca hidden>
  <div class="doca__in">
    <p class="doca__info"><span class="doca__nome">${p.nome}</span><span class="doca__det num">${c.esgotado ? html`<span>${p.disponibilidade}</span>` : html`<b data-doca-total>${total0}</b>`}${t0 ? html`<span class="doca__tam" data-doca-tam>${t0.rotulo}</span>` : ''}</span></p>
    <div class="doca__acoes">
      ${c.esgotado
        ? html`<a${attrs({ class: 'btn btn--whats doca__btn', href: c.waEsgotado, target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'doca_esgotado', 'data-sku': p.sku })}>${icone('whatsapp', { tamanho: 18 })}Perguntar</a>`
        : html`<a${attrs({ class: 'btn btn--whats doca__btn', href: c.waCompra, target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'doca', 'data-wa-sync': 'venda', 'data-sku': p.sku })}>${icone('whatsapp', { tamanho: 18 })}<span>Comprar<span class="doca__longo"> pelo WhatsApp</span></span></a>`}
      <a class="doca__cons" href="${url('consultores.html')}" data-gaveta-abrir="gaveta-whats" data-gaveta-foco="consultores" aria-label="Escolher meu consultor">${icone('pessoas', { tamanho: 18 })}<span class="doca__cons-t" aria-hidden="true">Consultor</span></a>
    </div>
  </div>
</div>`;
}
