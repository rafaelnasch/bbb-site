// Bloco 5 no navegador (SPEC 14 e 16): coleção (filtros, ordenação, "Ver em escala", sem JS), escolhedor
// (rotação, quase cabe, medida a confirmar, WhatsApp, estado na URL), comparador (3 peças, contornos,
// só diferenças, rolagem local em 320 px) e busca (acento, 1 erro, faceta, vazio).
// Pré-requisito: dist/ renderizado (`node build/render.mjs`), ou E2E_DIST apontando para outra pasta.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciar } from './servidor.mjs';
import { melhorTamanho, tamanhoCm } from '../../build/lib/encaixe.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const produtos = JSON.parse(readFileSync(join(RAIZ, 'data', 'produtos.json'), 'utf8'));
const categorias = JSON.parse(readFileSync(join(RAIZ, 'data', 'categorias.json'), 'utf8'));
const porSlug = new Map(produtos.map((p) => [p.slug, p]));
const semConflito = (p, k) => !(p.d_conflito_nome_ficha || []).some((c) => c.campo === k);
const valor = (p, k) => (semConflito(p, k) ? p.especificacoes?.[k] ?? null : null);
const cabeAlgum = (p, L, C, f = 0) => {
  const ts = (p.d_tamanhos || []).map(tamanhoCm);
  const m = melhorTamanho(ts, { largura: L, comprimento: C, folga: f });
  return m?.cabe ? m : null;
};

let srv, BASE;
test.beforeAll(async () => { ({ srv, url: BASE } = await iniciar()); });
test.afterAll(() => srv?.close());
const pg = (p) => `${BASE}/${p}`;

// ---------------------------------------------------------------- coleção
test.describe('coleção', () => {
  const ban = categorias.find((c) => c.d_path === 'banheiras.html').produtos.map((s) => porSlug.get(s));
  const visiveis = (page) => page.locator('[data-col-grade] > li:not([hidden])');

  test('três combinações de filtro reduzem a contagem certa (estado pela URL)', async ({ page }) => {
    const casos = [
      ['fo=Retangular', ban.filter((p) => valor(p, 'Forma') === 'Retangular').length],
      ['fo=Retangular&ma=Acr%C3%ADlico', ban.filter((p) => valor(p, 'Forma') === 'Retangular' && valor(p, 'Material') === 'Acrílico').length],
      ['l=80&c=150', ban.filter((p) => cabeAlgum(p, 80, 150)).length],
    ];
    for (const [q, n] of casos) {
      await page.goto(pg(`banheiras.html?${q}`));
      await expect(visiveis(page)).toHaveCount(n);
      await expect(page.locator('[data-col-n]')).toHaveText(String(n));
      expect(n).toBeLessThan(210);
    }
  });

  test('filtrar pela gaveta, chip removível, ordenação e "Ver em escala" com todos os resultados', async ({ page }) => {
    await page.goto(pg('banheiras.html'));
    await page.getByRole('button', { name: /Filtrar/ }).first().click();
    const dlg = page.locator('#col-filtros');
    await expect(dlg).toBeVisible();
    await dlg.locator('label.col-op', { hasText: 'De Canto' }).click();
    const n = ban.filter((p) => valor(p, 'Forma') === 'De Canto').length;
    await expect(dlg.locator('[data-col-n-btn]')).toHaveText(String(n));
    await dlg.locator('button[type="submit"]').click();
    await expect(dlg).toBeHidden();
    await expect(visiveis(page)).toHaveCount(n);
    expect(page.url()).toContain('fo=De+Canto');
    await expect(page.locator('.col-ativo')).toHaveCount(1);
    // ordenação por menor preço
    await page.locator('.col-ordem--barra select').selectOption('menor-preco');
    const precos = await visiveis(page).evaluateAll((els) => els.map((e) => Number(e.dataset.p)));
    expect(precos).toEqual([...precos].sort((a, b) => a - b));
    // Ver em escala desenha todos os resultados filtrados
    await page.locator('[data-col-escala]').click();
    await expect(page.locator('[data-col-escala-lista] > li')).toHaveCount(n);
    // o chip remove o filtro
    await page.locator('.col-ativo button').click();
    await expect(visiveis(page)).toHaveCount(210);
    await expect(page.locator('[data-col-escala-lista] > li')).toHaveCount(ban.filter((p) => (p.d_tamanhos || []).some((t) => tamanhoCm(t))).length);
  });

  test('sem JavaScript, todos os cartões aparecem e são links', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(pg('banheiras.html'));
    await expect(page.locator('.cart')).toHaveCount(210);
    await expect(page.locator('.cart:visible')).toHaveCount(210);
    await expect(page.locator('.cart a.cart__a')).toHaveCount(210);
    await expect(page.locator('[data-col-filtros], .col-barra__acoes:visible')).toHaveCount(0);
    await ctx.close();
  });
});

// ---------------------------------------------------------------- escolhedor
test.describe('escolhedor', () => {
  const banheiras = produtos.filter((p) => p.d_tipo === 'banheira');

  test('encaixe com rotação e contagem igual à do build', async ({ page }) => {
    const n = banheiras.filter((p) => cabeAlgum(p, 90, 170)).length;
    await page.goto(pg('escolher.html?tipo=banheira&l=90&c=170&passo=8'));
    await expect(page.locator('[data-esc-lista] > li')).toHaveCount(n);
    await expect(page.locator('[data-esc-res-n]')).toHaveText(String(n));
    await page.goto(pg('escolher.html?tipo=banheira&l=170&c=90&passo=8'));
    await expect(page.locator('[data-esc-lista] > li')).toHaveCount(n);
    // folga de 10 cm reduz
    const n10 = banheiras.filter((p) => cabeAlgum(p, 90, 170, 10)).length;
    await page.goto(pg('escolher.html?tipo=banheira&l=90&c=170&folga=10&passo=8'));
    await expect(page.locator('[data-esc-lista] > li')).toHaveCount(n10);
  });

  test('quase cabe: grupo separado com a diferença exata em cm', async ({ page }) => {
    await page.goto(pg('escolher.html?tipo=banheira&l=90&c=137&passo=8'));
    const quase = page.locator('[data-esc-quase-lista] > li');
    await expect(page.locator('[data-esc-quase]')).toBeVisible();
    expect(await quase.count()).toBeGreaterThan(0);
    await expect(quase.first().locator('.esc-c__folga')).toHaveText(/^Quase cabe: passa \d+(,\d)? cm (da largura|do comprimento)\.$/);
  });

  test('medida a confirmar: selo e cálculo pela maior medida', async ({ page }) => {
    // Sevilha: opção 1,36 x 1,36, ficha 1,50 x 1,36. Num espaço de 140 x 140 cm não cabe (usa a maior).
    await page.goto(pg('escolher.html?tipo=banheira&l=140&c=160&passo=8'));
    const sev = (p) => p.locator('[data-esc-lista] > li:has(a[href*="/banheira-de-canto-sevilha-com-hidro-em-acrilico.html"])');
    await expect(sev(page).locator('.selo--confirmar')).toHaveText('Medida a confirmar');
    await page.goto(pg('escolher.html?tipo=banheira&l=140&c=140&passo=8'));
    await expect(sev(page)).toHaveCount(0);
    // a versão irmã com medida confirmada (1,36 x 1,36) cabe no mesmo espaço
    await expect(page.locator('[data-esc-lista] > li:has(a[href*="/banheira-de-canto-sevilha-com-hidro.html"])')).toHaveCount(1);
  });

  test('mensagem do WhatsApp com as respostas e estado da URL restaurado no celular', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(pg('escolher.html'));
    await page.locator('.esc-p.is-atual label.esc-op', { hasText: 'Banheira' }).click();
    await page.locator('[data-esc-avancar]').click();
    await page.fill('input[name="l"]', '90');
    await page.fill('input[name="c"]', '170');
    await expect(page.locator('[data-esc-n]')).toHaveText(String(banheiras.filter((p) => cabeAlgum(p, 90, 170)).length));
    await page.locator('[data-esc-avancar]').click();
    await expect(page).toHaveURL(/passo=3/);
    await page.reload();
    await expect(page.locator('input[name="l"]')).toHaveValue('90');
    await expect(page.locator('.esc-p[data-passo="3"]')).toHaveClass(/is-atual/);
    for (let i = 3; i <= 7; i++) await page.locator('[data-esc-avancar]').click();
    await expect(page.locator('[data-esc-res]')).toBeVisible();
    const href = await page.locator('[data-esc-wa]').getAttribute('href');
    expect(href.startsWith('https://wa.me/5535992194882?text=')).toBe(true);
    const msg = decodeURIComponent(href.split('?text=')[1]);
    expect(msg).toContain('Olá! Estou escolhendo uma banheira. Meu espaço: 90 x 170 cm.');
    expect(msg).toContain('/escolher.html?');
    expect(msg.split('\n').filter((l) => /\.html$/.test(l) && !l.includes('escolher')).length).toBeLessThanOrEqual(5);
  });

  test('sem resultado: os filtros que mais restringiram, com toque para soltar', async ({ page }) => {
    await page.goto(pg('escolher.html?tipo=sauna&l=60&c=60&passo=8'));
    await expect(page.locator('[data-esc-vazio]')).toBeVisible();
    const solta = page.locator('[data-esc-solta] button');
    expect(await solta.count()).toBeGreaterThan(0);
    await solta.filter({ hasText: 'Espaço' }).click();
    await expect(page.locator('[data-esc-lista] > li')).toHaveCount(produtos.filter((p) => p.d_tipo === 'sauna').length);
  });
});

// ---------------------------------------------------------------- comparador
test.describe('comparador', () => {
  const tres = ['banheira-acqua-linea-completa-com-hidro-em-acrilico', 'banheira-acqua-linea-completa-com-hidro', 'spa-quadrado-napole-completo-com-hidro'];

  test('3 peças, contornos na mesma escala, só diferenças e WhatsApp com os 3', async ({ page }) => {
    await page.goto(pg(`comparar.html?p=${tres.join(',')}`));
    await expect(page.locator('[data-cmp-thead] th[scope="col"]')).toHaveCount(3);
    await expect(page.locator('[data-cmp-svg] rect[stroke]')).toHaveCount(3);
    const iguais = page.locator('[data-cmp-tbody] tr[data-igual]');
    expect(await iguais.count()).toBeGreaterThan(0);
    const antes = await page.locator('[data-cmp-tbody] tr:visible').count();
    await page.locator('label.esc-check', { hasText: 'Mostrar só as diferenças' }).click();
    await expect(page.locator('[data-cmp-tbody] tr:visible')).toHaveCount(antes - (await iguais.count()));
    const msg = decodeURIComponent((await page.locator('[data-cmp-wa]').getAttribute('href')).split('?text=')[1]);
    const nomes = tres.map((s) => porSlug.get(s).nome);
    expect(msg.split('\n')[0]).toBe(`Quero ajuda para decidir entre ${nomes[0]}, ${nomes[1]} e ${nomes[2]}.`);
    // meu espaço
    await page.fill('[data-cmp-espaco] input[name="l"]', '90');
    await page.fill('[data-cmp-espaco] input[name="c"]', '170');
    await expect(page.locator('[data-cmp-txt]')).toContainText('cabe, sobram 11 e 29 cm');
    // tirar um
    await page.locator('[data-cmp-tirar]').last().click();
    await expect(page.locator('[data-cmp-thead] th[scope="col"]')).toHaveCount(2);
    expect(page.url()).toContain(`p=${tres[0]},${tres[1]}`);
  });

  test('tabela rola localmente em 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(pg(`comparar.html?p=${tres.join(',')}`));
    await expect(page.locator('[data-cmp-thead] th[scope="col"]')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.cmp-rol').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  });
});

// ---------------------------------------------------------------- busca
test.describe('busca', () => {
  const familia = produtos.filter((p) => p.d_familia === 'banheira-acqua-linea').map((p) => p.slug);

  for (const q of ['acqua', 'acqua linea', 'aqua linea', 'ACQUA LÍNEA']) {
    test(`"${q}" encontra a família Acqua Línea`, async ({ page }) => {
      await page.goto(pg(`busca.html?q=${encodeURIComponent(q)}`));
      await expect(page.locator('[data-bus-lista] > li').first()).toBeVisible();
      const hrefs = await page.locator('[data-bus-lista] .esc-c__nome a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      for (const s of familia) expect(hrefs.some((h) => h.endsWith(`/${s}.html`))).toBe(true);
    });
  }

  test('"spa 6 lugares" sugere a faceta e acha os spas de 6 lugares', async ({ page }) => {
    await page.goto(pg('busca.html'));
    await page.fill('[data-bus-q]', 'spa 6 lugares');
    await expect(page.locator('[data-bus-facetas] a', { hasText: '5 a 6 Lugares' })).toBeVisible();
    const seis = produtos.filter((p) => p.d_tipo === 'spa' && valor(p, 'Lugares') === '6 Lugares').map((p) => p.slug);
    const hrefs = await page.locator('[data-bus-lista] .esc-c__nome a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    for (const s of seis) expect(hrefs.some((h) => h.endsWith(`/${s}.html`))).toBe(true);
    expect(page.url()).toContain('q=spa%206%20lugares');
  });

  test('sem resultado leva ao escolhedor e à ajuda pelo WhatsApp', async ({ page }) => {
    await page.goto(pg('busca.html?q=xyzwq%20qqqq'));
    await expect(page.locator('[data-bus-vazio]')).toBeVisible();
    await expect(page.locator('[data-bus-vazio] a[href*="escolher.html"]')).toBeVisible();
    await expect(page.locator('[data-bus-vazio] a[href^="https://wa.me/5535992192256"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------- larguras
test('nenhuma rolagem horizontal da página em 320 e 430 px', async ({ page }) => {
  for (const w of [320, 430]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const p of ['banheiras.html', 'spas/5-a-6-lugares.html?l=200&c=200', 'escolher.html', 'escolher.html?tipo=spa&passo=8', 'busca.html?q=acqua', 'guia/banheira-por-tamanho.html', 'guia/basica-ou-completa.html', 'guia/gel-coat-ou-acrilico.html', 'guia/spa-por-lugares.html']) {
      await page.goto(pg(p));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${p} em ${w}px`).toBeLessThanOrEqual(0);
    }
  }
});

// ---------------------------------------------------------------- correções do verificador (bloco 5)
test.describe('correções do verificador', () => {
  const msgDe = async (page, sel) => decodeURIComponent((await page.locator(sel).getAttribute('href')).split('?text=')[1]);
  const linkEscolher = (msg) => msg.split('\n').pop();

  test('o link na mensagem acompanha a URL da página no mesmo instante (desktop e celular)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pg('escolher.html?tipo=banheira&l=80&c=150&passo=8'));
    await expect(page.locator('[data-esc-lista] > li').first()).toBeVisible();
    await page.locator('label.esc-op', { hasText: 'Redonda' }).first().click();
    await expect(page).toHaveURL(/forma=Redonda/);
    expect(linkEscolher(await msgDe(page, '[data-esc-wa]')).split('?')[1]).toBe(page.url().split('?')[1]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(pg('escolher.html?tipo=banheira&l=80&c=150&passo=7'));
    await expect(page.locator('.esc-p[data-passo="7"]')).toHaveClass(/is-atual/);
    await page.locator('[data-esc-avancar]').click();
    await expect(page).toHaveURL(/passo=8/);
    expect(linkEscolher(await msgDe(page, '[data-esc-wa]')).split('?')[1]).toBe(page.url().split('?')[1]);
  });

  test('a mensagem leva todas as respostas ativas', async ({ page }) => {
    await page.goto(pg('escolher.html?tipo=banheira&l=90&c=170&folga=5&pessoas=1&onde=banheiro&conf=Completa&aq=1&passo=8'));
    // O resultado só é montado com o site.css aplicado (escolher.js): espera o fim do carregamento.
    await expect(page.locator('.is-carregando')).toHaveCount(0);
    await expect(page.locator('[data-esc-res-n]')).not.toHaveText('');
    const l1 = (await msgDe(page, '[data-esc-wa]')).split('\n')[0];
    for (const t of ['uma banheira', 'Meu espaço: 90 x 170 cm, com folga de 5 cm.', 'Pessoas: Individual.', 'Onde vou instalar: no banheiro.', 'Configuração: Completa.', 'Com aquecedor.']) expect(l1).toContain(t);
  });

  test('selo "Medida a confirmar" nos 12 modelos, mesmo sem espaço informado', async ({ page }) => {
    const doze = produtos.filter((p) => p.d_medida_confirmada === false && p.d_tipo !== 'acessorio');
    expect(doze.length).toBe(12);
    await page.goto(pg('escolher.html?passo=8'));
    await expect(page.locator('[data-esc-lista] > li').first()).toBeVisible();
    for (const p of doze) await expect(page.locator(`[data-esc-lista] > li:has(a[href$="/${p.slug}.html"]) .selo--confirmar`)).toHaveCount(1);
    await expect(page.locator('[data-esc-lista] .selo--confirmar')).toHaveCount(12);
  });

  test('a nota do aquecedor conta sobre o mesmo resultado', async ({ page }) => {
    await page.goto(pg('escolher.html?tipo=banheira&l=80&c=150&passo=8'));
    await expect(page.locator('.is-carregando')).toHaveCount(0);
    const n = await page.locator('[data-esc-res-n]').textContent();
    await expect(page.locator('[data-esc-aq-nota]')).toContainText(new RegExp(`em \\d+ de ${n} modelos? deste resultado`));
  });

  test('tamanhos das respostas da coleção: o número prometido é o que aparece', async ({ page }) => {
    await page.goto(pg('banheiras.html'));
    const links = page.locator('[data-col-tam]');
    const n = await links.count();
    expect(n).toBeGreaterThan(10);
    for (const i of [0, Math.floor(n / 2), n - 1]) {
      const a = links.nth(i);
      const prometido = Number((await a.locator('span').textContent()).match(/\d+/)[0]);
      await a.click();
      await expect(page.locator('[data-col-n]')).toHaveText(String(prometido));
      await expect(page.locator('[data-col-grade] > li:not([hidden])')).toHaveCount(prometido);
      expect(page.url()).toContain('tam=');
      await page.locator('[data-col-ativos] .col-ativo button').first().click();
    }
    // e pelo endereço direto (sem JS no clique)
    const r = '1,60 x 1,60 x 0,50';
    await page.goto(pg(`banheiras.html?tam=${encodeURIComponent(r)}`));
    const esperado = categorias.find((c) => c.d_path === 'banheiras.html').produtos.filter((s) => (porSlug.get(s).d_tamanhos || []).some((t) => (t.rotulo ?? t.rotulo_ficha) === r)).length;
    await expect(page.locator('[data-col-grade] > li:not([hidden])')).toHaveCount(esperado);
  });

  test('busca por medida casa só o tamanho publicado exato', async ({ page }) => {
    const r = '1,60 x 1,60 x 0,50';
    await page.goto(pg(`busca.html?q=${encodeURIComponent(r)}`));
    const esperado = produtos.filter((p) => (p.d_tamanhos || []).some((t) => (t.rotulo ?? t.rotulo_ficha) === r)).length;
    await expect(page.locator('[data-bus-lista] > li')).toHaveCount(esperado);
  });

  test('comparador: sem bandeja na própria página; do escolhedor leva tamanho e espaço', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto(pg('escolher.html?tipo=banheira&l=90&c=170&passo=8'));
    const cart = page.locator('[data-esc-lista] > li').first();
    await expect(cart).toBeVisible();
    const tam = (await cart.locator('.esc-c__tam').textContent()).replace(/^[^:]+:\s*/, '').replace(/\s*\(.*$/, '').trim();
    await cart.locator('[data-comparar]').click();
    await page.locator('[data-bandeja-ir]').click();
    await expect(page).toHaveURL(/comparar\.html\?p=.*&l=90&c=170/);
    await expect(page.locator('[data-bandeja]')).toHaveCount(0);
    await expect(page.locator('[data-cmp-espaco] input[name="l"]')).toHaveValue('90');
    await expect(page.locator('[data-cmp-tbody] tr', { hasText: /^Tamanho/ }).first()).toContainText(tam);
  });
});

test.describe('teste ao vivo', () => {
  test('o cartão leva o tamanho que cabe para o produto e para a mensagem', async ({ page }) => {
    await page.goto(pg('escolher.html?tipo=banheira&l=80&c=170&passo=8'));
    const a = page.locator('[data-esc-lista] > li a[href*="/banheira-retangular-buzios-com-hidro.html"]');
    const href = await a.getAttribute('href');
    expect(href).toMatch(/\?t=\d+$/);
    await a.click();
    await expect(page.locator('input[name="tamanho"]:checked')).toHaveAttribute('data-rotulo', '0,80 x 1,70 x 0,41');
  });
});
