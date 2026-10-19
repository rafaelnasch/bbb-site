// Consultores (SPEC 4 linha 7 e 9.6): os 8 números de venda na ordem do rodapé do site atual,
// rotulados "Consultor 1" a "Consultor 8" com o número formatado (nomes só com autorização da empresa).
// A mensagem é a abertura literal de venda de contatos.json; o link funciona sem JavaScript.
import { html, attrs } from '../build/lib/html.mjs';
import { url } from '../build/lib/url.mjs';
import { icone } from '../build/lib/icons.mjs';
import { linhaCanal, horarioEmLinhas } from './parts/gaveta-whats.mjs';
import { topo, inicio, pagina } from './parts/inst.mjs';

export function paginas(ctx) {
  const D = ctx.dados;
  const cons = D.consultores();
  const trilha = [inicio, { nome: 'Consultores', path: 'consultores.html' }];
  const corpo = html`${topo({ trilha, etiqueta: 'Atendimento de venda', h1: 'Escolha o seu consultor', lead: html`<span class="num">${cons.length}</span> consultores de venda da fábrica atendem pelo WhatsApp. Escolha um número e a conversa abre com a mensagem de compra pronta.` })}
<section class="dia inst cons" aria-label="Consultores de venda">
  <div class="wrap">
    <ol class="cons__grade" role="list">${cons.map((c, i) => html`<li data-reveal style="--i:${i % 4}"><a${attrs({
      class: 'cons__cartao',
      href: D.wa(c.papel),
      target: '_blank',
      rel: 'noopener',
      'data-wa-papel': c.papel,
      'data-wa-contexto': 'pagina_consultores',
      'data-wa-sync': 'venda',
      'data-campo': 'contato-numero',
    })}><span class="cons__n num" aria-hidden="true">${String(c.ordem_rodape ?? i + 1).padStart(2, '0')}</span><span class="cons__t">Consultor ${c.ordem_rodape ?? i + 1}</span><span class="cons__num num" data-campo="contato-display">${c.display}</span><span class="cons__ir">${icone('whatsapp', { tamanho: 18 })}Conversar</span></a></li>`)}</ol>
    <div class="inst-colunas inst-colunas--topo cons__mais">
      <section class="inst-bloco" aria-labelledby="cons-outros"><h2 id="cons-outros" class="inst-h2">Prefere o número principal?</h2>
        <ul class="canais">${linhaCanal('venda_principal', { contexto: 'pagina_consultores' })}${linhaCanal('ajuda', { contexto: 'pagina_consultores' })}</ul></section>
      <section class="inst-bloco" aria-labelledby="cons-hor"><h2 id="cons-hor" class="inst-h2">Horário de atendimento</h2>
        <p data-campo="empresa-horario">${horarioEmLinhas(D.empresa.horario.literal)}</p>
        <p><a class="link" href="${url('contacts.html')}">Todos os canais de atendimento</a> · <a class="link" href="${url('lojas/loja-showrooms.html')}">Lojas</a></p></section>
    </div>
  </div>
</section>`;
  return [pagina(ctx, {
    saida: 'consultores.html',
    titulo: 'Consultores de venda pelo WhatsApp | Banheiras Bom Banho',
    descricao: `Escolha um dos ${cons.length} consultores de venda da Banheiras Bom Banho e fale pelo WhatsApp sobre banheiras, spas e ofurôs, com a mensagem de compra pronta.`,
    corpo,
    trilha,
    tipo: 'ContactPage',
  })];
}
