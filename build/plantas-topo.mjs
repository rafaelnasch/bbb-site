// Arte estática do topo do produto para as plantas sem filme (plano B do bloco 8). Antes, o topo usava a
// prancha inteira (planta-1200.webp) com filter:invert(1): a moldura azul virava uma faixa dourada no alto e
// o cabeçalho "Modelo / Produzido em" ficava cortado na borda da tela. Aqui sai só a folha do desenho
// (build/lib/folha.mjs), com o mesmo tratamento do poster dos filmes: cores invertidas, matiz girado 180°
// (o traço volta a ser azul-claro) e sobreposição em tela sobre o --room-2. Nada é redesenhado.
//
// Saída: public/media/plantas/<sha1>/topo-<600|1200>.(avif|webp) + public/media/plantas/topo.json
// Uso: node build/plantas-topo.mjs [--forcar]
import { existsSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { paths } from '../site.config.mjs';
import { caixaDaFolha, recorteValido } from './lib/folha.mjs';

const FORCAR = process.argv.includes('--forcar');
const SAIDA = join(paths.public, 'media', 'plantas');
const RASTER = join(paths.cache, 'plantas');
const MAN = join(SAIDA, 'topo.json');
const anterior = existsSync(MAN) ? JSON.parse(readFileSync(MAN, 'utf8')).plantas || {} : {};

const shas = readdirSync(SAIDA).filter((d) => /^[0-9a-f]{40}$/.test(d));
const out = {};
let feitos = 0, mantidos = 0;
const pulados = [];
for (const sha1 of shas) {
  const png = join(RASTER, `${sha1}.png`);
  const dest = (w, ext) => join(SAIDA, sha1, `topo-${w}.${ext}`);
  const prontos = [600, 1200].every((w) => ['avif', 'webp'].every((e) => existsSync(dest(w, e))));
  if (!FORCAR && prontos && anterior[sha1]) { out[sha1] = anterior[sha1]; mantidos++; continue; }
  if (!existsSync(png)) { pulados.push({ sha1, motivo: 'raster ausente em .cache/plantas' }); continue; }
  let cx;
  try { cx = await caixaDaFolha(png); } catch (e) { pulados.push({ sha1, motivo: e.message }); continue; }
  if (!recorteValido(cx)) { pulados.push({ sha1, motivo: `recorte suspeito ${JSON.stringify(cx)}` }); continue; }
  const inv = await sharp(png).flatten({ background: '#ffffff' }).extract(cx).resize({ width: 1200 }).negate({ alpha: false }).toBuffer();
  const girada = await sharp(inv).modulate({ hue: 180 }).toBuffer();
  const m = await sharp(girada).metadata();
  const base = await sharp({ create: { width: m.width, height: m.height, channels: 3, background: '#0C2A3D' } })
    .composite([{ input: girada, blend: 'screen' }]).png().toBuffer();
  for (const w of [600, 1200]) {
    const r = w === 1200 ? sharp(base) : sharp(base).resize({ width: w });
    await r.clone().avif({ quality: 50, effort: 6 }).toFile(dest(w, 'avif'));
    await r.clone().webp({ quality: 78 }).toFile(dest(w, 'webp'));
  }
  out[sha1] = { largura: 1200, altura: m.height, recorte_px: cx };
  feitos++;
}
writeFileSync(MAN, `${JSON.stringify({ regra: 'Folha do desenho da planta oficial (sem moldura, cabeçalho e carimbo), invertida com matiz girado 180° sobre #0C2A3D, como o poster dos filmes. Só para o topo do produto.', plantas: out, pulados }, null, 1)}\n`);
console.log(`topo das plantas: ${feitos} gerados, ${mantidos} mantidos, ${pulados.length} pulados`);
