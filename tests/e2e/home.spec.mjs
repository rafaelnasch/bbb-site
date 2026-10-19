// Bloco 6 no navegador (SPEC 14, linha Home, e 16): escolhedor rápido com a mesma contagem do
// escolher.html, zero requisição externa, LCP que nunca é o canvas, água/vapor/GSAP fora do modo lite e
// do celular, tour da planta no desktop e nenhuma rolagem horizontal de 320 a 430 px.
// Pré-requisito: dist/ renderizado (`node build/render.mjs`), ou E2E_DIST apontando para outra pasta.
import { test, expect } from '@playwright/test';
import { iniciar } from './servidor.mjs';

let srv, BASE;
test.beforeAll(async () => { ({ srv, url: BASE } = await iniciar()); });
test.afterAll(() => srv?.close());
const HOME = () => `${BASE}/`;

async function contagemEscolher(page, q) {
  await page.goto(`${BASE}/escolher.html?${q}`);
  await expect(page.locator('[data-esc-carregando]')).toBeHidden();
  return Number(await page.locator('[data-esc-n]').textContent());
}

test('escolhedor rápido conta igual ao escolher.html para as mesmas respostas e leva o estado', async ({ page }) => {
  const casos = [
    { tipo: 'banheira', pessoas: '', l: 90, c: 170 },
    { tipo: 'spa', pessoas: 'spa56', l: 0, c: 0 },
    { tipo: '', pessoas: '2', l: 120, c: 190 },
    { tipo: 'ofuro', pessoas: '', l: 100, c: 100 },
  ];
  for (const k of casos) {
    await page.goto(HOME());
    const sec = page.locator('[data-home-esc]');
    await sec.scrollIntoViewIfNeeded();
    await sec.locator(`input[name="tipo"][value="${k.tipo}"]`).check({ force: true });
    await sec.locator(`input[name="pessoas"][value="${k.pessoas}"]`).check({ force: true });
    if (k.l) {
      await sec.locator('input[name="l"]').fill(String(k.l));
      await sec.locator('input[name="c"]').fill(String(k.c));
    }
    await expect(sec.locator('[data-home-esc-ir]')).toHaveAttribute('href', /escolher\.html\?/);
    const n = Number(await sec.locator('[data-home-esc-n]').textContent());
    const href = await sec.locator('[data-home-esc-ir]').getAttribute('href');
    const q = href.split('?')[1];
    expect(q).toContain(k.tipo ? `tipo=${k.tipo}` : 'passo=8');
    if (k.l) expect(q).toContain(`l=${k.l}&c=${k.c}`);
    expect(n).toBe(await contagemEscolher(page, q));
  }
});

test('carga sem requisição externa; LCP é texto ou imagem, nunca o canvas da água', async ({ page }) => {
  const externos = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE.replace(/\/bbb-site$/, ''))) externos.push(r.url()); });
  await page.addInitScript(() => {
    window.__lcp = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lcp.push(e.element?.tagName || ''))).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(HOME(), { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  expect(externos).toEqual([]);
  const lcp = await page.evaluate(() => window.__lcp);
  expect(lcp.length).toBeGreaterThan(0);
  expect(lcp).not.toContain('CANVAS');
  expect(['H1', 'IMG', 'P', 'SPAN', 'A']).toContain(lcp[lcp.length - 1]);
});

test('movimento reduzido: sem água, vapor, vídeo nem GSAP; contagem e planta continuam', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pedidos = [];
  page.on('request', (r) => pedidos.push(r.url()));
  await page.goto(HOME(), { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  await expect(page.locator('html')).toHaveAttribute('data-lite', '1');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.locator('[data-obra]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  expect(pedidos.some((u) => /vendor\/(gsap|ScrollTrigger)/.test(u))).toBe(false);
  expect(pedidos.some((u) => /\.(webm|mp4)$/.test(u))).toBe(false);
  await page.locator('.home-obra .cota-btn[data-cota="B"]').click();
  await expect(page.locator('.home-obra tr[data-cota-linha="B"]')).toHaveClass(/is-ativa/);
  await ctx.close();
});

test('desktop: GSAP vendorizado entra só no desktop e o tour acende as cotas ao rolar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pedidos = [];
  page.on('request', (r) => pedidos.push(r.url()));
  await page.goto(HOME(), { waitUntil: 'load' });
  await page.locator('[data-obra]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-obra]')).toHaveClass(/is-tour/, { timeout: 15000 });
  expect(pedidos.some((u) => u.includes('/vendor/gsap.min.js'))).toBe(true);
  const passo = page.locator('[data-obra-passo="B"]');
  await passo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(passo).toHaveClass(/is-ativo/, { timeout: 5000 });
  await expect(page.locator('.home-obra .cota-marca[data-cota="B"]')).toHaveClass(/is-ativa/);
});

test('celular: sem GSAP, com água depois do load, e nenhuma rolagem horizontal de 320 a 430 px', async ({ page }) => {
  const pedidos = [];
  page.on('request', (r) => pedidos.push(r.url()));
  for (const w of [320, 360, 375, 390, 414, 430]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(HOME(), { waitUntil: 'load' });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, `${w}px`).toBeLessThanOrEqual(w);
  }
  await page.locator('[data-obra]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  expect(pedidos.some((u) => /vendor\/(gsap|ScrollTrigger)/.test(u))).toBe(false);
  // Alvos de toque das portas e do escolhedor >= 44 px
  for (const sel of ['.porta__a', '.home-esc__ir', '.mapa__item a']) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box.height, sel).toBeGreaterThanOrEqual(sel === '.mapa__item a' ? 32 : 44);
  }
});

test('sem JavaScript: portas, salas, preços e WhatsApp presentes; escolhedor vira link', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(HOME());
  await expect(page.locator('.porta')).toHaveCount(3);
  await expect(page.locator('.sala-faixa')).toHaveCount(7);
  await expect(page.locator('.home-esc__form')).toBeHidden();
  await expect(page.locator('.home-esc__semjs a')).toHaveAttribute('href', /escolher\.html$/);
  await expect(page.locator('a[data-wa-contexto="home_como_comprar"]')).toHaveAttribute('href', /^https:\/\/wa\.me\/5535992194882\?text=/);
  await ctx.close();
});
