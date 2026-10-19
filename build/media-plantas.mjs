// SPEC 7.2: plantas oficiais (PDF) deduplicadas por sha1.
//  - Copia o PDF para public/<caminho do site atual> (ex.: plantas/banheiras/<nome original>.pdf).
//  - qlmanage -t -s 3400 gera o PNG de 3400 px em .cache/plantas/<sha1>.png (não publicado).
//  - Publica em public/media/plantas/<sha1>/:
//      planta-1200.webp (miniatura e poster), planta-2400.webp e planta-2400.avif (tela),
//      planta-1200.png (PNG nítido sem perda, para quem não tem WebP/AVIF e para impressão rápida),
//      z<n>/<x>_<y>.webp (blocos de 512 px; o último nível é a resolução de 3400 px).
//  - Grava public/media/plantas/manifest.json.
// Nada é redesenhado, recortado ou ampliado: tudo sai do raster do PDF oficial, sempre reduzindo.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import sharp from 'sharp';
import { paths } from '../site.config.mjs';
import { listarPlantas } from './lib/plantas.mjs';

const LADO = 3400;
const TILE = 512;
const CACHE = join(paths.cache, 'plantas');
const OUT = join(paths.public, 'media', 'plantas');
const forcar = process.argv.includes('--force');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

sharp.concurrency(0);

function rasterizar(pl) {
  const png = join(CACHE, `${pl.sha1}.png`);
  if (existsSync(png) && !forcar) return png;
  const tmp = join(CACHE, 'tmp');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const pdf = join(tmp, `${pl.sha1}.pdf`);
  copyFileSync(pl.arquivo_recon, pdf);
  execFileSync('qlmanage', ['-t', '-s', String(LADO), '-o', tmp, pdf], { stdio: 'ignore' });
  const gerado = join(tmp, `${pl.sha1}.pdf.png`);
  if (!existsSync(gerado)) throw new Error(`qlmanage não gerou PNG para ${pl.nome_arquivo}`);
  copyFileSync(gerado, png);
  rmSync(tmp, { recursive: true, force: true });
  return png;
}

function niveis(w, h) {
  // Do maior (resolução do PNG) para baixo, até caber em um bloco.
  const lista = [];
  let [cw, ch] = [w, h];
  for (;;) {
    lista.unshift({ largura: cw, altura: ch });
    if (cw <= TILE && ch <= TILE) break;
    cw = Math.ceil(cw / 2);
    ch = Math.ceil(ch / 2);
  }
  return lista.map((n, z) => ({ z, ...n, colunas: Math.ceil(n.largura / TILE), linhas: Math.ceil(n.altura / TILE) }));
}

async function processar(pl, png) {
  const dir = join(OUT, pl.sha1);
  const pronto = join(CACHE, `${pl.sha1}.ok`); // marcador fora de public/
  // Fundo branco: o PNG do qlmanage vem com canal alfa.
  const base = await sharp(png).flatten({ background: '#ffffff' }).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = base.info;
  const img = () => sharp(base.data, { raw: base.info });
  const lv = niveis(w, h);
  const reg = { sha1: pl.sha1, pdf_path: pl.pdf_path, fonte: pl.fonte, largura_px: w, altura_px: h, tile: TILE, niveis: lv };
  if (existsSync(pronto) && !forcar) return reg;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const larg = (alvo) => Math.min(alvo, w); // nunca acima do raster
  await Promise.all([
    img().resize({ width: larg(1200) }).webp({ quality: 82, effort: 5 }).toFile(join(dir, 'planta-1200.webp')),
    img().resize({ width: larg(1200) }).png({ palette: true, colours: 128, compressionLevel: 9, effort: 8 }).toFile(join(dir, 'planta-1200.png')),
    img().resize({ width: larg(2400) }).webp({ quality: 80, effort: 5 }).toFile(join(dir, 'planta-2400.webp')),
    img().resize({ width: larg(2400) }).avif({ quality: 55, effort: 4 }).toFile(join(dir, 'planta-2400.avif')),
  ]);
  for (const n of lv) {
    const zdir = join(dir, `z${n.z}`);
    mkdirSync(zdir, { recursive: true });
    const nivel = await img().resize({ width: n.largura, height: n.altura, fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const jobs = [];
    for (let y = 0; y < n.linhas; y++) {
      for (let x = 0; x < n.colunas; x++) {
        const left = x * TILE;
        const top = y * TILE;
        const width = Math.min(TILE, n.largura - left);
        const height = Math.min(TILE, n.altura - top);
        jobs.push(
          sharp(nivel.data, { raw: nivel.info }).extract({ left, top, width, height }).webp({ quality: 80, effort: 4 }).toFile(join(zdir, `${x}_${y}.webp`)),
        );
      }
    }
    await Promise.all(jobs);
  }
  writeFileSync(pronto, '');
  return reg;
}

const plantas = listarPlantas();
const manifest = { gerado_em: new Date().toISOString(), total: plantas.length, lado_raster: LADO, plantas: {} };
let n = 0;
for (const pl of plantas) {
  const destino = join(paths.public, pl.pdf_path);
  mkdirSync(dirname(destino), { recursive: true });
  if (!existsSync(destino) || statSync(destino).size !== pl.bytes) copyFileSync(pl.arquivo_recon, destino);
  const png = rasterizar(pl);
  const reg = await processar(pl, png);
  manifest.plantas[pl.sha1] = reg;
  n++;
  if (n % 20 === 0) console.log(`plantas: ${n}/${plantas.length}`);
}
// Remove pastas de plantas que saíram do manifesto de origem.
for (const d of readdirSync(OUT)) {
  if (/^[0-9a-f]{40}$/.test(d) && !manifest.plantas[d]) rmSync(join(OUT, d), { recursive: true, force: true });
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`plantas: ${n} processadas, manifesto em public/media/plantas/manifest.json`);
