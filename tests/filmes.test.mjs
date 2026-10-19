// SPEC 8: filmes HyperFrames. Confere o manifesto contra os arquivos e contra data/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { paths } from '../site.config.mjs';

const MAN = join(paths.public, 'media', 'filmes', 'manifest.json');
const TETO = 350 * 1000;
const lerJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const temManifesto = existsSync(MAN);
const m = temManifesto ? lerJSON(MAN) : null;

let temFfprobe = true;
try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { temFfprobe = false; }

const todos = () => [...Object.entries(m.planta).map(([k, f]) => ['planta', k, f]), ...Object.entries(m.colecao).map(([k, f]) => ['colecao', k, f])];

test('manifesto de filmes existe', { skip: !temManifesto && 'filmes ainda não gerados' }, () => {
  assert.ok(Object.keys(m.planta).length > 0, 'nenhum filme de planta');
  for (const id of ['banheiras', 'spas', 'ofuros', 'sauna', 'lancamentos']) assert.ok(m.colecao[id], `falta o filme da coleção ${id}`);
});

test('cada filme tem WebM, MP4 e poster, até 350 KB', { skip: !temManifesto }, () => {
  for (const [, id, f] of todos()) {
    for (const arq of [f.webm.src, f.mp4.src, f.poster.avif.src, f.poster.webp.src]) {
      const p = join(paths.public, arq);
      assert.ok(existsSync(p), `${id}: falta ${arq}`);
    }
    assert.ok(statSync(join(paths.public, f.webm.src)).size <= TETO, `${id}: WebM acima de 350 KB`);
    assert.ok(statSync(join(paths.public, f.mp4.src)).size <= TETO, `${id}: MP4 acima de 350 KB`);
    assert.ok(statSync(join(paths.public, f.poster.avif.src)).size <= 120 * 1000, `${id}: poster AVIF acima de 120 KB`);
  }
});

test('filme de planta só para planta validada, com as cotas literais de data/plantas', { skip: !temManifesto }, () => {
  for (const [sha1, f] of Object.entries(m.planta)) {
    const d = lerJSON(join(paths.data, 'plantas', `${sha1}.json`));
    assert.equal(d.validada, true, `${sha1}: planta não validada ganhou filme`);
    assert.deepEqual(f.cotas.map((c) => c.letra), d.posicoes.letras, `${sha1}: letras diferentes das validadas`);
    for (const c of f.cotas) {
      const orig = d.cotas.find((k) => k.letra === c.letra);
      assert.equal(c.valor_texto, orig.valor_texto, `${sha1}: cota ${c.letra} diferente da planta`);
      assert.ok(f.aria_label.includes(`${c.letra} ${c.valor_texto} m`), `${sha1}: aria-label sem a cota ${c.letra}`);
    }
    assert.equal(f.fonte, d.fonte);
    assert.equal(f.pdf_path, d.pdf_path);
  }
});

test('todo tamanho com planta aparece em por_produto; sem filme fica registrado', { skip: !temManifesto }, () => {
  const produtos = lerJSON(join(paths.data, 'produtos.json'));
  const semFilme = new Set(m.sem_filme.tamanhos.map((t) => `${t.slug}|${t.rotulo}`));
  for (const p of produtos) {
    for (const t of p.d_planta || []) {
      const e = (m.por_produto[p.slug] || []).find((x) => x.rotulo === t.rotulo);
      assert.ok(e, `${p.slug} ${t.rotulo}: fora do manifesto`);
      if (e.filme) {
        assert.ok(m.planta[t.sha1], `${p.slug} ${t.rotulo}: aponta para filme inexistente`);
        assert.equal(e.sha1, t.sha1);
      } else {
        assert.ok(semFilme.has(`${p.slug}|${t.rotulo}`), `${p.slug} ${t.rotulo}: sem filme e sem registro do motivo`);
      }
    }
  }
});

test('filmes de coleção: etiqueta com nome e contagem reais, só fotos de fundo azul', { skip: !temManifesto }, () => {
  const cats = new Map(lerJSON(join(paths.data, 'categorias.json')).map((c) => [c.path, c]));
  const fotos = lerJSON(join(paths.public, 'media', 'p', 'manifest.json')).produtos;
  for (const f of Object.values(m.colecao)) {
    const c = cats.get(f.path);
    assert.equal(f.colecao, c.nome);
    assert.equal(f.total_exibido, c.total_exibido);
    assert.ok(f.fotos.length >= 1 && f.fotos.length <= 6);
    for (const ft of f.fotos) {
      assert.ok(c.produtos.includes(ft.slug), `${f.id}: foto de produto fora da coleção`);
      const orig = (fotos[ft.slug] || []).find((x) => x.sha1 === ft.sha1);
      assert.ok(orig, `${f.id}: foto não está na galeria publicada`);
      assert.equal(orig.fundo_vermelho, false, `${f.id}: foto de fundo vermelho`);
    }
  }
});

test('720p, sem áudio, 5 a 8 s (ffprobe)', { skip: (!temManifesto && 'sem filmes') || (!temFfprobe && 'ffprobe ausente') }, () => {
  for (const [, id, f] of todos()) {
    for (const arq of [f.webm.src, f.mp4.src]) {
      const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(paths.public, arq)]).toString());
      const v = out.streams.filter((s) => s.codec_type === 'video');
      assert.equal(out.streams.filter((s) => s.codec_type === 'audio').length, 0, `${id}: ${arq} tem áudio`);
      assert.equal(v.length, 1);
      assert.equal(v[0].height, 720, `${id}: ${arq} não é 720p`);
      const dur = Number(out.format.duration);
      assert.ok(dur >= 5 && dur <= 8.1, `${id}: duração ${dur}`);
    }
  }
});
