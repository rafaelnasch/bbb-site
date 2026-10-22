// Fontes auto-hospedadas (SPEC 5.3). Roda só no Mac, uma vez; a saída (src/fonts/*.woff2) é versionada.
//
// - Libre Franklin variável (peso limitado a 400 a 700), subconjunto latino: títulos, corpo, interface e números.
// Direção "institucional" (Rafael, 21/10/2026): uma sem serifa clássica que transmita seriedade e credibilidade.
// A Newsreader e a Jost (direção "spa de hotel", 20/10) saíram: o Rafael achou o resultado com cara de site feito por IA.
//
// Origem: pacotes @fontsource-variable (SIL Open Font License 1.1, cópia em src/fonts/OFL-*.txt).
// O corte de eixos usa fontTools (python3 -m fontTools.varLib.instancer), já instalado no Mac.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paths } from '../site.config.mjs';

const VERSAO = '5.3.0';
const FONTES = [
  { pacote: '@fontsource-variable/libre-franklin', arquivo: 'libre-franklin-latin-wght-normal.woff2', limites: ['wght=400:700'], saida: 'libre-franklin-var-latin.woff2', licenca: 'OFL-libre-franklin.txt' },
];

const tmp = mkdtempSync(join(tmpdir(), 'bbb-fontes-'));
for (const f of FONTES) {
  execFileSync('npm', ['pack', `${f.pacote}@${VERSAO}`, '--silent'], { cwd: tmp, stdio: 'pipe' });
  const tgz = readdirSync(tmp).find((n) => n.endsWith('.tgz') && n.includes(f.pacote.split('/')[1]));
  const dir = join(tmp, tgz.replace(/\.tgz$/, ''));
  execFileSync('mkdir', ['-p', dir]);
  execFileSync('tar', ['-xzf', join(tmp, tgz), '-C', dir]);
  const origem = join(dir, 'package', 'files', f.arquivo);
  const destino = join(paths.src, 'fonts', f.saida);
  execFileSync('python3', ['-m', 'fontTools.varLib.instancer', origem, ...f.limites, '-o', destino, '--quiet'], { stdio: 'inherit' });
  copyFileSync(join(dir, 'package', 'LICENSE'), join(paths.src, 'fonts', f.licenca));
  console.log(`${f.saida}: ${statSync(destino).size} bytes (${f.limites.join(', ')})`);
}
