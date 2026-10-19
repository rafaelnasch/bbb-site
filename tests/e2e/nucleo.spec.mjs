// Bloco 3 no navegador: gavetas (foco e Esc), comparador, WhatsApp, larguras de 320 a 1920 px,
// modo lite e sem JS. Pré-requisito: `node build/render.mjs --sistema` (páginas _sistema*.html).
import { test, expect } from '@playwright/test';
import { iniciar } from './servidor.mjs';

let srv, BASE;
test.beforeAll(async () => {
  ({ srv, url: BASE } = await iniciar());
});
test.afterAll(() => srv?.close());

const PAG = () => `${BASE}/_sistema.html`;

test('menu do celular abre como gaveta, Esc fecha e devolve o foco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAG());
  await page.click('.cab__menu');
  await expect(page.locator('#menu')).toHaveJSProperty('open', true);
  await expect(page.locator('.cab__menu')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toHaveJSProperty('open', false);
  await expect(page.locator('.cab__menu')).toBeFocused();
});

test('gaveta de WhatsApp abre direto nos consultores e registra o clique', async ({ page }) => {
  await page.goto(PAG());
  await page.locator('#rodape .rodape__acoes [data-gaveta-abrir]').click();
  await expect(page.locator('#gaveta-whats')).toHaveJSProperty('open', true);
  await expect(page.locator('#gaveta-whats [data-foco="consultores"]')).toHaveJSProperty('open', true);
  const links = page.locator('#gaveta-whats a.consultor');
  await expect(links).toHaveCount(8);
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), { capture: false }));
  await links.first().click();
  const evento = await page.evaluate(() => window.dataLayer.find((e) => e.event === 'whatsapp_click'));
  expect(evento).toMatchObject({ papel: 'consultor_1', contexto: 'gaveta_consultores' });
});

test('comparador: até 3, bandeja, contador e localStorage', async ({ page }) => {
  await page.goto(PAG());
  const tog = page.locator('.sis-cartao [data-comparar]');
  for (let i = 0; i < 4; i++) await tog.nth(i).click();
  await expect(page.locator('[data-bandeja]')).toBeVisible();
  await expect(page.locator('.bandeja__item')).toHaveCount(3);
  await expect(page.locator('.cab__badge')).toHaveText('3');
  await expect(tog.nth(3)).toHaveAttribute('aria-pressed', 'false');
  const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('bbb:comparar')).length);
  expect(salvo).toBe(3);
  expect(await page.locator('[data-bandeja-ir]').getAttribute('href')).toMatch(/comparar\.html\?p=[^,]+,[^,]+,[^,]+$/);
  await page.click('[data-comparar-limpar]');
  await expect(page.locator('[data-bandeja]')).toBeHidden();
});

test('sem rolagem horizontal de 320 a 1920 px', async ({ page }) => {
  await page.goto(PAG());
  for (const w of [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 800 });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, `largura ${w}`).toBeLessThanOrEqual(w);
  }
});

test('movimento reduzido liga o lite e mostra tudo no estado final', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(PAG());
  await expect(page.locator('html')).toHaveAttribute('data-lite', '1');
  const op = await page.locator('.sis-cartao').last().evaluate((el) => getComputedStyle(el).opacity);
  expect(op).toBe('1');
  await ctx.close();
});

test('sem JavaScript: conteúdo visível, menu em linha e links de WhatsApp prontos', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(PAG());
  await expect(page.locator('.cab__nav')).toBeVisible();
  await expect(page.locator('.cab__menu')).toBeHidden();
  expect(await page.locator('.sis-cartao').last().evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  expect(await page.locator('a[href^="https://wa.me/"]').count()).toBeGreaterThan(15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await ctx.close();
});

test('View Transition: cartão e moldura recebem o mesmo nome na troca de página', async ({ page }) => {
  await page.goto(PAG());
  const suporta = await page.evaluate(() => 'onpagereveal' in window);
  test.skip(!suporta, 'navegador sem View Transitions entre documentos');
  const slug = await page.locator('.sis-cartao [data-vt]').first().getAttribute('data-vt');
  await page.locator('.sis-cartao a').first().click();
  await page.waitForURL(/_sistema-peca\.html/);
  await expect(page.locator(`[data-vt-chegada="${slug}"]`)).toHaveCount(1);
});
