// Testes do bloco de mídia (SPEC 7, 13.11 no nível dos arquivos, limites do GitHub).
// Rodam sobre public/media e data/plantas (versionados). As comparações com _recon/ só no Mac.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const DATA = join(ROOT, 'data');
const RECON = join(ROOT, '_recon');
const temRecon = existsSync(join(RECON, 'images-manifest.json'));
const semRecon = temRecon ? false : '_recon/ ausente (CI): comparação com a fonte só roda no Mac';

const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const produtos = lerJson(join(DATA, 'produtos.json'));
const categorias = lerJson(join(DATA, 'categorias.json'));
const fotos = lerJson(join(PUB, 'media', 'p', 'manifest.json'));
const plantas = lerJson(join(PUB, 'media', 'plantas', 'manifest.json'));
const og = lerJson(join(PUB, 'media', 'og', 'manifest.json'));
const resumoCotas = lerJson(join(DATA, 'plantas', '_resumo.json'));
const segunda = lerJson(join(DATA, 'plantas', 'segunda-leitura.json'));
const cotas = Object.fromEntries(
  readdirSync(join(DATA, 'plantas'))
    .filter((f) => /^[0-9a-f]{40}\.json$/.test(f))
    .map((f) => [f.slice(0, 40), lerJson(join(DATA, 'plantas', f))]),
);

function arquivos(dir) {
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...arquivos(p));
    else out.push(p);
  }
  return out;
}

describe('limites do GitHub', () => {
  test('public/media abaixo de 650 MB e nenhum arquivo de public/ acima de 50 MB', () => {
    const media = arquivos(join(PUB, 'media')).reduce((s, f) => s + statSync(f).size, 0);
    assert.ok(media < 650 * 1024 * 1024, `public/media tem ${(media / 1048576).toFixed(1)} MB`);
    const grandes = arquivos(PUB).filter((f) => statSync(f).size > 50 * 1024 * 1024);
    assert.deepEqual(grandes, []);
  });
});

describe('fotos (SPEC 7.1)', () => {
  test('um item de manifesto por foto de galeria, na ordem da galeria', () => {
    for (const p of produtos) {
      const g = (p.galeria || []).filter((x) => x.placeholder_do_tema === false);
      const m = fotos.produtos[p.slug];
      assert.ok(Array.isArray(m), `sem manifesto: ${p.slug}`);
      assert.equal(m.length, g.length, p.slug);
      m.forEach((f, i) => {
        assert.equal(f.n, i + 1);
        assert.equal(f.fonte, g[i].original, `${p.slug} #${i + 1}`);
        assert.equal(f.alt, g[i].legenda ?? null);
      });
    }
  });

  test('larguras pela regra e nenhuma saída maior que o original; dimensões reais conferem', async () => {
    for (const [slug, lista] of Object.entries(fotos.produtos)) {
      for (const f of lista) {
        const esperadas = [400, 800, 1080].filter((w) => w <= f.largura && (w !== 1080 || f.largura >= 1080));
        if (f.largura < 800 && !esperadas.includes(f.largura)) esperadas.push(f.largura);
        esperadas.sort((a, b) => a - b);
        for (const fmt of ['avif', 'webp']) {
          assert.deepEqual(f[fmt].map((x) => x.w), esperadas, `${slug} #${f.n} ${fmt}`);
          for (const x of f[fmt]) {
            assert.ok(x.src.startsWith(`media/p/${slug}/${slug}-${f.n}-`), x.src);
            const meta = await sharp(join(PUB, x.src)).metadata();
            assert.equal(meta.width, x.w, x.src);
            assert.equal(meta.height, x.h, x.src);
            assert.ok(meta.width <= f.largura && meta.height <= f.altura, `${x.src} maior que o original`);
          }
        }
        const mj = await sharp(join(PUB, f.jpg.src)).metadata();
        assert.equal(mj.width, f.jpg.w);
        assert.ok(mj.width <= Math.min(800, f.largura), f.jpg.src);
        assert.match(f.lqip, /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
        assert.ok(f.lqip.length < 2048, `LQIP grande demais: ${slug}`);
        assert.match(f.cor_bordas, /^#[0-9A-F]{6}$/);
        assert.equal(f.wall, f.fundo_vermelho ? null : f.cor_bordas);
      }
    }
  });

  test('nome de arquivo não carrega os números do nome original', () => {
    for (const [slug, lista] of Object.entries(fotos.produtos)) {
      for (const f of lista) for (const x of [...f.avif, ...f.webp, f.jpg]) assert.match(x.src.split('/').pop(), new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+-\\d+\\.(avif|webp|jpg)$`));
    }
  });

  test('sha1 e dimensões batem com o arquivo de origem do _recon', { skip: semRecon }, () => {
    const rec = lerJson(join(RECON, 'images-manifest.json')).arquivos.filter((a) => a.tipo === 'galeria');
    const idx = new Map(rec.map((a) => [`${a.slug}\u0000${a.url_original}`, a]));
    for (const [slug, lista] of Object.entries(fotos.produtos)) {
      for (const f of lista) {
        const a = idx.get(`${slug}\u0000${f.fonte}`);
        assert.ok(a, `${slug} ${f.fonte}`);
        assert.equal(f.sha1, a.sha1);
        assert.equal(f.largura, a.largura);
        assert.equal(f.altura, a.altura);
      }
    }
  });
});

describe('plantas (SPEC 7.2)', () => {
  const lista = Object.values(plantas.plantas);

  test('deduplicadas por sha1 e PDF publicado no caminho do site atual com o mesmo conteúdo', () => {
    assert.equal(lista.length, plantas.total);
    assert.equal(new Set(lista.map((p) => p.sha1)).size, lista.length);
    for (const p of lista) {
      const f = join(PUB, p.pdf_path);
      assert.ok(existsSync(f), p.pdf_path);
      assert.equal(createHash('sha1').update(readFileSync(f)).digest('hex'), p.sha1, p.pdf_path);
    }
  });

  test('todo PDF citado em d_planta tem raster e JSON de cotas', () => {
    for (const p of produtos) {
      for (const t of p.d_planta || []) {
        if (!t.sha1) continue;
        assert.ok(plantas.plantas[t.sha1], `${p.slug} ${t.rotulo}`);
        assert.ok(cotas[t.sha1], `${p.slug} ${t.rotulo}`);
        assert.equal(t.pdf_path, plantas.plantas[t.sha1].pdf_path);
        assert.equal(t.cotas_validadas, cotas[t.sha1].validada, `${p.slug} ${t.rotulo}: rode o normalize depois do cotas`);
      }
    }
  });

  test('miniatura, tela e blocos existem, com dimensões coerentes e nunca acima do raster', async () => {
    for (const p of lista) {
      const dir = join(PUB, 'media', 'plantas', p.sha1);
      for (const [f, w] of [['planta-1200.webp', 1200], ['planta-1200.png', 1200], ['planta-2400.webp', 2400], ['planta-2400.avif', 2400]]) {
        const m = await sharp(join(dir, f)).metadata();
        assert.equal(m.width, Math.min(w, p.largura_px), `${p.sha1}/${f}`);
      }
      const ult = p.niveis[p.niveis.length - 1];
      assert.equal(ult.largura, p.largura_px);
      assert.equal(ult.altura, p.altura_px);
      assert.ok(p.niveis[0].largura <= p.tile && p.niveis[0].altura <= p.tile);
      for (const n of p.niveis) {
        const tiles = readdirSync(join(dir, `z${n.z}`));
        assert.equal(tiles.length, n.colunas * n.linhas, `${p.sha1} z${n.z}`);
      }
      const canto = await sharp(join(dir, `z${ult.z}`, `${ult.colunas - 1}_${ult.linhas - 1}.webp`)).metadata();
      assert.equal(canto.width, ult.largura - (ult.colunas - 1) * p.tile);
      assert.equal(canto.height, ult.altura - (ult.linhas - 1) * p.tile);
    }
  });
});

describe('cotas (SPEC 7.2)', () => {
  const TOL = 0.01 + 1e-9;
  const porSlug = new Map(produtos.map((p) => [p.slug, p]));

  test('um JSON por planta, com coordenadas dentro do raster e sem dados da responsável técnica', () => {
    assert.deepEqual(Object.keys(cotas).sort(), Object.keys(plantas.plantas).sort());
    for (const r of Object.values(cotas)) {
      assert.equal(r.largura_px, plantas.plantas[r.sha1].largura_px);
      assert.equal(r.altura_px, plantas.plantas[r.sha1].altura_px);
      for (const c of r.cotas) {
        assert.match(c.letra, /^[A-Z]\d?(\/[A-Z])?$/);
        assert.ok(Number.isFinite(c.valor_m) && c.valor_m > 0 && c.valor_m < 5, `${r.sha1} ${c.letra}`);
        assert.equal(c.valor_m, Number(c.valor_texto.replace(',', '.')));
        for (const pos of c.posicoes) assert.ok(pos.x >= 0 && pos.x <= r.largura_px && pos.y >= 0 && pos.y <= r.altura_px);
      }
      assert.doesNotMatch(JSON.stringify(r), /CREA|RESPONS[ÁA]VEL|ENGENHEIR/i);
    }
  });

  test('validada só com validação automática, lote independente sem divergência e posições conferidas', () => {
    for (const r of Object.values(cotas)) {
      assert.equal(r.validada, r.valores_validados && r.posicoes.ok, r.pdf_path);
      if (!r.validada) continue;
      assert.equal(r.validacao_automatica.ok, true, r.sha1);
      assert.equal(resumoCotas.lote_ok, true);
      assert.ok(r.revisor, r.sha1);
    }
    assert.ok(resumoCotas.amostra >= 20);
    assert.equal(resumoCotas.divergencias_segunda_leitura, 0);
  });

  test('a amostra do lote vem de um segundo agente (a leitura do construtor não conta)', () => {
    const indep = segunda.revisoes.filter((r) => r.independente === true);
    const comValores = new Set(indep.flatMap((r) => Object.keys(r.leituras || {})));
    assert.ok(comValores.size >= 20, `leituras independentes com valores: ${comValores.size}`);
    for (const r of segunda.revisoes.filter((x) => x.independente !== true)) {
      for (const sha of Object.keys(r.leituras || {})) {
        if (comValores.has(sha)) continue;
        assert.notEqual(cotas[sha].segunda_leitura?.independente, true, `${sha}: leitura do construtor contada como independente`);
      }
    }
    for (const sha of comValores) assert.equal(cotas[sha].segunda_leitura.independente, true, sha);
  });

  test('A, B e H (ou H1 e H2) das plantas validadas têm exatamente uma posição no desenho, fora da tabela', () => {
    for (const r of Object.values(cotas)) {
      if (!r.validada) continue;
      const letras = r.posicoes.letras;
      assert.ok(letras.includes('A') && letras.includes('B') && (letras.includes('H') || (letras.includes('H1') && letras.includes('H2'))), r.pdf_path);
      for (const l of letras) {
        const c = r.cotas.find((x) => x.letra === l);
        assert.equal(c.posicoes.length, 1, `${r.pdf_path} ${l}: ${c.posicoes.length} posições`);
        assert.deepEqual({ x: c.x, y: c.y }, c.posicoes[0], `${r.pdf_path} ${l}`);
        // A letra marcada não é a da própria tabela.
        assert.ok(Math.hypot(c.x - c.tabela_x, c.y - c.tabela_y) > 20, `${r.pdf_path} ${l} caiu na tabela`);
      }
    }
  });

  test('posição principal nunca é escolhida quando há mais de uma ocorrência', () => {
    for (const r of Object.values(cotas)) {
      for (const c of r.cotas) {
        if (c.posicoes.length === 1) assert.deepEqual({ x: c.x, y: c.y }, c.posicoes[0]);
        else assert.ok(c.x === null && c.y === null, `${r.pdf_path} ${c.letra}`);
      }
    }
  });

  test('regressão: o "A" e o "I" da palavra VISTA não viram cota (Osaka e Karisma)', () => {
    for (const nome of ['Ofuro osaka - 0,99 x 0,99 x 0,64 [GC-AC].pdf', 'Karisma - 1,10 x 1,80 x 0,50 [GC].pdf']) {
      const r = Object.values(cotas).find((x) => x.nome_arquivo === nome);
      assert.ok(r, nome);
      for (const l of ['A', 'I']) assert.equal(r.cotas.find((c) => c.letra === l).posicoes.length, 1, `${nome} ${l}`);
      assert.equal(r.validada, true, nome);
    }
  });

  test('A, B e H das plantas validadas batem com o rótulo de cada tamanho legível (tolerância 0,01 m)', () => {
    for (const r of Object.values(cotas)) {
      if (!r.validada) continue;
      const v = (l) => r.cotas.find((c) => c.letra === l)?.valor_m;
      const Hs = v('H') != null ? [v('H')] : [v('H1'), v('H2')].filter((x) => x != null);
      let legiveis = 0;
      for (const u of r.usos) {
        const t = porSlug.get(u.slug).d_tamanhos.find((x) => x.rotulo === u.rotulo);
        if (!t || t.a == null || t.b == null || t.c == null) continue;
        legiveis++;
        const par = (Math.abs(v('A') - t.a) <= TOL && Math.abs(v('B') - t.b) <= TOL) || (Math.abs(v('A') - t.b) <= TOL && Math.abs(v('B') - t.a) <= TOL);
        assert.ok(par, `${r.pdf_path} x ${u.slug} ${u.rotulo}`);
        assert.ok(Hs.some((h) => Math.abs(h - t.c) <= TOL), `${r.pdf_path} H x ${u.rotulo}`);
      }
      assert.ok(legiveis > 0, r.pdf_path);
    }
  });

  test('a amostra da segunda leitura cobre todas as formas com tabela de cotas', () => {
    const formas = new Set();
    for (const r of Object.values(cotas)) {
      if (!r.validacao_automatica.ok) continue;
      for (const u of r.usos) {
        const p = porSlug.get(u.slug);
        formas.add(`${p.d_tipo} ${p.especificacoes?.Forma}`);
      }
    }
    for (const f of formas) assert.ok(resumoCotas.formas_na_amostra.includes(f), `forma sem amostra: ${f}`);
  });

  test('toda planta não validada está em cotas-a-revisar.csv, com motivo que distingue tabela em contorno de planta sem tabela', () => {
    const csv = readFileSync(join(DATA, 'cotas-a-revisar.csv'), 'utf8');
    for (const r of Object.values(cotas)) if (!r.validada) assert.ok(csv.includes(r.sha1), r.pdf_path);
    for (const r of Object.values(cotas)) {
      if (!r.tabela_sem_texto) continue;
      assert.notEqual(r.tabela_sem_texto, 'nao_conferida', `${r.pdf_path}: sem conferência visual da tabela`);
      const linha = csv.split('\n').find((l) => l.includes(r.sha1));
      if (r.tabela_sem_texto === 'contorno') assert.match(linha, /tabela de letras existe em contorno/);
      else assert.match(linha, /planta sem tabela de letras/);
    }
    const lyon = Object.values(cotas).find((r) => r.nome_arquivo.startsWith('Lyon'));
    assert.equal(lyon.tabela_sem_texto, 'contorno');
  });

  test('toda ligação produto -> PDF do site atual que não virou tamanho está registrada, com motivo', () => {
    const csv = readFileSync(join(DATA, 'plantas-nao-ligadas.csv'), 'utf8').trim().split('\n').slice(1);
    const chaves = new Set(csv.map((l) => { const [slug, nome] = l.match(/"((?:[^"]|"")*)"/g).map((x) => x.slice(1, -1)); return `${slug}\u0000${nome}`; }));
    let n = 0;
    for (const p of produtos) {
      for (const item of p.plantas_pdf || []) {
        const nome = decodeURIComponent(new URL(String(item.url).replace(/ /g, '%20')).pathname.split('/').pop());
        if ((p.d_planta || []).some((t) => t.nome_arquivo === nome)) continue;
        n++;
        assert.ok(chaves.has(`${p.slug}\u0000${nome}`), `${p.slug} ${nome}`);
      }
    }
    assert.equal(csv.length, n);
    assert.equal(resumoCotas.ligacoes_nao_casadas, n);
  });
});

describe('imagens de compartilhamento (SPEC 7.3)', () => {
  test('1200x630 para cada produto, cada coleção e a padrão, sem preço no manifesto', async () => {
    const todas = [
      ...produtos.map((p) => og.produtos[p.slug]?.src),
      ...categorias.map((c) => og.colecoes[c.d_path]?.src),
      og.padrao,
    ];
    for (const src of todas) {
      assert.ok(src, 'faltando no manifesto');
      const m = await sharp(join(PUB, src)).metadata();
      assert.equal(m.format, 'jpeg');
      assert.equal(m.width, 1200);
      assert.equal(m.height, 630);
    }
    // Sem preço: nenhum campo de preço e nenhuma medida com o acréscimo "+ R$" do rótulo.
    assert.deepEqual(og.fontes, ['Fraunces', 'Open Sans']);
    for (const x of [...Object.values(og.produtos), ...Object.values(og.colecoes), og.padrao_info]) {
      assert.match(x.chave, /^[0-9a-f]{40}$/, `sem chave de conteúdo: ${x.src}`);
    }
    for (const x of [...Object.values(og.produtos), ...Object.values(og.colecoes)]) {
      assert.deepEqual(Object.keys(x).filter((k) => /pre[cç]o|valor/i.test(k)), []);
      assert.ok(!/R\$/.test(x.medida ?? ''), x.src);
    }
  });
});
