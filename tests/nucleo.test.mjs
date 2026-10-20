// Bloco 3 (sistema visual e núcleo): invariantes do layout, cabeçalho, rodapé, WhatsApp e orçamentos.
// Renderiza as páginas de conferência (--sistema) e confere o HTML gerado.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { renderizar } from '../build/render.mjs';
import { LIMITES } from '../build/lib/assets.mjs';
import { verificarContraste } from '../build/lib/contraste.mjs';
import { html, raw, attrs, render } from '../build/lib/html.mjs';
import { url, abs } from '../build/lib/url.mjs';
import { estaNaListaNegra } from '../build/lib/wa.mjs';
import { paths, BASE_PATH, SITE_URL, INDEXAR } from '../site.config.mjs';

const contatos = JSON.parse(readFileSync(join(paths.data, 'contatos.json'), 'utf8')).contatos;
const empresa = JSON.parse(readFileSync(join(paths.data, 'empresa.json'), 'utf8'));
let R;
// Saída própria: os testes rodam em paralelo e outro arquivo de teste lê dist/.
const DIST = join(paths.cache, 'dist-nucleo');
const paginas = {};

before(async () => {
  R = await renderizar({ sistema: true, dist: DIST });
  // Só páginas HTML: os templates também geram arquivos de dados (ex.: dados/indice.json do escolhedor).
  // As páginas-ponte (SPEC 4.1) são HTML mínimo de redirecionamento, sem o layout: ficam fora daqui
  // (têm o próprio teste em tests/institucionais.test.mjs).
  for (const s of R.geradas.filter((x) => x.endsWith('.html'))) {
    const h = readFileSync(join(DIST, s), 'utf8');
    if (!/<meta http-equiv="refresh"/.test(h)) paginas[s] = h;
  }
});

const texto = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

test('html`` escapa por padrão e aceita Html confiável', () => {
  assert.equal(render(html`<p>${'<b>&"'}</p>`), '<p>&lt;b&gt;&amp;&quot;</p>');
  assert.equal(render(html`<p>${raw('<i>x</i>')}${[html`<b>1</b>`, '<2>']}${null}${false}</p>`), '<p><i>x</i><b>1</b>&lt;2&gt;</p>');
  assert.equal(render(attrs({ a: 'x"y', b: true, c: false, d: null })), ' a="x&quot;y" b');
});

test('url() aplica BASE_PATH e recusa endereço externo', () => {
  assert.equal(url('banheiras.html'), `${BASE_PATH}/banheiras.html`);
  assert.equal(url('/lojas/sobre-nos.html'), `${BASE_PATH}/lojas/sobre-nos.html`);
  assert.equal(abs('x.html'), `${SITE_URL}/x.html`);
  assert.throws(() => url('https://exemplo.com'));
});

test('orçamentos: CSS crítico ≤ 14 KB por página (base ≤ 12 KB) e núcleo JS ≤ 6 KB gzip', () => {
  assert.ok(R.assets.relatorio.css_critico_bytes <= LIMITES.cssCriticoBase, `crítico base ${R.assets.relatorio.css_critico_bytes}`);
  for (const [nome, p] of Object.entries(paginas)) {
    const inline = /<style>([\s\S]*?)<\/style>/.exec(p)[1];
    assert.ok(Buffer.byteLength(inline) <= LIMITES.cssCritico, `${nome}: crítico inline ${Buffer.byteLength(inline)}`);
  }
  // A primeira tela de produto e coleção (trilha e moldura) não pode depender do site.css tardio.
  const peca = /<style>([\s\S]*?)<\/style>/.exec(paginas['_sistema-peca.html'])[1];
  for (const sel of ['.trilha ol', '.trilha a', '.moldura{', '.moldura__img', '.moldura__leg', '.letterbox']) assert.ok(peca.includes(sel), `crítico sem ${sel}`);
  assert.ok(R.assets.relatorio.nucleo_gzip <= LIMITES.nucleoGzip, `núcleo ${R.assets.relatorio.nucleo_gzip}`);
});

test('contraste AA de todos os pares de token usados em texto (SPEC 13.12)', () => {
  const falhas = verificarContraste().filter((r) => !r.ok);
  assert.deepEqual(falhas, []);
});

test('fontes auto-hospedadas: Fraunces e Open Sans woff2, só Fraunces com preload', () => {
  const p = paginas['_sistema.html'];
  const preloads = [...p.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1]);
  assert.equal(preloads.length, 1);
  assert.match(preloads[0], /fraunces-var-latin\.[0-9a-f]+\.woff2$/);
  assert.match(p, /opensans-var-latin\.[0-9a-f]+\.woff2/);
  for (const m of p.matchAll(/url\("([^"]+\.woff2)"\)/g)) assert.ok(existsSync(join(DIST, m[1].slice(BASE_PATH.length))), m[1]);
});

test('cabeça: lang, um H1, title, description, canonical absoluto, robots, OG, CSP com o hash do script inline', () => {
  for (const [nome, p] of Object.entries(paginas)) {
    assert.match(p, /^<!doctype html>\n<html lang="pt-BR">/, nome);
    assert.equal((p.match(/<h1[\s>]/g) || []).length, 1, `${nome}: H1`);
    assert.match(p, /<title>[^<]+<\/title>/);
    assert.match(p, /<meta name="description" content="[^"]+">/);
    assert.match(p, new RegExp(`<link rel="canonical" href="${SITE_URL.replace(/[.]/g, '\\.')}/`));
    assert.match(p, /<meta property="og:image" content="https?:\/\/[^"]+">/);
    if (!INDEXAR) assert.match(p, /<meta name="robots" content="noindex,nofollow">/);
    const inline = /<script>([\s\S]*?)<\/script>/.exec(p)[1];
    const h = `sha256-${createHash('sha256').update(inline).digest('base64')}`;
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(p)[1].replace(/&#39;/g, "'");
    assert.ok(csp.includes(`script-src 'self' '${h}'`), `${nome}: hash da CSP`);
    assert.ok(!csp.includes('unsafe-inline') || /style-src 'self' 'unsafe-inline'/.test(csp));
    assert.equal((p.match(/<script>/g) || []).length, 1, `${nome}: um único script inline`);
  }
});

test('links internos com BASE_PATH; assets, marca e mídia existem em dist', () => {
  for (const [nome, p] of Object.entries(paginas)) {
    for (const m of p.matchAll(/\s(href|src|srcset)="([^"]+)"/g)) {
      // Só srcset é lista separada por vírgula; um href pode ter vírgula (link de mapa "@-23.05,-45.60,17z").
      // No srcset a vírgula separa candidatos só quando vem seguida de espaço (a de um data: URI não separa).
      for (const v of (m[1] === 'srcset' ? m[2].split(/,\s+/) : [m[2]]).map((x) => x.split(' ')[0])) {
        if (/^(https?:|mailto:|tel:|#|data:)/.test(v)) continue;
        assert.ok(BASE_PATH === '' || v.startsWith(`${BASE_PATH}/`), `${nome}: link sem BASE_PATH ${v}`);
        const rel = v.slice(BASE_PATH.length).split(/[?#]/)[0];
        if (/^\/(assets|brand|media)\//.test(rel) || rel === '/site.webmanifest') assert.ok(existsSync(join(DIST, rel)), `${nome}: ${rel} ausente`);
      }
    }
  }
});

test('WhatsApp: todo wa.me usa contato ativo e linkável, fora da lista negra', () => {
  const ativos = new Set(contatos.filter((c) => c.status === 'ativo' && c.link_ativo).map((c) => c.numero));
  for (const [nome, p] of Object.entries(paginas)) {
    const links = [...p.matchAll(/href="https:\/\/wa\.me\/(\d+)(\?text=[^"]*)?"/g)];
    assert.ok(links.length >= 15, `${nome}: poucos links wa.me`);
    for (const [, n] of links) {
      assert.ok(ativos.has(n), `${nome}: ${n} não é ativo`);
      assert.ok(!estaNaListaNegra(n), `${nome}: ${n} na lista negra`);
    }
    const venda = contatos.find((c) => c.papel === 'venda_principal');
    // Página esgotada: todos os links de venda levam a mesma mensagem de estoque (SPEC 10.2).
    if (/data-esgotado="1"/.test(p)) assert.ok(/https:\/\/wa\.me\/\d+\?text=Ol%C3%A1!%20Quero%20saber%20se%20a%20/.test(p), `${nome}: mensagem de esgotado`);
    else assert.ok(p.includes(`https://wa.me/${venda.numero}?text=${encodeURIComponent(venda.prefilled_text).replace(/'/g, '&#39;')}`), 'abertura literal de venda');
    assert.ok(p.includes(`https://wa.me/${contatos.find((c) => c.papel === 'sac').numero}"`), 'SAC sem texto');
  }
});

test('rodapé: 8 consultores em ordem, 4 CNPJs literais, horário, e-mails, data da coleta e nenhum CEP', () => {
  const p = paginas['_sistema.html'];
  const rod = p.slice(p.indexOf('<footer'), p.indexOf('</footer>'));
  const consultores = contatos.filter((c) => /^consultor_/.test(c.papel)).sort((a, b) => a.ordem_rodape - b.ordem_rodape);
  let pos = 0;
  for (const [i, c] of consultores.entries()) {
    const k = rod.indexOf(`<b>Consultor ${i + 1}</b><span class="num" data-campo="contato-display">${c.display}</span>`, pos);
    assert.ok(k > pos, `Consultor ${i + 1}`);
    pos = k;
  }
  for (const c of empresa.cnpjs_rodape) assert.ok(rod.includes(c.literal.replace(/&/g, '&amp;')), c.cnpj);
  for (const m of empresa.emails) assert.ok(rod.includes(`mailto:${m.email}`));
  assert.ok(rod.includes(empresa.telefone_fixo.display));
  assert.match(rod, /coletados em <span data-campo="data-coleta">\d{2}\/\d{2}\/\d{4}<\/span>/);
  assert.doesNotMatch(texto(p), /\b\d{5}-\d{3}\b/, 'CEP no texto');
  assert.ok(!/marketing@/i.test(p));
});

test('cabeçalho: menu da SPEC 6.1, contagens reais, busca, comparador e botão de venda', () => {
  const p = paginas['_sistema.html'];
  const cab = p.slice(p.indexOf('<header'), p.indexOf('</header>'));
  const cats = JSON.parse(readFileSync(join(paths.data, 'categorias.json'), 'utf8'));
  for (const nome of ['Escolher minha banheira', 'Banheiras', 'Spas', 'Ofurôs', 'Lojas', 'Atendimento']) assert.ok(cab.includes(`>${nome}`), nome);
  for (const path of ['banheiras.html', 'spas.html', 'ofuros.html']) {
    const n = cats.find((c) => c.d_path === path).total_exibido;
    assert.ok(cab.includes(`href="${url(path)}"`) && cab.includes(`>${n}</sup>`), path);
  }
  assert.ok(cab.includes(`href="${url('busca.html')}"`));
  assert.ok(cab.includes('data-comparar-contador'));
  assert.match(cab, /class="btn btn--whats"[^>]*data-wa-papel="venda_principal"/);
});

test('texto público: sem emoji, sem travessão em títulos, sem termos proibidos no núcleo', () => {
  for (const [nome, p] of Object.entries(paginas)) {
    // ©, ® e ™ (texto literal do manual) são sinais de texto; só contam como emoji com o seletor U+FE0F.
    assert.doesNotMatch(p, /(?![\u00a9\u00ae\u2122](?!\uFE0F))\p{Extended_Pictographic}/u, `${nome}: emoji`);
    for (const m of p.matchAll(/<(h[1-3]|title)[^>]*>([\s\S]*?)<\/\1>/g)) assert.ok(!m[2].includes('—'), `${nome}: travessão em ${m[1]}`);
    assert.ok((texto(p).match(/—/g) || []).length <= 2);
    assert.doesNotMatch(texto(p), /\(VERIFICAR\)|BANHEIRA COLORIDA|a maior loja|lorem/i);
  }
});

test('foco na barra superior usa o anel claro; modo escuro troca as variáveis no :root', () => {
  const css = R.assets.cssCritico;
  assert.match(css, /\.topo\{--focus-ring:var\(--focus-on-dark\)/);
  assert.match(css, /@media \(prefers-color-scheme:dark\)\{:root,\.dia\{[^}]*--fg:var\(--porcelain\)[^}]*--focus-ring:var\(--focus-on-dark\)/);
});

test('validate.mjs (SPEC 13) passa nas páginas geradas', async () => {
  const { validar } = await import('../build/validate.mjs');
  const r = await validar(DIST);
  assert.deepEqual(r.erros, []);
});

test('reveal, View Transitions e lite declarados no CSS crítico', () => {
  const css = R.assets.cssCritico;
  assert.match(css, /@view-transition\{navigation:auto\}/);
  assert.match(css, /animation-timeline:view\(\)/);
  assert.match(css, /html\[data-lite\]/);
  assert.match(R.assets.inlineJs, /pagereveal/);
  assert.match(R.assets.inlineJs, /data-lite/);
});
