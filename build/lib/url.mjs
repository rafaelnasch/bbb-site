// Todo link interno passa por url() (SPEC 1.1). Proibido link com "/" cru no template.
import { SITE_URL, BASE_PATH } from '../../site.config.mjs';

function limpo(path) {
  return String(path ?? '').replace(/^\/+/, '');
}

/** Link interno com BASE_PATH: url('banheiras.html') → '/bbb-site/banheiras.html'; url('') → '/bbb-site/'. */
export function url(path = '') {
  const p = limpo(path);
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) throw new Error(`url() recebeu endereço externo: ${path}`);
  return `${BASE_PATH}/${p}`;
}

/** Endereço absoluto (canonical, OG, sitemap, JSON-LD, mensagens de WhatsApp). */
export function abs(path = '') {
  return `${SITE_URL}/${limpo(path)}`;
}

/** Caminho da página (sem BASE_PATH) a partir do nome do arquivo de saída: 'index.html' → ''. */
export function caminhoDaSaida(saida) {
  const s = limpo(saida);
  return s === 'index.html' ? '' : s.replace(/(^|\/)index\.html$/, '$1');
}

export { SITE_URL, BASE_PATH };
