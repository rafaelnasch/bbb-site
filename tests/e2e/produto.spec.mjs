// Bloco 4 no navegador (SPEC 14 e 16): seletor de tamanho, planta e cotas, "Cabe no meu banheiro?",
// "Monte a sua" com WhatsApp, galeria, doca no celular, larguras de 320 a 1920 px, modo lite e sem JS.
// Pré-requisito: `node build/render.mjs` (dist/ com as páginas de produto).
import { test, expect } from '@playwright/test';
import { iniciar } from './servidor.mjs';

let srv, BASE;
test.beforeAll(async () => {
  ({ srv, url: BASE } = await iniciar());
});
test.afterAll(() => srv?.close());

const ACQUA = 'banheira-acqua-linea-completa-com-hidro-em-acrilico';
const pg = (slug) => `${BASE}/${slug}.html`;
const msgCompra = async (page) => decodeURIComponent((await page.locator('[data-cta-compra]').getAttribute('href')).split('?text=')[1] || '');

test('Acqua Línea: trocar o tamanho troca planta, medidas, total e o texto do WhatsApp', async ({ page }) => {
  await page.goto(pg(ACQUA));
  await expect(page.locator('input[name="tamanho"]')).toHaveCount(5);
  expect(await msgCompra(page)).toContain('Tamanho: 0,79 x 1,41 x 0,37');
  await page.locator('label.seletor__op', { hasText: '0,79 x 1,60 x 0,37' }).click();
  const painel = page.locator('[data-tam-painel]:not([hidden])');
  await expect(painel).toContainText('Planta deste tamanho não publicada pela fábrica');
  await expect(page.locator('[data-escala-txt]')).toContainText('1,60 m x 0,79 m');
  expect(await msgCompra(page)).toContain('Tamanho: 0,79 x 1,60 x 0,37');
  await page.locator('label.seletor__op', { hasText: '0,79 x 1,69 x 0,37' }).click();
  await expect(page.locator('[data-tam-painel]:not([hidden]) [data-explorador]')).toHaveCount(1);
  // Adicional com preço publicado entra no total e na mensagem.
  await page.locator('label.adic', { hasText: 'Acionador digital' }).click();
  await expect(page.locator('output[data-total]')).toHaveText('R$5.891,18');
  const m = await msgCompra(page);
  expect(m).toContain('Adicionais: Acionador digital + R$490,00');
  expect(m).toContain('Valor pelos preços do site em 18/10/2026: R$ 5.891,18');
  // O botão do cabeçalho e os consultores recebem a mesma mensagem.
  const cab = decodeURIComponent((await page.locator('.cab__whats .btn').getAttribute('href')).split('?text=')[1]);
  expect(cab).toBe(m);
});

test('voltar sem bfcache: total, doca e WhatsApp seguem o formulário restaurado pelo navegador', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pg(ACQUA));
  // Um "unload" tira a página do bfcache: a volta recarrega e o navegador restaura os campos.
  await page.evaluate(() => window.addEventListener('unload', () => {}));
  await page.locator('label.seletor__op', { hasText: '0,79 x 1,69 x 0,37' }).click();
  await page.locator('label.adic', { hasText: 'Acionador digital' }).click();
  await expect(page.locator('output[data-total]')).toHaveText('R$5.891,18');
  await page.goto(`${BASE}/lojas/loja-showrooms.html`);
  await page.goBack();
  await expect(page.locator('input[name="tamanho"]:checked')).toHaveAttribute('data-rotulo', '0,79 x 1,69 x 0,37');
  await expect(page.locator('output[data-total]')).toHaveText('R$5.891,18');
  await expect(page.locator('[data-doca-tam]')).toHaveText('0,79 x 1,69 x 0,37');
  const m = await msgCompra(page);
  expect(m).toContain('Tamanho: 0,79 x 1,69 x 0,37');
  expect(m).toContain('Adicionais: Acionador digital + R$490,00');
  expect(m).toContain('R$ 5.891,18');
});

test('cota B: realça a linha, marca a letra no desenho e anuncia', async ({ page }) => {
  await page.goto(pg(ACQUA));
  const painel = page.locator('[data-tam-painel]:not([hidden])');
  await painel.scrollIntoViewIfNeeded();
  await painel.locator('.cota-btn[data-cota="B"]').click();
  await expect(painel.locator('.cota-btn[data-cota="B"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(painel.locator('tr.is-ativa')).toHaveAttribute('data-cota-linha', 'B');
  await expect(painel.locator('.cota-marca.is-ativa')).toHaveCount(1);
  await expect(page.locator('#anuncio')).toHaveText('Cota B, 1,415 metro');
  // Do desenho para a tabela.
  await painel.locator('.cota-marca[data-cota="A"]').click({ force: true });
  await expect(painel.locator('.cota-btn[data-cota="A"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(painel.locator('.cota-btn[data-cota="B"]')).toHaveAttribute('aria-pressed', 'false');
});

test('explorador: teclado amplia, recentraliza e carrega blocos', async ({ page }) => {
  await page.goto(pg(ACQUA));
  const fig = page.locator('[data-tam-painel]:not([hidden]) [data-explorador]');
  await fig.scrollIntoViewIfNeeded();
  await expect(fig).toHaveClass(/is-ativo/);
  const vista = fig.locator('[data-vista]');
  await vista.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('+');
  await expect(fig.locator('[data-nivel]')).toHaveText(/^5,1x$/);
  await expect.poll(() => fig.locator('[data-blocos] img').count()).toBeGreaterThan(0);
  await page.keyboard.press('0');
  await expect(fig.locator('[data-nivel]')).toHaveText('1x');
});

test('Cabe no meu banheiro? 90 x 170 cm informa a folga correta', async ({ page }) => {
  await page.goto(pg(ACQUA));
  await page.fill('#escala-largura', '90');
  await page.fill('#escala-comprimento', '170');
  await expect(page.locator('[data-escala-txt]')).toHaveText(/^Cabe\. Sobram 11 cm na largura e 29 cm no comprimento/);
  await page.fill('#escala-largura', '75');
  await expect(page.locator('[data-escala-txt]')).toHaveText(/^Não cabe: passa 4 cm da largura e sobram 29 cm no comprimento\./);
  expect(await page.locator('[data-escala-svg]').getAttribute('aria-label')).toContain('passa 4 cm da largura');
});

test('galeria: tela cheia com setas e Esc devolve o foco', async ({ page }) => {
  await page.goto(pg('spa-quadrado-napole-completo-com-hidro'));
  const abrir = page.locator('[data-galeria-cheia]');
  await abrir.click();
  const tela = page.locator('dialog.tela');
  await expect(tela).toHaveJSProperty('open', true);
  await expect(tela.locator('[data-tela-pos]')).toHaveText('1 de 3');
  await page.keyboard.press('ArrowRight');
  await expect(tela.locator('[data-tela-pos]')).toHaveText('2 de 3');
  await expect(tela).toContainText('Imagem ilustrativa');
  await page.keyboard.press('Escape');
  await expect(tela).toHaveJSProperty('open', false);
  await expect(abrir).toBeFocused();
});

test('doca de compra aparece no celular depois da coluna de decisão', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pg(ACQUA));
  await expect(page.locator('[data-doca]')).toBeHidden();
  const y = await page.evaluate(() => document.querySelector('#comprar').getBoundingClientRect().bottom + window.scrollY + 200);
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await expect(page.locator('[data-doca]')).toBeVisible();
  const doca = page.locator('[data-doca] a.btn');
  expect(await doca.getAttribute('href')).toBe(await page.locator('[data-cta-compra]').getAttribute('href'));
});

test('casos especiais: Serena, Air Blower, sauna e acessório', async ({ page }) => {
  await page.goto(pg('spa-quadrado-serena-completo-com-hidro-em-acrilico'));
  await expect(page.locator('.galeria--vazia')).toContainText('Foto e planta deste modelo sob consulta');
  await page.goto(pg('air-blower-borbulhamento'));
  await expect(page.getByRole('link', { name: 'Perguntar disponibilidade' })).toBeVisible();
  await page.goto(pg('sauna-compacta-bbb'));
  await page.fill('#escala-largura', '150');
  await page.fill('#escala-comprimento', '200');
  await expect(page.locator('[data-escala-svg]')).toContainText('Vista frontal · altura 2,10 m');
  await page.goto(pg('jato'));
  await expect(page.locator('#planta, #cabe')).toHaveCount(0);
});

test('sem rolagem horizontal de 320 a 1920 px nas páginas-tipo de produto', async ({ page }) => {
  for (const slug of [ACQUA, 'spa-quadrado-serena-completo-com-hidro-em-acrilico', 'air-blower-borbulhamento', 'sauna-compacta-bbb', 'banheira-dupla-capri-completa-com-hidro-em-acrilico-1']) {
    await page.goto(pg(slug));
    for (const w of [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 800 });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, `${slug} em ${w}`).toBeLessThanOrEqual(w);
    }
  }
});

test('prazo por estado: nenhuma célula de prazo cortada de 320 a 430 px', async ({ page }) => {
  await page.goto(pg(ACQUA));
  for (const w of [320, 360, 375, 390, 414, 430]) {
    await page.setViewportSize({ width: w, height: 800 });
    const cortes = await page.evaluate(() => [...document.querySelectorAll('[data-prazo] td')].filter((td) => {
      const r = td.getBoundingClientRect(), box = td.closest('.rolagem').getBoundingClientRect();
      return td.scrollWidth > td.clientWidth + 1 || r.right > box.right + 1;
    }).map((td) => td.textContent));
    expect(cortes, `em ${w}`).toEqual([]);
  }
});

test('doca em 360 px: nome em até 2 linhas e o tamanho escolhido inteiro', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(pg('spa-quadrado-copacabana-completo-com-hidro'));
  const y = await page.evaluate(() => document.querySelector('#comprar').getBoundingClientRect().bottom + window.scrollY + 200);
  await page.evaluate((v) => window.scrollTo(0, v), y);
  const doca = page.locator('[data-doca]');
  await expect(doca).toBeVisible();
  const r = await page.evaluate(() => {
    const t = document.querySelector('[data-doca-tam]'), c = document.querySelector('.doca__cons'), d = document.querySelector('[data-doca]');
    const rt = t.getBoundingClientRect(), rc = c.getBoundingClientRect(), rd = d.getBoundingClientRect();
    return { cheio: t.scrollWidth <= t.clientWidth + 1 && rt.right <= innerWidth, folga: rd.bottom - rc.bottom };
  });
  expect(r.cheio).toBe(true);
  expect(r.folga).toBeGreaterThanOrEqual(6);
  await expect(page.locator('.doca__btn')).toHaveAccessibleName(/Comprar pelo WhatsApp/);
});

test('desktop: coluna de decisão sem rolagem interna e voltagem clicável', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pg(ACQUA));
  const col = page.locator('.prod__decisao');
  expect(await col.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
  await page.locator('.chip-op', { hasText: '220V' }).click();
  expect(await msgCompra(page)).toContain('Voltagem: 220V');
});

test('topo: uma planta só no fundo e rótulos da escala legíveis no celular', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(pg(ACQUA));
  await expect(page.locator('.prod-topo__fundo img')).toHaveCount(1);
  await page.locator('[data-escala]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const menor = await page.evaluate(() => Math.min(...[...document.querySelectorAll('[data-escala-svg] text')].map((t) => t.getBoundingClientRect().height)));
  expect(menor).toBeGreaterThanOrEqual(11);
});

test.describe('movimento reduzido (lite)', () => {
  test.use({ reducedMotion: 'reduce' });
  test('ferramentas funcionam sem animação', async ({ page }) => {
    await page.goto(pg(ACQUA));
    await expect(page.locator('html')).toHaveAttribute('data-lite', '1');
    await page.locator('label.seletor__op', { hasText: '0,79 x 1,48 x 0,37' }).click();
    expect(await msgCompra(page)).toContain('Tamanho: 0,79 x 1,48 x 0,37');
    await page.fill('#escala-largura', '90');
    await page.fill('#escala-comprimento', '170');
    await expect(page.locator('[data-escala-txt]')).toContainText('Sobram 11 cm na largura e 22 cm no comprimento');
  });
});

test.describe('sem JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('preço, ficha, planta estática e WhatsApp presentes', async ({ page }) => {
    await page.goto(pg(ACQUA));
    await expect(page.locator('[data-campo="preco-por"]').first()).toHaveText('R$5.401,18');
    await expect(page.locator('#ficha [data-ficha="Material"]')).toHaveText('Acrílico');
    await expect(page.locator('[data-tam-painel]:not([hidden]) .explorador__img')).toBeVisible();
    expect(await msgCompra(page)).toContain('Modelo: Banheira Acqua Línea COMPLETA com hidro em Acrílico (SKU BALCHA)');
  });
});
