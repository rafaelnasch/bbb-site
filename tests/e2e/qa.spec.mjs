// Correções da rodada de QA (bloco 10): mensagens do WhatsApp (escolhedor, comparador, planta, esgotado,
// voltagem vazia), evento com SKU, foco nunca atrás da doca nem da bandeja, bandeja recolhida no celular,
// botão de pausar o movimento, campos de escolha com fonte de 16 px e a foto da peça na primeira tela.
// Pré-requisito: dist/ renderizado (`node build/render.mjs`).
import { test, expect } from '@playwright/test';
import { iniciar } from './servidor.mjs';

let srv, BASE;
test.beforeAll(async () => {
  ({ srv, url: BASE } = await iniciar());
});
test.afterAll(() => srv?.close());

const ACQUA = 'banheira-acqua-linea-completa-com-hidro-em-acrilico';
const NAPOLE = 'spa-quadrado-napole-completo-com-hidro';
const texto = async (loc) => decodeURIComponent((await loc.getAttribute('href')).split('?text=')[1] || '');

test('escolhedor: sem respostas, a mensagem não lista modelos; sem encaixe, os "quase" vão marcados', async ({ page }) => {
  await page.goto(`${BASE}/escolher.html`);
  await expect(page.locator('.is-carregando')).toHaveCount(0);
  await expect(page.locator('[data-esc-lista] > li').first()).toBeAttached();
  const vazio = await texto(page.locator('[data-esc-wa]'));
  expect(vazio).not.toMatch(/\.html\n.*\.html/);
  expect(vazio.split('\n').filter((l) => /\.html$/.test(l) && !/escolher\.html/.test(l))).toHaveLength(0);
  // Ordem do catálogo sem espaço: a lista não começa pelas peças de criança e de pet.
  expect(await page.locator('[data-esc-lista] .esc-c__nome').first().textContent()).not.toMatch(/crian|pet/i);
  await page.goto(`${BASE}/escolher.html?tipo=spa&l=160&c=160&passo=8`);
  // O resultado só é montado com o site.css aplicado (escolher.js): espera o fim do carregamento.
  await expect(page.locator('.is-carregando')).toHaveCount(0);
  await expect(page.locator('[data-esc-res-n]')).toHaveText('0');
  const quase = await texto(page.locator('[data-esc-wa]'));
  expect(quase).toContain('Nenhum modelo cabe; estes quase cabem:');
  expect(quase).toMatch(/\(passa \d+(,\d)? cm do (comprimento|largura)\)/);
});

test('comparador: o tamanho escolhido entra na mensagem; com um modelo, frase própria', async ({ page }) => {
  await page.goto(`${BASE}/comparar.html?p=${ACQUA},${NAPOLE}`);
  const wa = page.locator('[data-cmp-wa]');
  await expect(page.locator('[data-cmp-tam]').first()).toBeAttached();
  const antes = await texto(wa);
  await page.locator(`[data-cmp-tam="${ACQUA}"]`).selectOption({ index: 2 });
  const depois = await texto(wa);
  expect(depois).not.toBe(antes);
  expect(depois).toContain('(tamanho 0,79 x 1,60 x 0,37)');
  expect(depois).toContain('comparar.html?p=');
  await page.goto(`${BASE}/comparar.html?p=${ACQUA}`);
  await expect(page.locator('[data-cmp-corpo]')).toBeVisible();
  // A tabela é montada com o site.css aplicado (comparar.js): espera a coluna do modelo.
  await expect(page.locator('[data-cmp-tam]').first()).toBeAttached();
  expect(await texto(wa)).toMatch(/^Quero ajuda com o modelo /);
});

test('pedir a planta sem opção de tamanho: sem linha "Tamanho:" (a medida da ficha não entra)', async ({ page }) => {
  for (const s of ['spa-quadrado-serena-completo-com-hidro-em-acrilico', 'sauna-compacta-bbb']) {
    await page.goto(`${BASE}/${s}.html`);
    const t = await texto(page.locator('[data-wa-contexto="pedir_planta"]').first());
    expect(t, s).toContain('Quero receber a planta técnica deste modelo.');
    expect(t, s).not.toContain('Tamanho:');
  }
});

test('esgotado: todos os links de venda e dos consultores levam a mesma mensagem de estoque', async ({ page }) => {
  await page.goto(`${BASE}/air-blower-borbulhamento.html`);
  const msgs = new Set();
  for (const a of await page.locator('a[data-wa-sync="venda"]').all()) msgs.add(await texto(a));
  expect(msgs.size).toBe(1);
  expect([...msgs][0]).toMatch(/^Olá! Quero saber se a .* volta a ter estoque\./);
});

test('voltagem "Nenhum" marcada por padrão: sem JS e com JS, a mesma mensagem', async ({ page, browser }) => {
  const s = 'banheira-dupla-paris-com-hidro';
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const sem = await ctx.newPage();
  await sem.goto(`${BASE}/${s}.html`);
  const semJs = await texto(sem.locator('[data-cta-compra]'));
  await ctx.close();
  await page.goto(`${BASE}/${s}.html`);
  await page.waitForTimeout(300);
  const comJs = await texto(page.locator('[data-cta-compra]'));
  expect(comJs).toBe(semJs);
  expect(comJs).not.toContain('Voltagem: Nenhum');
});

test('evento whatsapp_click: links gerais da página do produto levam o SKU', async ({ page }) => {
  await page.goto(`${BASE}/${ACQUA}.html`);
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
  await page.locator('.rodape a[data-wa-papel="consultor_3"]').first().click();
  const ev = await page.evaluate(() => window.dataLayer.filter((x) => x.event === 'whatsapp_click').at(-1));
  expect(ev.sku).toBe('BALCHA');
});

test('foco pelo teclado nunca fica atrás da doca nem da bandeja (WCAG 2.4.11)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${BASE}/comparar.html?p=${ACQUA},${NAPOLE},sauna-luxo-bbb`);
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/${ACQUA}.html`);
  await page.waitForTimeout(600);
  await page.evaluate(() => { const c = document.querySelector('#comprar'); window.scrollTo(0, c.getBoundingClientRect().bottom + scrollY + 40); });
  await page.waitForTimeout(400);
  const band = await page.locator('.bandeja').boundingBox();
  expect(band.height, 'bandeja recolhida numa linha').toBeLessThan(80);
  const doca = await page.locator('.doca').boundingBox();
  expect(doca.height, 'doca compacta').toBeLessThan(80);
  let cobertos = 0;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    cobertos += await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body || a.closest('.doca,.bandeja,dialog')) return 0;
      const r = a.getBoundingClientRect();
      const topo = Math.min(...[...document.querySelectorAll('.doca:not([hidden]),.bandeja:not([hidden])')].map((e) => e.getBoundingClientRect().top), innerHeight);
      return r.width > 0 && r.top >= topo - 1 ? 1 : 0;
    });
  }
  expect(cobertos).toBe(0);
  // A bandeja abre a lista ao tocar e fecha de novo.
  await page.locator('[data-bandeja-abre]').click();
  await expect(page.locator('[data-bandeja-abre]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-bandeja-lista] > li')).toHaveCount(3);
});

test('pausar movimento: o botão para os vídeos e fica guardado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/${ACQUA}.html`);
  await page.waitForTimeout(5000);
  const btn = page.locator('[data-movimento]');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => [...document.querySelectorAll('video')].every((v) => v.paused))).toBe(true);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.lite)).toBe('1');
  await page.locator('[data-movimento]').click();
});

test('campos de escolha com 16 px ou mais (sem zoom automático no iPhone)', async ({ page }) => {
  for (const [path, sel] of [[`comparar.html?p=${ACQUA},${NAPOLE}`, '[data-cmp-tam]'], ['banheiras.html', '.col-ordem select']]) {
    await page.goto(`${BASE}/${path}`);
    await expect(page.locator(sel).first()).toBeAttached();
    expect(parseFloat(await page.locator(sel).first().evaluate((e) => getComputedStyle(e).fontSize)), path).toBeGreaterThanOrEqual(16);
  }
});

test('produto: a foto da peça aparece na primeira tela no celular e no desktop', async ({ page }) => {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/${ACQUA}.html`);
    const r = await page.locator('.galeria .moldura').boundingBox();
    expect(r.y, `${w}px`).toBeLessThan(h - 200);
  }
});

test('links de texto soltos (todo o conteúdo do parágrafo, item ou célula) com alvo de 44 x 44 px, de 320 a 430 px', async ({ browser }) => {
  const paginas = ['index.html', 'banheiras.html', `${ACQUA}.html`, 'escolher.html', 'guia/banheira-por-tamanho.html', 'guia/gel-coat-ou-acrilico.html', 'lojas/loja-showrooms.html', 'prazo-de-entrega.html', 'manual-usuario-instalacao.html', 'lojas/sobre-nos.html'];
  for (const w of [320, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (const p of paginas) {
      await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' });
      // As coleções pedem o site.css depois da primeira pintura: mede com ele aplicado.
      await page.waitForFunction(() => [...document.styleSheets].some((s) => /site\./.test(s.href || '')));
      const pequenos = await page.evaluate(() => [...document.querySelectorAll('a.link')].filter((a) => {
        const r = a.getBoundingClientRect();
        if (!r.width) return false;
        const outro = [...a.parentElement.childNodes].filter((n) => n !== a).map((n) => n.textContent).join('').replace(/[\s·,.:;()]/g, '');
        return (!outro || a.classList.contains('link--texto')) && (r.height < 44 || r.width < 44);
      }).map((a) => `${a.textContent.trim()} ${Math.round(a.getBoundingClientRect().width)}x${Math.round(a.getBoundingClientRect().height)}`));
      expect(pequenos, `${w}px ${p}`).toEqual([]);
    }
    await ctx.close();
  }
});

test('coleção no celular: a primeira peça da grade aparece na primeira tela, sem a foto de destaque do topo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ['banheiras.html', 'spas.html']) {
    await page.goto(`${BASE}/${p}`, { waitUntil: 'load' });
    expect(await page.locator('.col-topo__dest').isVisible()).toBe(false);
    expect(await page.evaluate(() => [...document.querySelectorAll('.col-topo__poster')].every((i) => !i.currentSrc || i.currentSrc.startsWith('data:'))), `${p}: destaque baixado no celular`).toBe(true);
    const b = await page.locator('[data-col-grade] > li').first().boundingBox();
    expect(b.y + 120, `${p}: primeira peça`).toBeLessThanOrEqual(844);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/banheiras.html`, { waitUntil: 'load' });
  expect(await page.locator('.col-topo__dest').isVisible()).toBe(true);
});

test('produto no desktop: a moldura ocupa a coluna da peça (7 de 12) e a foto usa o arquivo de 800 px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const slug of ['banheira-acqua-linea-completa-com-hidro', 'spa-de-canto-florenca-completo-com-hidro']) {
    await page.goto(`${BASE}/${slug}.html`, { waitUntil: 'load' });
    const g = await page.evaluate(() => {
      const peca = document.querySelector('.prod__peca').getBoundingClientRect();
      const dec = document.querySelector('.prod__decisao').getBoundingClientRect();
      const wrap = document.querySelector('.prod__grade').getBoundingClientRect();
      const img = document.querySelector('.prod__peca img');
      return { peca: peca.width, esq: peca.left - wrap.left, vao: dec.left - peca.right, col: wrap.width * 7 / 12, src: img.currentSrc, w: img.getBoundingClientRect().width };
    });
    expect(g.esq, slug).toBeLessThanOrEqual(1);
    expect(g.peca, slug).toBeGreaterThanOrEqual(g.col - 40);
    expect(g.vao, slug).toBeLessThanOrEqual(48);
    expect(g.src, slug).toMatch(/-800\.(avif|webp)$/);
    expect(g.w, `${slug}: foto sem passar do original`).toBeLessThanOrEqual(800);
  }
});

// Redesenho (20/10/2026, rodada 2): o botão verde de compra sempre com texto branco, inclusive no rodapé
// (a regra ".rodape a" chegou a vencer ".btn" e deixou o texto escuro sobre o verde, 3,35:1).
test('todo botão de WhatsApp verde tem texto branco, em todas as páginas principais', async ({ page }) => {
  for (const p of ['', 'banheiras.html', `${ACQUA}.html`, 'escolher.html', 'comparar.html']) {
    await page.goto(`${BASE}/${p}`);
    await page.addStyleTag({ content: '*{content-visibility:visible!important}' });
    const cores = await page.evaluate(() => [...document.querySelectorAll('.btn--whats')]
      .filter((b) => b.getClientRects().length)
      .map((b) => ({ cor: getComputedStyle(b).color, fundo: getComputedStyle(b).backgroundColor })));
    expect(cores.length, `${p || 'home'}: botões visíveis`).toBeGreaterThan(0);
    for (const c of cores) {
      expect(c.cor, `${p || 'home'}`).toBe('rgb(255, 255, 255)');
      expect(c.fundo, `${p || 'home'}`).toBe('rgb(30, 127, 58)');
    }
  }
});
