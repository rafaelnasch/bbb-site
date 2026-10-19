// Helper único de fotos de produto (SPEC 7.1). Os templates pedem a foto por slug e posição na
// galeria; o helper decide a fonte:
//
// 1. Mídia final versionada em public/media/p/<slug>/<slug>-<n>-<w>.(avif|webp), gerada pelo
//    build/media-photos.mjs. Dimensões, --wall, fundo vermelho e LQIP vêm de public/media/p/manifest.json
//    quando ele existir; sem manifesto, as dimensões são lidas do maior WebP.
// 2. Sem mídia final para a foto: devolve null e o template mostra a moldura vazia.
//
// O build nunca lê _recon/images (SPEC 0.9): a única fonte de foto publicada é public/media/p.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../../site.config.mjs';
import { url } from './url.mjs';
import { lerJson } from './dados.mjs';

const DIR_FINAL = join(paths.public, 'media', 'p');
const RE_FINAL = /^(.+)-(\d+)-(\d+)\.(avif|webp|jpe?g)$/;

let indiceFinal = null; // slug -> n -> { larguras:Set, formatos:Set, meta }
let manifestoFinal = null;

function lerManifestoFinal() {
  const p = join(DIR_FINAL, 'manifest.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Procura a entrada de uma foto no manifesto final, aceitando os formatos usuais de agrupamento. */
function metaFinal(slug, n) {
  const m = manifestoFinal;
  if (!m) return null;
  const lista = m[slug] ?? m.produtos?.[slug] ?? m.fotos?.filter?.((f) => f.slug === slug) ?? null;
  const arr = Array.isArray(lista) ? lista : lista?.fotos;
  if (!Array.isArray(arr)) return null;
  return arr.find((f) => Number(f.n ?? f.posicao ?? f.indice) === n) ?? arr[n - 1] ?? null;
}

async function dimensoesDoArquivo(arquivo) {
  try {
    const sharp = (await import('sharp')).default;
    const md = await sharp(arquivo).metadata();
    return { width: md.width, height: md.height };
  } catch {
    return null;
  }
}

/** Prepara os índices (assíncrono, uma vez por build). */
export async function prepararMidia() {
  indiceFinal = new Map();
  manifestoFinal = lerManifestoFinal();
  if (existsSync(DIR_FINAL)) {
    for (const slug of readdirSync(DIR_FINAL, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
      for (const arq of readdirSync(join(DIR_FINAL, slug))) {
        const m = RE_FINAL.exec(arq);
        if (!m || m[1] !== slug) continue;
        const n = Number(m[2]);
        const w = Number(m[3]);
        if (!indiceFinal.has(slug)) indiceFinal.set(slug, new Map());
        const porN = indiceFinal.get(slug);
        if (!porN.has(n)) porN.set(n, { larguras: new Set(), formatos: new Set(), jpg: null });
        const e = porN.get(n);
        if (m[4] === 'avif' || m[4] === 'webp') {
          e.larguras.add(w);
          e.formatos.add(m[4]);
        } else e.jpg = { w, arq };
      }
    }
    for (const [slug, porN] of indiceFinal) {
      for (const [n, e] of porN) {
        const meta = metaFinal(slug, n);
        e.meta = meta;
        const maior = Math.max(...e.larguras);
        const mw = meta?.width ?? meta?.largura;
        const mh = meta?.height ?? meta?.altura;
        if (mw && mh) {
          e.width = mw;
          e.height = mh;
        } else if (Number.isFinite(maior)) {
          const fmt = e.formatos.has('webp') ? 'webp' : 'avif';
          const d = await dimensoesDoArquivo(join(DIR_FINAL, slug, `${slug}-${n}-${maior}.${fmt}`));
          if (d) Object.assign(e, d);
        }
      }
    }
  }
}

function exigirPreparo() {
  if (!indiceFinal) throw new Error('midia: chame prepararMidia() antes de renderizar');
}

/** Itens de galeria publicáveis do produto (sem o placeholder do tema), na ordem da página atual. */
function galeriaDoProduto(slug) {
  const prods = lerJson('produtos.json') || [];
  const p = prods.find((x) => x.slug === slug);
  return p ? (p.galeria || []).filter((g) => g && g.placeholder_do_tema === false && g.tipo === 'image') : [];
}

function fotoFinal(slug, n, alt) {
  const e = indiceFinal.get(slug)?.get(n);
  if (!e || !e.larguras.size || !e.width) return null;
  const larguras = [...e.larguras].sort((a, b) => a - b);
  const fontes = [];
  for (const fmt of ['avif', 'webp']) {
    if (!e.formatos.has(fmt)) continue;
    const ws = larguras.filter((w) => existsSync(join(DIR_FINAL, slug, `${slug}-${n}-${w}.${fmt}`)));
    if (!ws.length) continue;
    fontes.push({ type: `image/${fmt}`, srcset: ws.map((w) => `${url(`media/p/${slug}/${slug}-${n}-${w}.${fmt}`)} ${w}w`).join(', ') });
  }
  const fmtSrc = e.formatos.has('webp') ? 'webp' : 'avif';
  const wSrc = larguras.includes(800) ? 800 : larguras[larguras.length - 1];
  const m = e.meta || {};
  return {
    slug,
    n,
    alt,
    width: e.width,
    height: e.height,
    src: url(`media/p/${slug}/${slug}-${n}-${wSrc}.${fmtSrc}`),
    fontes,
    sha1: m.sha1 ?? null,
    lqip: m.lqip ?? null,
    wall: m.wall ?? m['--wall'] ?? null,
    vermelho: Boolean(m.vermelho ?? m.fundo_vermelho ?? false),
  };
}

/**
 * Foto n (1 = principal) da galeria do produto, ou null. O texto alternativo é a legenda literal
 * da galeria; sem legenda, o nome do produto.
 */
export function fotoProduto(slug, n = 1) {
  exigirPreparo();
  const gal = galeriaDoProduto(slug);
  if (!gal[n - 1]) return null;
  const prods = lerJson('produtos.json') || [];
  const alt = gal[n - 1].legenda || prods.find((x) => x.slug === slug)?.nome || '';
  return fotoFinal(slug, n, alt);
}

/** Todas as fotos publicáveis do produto, na ordem da galeria. */
export function fotosProduto(slug) {
  exigirPreparo();
  return galeriaDoProduto(slug)
    .map((_, i) => fotoProduto(slug, i + 1))
    .filter(Boolean);
}
