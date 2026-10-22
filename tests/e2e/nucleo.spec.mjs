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

// ---------- Acessibilidade e acabamento medidos no navegador (correções do verificador) ----------

// Contraste do anel de foco contra o fundo real onde ele é desenhado: compõe as cores de fundo de
// tudo que está sob o ponto do contorno (elementsFromPoint), do topo para baixo, até ficar opaco.
const MEDIR_FOCO = () => {
  const rgba = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return [m[0], m[1], m[2], m[3] ?? 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const fundoEm = (x, y, ignorar, dentro) => {
    let cor = [0, 0, 0], a = 0;
    const camadas = [];
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === ignorar) { if (dentro) camadas.push(el); continue; }
      if (ignorar.contains(el)) continue;
      camadas.push(el);
    }
    const vistas = new Set();
    for (const el of [...camadas, document.body, document.documentElement]) {
      if (vistas.has(el)) continue;
      vistas.add(el);
      const [r, g, b, al] = rgba(getComputedStyle(el).backgroundColor);
      if (!al) continue;
      const resto = 1 - a;
      cor = cor.map((c, i) => c + [r, g, b][i] * al * resto);
      a += al * resto;
      if (a >= 0.999) break;
    }
    return cor.map((c) => c / (a || 1));
  };
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const off = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth) / 2;
  const x = off < 0 || r.left - off >= 1 ? r.left - off : r.right + off;
  const y = r.top + r.height / 2;
  const fundo = fundoEm(x, y, el, off < 0);
  return { el: `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60), estilo: cs.outlineStyle, largura: parseFloat(cs.outlineWidth), razao: razao(rgba(cs.outlineColor), fundo) };
};

async function conferirFoco(page, seletor) {
  const n = await page.locator(seletor).count();
  const falhas = [];
  for (let i = 0; i < n; i++) {
    const alvo = page.locator(seletor).nth(i);
    if (!(await alvo.isVisible())) continue;
    await alvo.scrollIntoViewIfNeeded();
    await alvo.evaluate((e) => e.focus());
    const m = await page.evaluate(MEDIR_FOCO);
    if (m.estilo === 'none' || m.largura < 2 || m.razao < 3) falhas.push(m);
  }
  return falhas;
}

test('foco visível com contraste de 3:1 no fundo real: barra superior, cabeçalho, sala, dia, rodapé e gaveta', async ({ page }) => {
  for (const largura of [390, 1440]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(PAG());
    await page.keyboard.press('Tab'); // modalidade de teclado: foco programático também fica visível
    const falhas = await conferirFoco(page, '.topo a, .cab a, .cab button, main a, main button, main [tabindex="0"], footer a, footer button');
    expect(falhas, `largura ${largura}`).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAG());
  await page.keyboard.press('Tab');
  await page.locator('.cab__whats [data-gaveta-abrir], .cab [data-gaveta-abrir="gaveta-whats"]').first().evaluate((b) => b.click());
  await expect(page.locator('#gaveta-whats')).toHaveJSProperty('open', true);
  expect(await conferirFoco(page, '#gaveta-whats a, #gaveta-whats summary, #gaveta-whats button')).toEqual([]);
});

test('foco visível também no cabeçalho opaco da página da peça e no modo escuro', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/_sistema-peca.html`);
    await page.keyboard.press('Tab');
    expect(await conferirFoco(page, '.topo a, .cab a, .cab button, main a, main button'), colorScheme).toEqual([]);
    await ctx.close();
  }
});

test('alvos de toque com pelo menos 44 x 44 px (SPEC 16) a 390 e 1440 px', async ({ page }) => {
  const medir = () => {
    const sel = 'a[href], button, summary, input, select, [role="button"]';
    return [...document.querySelectorAll(sel)]
      .filter((e) => !e.closest('.vh, [hidden], dialog:not([open])') && !e.matches('.pular') && e.checkVisibility?.({ visibilityProperty: true }) !== false)
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width && r.height)
      .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
      .map(({ e, r }) => `${e.tagName.toLowerCase()}.${e.className} "${e.textContent.trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  };
  for (const largura of [390, 1440]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(PAG());
    // bandeja visível para entrar na medição
    await page.locator('.sis-cartao [data-comparar]').first().click();
    expect(await page.evaluate(medir), `largura ${largura}`).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.cab [data-gaveta-abrir="gaveta-whats"]').first().evaluate((b) => b.click());
  await page.locator('#gaveta-whats [data-foco="consultores"] summary').click();
  expect(await page.evaluate(medir)).toEqual([]);
});

test('CSS do site atrasado 1,5 s não desloca a primeira tela (CLS < 0,05)', async ({ browser }) => {
  for (const pag of ['_sistema-peca.html', '_sistema.html']) {
    for (const largura of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: largura, height: 844 } });
      const page = await ctx.newPage();
      await page.route(/\/assets\/site\.[0-9a-f]+\.css$/, async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${BASE}/${pag}`);
      await page.waitForTimeout(2600);
      const cls = await page.evaluate(() => window.__cls);
      expect(cls, `${pag} a ${largura}`).toBeLessThan(0.05);
      await ctx.close();
    }
  }
});

test('cabeçalho: branco opaco no topo da peça (tom claro) e sem fresta sob o cabeçalho transparente', async ({ page }) => {
  for (const largura of [320, 390, 1440]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto(`${BASE}/_sistema-peca.html`);
    expect(await page.locator('.cab').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
    await page.goto(PAG());
    const g = await page.evaluate(() => ({
      topo: document.querySelector('.topo').getBoundingClientRect().bottom,
      sala: document.querySelector('main').firstElementChild.getBoundingClientRect().top,
    }));
    expect(g.sala, `largura ${largura}`).toBeLessThanOrEqual(g.topo);
  }
});

test('gaveta aberta em "Escolher meu consultor": o item em foco não fica sob o topo fixo', async ({ page }) => {
  for (const altura of [844, 640]) {
    await page.setViewportSize({ width: 390, height: altura });
    await page.goto(PAG());
    await page.locator('.sis-hero [data-gaveta-foco="consultores"]').click();
    await expect(page.locator('#gaveta-whats [data-foco="consultores"] summary')).toBeFocused();
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      topo: document.querySelector('#gaveta-whats .gaveta__topo').getBoundingClientRect().bottom,
      foco: document.activeElement.getBoundingClientRect().top,
    }));
    expect(r.foco, `altura ${altura}`).toBeGreaterThanOrEqual(r.topo - 1);
  }
});

test('trilha: o separador nunca abre a linha seguinte', async ({ page }) => {
  for (const largura of [320, 390]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto(`${BASE}/_sistema-peca.html`);
    const ok = await page.evaluate(() => [...document.querySelectorAll('.trilha li')].every((li) => {
      const sep = getComputedStyle(li, '::after').content;
      return li.matches(':last-child') ? sep === 'none' || sep === 'normal' : sep !== 'none';
    }));
    expect(ok).toBe(true);
  }
});
