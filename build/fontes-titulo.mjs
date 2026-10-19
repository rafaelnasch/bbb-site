// Subconjunto da Fraunces só para o H1 da home (SPEC 12: LCP mobile <= 2,0 s).
// Roda só no Mac, depois de um build (lê o H1 de dist/index.html); a saída é versionada.
//
// Por quê: o H1 é o elemento do LCP. Com a Fraunces inteira (cerca de 60 KB), o texto pinta com a
// fonte de reserva e pinta de novo quando a fonte chega, e essa segunda pintura vira o LCP. Este
// arquivo tem só os glifos do H1, no peso 300 (o do H1), com o eixo opsz mantido (mesmo desenho da
// Fraunces do resto do site). Fica com cerca de 7 KB e chega junto com a primeira pintura; a troca
// da Fraunces inteira nos outros textos não repinta o H1.
//
// Saídas: src/fonts/fraunces-titulo.woff2 e src/fonts/fraunces-titulo.txt (os caracteres cobertos;
// o teste tests/home.test.mjs confere que o H1 publicado cabe nele). Caractere fora do subconjunto
// cai na Fraunces inteira, que vem logo atrás na pilha de fontes: nada quebra, só volta a troca.
//
// Saída estável: só regenera quando os caracteres do H1 mudam (compara com fraunces-titulo.txt; force
// com --forcar), com fontTools fixo em FONTTOOLS e data de criação fixa (SOURCE_DATE_EPOCH e
// --no-recalc-timestamp), para o mesmo H1 dar sempre o mesmo arquivo, byte a byte. Quando regenera,
// precisa de rede (npm pack) e de fontTools no Python: pip install fonttools==4.60.2 brotli.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paths } from '../site.config.mjs';

const VERSAO = '5.3.0';
const FONTTOOLS = '4.60.2';
const EPOCA = '1760745600'; // 18/10/2026 00:00 UTC, a data da coleta; só fixa o campo de data do arquivo
const html = readFileSync(join(paths.dist, 'index.html'), 'utf8');
const m = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
if (!m) throw new Error('fontes-titulo: H1 não encontrado em dist/index.html (rode o build antes)');
const limpar = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const texto = limpar(m[1]);
const chars = [...new Set([...texto, ' '])].sort().join('');
const txt = join(paths.src, 'fonts', 'fraunces-titulo.txt');
const destino = join(paths.src, 'fonts', 'fraunces-titulo.woff2');
let atual = null;
try { atual = readFileSync(txt, 'utf8').replace(/\n$/, ''); } catch { atual = null; }
if (atual === chars && existsSync(destino) && !process.argv.includes('--forcar')) {
  console.log(`fraunces-titulo.woff2: H1 sem caracteres novos, arquivo mantido (${statSync(destino).size} bytes)`);
  process.exit(0);
}
let ft = '';
try { ft = execFileSync('python3', ['-c', 'import fontTools; print(fontTools.version)'], { encoding: 'utf8' }).trim(); } catch { ft = ''; }
if (ft !== FONTTOOLS) throw new Error(`fontes-titulo: precisa de fontTools ${FONTTOOLS} (encontrado: ${ft || 'nenhum'}); pip install fonttools==${FONTTOOLS} brotli`);
const env = { ...process.env, SOURCE_DATE_EPOCH: EPOCA };

const tmp = mkdtempSync(join(tmpdir(), 'bbb-titulo-'));
execFileSync('npm', ['pack', `@fontsource-variable/fraunces@${VERSAO}`, '--silent'], { cwd: tmp, stdio: 'pipe' });
const tgz = readdirSync(tmp).find((n) => n.endsWith('.tgz'));
execFileSync('tar', ['-xzf', join(tmp, tgz), '-C', tmp]);
const origem = join(tmp, 'package', 'files', 'fraunces-latin-opsz-normal.woff2');
const w300 = join(tmp, 'w300.ttf');
execFileSync('python3', ['-m', 'fontTools.varLib.instancer', origem, 'wght=300', '-o', w300, '--quiet'], { stdio: 'inherit', env });
execFileSync('python3', ['-m', 'fontTools.subset', w300, `--text=${chars}`, '--flavor=woff2', '--no-recalc-timestamp',
  '--layout-features=kern,liga,calt,ccmp,mark,mkmk', `--output-file=${destino}`], { stdio: 'inherit', env });
writeFileSync(txt, `${chars}\n`);
console.log(`fraunces-titulo.woff2: ${statSync(destino).size} bytes, ${chars.length} caracteres de "${texto}"`);
