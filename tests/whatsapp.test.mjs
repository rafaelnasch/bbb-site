// WhatsApp é o checkout (SPEC 10 e 13.3): números só de contatos.json ativos e lista negra.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTA_NEGRA, numerosProibidosEm, estaNaListaNegra, waLink, mensagemCompra, digitos } from '../build/lib/wa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const RECON = join(ROOT, '_recon');
const temRecon = existsSync(join(RECON, 'whatsapp.json'));
const semRecon = temRecon ? false : '_recon/ ausente (CI)';
const contatos = JSON.parse(readFileSync(join(DATA, 'contatos.json'), 'utf8'));
const porPapel = new Map(contatos.contatos.map((c) => [c.papel, c]));

const LISTA_NEGRA_SPEC = ['5535997392842', '5535991480035', '5535991240879', '5535991847189', '553599123084', '5535992194395'];
const CONSULTORES_SPEC = ['5535991097528', '5535999834686', '5535992218069', '5535991480073', '5535992575221', '5535991480136', '5535991480210', '5535991240893'];

describe('contatos.json', () => {
  test('papéis e números da SPEC 10.1', () => {
    assert.equal(porPapel.get('venda_principal').numero, '5535992194882');
    assert.equal(porPapel.get('ajuda').numero, '5535992192256');
    assert.equal(porPapel.get('rastreio').numero, '5535992699530');
    assert.equal(porPapel.get('sac').numero, '5535991820062');
    assert.deepEqual(CONSULTORES_SPEC.map((_, i) => porPapel.get(`consultor_${i + 1}`).numero), CONSULTORES_SPEC);
  });

  test('aberturas literais das mensagens', () => {
    assert.equal(porPapel.get('venda_principal').prefilled_text, 'Olá! Tenho interesse em adquirir uma banheira de hidromassagem!');
    assert.equal(porPapel.get('ajuda').prefilled_text, 'Olá, estava navegando no site Banheiras Bom Banho e preciso de ajuda!');
    assert.equal(porPapel.get('sac').prefilled_text, '');
  });

  test('lojas sem texto pré-preenchido, inclusive a Loja 1 que usa o número de ajuda (SPEC 10.1)', () => {
    const lojas = contatos.contatos.filter((c) => c.papel.startsWith('loja_'));
    for (const c of lojas) assert.equal(c.prefilled_text, '', c.papel);
    assert.equal(porPapel.get('loja_congonhal').numero, porPapel.get('ajuda').numero);
    assert.notEqual(porPapel.get('ajuda').prefilled_text, '');
  });

  test('só ativos; os dois números de 8 dígitos das lojas ficam sem link', () => {
    for (const c of contatos.contatos) {
      if (c.link_ativo) assert.equal(c.status, 'ativo', c.papel);
      else assert.equal(c.link_destino_papel, 'ajuda', c.papel);
    }
    const semLink = contatos.contatos.filter((c) => !c.link_ativo).map((c) => c.numero).sort();
    assert.deepEqual(semLink, ['553592220037', '556299404921']);
    assert.equal(contatos.contatos.filter((c) => c.papel.startsWith('loja_')).length, 9);
  });

  test('todo número com status ativo em whatsapp.json tem papel, com o texto literal', { skip: semRecon }, () => {
    const w = JSON.parse(readFileSync(join(RECON, 'whatsapp.json'), 'utf8'));
    for (const n of w.numbers.filter((x) => x.status === 'ativo')) {
      const c = contatos.contatos.find((x) => x.numero === n.phone);
      assert.ok(c, n.phone);
      assert.equal(c.prefilled_text, n.prefilled_text);
      assert.equal(c.display, n.display);
    }
    for (const c of contatos.contatos) {
      const n = w.numbers.find((x) => x.phone === c.numero);
      assert.ok(['ativo', 'ativo_formato_suspeito'].includes(n.status), c.numero);
    }
  });
});

describe('lista negra', () => {
  test('contém a lista da SPEC e todo número não ativo e só-GTM do whatsapp.json', { skip: semRecon }, () => {
    for (const n of LISTA_NEGRA_SPEC) assert.ok(LISTA_NEGRA.includes(n), n);
    const w = JSON.parse(readFileSync(join(RECON, 'whatsapp.json'), 'utf8'));
    for (const n of w.numbers.filter((x) => !['ativo', 'ativo_formato_suspeito'].includes(x.status))) assert.ok(estaNaListaNegra(n.phone), n.phone);
    for (const n of w.gtm_only_numbers.phones) assert.ok(estaNaListaNegra(n), n);
  });

  test('o SAC ativo não cai na lista negra (a regex da SPEC casaria 5535991820062)', () => {
    assert.ok(/^55359918200\d\d$/.test('5535991820062'), 'premissa: a regex literal da SPEC casa o SAC');
    assert.equal(estaNaListaNegra('5535991820062'), false);
    for (const c of contatos.contatos) assert.equal(estaNaListaNegra(c.numero), false, c.numero);
  });

  test('detecta número proibido cru, com DDI e formatado', () => {
    assert.deepEqual(numerosProibidosEm('https://wa.me/5535997392842?text=x'), ['5535997392842']);
    assert.deepEqual(numerosProibidosEm('ligue (35) 99739-2842'), ['5535997392842']);
    assert.deepEqual(numerosProibidosEm('+55 35 99219-4888'), ['5535992194888']);
    assert.deepEqual(numerosProibidosEm('SAC (35) 99182-0062 e vendas 35 99219-4882'), []);
  });

  test('nenhum arquivo de data/ carrega número da lista negra', () => {
    const arquivos = [];
    const andar = (d) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) andar(p);
        else if (/\.(json|csv)$/.test(f)) arquivos.push(p);
      }
    };
    andar(DATA);
    assert.ok(arquivos.length >= 10);
    for (const f of arquivos) assert.deepEqual(numerosProibidosEm(readFileSync(f, 'utf8')), [], f);
  });

  test('dist/, se existir, não carrega número da lista negra', { skip: existsSync(join(ROOT, 'dist')) ? false : 'dist/ ainda não gerado' }, () => {
    const andar = (d) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) andar(p);
        else if (/\.(html|json|txt|xml|js|csv|webmanifest)$/.test(f)) assert.deepEqual(numerosProibidosEm(readFileSync(p, 'utf8')), [], p);
      }
    };
    andar(join(ROOT, 'dist'));
  });
});

describe('links e mensagens', () => {
  test('waLink aceita só número ativo e linkável', () => {
    assert.equal(waLink('5535991820062', '', contatos), 'https://wa.me/5535991820062');
    assert.throws(() => waLink('5535997392842', 'oi', contatos), /lista negra/);
    assert.throws(() => waLink('553592220037', '', contatos), /ativo e linkável/);
    assert.throws(() => waLink('5511999999999', '', contatos), /ativo e linkável/);
  });

  test('mensagem de compra: abertura literal, rótulo literal do tamanho, linhas vazias omitidas', () => {
    const msg = mensagemCompra({
      abertura: porPapel.get('venda_principal').prefilled_text,
      nome: 'Spa Quadrado Napole COMPLETO com hidro',
      sku: 'X1',
      tamanho: '1,97 x 1,97 x 0,86',
      voltagem: '220V',
      cor: null,
      adicionais: [],
      dataColeta: '18/10/2026',
      somaFormatada: 'R$ 1.000,00',
      url: 'https://rafaelnasch.github.io/bbb-site/x.html',
    });
    assert.equal(msg, [
      'Olá! Tenho interesse em adquirir uma banheira de hidromassagem!',
      '',
      'Modelo: Spa Quadrado Napole COMPLETO com hidro (SKU X1)',
      'Tamanho: 1,97 x 1,97 x 0,86',
      'Voltagem: 220V',
      'Valor pelos preços do site em 18/10/2026: R$ 1.000,00',
      'https://rafaelnasch.github.io/bbb-site/x.html',
    ].join('\n'));
    const link = waLink(porPapel.get('venda_principal').numero, msg, contatos);
    assert.equal(decodeURIComponent(link.split('?text=')[1]), msg);
  });

  test('sem soma calculável, a linha de valor some', () => {
    const msg = mensagemCompra({ abertura: 'A', nome: 'N', sku: null, url: 'u' });
    assert.equal(msg, 'A\n\nModelo: N\nu');
  });

  test('digitos() normaliza formatos de exibição', () => {
    assert.equal(digitos('(35) 9 9219-2256'), '35992192256');
  });
});
