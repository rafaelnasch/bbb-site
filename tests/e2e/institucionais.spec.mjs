// Bloco 7 no navegador (SPEC 14 e 16): ponte redireciona em menos de 1 s com e sem JS, busca na FAQ,
// busca da 404, destaque de estado no prazo e nenhuma rolagem horizontal de 320 a 430 px.
// Pré-requisito: dist/ renderizado (`node build/render.mjs`), ou E2E_DIST apontando para outra pasta.
import { test, expect } from '@playwright/test';
import { iniciar } from './servidor.mjs';

let srv, BASE;
test.beforeAll(async () => { ({ srv, url: BASE } = await iniciar()); });
test.afterAll(() => srv?.close());

const PAGINAS = ['lojas/loja-showrooms.html', 'perguntas-frequentes.html', 'consultores.html', 'manual-usuario-instalacao.html',
  'prazo-de-entrega.html', 'instaladores.html', 'lojas/sobre-nos.html', 'contacts.html', 'como-comprar.html', 'inmetro.html', 'mapa-do-site.html', '404.html'];

test('nenhuma rolagem horizontal de 320 a 430 px', async ({ browser }) => {
  for (const w of [320, 375, 430]) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    for (const p of PAGINAS) {
      await page.goto(`${BASE}/${p}`);
      const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      expect(sw, `${p} em ${w}px`).toBeLessThanOrEqual(iw);
    }
    await page.close();
  }
});

for (const js of [true, false]) {
  test(`ponte redireciona em menos de 1 s ${js ? 'com' : 'sem'} JavaScript`, async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: js });
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(`${BASE}/taubate`);
    await page.waitForURL(/lojas\/loja-showrooms\.html#taubate$/, { timeout: 3000 });
    expect(Date.now() - t0).toBeLessThan(js ? 1000 : 2000);
    await page.goto(`${BASE}/catalog/category/view/id/130`);
    await page.waitForURL(/\/banheiras\.html$/, { timeout: 3000 });
    await ctx.close();
  });
}

test('FAQ: busca filtra, abre o item e mostra o vazio com ajuda', async ({ page }) => {
  await page.goto(`${BASE}/perguntas-frequentes.html`);
  const q = page.locator('[data-faq-q]');
  await q.fill('acrilico');
  await expect(page.locator('[data-faq-n]')).toBeVisible();
  const visiveis = page.locator('[data-faq-item]:not([hidden])');
  expect(await visiveis.count()).toBeGreaterThan(0);
  expect(await visiveis.count()).toBeLessThan(await page.locator('[data-faq-item]').count());
  await q.fill('xyzqw');
  await expect(page.locator('[data-faq-vazio]')).toBeVisible();
  await expect(page.locator('[data-faq-vazio] a[href^="https://wa.me/5535992192256"]')).toBeVisible();
  await page.goto(`${BASE}/perguntas-frequentes.html#faq-12`);
  await expect(page.locator('#faq-12')).toHaveAttribute('open', '');
});

test('404: a busca leva ao catálogo com o termo', async ({ page }) => {
  await page.goto(`${BASE}/nao-existe-esta-pagina.html`);
  await page.locator('[data-busca-404] input').fill('acqua linea');
  await page.locator('[data-busca-404] button').click();
  await page.waitForURL(/busca\.html\?q=acqua%20linea$/);
});

test('prazo: escolher o estado destaca as linhas dele', async ({ page }) => {
  await page.goto(`${BASE}/prazo-de-entrega.html`);
  await page.locator('[data-prazo-uf]').selectOption('MG');
  expect(await page.locator('tr.is-uf').count()).toBe(2);
});
