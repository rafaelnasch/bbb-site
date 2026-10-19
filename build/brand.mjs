// Marca (SPEC 5.5): roda no Mac e grava em public/brand/ (versionado). Nada é redesenhado:
// - logo azul oficial copiado como está;
// - logo claro para a sala escura: a mesma forma (canal alfa do PNG oficial) pintada de --porcelain;
// - favicons reduzidos a partir da gota oficial de 300 px (nunca ampliados);
// - imagem de compartilhamento padrão 1200 x 630, sala escura com o logo claro no tamanho natural,
//   usada só enquanto build/og.mjs não gera public/media/og/padrao.jpg.
import sharp from 'sharp';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../site.config.mjs';

const SRC = join(paths.recon, 'brand');
const OUT = join(paths.public, 'brand');
const LOGO = 'logo-bbb-azul-oficial-206x99.png';
const GOTA = 'favicon-bbb-gota-300x300.png';
const PORCELANA = { r: 0xf3, g: 0xf6, b: 0xf8 };
const SALA = { r: 0x07, g: 0x1c, b: 0x2b };

if (!existsSync(join(SRC, LOGO)) || !existsSync(join(SRC, GOTA))) {
  console.error('brand: _recon/brand ausente; nada a fazer (os arquivos versionados em public/brand continuam valendo).');
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

copyFileSync(join(SRC, LOGO), join(OUT, LOGO));

const meta = await sharp(join(SRC, LOGO)).metadata();
const alfa = await sharp(join(SRC, LOGO)).ensureAlpha().extractChannel('alpha').toBuffer();
await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: PORCELANA } })
  .joinChannel(alfa)
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, 'logo-bbb-claro-206x99.png'));

const gota = join(SRC, GOTA);
await sharp(gota).resize(32, 32).png({ compressionLevel: 9 }).toFile(join(OUT, 'favicon-32.png'));
await sharp(gota).resize(192, 192).png({ compressionLevel: 9 }).toFile(join(OUT, 'favicon-192.png'));
await sharp(gota)
  .resize(150, 150)
  .extend({ top: 15, bottom: 15, left: 15, right: 15, background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .flatten({ background: '#ffffff' })
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, 'apple-touch-icon.png'));

const logoClaro = await sharp(join(OUT, 'logo-bbb-claro-206x99.png')).toBuffer();
const W = 1200, H = 630;
const fundo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><radialGradient id="g" cx="50%" cy="0%" r="90%"><stop offset="0" stop-color="#E9B87C" stop-opacity=".12"/><stop offset=".55" stop-color="#0C2A3D" stop-opacity=".9"/><stop offset="1" stop-color="#071C2B"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="#071C2B"/><rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#8DBBD9" stroke-opacity=".28" stroke-width="1"/>
</svg>`);
await sharp({ create: { width: W, height: H, channels: 3, background: SALA } })
  .composite([
    { input: fundo, top: 0, left: 0 },
    { input: logoClaro, top: Math.round((H - meta.height) / 2), left: Math.round((W - meta.width) / 2) },
  ])
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile(join(OUT, 'og-padrao.jpg'));

console.log('brand: logo claro, favicons e og-padrao gravados em public/brand/');
