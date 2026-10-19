// Rodapé (SPEC 10.4): fábrica sem CEP, fixo, horário, e-mails, 4 CNPJs literais, canais por assunto,
// os 8 consultores, as 9 lojas, redes, links institucionais e a data da coleta.
import { html, attrs } from '../../build/lib/html.mjs';
import { icone } from '../../build/lib/icons.mjs';
import { url } from '../../build/lib/url.mjs';
import { dados } from '../../build/lib/dados.mjs';
import { linhaCanal, listaConsultores } from './gaveta-whats.mjs';
import { MENU, COLECOES_SECUNDARIAS } from './header.mjs';

// Páginas da SPEC 4 (tabela, linhas 8 a 11). Os rótulos são nomes de navegação, não dados da empresa.
const COMPRA_E_SUPORTE = [
  ['Como comprar', 'como-comprar.html'],
  ['Prazo de entrega', 'prazo-de-entrega.html'],
  ['Rastreio', 'rastreio.html'],
  ['Perguntas frequentes', 'perguntas-frequentes.html'],
  ['Manual do usuário e instalação', 'manual-usuario-instalacao.html'],
  ['Tutoriais', 'tutoriais.html'],
  ['Instaladores', 'instaladores.html'],
  ['Devolução e reembolso', 'politica-devolucao-reembolso.html'],
  ['Consultores', 'consultores.html'],
];
const A_EMPRESA = [
  ['Sobre nós', 'lojas/sobre-nos.html'],
  ['Loja da fábrica', 'loja-fabrica-de-banheiras.html'],
  ['Banheiras instaladas', 'banheiras-instaladas.html'],
  ['INMETRO', 'inmetro.html'],
  ['Política da qualidade', 'politica-da-qualidade.html'],
  ['Representantes credenciados', 'representantes-credenciados.html'],
  ['Seja revendedor', 'seja-revendedor.html'],
  ['Vendas corporativas', 'vendas-corporativas.html'],
  ['Privacidade', 'politica-de-privacidade.html'],
  ['Termos de uso', 'termos-de-uso.html'],
  ['Segurança', 'seguranca.html'],
  ['Mapa do site', 'mapa-do-site.html'],
];
const GUIAS = [
  ['Que banheira cabe no meu espaço?', 'guia/banheira-por-tamanho.html'],
  ['Spa para quantas pessoas?', 'guia/spa-por-lugares.html'],
  ['Gel coat ou acrílico?', 'guia/gel-coat-ou-acrilico.html'],
  ['Básica ou Completa?', 'guia/basica-ou-completa.html'],
];
const ICONE_REDE = { Instagram: 'instagram', Facebook: 'facebook', 'Twitter/X': 'x_rede', Pinterest: 'pinterest', YouTube: 'youtube' };
const NOME_REDE = { 'Twitter/X': 'X (Twitter)' };

const links = (pares) => html`<ul class="rodape__lista">${pares.map(([nome, p]) => html`<li><a href="${url(p)}">${nome}</a></li>`)}</ul>`;

export function rodape() {
  const D = dados();
  const E = D.empresa;
  const colecoes = [...MENU.filter((m) => m.colecao).map((m) => m.colecao), ...COLECOES_SECUNDARIAS]
    .map((p) => D.catPorPath.get(p))
    .filter(Boolean);
  const horario = String(E.horario.literal).split(/\s*\|\s*/);
  const redes = (E.redes || []).filter((r) => r.principal);
  return html`<footer class="rodape sala" id="rodape">
  <div class="wrap">
    <section class="rodape__cta" aria-labelledby="rf-cta" data-reveal>
      <div>
        <p class="etiqueta etiqueta--linha">Atendimento pelo WhatsApp</p>
        <h2 class="rodape__titulo" id="rf-cta" style="margin-top:18px">Fale com a fábrica e escolha a sua peça com um consultor.</h2>
      </div>
      <div class="rodape__acoes">
        <a${attrs({ class: 'btn btn--whats', href: D.wa('venda_principal'), target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'rodape', 'data-wa-sync': 'venda', 'data-campo': 'contato-numero' })}>${icone('whatsapp', { tamanho: 20 })}Comprar pelo WhatsApp</a>
        <a class="btn btn--fantasma" href="${url('consultores.html')}" data-gaveta-abrir="gaveta-whats" data-gaveta-foco="consultores">${icone('pessoas', { tamanho: 18 })}Escolher meu consultor</a>
      </div>
    </section>

    <div class="rodape__grade">
      <section class="rodape__col rodape__col--larga" aria-labelledby="rf-canais">
        <h2 class="rodape__h" id="rf-canais">Canais por assunto</h2>
        <ul class="canais">
          ${linhaCanal('venda_principal', { contexto: 'rodape', titulo: 'Compra' })}
          ${linhaCanal('ajuda', { contexto: 'rodape', titulo: 'Ajuda' })}
          ${linhaCanal('rastreio', { contexto: 'rodape', titulo: 'Rastreio' })}
          ${linhaCanal('sac', { contexto: 'rodape' })}
        </ul>
        <h3 class="rodape__h" style="margin-top:28px">Consultores de venda</h3>
        ${listaConsultores({ contexto: 'rodape_consultores' })}
      </section>
      <nav class="rodape__col" aria-labelledby="rf-col">
        <h2 class="rodape__h" id="rf-col">Coleções</h2>
        <ul class="rodape__lista">${colecoes.map((c) => html`<li><a href="${url(c.d_path)}">${c.nome} <span class="num" data-campo="contagem-por-tipo">${c.total_exibido}</span></a></li>`)}</ul>
        <h2 class="rodape__h" style="margin-top:28px">Guias</h2>
        ${links(GUIAS)}
      </nav>
      <nav class="rodape__col" aria-labelledby="rf-lojas">
        <h2 class="rodape__h" id="rf-lojas">Lojas e showrooms</h2>
        <ul class="rodape__lista">${D.lojas.map((l) => html`<li><a href="${url(`lojas/loja-showrooms.html#${l.ancora}`)}">${l.cidade} <span class="num">${l.uf}</span></a></li>`)}</ul>
      </nav>
      <nav class="rodape__col" aria-labelledby="rf-suporte">
        <h2 class="rodape__h" id="rf-suporte">Compra e suporte</h2>
        ${links(COMPRA_E_SUPORTE)}
      </nav>
      <nav class="rodape__col" aria-labelledby="rf-empresa">
        <h2 class="rodape__h" id="rf-empresa">A empresa</h2>
        ${links(A_EMPRESA)}
      </nav>
    </div>

    <div class="rodape__fabrica">
      <address class="rodape__dado">${icone('fabrica')}<span><span class="vh">Endereço da fábrica: </span><a href="${E.mapa_fabrica.link}" target="_blank" rel="noopener" data-campo="empresa-endereco">${E.endereco_fabrica}</a></span></address>
      <p class="rodape__dado">${icone('telefone')}<span><span class="vh">Telefone fixo: </span><a class="num" href="${E.telefone_fixo.tel}" data-campo="empresa-telefone">${E.telefone_fixo.display}</a></span></p>
      <p class="rodape__dado">${icone('relogio')}<span data-campo="empresa-horario">${horario.map((h, i) => html`${i ? html`<br>` : ''}${h}`)}</span></p>
      <div class="rodape__dado">${icone('email')}<ul>${E.emails.map((m) => html`<li><a href="mailto:${m.email}" data-campo="empresa-email">${m.email}</a></li>`)}</ul></div>
    </div>

    <div class="rodape__base">
      <ul class="rodape__redes">${redes.map((r) => html`<li><a href="${r.url}" target="_blank" rel="noopener" aria-label="${NOME_REDE[r.rede] || r.rede}">${icone(ICONE_REDE[r.rede] || 'externo', { tamanho: 18 })}</a></li>`)}</ul>
      <div>
        <p class="rodape__coleta">Preços e medidas publicados pela empresa, coletados em <span data-campo="data-coleta">${D.dataColeta}</span>.</p>
        <ul class="rodape__cnpj" style="margin-top:10px">${E.cnpjs_rodape.map((c) => html`<li data-campo="empresa-cnpj">${c.literal}</li>`)}</ul>
      </div>
    </div>
    <p class="rodape__marca" aria-hidden="true">${E.nome}</p>
  </div>
</footer>`;
}
