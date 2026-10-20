// Montagem de CSS, JS e fontes com hash no nome (SPEC 12).
//
// - CSS crítico (inline no <head>): tokens.css + base.css + critical.css, mais o extra do tipo de
//   página em src/css/critico/<tipo>.css (ex.: peca = moldura e letterbox de produto e coleção).
//   Teto de 14 KB minificado para a soma inline de cada página; a base guarda folga para o extra.
// - CSS do site (assets/site.<hash>.css): components.css + src/css/paginas/*.css (blocos seguintes).
// - Núcleo (assets/js/nucleo.<hash>.js): core.js + wa.js + reveal.js. Teto de 6 KB gzip (SPEC 6.1).
// - Script inline do <head>: boot.js + vt.js, autorizado na CSP por hash SHA-256 (sem 'unsafe-inline').
// - Demais src/js/*.js: um arquivo por ferramenta, com hash, listados no mapa de módulos da página.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { transform } from 'lightningcss';
import { paths } from '../../site.config.mjs';
import { url } from './url.mjs';

export const LIMITES = Object.freeze({ cssCritico: 14 * 1024, cssCriticoBase: 12 * 1024, nucleoGzip: 6 * 1024 });
const CSS_CRITICO = ['tokens.css', 'base.css', 'critical.css'];
const CSS_SITE = ['utilitarios.css', 'components.css'];
const JS_NUCLEO = ['core.js', 'wa.js', 'reveal.js'];
const JS_INLINE = ['boot.js', 'vt.js'];
// Pacotes de módulos (nome -> arquivos de src/js, na ordem de execução).
const PACOTES = { produto: ['galeria.js', 'monte.js', 'seletor.js', 'planta.js', 'escala.js'] };

/** @font-face das fontes inteiras no CSS crítico minificado (não pega os fallbacks nem o subconjunto do H1). */
export const FONT_FACES_INTEIRAS = /@font-face\{font-family:(?:"?Newsreader"?|"?Jost"?);[^}]*\}/g;

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);
const gz = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;

/** Remove comentários de linha inteira e de bloco iniciados no começo da linha, e a indentação. */
export function enxugarJs(src) {
  return src
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function minCss(css, nome) {
  const { code, warnings } = transform({ filename: nome, code: Buffer.from(css), minify: true, errorRecovery: false });
  for (const w of warnings || []) console.warn(`[css] ${nome}: ${w.message}`);
  return code.toString();
}

function lerCss(lista) {
  return lista.map((n) => readFileSync(join(paths.src, 'css', n), 'utf8')).join('\n');
}

/**
 * Gera tudo em dist/assets e devolve o que o layout precisa.
 * @returns {{ cssCritico, cssSite, nucleo, inlineJs, inlineHash, modulos, fontes, preload, relatorio }}
 */
export function construirAssets({ dist = paths.dist } = {}) {
  const out = join(dist, 'assets');
  mkdirSync(join(out, 'js'), { recursive: true });
  mkdirSync(join(out, 'fonts'), { recursive: true });

  // Fontes
  const fontes = {};
  const dirFontes = join(paths.src, 'fonts');
  for (const f of readdirSync(dirFontes).filter((n) => n.endsWith('.woff2'))) {
    const buf = readFileSync(join(dirFontes, f));
    const nome = `${basename(f, '.woff2')}.${hash(buf)}.woff2`;
    copyFileSync(join(dirFontes, f), join(out, 'fonts', nome));
    fontes[`fonts/${f}`] = url(`assets/fonts/${nome}`);
  }
  const trocarAssets = (css) =>
    css.replace(/url\("asset:([^"]+)"\)/g, (_, p) => {
      if (!fontes[p]) throw new Error(`asset inexistente no CSS: ${p}`);
      return `url("${fontes[p]}")`;
    });

  // CSS
  const cssCritico = minCss(trocarAssets(lerCss(CSS_CRITICO)), 'critico.css');
  if (Buffer.byteLength(cssCritico) > LIMITES.cssCriticoBase) {
    throw new Error(`CSS crítico base com ${Buffer.byteLength(cssCritico)} bytes (teto ${LIMITES.cssCriticoBase}, para sobrar espaço ao extra de cada tipo de página)`);
  }
  // Extras por tipo de página: src/css/critico/<tipo>.css.
  const criticos = {};
  const dirCritico = join(paths.src, 'css', 'critico');
  if (existsSync(dirCritico)) {
    for (const f of readdirSync(dirCritico).filter((n) => n.endsWith('.css')).sort()) {
      const min = minCss(trocarAssets(readFileSync(join(dirCritico, f), 'utf8')), `critico/${f}`);
      // Base mínima (sem as @font-face inteiras, como na página com fontesAposPintura); o layout confere
      // o total real de cada página contra o mesmo teto.
      const total = Buffer.byteLength(cssCritico.replace(FONT_FACES_INTEIRAS, '')) + Buffer.byteLength(min);
      if (total > LIMITES.cssCritico) throw new Error(`CSS crítico base + critico/${f} com ${total} bytes (teto ${LIMITES.cssCritico})`);
      criticos[basename(f, '.css')] = min;
    }
  }
  const dirPaginas = join(paths.src, 'css', 'paginas');
  const extras = existsSync(dirPaginas) ? readdirSync(dirPaginas).filter((n) => n.endsWith('.css')).sort().map((n) => `paginas/${n}`) : [];
  // As @font-face das fontes inteiras (Newsreader e Jost) também vão no site.css: a página com
  // fontesAposPintura (home) as tira do CSS crítico, e o pedido das fontes sai junto com o site.css,
  // depois da primeira pintura; até lá vale o fallback com métricas ajustadas (base.css). Nas demais
  // páginas a regra repetida é inofensiva (mesma família e mesmo arquivo).
  const fontFaces = cssCritico.match(FONT_FACES_INTEIRAS) || [];
  if (fontFaces.length !== 2) throw new Error(`CSS crítico: esperadas 2 @font-face inteiras (Newsreader e Jost), achadas ${fontFaces.length}`);
  const siteMin = fontFaces.join('') + minCss(trocarAssets(lerCss([...CSS_SITE, ...extras])), 'site.css');
  const siteNome = `site.${hash(siteMin)}.css`;
  writeFileSync(join(out, siteNome), siteMin);

  // JS do núcleo
  const nucleoSrc = JS_NUCLEO.map((n) => enxugarJs(readFileSync(join(paths.src, 'js', n), 'utf8'))).join('\n');
  const nucleoGz = gz(nucleoSrc);
  if (nucleoGz > LIMITES.nucleoGzip) throw new Error(`Núcleo JS com ${nucleoGz} bytes gzip (teto ${LIMITES.nucleoGzip})`);
  const nucleoNome = `nucleo.${hash(nucleoSrc)}.js`;
  writeFileSync(join(out, 'js', nucleoNome), nucleoSrc);

  // Script inline do <head>
  const inlineJs = JS_INLINE.map((n) => enxugarJs(readFileSync(join(paths.src, 'js', n), 'utf8'))).join('\n');
  const inlineHash = `sha256-${createHash('sha256').update(inlineJs).digest('base64')}`;

  // Módulos de ferramenta (um por arquivo; os blocos seguintes acrescentam em src/js/)
  const modulos = {};
  const pularJs = new Set([...JS_NUCLEO, ...JS_INLINE]);
  for (const f of readdirSync(join(paths.src, 'js')).filter((n) => extname(n) === '.js' && !pularJs.has(n))) {
    const src = enxugarJs(readFileSync(join(paths.src, 'js', f), 'utf8'));
    const nome = `${basename(f, '.js')}.${hash(src)}.js`;
    writeFileSync(join(out, 'js', nome), src);
    modulos[basename(f, '.js')] = url(`assets/js/${nome}`);
  }

  // Pacotes: várias ferramentas num arquivo só, para a página que usa todas (menos requisições na
  // primeira carga). Cada ferramenta fica isolada num try/catch: a falha de uma não derruba as outras.
  for (const [nome, partes] of Object.entries(PACOTES)) {
    const src = partes.map((f) => `try{${enxugarJs(readFileSync(join(paths.src, 'js', f), 'utf8'))}}catch(e){console.error(e)}`).join('\n');
    const arq = `${nome}.${hash(src)}.js`;
    writeFileSync(join(out, 'js', arq), src);
    modulos[nome] = url(`assets/js/${arq}`);
  }

  const relatorio = {
    css_critico_bytes: Buffer.byteLength(cssCritico),
    css_critico_gzip: gz(cssCritico),
    css_site_bytes: Buffer.byteLength(siteMin),
    css_site_gzip: gz(siteMin),
    nucleo_bytes: Buffer.byteLength(nucleoSrc),
    nucleo_gzip: nucleoGz,
    inline_bytes: Buffer.byteLength(inlineJs),
    inline_gzip: gz(inlineJs),
  };
  mkdirSync(paths.cache, { recursive: true });
  writeFileSync(join(paths.cache, 'relatorio-assets.json'), JSON.stringify(relatorio, null, 2));

  return {
    cssCritico,
    criticos,
    cssSite: url(`assets/${siteNome}`),
    nucleo: url(`assets/js/${nucleoNome}`),
    inlineJs,
    inlineHash,
    modulos,
    fontes,
    preload: [fontes['fonts/newsreader-var-latin.woff2']],
    relatorio,
  };
}
