// Ficha técnica (SPEC 9.3, seção 9): valores literais de especificacoes, cada um com data-campo e o
// rótulo literal em data-ficha. Conflito da fonte nunca é resolvido: quando o nome do modelo e a
// ficha divergem, ou a ficha e a opção de tamanho divergem, as duas versões aparecem com nota.
import { html } from '../../build/lib/html.mjs';
import { rotuloTam } from './planta.mjs';

// Apresentação do rótulo literal (o dado continua literal em data-ficha).
const ROTULO = { Configuracao: 'Configuração', frete: 'Frete' };
export const rotuloFicha = (k) => ROTULO[k] || k;
const ORDEM = ['Forma', 'Lugares', 'Material', 'Configuracao', 'Comprimento', 'Largura', 'Profundidade', 'Altura', 'frete'];

function medidaFicha(f) {
  return ['Comprimento', 'Largura', 'Profundidade', 'Altura'].filter((k) => f[k]).map((k) => f[k]).join(' x ');
}

export function ficha(p, tamanhos) {
  const e = p.especificacoes || {};
  const chaves = [...ORDEM.filter((k) => k in e), ...Object.keys(e).filter((k) => !ORDEM.includes(k))];
  const conflitos = new Map((p.d_conflito_nome_ficha || []).map((c) => [c.campo, c]));
  const divergentes = tamanhos.filter((t) => t.ficha && t.rotulo);
  const comOpcao = tamanhos.filter((t) => t.origem === 'opcao' && t.rotulo);
  return html`<div class="ficha">
  <table class="ficha__tabela">
    <caption class="vh">Ficha técnica da ${p.nome}</caption>
    <tbody>
      <tr><th scope="row">Nº de catálogo</th><td class="num" data-campo="sku">${p.sku}</td></tr>
      ${chaves.map((k) => {
        const cf = conflitos.get(k);
        return html`<tr${cf ? html` class="ficha__conflito"` : ''}><th scope="row">${rotuloFicha(k)}</th><td><span class="num" data-campo="ficha-valor" data-ficha="${k}">${e[k]}</span>${cf
          ? html`<span class="ficha__nota">O nome do modelo diz ${cf.nome_diz} e a ficha diz ${cf.ficha_diz}. Confirme com o consultor.</span>`
          : ''}</td></tr>`;
      })}
      ${comOpcao.length ? html`<tr><th scope="row">${comOpcao.length > 1 ? 'Tamanhos vendidos' : 'Tamanho vendido'}</th><td><ul class="ficha__tams num" role="list">${comOpcao.map((t) => html`<li>${rotuloTam(t)}</li>`)}</ul></td></tr>` : ''}
    </tbody>
  </table>
  ${divergentes.map((t) => html`<p class="ficha__alerta" role="note"><b>Medida a confirmar.</b> A ficha informa <span class="num" data-campo="tamanho-ficha">${medidaFicha(t.ficha)}</span> e a opção de tamanho informa <span class="num">${t.rotulo}</span>. Confirme com o consultor.</p>`)}
</div>`;
}
