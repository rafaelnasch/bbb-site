// Trilha de navegação. itens: [{ nome, href? }] (href já passado por url()); o último é a página atual.
import { html, attrs } from '../../build/lib/html.mjs';

export function breadcrumb(itens, { classe = '' } = {}) {
  if (!itens?.length) return html``;
  const ult = itens.length - 1;
  return html`<nav class="trilha ${classe}" aria-label="Trilha de navegação"><ol>${itens.map((it, i) =>
    i === ult || !it.href
      ? html`<li${attrs({ class: i === ult ? 'trilha__atual' : null })}><span${attrs({ 'aria-current': i === ult ? 'page' : null })}>${it.nome}</span></li>`
      : html`<li><a href="${it.href}">${it.nome}</a></li>`,
  )}</ol></nav>`;
}
