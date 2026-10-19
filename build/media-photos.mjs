// SPEC 7.1: fotos da galeria -> public/media/p/<slug>/.
//  - Entram só os itens de `galeria` de data/produtos.json (placeholder do tema já excluído no
//    normalize), cruzados com _recon/images-manifest.json (tipo "galeria") pela URL original.
//    Imagens que só existem no sitemap e as da descrição não entram.
//  - Por foto: AVIF (q50) e WebP (q78) nas larguras 400, 800 e 1080, nunca acima do original
//    (original menor que 800 sai na largura original; 1080 só se o original tiver 1080 ou mais);
//    JPEG 800 (q80) como fallback de OG e e-mail, também limitado ao original.
//  - LQIP: WebP de 24 px em base64. `wall`: cor média das bordas. `fundo_vermelho`: canal R
//    dominante nas bordas (fotos de Natal); nesses casos `wall` fica null e o template usa --room-2.
//  - Nome descritivo pelo slug e pela posição na galeria; números do nome original são ignorados.
//  - Mesma foto (sha1) em vários produtos é codificada uma vez e copiada.
// Nada é ampliado, recortado ou gerado: só redução e recompressão.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { paths } from '../site.config.mjs';

const OUT = join(paths.public, 'media', 'p');
const CACHE = join(paths.cache, 'fotos');
const forcar = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const LARGURAS = [400, 800, 1080];
const AVIF_Q = 50;
const WEBP_Q = 78;
const JPG_Q = 80;
// Versão dos parâmetros de codificação: mudou qualidade, larguras ou LQIP, o cache por sha1 é refeito.
const PARAMS = `l${LARGURAS.join('-')}/avif${AVIF_Q}/webp${WEBP_Q}/jpg${JPG_Q}/lqip24q40`;
// Índice destino -> origem (sha1 da foto + arquivo do cache). A cópia é refeita quando a origem
// muda, não quando o tamanho muda: duas codificações diferentes podem ter o mesmo tamanho.
const INDICE = join(CACHE, 'destinos.json');
const indiceAntigo = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : {};
const indice = {};
const sha1Arquivo = (f) => createHash('sha1').update(readFileSync(f)).digest('hex');

const produtos = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
const recon = JSON.parse(readFileSync(join(paths.recon, 'images-manifest.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(paths.data, 'meta.json'), 'utf8'));

const porUrl = new Map();
for (const a of recon.arquivos) if (a.tipo === 'galeria') porUrl.set(`${a.slug}\u0000${a.url_original}`, a);

function larguras(w) {
  const lista = LARGURAS.filter((x) => x <= w && (x !== 1080 || w >= 1080));
  if (w < 800 && !lista.includes(w)) lista.push(w); // tamanho original como teto
  return [...new Set(lista)].sort((a, b) => a - b);
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

async function analisarBordas(arquivo) {
  // Reduz para 64 px de largura e mede um anel de 3 px nas quatro bordas.
  const { data, info } = await sharp(arquivo).flatten({ background: '#ffffff' }).resize({ width: 64 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const anel = 3;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= anel && x < w - anel && y >= anel && y < h - anel) continue;
      const i = (y * w + x) * c;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  r /= n; g /= n; b /= n;
  const vermelho = r > 90 && r > g * 1.35 && r > b * 1.35;
  return { media: hex(r, g, b), vermelho };
}

async function codificar(reg) {
  // Saída por sha1 no cache; o nome final por slug é copiado depois.
  const dir = join(CACHE, reg.sha1);
  const pronto = join(dir, 'info.json');
  if (existsSync(pronto) && !forcar) {
    const antigo = JSON.parse(readFileSync(pronto, 'utf8'));
    // Cache anterior a este campo foi gerado com os mesmos parâmetros atuais (sem mudança desde então).
    if (antigo.params === undefined) {
      antigo.params = PARAMS;
      writeFileSync(pronto, JSON.stringify(antigo));
    }
    if (antigo.params === PARAMS) return antigo;
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const src = join(paths.recon, reg.arquivo);
  const m = await sharp(src).metadata();
  const w0 = m.width;
  const h0 = m.height;
  const ls = larguras(w0);
  const saidas = [];
  for (const w of ls) {
    const h = Math.round((h0 * w) / w0);
    const base = sharp(src).rotate().resize({ width: w, withoutEnlargement: true });
    await base.clone().avif({ quality: AVIF_Q, effort: 5 }).toFile(join(dir, `${w}.avif`));
    await base.clone().webp({ quality: WEBP_Q, effort: 5 }).toFile(join(dir, `${w}.webp`));
    saidas.push({ w, h });
  }
  const wj = Math.min(800, w0);
  await sharp(src).rotate().flatten({ background: '#ffffff' }).resize({ width: wj, withoutEnlargement: true }).jpeg({ quality: JPG_Q, mozjpeg: true }).toFile(join(dir, `${wj}.jpg`));
  const lq = await sharp(src).rotate().flatten({ background: '#ffffff' }).resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
  const bordas = await analisarBordas(src);
  const info = {
    sha1: reg.sha1,
    params: PARAMS,
    largura: w0,
    altura: h0,
    formato_original: m.format,
    larguras: saidas,
    jpg: { w: wj, h: Math.round((h0 * wj) / w0) },
    lqip: `data:image/webp;base64,${lq.toString('base64')}`,
    cor_bordas: bordas.media,
    fundo_vermelho: bordas.vermelho,
  };
  writeFileSync(pronto, JSON.stringify(info));
  return info;
}

const manifest = {
  gerado_em: new Date().toISOString(),
  coletado_em: meta.data_coleta ?? null,
  regra: 'larguras 400/800/1080 nunca acima do original; AVIF q50, WebP q78, JPEG 800 q80 só para OG e e-mail',
  produtos: {},
};
const usados = new Set();
let fotos = 0;
const cacheInfo = new Map();
for (const p of produtos) {
  const galeria = (p.galeria || []).filter((g) => g.placeholder_do_tema === false);
  if (!galeria.length) {
    manifest.produtos[p.slug] = [];
    continue;
  }
  const dirSlug = join(OUT, p.slug);
  mkdirSync(dirSlug, { recursive: true });
  const lista = [];
  for (let i = 0; i < galeria.length; i++) {
    const g = galeria[i];
    const reg = porUrl.get(`${p.slug}\u0000${g.original}`);
    if (!reg) throw new Error(`Foto da galeria sem arquivo no _recon: ${p.slug} ${g.original}`);
    let info = cacheInfo.get(reg.sha1);
    if (!info) {
      info = await codificar(reg);
      cacheInfo.set(reg.sha1, info);
    }
    const n = i + 1;
    const nome = (w, ext) => `${p.slug}-${n}-${w}.${ext}`;
    const rel = (f) => `media/p/${p.slug}/${f}`;
    const copiar = (de, para) => {
      const destino = join(dirSlug, para);
      usados.add(destino);
      const origem = join(CACHE, reg.sha1, de);
      const chave = `${reg.sha1}/${info.params}/${de}`;
      const relDestino = destino.slice(OUT.length + 1);
      // Sem índice (clone novo, cache apagado): compara o conteúdo byte a byte por sha1.
      const igual = existsSync(destino) && !forcar &&
        (indiceAntigo[relDestino] ? indiceAntigo[relDestino] === chave : statSync(destino).size === statSync(origem).size && sha1Arquivo(destino) === sha1Arquivo(origem));
      if (!igual) copyFileSync(origem, destino);
      indice[relDestino] = chave;
    };
    const avif = [];
    const webp = [];
    for (const { w, h } of info.larguras) {
      copiar(`${w}.avif`, nome(w, 'avif'));
      copiar(`${w}.webp`, nome(w, 'webp'));
      avif.push({ w, h, src: rel(nome(w, 'avif')) });
      webp.push({ w, h, src: rel(nome(w, 'webp')) });
    }
    copiar(`${info.jpg.w}.jpg`, nome(info.jpg.w, 'jpg'));
    lista.push({
      n,
      sha1: reg.sha1,
      alt: g.legenda ?? null,
      principal: g.principal === true,
      posicao_fonte: g.posicao ?? null,
      fonte: g.original,
      largura: info.largura,
      altura: info.altura,
      avif,
      webp,
      jpg: { w: info.jpg.w, h: info.jpg.h, src: rel(nome(info.jpg.w, 'jpg')) },
      lqip: info.lqip,
      cor_bordas: info.cor_bordas,
      fundo_vermelho: info.fundo_vermelho,
      wall: info.fundo_vermelho ? null : info.cor_bordas,
    });
    fotos++;
  }
  manifest.produtos[p.slug] = lista;
}
// Remove arquivos que não pertencem mais a nenhuma galeria.
for (const d of readdirSync(OUT, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const dir = join(OUT, d.name);
  for (const f of readdirSync(dir)) if (!usados.has(join(dir, f))) rmSync(join(dir, f));
  if (!readdirSync(dir).length) rmSync(dir, { recursive: true });
}
writeFileSync(INDICE, JSON.stringify(indice));
manifest.total_fotos = fotos;
manifest.total_unicas = cacheInfo.size;
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`fotos: ${fotos} fotos (${cacheInfo.size} únicas por sha1) em ${Object.keys(manifest.produtos).length} produtos; manifesto em public/media/p/manifest.json`);
