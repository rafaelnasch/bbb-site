// Verificações de SEO/GEO/AEO sobre dist/ (SPEC 11 e 14, linha "SEO"). Chamadas pelo validate.mjs;
// qualquer erro derruba o build.
//
//  - JSON-LD: um bloco por página, estrutura validada (build/lib/jsonld.mjs), Organization completa sem
//    taxID nem legalName em todas, BreadcrumbList em todas menos a home e o 404, Product nos produtos,
//    CollectionPage + ItemList nas coleções na ordem e na contagem exibidas.
//  - Cabeça: título e descrição únicos entre as páginas que não são ponte, tamanhos dentro da faixa,
//    Open Graph e Twitter completos com og:url igual ao canonical e imagem existente em dist/, CSP por meta.
//  - Sitemaps: índice com os 4 filhos, só URLs canônicas e indexáveis, nenhuma ponte, arquivos e imagens
//    existentes; robots.txt de acordo com INDEXAR.
//  - llms.txt, llms-full.txt e dados/catalogo.json presentes, com links que resolvem e sem termo proibido.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { paths, SITE_URL, BASE_PATH, INDEXAR } from '../../site.config.mjs';
import { validarJsonLd, ORG_ID } from './jsonld.mjs';
import { termosSaudeSpec } from './texto.mjs';
import { SITEMAPS, ROBOS, registro } from '../seo.mjs';

const PROIBIDOS = [/\(VERIFICAR\)/, /BANHEIRA COLORIDA/i, /a maior loja/i, /a única com selo/i, /\blorem\b/i, /\bgarantia de \d/i];
const CSP_DIRETIVAS = ["default-src 'self'", "img-src 'self' data:", "media-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "connect-src 'self'", 'frame-src https://www.google.com https://www.youtube-nocookie.com', "base-uri 'self'", "form-action 'none'"];

const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const meta = (h, attr, nome) => {
  const m = new RegExp(`<meta ${attr}="${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content="([^"]*)">`).exec(h);
  return m ? dec(m[1]) : null;
};

function htmls(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...htmls(p));
    else if (n.endsWith('.html')) out.push(p);
  }
  return out;
}

/** URL absoluta do site -> arquivo em dist/ (ou null se não for do site). */
export function arquivoDaUrl(u, dist = paths.dist) {
  if (!u.startsWith(`${SITE_URL}/`)) return null;
  let rel;
  try { rel = decodeURIComponent(u.slice(SITE_URL.length + 1).split(/[?#]/)[0]); } catch { return undefined; }
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return join(dist, rel);
}

function locs(xmlTxt, tag = 'loc') {
  return [...xmlTxt.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))].map((m) => dec(m[1]));
}

export function verificarSeo(dist = paths.dist) {
  const erros = [];
  const erro = (arq, msg) => erros.push(`${arq}: ${msg}`);
  const produtos = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
  const categorias = JSON.parse(readFileSync(join(paths.data, 'categorias.json'), 'utf8'));
  const slugProd = new Map(produtos.map((p) => [`${p.slug}.html`, p]));
  const catPath = new Map(categorias.map((c) => [c.d_path, c]));
  const regs = registro(dist);
  const regPorSaida = new Map(regs.map((r) => [r.saida, r]));
  const titulos = new Map();
  const descricoes = new Map();
  const variantesPorGrupo = new Map();
  const materialPorProduto = new Map();

  // ---- páginas ----------------------------------------------------------------------------
  for (const f of htmls(dist)) {
    const rel = relative(dist, f).split('\\').join('/');
    const h = readFileSync(f, 'utf8');
    const ponte = /<meta http-equiv="refresh"/i.test(h);
    const blocos = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const canonical = /<link rel="canonical" href="([^"]+)">/.exec(h)?.[1];

    // Open Graph e Twitter em 100% das páginas (SPEC 11.1)
    const ogImg = meta(h, 'property', 'og:image');
    for (const [a, n] of [['property', 'og:type'], ['property', 'og:title'], ['property', 'og:description'], ['property', 'og:url'], ['property', 'og:locale'], ['property', 'og:site_name'], ['name', 'twitter:card'], ['name', 'twitter:title'], ['name', 'twitter:description'], ['name', 'twitter:image']]) {
      if (!meta(h, a, n)) erro(rel, `sem ${n}`);
    }
    if (meta(h, 'property', 'og:locale') && meta(h, 'property', 'og:locale') !== 'pt_BR') erro(rel, 'og:locale diferente de pt_BR');
    if (meta(h, 'name', 'twitter:card') && meta(h, 'name', 'twitter:card') !== 'summary_large_image') erro(rel, 'twitter:card diferente de summary_large_image');
    if (canonical && meta(h, 'property', 'og:url') && meta(h, 'property', 'og:url') !== dec(canonical)) erro(rel, 'og:url diferente do canonical');
    if (ogImg) {
      const a = arquivoDaUrl(ogImg, dist);
      if (!a || !existsSync(a)) erro(rel, `og:image inexistente em dist/: ${ogImg}`);
    }

    // CSP por meta (SPEC 11.1)
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(h)?.[1];
    if (!csp) erro(rel, 'sem CSP');
    else if (ponte) {
      // A ponte tem CSP própria, mais estreita (só o hash do redirecionamento): basta não abrir nada a mais.
      const c = dec(csp);
      if (/'unsafe-eval'|\*|https?:/.test(c.replace(/frame-src[^;]*/, ''))) erro(rel, `CSP da ponte mais aberta que o necessário: ${c}`);
      if (!/default-src 'self'/.test(c) || !/form-action 'none'/.test(c)) erro(rel, 'CSP da ponte sem default-src ou form-action');
    } else {
      const c = dec(csp);
      for (const d of CSP_DIRETIVAS) if (!c.includes(d)) erro(rel, `CSP sem "${d}"`);
      const sc = /script-src ([^;]+)/.exec(c)?.[1] || '';
      if (!/^'self'( 'sha256-[A-Za-z0-9+/=]+')*$/.test(sc.trim())) erro(rel, `CSP script-src fora do padrão: ${sc}`);
    }

    if (ponte) continue;

    // Título e descrição únicos e no tamanho
    const t = dec(/<title>([^<]*)<\/title>/.exec(h)?.[1] || '');
    const d = meta(h, 'name', 'description') || '';
    const reg = regPorSaida.get(rel);
    const indexavel = reg && !/noindex/.test(reg.robots) && !/^_/.test(rel);
    if (indexavel) {
      if (titulos.has(t)) erro(rel, `título repetido de ${titulos.get(t)}: "${t}"`);
      titulos.set(t, rel);
      if (descricoes.has(d)) erro(rel, `descrição repetida de ${descricoes.get(d)}`);
      descricoes.set(d, rel);
    }
    if (t.length < 15 || t.length > 60) erro(rel, `título com ${t.length} caracteres: "${t}"`);
    if (d.length < 70 || d.length > 170) erro(rel, `descrição com ${d.length} caracteres`);
    if (slugProd.has(rel) && t.length > 60) erro(rel, `título de produto acima de 60: "${t}"`);
    if (slugProd.has(rel) && (d.length < 140 || d.length > 160)) erro(rel, `descrição de produto fora de 140 a 160 (${d.length})`);
    if (slugProd.has(rel)) {
      const pr = slugProd.get(rel);
      // Nome literal: o <title> só pode cortar no fim (com reticências), nunca tirar um trecho do meio;
      // og:title e twitter:title levam o nome completo.
      const nome = String(pr.nome).replace(/\s+/g, ' ').trim();
      const base = t.replace(/ \| (Banheiras Bom Banho|BBB)$/, '').replace(/ \([^()]+\)$/, (m) => (m === ` (${pr.sku})` ? '' : m));
      if (!(base === nome || (base.endsWith('…') && nome.startsWith(base.slice(0, -1))))) erro(rel, `título não é o nome literal nem um corte no fim dele: "${t}"`);
      if (meta(h, 'property', 'og:title') !== nome || meta(h, 'name', 'twitter:title') !== nome) erro(rel, 'og:title/twitter:title diferente do nome literal');
      // Ficha x opção de tamanho em conflito (SPEC 15): nenhuma das medidas vai para a description.
      if (pr.d_medida_confirmada === false && /\d+,\d+\s*x\s*\d+,\d+/.test(d)) erro(rel, 'description com medida em produto de medida a confirmar');
      // Concordância da forma com o tipo masculino (spa, ofurô)
      if (/\b(Spa|Ofurô) (quadrada|redonda)\b/.test(d)) erro(rel, 'description com forma no gênero errado');
    }

    // JSON-LD
    if (blocos.length !== 1) { erro(rel, `${blocos.length} blocos JSON-LD (esperado 1)`); continue; }
    let bloco;
    try { bloco = JSON.parse(blocos[0]); } catch (e) { erro(rel, `JSON-LD inválido: ${e.message}`); continue; }
    const p = slugProd.get(rel);
    for (const e of validarJsonLd(bloco, { semImagem: Boolean(p?.d_sem_foto) })) erro(rel, `JSON-LD: ${e}`);
    const nos = bloco['@graph'] || [];
    const tem = (t) => nos.find((n) => [].concat(n['@type']).includes(t));
    const org = nos.find((n) => n['@id'] === ORG_ID);
    if (!org) erro(rel, 'sem Organization');
    else if ('taxID' in org || 'legalName' in org) erro(rel, 'Organization com taxID ou legalName');
    if (rel !== 'index.html' && rel !== '404.html' && !tem('BreadcrumbList')) erro(rel, 'sem BreadcrumbList');
    if (rel === 'index.html') {
      const ws = tem('WebSite');
      if (!ws?.potentialAction?.target?.urlTemplate?.endsWith('/busca.html?q={search_term_string}')) erro(rel, 'home sem WebSite + SearchAction');
    }
    if (p) {
      const prod = tem('Product');
      if (!prod) erro(rel, 'produto sem Product');
      else {
        if (prod.name !== p.nome || prod.sku !== p.sku) erro(rel, 'Product com nome ou SKU diferente dos dados');
        const of = prod.offers;
        if (of && of.price !== p.preco.valores_numericos.finalPrice) erro(rel, 'Product.offers.price diferente de finalPrice');
        const disp = p.disponibilidade === 'Esgotado' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
        if (of && of.availability !== disp) erro(rel, 'Product.offers.availability diferente da disponibilidade');
        if ('manufacturer' in prod) erro(rel, 'Product com manufacturer (não sai de campo da fonte)');
        const grupo = tem('ProductGroup');
        if (grupo) {
          if (grupo.variesBy.some((v) => !/^https:\/\/schema\.org\//.test(v))) erro(rel, `ProductGroup.variesBy fora do schema.org: ${grupo.variesBy.join(', ')}`);
          if (!grupo.hasVariant.some((v) => v['@id'] === prod['@id']) || prod.isVariantOf?.['@id'] !== grupo['@id']) erro(rel, 'ProductGroup sem o próprio produto');
          for (const v of grupo.hasVariant) (variantesPorGrupo.get(grupo['@id']) || variantesPorGrupo.set(grupo['@id'], new Set()).get(grupo['@id'])).add(v['@id']);
        }
        materialPorProduto.set(prod['@id'], prod.material ?? null);
      }
    }
    if (tem('FAQPage') && rel !== 'perguntas-frequentes.html') erro(rel, 'FAQPage fora de perguntas-frequentes.html (marcar uma única instância da FAQ repetida)');
    const cat = catPath.get(rel);
    if (cat) {
      const cp = tem('CollectionPage');
      const lista = cp?.mainEntity?.itemListElement || [];
      if (!cp) erro(rel, 'coleção sem CollectionPage');
      const esperado = (cat.produtos || []).filter((s) => slugProd.has(`${s}.html`)).map((s) => `${SITE_URL}/${s}.html`);
      if (lista.map((x) => x.url).join('|') !== esperado.join('|')) erro(rel, 'ItemList diferente da lista e da ordem da coleção');
    }
  }

  // ProductGroup: as versões de um grupo diferem pelo material declarado (variesBy), sem repetir valor.
  for (const [gid, ids] of variantesPorGrupo) {
    const mats = [...ids].map((i) => materialPorProduto.get(i));
    if (mats.some((m) => !m) || new Set(mats).size !== mats.length) erro(gid, `ProductGroup com material ausente ou repetido entre as variantes: ${mats.join(', ')}`);
  }

  // ---- sitemaps ---------------------------------------------------------------------------
  const idx = join(dist, 'sitemap.xml');
  if (!existsSync(idx)) erro('sitemap.xml', 'ausente');
  else {
    const filhos = locs(readFileSync(idx, 'utf8'));
    if (!/<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(readFileSync(idx, 'utf8'))) erro('sitemap.xml', 'não é sitemapindex');
    for (const s of SITEMAPS) if (!filhos.includes(`${SITE_URL}/${s}`)) erro('sitemap.xml', `sem ${s}`);
    const vistos = new Set();
    for (const s of SITEMAPS) {
      const arq = join(dist, s);
      if (!existsSync(arq)) { erro(s, 'ausente'); continue; }
      const x = readFileSync(arq, 'utf8');
      if (!x.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset')) erro(s, 'cabeçalho XML inválido');
      if ((x.match(/<url>/g) || []).length !== (x.match(/<\/url>/g) || []).length) erro(s, 'XML desbalanceado');
      if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(x)) erro(s, '& sem escape');
      const us = locs(x.replace(/<image:loc>[^<]*<\/image:loc>/g, ''));
      if (us.length > 50000) erro(s, 'mais de 50.000 URLs');
      for (const u of us) {
        if (/[\s[\]]/.test(u)) erro(s, `URL sem codificação: ${u}`);
        if (vistos.has(u)) erro(s, `URL repetida entre sitemaps: ${u}`);
        vistos.add(u);
        const a = arquivoDaUrl(u, dist);
        if (!a || !existsSync(a)) { erro(s, `URL sem arquivo em dist/: ${u}`); continue; }
        if (!a.endsWith('.html')) continue;
        const h = readFileSync(a, 'utf8');
        if (/<meta http-equiv="refresh"/i.test(h)) erro(s, `ponte no sitemap: ${u}`);
        const can = /<link rel="canonical" href="([^"]+)">/.exec(h)?.[1];
        if (can && decodeURIComponent(dec(can)) !== decodeURIComponent(u)) erro(s, `URL não canônica: ${u}`);
        const rel = relative(dist, a).split('\\').join('/');
        const reg = regPorSaida.get(rel);
        if (!reg || /noindex/.test(reg.robots)) erro(s, `página noindex no sitemap: ${u}`);
        if (INDEXAR && /<meta name="robots" content="[^"]*noindex/.test(h)) erro(s, `página com noindex no sitemap: ${u}`);
      }
      for (const i of locs(x, 'image:loc')) {
        const a = arquivoDaUrl(i, dist);
        if (!a || !existsSync(a)) erro(s, `imagem sem arquivo em dist/: ${i}`);
      }
    }
    // Cobertura: todo produto e toda coleção indexáveis estão no sitemap certo.
    const prodSm = new Set((existsSync(join(dist, 'sitemap-produtos.xml')) ? locs(readFileSync(join(dist, 'sitemap-produtos.xml'), 'utf8').replace(/<image:loc>[^<]*<\/image:loc>/g, '')) : []).map(decodeURIComponent));
    for (const r of regs) {
      if (/noindex/.test(r.robots) || r.canonical !== `${SITE_URL}/${r.caminho}`) continue;
      if (slugProd.has(r.saida) && !prodSm.has(r.canonical)) erro('sitemap-produtos.xml', `produto indexável ausente: ${r.saida}`);
    }
  }

  // ---- robots -----------------------------------------------------------------------------
  const rob = existsSync(join(dist, 'robots.txt')) ? readFileSync(join(dist, 'robots.txt'), 'utf8') : null;
  if (!rob) erro('robots.txt', 'ausente');
  else if (!INDEXAR) {
    if (!/User-agent: \*\nDisallow: \/\n/.test(rob)) erro('robots.txt', 'INDEXAR=false sem "Disallow: /"');
    if (/^Sitemap:/m.test(rob)) erro('robots.txt', 'INDEXAR=false com linha Sitemap');
  } else {
    if (!rob.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) erro('robots.txt', 'sem Sitemap');
    if (/^Disallow: \/\s*$/m.test(rob)) erro('robots.txt', 'INDEXAR=true com "Disallow: /"');
    for (const ua of ['*', ...ROBOS]) {
      const bloco = new RegExp(`User-agent: ${ua.replace('*', '\\*')}\\n((?:(?:Allow|Disallow): .*\\n?)+)`).exec(rob)?.[1] || '';
      for (const r of ['Allow: /', `Disallow: ${BASE_PATH}/busca.html`, `Disallow: ${BASE_PATH}/comparar.html`, `Disallow: ${BASE_PATH}/*?*`]) if (!bloco.includes(r)) erro('robots.txt', `bloco ${ua} sem "${r}"`);
    }
  }

  // ---- llms e dados abertos ---------------------------------------------------------------
  for (const nome of ['llms.txt', 'llms-full.txt']) {
    const arq = join(dist, nome);
    if (!existsSync(arq)) { erro(nome, 'ausente'); continue; }
    const t = readFileSync(arq, 'utf8');
    if (!t.startsWith('# ')) erro(nome, 'não começa com título "# "');
    const s = termosSaudeSpec(t);
    if (s.length) erro(nome, `termo de saúde: ${s.join(', ')}`);
    for (const re of PROIBIDOS) if (re.test(t)) erro(nome, `termo proibido ${re}`);
    if (/(?![\u00a9\u00ae\u2122](?!\uFE0F))\p{Extended_Pictographic}/u.test(t)) erro(nome, 'emoji');
    if ((t.match(/—/g) || []).length > 2) erro(nome, 'mais de 2 travessões');
    for (const [u] of t.matchAll(new RegExp(`${SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^\\s)\\]]*`, 'g'))) {
      const a = arquivoDaUrl(u.replace(/[.,;:]+$/, ''), dist);
      // /x é servido a partir de x.html (GitHub Pages); as fontes literais do site atual usam esse formato.
      if (!a || !(existsSync(a) || existsSync(`${a}.html`))) erro(nome, `link sem arquivo em dist/: ${u}`);
    }
  }
  const llms = existsSync(join(dist, 'llms.txt')) ? readFileSync(join(dist, 'llms.txt'), 'utf8') : '';
  for (const alvo of ['llms-full.txt', 'dados/catalogo.json']) if (!llms.includes(`${SITE_URL}/${alvo}`)) erro('llms.txt', `sem link para ${alvo}`);
  const full = existsSync(join(dist, 'llms-full.txt')) ? readFileSync(join(dist, 'llms-full.txt'), 'utf8') : '';
  for (const p of produtos) if (!full.includes(`- Nº de catálogo (SKU): ${p.sku}\n`)) erro('llms-full.txt', `sem o produto ${p.slug}`);
  const catF = join(dist, 'dados', 'catalogo.json');
  if (!existsSync(catF)) erro('dados/catalogo.json', 'ausente');
  else {
    let c;
    try { c = JSON.parse(readFileSync(catF, 'utf8')); } catch (e) { erro('dados/catalogo.json', `JSON inválido: ${e.message}`); }
    if (c) {
      if (c.total !== produtos.length || c.produtos?.length !== produtos.length) erro('dados/catalogo.json', 'total diferente de produtos.json');
      const porSlug = new Map(produtos.map((p) => [p.slug, p]));
      for (const x of c.produtos || []) {
        const p = porSlug.get(x.slug);
        if (!p) { erro('dados/catalogo.json', `slug desconhecido ${x.slug}`); continue; }
        if (!x.fonte || !x.coletado_em) erro('dados/catalogo.json', `${x.slug} sem fonte ou coletado_em`);
        if (x.nome !== p.nome || x.sku !== p.sku || x.preco.por !== (p.preco?.por ?? null) || x.preco.valor !== (p.preco?.valores_numericos?.finalPrice ?? null)) erro('dados/catalogo.json', `${x.slug}: nome, SKU ou preço diferente dos dados`);
        if (JSON.stringify(x.itens_de_serie).includes('(VERIFICAR)')) erro('dados/catalogo.json', `${x.slug}: item (VERIFICAR)`);
      }
    }
  }
  return erros;
}
