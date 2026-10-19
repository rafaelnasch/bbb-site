// Miniaturas das portas da home (SPEC 9.1 e 12). Roda no Mac depois do `npm run films`; saída versionada.
// A porta mostra a foto do quadro final do filme da coleção (o poster), recortada na área da foto do
// filme (484 px a partir de 399,79 no quadro de 1280x720, a mesma do recorte em CSS) e reduzida a
// 240 px: cerca de 3 KB em vez dos 7 a 11 KB do poster inteiro, pedidos antes da primeira pintura.
// Sem recorte de fundo, sem upscaling, sem geração (SPEC 0.8): só corte e redução do quadro real.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { paths } from '../site.config.mjs';

export const RECORTE = Object.freeze({ left: 399, top: 79, width: 484, height: 484 });
const LADO = 240;
const man = JSON.parse(readFileSync(join(paths.public, 'media', 'filmes', 'manifest.json'), 'utf8'));
const out = join(paths.public, 'media', 'home');
mkdirSync(out, { recursive: true });
const saida = { gerado_de: 'media/filmes/manifest.json (poster de cada filme de coleção)', recorte: RECORTE, lado: LADO, portas: {} };
for (const [id, f] of Object.entries(man.colecao || {})) {
  const src = f.poster?.webp?.src;
  if (!src || !existsSync(join(paths.public, src))) continue;
  const meta = await sharp(join(paths.public, src)).metadata();
  if (meta.width !== 1280 || meta.height !== 720) throw new Error(`${src}: quadro ${meta.width}x${meta.height}, esperado 1280x720`);
  const base = sharp(join(paths.public, src)).extract(RECORTE).resize(LADO, LADO);
  const avif = `media/home/porta-${id}-${LADO}.avif`, webp = `media/home/porta-${id}-${LADO}.webp`;
  await base.clone().avif({ quality: 55 }).toFile(join(paths.public, avif));
  await base.clone().webp({ quality: 80 }).toFile(join(paths.public, webp));
  saida.portas[id] = { avif, webp, lado: LADO, poster: src };
  console.log(id, avif);
}
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(saida, null, 1)}\n`);
