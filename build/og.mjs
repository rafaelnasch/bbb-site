// SPEC 7.3: imagens de compartilhamento 1200x630 (JPEG 85) com Playwright sobre um template HTML.
// Sala escura, moldura com a foto real, nome literal, medida principal (rótulo literal da opção de
// tamanho, sem o acréscimo de preço), logo oficial clareado. Nunca preço: a imagem fica em cache
// no WhatsApp e o preço muda.
//  - public/media/og/<slug>.jpg (292 produtos)
//  - public/media/og/colecao/<path com hífens>.jpg (60 coleções)
//  - public/media/og/padrao.jpg
//  - public/media/og/manifest.json
// Medida omitida quando a ficha e a opção de tamanho divergem (d_medida_confirmada=false): o
// conflito não é escolhido numa imagem que não comporta a nota.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { paths } from '../site.config.mjs';

const OUT = join(paths.public, 'media', 'og');
mkdirSync(join(OUT, 'colecao'), { recursive: true });
const forcar = process.argv.includes('--force');

const produtos = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
const categorias = JSON.parse(readFileSync(join(paths.data, 'categorias.json'), 'utf8'));
const empresa = JSON.parse(readFileSync(join(paths.data, 'empresa.json'), 'utf8'));
const fotos = JSON.parse(readFileSync(join(paths.public, 'media', 'p', 'manifest.json'), 'utf8')).produtos;

// Tipografia da SPEC 5.3 embutida no template (data URI), sem depender de fonte instalada no Mac:
// sem isto o Chromium cai em Georgia e Helvetica.
const fonte = (arq) => `data:font/woff2;base64,${readFileSync(join(paths.root, 'src', 'fonts', arq)).toString('base64')}`;
const FONTES_CSS = `@font-face{font-family:"Newsreader";src:url(${fonte('newsreader-var-latin.woff2')}) format("woff2");font-weight:300 500;font-style:normal}
  @font-face{font-family:"Jost";src:url(${fonte('jost-var-latin.woff2')}) format("woff2");font-weight:300 600;font-style:normal}`;

// Cache por conteúdo: a chave é o sha1 do HTML completo (texto, foto e fontes em data URI). Se nome,
// medida, foto ou template mudarem, a chave muda e a imagem é refeita; o manifesto anterior guarda
// as chaves das imagens já geradas.
const manifestPath = join(OUT, 'manifest.json');
const anterior = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const chavesAntigas = new Map();
for (const x of [...Object.values(anterior.produtos || {}), ...Object.values(anterior.colecoes || {}), anterior.padrao_info || {}]) {
  if (x?.src && x?.chave) chavesAntigas.set(x.src, x.chave);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Logo oficial clareado (mesma forma, cor porcelana), sem redesenhar.
async function logoClaro() {
  const src = join(paths.recon, 'brand', 'logo-bbb-azul-oficial-206x99.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0xf3;
    data[i + 1] = 0xf6;
    data[i + 2] = 0xf8;
  }
  const png = await sharp(data, { raw: info }).png().toBuffer();
  return { uri: `data:image/png;base64,${png.toString('base64')}`, w: info.width, h: info.height };
}

function fotoPrincipal(slug) {
  const lista = fotos[slug] || [];
  const azul = lista.filter((f) => !f.fundo_vermelho);
  const f = azul.find((x) => x.principal) || azul[0] || lista[0];
  if (!f) return null;
  const buf = readFileSync(join(paths.public, f.jpg.src));
  return { uri: `data:image/jpeg;base64,${buf.toString('base64')}`, wall: f.wall || '#0C2A3D', alt: f.alt, sha1: f.sha1 };
}

function medidaPrincipal(p) {
  if (p.d_medida_confirmada === false) return null;
  const t = (p.d_tamanhos || [])[0];
  if (!t) return null;
  // Rótulo literal da opção de tamanho; sem opção, o texto literal da ficha (que já traz "m").
  const literal = t.rotulo ?? t.rotulo_ficha;
  if (!literal) return null;
  const rotulo = String(literal).split(/\+\s*R\$/)[0].trim();
  const outras = p.d_tamanhos.length - 1;
  return { rotulo, outras, unidade: t.rotulo ? ' m' : '' };
}

function pagina({ foto, etiqueta, titulo, linha, logo, vazio }) {
  const tamTitulo = titulo.length > 70 ? 44 : titulo.length > 48 ? 52 : 60;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  ${FONTES_CSS}
  *{box-sizing:border-box;margin:0}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{background:radial-gradient(120% 90% at 70% 40%,#0C2A3D 0%,#071C2B 60%,#04121C 100%);color:#F3F6F8;
    font-family:"Jost","Helvetica Neue",Helvetica,Arial,sans-serif;display:flex;align-items:center;padding:56px 64px;gap:56px}
  .moldura{flex:0 0 470px;height:470px;border-radius:14px;padding:22px;background:#F3F6F8;
    box-shadow:0 0 0 1px rgba(141,187,217,.35),0 40px 90px -20px ${foto ? foto.wall : '#0C2A3D'}cc,0 0 120px -10px rgba(233,184,124,.25)}
  .moldura .img{width:100%;height:100%;border-radius:4px;background:${foto ? foto.wall : '#0C2A3D'} center/cover no-repeat;${foto ? `background-image:url(${foto.uri})` : ''}}
  .vazio{width:100%;height:100%;border:1px dashed #8DBBD9;border-radius:4px;display:flex;align-items:center;justify-content:center;
    text-align:center;padding:40px;font-size:26px;line-height:1.35;color:#4A5862;background:#E9DFD0}
  .texto{flex:1;display:flex;flex-direction:column;gap:22px;min-width:0}
  .etq{font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#8DBBD9}
  h1{font-family:Newsreader,Georgia,"Times New Roman",serif;font-weight:300;font-size:${tamTitulo}px;line-height:1.08;letter-spacing:-.01em}
  .linha{font-size:26px;color:#F3F6F8;font-variant-numeric:tabular-nums;opacity:.92}
  .traco{width:72px;height:2px;background:#E9B87C}
  .logo{margin-top:18px;align-self:flex-start;width:auto;height:${Math.round(logo.h * 0.62)}px}
  </style></head><body>
  <div class="moldura">${vazio ? `<div class="vazio">${esc(vazio)}</div>` : '<div class="img"></div>'}</div>
  <div class="texto">
    ${etiqueta ? `<div class="etq">${esc(etiqueta)}</div>` : ''}
    <h1>${esc(titulo)}</h1>
    <div class="traco"></div>
    ${linha ? `<div class="linha">${esc(linha)}</div>` : ''}
    <img class="logo" src="${logo.uri}" alt="">
  </div></body></html>`;
}

async function abrirNavegador() {
  try {
    return await chromium.launch();
  } catch (e) {
    // Revisão do Chromium esperada pelo Playwright ausente: usa a mais nova já instalada.
    const base = join(homedir(), 'Library', 'Caches', 'ms-playwright');
    const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
    for (const d of dirs) {
      const exe = join(base, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
      const exe2 = join(base, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      for (const x of [exe2, exe]) if (existsSync(x)) return chromium.launch({ executablePath: x });
    }
    throw e;
  }
}

const logo = await logoClaro();
const browser = await abrirNavegador();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

let refeitas = 0;
async function render(html, arquivo, src) {
  const chave = createHash('sha1').update(html).digest('hex');
  if (existsSync(arquivo) && !forcar && chavesAntigas.get(src) === chave) return chave;
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // Falha se a fonte embutida não carregou (o fallback silencioso foi o defeito anterior).
  const ok = await page.evaluate(() => document.fonts.check('300 60px Newsreader') && document.fonts.check('400 26px Jost') && [...document.fonts].every((f) => f.status === 'loaded'));
  if (!ok) throw new Error(`og: fontes da SPEC 5.3 não carregaram em ${arquivo}`);
  await page.screenshot({ path: arquivo, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  refeitas++;
  return chave;
}

const manifest = { gerado_em: new Date().toISOString(), largura: 1200, altura: 630, fontes: ['Newsreader', 'Jost'], produtos: {}, colecoes: {}, padrao: 'media/og/padrao.jpg', padrao_info: null };

const ROTULO_TIPO = { banheira: 'Banheira', spa: 'Spa', ofuro: 'Ofurô', sauna: 'Sauna', acessorio: 'Acessório' };
let n = 0;
for (const p of produtos) {
  const foto = fotoPrincipal(p.slug);
  const m = medidaPrincipal(p);
  const e = p.especificacoes || {};
  const etiqueta = [e.Forma, e.Lugares, e.Material].filter(Boolean).join(' · ') || ROTULO_TIPO[p.d_tipo] || '';
  const linha = m ? `${m.rotulo}${m.unidade}${m.outras > 0 ? ` · e mais ${m.outras} ${m.outras === 1 ? 'medida' : 'medidas'}` : ''}` : null;
  const arquivo = `${p.slug}.jpg`;
  const src = `media/og/${arquivo}`;
  const chave = await render(
    pagina({ foto, etiqueta, titulo: p.nome, linha, logo, vazio: foto ? null : 'Foto e planta deste modelo sob consulta' }),
    join(OUT, arquivo),
    src,
  );
  manifest.produtos[p.slug] = { src, medida: m?.rotulo ?? null, foto_sha1: foto?.sha1 ?? null, chave };
  if (++n % 50 === 0) console.log(`og: ${n}/${produtos.length}`);
}

for (const c of categorias) {
  const primeiro = c.produtos.find((s) => (fotos[s] || []).length);
  const foto = primeiro ? fotoPrincipal(primeiro) : null;
  const nome = c.d_path.replace(/\.html$/, '').replace(/\//g, '--');
  const arquivo = `colecao/${nome}.jpg`;
  const linha = `${c.total_exibido} ${c.total_exibido === 1 ? 'modelo' : 'modelos'}`;
  const src = `media/og/${arquivo}`;
  const chave = await render(pagina({ foto, etiqueta: empresa.nome, titulo: c.nome, linha, logo, vazio: foto ? null : empresa.nome }), join(OUT, arquivo), src);
  manifest.colecoes[c.d_path] = { src, foto_de: primeiro ?? null, chave };
}

// Cidade da fábrica lida do endereço publicado (último trecho, "Cidade-UF").
const cidadeFabrica = (() => {
  const m = String(empresa.endereco_fabrica || '').split(',').pop().trim().match(/^(.+?)\s*-\s*([A-Z]{2})$/);
  return m ? `${m[1]}, ${m[2]}` : null;
})();
{
  const raiz = categorias.find((c) => c.d_path === 'banheiras.html');
  const s = raiz?.produtos.find((x) => (fotos[x] || []).length);
  const chave = await render(
    pagina({
      foto: s ? fotoPrincipal(s) : null,
      etiqueta: empresa.nome,
      titulo: 'Banheiras, spas e ofurôs de hidromassagem',
      linha: cidadeFabrica ? `Direto da fábrica em ${cidadeFabrica}` : null,
      logo,
    }),
    join(OUT, 'padrao.jpg'),
    manifest.padrao,
  );
  manifest.padrao_info = { src: manifest.padrao, chave };
}
await browser.close();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
console.log(`og: ${refeitas} imagens refeitas; ${Object.keys(manifest.produtos).length} produtos, ${Object.keys(manifest.colecoes).length} coleções e padrão; manifesto em public/media/og/manifest.json`);
