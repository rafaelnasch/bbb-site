// Versão leve (640x360, só MP4 H.264) de cada filme da planta, para telas com menos de 600 px de largura.
// No celular a área do filme tem cerca de 363x204 px; o filme de 1280x720 era baixado inteiro em toda visita.
// A fonte é o render bruto do HyperFrames (.cache/filmes/hf-planta/renders/<sha1>.mp4) quando existir;
// sem ele, o MP4 publicado. Só reduz a escala (sem gerar nem alterar imagem). Grava `mp4_640` no manifest.
//
// Uso: node build/filmes-leves.mjs [--forcar]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../site.config.mjs';

const OUT = join(paths.public, 'media', 'filmes');
const MANIFESTO = join(OUT, 'manifest.json');
const BRUTOS = join(paths.cache, 'filmes', 'hf-planta', 'renders');
const FORCAR = process.argv.includes('--forcar');
const TETO = 350 * 1000;

const man = JSON.parse(readFileSync(MANIFESTO, 'utf8'));
let feitos = 0, mantidos = 0, antes = 0, depois = 0;
for (const [sha1, f] of Object.entries(man.planta || {})) {
  if (!f?.mp4?.src) continue;
  const rel = `media/filmes/planta/${sha1}-640.mp4`;
  const saida = join(paths.public, rel);
  const bruto = join(BRUTOS, `${sha1}.mp4`);
  const entrada = existsSync(bruto) ? bruto : join(paths.public, f.mp4.src);
  if (FORCAR || !existsSync(saida)) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', entrada, '-vf', 'scale=640:360:flags=lanczos',
      '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', saida]);
    feitos++;
  } else mantidos++;
  const bytes = statSync(saida).size;
  f.mp4_640 = { src: rel, bytes, largura: 640, altura: 360, codec: 'h264', origem: existsSync(bruto) ? 'render bruto' : 'mp4 publicado' };
  if (bytes > TETO) console.warn(`[leve] ${sha1} acima de 350 KB`);
  antes += Math.min(f.mp4.bytes || Infinity, f.webm?.bytes || Infinity);
  depois += bytes;
}
man.regra_leve = 'Telas com menos de 600 px recebem a versão 640x360 em MP4 (mp4_640); nas demais, vai primeiro o formato menor entre WebM e MP4 de cada filme.';
writeFileSync(MANIFESTO, `${JSON.stringify(man, null, 1)}\n`);
console.log(`filmes leves: ${feitos} gerados, ${mantidos} mantidos · ${(antes / 1e6).toFixed(1)} MB (menor formato 720p) -> ${(depois / 1e6).toFixed(1)} MB (640 px)`);
