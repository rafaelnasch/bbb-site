// Configuração de build (SPEC 1.1). Tudo vem do ambiente; nada de dado da empresa aqui.
//
// Decisão do dono do projeto (sobrepõe a SPEC 1.1): a prévia no GitHub Pages sai com
// INDEXAR=false por padrão (noindex,nofollow + Disallow: /), para não competir com o
// domínio atual da empresa. O SEO/GEO/AEO é gerado completo e liga com INDEXAR=true
// na virada de domínio (junto com SITE_URL, BASE_PATH e CNAME).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const env = process.env;

function bool(v, padrao) {
  if (v === undefined || v === '') return padrao;
  return /^(1|true|sim|yes|on)$/i.test(String(v).trim());
}

function semBarraFinal(s) {
  return String(s).replace(/\/+$/, '');
}

function basePath(v) {
  if (v === undefined) return '/bbb-site';
  const s = semBarraFinal(String(v).trim());
  if (s === '' || s === '/') return '';
  return s.startsWith('/') ? s : `/${s}`;
}

// DATA_COLETA nunca é digitada: vem de data/meta.json (gravado pelo normalize a partir de
// _recon/catalog.json.generated_at_source). A variável de ambiente só vale se o meta faltar.
function dataColeta() {
  const metaPath = join(ROOT, 'data', 'meta.json');
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (meta.data_coleta) return meta.data_coleta;
    } catch {
      /* cai para o ambiente */
    }
  }
  return env.DATA_COLETA || null;
}

export const SITE_URL = semBarraFinal(env.SITE_URL || 'https://rafaelnasch.github.io/bbb-site');
export const BASE_PATH = basePath(env.BASE_PATH);
export const INDEXAR = bool(env.INDEXAR, false);
export const CNAME = (env.CNAME || '').trim();
export const DATA_COLETA = dataColeta();
export const SKIP_MEDIA = bool(env.SKIP_MEDIA, false) || process.argv.includes('--skip-media');

export const ROBOTS_META = INDEXAR ? 'index,follow' : 'noindex,nofollow';

export const paths = {
  root: ROOT,
  recon: join(ROOT, '_recon'),
  data: join(ROOT, 'data'),
  public: join(ROOT, 'public'),
  dist: join(ROOT, 'dist'),
  cache: join(ROOT, '.cache'),
  templates: join(ROOT, 'templates'),
  src: join(ROOT, 'src'),
};

export default { SITE_URL, BASE_PATH, INDEXAR, CNAME, DATA_COLETA, SKIP_MEDIA, ROBOTS_META, paths };
