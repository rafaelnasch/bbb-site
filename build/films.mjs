// SPEC 8: filmes HyperFrames gerados em lote só a partir de data/ (nada digitado).
//
//  - Planta que se desenha: 1 por planta oficial única com cotas validadas (data/plantas/<sha1>.json,
//    validada=true). A imagem é o raster do PDF oficial (.cache/plantas/<sha1>.png, gerado por
//    media-plantas.mjs), recortada na folha branca e com as cores invertidas para a "sala escura".
//    Nada é redesenhado. As cotas exibidas (A, B e H, ou H1/H2) são o valor_texto literal da tabela
//    da planta e a posição da letra no desenho lida pelo cotas.mjs.
//  - Sala de coleção (Banheiras, Spas, Ofurôs, Sauna) e Lançamentos: fotos reais da galeria
//    (public/media/p, sem fundo vermelho), na ordem da listagem; texto só com o nome literal da
//    coleção e a contagem real (total_exibido).
//
// Cada linha do lote carrega `fonte`. Variável sem dado derruba a preparação (antes do render) e
// o render roda com --strict-variables.
//
// Saída: public/media/filmes/<planta|colecao>/<id>.(webm|mp4) + poster (último quadro) em AVIF e
// WebP + public/media/filmes/manifest.json (inclui o que ficou sem filme, para o site cair na
// planta estática).
//
// Uso: node build/films.mjs [--tipo=planta|colecao|todos] [--limite=N] [--sem-render] [--forcar]
//      [--concorrencia=N]
import { execFileSync, spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import sharp from 'sharp';
import { paths } from '../site.config.mjs';
import { caixaDaFolha, recorteValido } from './lib/folha.mjs';

const HF = 'hyperframes@0.8.173';
const ENV = { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', DO_NOT_TRACK: '1' };
const TETO = 350 * 1000; // bytes por arquivo de filme (SPEC 8: até 350 KB)
const LARG = 1280, ALT = 720;

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const TIPO = arg('tipo', 'todos');
const LIMITE = Number(arg('limite', '0')) || Infinity;
const CONC = Number(arg('concorrencia', '2')) || 2;
const SEM_RENDER = process.argv.includes('--sem-render');
const FORCAR = process.argv.includes('--forcar');

const WORK = join(paths.cache, 'filmes');
const OUT = join(paths.public, 'media', 'filmes');
const MANIFESTO = join(OUT, 'manifest.json');
const TPL = join(paths.root, 'build', 'filmes');

const lerJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const produtos = lerJSON(join(paths.data, 'produtos.json'));
const porSlug = new Map(produtos.map((p) => [p.slug, p]));
const categorias = lerJSON(join(paths.data, 'categorias.json'));
const catPorPath = new Map(categorias.map((c) => [c.path, c]));
const fotos = lerJSON(join(paths.public, 'media', 'p', 'manifest.json')).produtos;
const meta = existsSync(join(paths.data, 'meta.json')) ? lerJSON(join(paths.data, 'meta.json')) : {};

function exigir(valor, oque) {
  if (valor === undefined || valor === null || valor === '' || (typeof valor === 'number' && !Number.isFinite(valor))) {
    throw new Error(`Dado ausente: ${oque}. O filme não é gerado com variável vazia.`);
  }
  return valor;
}

function projeto(nome, template) {
  const dir = join(WORK, nome);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  copyFileSync(join(TPL, template), join(dir, 'index.html'));
  copyFileSync(join(paths.root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), join(dir, 'assets', 'gsap.min.js'));
  copyFileSync(join(paths.root, 'src', 'fonts', 'opensans-var-latin.woff2'), join(dir, 'assets', 'opensans-var-latin.woff2'));
  writeFileSync(join(dir, 'hyperframes.json'), JSON.stringify({ paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true } }, null, 2));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ id: nome, name: nome }, null, 2));
  return dir;
}

// ---------------------------------------------------------------- plantas
function ordemDosProdutos() {
  const vistos = new Set();
  const ordem = [];
  for (const path of ['/banheiras.html', '/spas.html', '/ofuros.html', '/sauna.html']) {
    for (const s of catPorPath.get(path)?.produtos || []) if (!vistos.has(s)) { vistos.add(s); ordem.push(s); }
  }
  for (const p of produtos) if (!vistos.has(p.slug)) { vistos.add(p.slug); ordem.push(p.slug); }
  return ordem;
}

const listaPt = (a) => (a.length > 1 ? `${a.slice(0, -1).join('; ')} e ${a[a.length - 1]}` : a.join(''));

function lerPlanta(sha1) {
  const f = join(paths.data, 'plantas', `${sha1}.json`);
  return existsSync(f) ? lerJSON(f) : null;
}

async function prepararPlantas() {
  const ordem = ordemDosProdutos();
  const lista = [];
  const vistos = new Set();
  const semFilme = [];
  const porProduto = {};
  for (const slug of ordem) {
    const p = porSlug.get(slug);
    for (const t of p.d_planta || []) {
      (porProduto[slug] ||= []).push({ rotulo: t.rotulo, sha1: t.sha1 || null });
      if (!t.sha1 || vistos.has(t.sha1)) continue;
      vistos.add(t.sha1);
      const d = lerPlanta(t.sha1);
      if (!d) { semFilme.push({ sha1: t.sha1, pdf_path: t.pdf_path, motivo: 'sem leitura de cotas' }); continue; }
      if (!d.validada) { semFilme.push({ sha1: t.sha1, pdf_path: d.pdf_path, motivo: 'cotas não validadas (planta estática no site)' }); continue; }
      lista.push(d);
    }
  }
  const dir = projeto('hf-planta', 'planta.html');
  mkdirSync(join(dir, 'assets', 'plantas'), { recursive: true });
  const rows = [];
  const extras = {};
  const alvo = lista.slice(0, LIMITE);
  for (const d of lista.slice(alvo.length)) semFilme.push({ sha1: d.sha1, pdf_path: d.pdf_path, motivo: 'fora do lote desta rodada (prioridade pela ordem das coleções)' });
  for (const d of alvo) {
    const png = join(paths.cache, 'plantas', `${d.sha1}.png`);
    if (!existsSync(png)) { semFilme.push({ sha1: d.sha1, pdf_path: d.pdf_path, motivo: 'raster da planta ausente em .cache/plantas' }); continue; }
    const cx = await caixaDaFolha(png);
    if (!recorteValido(cx)) throw new Error(`Recorte suspeito na planta ${d.sha1}: ${JSON.stringify(cx)}`);
    const s = Math.min((LARG - 48) / cx.width, 620 / cx.height);
    const W = Math.round(cx.width * s), H = Math.round(cx.height * s);
    const img = join(dir, 'assets', 'plantas', `${d.sha1}.png`);
    if (!existsSync(img) || FORCAR) {
      const inv = await sharp(png).flatten({ background: '#ffffff' }).extract(cx).resize({ width: Math.round(W * 1.5) })
        .negate({ alpha: false }).toBuffer();
      const girada = await sharp(inv).modulate({ hue: 180 }).toBuffer();
      const meta2 = await sharp(girada).metadata();
      await sharp({ create: { width: meta2.width, height: meta2.height, channels: 3, background: '#0C2A3D' } })
        .composite([{ input: girada, blend: 'screen' }]).png({ compressionLevel: 9 }).toFile(img);
    }
    const letras = d.posicoes?.letras || [];
    if (!letras.length) throw new Error(`Planta ${d.sha1} sem letras validadas`);
    const cotas = letras.map((L) => {
      const c = d.cotas.find((k) => k.letra === L);
      exigir(c?.valor_texto, `valor da cota ${L} na planta ${d.sha1}`);
      const dentro = Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= cx.left && c.x <= cx.left + cx.width && c.y >= cx.top && c.y <= cx.top + cx.height;
      return { letra: L, valor_texto: c.valor_texto, x: dentro ? Math.round((c.x - cx.left) * s) : -1, y: dentro ? Math.round((c.y - cx.top) * s) : -1 };
    }).slice(0, 4);
    const row = { name: d.sha1, fonte: exigir(d.fonte, `fonte da planta ${d.sha1}`), planta_src: `assets/plantas/${d.sha1}.png`, planta_w: W, planta_h: H };
    for (let i = 1; i <= 4; i++) {
      const c = cotas[i - 1];
      Object.assign(row, { [`c${i}_letra`]: c ? c.letra : '', [`c${i}_valor`]: c ? c.valor_texto : '', [`c${i}_x`]: c ? c.x : -1, [`c${i}_y`]: c ? c.y : -1 });
    }
    rows.push(row);
    extras[d.sha1] = {
      sha1: d.sha1, pdf_path: d.pdf_path, fonte: d.fonte, coletado_em: d.coletado_em,
      recorte_px: cx, // folha branca dentro do raster de 3400 px (sem redesenho)
      usos: d.usos, cotas: cotas.map(({ letra, valor_texto }) => ({ letra, valor_texto })),
      aria_label: `Animação da planta técnica oficial se desenhando, com as cotas ${listaPt(cotas.map((c) => `${c.letra} ${c.valor_texto} m`))}.`,
    };
  }
  return { dir, rows, extras, semFilme, porProduto, total_validas: lista.length };
}

// ---------------------------------------------------------------- coleções
// Coleções: 5 fotos em 6 s (cada peça fica parada mais tempo); lançamentos: os 6 spas reais.
const COLECOES = [
  { id: 'banheiras', path: '/banheiras.html', max: 5 },
  { id: 'spas', path: '/spas.html', max: 5 },
  { id: 'ofuros', path: '/ofuros.html', max: 5 },
  { id: 'sauna', path: '/sauna.html', max: 5 },
  { id: 'lancamentos', path: '/lancamentos.html', max: 6 },
];

function chaveDeVariedade(p) {
  return p.d_familia || p.slug.replace(/-\d.*$/, '');
}

async function prepararColecoes() {
  const dir = projeto('hf-colecao', 'colecao.html');
  mkdirSync(join(dir, 'assets', 'fotos'), { recursive: true });
  const rows = [], extras = {};
  for (const col of COLECOES) {
    const c = catPorPath.get(col.path);
    exigir(c, `categoria ${col.path}`);
    const escolhidas = [];
    const shaVisto = new Set(), varVisto = new Set();
    // 1ª passada: uma foto por modelo (variedade); 2ª: completa com outras fotos dos mesmos produtos.
    for (const passada of [1, 2]) {
      for (const slug of c.produtos) {
        if (escolhidas.length >= col.max) break;
        const p = porSlug.get(slug);
        if (!p || p.d_sem_foto) continue;
        if (passada === 1 && varVisto.has(chaveDeVariedade(p))) continue;
        for (const f of fotos[slug] || []) {
          if (f.fundo_vermelho || shaVisto.has(f.sha1)) continue;
          shaVisto.add(f.sha1); varVisto.add(chaveDeVariedade(p));
          escolhidas.push({ slug, foto: f });
          break;
        }
      }
    }
    if (!escolhidas.length) throw new Error(`Coleção ${col.path} sem fotos de fundo azul`);
    const row = {
      name: col.id,
      fonte: exigir(c.url, `url da coleção ${col.path}`),
      etiqueta: `${exigir(c.nome, 'nome da coleção')} · ${exigir(c.total_exibido, 'total da coleção')} produtos`,
      total_fotos: escolhidas.length,
    };
    escolhidas.forEach(({ slug, foto }, i) => {
      const maior = [...foto.webp].sort((a, b) => b.w - a.w)[0];
      const destino = join(dir, 'assets', 'fotos', `${slug}-${foto.n}.webp`);
      copyFileSync(join(paths.public, maior.src), destino);
      row[`f${i + 1}`] = `assets/fotos/${slug}-${foto.n}.webp`;
      row[`w${i + 1}`] = foto.wall || '#0C2A3D';
    });
    for (let i = escolhidas.length + 1; i <= 6; i++) { row[`f${i}`] = ''; row[`w${i}`] = '#0C2A3D'; }
    rows.push(row);
    extras[col.id] = {
      id: col.id, colecao: c.nome, path: c.path, fonte: c.url, total_exibido: c.total_exibido,
      fotos: escolhidas.map(({ slug, foto }) => ({ slug, n: foto.n, sha1: foto.sha1, fonte: foto.fonte })),
    };
  }
  return { dir, rows, extras };
}

// Caixa da peça na foto (frações 0 a 1): pixels claros e pouco saturados (acrílico e gel coat brancos)
// sobre o fundo da foto. Só mede; a foto não é alterada. Foto de fundo claro (saunas): a caixa ocupa a
// foto toda e vale como "sem medida".
async function caixaDaPeca(arq) {
  const N = 200;
  const { data } = await sharp(arq).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const col = new Array(N).fill(0), lin = new Array(N).fill(0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 3, mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mx > 170 && mx - mn < 60) { col[x]++; lin[y]++; }
  }
  const lim = N * 0.03;
  const ponta = (v) => [v.findIndex((c) => c > lim), N - 1 - [...v].reverse().findIndex((c) => c > lim)];
  const [x0, x1] = ponta(col), [y0, y1] = ponta(lin);
  if (x0 < 0 || y0 < 0) return null;
  const c = { x0: x0 / N, x1: (x1 + 1) / N, y0: y0 / N, y1: (y1 + 1) / N };
  return c.x1 - c.x0 > 0.97 && c.y1 - c.y0 > 0.97 ? null : c;
}

// Variante "quadro" (720x720) para os encaixes do site: as mesmas fotos, sem moldura, sem legenda e sem
// escurecer entre as peças (build/filmes/colecao-quadro.html). A legenda fica no HTML da página.
// Para a vitrine parecer uma sala de galeria e não uma sequência de slides: sai a foto em que a peça
// encosta na borda (fica cortada pela moldura), as fotos de mesmo ângulo ficam juntas (vista larga e
// baixa, de perspectiva, separada da vista de cima) e cada peça recebe um zoom só para perto, até 1,11
// (o arquivo de 800 px cobre o quadro de 720 sem ampliar), na direção de uma escala comum.
const ZOOM_MAX = 1.11, ALVO = 0.84, MARGEM = 0.03;
async function prepararQuadros(C) {
  const dir = projeto('hf-colecao-quadro', 'colecao-quadro.html');
  mkdirSync(join(dir, 'assets', 'fotos'), { recursive: true });
  const rows = [], fotosQuadro = {};
  for (const r of C.rows) {
    const itens = [];
    for (let i = 1; i <= 6; i++) {
      const f = r[`f${i}`];
      if (!f) continue;
      copyFileSync(join(C.dir, f), join(dir, f));
      const cx = await caixaDaPeca(join(dir, f));
      itens.push({ f, i, cx, foto: C.extras[r.name].fotos[i - 1] });
    }
    const encosta = (x) => x.cx && (x.cx.x0 < 0.02 || x.cx.y0 < 0.02 || x.cx.x1 > 0.98 || x.cx.y1 > 0.98);
    let lista = itens.filter((x) => !encosta(x));
    if (lista.length < 3) lista = itens;
    const angulo = (x) => (x.cx && (x.cx.x1 - x.cx.x0) / (x.cx.y1 - x.cx.y0) > 1.6 ? 'perspectiva' : 'cima');
    const grupos = ['perspectiva', 'cima'].map((g) => lista.filter((x) => angulo(x) === g)).filter((g) => g.length).sort((a, b) => b.length - a.length);
    lista = grupos.flat();
    const row = { name: `${r.name}-quadro`, fonte: r.fonte, total_fotos: lista.length };
    lista.forEach((x, k) => {
      let z = 1, o = '50% 50%';
      if (x.cx) {
        const { x0, x1, y0, y1 } = x.cx;
        const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
        // Zoom em torno do centro da peça, sem passar da margem do quadro em nenhum lado.
        const lado = (a, c, b) => Math.min(c - a > 0 ? (c - MARGEM) / (c - a) : 9, b - c > 0 ? (1 - MARGEM - c) / (b - c) : 9);
        z = Math.max(1, Math.min(ZOOM_MAX, ALVO / Math.max(x1 - x0, y1 - y0), lado(x0, cxm, x1), lado(y0, cym, y1)));
        o = `${(cxm * 100).toFixed(1)}% ${(cym * 100).toFixed(1)}%`;
      }
      row[`f${k + 1}`] = x.f;
      row[`z${k + 1}`] = Number(z.toFixed(3));
      row[`o${k + 1}`] = o;
    });
    for (let k = lista.length + 1; k <= 6; k++) { row[`f${k}`] = ''; row[`z${k}`] = 1; row[`o${k}`] = '50% 50%'; }
    rows.push(row);
    fotosQuadro[r.name] = lista.map((x) => x.foto);
  }
  return { dir, rows, fotosQuadro };
}

// ---------------------------------------------------------------- render e pós-processo
function renderizar(dir, rows, rotulo) {
  const pend = rows.filter((r) => FORCAR || !existsSync(join(dir, 'renders', `${r.name}.mp4`)));
  if (!pend.length) { console.log(`[${rotulo}] nada a renderizar (cache)`); return; }
  writeFileSync(join(dir, 'filmes.json'), JSON.stringify({ rows: pend }, null, 1));
  console.log(`[${rotulo}] renderizando ${pend.length} filme(s)…`);
  const t0 = Date.now();
  const r = spawnSync('npx', ['-y', HF, 'render', '--batch', 'filmes.json', '--strict-variables', '--output', 'renders/{name}.mp4',
    '--fps', '30', '--quality', 'looks', '--batch-concurrency', String(CONC), '--quiet'], { cwd: dir, env: ENV, stdio: 'inherit' });
  console.log(`[${rotulo}] render terminou com código ${r.status} em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const tam = (f) => statSync(f).size;

const execFileP = promisify(execFile);
async function ffmpeg(args) {
  await execFileP('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 24 });
}

/** Roda fn sobre os itens com no máximo n ao mesmo tempo, preservando a ordem do resultado. */
async function emLote(itens, n, fn) {
  const out = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; out[k] = await fn(itens[k], k); }
  }));
  return out;
}

function duracao(f) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
}

/** Codifica dentro do teto subindo o CRF dentro da faixa da SPEC; se não couber, registra. */
async function codificar(entrada, saida, formato) {
  const faixa = formato === 'mp4' ? [26, 27, 28, 29, 30] : [34, 35, 36, 37, 38];
  let crf;
  for (crf of formato === 'mp4' ? [28, 29, 30] : [36, 37, 38]) {
    if (formato === 'mp4') {
      await ffmpeg(['-i', entrada, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', saida]);
    } else {
      await ffmpeg(['-i', entrada, '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', '-an', saida]);
    }
    if (tam(saida) <= TETO) return { crf, dentro_do_teto: true, faixa };
  }
  return { crf, dentro_do_teto: tam(saida) <= TETO, faixa };
}

async function posProcessar(dir, id, sub, dims = { largura: LARG, altura: ALT }) {
  const bruto = join(dir, 'renders', `${id}.mp4`);
  if (!existsSync(bruto)) return null;
  const pasta = join(OUT, sub);
  mkdirSync(pasta, { recursive: true });
  const mp4 = join(pasta, `${id}.mp4`), webm = join(pasta, `${id}.webm`);
  const avif = join(pasta, `${id}-poster.avif`), webp = join(pasta, `${id}-poster.webp`);
  const marca = join(dir, 'renders', `${id}.pronto.json`);
  let enc;
  if (!FORCAR && existsSync(marca) && [mp4, webm, avif, webp].every(existsSync)) {
    enc = lerJSON(marca);
  } else {
    const [m, w] = await Promise.all([codificar(bruto, mp4, 'mp4'), codificar(bruto, webm, 'webm')]);
    const ultimo = join(dir, 'renders', `${id}-ultimo.png`);
    await ffmpeg(['-sseof', '-0.1', '-i', bruto, '-update', '1', '-frames:v', '1', ultimo]);
    await sharp(ultimo).avif({ quality: 55, effort: 6 }).toFile(avif);
    await sharp(ultimo).webp({ quality: 80 }).toFile(webp);
    enc = { mp4_crf: m.crf, webm_crf: w.crf };
    writeFileSync(marca, JSON.stringify(enc));
  }
  const rel = (f) => `media/filmes/${sub}/${f.split('/').pop()}`;
  return {
    largura: dims.largura, altura: dims.altura, fps: 30, duracao_s: Number(duracao(mp4).toFixed(2)), audio: false,
    webm: { src: rel(webm), bytes: tam(webm), crf: enc.webm_crf, codec: 'vp9' },
    mp4: { src: rel(mp4), bytes: tam(mp4), crf: enc.mp4_crf, codec: 'h264' },
    poster: { avif: { src: rel(avif), bytes: tam(avif) }, webp: { src: rel(webp), bytes: tam(webp) }, quadro: 'último' },
    dentro_do_teto: tam(mp4) <= TETO && tam(webm) <= TETO,
  };
}

// ---------------------------------------------------------------- principal
mkdirSync(OUT, { recursive: true });
const anterior = existsSync(MANIFESTO) ? lerJSON(MANIFESTO) : null;
const manifesto = {
  gerado_em: new Date().toISOString(),
  coletado_em: meta.data_coleta || null,
  ferramenta: HF,
  regra: 'WebM VP9 + MP4 H.264 1280x720 (variante quadro de coleção: 720x720, sem moldura e sem legenda), 30 fps, sem áudio, até 350 KB por arquivo; poster = último quadro (AVIF e WebP). Só imagens e números reais de data/.',
  uso: '<video muted playsinline loop preload="none" poster> com <source> WebM e MP4 atribuídos depois do load e quando visível; lite e movimento reduzido: só o poster. Planta sem filme: planta estática (media/plantas/<sha1>/planta-1200.webp).',
  planta: anterior?.planta || {},
  colecao: anterior?.colecao || {},
  sem_filme: anterior?.sem_filme || { plantas: [], tamanhos: [] },
  por_produto: anterior?.por_produto || {},
};

if (TIPO === 'planta' || TIPO === 'todos') {
  const P = await prepararPlantas();
  console.log(`[planta] ${P.rows.length} no lote; ${P.total_validas} plantas validadas no total`);
  if (!SEM_RENDER) renderizar(P.dir, P.rows, 'planta');
  manifesto.planta = {};
  const semFilme = [...P.semFilme];
  const feitos = SEM_RENDER ? [] : await emLote(P.rows, 4, (r) => posProcessar(P.dir, r.name, 'planta'));
  for (const [k, r] of P.rows.entries()) {
    const f = feitos[k] || null;
    if (!f) { semFilme.push({ sha1: r.name, pdf_path: P.extras[r.name].pdf_path, motivo: SEM_RENDER ? 'não renderizado nesta rodada' : 'render falhou' }); continue; }
    manifesto.planta[r.name] = { ...P.extras[r.name], ...f };
    if (!f.dentro_do_teto) console.warn(`[planta] ${r.name} acima de 350 KB`);
  }
  manifesto.sem_filme.plantas = semFilme;
  manifesto.por_produto = {};
  manifesto.sem_filme.tamanhos = [];
  for (const [slug, tams] of Object.entries(P.porProduto)) {
    manifesto.por_produto[slug] = tams.map((t) => {
      const tem = t.sha1 && manifesto.planta[t.sha1];
      if (!tem) manifesto.sem_filme.tamanhos.push({ slug, rotulo: t.rotulo, sha1: t.sha1, motivo: t.sha1 ? (semFilme.find((s) => s.sha1 === t.sha1)?.motivo || 'sem filme') : 'planta deste tamanho não publicada pela fábrica' });
      return { rotulo: t.rotulo, sha1: t.sha1, filme: tem ? `planta/${t.sha1}` : null };
    });
  }
}

if (TIPO === 'colecao' || TIPO === 'todos') {
  const C = await prepararColecoes();
  if (!SEM_RENDER) renderizar(C.dir, C.rows, 'colecao');
  manifesto.colecao = {};
  for (const r of C.rows) {
    const f = SEM_RENDER ? null : await posProcessar(C.dir, r.name, 'colecao');
    if (f) manifesto.colecao[r.name] = { ...C.extras[r.name], ...f };
    else console.warn(`[colecao] ${r.name} sem filme`);
    if (f && !f.dentro_do_teto) console.warn(`[colecao] ${r.name} acima de 350 KB`);
  }
  const Q = await prepararQuadros(C);
  if (!SEM_RENDER) renderizar(Q.dir, Q.rows, 'colecao-quadro');
  for (const r of Q.rows) {
    const id = r.name.replace(/-quadro$/, '');
    const f = SEM_RENDER ? null : await posProcessar(Q.dir, r.name, 'colecao', { largura: 720, altura: 720 });
    if (f && manifesto.colecao[id]) manifesto.colecao[id].quadro = { ...f, fotos: Q.fotosQuadro[id] };
    else console.warn(`[colecao] ${r.name} sem filme quadrado`);
    if (f && !f.dentro_do_teto) console.warn(`[colecao] ${r.name} acima de 350 KB`);
  }
}

const n = Object.keys(manifesto.planta).length;
manifesto.resumo = {
  filmes_planta: n,
  filmes_colecao: Object.keys(manifesto.colecao).length,
  plantas_sem_filme: manifesto.sem_filme.plantas.length,
  tamanhos_sem_filme: manifesto.sem_filme.tamanhos.length,
  acima_do_teto: [...Object.values(manifesto.planta), ...Object.values(manifesto.colecao)].filter((f) => !f.dentro_do_teto).map((f) => f.sha1 || f.id),
  bytes_total: [...Object.values(manifesto.planta), ...Object.values(manifesto.colecao)].reduce((s, f) => s + f.webm.bytes + f.mp4.bytes + f.poster.avif.bytes + f.poster.webp.bytes, 0),
};
writeFileSync(MANIFESTO, JSON.stringify(manifesto, null, 1));
console.log('manifesto:', JSON.stringify(manifesto.resumo));
