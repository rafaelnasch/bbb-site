// Validações do build sobre dist/ (SPEC 13). O build falha se qualquer item que se aplica falhar.
//
// Cobertas aqui, em todas as páginas geradas: WhatsApp e lista negra (13.3), termos proibidos (13.4),
// travessão (13.5), emoji (13.6), JSON-LD (13.7), links internos (13.8), cabeça (13.9),
// cobertura (13.10, quando o template de produto/coleção existir), imagens (13.11), contraste (13.12),
// html-validate (13.13), diferença zero dos produtos (13.1) e rastreio dos data-campo (13.2), estes
// dois em build/lib/diferenca-zero.mjs.
//
// Uso: node build/validate.mjs [pasta]   (padrão: dist/)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HtmlValidate } from 'html-validate';
import { paths, BASE_PATH, SITE_URL, INDEXAR } from '../site.config.mjs';
import { verificarContraste } from './lib/contraste.mjs';
import { numerosProibidosEm } from './lib/wa.mjs';
import { REGISTRO } from './render.mjs';
import { verificarDiferencaZero, rastreio } from './lib/diferenca-zero.mjs';
import { CATEGORIAS_PONTE } from './lib/catalogo.mjs';

const SAUDE = ['cura', 'trata', 'tratamento', 'diabetes', 'celulite', 'varizes', 'circulação', 'emagrec', 'terapêutic', 'medicinal'];
const PROIBIDOS = [/\(VERIFICAR\)/, /BANHEIRA COLORIDA/i, /a maior loja/i, /a única com selo/i, /\blorem\b/i];
const TEXTO_EXT = new Set(['.html', '.json', '.txt', '.xml', '.js', '.css', '.webmanifest', '.csv', '.md']);

function arquivos(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else out.push(p);
  }
  return out;
}

/** Texto visível aproximado: sem script, style, comentários, tags e entidades comuns. */
export function textoVisivel(h) {
  return h
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

function termoSaude(texto) {
  const t = texto.toLowerCase();
  return SAUDE.filter((w) => new RegExp(`(^|[^\\p{L}])${w}`, 'u').test(t));
}

export async function validar(dist = paths.dist) {
  const erros = [];
  const pendentes = [];
  const erro = (arq, msg) => erros.push(`${relative(dist, arq) || arq}: ${msg}`);
  if (!existsSync(dist)) throw new Error(`${dist} não existe; rode o render antes`);

  // Enquanto algum template de página do REGISTRO não existe (construção em blocos), link para
  // página .html ainda não gerada vira pendência; asset, mídia e página existente continuam obrigatórios.
  const faltam = REGISTRO.filter((n) => !existsSync(join(paths.templates, `${n}.mjs`)));
  const paginasFaltando = new Set();
  const todos = arquivos(dist);
  const htmls = todos.filter((f) => f.endsWith('.html'));
  const contatos = JSON.parse(readFileSync(join(paths.data, 'contatos.json'), 'utf8')).contatos;
  const ativos = new Set(contatos.filter((c) => c.status === 'ativo' && c.link_ativo).map((c) => c.numero));
  // 13.1 diferença zero (produtos) e o mapa de campos para 13.2
  const dz = verificarDiferencaZero(dist);
  erros.push(...dz.erros);
  if (dz.pendente) pendentes.push(dz.pendente);
  // Produtos sem foto publicada (d_sem_foto, hoje só o Spa Serena): o Product sai sem image, porque a
  // regra 0.1 (nenhum dado inventado) prevalece sobre o campo recomendado da 13.7.
  const semFoto = new Set(JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8')).filter((p) => p.d_sem_foto).map((p) => `${p.slug}.html`));

  // 13.3 lista negra em qualquer arquivo de texto de dist/
  for (const f of todos.filter((x) => TEXTO_EXT.has(extname(x)))) {
    const ruins = numerosProibidosEm(readFileSync(f, 'utf8'));
    if (ruins.length) erro(f, `número da lista negra: ${[...new Set(ruins)].join(', ')}`);
  }

  for (const f of htmls) {
    const h = readFileSync(f, 'utf8');
    const ponte = /<meta http-equiv="refresh"/i.test(h);
    const txt = textoVisivel(h);

    // 13.2 rastreio
    if (dz.mapa) for (const e of rastreio(h, dz.mapa)) erro(f, `13.2 ${e}`);

    // 13.3 WhatsApp
    for (const [, n] of h.matchAll(/https:\/\/wa\.me\/(\d+)/g)) if (!ativos.has(n)) erro(f, `wa.me com número não ativo ${n}`);

    // 13.4 termos proibidos
    const s = termoSaude(txt);
    if (s.length) erro(f, `termo de saúde: ${s.join(', ')}`);
    for (const re of PROIBIDOS) if (re.test(txt)) erro(f, `termo proibido ${re}`);

    // 13.5 travessão
    for (const m of h.matchAll(/<(h[1-3]|title)\b[^>]*>([\s\S]*?)<\/\1>/gi)) if (m[2].includes('—')) erro(f, `travessão em <${m[1]}>`);
    if ((txt.match(/—/g) || []).length > 2) erro(f, 'mais de 2 travessões');

    // 13.6 emoji
    if (/\p{Extended_Pictographic}/u.test(h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''))) erro(f, 'emoji no HTML');

    // 13.7 JSON-LD
    for (const [, j] of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let o;
      try { o = JSON.parse(j); } catch (e) { erro(f, `JSON-LD inválido: ${e.message}`); continue; }
      const nos = [o, ...(o['@graph'] || [])];
      for (const n of nos) {
        if (n['@type'] !== 'Product') continue;
        const of = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        for (const k of ['name', 'image']) if (!n[k] && !(k === 'image' && semFoto.has(relative(dist, f)))) erro(f, `Product sem ${k}`);
        for (const k of ['price', 'priceCurrency', 'availability']) if (!of?.[k] && !(k === 'price' && of?.lowPrice)) erro(f, `Product sem offers.${k}`);
      }
    }

    // 13.8 links internos
    for (const m of h.matchAll(/\s(?:href|src|srcset|poster|imagesrcset)="([^"]+)"/g)) {
      for (const v of m[1].split(/,\s+/).map((x) => x.trim().split(/\s+/)[0])) {
        if (!v || /^(https?:|mailto:|tel:|#|data:|blob:)/.test(v)) continue;
        if (BASE_PATH && !v.startsWith(`${BASE_PATH}/`) && v !== BASE_PATH) { erro(f, `link sem BASE_PATH: ${v}`); continue; }
        if (!BASE_PATH && !v.startsWith('/')) { erro(f, `link relativo: ${v}`); continue; }
        let rel = decodeURIComponent(v.slice(BASE_PATH.length).split(/[?#]/)[0]);
        if (rel === '' || rel.endsWith('/')) rel += 'index.html';
        const alvo = join(dist, rel);
        if (existsSync(alvo) || existsSync(`${alvo}.html`)) continue;
        if (faltam.length && /\.html$/.test(rel) && !/^\/(assets|brand|media|plantas|manual|vendor|dados)\//.test(rel)) paginasFaltando.add(rel);
        else erro(f, `link interno quebrado: ${v}`);
      }
    }
    for (const m of h.matchAll(/https?:\/\/[^"'\s<>]+/g)) {
      if (m[0].startsWith(SITE_URL) && /\/\//.test(m[0].slice(SITE_URL.length))) erro(f, `URL absoluta com barra dupla: ${m[0]}`);
    }

    // 13.9 cabeça
    if (!/^<!doctype html>\s*<html lang="pt-BR">/i.test(h)) erro(f, 'sem doctype ou lang="pt-BR"');
    if (!ponte) {
      const h1 = (h.match(/<h1[\s>]/g) || []).length;
      if (h1 !== 1) erro(f, `${h1} <h1>`);
    }
    if (!/<title>[^<]+<\/title>/.test(h)) erro(f, 'sem <title>');
    if (!/<meta name="description" content="[^"]+">/.test(h)) erro(f, 'sem meta description');
    const can = /<link rel="canonical" href="([^"]+)">/.exec(h);
    if (!can || !can[1].startsWith(`${SITE_URL}/`) && can[1] !== SITE_URL) erro(f, 'canonical ausente ou não absoluto');
    if (!/<meta property="og:image" content="https?:\/\/[^"]+">/.test(h)) erro(f, 'sem og:image absoluto');
    if (!/http-equiv="Content-Security-Policy"/.test(h)) erro(f, 'sem CSP');
    if (!INDEXAR && !/<meta name="robots" content="noindex,nofollow">/.test(h)) erro(f, 'INDEXAR=false sem noindex,nofollow');

    // 13.11 imagens
    for (const [tag] of h.matchAll(/<img\b[^>]*>/g)) {
      if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) erro(f, `img sem width/height: ${tag.slice(0, 120)}`);
      if (!/\salt="/.test(tag)) erro(f, `img sem alt: ${tag.slice(0, 120)}`);
    }
  }

  if (paginasFaltando.size) pendentes.push(`13.8 ${paginasFaltando.size} páginas linkadas ainda não geradas (templates ausentes: ${faltam.join(', ')})`);

  // 13.10 cobertura (quando os templates existem)
  const cat = JSON.parse(readFileSync(join(paths.data, 'categorias.json'), 'utf8'));
  if (existsSync(join(paths.templates, 'colecao.mjs'))) {
    // As duas categorias do Magento sem .html viram páginas-ponte (SPEC 4.1): cobertas pelo template ponte.
    const ponte = existsSync(join(paths.templates, 'ponte.mjs'));
    for (const c of cat) {
      if (existsSync(join(dist, c.d_path))) continue;
      if (CATEGORIAS_PONTE.includes(c.d_path) && !ponte) { pendentes.push(`13.10 ${c.d_path} (página-ponte, template ainda não existe)`); continue; }
      erro(dist, `coleção ausente: ${c.d_path}`);
    }
  } else pendentes.push('13.10 coleções (template ainda não existe)');
  if (existsSync(join(paths.templates, 'produto.mjs'))) {
    const prods = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
    for (const p of prods) if (!existsSync(join(dist, `${p.slug}.html`))) erro(dist, `produto ausente: ${p.slug}.html`);
    if (existsSync(join(dist, 'produto-outlet.html'))) erro(dist, 'produto-outlet.html não deve existir');
  } else pendentes.push('13.10 produtos (template ainda não existe)');

  // 13.12 contraste
  for (const r of verificarContraste().filter((x) => !x.ok)) erros.push(`contraste ${r.fg} sobre ${r.bg} = ${r.razao}:1 (mínimo ${r.minimo}) [${r.uso}]`);

  // 13.13 html-validate nas páginas-tipo: uma por pasta e nome-base, até 40
  const hv = new HtmlValidate({ extends: ['html-validate:standard', 'html-validate:document'], rules: { 'require-sri': 'off' } });
  const amostra = new Map();
  for (const f of htmls) {
    const k = relative(dist, f).replace(/[^/]+\.html$/, (n) => (/^_|^index|^404/.test(n) ? n : '*'));
    if (!amostra.has(k)) amostra.set(k, f);
  }
  for (const f of [...amostra.values()].slice(0, 40)) {
    const r = await hv.validateFile(f);
    for (const m of r.results.flatMap((x) => x.messages)) if (m.severity === 2) erro(f, `html-validate ${m.ruleId}: ${m.message} (linha ${m.line})`);
  }

  return { erros, pendentes, paginas: htmls.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv[2] || paths.dist;
  validar(dist).then(({ erros, pendentes, paginas }) => {
    for (const p of pendentes) console.log(`validate: pendente · ${p}`);
    if (erros.length) {
      console.error(`validate: ${erros.length} falha(s) em ${paginas} páginas`);
      for (const e of erros.slice(0, 200)) console.error(`  ${e}`);
      process.exit(1);
    }
    console.log(`validate: ${paginas} páginas sem falhas`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
