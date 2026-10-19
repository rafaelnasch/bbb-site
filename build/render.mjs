// data/ + templates → dist/ (SPEC 2 e 4). Os templates de página são plugáveis: cada arquivo de
// templates/<nome>.mjs da lista REGISTRO que existir e exportar `paginas(ctx)` é renderizado.
// `paginas` devolve [{ saida: 'banheiras.html', html }]; o HTML normalmente vem de ctx.layout({...}).
//
// Uso: node build/render.mjs [--skip-media] [--sistema]
//   --sistema  inclui as páginas de conferência do sistema visual (_sistema.html), fora do sitemap.
import { rmSync, mkdirSync, cpSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { paths, SITE_URL, BASE_PATH, INDEXAR, CNAME } from '../site.config.mjs';
import { construirAssets } from './lib/assets.mjs';
import { prepararMidia, copiasPendentes } from './lib/midia.mjs';
import { dados } from './lib/dados.mjs';
import { url, abs } from './lib/url.mjs';
import { configurarLayout, layout } from '../templates/layout.mjs';

export const REGISTRO = [
  'home', 'colecao', 'produto', 'escolher', 'comparar', 'busca', 'consultores', 'guia',
  'lojas', 'institucional', 'faq', 'ponte', '404',
];

const SISTEMA = process.argv.includes('--sistema') || process.env.SISTEMA === '1';

export async function renderizar({ sistema = SISTEMA, dist = paths.dist } = {}) {
  const t0 = Date.now();
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  // public/ vai inteiro (mídia pré-gerada e versionada); os .gitkeep ficam de fora.
  cpSync(paths.public, dist, { recursive: true, filter: (src) => !src.endsWith('.gitkeep') });

  const assets = construirAssets({ dist });
  configurarLayout(assets);
  await prepararMidia();

  const D = dados();
  const ctx = { dados: D, layout, url, abs, assets, SITE_URL, BASE_PATH, INDEXAR };
  const nomes = [...REGISTRO, ...(sistema ? ['sistema'] : [])];
  const geradas = [];
  for (const nome of nomes) {
    const arq = join(paths.templates, `${nome}.mjs`);
    if (!existsSync(arq)) continue;
    const mod = await import(pathToFileURL(arq).href);
    if (typeof mod.paginas !== 'function') continue;
    for (const pg of await mod.paginas(ctx)) {
      if (!pg?.saida || typeof pg.html !== 'string') throw new Error(`templates/${nome}.mjs devolveu página inválida`);
      const destino = join(dist, pg.saida);
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, pg.html);
      geradas.push(pg.saida);
    }
  }

  // Fotos provisórias pedidas pelos templates (só no Mac, enquanto a mídia final não chega).
  for (const [rel, origem] of copiasPendentes()) {
    const destino = join(dist, rel);
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(origem, destino);
  }

  writeFileSync(join(dist, '.nojekyll'), '');
  if (CNAME) writeFileSync(join(dist, 'CNAME'), `${CNAME}\n`);
  if (!existsSync(join(dist, 'site.webmanifest'))) {
    writeFileSync(join(dist, 'site.webmanifest'), JSON.stringify({
      name: D.empresa.nome,
      short_name: D.empresa.alternate_name || D.empresa.nome,
      lang: 'pt-BR',
      start_url: url(''),
      scope: url(''),
      display: 'browser',
      background_color: '#071C2B',
      theme_color: '#071C2B',
      icons: [
        { src: url('brand/favicon-192.png'), sizes: '192x192', type: 'image/png' },
        { src: url('brand/favicon-32.png'), sizes: '32x32', type: 'image/png' },
      ],
    }, null, 2));
  }

  const r = assets.relatorio;
  console.log(`render: ${geradas.length} páginas em ${Date.now() - t0} ms · CSS crítico ${r.css_critico_bytes} B · site.css ${r.css_site_gzip} B gzip · núcleo ${r.nucleo_gzip} B gzip · inline ${r.inline_gzip} B gzip · provisórias ${copiasPendentes().length}`);
  return { geradas, assets };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  renderizar().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
