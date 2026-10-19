// Template literal `html` que escapa por padrão (SPEC 1). Tudo que é interpolado vira texto,
// a não ser que já seja HTML confiável (resultado de outro `html`, de `raw()` ou de ícone SVG).

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export class Html {
  constructor(s) {
    this.s = String(s);
  }
  toString() {
    return this.s;
  }
}

/** Escapa texto para HTML (conteúdo e atributos entre aspas). */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Marca uma string como HTML confiável. Uso restrito a SVG de ícone e marcação gerada no build. */
export function raw(s) {
  return new Html(s ?? '');
}

function valor(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Html) return v.s;
  if (Array.isArray(v)) return v.map(valor).join('');
  return esc(v);
}

/** html`<p>${texto}</p>` → Html. Arrays são concatenados; null, undefined e booleanos somem. */
export function html(partes, ...vals) {
  let out = partes[0];
  for (let i = 0; i < vals.length; i++) out += valor(vals[i]) + partes[i + 1];
  return new Html(out);
}

/**
 * Atributos a partir de um objeto: { href, 'data-x': 1, hidden: true, alt: '' }.
 * false/null/undefined somem; true vira atributo booleano; o resto é escapado.
 */
export function attrs(obj) {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || v === false) continue;
    out.push(v === true ? ` ${k}` : ` ${k}="${esc(v)}"`);
  }
  return new Html(out.join(''));
}

/** Converte Html ou string em string final. */
export function render(h) {
  return h instanceof Html ? h.s : String(h ?? '');
}
