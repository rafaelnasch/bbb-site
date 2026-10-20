// Barra superior, cabeçalho e menu do celular (SPEC 6.1). Contagens lidas de categorias.json.
import { html, attrs } from '../../build/lib/html.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { url } from '../../build/lib/url.mjs';
import { dados } from '../../build/lib/dados.mjs';
import { fotoProduto } from '../../build/lib/midia.mjs';
import { picture } from './foto.mjs';
import { linhaCanal } from './gaveta-whats.mjs';

// Menu principal (SPEC 6.1): Escolher minha banheira, Banheiras, Spas, Ofurôs, Lojas, Atendimento.
// `colecao` liga a contagem real (total_exibido) da categoria.
export const MENU = Object.freeze([
  { nome: 'Escolher minha banheira', path: 'escolher.html', destaque: true },
  { nome: 'Banheiras', path: 'banheiras.html', colecao: 'banheiras.html' },
  { nome: 'Spas', path: 'spas.html', colecao: 'spas.html' },
  { nome: 'Ofurôs', path: 'ofuros.html', colecao: 'ofuros.html' },
  { nome: 'Lojas', path: 'lojas/loja-showrooms.html' },
  { nome: 'Atendimento', path: 'contacts.html' },
]);

// Coleções secundárias no menu do celular e no rodapé (só as que existem em categorias.json).
export const COLECOES_SECUNDARIAS = Object.freeze(['sauna.html', 'acessorios.html', 'lancamentos.html', 'kids.html', 'pets.html']);

function atual(path, ativo) {
  return ativo && (ativo === path || ativo.startsWith(path.replace(/\.html$/, '/'))) ? 'page' : null;
}

function contagemTexto(n) {
  return n == null ? null : `${n} ${n === 1 ? 'item' : 'itens'} no catálogo`;
}

/** movimento: a página tem vídeo em loop, água ou vapor; só então o botão de pausar existe (WCAG 2.2.2). */
export function barraTopo({ movimento = false } = {}) {
  const D = dados();
  const fabrica = D.lojas.find((l) => l.n === 1) || D.lojas[0];
  const fixo = D.empresa.telefone_fixo;
  return html`<div class="topo" role="region" aria-label="Contato rápido">
  <div class="wrap topo__in">
    <p class="topo__local">${icone('local', { tamanho: 16 })}<span>Fábrica em ${fabrica.cidade}, ${fabrica.uf}</span></p>
    <div class="topo__acoes">
      <a class="topo__fixo num" href="${fixo.tel}" data-campo="empresa-telefone">${icone('telefone', { tamanho: 15 })}${fixo.display}</a>
      ${movimento ? html`<button class="topo__mov" type="button" data-movimento aria-pressed="false" aria-label="Pausar movimento" title="Pausar movimento"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="topo__mov-p" d="M9 5v14M15 5v14"/><path class="topo__mov-r" d="m8 5 11 7-11 7z"/></svg><span class="topo__mov-t">Pausar</span></button>` : ''}
      <a${attrs({ class: 'topo__ajuda', href: D.wa('ajuda'), target: '_blank', rel: 'noopener', 'data-wa-papel': 'ajuda', 'data-wa-contexto': 'barra_superior', 'data-campo': 'contato-numero' })}>${icone('whatsapp', { tamanho: 15 })}Preciso de ajuda</a>
    </div>
  </div>
</div>`;
}

export function cabecalho({ ativo = null, sobre = false } = {}) {
  const D = dados();
  const itens = MENU.map((m) => {
    if (m.destaque) {
      return html`<li><a class="cab__escolher" href="${url(m.path)}"${attrs({ 'aria-current': atual(m.path, ativo) })}>${icone('regua', { tamanho: 16 })}${m.nome}</a></li>`;
    }
    return html`<li><a href="${url(m.path)}"${attrs({ 'aria-current': atual(m.path, ativo) })}>${m.nome}</a></li>`;
  });
  return html`<header class="cab${sobre ? ' cab--sobre' : ''}">
  <div class="wrap cab__in">
    <a class="cab__logo" href="${url('')}"><img src="${url('brand/logo-bbb-azul-h40.png')}" srcset="${url('brand/logo-bbb-azul-h40.png')} 1x, ${url('brand/logo-bbb-azul-oficial-206x99.png')} 2x" width="83" height="40" alt="Banheiras Bom Banho, página inicial"></a>
    <nav class="cab__nav" aria-label="Principal"><ul>${itens}</ul></nav>
    <div class="cab__acoes">
      <a class="cab__icone" href="${url('busca.html')}" data-busca-abrir aria-label="Buscar no catálogo">${icone('busca', { tamanho: 22 })}</a>
      <a class="cab__icone cab__comparar" href="${url('comparar.html')}" data-comparar-contador data-n="0" aria-label="Comparar modelos: 0 de 3 escolhidos">${icone('comparar', { tamanho: 22 })}<span class="cab__badge num" data-comparar-n data-n="0" aria-hidden="true">0</span></a>
      <div class="cab__whats">
        <a${attrs({ class: 'btn btn--whats', href: D.wa('venda_principal'), target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'cabecalho', 'data-wa-sync': 'venda', 'data-campo': 'contato-numero', 'aria-label': 'Comprar pelo WhatsApp' })}>${icone('whatsapp', { tamanho: 20 })}<span>WhatsApp</span></a>
        <button class="cab__whats-mais" type="button" data-gaveta-abrir="gaveta-whats" aria-haspopup="dialog" aria-expanded="false" aria-label="Outros canais de atendimento" data-so-js>${icone('chevron-baixo', { tamanho: 18 })}</button>
      </div>
      <button class="cab__menu" type="button" data-gaveta-abrir="menu" aria-haspopup="dialog" aria-expanded="false" aria-label="Abrir menu" data-so-js>${icone('menu', { tamanho: 24 })}</button>
    </div>
  </div>
</header>`;
}

/** Menu do celular (gaveta em sala escura, com as três coleções ilustradas pela primeira peça real). */
export function gavetaMenu({ ativo = null } = {}) {
  const D = dados();
  let k = 0;
  const linhas = MENU.map((m, i) => {
    const cat = m.colecao ? D.catPorPath.get(m.colecao) : null;
    const n = cat?.total_exibido ?? null;
    const foto = (cat?.produtos || []).slice(0, 12).map((slug) => fotoProduto(slug, 1)).find(Boolean) || null;
    return html`<li style="--i:${k++}"><a href="${url(m.path)}"${attrs({ 'aria-current': atual(m.path, ativo) })}><span class="menu-lista__n num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span><span class="menu-lista__t">${m.nome}</span>${n != null ? html`<span class="menu-lista__c num" data-campo="contagem-por-tipo">${contagemTexto(n)}</span>` : ''}</span>${foto ? picture(foto, { classe: 'menu-lista__img', alt: '', sizes: '56px' }) : icone('seta-dir', { tamanho: 20 })}</a></li>`;
  });
  const sec = COLECOES_SECUNDARIAS.map((p) => D.catPorPath.get(p)).filter(Boolean);
  return html`<dialog class="gaveta gaveta--menu sala" id="menu" aria-label="Menu">
  <div class="gaveta__topo"><span class="etiqueta">Menu</span><button class="gaveta__fechar" type="button" data-gaveta-fechar aria-label="Fechar menu">${icone('x', { tamanho: 20 })}</button></div>
  <div class="gaveta__corpo">
    <nav aria-label="Menu principal"><ol class="menu-lista">${linhas}</ol>
    <ul class="menu-sec" style="--i:${k++}">${sec.map((c) => html`<li><a class="chip" href="${url(c.d_path)}">${c.nome} <span class="num" data-campo="contagem-por-tipo">${c.total_exibido}</span></a></li>`)}</ul></nav>
    <div class="menu-canais" style="--i:${k++}">
      <ul class="canais">${linhaCanal('venda_principal', { contexto: 'menu' })}${linhaCanal('ajuda', { contexto: 'menu' })}</ul>
      <button class="btn btn--fantasma" type="button" data-gaveta-abrir="gaveta-whats" data-gaveta-foco="consultores">${icone('pessoas', { tamanho: 18 })}Escolher meu consultor</button>
    </div>
  </div>
</dialog>`;
}
