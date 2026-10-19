// Fotos da fábrica para a home (SPEC 9.1, seção 6): imagens reais da galeria "CONHEÇA NOSSA FÁBRICA"
// (empresa.json: galeria_fabrica_e_projetos), só as da fábrica em si. Rodado no Mac; a saída é
// versionada em public/media/fabrica/ (o CI usa --skip-media).
//
//  - O original é baixado uma vez da URL publicada pela empresa para _recon/images-fabrica/ (fora do
//    git). Sem rede e sem o arquivo, a foto fica de fora: nada é gerado no lugar.
//  - Por foto: AVIF (q50) e WebP (q78) em 400 e 800 px, nunca acima do original; LQIP de 24 px.
//  - Nome descritivo pela posição (fabrica-<n>-<w>); o nome do arquivo original não é usado.
// Nada é ampliado, recortado ou gerado: só redução e recompressão (SPEC 0.8).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { paths } from '../site.config.mjs';

const OUT = join(paths.public, 'media', 'fabrica');
const ORIG = join(paths.recon, 'images-fabrica');
const LARGURAS = [400, 800];
// Fotos da fábrica: as nove primeiras da galeria, cujo texto alternativo publicado fala da fábrica
// (as seguintes são fachadas de showroom e projetos de clientes).
const QUANTAS = 9;
// A 7ª mostra um telefone pintado no muro que não está entre os contatos ativos: fica de fora.
const EXCLUIR = new Set([7]);

const empresa = JSON.parse(readFileSync(join(paths.data, 'empresa.json'), 'utf8'));
const galeria = empresa.galeria_fabrica_e_projetos;
const fonteGaleria = Array.isArray(galeria.source_url) ? galeria.source_url[0] : galeria.source_url;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(ORIG, { recursive: true });

async function baixar(src, destino) {
  if (existsSync(destino)) return true;
  try {
    const r = await fetch(src, { headers: { 'user-agent': 'bbb-site build (fotos da fabrica)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch (e) {
    console.warn(`media-fabrica: sem ${src} (${e.message}); a foto fica de fora`);
    return false;
  }
}

const fotos = [];
for (const [i, img] of galeria.imagens.slice(0, QUANTAS).entries()) {
  const n = i + 1;
  if (EXCLUIR.has(n)) continue;
  const orig = join(ORIG, `${String(n).padStart(2, '0')}${img.src.match(/\.(jpe?g|png|webp)$/i)?.[0] || '.jpg'}`);
  if (!(await baixar(img.src, orig))) continue;
  const buf = readFileSync(orig);
  const md = await sharp(buf).metadata();
  const fontes = { 'image/avif': [], 'image/webp': [] };
  let maior = null;
  const ls = [...new Set(LARGURAS.filter((x) => x <= md.width).concat(md.width < LARGURAS[0] ? [md.width] : []))];
  for (const l of ls) {
    const h = Math.round((md.height / md.width) * l);
    const base = `fabrica-${n}-${l}`;
    await sharp(buf).resize({ width: l }).avif({ quality: 50 }).toFile(join(OUT, `${base}.avif`));
    await sharp(buf).resize({ width: l }).webp({ quality: 78 }).toFile(join(OUT, `${base}.webp`));
    fontes['image/avif'].push([`media/fabrica/${base}.avif`, l]);
    fontes['image/webp'].push([`media/fabrica/${base}.webp`, l]);
    maior = { l, h };
  }
  const lqip = await sharp(buf).resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
  fotos.push({
    n,
    largura: maior.l,
    altura: maior.h,
    alt_publicado: img.alt ?? null,
    fontes,
    lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    sha1: createHash('sha1').update(buf).digest('hex'),
    fonte: img.src,
  });
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  sobre: 'Fotos da fábrica da galeria publicada pela empresa, reduzidas e recomprimidas (sem ampliação, recorte ou geração).',
  titulo_publicado: galeria.titulo,
  pagina_fonte: fonteGaleria,
  coletado_em: empresa.coletado_em ?? null,
  fotos,
}, null, 1));
console.log(`media-fabrica: ${fotos.length} fotos em public/media/fabrica/`);
