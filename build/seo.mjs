// Arquivos de rastreio sobre dist/ (SPEC 11.3). Base mínima para o build rodar ponta a ponta:
// robots.txt e sitemap.xml. O bloco de SEO/GEO/AEO (SPEC 17, item 9) acrescenta sitemaps por tipo,
// llms.txt, llms-full.txt e dados abertos neste mesmo arquivo.
//
// INDEXAR=false (padrão da prévia, decisão do dono do projeto): robots com "Disallow: /" e nenhuma
// URL no sitemap, porque todas as páginas saem com noindex. INDEXAR=true: só entram páginas sem noindex.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { paths, SITE_URL, INDEXAR } from '../site.config.mjs';
import { abs } from './lib/url.mjs';

function htmls(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...htmls(p));
    else if (n.endsWith('.html')) out.push(p);
  }
  return out;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function gerarSeo(dist = paths.dist) {
  const urls = [];
  for (const f of htmls(dist)) {
    const h = readFileSync(f, 'utf8');
    if (/<meta name="robots" content="[^"]*noindex/.test(h)) continue;
    if (/<meta http-equiv="refresh"/i.test(h)) continue;
    const can = /<link rel="canonical" href="([^"]+)">/.exec(h)?.[1];
    const propria = abs(relative(dist, f).replace(/(^|\/)index\.html$/, '$1'));
    if (can && can !== propria) continue;
    urls.push(propria);
  }
  urls.sort();
  writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
  const robots = INDEXAR
    ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
  writeFileSync(join(dist, 'robots.txt'), robots);
  return { urls: urls.length, indexar: INDEXAR };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = gerarSeo();
  console.log(`seo: robots.txt (${r.indexar ? 'indexa' : 'Disallow: /'}) e sitemap.xml com ${r.urls} URLs`);
}
