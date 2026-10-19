// Testes do bloco de dados (SPEC 3, 13.1 no nível dos dados, 15).
// Os que comparam com _recon/ só rodam no Mac (o _recon não é versionado nem vai ao CI).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { termosSaude, TERMOS_PROIBIDOS_LITERAIS } from '../build/lib/texto.mjs';
import { parseRotuloTamanho } from '../build/lib/medidas.mjs';
import { somaReais } from '../build/lib/money.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const RECON = join(ROOT, '_recon');
const temRecon = existsSync(join(RECON, 'catalog.json'));
const semRecon = temRecon ? false : '_recon/ ausente (CI): comparação com a fonte só roda no Mac';

const ler = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const produtos = ler('produtos.json');
const categorias = ler('categorias.json');
const familias = ler('familias.json');
const meta = ler('meta.json');
const empresa = ler('empresa.json');
const lojas = ler('lojas.json');
const faq = ler('faq.json');
const politicas = ler('politicas.json');
const log = ler('editorial-log.json');
const exibidos = ler('exibidos.map.json');
const porSlug = new Map(produtos.map((p) => [p.slug, p]));
const catalog = temRecon ? JSON.parse(readFileSync(join(RECON, 'catalog.json'), 'utf8')) : null;

const LITERAIS = [
  'slug', 'url', 'nome', 'sku', 'disponibilidade', 'preco', 'especificacoes', 'itens_de_serie',
  'descricao_texto', 'descricao_curta_texto', 'opcoes_personalizaveis', 'plantas_pdf',
  'categorias', 'produtos_relacionados', 'avaliacoes', 'alertas_da_fonte', 'meta', 'em_sitemap', 'fonte',
];
const EXCLUIDOS = [
  'raw_html', 'descricao_html', 'descricao_curta_html', 'trechos_ocultos_no_site',
  'linhas_nao_item_na_descricao_curta', 'imagens_sitemap', 'midia_de_outro_produto', 'ld_json',
];
// Campos que podem chegar ao HTML como texto: precisam estar limpos.
const EXIBIVEIS = ['d_itens_de_serie_exibidos', 'd_descricao_exibida', 'd_descricao_curta_exibida', 'd_resumo'];

describe('produtos.json: diferença zero contra catalog.json', () => {
  test('292 registros, slugs e caminhos únicos', () => {
    assert.equal(produtos.length, 292);
    assert.equal(new Set(produtos.map((p) => p.slug)).size, 292);
    assert.equal(new Set(produtos.map((p) => p.d_path)).size, 292);
    for (const p of produtos) assert.ok(p.d_path.endsWith('.html'), p.slug);
  });

  test('campos literais idênticos à fonte (galeria sem o placeholder do tema)', { skip: semRecon }, () => {
    const fonte = new Map(catalog.products.map((p) => [p.slug, p]));
    assert.equal(fonte.size, produtos.length);
    for (const p of produtos) {
      const f = fonte.get(p.slug);
      assert.ok(f, `produto sem origem: ${p.slug}`);
      for (const k of LITERAIS) assert.deepEqual(p[k], f[k], `${p.slug}.${k} difere da fonte`);
      assert.deepEqual(p.galeria, f.galeria.filter((g) => g.placeholder_do_tema === false), `${p.slug}.galeria`);
      assert.equal(p.coletado_em, catalog.generated_at_source.coletado_em);
    }
  });

  test('nenhum campo excluído pela SPEC 3.1 no JSON gerado', () => {
    for (const p of produtos) for (const k of EXCLUIDOS) assert.ok(!(k in p), `${p.slug} carrega ${k}`);
  });

  test('todo produto tem fonte e coletado_em', () => {
    for (const p of produtos) {
      assert.match(p.fonte, /^https:\/\/www\.banheirasbombanho\.com\.br\//);
      assert.ok(p.coletado_em);
    }
  });

  test('d_path é o caminho atual decodificado (acento e espaços preservados)', () => {
    assert.ok(produtos.some((p) => p.d_path === 'aquecedor-digital-com-sensor-de-níve-bbb.html'));
    for (const p of produtos) assert.equal(p.d_path, decodeURIComponent(new URL(p.url.replace(/ /g, '%20')).pathname).slice(1));
  });
});

describe('derivados d_', () => {
  test('d_tipo: contagem bate com as coleções raiz', () => {
    const conta = (t) => produtos.filter((p) => p.d_tipo === t).length;
    const total = (path) => categorias.find((c) => c.d_path === path).total_exibido;
    assert.equal(conta('banheira'), total('banheiras.html'));
    assert.equal(conta('spa'), total('spas.html'));
    assert.equal(conta('sauna'), total('sauna.html'));
    // Spa Serena aparece em Spas e Ofurôs: d_tipo segue o nome literal e o conflito fica registrado.
    const serena = porSlug.get('spa-quadrado-serena-completo-com-hidro-em-acrilico');
    assert.equal(serena.d_tipo, 'spa');
    assert.deepEqual(serena.d_tipo_conflito, ['ofuro', 'spa']);
    assert.equal(conta('ofuro') + 1, total('ofuros.html'));
    assert.equal(porSlug.get('air-blower-borbulhamento').d_tipo, 'acessorio');
    assert.equal(porSlug.get('pre-filtro-para-banheira-spa-e-ofuro').d_tipo, 'acessorio');
  });

  test('d_tamanhos reproduz o rótulo literal da opção e os números do próprio rótulo', () => {
    for (const p of produtos) {
      const op = p.opcoes_personalizaveis.find((o) => /^tamanho:?$/i.test(String(o.titulo).trim()));
      if (!op) continue;
      assert.deepEqual(p.d_tamanhos.map((t) => t.rotulo), op.valores.map((v) => v.rotulo_exibido), p.slug);
      for (const t of p.d_tamanhos) {
        const r = parseRotuloTamanho(t.rotulo);
        assert.equal(t.a, r.a);
        assert.equal(t.b, r.b);
        assert.equal(t.c, r.c);
        const v = op.valores.find((x) => x.value_id === t.value_id);
        assert.equal(t.preco_adicional, v.preco_adicional);
      }
    }
  });

  test('token ilegível ("051", "89") não vira número', () => {
    const lyon = porSlug.get('banheira-dupla-lyon-completa-com-hidro');
    const t = lyon.d_tamanhos.find((x) => x.rotulo === '1,43 x 1,96 x 051');
    assert.equal(t.c, null);
    assert.equal(t.formato_irregular, true);
  });

  test('Acqua Línea Acrílico: 5 tamanhos e 0,79 x 1,60 sem planta publicada', () => {
    const p = porSlug.get('banheira-acqua-linea-completa-com-hidro-em-acrilico');
    assert.equal(p.d_tamanhos.length, 5);
    const sem = p.d_planta.find((x) => x.rotulo === '0,79 x 1,60 x 0,37');
    assert.equal(sem.pdf_path, null);
    const com = p.d_planta.find((x) => x.rotulo === '0,79 x 1,41 x 0,37');
    assert.equal(com.pdf_path, 'plantas/banheiras/Acqua linea - 0,79 x 1,41 x 0,37 [GC-AC].pdf');
    assert.match(com.sha1, /^[0-9a-f]{40}$/);
  });

  test('planta casada pelo nome do PDF: medidas iguais ou truncadas em 2 casas', () => {
    for (const p of produtos) {
      for (const x of p.d_planta) {
        if (!x.pdf_path) continue;
        const t = p.d_tamanhos.find((y) => (y.rotulo ?? y.rotulo_ficha) === x.rotulo);
        const nums = (x.nome_arquivo.match(/\d+,\d+/g) || []).map((s) => Number(s.replace(',', '.')));
        for (const m of [t.a, t.b, t.c].filter((n) => n != null)) {
          assert.ok(nums.some((n) => Math.abs(n - m) < 0.0005 || Math.abs(Math.floor(n * 100 + 1e-6) / 100 - m) < 0.0005), `${p.slug}: ${x.rotulo} x ${x.nome_arquivo}`);
        }
      }
    }
  });

  test('d_planta vazio quando a página não publica planta (Spa Serena)', () => {
    const s = porSlug.get('spa-quadrado-serena-completo-com-hidro-em-acrilico');
    assert.deepEqual(s.d_planta, []);
    assert.deepEqual(s.galeria, []);
    assert.equal(s.d_sem_foto, true);
    for (const p of produtos) if (p.plantas_pdf.length === 0) assert.deepEqual(p.d_planta, [], p.slug);
  });

  test('d_medida_confirmada=false exatamente nos 12 com alerta ficha_x_opcao_tamanho', () => {
    const com = produtos.filter((p) => p.alertas_da_fonte.some((a) => a.tipo === 'ficha_x_opcao_tamanho')).map((p) => p.slug).sort();
    const falsos = produtos.filter((p) => p.d_medida_confirmada === false).map((p) => p.slug).sort();
    assert.equal(com.length, 12);
    assert.deepEqual(falsos, com);
    for (const p of produtos.filter((x) => !x.d_medida_confirmada)) {
      for (const t of p.d_tamanhos) {
        assert.ok(t.ficha, `${p.slug} sem a medida da ficha ao lado`);
        if (t.encaixe) {
          assert.ok(t.encaixe.maior >= Math.max(t.a, t.b) - 1e-9);
          assert.ok(t.encaixe.menor >= Math.min(t.a, t.b) - 1e-9);
        }
      }
    }
  });

  test('d_preco_min e d_preco_max = finalPrice + menor e maior adicional de tamanho', () => {
    for (const p of produtos) {
      const fp = p.preco.valores_numericos.finalPrice;
      const ad = p.d_tamanhos.filter((t) => t.origem === 'opcao').map((t) => t.preco_adicional ?? 0);
      assert.equal(p.d_preco_min, somaReais(fp, ad.length ? Math.min(...ad) : 0), p.slug);
      assert.equal(p.d_preco_max, somaReais(fp, ad.length ? Math.max(...ad) : 0), p.slug);
      assert.ok(p.d_preco_min <= p.d_preco_max);
    }
  });

  test('d_hidro, d_aquecedor e d_lugares_num seguem a regra', () => {
    for (const p of produtos) {
      const esperado = /com hidro/i.test(p.nome) || p.itens_de_serie.some((i) => /motobomba/i.test(i));
      assert.equal(p.d_hidro, esperado, p.slug);
      const aq = p.opcoes_personalizaveis.flatMap((o) => o.valores).find((v) => /aquecedor/i.test(v.rotulo_exibido));
      assert.equal(p.d_aquecedor, aq ? aq.preco_adicional : null, p.slug);
      if (/^individual$/i.test(p.especificacoes.Lugares)) assert.equal(p.d_lugares_num, 1);
    }
  });

  test('saunas: medida da ficha com a altura, para a vista frontal', () => {
    for (const p of produtos.filter((x) => x.d_tipo === 'sauna')) {
      assert.equal(p.d_tamanhos.length, 1);
      assert.ok(p.d_tamanhos[0].altura > 0);
    }
  });

  test('esgotados: Air Blower e Pré-filtro', () => {
    assert.equal(porSlug.get('air-blower-borbulhamento').disponibilidade, 'Esgotado');
    assert.equal(porSlug.get('pre-filtro-para-banheira-spa-e-ofuro').disponibilidade, 'Esgotado');
  });
});

describe('filtro editorial e texto oculto (SPEC 0.3, 0.4, 0.5)', () => {
  test('nenhum campo exibível carrega termo proibido, "(VERIFICAR)" ou texto oculto', () => {
    for (const p of produtos) {
      for (const k of EXIBIVEIS) {
        const v = Array.isArray(p[k]) ? p[k].join('\n') : String(p[k] ?? '');
        assert.deepEqual(termosSaude(v), [], `${p.slug}.${k}: termo de saúde`);
        for (const t of TERMOS_PROIBIDOS_LITERAIS) assert.ok(!v.toLowerCase().includes(t.toLowerCase()), `${p.slug}.${k}: ${t}`);
      }
    }
  });

  test('"Couro Sintético (VERIFICAR)" omitido nos dois apoios de cabeça e registrado no log', () => {
    for (const s of ['apoio-de-cabeca-oval', 'apoio-de-cabeca-retangular']) {
      const p = porSlug.get(s);
      assert.ok(p.itens_de_serie.includes('Couro Sintético (VERIFICAR)'), 'o literal continua no dado');
      assert.ok(!p.d_itens_de_serie_exibidos.some((i) => i.includes('Couro Sintético')));
      assert.ok(log.itens.some((l) => l.slug === s && l.regra === 'anotacao_interna_VERIFICAR'));
    }
  });

  test('tudo que saiu da exibição está no editorial-log com o texto original', () => {
    for (const p of produtos) {
      const sairam = p.itens_de_serie.filter((i) => !p.d_itens_de_serie_exibidos.includes(i));
      for (const i of sairam) assert.ok(log.itens.some((l) => l.slug === p.slug && l.removido === i), `${p.slug}: ${i}`);
    }
    assert.equal(log.total, log.itens.length);
  });

  test('"BANHEIRA COLORIDA" e as linhas que não são item ficam fora de data/', () => {
    for (const f of ['produtos.json', 'categorias.json', 'empresa.json', 'faq.json', 'politicas.json', 'lojas.json', 'contatos.json']) {
      assert.ok(!readFileSync(join(DATA, f), 'utf8').includes('BANHEIRA COLORIDA'), f);
    }
  });

  test('linhas_nao_item_na_descricao_curta não chegam à descrição curta exibida', { skip: semRecon }, () => {
    for (const f of catalog.products) {
      const p = porSlug.get(f.slug);
      for (const l of f.linhas_nao_item_na_descricao_curta) {
        assert.ok(!p.d_descricao_curta_exibida.split('\n').some((x) => x.replace(/^\s*-\s*/, '').trim() === l.texto.trim()), `${f.slug}: ${l.texto}`);
      }
    }
  });

  test('conflito nome x ficha: registrado e omitido do resumo, nunca escolhido', () => {
    const serena = porSlug.get('spa-quadrado-serena-completo-com-hidro-em-acrilico');
    assert.deepEqual(serena.d_conflito_nome_ficha, [{ campo: 'Configuracao', nome_diz: 'Completa', ficha_diz: 'Básica' }]);
    assert.ok(!/configuração/i.test(serena.d_resumo));
    const spaco = porSlug.get('banheira-acqua-spaco-completa-com-hidro-em-acrilico');
    assert.equal(spaco.d_conflito_nome_ficha[0].campo, 'Material');
    assert.ok(!/em (gel coat|acrílico)/.test(spaco.d_resumo.split(' é ')[1]));
  });

  test('d_resumo segue o modelo fixo e a data da coleta', () => {
    const p = porSlug.get('banheira-acqua-linea-completa-com-hidro-em-acrilico');
    assert.match(p.d_resumo, /^A Banheira Acqua Línea COMPLETA com hidro em Acrílico é uma banheira retangular, individual, em acrílico, configuração completa, vendida em 5 tamanhos \(/);
    assert.ok(p.d_resumo.includes(`Preço publicado em ${meta.data_coleta}: a partir de R$5.401,18.`));
    for (const x of produtos) assert.ok(!/undefined|null|NaN/.test(x.d_resumo), x.slug);
  });
});

describe('famílias (SPEC 3.2)', () => {
  const csv = readFileSync(join(DATA, 'familias.csv'), 'utf8').trim().split('\n');

  test('familias.csv cobre os 292 produtos e está revisado', () => {
    assert.equal(csv[0], 'slug,familia_sugerida,familia_final,revisado,nota');
    assert.equal(csv.length - 1, 292);
    for (const l of csv.slice(1)) assert.ok(/,(sim),/.test(l), `linha não revisada: ${l.slice(0, 80)}`);
  });

  test('versões irmãs diferem só em material e configuração', () => {
    for (const f of Object.values(familias)) {
      const ps = f.membros.map((m) => porSlug.get(m.slug));
      assert.ok(ps.length >= 2, f.familia);
      assert.equal(new Set(ps.map((p) => p.d_tipo)).size, 1, `${f.familia}: tipo`);
      assert.equal(new Set(ps.map((p) => p.especificacoes.Forma)).size, 1, `${f.familia}: forma`);
      assert.equal(new Set(ps.map((p) => p.especificacoes.Lugares)).size, 1, `${f.familia}: lugares`);
      const pares = ps.map((p) => `${p.especificacoes.Material}|${p.especificacoes.Configuracao}`);
      assert.equal(new Set(pares).size, pares.length, `${f.familia}: material e configuração repetidos`);
      for (const p of ps) assert.equal(p.d_familia, f.familia);
    }
  });

  test('as 5 versões -1 não agrupam e d_familia só existe para linha revisada', () => {
    const sufixo = produtos.filter((p) => /-1$/.test(p.slug));
    assert.equal(sufixo.length, 5);
    for (const p of sufixo) assert.equal(p.d_familia, null);
    const finais = new Map(csv.slice(1).map((l) => l.split(',')).map(([s, , fin]) => [s, fin]));
    for (const p of produtos) assert.equal(p.d_familia, finais.get(p.slug) || null, p.slug);
  });
});

describe('categorias.json', () => {
  test('60 coleções com o mesmo path, total e ordem do catálogo', { skip: semRecon }, () => {
    assert.equal(categorias.length, 60);
    const urlSlug = new Map();
    for (const p of catalog.products) { urlSlug.set(p.url, p.slug); urlSlug.set(p.final_url, p.slug); }
    catalog.categories.forEach((c, i) => {
      const n = categorias[i];
      assert.equal(n.path, c.path);
      assert.equal(n.total_exibido, c.total_exibido);
      assert.deepEqual(n.produtos, c.produtos.map((x) => urlSlug.get(x.url)), c.path);
      assert.deepEqual(n.meta, c.meta);
    });
  });

  test('toda coleção lista produtos existentes; total exibido igual ao listado', () => {
    for (const c of categorias) {
      for (const s of c.produtos) assert.ok(porSlug.has(s), `${c.path}: ${s}`);
      assert.equal(c.produtos.length, c.total_exibido, c.path);
    }
  });

  test('divergências do filtro implícito ficam listadas, nunca escondidas', () => {
    for (const c of categorias) {
      if (!c.filtro_implicito) continue;
      assert.equal(c.d_filtro_implicito_confere, c.d_filtro_implicito_divergentes.length === 0, c.path);
    }
  });
});

describe('empresa, lojas, FAQ e políticas', () => {
  test('DATA_COLETA vem do catálogo e é 18/10/2026 no fuso de Brasília', () => {
    assert.equal(meta.data_coleta, '18/10/2026');
    if (temRecon) assert.equal(meta.coletado_em, catalog.generated_at_source.coletado_em);
  });

  test('fábrica sem CEP; sem e-mail e telefone de marketing', () => {
    assert.ok(!/CEP|\d{5}-\d{3}/.test(empresa.endereco_fabrica));
    for (const v of empresa.endereco_fabrica_versoes_sem_cep) assert.ok(!/CEP|\d{5}-\d{3}/.test(v.texto));
    assert.ok(!/CEP|\d{5}-\d{3}/.test(lojas[0].endereco_exibido));
    assert.ok(!empresa.emails.some((e) => /marketing/i.test(e.email)));
    assert.deepEqual(empresa.emails.map((e) => e.email).sort(), ['comercial@banheirasbombanho.com.br', 'contatolgpd@banheirasbombanho.com.br', 'sac@banheirasbombanho.com.br']);
    assert.ok(!JSON.stringify(empresa).includes('99219-4888'));
  });

  test('4 CNPJs do rodapé com razão social literal; INMETRO; Reclame Aqui com período e data', () => {
    assert.equal(empresa.cnpjs_rodape.length, 4);
    for (const c of empresa.cnpjs_rodape) assert.match(c.cnpj, /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    assert.equal(empresa.inmetro.certificado, 'CE-EL-041/20-F01');
    assert.equal(empresa.iso_9001.publicar, false);
    assert.ok(empresa.reclame_aqui.periodo && empresa.reclame_aqui.consultado_em);
    assert.equal(empresa.depoimentos.length, 2);
  });

  test('9 lojas; Taubaté e Goiânia sem link próprio; Caraguatatuba com busca pelo endereço', () => {
    assert.equal(lojas.length, 9);
    const por = new Map(lojas.map((l) => [l.ancora, l]));
    for (const a of ['taubate', 'goiania']) {
      assert.equal(por.get(a).link_ativo, false);
      assert.equal(por.get(a).botao_papel, 'ajuda');
    }
    const cara = por.get('caraguatatuba');
    assert.equal(cara.mapa_derivado_do_endereco, true);
    assert.equal(cara.mapa, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cara.endereco_literal)}`);
    assert.equal(lojas.filter((l) => l.mapa_derivado_do_endereco).length, 1);
  });

  test('FAQ: 46 itens, garantia oculta, tipos e temas válidos', () => {
    assert.equal(faq.length, 46);
    const temas = new Set(['Escolher', 'Materiais', 'Itens e opcionais', 'Pagamento', 'Entrega', 'Instalação', 'Cuidados', 'Pós-venda']);
    for (const f of faq) {
      assert.ok(temas.has(f.tema), f.id);
      assert.ok(['publicada', 'redigida_resposta_literal'].includes(f.tipo));
      assert.ok(f.fonte);
      if (/garantia/i.test(f.pergunta)) assert.equal(f.oculto_ate_decisao, true, f.pergunta);
    }
    assert.equal(faq.filter((f) => f.oculto_ate_decisao).length, 2);
    assert.equal(faq.filter((f) => f.tipo === 'publicada').length, 20);
  });

  test('FAQ: respostas literais da fonte', { skip: semRecon }, () => {
    const src = JSON.parse(readFileSync(join(RECON, 'faq-source.json'), 'utf8')).faq;
    src.forEach((s, i) => {
      assert.equal(faq[i].pergunta, s.pergunta);
      assert.equal(faq[i].resposta, s.resposta_literal);
    });
  });

  test('políticas: garantia sem prazo publicado; tabela de prazo com 2 grupos de 4 linhas', () => {
    assert.equal(politicas.garantia.publicar, false);
    assert.equal(politicas.prazo_de_entrega.tabela.length, 2);
    for (const g of politicas.prazo_de_entrega.tabela) assert.equal(g.linhas.length, 4);
    assert.match(politicas.desistencia.literal, /7 \(sete\) dias/);
    assert.equal(politicas.manual.paginas.length, politicas.manual.paginas_total);
  });

  test('exibidos.map.json: toda chave aponta para data/ e para a origem', () => {
    const chaves = Object.entries(exibidos.campos);
    assert.ok(chaves.length >= 30);
    for (const [k, v] of chaves) {
      assert.ok(v.data && v.origem, k);
      assert.match(k, /^[a-z0-9-]+$/);
    }
  });
});
