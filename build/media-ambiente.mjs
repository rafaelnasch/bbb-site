// Fotos de ambiente (Rafael, 21/10/2026): a peça real instalada num ambiente, tratada no Higgsfield a partir da
// foto publicada pela empresa. A peça foi conferida contra o original (formato, jatos, alças, apoio de cabeça,
// ralo e comandos); o ambiente é ilustrativo e a página diz isso ("Imagem ilustrativa").
// Roda no Mac; fonte em _recon/hf/ambiente/<id>.png (fora do git), saída versionada em public/media/ambiente/.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { paths } from '../site.config.mjs';
import { AMBIENTES } from './lib/ambientes.mjs';

const LARGURAS = [640, 960, 1280, 1600];
const out = join(paths.public, 'media', 'ambiente');
mkdirSync(out, { recursive: true });
const manifest = {};
for (const [id, a] of Object.entries(AMBIENTES)) {
  const src = join(paths.recon, 'hf', 'ambiente', `${id}.png`);
  if (!existsSync(src)) continue;
  const m = await sharp(src).metadata();
  const ls = LARGURAS.filter((w) => w <= m.width);
  const fontes = { 'image/avif': [], 'image/webp': [] };
  for (const w of ls) {
    const h = Math.round((m.height * w) / m.width);
    const base = sharp(src).resize({ width: w });
    await base.clone().avif({ quality: 52, effort: 6 }).toFile(join(out, `${id}-${w}.avif`));
    await base.clone().webp({ quality: 80, effort: 6 }).toFile(join(out, `${id}-${w}.webp`));
    fontes['image/avif'].push([`media/ambiente/${id}-${w}.avif`, w, h]);
    fontes['image/webp'].push([`media/ambiente/${id}-${w}.webp`, w, h]);
  }
  const lq = await sharp(src).resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
  manifest[id] = { slug: a.slug, largura: m.width, altura: m.height, fontes, lqip: `data:image/webp;base64,${lq.toString('base64')}` };
  console.log(id, ls.join('/'));
}
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
