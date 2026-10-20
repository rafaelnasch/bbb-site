// Fontes auto-hospedadas (SPEC 5.3). Roda só no Mac, uma vez; a saída (src/fonts/*.woff2) é versionada.
//
// - Newsreader variável (tamanho óptico fixo em 48, o de títulos; peso limitado a 300 a 500), subconjunto latino:
//   títulos. A Cormorant Garamond foi testada e descartada: os acentos (ô, á) saem altos e deslocados em pt-BR.
// - Jost variável (peso limitado a 300 a 600), subconjunto latino: corpo, interface e números.
// Direção "spa de hotel, claro" (Rafael, 20/10/2026): serifada fina nos títulos e sem serifa leve no corpo.
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
  { pacote: '@fontsource-variable/newsreader', arquivo: 'newsreader-latin-opsz-normal.woff2', limites: ['opsz=48', 'wght=300:500'], saida: 'newsreader-var-latin.woff2', licenca: 'OFL-newsreader.txt' },
  { pacote: '@fontsource-variable/jost', arquivo: 'jost-latin-wght-normal.woff2', limites: ['wght=300:600'], saida: 'jost-var-latin.woff2', licenca: 'OFL-jost.txt' },
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
