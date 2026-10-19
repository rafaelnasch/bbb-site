// _recon/ -> data/*.json (SPEC 3). Campos literais são copiados sem alteração; campos
// derivados levam o prefixo d_. Cada registro carrega `fonte` e `coletado_em`.
// Nada aqui cria dado da empresa: tudo é lido de _recon/ ou calculado a partir dele.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { paths } from '../site.config.mjs';
import { filtrarFrasesEditorial, filtrarFrasesEditorialMultilinha, detectoresEditoriais, violacaoEditorial, termosSaude, termosSaudeBrutos, termosSaudeSpec, EXCECOES_NAO_SAUDE, TERMOS_SAUDE_IMPLICITA, slugify, semAcento } from './lib/texto.mjs';

// Qual lista pegou o trecho: a fechada da SPEC 0.5 ou a ampliada por decisão do dono (texto.mjs).
const listaSaude = (termos) => (termosSaudeSpec(termos.join(' ')).length ? 'spec_0.5' : 'ampliada_dono');
import { somaReais } from './lib/money.mjs';
import { parseRotuloTamanho, valorUnicoFicha, numerosNoNome, mesmasMedidas } from './lib/medidas.mjs';

const R = paths.recon;
const D = paths.data;

if (!existsSync(join(R, 'catalog.json'))) {
  console.error('normalize: _recon/catalog.json não encontrado. O normalize roda só no Mac com o _recon local.');
  process.exit(1);
}
mkdirSync(join(D, 'plantas'), { recursive: true });

const ler = (f) => JSON.parse(readFileSync(join(R, f), 'utf8'));
const catalog = ler('catalog.json');
const whatsapp = ler('whatsapp.json');
const inst = ler('institucional.json');
const faqSrc = ler('faq-source.json');
const blog = ler('blog.json');
const manifest = ler('images-manifest.json');

const SITE_ATUAL = catalog.generated_at_source.site;
const COLETADO_EM = catalog.generated_at_source.coletado_em;

// Data da coleta no fuso de Brasília (a coleta UTC de 02:07 do dia 19 é noite do dia 18 no Brasil).
const DATA_COLETA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(COLETADO_EM));

const editorialLog = [];
const avisos = [];

// Detectores editoriais únicos para todo texto exibível (SPEC 0.5 e 15): saúde (lista da SPEC e
// lista ampliada), superlativo não comprovado, ISO 9001 sem número, autodeclarações da empresa
// (institucional.json:empresa.claims_autodeclarados) e termos proibidos literais.
const CLAIMS = inst.empresa.claims_autodeclarados.map((c) => c.literal);
const DETECTORES = detectoresEditoriais({ claims: CLAIMS });
// Números da empresa só aparecem pelo campo numeros_declarados, com "segundo a empresa".
const reNumeroEmpresa = /(?<![\p{L}\p{N}])(?:mais de|\+ ?de|\+)\s*[\d.]+\s*(?:\+\s*)?(?:anos|modelos|cores|colaboradores|representantes|mil|m2|banheiras)/u;
const DETECTOR_NUMERO_EMPRESA = {
  regra: 'numero_da_empresa_sem_segundo_a_empresa',
  fn: (f) => {
    const m = semAcento(f).toLowerCase().replace(/\s+/g, ' ').match(reNumeroEmpresa);
    return m ? [m[0]] : [];
  },
};
const DETECTOR_GARANTIA = {
  regra: 'garantia',
  fn: (f) => (/garantia/i.test(f) ? ['garantia'] : []),
};
const DETECTORES_INSTITUCIONAL = [...DETECTORES, DETECTOR_GARANTIA, DETECTOR_NUMERO_EMPRESA];
// Entrada de log com a regra que pegou a frase (e a lista, quando é saúde).
const comRegra = (base, v) => ({ ...base, regra: v.regra, termos: v.termos, ...(v.regra === 'termo_de_saude' ? { lista: listaSaude(v.termos) } : {}) });

function gravar(nome, obj) {
  writeFileSync(join(D, nome), `${JSON.stringify(obj, null, 2)}\n`);
}

function pathDoSite(url) {
  // Caminho atual decodificado, sem a barra inicial (ex.: "aquecedor-digital-com-sensor-de-níve-bbb.html").
  const u = new URL(url.replace(/ /g, '%20'));
  return decodeURIComponent(u.pathname).replace(/^\/+/, '');
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

const LITERAIS = [
  'slug', 'url', 'nome', 'sku', 'disponibilidade', 'preco', 'especificacoes', 'itens_de_serie',
  'descricao_texto', 'descricao_curta_texto', 'opcoes_personalizaveis', 'galeria', 'plantas_pdf',
  'categorias', 'produtos_relacionados', 'avaliacoes', 'alertas_da_fonte', 'meta', 'em_sitemap', 'fonte',
];
const EXCLUIDOS = [
  'raw_html', 'descricao_html', 'descricao_curta_html', 'trechos_ocultos_no_site',
  'linhas_nao_item_na_descricao_curta', 'imagens_sitemap', 'midia_de_outro_produto', 'ld_json',
];

const RAIZES = {
  '/banheiras.html': 'banheira',
  '/spas.html': 'spa',
  '/ofuros.html': 'ofuro',
  '/sauna.html': 'sauna',
  '/acessorios.html': 'acessorio',
};
const NOME_TIPO = { banheira: /^banheira/i, spa: /^spa/i, ofuro: /^ofur/i, sauna: /^sauna/i, acessorio: /.*/ };

function tipoDoProduto(p) {
  const raizes = new Set();
  for (const c of p.categorias) {
    const t = RAIZES[new URL(c.url).pathname];
    if (t) raizes.add(t);
  }
  if (raizes.size === 0) return { tipo: 'acessorio', conflito: null };
  if (raizes.size === 1) return { tipo: [...raizes][0], conflito: null };
  // Produto listado em duas coleções raiz: vale a que abre o nome literal do produto.
  const lista = [...raizes].sort();
  const peloNome = lista.find((t) => t !== 'acessorio' && NOME_TIPO[t].test(p.nome.trim()));
  return { tipo: peloNome || null, conflito: lista };
}

const reTamanho = /^tamanho:?$/i;

// Manifesto de downloads: url da planta -> sha1 e arquivo local.
const plantaPorUrl = new Map();
for (const a of manifest.arquivos) {
  if (a.tipo === 'planta_pdf') plantaPorUrl.set(a.url_original, a);
}

function plantaJsonExistente(sha1) {
  const f = join(D, 'plantas', `${sha1}.json`);
  if (!sha1 || !existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function infoPdf(item) {
  const reg = plantaPorUrl.get(item.url);
  const pathSite = pathDoSite(item.url);
  const pastaOk = /^plantas\/(banheiras|spas)\//i.test(pathSite);
  const pj = plantaJsonExistente(reg?.sha1);
  return {
    url_fonte: item.url,
    pdf_path: pastaOk ? pathSite.replace(/^plantas\/(banheiras|spas)\//i, (m, g) => `plantas/${g.toLowerCase()}/`) : pathSite,
    nome_arquivo: basename(pathSite),
    sha1: reg?.sha1 ?? null,
    arquivo_recon: reg?.arquivo ?? null,
    baixado: Boolean(reg?.arquivo),
    medidas_no_nome: numerosNoNome(basename(pathSite)),
    cotas_validadas: pj?.validada === true,
  };
}

function fichaDims(e) {
  return {
    Comprimento: e.Comprimento ?? null,
    Largura: e.Largura ?? null,
    Profundidade: e.Profundidade ?? null,
    num: {
      Comprimento: valorUnicoFicha(e.Comprimento),
      Largura: valorUnicoFicha(e.Largura),
      Profundidade: valorUnicoFicha(e.Profundidade),
    },
  };
}

function tamanhosDoProduto(p, tipo, medidaConfirmada) {
  const op = p.opcoes_personalizaveis.find((o) => reTamanho.test(String(o.titulo).trim()));
  const ficha = fichaDims(p.especificacoes);
  if (op) {
    const out = op.valores.map((v) => {
      // Rótulo exibido é o literal; quando ele carrega "+ R$..." o número sai do mesmo texto antes do "+".
      const parsed = parseRotuloTamanho(v.rotulo_exibido);
      const t = {
        rotulo: v.rotulo_exibido,
        a: parsed.a,
        b: parsed.b,
        // Rótulo fora do formato "a x b x c": a profundidade não é lida (seria escolher uma leitura
        // do separador ou do espaço); a da ficha fica ao lado quando existir.
        c: parsed.formato_irregular ? null : parsed.c,
        value_id: v.value_id,
        preco_adicional: v.preco_adicional,
        origem: 'opcao',
      };
      if (parsed.formato_irregular) {
        t.formato_irregular = true;
        if (p.especificacoes.Profundidade != null) t.profundidade_ficha = p.especificacoes.Profundidade;
        editorialLog.push({ slug: p.slug, campo: 'd_tamanhos[].c', regra: 'profundidade_nao_lida_formato_irregular', rotulo: v.rotulo_exibido, ...(parsed.c != null ? { leitura_descartada: parsed.c } : {}), profundidade_ficha: p.especificacoes.Profundidade ?? null });
      }
      if (parsed.leituras.length && !parsed.formato_irregular) {
        t.leituras = parsed.leituras;
        for (const l of parsed.leituras) {
          editorialLog.push({ slug: p.slug, campo: 'd_tamanhos[].c', regra: l.regra, rotulo: v.rotulo_exibido, token: l.token, lido: l.lido });
        }
      }
      if (!medidaConfirmada) {
        t.ficha = ficha;
        // Encaixe pela maior das duas medidas (SPEC 9.4), dimensão a dimensão depois de ordenar.
        const op2 = [t.a, t.b].filter((n) => n != null).sort((x, y) => x - y);
        const fi2 = [ficha.num.Comprimento, ficha.num.Largura].filter((n) => n != null).sort((x, y) => x - y);
        if (op2.length === 2 && fi2.length === 2) {
          t.encaixe = { menor: Math.max(op2[0], fi2[0]), maior: Math.max(op2[1], fi2[1]) };
        }
      }
      return t;
    });
    return { tamanhos: out, op };
  }
  // Sem opção de tamanho: um item a partir da ficha quando cada dimensão tem um único valor numérico.
  const { Comprimento: C, Largura: L, Profundidade: P } = ficha.num;
  if (C != null && L != null && P != null) {
    return {
      tamanhos: [{
        rotulo: null,
        rotulo_ficha: `${p.especificacoes.Comprimento} x ${p.especificacoes.Largura} x ${p.especificacoes.Profundidade}`,
        a: C, b: L, c: P, value_id: null, preco_adicional: 0, origem: 'ficha',
      }],
      op: null,
    };
  }
  // Saunas: a ficha publica Largura, Profundidade e Altura (sem Comprimento).
  const A = valorUnicoFicha(p.especificacoes.Altura);
  if (tipo === 'sauna' && L != null && P != null && A != null) {
    return {
      tamanhos: [{
        rotulo: null,
        rotulo_ficha: `${p.especificacoes.Largura} x ${p.especificacoes.Profundidade} x ${p.especificacoes.Altura}`,
        a: L, b: P, c: null, altura: A, value_id: null, preco_adicional: 0, origem: 'ficha',
        eixos: { a: 'Largura', b: 'Profundidade', altura: 'Altura' },
      }],
      op: null,
    };
  }
  return { tamanhos: [], op: null };
}

function plantasPorTamanho(p, tamanhos) {
  // A página linka a planta de outro modelo (Spa Serena -> Imola): nenhuma planta é anexada (SPEC 3.1).
  if (p.alertas_da_fonte.some((a) => a.tipo === 'planta_de_outro_produto')) return { porTamanho: [], sobras: [] };
  // Sem PDF publicado: uma entrada por tamanho com pdf_path null (SPEC 3.1), mesmo formato dos demais.
  const pdfs = p.plantas_pdf.map(infoPdf);
  const usados = new Set();
  const porTamanho = tamanhos.map((t) => {
    const medidas = [t.a, t.b, t.c].filter((n) => n != null);
    let candidatos = pdfs.filter((f) => mesmasMedidas(f.medidas_no_nome, medidas));
    // Mais de um PDF da mesma medida: fica o que tem a marca do material do produto no nome
    // ([GC], [AC] ou [GC-AC]). Se ainda sobrar mais de um, nenhum é escolhido.
    if (candidatos.length > 1) {
      const mat = p.especificacoes.Material;
      const marca = mat === 'Acrílico' ? /\[(GC-)?AC\]/i : mat === 'Gel Coat' ? /\[GC(-AC)?\]/i : null;
      const filtrados = marca ? candidatos.filter((f) => marca.test(f.nome_arquivo)) : [];
      if (filtrados.length === 1) candidatos = filtrados;
    }
    const achado = candidatos.length === 1 ? candidatos[0] : null;
    for (const c of candidatos) usados.add(c.pdf_path);
    const reg = {
      rotulo: t.rotulo ?? t.rotulo_ficha ?? null,
      pdf_path: achado?.pdf_path ?? null,
      sha1: achado?.sha1 ?? null,
      cotas_validadas: achado?.cotas_validadas ?? false,
      ...(achado ? { url_fonte: achado.url_fonte, nome_arquivo: achado.nome_arquivo, baixado: achado.baixado } : {}),
    };
    if (candidatos.length > 1) {
      reg.pdf_ambiguo = candidatos.map((c) => c.pdf_path);
      avisos.push(`${p.slug}: ${candidatos.length} PDFs para o tamanho ${reg.rotulo}; nenhum escolhido`);
    }
    if (achado && t.c == null && medidas.length === 2) reg.casado_sem_profundidade = true;
    return reg;
  });
  const sobras = pdfs.filter((f) => !usados.has(f.pdf_path));
  return { porTamanho, sobras, todas: pdfs };
}

function lugaresNum(l, conflitos = []) {
  if (l == null) return null;
  if (conflitos.some((c) => c.campo === 'Lugares')) return null; // nome e ficha divergem: não escolhe
  if (/^individual$/i.test(String(l).trim())) return 1;
  const m = String(l).match(/^\s*(\d+)\b/);
  return m ? Number(m[1]) : null;
}

const ARTIGO = { banheira: ['A', 'uma banheira'], sauna: ['A', 'uma sauna'], spa: ['O', 'um spa'], ofuro: ['O', 'um ofurô'], acessorio: ['O', 'um acessório'] };

// Nome x ficha: quando o nome literal diz o material, a configuração, a forma ou os lugares e a
// ficha diz outro, é conflito da fonte (SPEC 0.3). O resumo omite o campo, d_lugares_num fica null
// e a ficha mostra os dois com nota. Nunca se escolhe um lado.
const FORMA_NO_NOME = [
  [/\bredond[ao]s?\b/, 'Redonda'],
  [/\bquadrad[ao]s?\b/, 'Quadrada'],
  [/\bretangular(es)?\b/, 'Retangular'],
  [/\bde canto\b/, 'De Canto'],
  [/\bova(l|is)\b/, 'Oval'],
];
function conflitosNomeFicha(p, tipo) {
  const n = semAcento(p.nome).toLowerCase();
  const e = p.especificacoes;
  const out = [];
  // Acessório: "completo" no nome ("Kit filtragem completo") não fala de configuração e a ficha
  // herda lugares do cadastro; ali só material e forma do nome contam.
  const acessorio = tipo === 'acessorio';
  const nomeMat = /acrilico/.test(n) ? 'Acrílico' : /gel coat/.test(n) ? 'Gel Coat' : null;
  const nomeCfg = /\bcomplet[ao]\b/.test(n) ? 'Completa' : /\bbasic[ao]\b/.test(n) ? 'Básica' : null;
  if (nomeMat && e.Material && nomeMat !== e.Material) out.push({ campo: 'Material', nome_diz: nomeMat, ficha_diz: e.Material });
  if (!acessorio && nomeCfg && e.Configuracao && nomeCfg !== e.Configuracao) out.push({ campo: 'Configuracao', nome_diz: nomeCfg, ficha_diz: e.Configuracao });
  const formasNome = FORMA_NO_NOME.filter(([re]) => re.test(n)).map(([, f]) => f);
  if (formasNome.length && e.Forma && !formasNome.includes(e.Forma)) {
    out.push({ campo: 'Forma', nome_diz: formasNome.join(' / '), ficha_diz: e.Forma });
  }
  if (e.Lugares && !acessorio) {
    const fichaInd = /^individual$/i.test(String(e.Lugares).trim());
    const fichaNum = (String(e.Lugares).match(/^\s*(\d+)\b/) || [])[1];
    if (/\bdupl[ao]s?\b/.test(n) && (fichaInd || (fichaNum && Number(fichaNum) !== 2))) {
      out.push({ campo: 'Lugares', nome_diz: 'Duplo/Dupla', ficha_diz: e.Lugares });
    } else if (/\bindividua(l|is)\b/.test(n) && !fichaInd) {
      out.push({ campo: 'Lugares', nome_diz: 'Individual', ficha_diz: e.Lugares });
    }
  }
  return out;
}

// Concordância do adjetivo literal da ficha com o gênero do tipo (spa, ofurô e acessório são masculinos).
function formaConcordada(forma, art) {
  const f = forma.toLowerCase();
  if (art !== 'O') return f;
  return f.replace(/^redonda$/, 'redondo').replace(/^quadrada$/, 'quadrado');
}

function resumo(p, tipo, tamanhos, itensExibidos, conflitos, medidaConfirmada) {
  // Modelo fixo (SPEC 11.4). Campo ausente ou em conflito: o trecho correspondente é omitido.
  const e = p.especificacoes;
  const emConflito = new Set(conflitos.map((c) => c.campo));
  const [art, tipoTxt] = ARTIGO[tipo] || ['', null];
  const partes = [];
  const qual = [];
  if (tipo === 'acessorio') {
    // Acessórios herdam forma, lugares e configuração padrão do cadastro: não descrevem a peça.
    qual.push(tipoTxt);
    if (e.Material && !emConflito.has('Material')) qual.push(`em ${e.Material.toLowerCase()}`);
  } else {
    if (tipoTxt) qual.push(`${tipoTxt}${e.Forma && !emConflito.has('Forma') ? ` ${formaConcordada(e.Forma, art)}` : ''}`);
    if (e.Lugares && !emConflito.has('Lugares')) qual.push(/^individual$/i.test(e.Lugares) ? 'individual' : `para ${e.Lugares.toLowerCase()}`);
    if (e.Material && !emConflito.has('Material')) qual.push(`em ${e.Material.toLowerCase()}`);
    if (e.Configuracao && !emConflito.has('Configuracao')) qual.push(`configuração ${e.Configuracao.toLowerCase()}`);
  }
  // Acessório: o artigo seguiria o tipo (masculino) e não o nome ("O Tampa de inspeção"); a forma
  // neutra é "Nome: acessório, ...", sem artigo.
  let frase1;
  let gen = art === 'A' ? 'a' : 'o';
  if (tipo === 'acessorio') {
    frase1 = `${p.nome.trim()}: ${qual.map((q, i) => (i === 0 ? q.replace(/^um /, '') : q)).join(' ')}`;
    gen = 'o';
  } else {
    frase1 = `${art} ${p.nome.trim()}`;
    if (qual.length) frase1 += ` é ${qual.join(', ')}`;
  }
  const rotulos = tamanhos.map((t) => t.rotulo).filter(Boolean);
  if (rotulos.length) {
    const n = `${rotulos.length} ${rotulos.length === 1 ? 'tamanho' : 'tamanhos'}`;
    // Opção de tamanho e ficha divergem (alerta ficha_x_opcao_tamanho, SPEC 0.3 e 15): o resumo
    // não adota nenhuma das duas medidas; a ficha mostra as duas com nota.
    frase1 += medidaConfirmada
      ? `, vendid${gen} em ${n} (${rotulos.join('; ')})`
      : `, vendid${gen} em ${n}, com medida a confirmar (a opção de tamanho e a ficha técnica publicadas divergem)`;
  }
  partes.push(`${frase1}.`);
  // Ponto e vírgula entre os itens: alguns itens literais já têm vírgula no texto.
  const tres = itensExibidos.slice(0, 3).map((i) => i.replace(/[.;]\s*$/, ''));
  if (tres.length) partes.push(`Itens de série incluem ${tres.join('; ')}.`);
  if (p.preco?.por) partes.push(`Preço publicado em ${DATA_COLETA}: a partir de ${p.preco.por}.`);
  return partes.join(' ');
}

// Meta title e description atuais (SPEC 11.1) passam pelos mesmos detectores do texto exibido, mais
// a afirmação de INMETRO (o selo é de um certificado, não de toda a linha; "a única com selo" etc.).
// Campo com qualquer corte fica null em d_meta_exibida: o render gera o texto a partir dos campos
// reais, pelo mesmo caminho das coleções sem description. O literal continua em `meta`.
const DETECTORES_META = [...DETECTORES, { regra: 'afirmacao_inmetro_em_meta', fn: (f) => (/inmetro/i.test(f) ? ['INMETRO'] : []) }];
function metaExibida(meta, base) {
  const saida = { title: meta?.title ?? null, description: meta?.description ?? null };
  const cortes = [];
  for (const campo of ['title', 'description']) {
    const valor = saida[campo];
    if (valor == null || !String(valor).trim()) { saida[campo] = null; continue; }
    const r = filtrarFrasesEditorialMultilinha(valor, DETECTORES_META);
    if (r.removidos.length) {
      for (const x of r.removidos) {
        cortes.push({ campo, regra: x.regra, termos: x.termos });
        editorialLog.push(comRegra({ ...base, campo: `meta.${campo}`, removido: x.frase, decisao: 'campo inteiro fora; texto gerado de campos reais no lugar' }, x));
      }
      saida[campo] = null;
    }
  }
  return { d_meta_exibida: saida, d_meta_exibivel: cortes.length === 0, ...(cortes.length ? { d_meta_cortes: cortes } : {}) };
}

function filtroEditorialProduto(p) {
  const itens = [];
  for (const item of p.itens_de_serie) {
    if (item.includes('(VERIFICAR)')) {
      editorialLog.push({ slug: p.slug, campo: 'itens_de_serie', regra: 'anotacao_interna_VERIFICAR', removido: item });
      continue;
    }
    const v = violacaoEditorial(item, DETECTORES);
    if (v) {
      editorialLog.push(comRegra({ slug: p.slug, campo: 'itens_de_serie', removido: item }, v));
      continue;
    }
    itens.push(item);
  }
  // Descrição longa: a linha com "(VERIFICAR)" sai inteira; o título de uma palavra logo acima
  // dela (ex.: "Material") sai junto, para não ficar um título sem conteúdo.
  const longa = String(p.descricao_texto ?? '').split('\n');
  const longaOk = [];
  for (const linha of longa) {
    if (linha.includes('(VERIFICAR)')) {
      editorialLog.push({ slug: p.slug, campo: 'descricao_texto', regra: 'anotacao_interna_VERIFICAR', removido: linha });
      const anterior = longaOk.at(-1);
      if (anterior !== undefined && /^\p{L}+$/u.test(anterior.trim())) {
        longaOk.pop();
        editorialLog.push({ slug: p.slug, campo: 'descricao_texto', regra: 'titulo_sem_conteudo_apos_VERIFICAR', removido: anterior });
      }
      continue;
    }
    longaOk.push(linha);
  }
  const desc = filtrarFrasesEditorial(p.descricao_texto == null ? null : longaOk.join('\n'), DETECTORES);
  for (const r of desc.removidos) {
    editorialLog.push(comRegra({ slug: p.slug, campo: 'descricao_texto', removido: r.frase }, r));
  }
  // Título de uma palavra (ex.: "Função") cujo conteúdo saiu inteiro pelo filtro de saúde: sai
  // junto, para não ficar um título solto antes do separador ">" ou do próximo título.
  if (desc.texto != null && desc.removidos.length) {
    const linhas = desc.texto.split('\n');
    const orig = longaOk;
    const ficam = [];
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i].trim();
      const prox = (linhas[i + 1] ?? '').trim();
      const ehTitulo = /^\p{L}+$/u.test(l);
      const proxFecha = prox === '' || prox === '>' || /^\p{L}+$/u.test(prox);
      const iOrig = orig.findIndex((x) => x.trim() === l);
      const tinhaConteudo = iOrig >= 0 && orig[iOrig + 1] != null && orig[iOrig + 1].trim() !== prox;
      if (ehTitulo && proxFecha && tinhaConteudo) {
        editorialLog.push({ slug: p.slug, campo: 'descricao_texto', regra: 'titulo_sem_conteudo_apos_corte', removido: linhas[i] });
        continue;
      }
      ficam.push(linhas[i]);
    }
    desc.texto = ficam.join('\n');
  }
  // Descrição curta: tira as linhas que não são publicadas (SPEC 0.4), o "(VERIFICAR)" e frases de saúde.
  const naoItem = new Set((p.linhas_nao_item_na_descricao_curta || []).map((l) => l.texto.trim()));
  const curtaLinhas = String(p.descricao_curta_texto ?? '').split('\n').filter((linha) => {
    const limpa = linha.replace(/^\s*-\s*/, '').trim();
    if (naoItem.has(limpa)) return false;
    if (linha.includes('(VERIFICAR)')) {
      editorialLog.push({ slug: p.slug, campo: 'descricao_curta_texto', regra: 'anotacao_interna_VERIFICAR', removido: linha });
      return false;
    }
    return true;
  });
  const curta = filtrarFrasesEditorial(curtaLinhas.join('\n'), DETECTORES);
  for (const r of curta.removidos) {
    editorialLog.push(comRegra({ slug: p.slug, campo: 'descricao_curta_texto', removido: r.frase }, r));
  }
  return { itens, descricao: desc.texto, curta: curta.texto };
}

const produtos = [];
for (const p of catalog.products) {
  const out = {};
  for (const k of LITERAIS) {
    if (!(k in p)) throw new Error(`Produto ${p.slug} sem o campo ${k}`);
    out[k] = k === 'galeria' ? p.galeria.filter((g) => g.placeholder_do_tema === false) : p[k];
  }
  out.coletado_em = COLETADO_EM;

  const { tipo, conflito } = tipoDoProduto(p);
  const alertaMedida = p.alertas_da_fonte.some((a) => a.tipo === 'ficha_x_opcao_tamanho');
  const { tamanhos } = tamanhosDoProduto(p, tipo, !alertaMedida);
  const plantas = plantasPorTamanho(p, tamanhos);
  const ed = filtroEditorialProduto(p);

  // Valores de opção cujo rótulo cita aquecedor E mostra um valor em R$. "Comprar aquecedor ou
  // acionador" (R$ 0, sem valor no rótulo) é um convite, não um preço: fica registrado à parte em
  // d_aquecedor_outras_opcoes e não gera conflito. Mais de um preço distinto (ex.: Madrid com
  // + R$1.180,00 e + R$990,00) é conflito da fonte: d_aquecedor fica null e os valores vão juntos.
  const opcoesAquecedor = p.opcoes_personalizaveis
    .flatMap((o) => o.valores.map((v) => ({ titulo: o.titulo, rotulo: v.rotulo_exibido, preco_adicional: v.preco_adicional, value_id: v.value_id })))
    .filter((x) => /aquecedor/i.test(x.rotulo));
  const comValor = (x) => /R\$\s*\d/.test(x.rotulo);
  const aquecedores = opcoesAquecedor.filter(comValor);
  const aquecedoresSemValor = opcoesAquecedor.filter((x) => !comValor(x));
  const precosAquecedor = [...new Set(aquecedores.map((x) => x.preco_adicional))];

  const lados = tamanhos.flatMap((t) => [t.a, t.b]).filter((n) => n != null);
  const adicionaisTam = tamanhos.filter((t) => t.origem === 'opcao').map((t) => t.preco_adicional ?? 0);
  const fp = p.preco?.valores_numericos?.finalPrice ?? null;

  out.d_path = pathDoSite(p.url);
  out.d_tipo = tipo;
  if (conflito) {
    out.d_tipo_conflito = conflito;
    out.d_tipo_pendente = `Listado nas coleções raiz ${conflito.join(' e ')}; d_tipo = ${tipo} pelo início do nome literal. Confirmar com a empresa. As coleções continuam listando o produto na ordem literal.`;
    out.d_tipo_contagem = 'Contagem das portas de tipo usa categorias.json[raiz].total_exibido, não a contagem por d_tipo (este produto conta nas duas coleções raiz).';
    avisos.push(`${p.slug}: listado em duas coleções raiz (${conflito.join(', ')}); d_tipo = ${tipo} pelo nome literal`);
    editorialLog.push({ slug: p.slug, campo: 'd_tipo', regra: 'conflito_da_fonte', versoes: conflito.map((t) => ({ texto: t, fonte: `${t === 'ofuro' ? 'ofuros' : t === 'spa' ? 'spas' : t}.html (coleção raiz que lista o produto)` })), decisao: `d_tipo = ${tipo} só para rotular o produto, pelo início do nome literal; a contagem por tipo usa total_exibido das coleções raiz; confirmar com a empresa` });
  }
  out.d_tamanhos = tamanhos;
  out.d_medida_confirmada = !alertaMedida;
  out.d_hidro = /com hidro/i.test(p.nome) || p.itens_de_serie.some((i) => /motobomba/i.test(i));
  out.d_aquecedor = precosAquecedor.length === 1 ? precosAquecedor[0] : null;
  out.d_aquecedor_rotulo = precosAquecedor.length === 1 ? aquecedores[0].rotulo : null;
  if (aquecedoresSemValor.length) out.d_aquecedor_outras_opcoes = aquecedoresSemValor;
  if (precosAquecedor.length > 1) {
    out.d_aquecedor_conflito = true;
    out.d_aquecedor_opcoes = aquecedores;
    avisos.push(`${p.slug}: ${aquecedores.length} opções com "aquecedor" e preços distintos (${precosAquecedor.join(', ')}); d_aquecedor = null, nenhum escolhido`);
  }
  out.d_familia = null; // preenchido depois, a partir de data/familias.csv revisado
  out.d_planta = plantas.porTamanho;
  if (plantas.sobras?.length) {
    out.d_plantas_sem_tamanho = plantas.sobras.map((f) => ({ pdf_path: f.pdf_path, sha1: f.sha1, nome_arquivo: f.nome_arquivo }));
  }
  out.d_conflito_nome_ficha = conflitosNomeFicha(p, tipo);
  out.d_lugares_num = lugaresNum(p.especificacoes.Lugares, out.d_conflito_nome_ficha);
  out.d_maior = lados.length ? Math.max(...lados) : null;
  out.d_menor = lados.length ? Math.min(...lados) : null;
  out.d_preco_min = fp == null ? null : somaReais(fp, adicionaisTam.length ? Math.min(...adicionaisTam) : 0);
  out.d_preco_max = fp == null ? null : somaReais(fp, adicionaisTam.length ? Math.max(...adicionaisTam) : 0);
  out.d_itens_de_serie_exibidos = ed.itens;
  out.d_descricao_exibida = ed.descricao;
  out.d_descricao_curta_exibida = ed.curta;
  out.d_resumo = resumo(p, tipo, tamanhos, ed.itens, out.d_conflito_nome_ficha, !alertaMedida);
  Object.assign(out, metaExibida(p.meta, { slug: p.slug }));
  out.d_sem_foto = out.galeria.length === 0;
  out.d_versao_sufixo_1 = /-1$/.test(p.slug);
  out.d_categorias_paths = p.categorias.map((c) => pathDoSite(c.url));
  produtos.push(out);
}

// ---------------------------------------------------------------------------
// Famílias (SPEC 3.2)
// ---------------------------------------------------------------------------

const REMOVER = [
  'completa', 'completo', 'basica', 'basico', 'com hidro', 'em acrilico', 'em gel coat',
];
const FORMAS_E_TIPOS = [
  'banheira', 'banheiras', 'spa', 'spas', 'ofuro', 'ofuros', 'sauna',
  'retangular', 'redonda', 'redondo', 'quadrada', 'quadrado', 'de canto',
];

function chaveFamilia(nome) {
  let s = ` ${semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const r of [...REMOVER, ...FORMAS_E_TIPOS]) s = s.replace(new RegExp(` ${r} `, 'g'), ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function lerCsv(f) {
  if (!existsSync(f)) return [];
  const [cab, ...linhas] = readFileSync(f, 'utf8').trim().split('\n');
  const cols = cab.split(',');
  return linhas.map((l) => {
    const v = parseCsvLinha(l);
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
  });
}
function parseCsvLinha(l) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) {
      if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const csvCampo = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

const csvPath = join(D, 'familias.csv');
const revisadas = new Map(lerCsv(csvPath).filter((r) => r.revisado === 'sim').map((r) => [r.slug, r]));

const grupos = new Map();
for (const p of produtos) {
  if (p.d_versao_sufixo_1 || !p.d_tipo) continue; // as 5 versões "-1" não agrupam (SPEC 3.2)
  const k = `${p.d_tipo}|${chaveFamilia(p.nome)}`;
  if (!grupos.has(k)) grupos.set(k, []);
  grupos.get(k).push(p.slug);
}
const sugestao = new Map();
for (const [k, slugs] of grupos) {
  if (slugs.length < 2) continue;
  const [tipo, resto] = k.split('|');
  for (const s of slugs) sugestao.set(s, slugify(`${tipo} ${resto}`));
}

// Medida em comum (SPEC 3.2: versões irmãs diferem só em material e configuração). Duas versões
// são a mesma peça quando têm um rótulo de tamanho idêntico (sem diferença de caixa e espaços) ou a
// mesma medida numérica nas 3 dimensões (em qualquer ordem). Sem isso, não agrupam.
const rotuloCanon = (r) => String(r ?? '').toLowerCase().replace(/\s+/g, '');
const tresDims = (t) => ([t.a, t.b, t.c].every((n) => n != null) ? [t.a, t.b, t.c].map((n) => n.toFixed(3)).sort().join('x') : null);
function mesmaMedida(p, q) {
  const rp = new Set(p.d_tamanhos.map((t) => rotuloCanon(t.rotulo ?? t.rotulo_ficha)).filter(Boolean));
  if (q.d_tamanhos.some((t) => rp.has(rotuloCanon(t.rotulo ?? t.rotulo_ficha)))) return true;
  const np = new Set(p.d_tamanhos.map(tresDims).filter(Boolean));
  return q.d_tamanhos.some((t) => np.has(tresDims(t)));
}

const familiaFinal = new Map(); // slug -> { familia, nota }
for (const p of produtos) {
  const rev = revisadas.get(p.slug);
  familiaFinal.set(p.slug, { familia: rev ? rev.familia_final || '' : '', nota: rev?.nota ?? '' });
}
const porFamilia = new Map();
for (const p of produtos) {
  const f = familiaFinal.get(p.slug).familia;
  if (!f) continue;
  if (!porFamilia.has(f)) porFamilia.set(f, []);
  porFamilia.get(f).push(p);
}
for (const [fam, membros] of porFamilia) {
  // Componentes ligados pela relação "mesma medida"; cada componente só fica se todos os pares baterem.
  const resto = [...membros];
  const comps = [];
  while (resto.length) {
    const comp = [resto.shift()];
    for (let i = 0; i < comp.length; i++) {
      for (let j = resto.length - 1; j >= 0; j--) if (mesmaMedida(comp[i], resto[j])) comp.push(...resto.splice(j, 1));
    }
    comps.push(comp);
  }
  if (comps.length === 1 && comps[0].length === membros.length) {
    const pares = membros.every((a) => membros.every((b) => a === b || mesmaMedida(a, b)));
    if (pares) continue;
  }
  const validos = comps.filter((c) => c.length >= 2 && c.every((a) => c.every((b) => a === b || mesmaMedida(a, b))));
  for (const c of comps) {
    const ok = validos.includes(c);
    const rot = c[0].d_tamanhos[0] ? (c[0].d_tamanhos[0].rotulo ?? c[0].d_tamanhos[0].rotulo_ficha) : '';
    const nova = ok ? (validos.length === 1 ? fam : `${fam}-${slugify(rot)}`) : '';
    for (const p of c) {
      const nota = ok
        ? `família ${fam} separada por medida: este grupo tem ${rot}`
        : `fora da família ${fam}: nenhuma medida em comum com as outras versões`;
      familiaFinal.set(p.slug, { familia: nova, nota });
      avisos.push(`familias: ${p.slug} ${ok ? `-> ${nova}` : 'sem família'} (medida diferente das versões de ${fam})`);
    }
  }
}

const linhasCsv = ['slug,familia_sugerida,familia_final,revisado,nota'];
for (const p of produtos) {
  const rev = revisadas.get(p.slug);
  const sug = sugestao.get(p.slug) ?? '';
  if (rev) {
    if (rev.familia_sugerida !== sug) avisos.push(`familias.csv: sugestão mudou para ${p.slug} (${rev.familia_sugerida} -> ${sug}); revisão mantida, conferir`);
    const fin = familiaFinal.get(p.slug);
    linhasCsv.push([p.slug, sug, fin.familia, 'sim', fin.nota].map(csvCampo).join(','));
    p.d_familia = fin.familia || null;
  } else {
    linhasCsv.push([p.slug, sug, '', 'nao', ''].map(csvCampo).join(','));
    p.d_familia = null; // linha não revisada não agrupa
  }
}
writeFileSync(csvPath, `${linhasCsv.join('\n')}\n`);

const familias = {};
for (const p of produtos) {
  if (!p.d_familia) continue;
  if (!familias[p.d_familia]) familias[p.d_familia] = { familia: p.d_familia, tipo: p.d_tipo, membros: [] };
  familias[p.d_familia].membros.push({
    slug: p.slug,
    nome: p.nome,
    Material: p.especificacoes.Material ?? null,
    Configuracao: p.especificacoes.Configuracao ?? null,
    preco_por: p.preco.por,
    finalPrice: p.preco.valores_numericos.finalPrice,
  });
}
for (const f of Object.values(familias)) {
  const varia = [];
  if (new Set(f.membros.map((m) => m.Material)).size > 1) varia.push('Material');
  if (new Set(f.membros.map((m) => m.Configuracao)).size > 1) varia.push('Configuracao');
  f.variam_por = varia;
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

const prodPorUrl = new Map();
for (const p of catalog.products) {
  prodPorUrl.set(p.url, p.slug);
  prodPorUrl.set(p.final_url, p.slug);
}
const prodPorSlug = new Map(produtos.map((p) => [p.slug, p]));

const FORMA_POR_TOKEN = [
  [/(^|\/)(banheiras?-)?retangular(es)?(\.html|$)/, 'Retangular'],
  [/(^|\/)(banheiras?-)?(redond[ao]s?)(\.html|$)/, 'Redonda'],
  [/(^|\/)(banheiras?-)?quadrad[ao]s?(\.html|$)/, 'Quadrada'],
  [/(^|\/)(banheiras?-)?de-canto(\.html|$)/, 'De Canto'],
];

function filtroImplicito(path, tipoRaiz) {
  const f = {};
  if (tipoRaiz) f.tipo = tipoRaiz;
  for (const [re, forma] of FORMA_POR_TOKEN) if (re.test(path)) f.forma = forma;
  let m = path.match(/(\d+)-a-(\d+)-lugares/);
  if (m) f.lugares = { min: Number(m[1]), max: Number(m[2]) };
  // Faixas de tamanho escritas no path: "de-141-a-160", "de-1-50-a-1-60", "de-1-00-a-1-40"
  m = path.match(/de-(\d)-?(\d{2})-a-(\d)-?(\d{2})/);
  if (m) f.faixa_m = { min: Number(`${m[1]}.${m[2]}`), max: Number(`${m[3]}.${m[4]}`) };
  return Object.keys(f).length ? f : null;
}

function confereFiltro(f, slugs) {
  if (!f) return null;
  return divergentesDoFiltro(f, slugs).length === 0;
}

function divergentesDoFiltro(f, slugs) {
  if (!f) return [];
  return slugs.filter((s) => !atendeFiltro(f, s));
}

function atendeFiltro(f, s) {
  const p = prodPorSlug.get(s);
  if (!p) return false;
  if (f.tipo && p.d_tipo !== f.tipo) return false;
  if (f.forma && p.especificacoes.Forma !== f.forma) return false;
  if (f.lugares && !(p.d_lugares_num >= f.lugares.min && p.d_lugares_num <= f.lugares.max)) return false;
  if (f.faixa_m) {
    const m = p.d_tamanhos.map((t) => Math.max(t.a ?? 0, t.b ?? 0));
    if (!m.some((x) => x >= f.faixa_m.min - 0.005 && x <= f.faixa_m.max + 0.005)) return false;
  }
  return true;
}

function descricaoCategoriaExibida(c, path) {
  const r = filtrarFrasesEditorialMultilinha(c.descricao_texto ?? null, DETECTORES);
  for (const x of r.removidos) {
    editorialLog.push(comRegra({ categoria: path, campo: 'descricao_texto', removido: x.frase }, x));
  }
  return r.texto;
}

const categorias = catalog.categories.map((c) => {
  const slugs = c.produtos.map((x) => {
    const s = prodPorUrl.get(x.url);
    if (!s) avisos.push(`categoria ${c.path}: produto listado sem registro (${x.url})`);
    return s ?? null;
  }).filter(Boolean);
  const path = decodeURIComponent(c.path).replace(/^\/+/, '');
  const raiz = '/' + path.split('/')[0].replace(/\.html$/, '') + '.html';
  const tipoRaiz = RAIZES[raiz] ?? null;
  const filtro = filtroImplicito(path, tipoRaiz);
  return {
    nome: c.nome,
    path: c.path,
    d_path: path,
    url: c.url,
    total_exibido: c.total_exibido,
    produtos: slugs,
    meta: c.meta,
    ...metaExibida(c.meta, { categoria: path }),
    descricao_texto: c.descricao_texto,
    // O que vai ao HTML: descricao_texto sem as frases com termo de saúde (SPEC 0.5; log editorial).
    d_descricao_exibida: descricaoCategoriaExibida(c, path),
    breadcrumbs: c.breadcrumbs,
    subcategorias_listadas: c.subcategorias_listadas,
    em_sitemap: c.em_sitemap,
    filtro_implicito: filtro,
    d_filtro_implicito_confere: confereFiltro(filtro, slugs),
    // Produtos que a própria listagem do site inclui sem atender o filtro do path (dado da fonte).
    d_filtro_implicito_divergentes: divergentesDoFiltro(filtro, slugs),
    fonte: c.url,
    coletado_em: COLETADO_EM,
  };
});

// ---------------------------------------------------------------------------
// Contatos (SPEC 3.3 e 10.1)
// ---------------------------------------------------------------------------

const numeros = new Map(whatsapp.numbers.map((n) => [n.phone, n]));
const contatos = [];
function addContato(papel, numero, extra = {}) {
  const n = numeros.get(numero);
  // Papel de loja: link sem texto pré-preenchido (whatsapp.json, contexto da loja; SPEC 10.1),
  // mesmo quando o número é o mesmo do papel de ajuda.
  const semTexto = papel.startsWith('loja_');
  if (!n) throw new Error(`contatos: número ${numero} (${papel}) não está em whatsapp.json`);
  if (!['ativo', 'ativo_formato_suspeito'].includes(n.status)) throw new Error(`contatos: ${numero} (${papel}) tem status ${n.status}`);
  contatos.push({
    papel,
    numero,
    display: n.display,
    prefilled_text: semTexto ? '' : n.prefilled_text,
    ...(semTexto && n.prefilled_text ? { prefilled_text_de_outro_contexto: 'o número também atende o papel de ajuda, que tem texto próprio' } : {}),
    status: n.status === 'ativo' ? 'ativo' : n.status,
    link_ativo: n.status === 'ativo',
    fonte: n.source_urls,
    coletado_em: whatsapp.captured_at,
    ...extra,
  });
}
const prim = inst.contatos.whatsapp_cabecalho_principal.link.match(/phone=(\d+)/)[1];
const ajuda = inst.contatos.whatsapp_cabecalho_ajuda.link.match(/phone=(\d+)/)[1];
addContato('venda_principal', prim);
addContato('ajuda', ajuda);
inst.contatos.vendas_rodape_whatsapp.numeros.forEach((n, i) => addContato(`consultor_${i + 1}`, n.wa, { ordem_rodape: i + 1 }));
addContato('rastreio', inst.contatos.rastreio_pedidos.whatsapp);
addContato('sac', inst.contatos.sac.whatsapp);

function cidadeDaLoja(loja) {
  // Cidade lida do endereço literal ("..., Taubaté - SP CEP ..."); a última ocorrência "Cidade - UF".
  const ms = [...loja.endereco_literal.matchAll(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]*?)\s*-\s*([A-Z]{2})\b/g)];
  const m = ms.at(-1);
  const cidade = m ? m[1].trim().split(/\s{1,}/).slice(-3).join(' ') : null;
  return { cidade, uf: m ? m[2] : null };
}

const lojas = inst.lojas_showrooms.lojas.map((l) => {
  const { cidade, uf } = cidadeDaLoja(l);
  return { ...l, _cidade: cidade, _uf: uf };
});
// A cidade pode vir com palavras do endereço ("Coutinhos, Congonhal"): usa o nome da loja para recortar.
for (const l of lojas) {
  const nomeLoja = semAcento(l.nome).toLowerCase();
  const palavras = String(l._cidade).split(' ');
  for (let i = 0; i < palavras.length; i++) {
    const cand = palavras.slice(i).join(' ');
    if (nomeLoja.includes(semAcento(cand).toLowerCase().slice(0, 5))) { l._cidade = cand; break; }
  }
  l._slug = slugify(l._cidade);
  addContato(`loja_${l._slug}`, l.whatsapp, { loja_n: l.n, ...(numeros.get(l.whatsapp).status !== 'ativo' ? { link_destino_papel: 'ajuda' } : {}) });
}

// Todo número "ativo" de whatsapp.json precisa ter papel.
for (const n of whatsapp.numbers) {
  if (n.status === 'ativo' && !contatos.some((c) => c.numero === n.phone)) {
    throw new Error(`contatos: número ativo sem papel: ${n.phone}`);
  }
}

// ---------------------------------------------------------------------------
// Lojas (SPEC 3.3, 9.6)
// ---------------------------------------------------------------------------

const lojasOut = lojas.map((l) => {
  const ehFabrica = l.n === 1;
  const mapaRepetido = lojas.some((o) => o.n !== l.n && o.mapa === l.mapa && o.n < l.n);
  const c = contatos.find((x) => x.papel === `loja_${l._slug}`);
  const reg = {
    n: l.n,
    nome: l.nome,
    cidade: l._cidade,
    uf: l._uf,
    ancora: l._slug,
    endereco_literal: l.endereco_literal,
    // Fábrica sem CEP (conflito 37584-000 x 37557-000, SPEC 15): a parte "CEP: ..." sai da exibição.
    endereco_exibido: ehFabrica ? l.endereco_literal.replace(/\.?\s*CEP:?\s*[\d.-]+\s*$/i, '').trim() : l.endereco_literal,
    atendimento_literal: l.atendimento,
    whatsapp: l.whatsapp,
    whatsapp_papel: c.papel,
    link_ativo: c.link_ativo,
    botao_papel: c.link_ativo ? c.papel : 'ajuda',
    mapa_literal: l.mapa,
    // Caraguatatuba: o link atual repete o de Taubaté; usa busca do Google Maps pelo endereço literal.
    mapa: mapaRepetido
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.endereco_literal)}`
      : l.mapa,
    mapa_derivado_do_endereco: mapaRepetido,
    fonte: inst.lojas_showrooms.source_url,
    coletado_em: inst._meta.coletado_em,
  };
  if (l.alerta) reg.alerta_fonte = l.alerta;
  if (ehFabrica) reg.cep_omitido = true;
  return reg;
});

// ---------------------------------------------------------------------------
// Empresa (SPEC 3.3)
// ---------------------------------------------------------------------------

const rodapeEnd = inst.empresa.endereco_fabrica[0];
const empresa = {
  nome: 'Banheiras Bom Banho',
  nome_fantasia_literal: inst.empresa.nome_fantasia.valor,
  alternate_name: (inst.empresa.nome_fantasia.valor.match(/\(([^)]+)\)/) || [])[1] ?? null,
  site_atual: SITE_ATUAL,
  endereco_fabrica: rodapeEnd.literal.replace(/^End\.:\s*/i, '').replace(/,?\s*CEP:?\s*[\d.-]+\s*$/i, '').trim(),
  endereco_fabrica_fonte: rodapeEnd.source_url,
  endereco_fabrica_versoes_sem_cep: inst.empresa.endereco_fabrica.map((e) => ({
    texto: e.literal.replace(/^End\.:\s*/i, '').replace(/[.,]?\s*CEP:?\s*[\d.-]+\s*$/i, '').trim(),
    fonte: e.source_url,
  })),
  cep_omitido: true,
  localizacao_texto: inst.empresa.localizacao_texto,
  mapa_fabrica: { link: inst.empresa.mapa_fabrica.link_curto, coordenadas_do_embed: inst.empresa.mapa_fabrica.coordenadas_do_embed, fonte: inst.empresa.mapa_fabrica.source_url },
  telefone_fixo: { display: inst.contatos.telefone_fabrica.literal, tel: inst.contatos.telefone_fabrica.tel, fonte: inst.contatos.telefone_fabrica.source_url },
  telefone_comercial: { display: inst.contatos.telefone_comercial.literal, whatsapp: inst.contatos.telefone_comercial.whatsapp, fonte: inst.contatos.telefone_comercial.source_url },
  // marketing@ e o telefone de marketing ficam fora até confirmação (SPEC 3.3 e 15).
  emails: inst.contatos.emails.filter((e) => !/^marketing@/i.test(e.valor)).map((e) => ({ email: e.valor, uso: e.uso, fonte: e.source_url })),
  horario: { literal: inst.contatos.horario_atendimento.literal, fonte: inst.contatos.horario_atendimento.source_url },
  // Os 4 CNPJs do rodapé global do site principal, com a razão social literal (o 5º é de site satélite).
  cnpjs_rodape: inst.empresa.razoes_sociais_e_cnpjs_visiveis
    .filter((x) => /rodapé global/.test(x.source_url))
    .map((x) => ({ literal: x.literal, cnpj: (x.literal.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || [])[0] ?? null, fonte: x.source_url })),
  numeros_declarados: [
    { literal: inst.empresa.numeros_institucionais.literal, fonte: inst.empresa.numeros_institucionais.source_url, exibir_como: 'segundo a empresa' },
    { literal: inst.empresa.numeros_corporativo.literal, fonte: inst.empresa.numeros_corporativo.source_url, exibir_como: 'segundo a empresa' },
  ],
  inmetro: {
    certificado: (inst.certificacoes.inmetro_pagina.literal.match(/CE-EL-\d+\/\d+-F\d+/) || [])[0] ?? null,
    pagina_literal: inst.certificacoes.inmetro_pagina.literal,
    rodape_literal: inst.certificacoes.inmetro_rodape.literal,
    link_consulta: inst.certificacoes.inmetro_pagina.link_consulta,
    fonte: inst.certificacoes.inmetro_pagina.source_url,
  },
  iso_9001: { publicar: false, motivo: inst.certificacoes.iso_9001_2015.alerta },
  reclame_aqui: {
    url: inst.prova_social.reclame_aqui.url,
    reputacao: inst.prova_social.reclame_aqui.pagina_visivel.reputacao,
    nota: inst.prova_social.reclame_aqui.pagina_visivel.nota,
    resolve: inst.prova_social.reclame_aqui.pagina_visivel.resolve,
    periodo: inst.prova_social.reclame_aqui.pagina_visivel.periodo,
    consultado_em: inst.prova_social.reclame_aqui.coletado_em,
    alerta_fonte: inst.prova_social.reclame_aqui.alerta,
  },
  depoimentos: inst.prova_social.depoimentos_no_site.map((d) => ({ autor: d.autor, texto: d.literal, fonte: d.source_url })),
  redes: inst.contatos.redes_sociais.map((r) => ({
    rede: r.rede,
    url: r.url,
    principal: !/antiga|alt\./i.test(r.rede),
  })),
  youtube: inst.suporte_pos_venda.tutoriais_video.canal,
  tutoriais_video: inst.suporte_pos_venda.tutoriais_video.videos,
  textos_integrais: inst.empresa.textos_integrais,
  galeria_fabrica_e_projetos: inst.galeria_fabrica_e_projetos,
  // Autodeclarações sem fonte externa (SPEC 0.5): não vão ao site como afirmação.
  claims_nao_publicar: inst.empresa.claims_autodeclarados.map((c) => c.literal),
  // A lista de conflitos cita números da lista negra e os dois CEPs: fica só no _recon (SPEC 15 trata cada um).
  conflitos_da_fonte_ref: '_recon/institucional.json#conflitos_e_alertas',
  fonte: SITE_ATUAL,
  coletado_em: inst._meta.coletado_em,
};
if (!empresa.inmetro.certificado) throw new Error('empresa: número do certificado INMETRO não encontrado no texto literal');

// Organismo certificador em duas versões na fonte: a página /inmetro diz ACERT e o rodapé diz
// Instituto Brasileiro de Certificação. Conflito da fonte (SPEC 0.3): as duas ficam, com nota;
// nenhuma é escolhida. O número do certificado é o mesmo nas duas.
{
  const pagina = (empresa.inmetro.pagina_literal.match(/Organismo Acreditado:\s*([^\n]+)/i) || [])[1]?.trim() ?? null;
  const rodape = (empresa.inmetro.rodape_literal.match(/emitido pelo\s+(.+?)\.?\s*$/i) || [])[1]?.trim() ?? null;
  if (!pagina || !rodape) throw new Error('empresa: organismo certificador não encontrado num dos literais do INMETRO');
  if (semAcento(pagina).toLowerCase().replace(/\W+/g, '') !== semAcento(rodape).toLowerCase().replace(/\W+/g, '')) {
    empresa.inmetro.organismo_certificador_conflito = {
      pagina_inmetro: pagina,
      rodape: rodape,
      tratamento: 'mostrar as duas versões com a nota "a fonte cita dois organismos; confirmar com a empresa" ou omitir o organismo; nunca escolher uma (SPEC 0.3)',
      pendente_com_a_empresa: true,
    };
    editorialLog.push({ empresa: 'inmetro', campo: 'organismo_certificador', regra: 'conflito_da_fonte', versoes: [{ texto: pagina, fonte: empresa.inmetro.fonte }, { texto: rodape, fonte: 'rodapé global' }], decisao: 'nenhuma escolhida; exibir as duas com nota ou omitir' });
  }
}

// Textos integrais das páginas institucionais: o literal fica no dado; o que pode ir ao HTML fica em
// texto_exibido. Saem, frase inteira e com registro no editorial-log: afirmação de saúde, superlativo
// não comprovado, ISO 9001, autodeclaração da lista claims_nao_publicar, termo proibido literal,
// garantia (SPEC 15) e número da empresa fora do campo numeros_declarados ("segundo a empresa").
// Antes, os pares de linha de número do "Sobre nós" ("+ DE 80" / "COLABORADORES DIRETOS") saem juntos.
const reLinhaNumero = /^\s*(?:\+\s*(?:de\s+)?[\d.]+|[\d.]+\s*\+)\s*$/i;
function semLinhasDeNumero(texto, chave) {
  const linhas = String(texto).split('\n');
  const ficam = [];
  for (let i = 0; i < linhas.length; i++) {
    if (reLinhaNumero.test(linhas[i]) && linhas[i + 1] != null) {
      const removido = `${linhas[i]}\n${linhas[i + 1]}`;
      editorialLog.push({ empresa: `textos_integrais.${chave}`, campo: 'texto', regra: 'numero_da_empresa_sem_segundo_a_empresa', termos: [linhas[i].trim()], removido, decisao: 'o número aparece só por empresa.numeros_declarados, com "segundo a empresa"' });
      i++;
      continue;
    }
    ficam.push(linhas[i]);
  }
  return ficam.join('\n');
}
for (const [chave, t] of Object.entries(empresa.textos_integrais)) {
  if (!t || typeof t.texto !== 'string') continue;
  const r = filtrarFrasesEditorialMultilinha(semLinhasDeNumero(t.texto, chave), DETECTORES_INSTITUCIONAL);
  for (const x of r.removidos) {
    editorialLog.push(comRegra({ empresa: `textos_integrais.${chave}`, campo: 'texto', removido: x.frase }, x));
  }
  empresa.textos_integrais[chave] = { ...t, texto_exibido: r.texto.replace(/^\s+/u, '') };
}

// ---------------------------------------------------------------------------
// FAQ (SPEC 3.3, 9.6)
// ---------------------------------------------------------------------------

// Tema por item, na ordem de faq-source.json (classificação editorial, não muda texto).
const TEMAS = [
  'Entrega', 'Materiais', 'Escolher', 'Materiais', 'Pagamento', 'Instalação', 'Pós-venda', 'Materiais', 'Materiais', 'Materiais', 'Instalação',
  'Itens e opcionais', 'Itens e opcionais', 'Itens e opcionais', 'Itens e opcionais', 'Itens e opcionais', 'Itens e opcionais', 'Itens e opcionais', 'Itens e opcionais', 'Itens e opcionais',
  'Entrega', 'Entrega', 'Entrega', 'Entrega', 'Entrega', 'Entrega', 'Itens e opcionais',
  'Pós-venda', 'Pós-venda', 'Pós-venda', 'Entrega', 'Pagamento', 'Pós-venda', 'Pagamento', 'Pagamento',
  'Instalação', 'Instalação', 'Escolher', 'Escolher', 'Escolher',
  'Cuidados', 'Cuidados', 'Cuidados', 'Cuidados', 'Pós-venda', 'Entrega',
];
if (TEMAS.length !== faqSrc.faq.length) throw new Error(`faq: ${faqSrc.faq.length} itens e ${TEMAS.length} temas`);

const faq = faqSrc.faq.map((x, i) => {
  const garantia = /garantia/i.test(x.pergunta);
  const termos = termosSaude(`${x.pergunta}\n${x.resposta_literal}`);
  const item = {
    id: `faq-${String(i + 1).padStart(2, '0')}`,
    tipo: x.tipo === 'pergunta_e_resposta_publicadas' ? 'publicada' : 'redigida_resposta_literal',
    tema: TEMAS[i],
    grupo_fonte: x.grupo,
    numero_fonte: x.numero ?? null,
    pergunta: x.pergunta,
    resposta: x.resposta_literal,
    fonte: x.source_url,
    coletado_em: faqSrc._meta.coletado_em,
    oculto_ate_decisao: garantia,
  };
  if (x.obs) item.obs_fonte = x.obs;
  if (x.link_manual) item.link_manual = x.link_manual;
  if (termos.length) item.termos_sensiveis = termos;
  // Resposta exibível em todos os itens (igual ao literal quando nada sai): sem as frases que violam
  // as regras editoriais (frase inteira, com registro). Pergunta com violação, resposta vazia ou item
  // de garantia oculto até a decisão: exibir=false.
  const r = filtrarFrasesEditorial(x.resposta_literal, DETECTORES);
  for (const f of r.removidos) {
    editorialLog.push(comRegra({ faq: item.id, campo: 'resposta', removido: f.frase }, f));
  }
  item.resposta_exibida = r.texto;
  const naPergunta = violacaoEditorial(x.pergunta, DETECTORES);
  const vazia = !String(r.texto ?? '').trim();
  item.exibir = !(naPergunta || vazia || garantia);
  if (naPergunta || vazia) {
    const v = naPergunta ?? r.removidos[0];
    item.motivo_nao_exibir = naPergunta ? 'pergunta com trecho fora das regras editoriais' : 'nada sobra da resposta depois do filtro editorial';
    editorialLog.push(comRegra({ faq: item.id, campo: 'item', removido: x.pergunta, decisao: `${item.motivo_nao_exibir}: item fora da exibição` }, v));
  } else if (garantia) {
    item.motivo_nao_exibir = 'garantia: oculto até a decisão da empresa (SPEC 15)';
  }
  // Palavra da lista usada fora de sentido de saúde (ICMS, tratamento da água): publica literal,
  // com a decisão registrada no próprio item (exceções fixas em build/lib/texto.mjs).
  const brutos = termosSaudeBrutos(`${x.pergunta}\n${x.resposta_literal}`);
  if (brutos.length && !termos.length) {
    const texto = semAcento(`${x.pergunta}\n${x.resposta_literal}`).toLowerCase();
    item.revisao_termos = {
      termos_da_lista: brutos,
      decisao: 'publicar literal: a palavra aparece numa expressão fixa sem sentido de saúde',
      expressoes: EXCECOES_NAO_SAUDE.filter((e) => { e.re.lastIndex = 0; return e.re.test(texto); }).map((e) => e.motivo),
    };
  }
  if (/carrinho/i.test(x.resposta_literal)) item.alerta = 'a resposta descreve o carrinho do site atual, que não existe no site novo';
  return item;
});

// ---------------------------------------------------------------------------
// Políticas (SPEC 3.3)
// ---------------------------------------------------------------------------

// Filtro editorial do manual (SPEC 0.5 e 15). O texto literal de cada página fica em `texto`;
// o que vai ao HTML fica em `texto_exibido`. Saem, com registro no log:
// - o capítulo de garantia e o certificado de garantia (prazos de garantia: oculto_ate_decisao);
// - as linhas do índice que apontam para esses dois capítulos;
// - o capítulo "Benefícios da cromoterapia" inteiro (afirmações de saúde do começo ao fim);
// - qualquer outra linha com termo de saúde da lista (fora das exceções fixas de texto.mjs).
const MANUAL_CAPITULOS_OCULTOS = [
  { inicio: /^GARANTIA E CONTRATO DE GARANTIA$/, fim: /^MODO DE LIMPEZA$/, motivo: 'garantia', oculto_ate_decisao: true },
  { inicio: /^CERTIFICADO DE GARANTIA$/, fim: /^“?DIREITOS AUTORAIS/, motivo: 'garantia', oculto_ate_decisao: true },
  { inicio: /^BENEF[IÍ]CIOS DA CROMOTERAPIA$/, fim: /^A FUN[CÇ][AÃ]O DO OZ[OÔ]NIO$/, motivo: 'afirmacao_de_saude', oculto_ate_decisao: false },
];
const reIndiceGarantia = /^(garantia e contrato de garantia|certificado de garantia)\s*\.{3,}/i;

function filtrarManual(paginas) {
  let aberto = null;
  for (const pg of paginas) {
    const linhas = pg.texto.split('\n');
    const ficam = [];
    const ocultos = [];
    linhas.forEach((linha, idx) => {
      const limpa = linha.trim();
      if (aberto && aberto.fim.test(limpa)) aberto = null;
      if (!aberto) {
        const cap = MANUAL_CAPITULOS_OCULTOS.find((c) => c.inicio.test(limpa));
        if (cap) aberto = cap;
      }
      // O número da página (primeira linha) fica sempre.
      if (idx === 0 && /^\d+$/.test(limpa)) { ficam.push(linha); return; }
      let motivo = null;
      if (aberto && limpa) motivo = aberto.motivo;
      else if (reIndiceGarantia.test(limpa)) motivo = 'garantia';
      else if (termosSaude(limpa).length) motivo = 'termo_de_saude';
      if (motivo) {
        ocultos.push({ motivo, texto: linha, ...(motivo === 'garantia' ? { oculto_ate_decisao: true } : {}) });
        editorialLog.push({ manual_pagina: pg.pagina, campo: 'politicas.manual.paginas[].texto', regra: motivo, ...(motivo === 'termo_de_saude' ? { termos: termosSaude(limpa), lista: listaSaude(termosSaude(limpa)) } : {}), removido: linha });
        return;
      }
      ficam.push(linha);
    });
    // Segunda passada por frase (a frase do manual atravessa linhas): superlativo, autodeclaração,
    // ISO 9001 e número da empresa saem inteiros, com o mesmo registro. O número da página fica.
    let texto = ficam.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const mPag = texto.match(/^(\d+)(\n+)/);
    const cabeca = mPag ? mPag[0] : '';
    const corpo = filtrarFrasesEditorialMultilinha(texto.slice(cabeca.length), [...DETECTORES, DETECTOR_NUMERO_EMPRESA]);
    for (const x of corpo.removidos) {
      ocultos.push({ motivo: x.regra, texto: x.frase });
      editorialLog.push(comRegra({ manual_pagina: pg.pagina, campo: 'politicas.manual.paginas[].texto', removido: x.frase }, x));
    }
    texto = (cabeca + corpo.texto).replace(/\n{3,}/g, '\n\n').trim();
    pg.texto_exibido = texto;
    pg.trechos_ocultos = ocultos;
    // Página que fica só com o número (só imagem no PDF, ou tudo oculto): nenhum texto no HTML.
    const conteudo = texto.split('\n').filter((l) => l.trim() && !/^\d+$/.test(l.trim()));
    pg.sem_texto_exibido = conteudo.length === 0;
    if (ocultos.some((o) => o.motivo === 'garantia')) {
      if (pg.sem_texto_exibido) pg.oculto_ate_decisao = true;
      else pg.tem_trecho_oculto_ate_decisao = true;
    }
  }
  if (aberto) throw new Error('manual: capítulo oculto sem fim encontrado');
  return paginas;
}

function paginasDoManual() {
  const f = join(R, 'html', 'pdf', 'manual-do-usuario.txt');
  if (!existsSync(f)) return [];
  const bruto = readFileSync(f, 'utf8');
  return bruto.split(/^--- p(\d+)\s*$/m).slice(1).reduce((acc, cur, i, arr) => {
    if (i % 2 === 0) {
      const texto = arr[i + 1]
        .split('\n')
        .map((l) => l.replace(/\s+$/g, '').replace(/^\s+/, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      acc.push({ pagina: Number(cur), texto });
    }
    return acc;
  }, []);
}

const pz = inst.comercial.prazo_de_entrega;
const politicas = {
  como_comprar: { texto: inst.comercial.como_comprar.texto, telefone: inst.comercial.como_comprar.telefone, fonte: inst.comercial.como_comprar.source_url },
  pagamento: { literal: inst.comercial.formas_pagamento.literal, fonte: inst.comercial.formas_pagamento.source_url },
  parcelamento_destaque: { literal: inst.comercial.parcelamento_destaque.literal, fonte: inst.comercial.parcelamento_destaque.source_url },
  atacado: { literal: inst.comercial.atacado.literal, fonte: inst.comercial.atacado.source_url },
  prazo_de_entrega: {
    texto: pz.texto,
    tabela: [
      { grupo: 'Banheiras e ofurôs', linhas: pz.tabela.banheiras_e_ofuros.map(([estados, prazo]) => ({ estados, prazo })) },
      { grupo: 'Spas e produtos em acrílico ou com deck', linhas: pz.tabela.spas_e_produtos_em_acrilico_ou_com_deck.map(([estados, prazo]) => ({ estados, prazo })) },
    ],
    ressalva: pz.tabela.ressalva,
    fonte: pz.source_url,
  },
  prazo_outras_cores: { literal: inst.comercial.prazo_outras_cores.literal, fonte: inst.comercial.prazo_outras_cores.source_url },
  entrega: { literal: inst.comercial.restricoes_entrega.literal, fonte: inst.comercial.restricoes_entrega.source_url },
  itens_avulsos_suspensos: { literal: inst.comercial.itens_avulsos_suspensos.literal, fonte: inst.comercial.itens_avulsos_suspensos.source_url },
  instalacao: { literal: inst.comercial.instalacao.literal, fonte: inst.comercial.instalacao.source_url },
  art_rrt: { literal: inst.comercial.art_rrt.literal, fonte: inst.comercial.art_rrt.source_url },
  desistencia: {
    literal: inst.politicas.troca_devolucao_reembolso.pontos_chave_literais[0],
    pontos_chave: inst.politicas.troca_devolucao_reembolso.pontos_chave_literais,
    fonte: inst.politicas.troca_devolucao_reembolso.source_url,
  },
  troca_devolucao_reembolso: {
    texto: inst.politicas.troca_devolucao_reembolso.texto,
    alerta_fonte: inst.politicas.troca_devolucao_reembolso.alerta,
    fonte: inst.politicas.troca_devolucao_reembolso.source_url,
  },
  privacidade: { texto: inst.politicas.privacidade_e_cookies.texto, canal_lgpd: inst.politicas.privacidade_e_cookies.canal_lgpd, fonte: inst.politicas.privacidade_e_cookies.source_url },
  termos: { texto: inst.politicas.termos_de_uso.texto, fonte: inst.politicas.termos_de_uso.source_url },
  seguranca: { texto: inst.politicas.seguranca.texto, fonte: inst.politicas.seguranca.source_url },
  uso_de_imagens: { literal: inst.politicas.uso_de_imagens.literal, fonte: inst.politicas.uso_de_imagens.source_url },
  garantia: {
    publicar: false,
    texto_exibido: 'Consulte as condições de garantia do seu modelo com o consultor.',
    versoes_da_fonte: inst.garantia,
  },
  manual: {
    url_fonte: inst.suporte_pos_venda.manual_usuario_pdf.url,
    pdf_path: 'manual/manual-do-usuario.pdf',
    paginas_total: inst.suporte_pos_venda.manual_usuario_pdf.paginas,
    descricao_literal: inst.suporte_pos_venda.manual_usuario_pdf.descricao_literal,
    paginas: filtrarManual(paginasDoManual()),
    fonte: inst.suporte_pos_venda.manual_usuario_pdf.source_url,
  },
  rastreio: { campos: inst.suporte_pos_venda.rastreio.campos, cnpjs_aceitos_literal: inst.empresa.cnpjs_aceitos_no_rastreio.literal, fonte: inst.suporte_pos_venda.rastreio.source_url },
  cuidados_limpeza: inst.suporte_pos_venda.cuidados_limpeza_manual,
  coletado_em: inst._meta.coletado_em,
};

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------

const posts = [...blog.posts].sort((a, b) => String(b.date_published).localeCompare(String(a.date_published)));
const resumoPost = (p) => ({
  id: p.id,
  titulo: p.title,
  url: p.source_url,
  publicado_em: p.date_published,
  modificado_em: p.date_modified,
  categorias: p.categories,
  resumo: p.seo_description || null,
  // Título ou resumo do post com afirmação de saúde (lista da SPEC 0.5 e lista ampliada por decisão
  // do dono): o post não é exibido (exibir=false). Os demais só são exibidos depois da revisão
  // manual do índice (revisao_manual_pendente no topo do arquivo).
  // As mesmas regras editoriais do resto do site valem para título e resumo (superlativo, autodeclaração).
  ...((v) => (v
    ? { ...(v.regra === 'termo_de_saude' ? { termos_sensiveis: v.termos } : {}), regra_nao_exibir: v.regra, exibir: false }
    : { exibir: true }))(violacaoPost(p)),
});
// No blog, título e resumo são perguntas e conselhos de escolha ("qual a melhor opção?", "escolha
// a melhor banheira"): o superlativo só conta quando a frase fala da própria empresa ("na BBB você
// garante os melhores modelos"). As demais regras valem iguais.
const reFalaDaEmpresa = /(?<![\p{L}\p{N}])(?:bbb|banheiras bom banho|nosso|nossa|nossos|nossas|somos|conosco|garante)(?![\p{L}\p{N}])/u;
const DETECTORES_BLOG = DETECTORES.map((d) => (d.regra !== 'superlativo_nao_comprovado' ? d : {
  ...d,
  fn: (f) => (reFalaDaEmpresa.test(semAcento(f).toLowerCase()) ? d.fn(f) : []),
}));
function violacaoPost(p) {
  for (const t of [p.title, p.seo_description || '']) {
    const v = filtrarFrasesEditorialMultilinha(t, DETECTORES_BLOG).removidos[0] ?? null;
    if (v) return { regra: v.regra, termos: v.termos };
  }
  return null;
}
for (const p of posts) {
  const v = violacaoPost(p);
  if (v) editorialLog.push(comRegra({ blog_post: p.id, campo: 'titulo/resumo', removido: p.title }, v));
}
const porCategoria = {};
for (const p of posts) for (const c of p.categories || []) (porCategoria[c] ||= []).push(resumoPost(p));
const blogRecentes = {
  // Os 3 mais recentes entre os exibíveis (o post com afirmação de saúde não entra no bloco).
  recentes: posts.map(resumoPost).filter((x) => x.exibir).slice(0, 3),
  // A marca automática pega palavras, não sentido: o índice por categoria só vai ao HTML depois
  // de uma revisão manual título a título (decisão registrada no editorial-log).
  revisao_manual_pendente: true,
  regra_exibicao: 'exibir só posts com exibir=true; o índice por_categoria só depois da revisão manual (revisao_manual_pendente=false)',
  por_categoria: porCategoria,
  total_posts: blog._meta.total_posts,
  fonte: blog._meta.fonte,
  coletado_em: blog._meta.coletado_em,
};

// ---------------------------------------------------------------------------
// Mapa campo exibido -> origem (SPEC 3.3, 13.2)
// ---------------------------------------------------------------------------

const exibidos = {
  _sobre: 'Cada elemento do HTML que mostra dado da empresa carrega data-campo com uma destas chaves. O validador confere o valor exibido contra o caminho em data/ e, por ele, contra a origem em _recon/.',
  campos: {
    nome: { data: 'produtos.json[].nome', origem: 'catalog.json:products[].nome' },
    sku: { data: 'produtos.json[].sku', origem: 'catalog.json:products[].sku' },
    disponibilidade: { data: 'produtos.json[].disponibilidade', origem: 'catalog.json:products[].disponibilidade' },
    'preco-por': { data: 'produtos.json[].preco.por', origem: 'catalog.json:products[].preco.por' },
    'preco-de': { data: 'produtos.json[].preco.de', origem: 'catalog.json:products[].preco.de' },
    'preco-final-num': { data: 'produtos.json[].preco.valores_numericos.finalPrice', origem: 'catalog.json:products[].preco.valores_numericos.finalPrice' },
    'tamanho-rotulo': { data: 'produtos.json[].d_tamanhos[].rotulo', origem: 'catalog.json:products[].opcoes_personalizaveis[titulo~/^tamanho:?$/i].valores[].rotulo_exibido' },
    'tamanho-ficha': { data: 'produtos.json[].d_tamanhos[].rotulo_ficha', origem: 'catalog.json:products[].especificacoes.{Comprimento,Largura,Profundidade,Altura}' },
    'opcao-rotulo': { data: 'produtos.json[].opcoes_personalizaveis[].valores[].rotulo_exibido', origem: 'catalog.json:products[].opcoes_personalizaveis[].valores[].rotulo_exibido' },
    'opcao-preco': { data: 'produtos.json[].opcoes_personalizaveis[].valores[].preco_adicional', origem: 'catalog.json:products[].opcoes_personalizaveis[].valores[].preco_adicional' },
    'ficha-valor': { data: 'produtos.json[].especificacoes[<rótulo>]', origem: 'catalog.json:products[].especificacoes[<rótulo>]', obs: 'o atributo data-ficha leva o rótulo literal' },
    'item-serie': { data: 'produtos.json[].d_itens_de_serie_exibidos[]', origem: 'catalog.json:products[].itens_de_serie[]', obs: 'menos o filtro editorial de data/editorial-log.json' },
    resumo: { data: 'produtos.json[].d_resumo', origem: 'derivado (SPEC 11.4)' },
    'planta-cota': { data: 'plantas/<sha1>.json:cotas[].valor_m', origem: 'PDF oficial da planta' },
    'categoria-total': { data: 'categorias.json[].total_exibido', origem: 'catalog.json:categories[].total_exibido' },
    'empresa-telefone': { data: 'empresa.json:telefone_fixo.display', origem: 'institucional.json:contatos.telefone_fabrica.literal' },
    'empresa-endereco': { data: 'empresa.json:endereco_fabrica', origem: 'institucional.json:empresa.endereco_fabrica[0].literal (sem CEP)' },
    'empresa-email': { data: 'empresa.json:emails[].email', origem: 'institucional.json:contatos.emails[].valor' },
    'empresa-horario': { data: 'empresa.json:horario.literal', origem: 'institucional.json:contatos.horario_atendimento.literal' },
    'empresa-cnpj': { data: 'empresa.json:cnpjs_rodape[].literal', origem: 'institucional.json:empresa.razoes_sociais_e_cnpjs_visiveis[]' },
    'empresa-numeros': { data: 'empresa.json:numeros_declarados[].literal', origem: 'institucional.json:empresa.numeros_institucionais|numeros_corporativo' },
    'empresa-inmetro': { data: 'empresa.json:inmetro.certificado', origem: 'institucional.json:certificacoes.inmetro_pagina.literal' },
    'ra-nota': { data: 'empresa.json:reclame_aqui.nota', origem: 'institucional.json:prova_social.reclame_aqui.pagina_visivel.nota' },
    'ra-resolve': { data: 'empresa.json:reclame_aqui.resolve', origem: 'institucional.json:prova_social.reclame_aqui.pagina_visivel.resolve' },
    'ra-periodo': { data: 'empresa.json:reclame_aqui.periodo', origem: 'institucional.json:prova_social.reclame_aqui.pagina_visivel.periodo' },
    depoimento: { data: 'empresa.json:depoimentos[].texto', origem: 'institucional.json:prova_social.depoimentos_no_site[].literal' },
    'contato-numero': { data: 'contatos.json:contatos[].numero', origem: 'whatsapp.json:numbers[].phone' },
    'contato-display': { data: 'contatos.json:contatos[].display', origem: 'whatsapp.json:numbers[].display' },
    'loja-endereco': { data: 'lojas.json[].endereco_exibido', origem: 'institucional.json:lojas_showrooms.lojas[].endereco_literal' },
    'loja-telefone': { data: 'lojas.json[].atendimento_literal', origem: 'institucional.json:lojas_showrooms.lojas[].atendimento' },
    'prazo-entrega': { data: 'politicas.json:prazo_de_entrega.tabela[].linhas[].prazo', origem: 'institucional.json:comercial.prazo_de_entrega.tabela' },
    pagamento: { data: 'politicas.json:pagamento.literal', origem: 'institucional.json:comercial.formas_pagamento.literal' },
    'categoria-descricao': { data: 'categorias.json[].d_descricao_exibida', origem: 'catalog.json:categories[].descricao_texto', obs: 'menos o filtro editorial de data/editorial-log.json' },
    'manual-texto': { data: 'politicas.json:manual.paginas[].texto_exibido', origem: '_recon/html/pdf/manual-do-usuario.txt', obs: 'menos garantia e afirmações de saúde (editorial-log)' },
    'faq-resposta': { data: 'faq.json[].resposta_exibida', origem: 'faq-source.json:faq[].resposta_literal', obs: 'presente nos 46 itens; exibir só quando exibir=true; resposta (literal) nunca vai ao HTML direto' },
    'empresa-texto': { data: 'empresa.json:textos_integrais.<chave>.texto_exibido', origem: 'institucional.json:empresa.textos_integrais.<chave>.texto', obs: 'menos o filtro editorial (saúde, superlativo, autodeclaração, garantia, número da empresa)' },
    'meta-title': { data: 'produtos.json[]|categorias.json[].d_meta_exibida.title', origem: 'catalog.json:products[]|categories[].meta.title', obs: 'null = gerar de campos reais (SPEC 11.1); nunca usar meta.title cru' },
    'meta-description': { data: 'produtos.json[]|categorias.json[].d_meta_exibida.description', origem: 'catalog.json:products[]|categories[].meta.description', obs: 'null = gerar de campos reais (SPEC 11.1); nunca usar meta.description nem og:description cru' },
    'contagem-por-tipo': { data: 'categorias.json[d_path=banheiras.html|spas.html|ofuros.html|sauna.html|acessorios.html].total_exibido', origem: 'catalog.json:categories[].total_exibido', obs: 'não contar produtos por d_tipo: o Spa Serena é listado em ofuros.html e em spas.html (conflito da fonte, d_tipo_conflito)' },
    'data-coleta': { data: 'meta.json:data_coleta', origem: 'catalog.json:generated_at_source.coletado_em' },
    'institucional-texto': { data: 'institucionais.json:paginas.<chave>.texto_exibido', origem: '_recon/html/inst-txt/<página>.txt | catalog.json:paginas_institucionais_e_blog[].texto', obs: 'e-mails protegidos decodificados da mesma página; menos o filtro editorial e as remoções listadas em institucionais.json:paginas.<chave>.removidos' },
    instalador: { data: 'institucionais.json:instaladores.lista[]', origem: 'institucional.json:instaladores.lista[]' },
    'loja-nome': { data: 'lojas.json[].nome', origem: 'institucional.json:lojas_showrooms.lojas[].nome' },
  },
};

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

const meta = {
  coletado_em: COLETADO_EM,
  data_coleta: DATA_COLETA,
  site_atual: SITE_ATUAL,
  observacao_fonte: catalog.generated_at_source.observacao,
  faixas_de_filtro: catalog.faixas_de_filtro,
  paginas_institucionais_e_blog: catalog.paginas_institucionais_e_blog.map((p) => ({
    url: p.url, d_path: pathDoSite(p.url), tipo: p.tipo, titulo: p.titulo, h1: p.h1, status: p.status, em_sitemap: p.em_sitemap, nota: p.nota, meta: p.meta,
  })),
  skipped: catalog.skipped,
  contagens: {
    produtos: produtos.length,
    categorias: categorias.length,
    familias: Object.keys(familias).length,
    contatos: contatos.length,
    lojas: lojasOut.length,
    faq: faq.length,
  },
};

gravar('meta.json', meta);
gravar('produtos.json', produtos);
gravar('categorias.json', categorias);
gravar('familias.json', familias);
gravar('contatos.json', { coletado_em: whatsapp.captured_at, fonte: '_recon/whatsapp.json + _recon/institucional.json', contatos });
gravar('empresa.json', empresa);
gravar('lojas.json', lojasOut);
gravar('faq.json', faq);
gravar('politicas.json', politicas);
gravar('blog-recentes.json', blogRecentes);
gravar('exibidos.map.json', exibidos);
gravar('editorial-log.json', {
  coletado_em: COLETADO_EM,
  regras: {
    termo_de_saude: 'frase inteira com palavra da lista da SPEC 0.5 (lista "spec_0.5") ou da lista ampliada de afirmação de saúde implícita (lista "ampliada_dono") sai do texto exibido; o literal fica no dado',
    lista_ampliada_dono: { decisao: 'decisão do dono do projeto (18/10/2026): sem claims de saúde, inclusive implícitos (insônia, dor, muscular, estresse, alívio, terapia, alergia, pele, bactérias, benefícios etc.)', termos: TERMOS_SAUDE_IMPLICITA },
    blog: 'post com frase fora das regras editoriais no título ou resumo (saúde, autodeclaração, ISO, termo literal; superlativo só quando a frase fala da própria empresa): exibir=false; o índice por categoria fica fora da exibição até revisão manual (revisao_manual_pendente em blog-recentes.json)',
    faq: 'resposta_exibida e exibir em todos os itens; resposta_exibida sem as frases que violam as regras editoriais; pergunta com violação, resposta vazia ou garantia: exibir=false',
    termo_proibido_literal: 'frase com termo proibido literal ("a maior loja" etc.) sai de todo texto exibido',
    superlativo_nao_comprovado: 'frase com superlativo ou ranking sem prova ("o melhor", "os melhores", "a maior", "a única com", "líder", "referência", "mais vendidos/desejados", "sem dúvida") sai inteira de todo texto exibido (SPEC 0.5); o comparativo sem artigo ("maior durabilidade") fica',
    certificacao_nao_confirmada: 'frase com ISO 9001 sai de todo texto exibido até a empresa enviar número e certificadora (SPEC 15)',
    autodeclaracao_nao_publicar: 'frase que reproduz uma frase de empresa.claims_nao_publicar sai de todo texto exibido',
    numero_da_empresa_sem_segundo_a_empresa: 'número da empresa (anos, modelos, cores, colaboradores, m2, vendidos) sai dos textos; aparece só por empresa.numeros_declarados com "segundo a empresa"',
    afirmacao_inmetro_em_meta: 'meta title/description com afirmação de INMETRO ou qualquer outra regra editorial: campo inteiro fora de d_meta_exibida (null = gerar de campos reais)',
    titulo_sem_conteudo_apos_corte: 'título de uma palavra cujo conteúdo saiu inteiro pelo filtro editorial sai junto',
    profundidade_nao_lida_formato_irregular: 'rótulo de tamanho fora do formato "a x b x c": d_tamanhos[].c = null (nenhuma leitura escolhida); a profundidade da ficha fica ao lado em profundidade_ficha',
    conflito_da_fonte: 'duas versões do mesmo dado na fonte: ambas registradas, nenhuma escolhida (SPEC 0.3)',
    excecoes_nao_saude: EXCECOES_NAO_SAUDE.map((e) => ({ expressao: e.re.source, motivo: e.motivo })),
    anotacao_interna_VERIFICAR: 'item ou linha com "(VERIFICAR)" sai até a empresa confirmar',
    garantia: 'capítulos de garantia do manual e linhas do índice que apontam para eles ficam ocultos até a decisão (SPEC 15)',
    afirmacao_de_saude: 'capítulo "Benefícios da cromoterapia" do manual sai inteiro',
    espaco_apos_virgula_decimal_ignorado: 'só em rótulo de formato regular: medida "0, 84" seria lida como 0,84; rótulo irregular não tem profundidade lida (profundidade_nao_lida_formato_irregular)',
  },
  total: editorialLog.length,
  itens: editorialLog,
});

// Páginas institucionais (bloco 7): data/institucionais.json e o PDF do manual em public/manual/.
const { gerarInstitucionais } = await import('./institucional-dados.mjs');
const institucionais = gerarInstitucionais();

console.log(`normalize: ${produtos.length} produtos, ${categorias.length} categorias, ${Object.keys(familias).length} famílias, ${contatos.length} contatos, ${lojasOut.length} lojas, ${faq.length} FAQ; coleta ${DATA_COLETA}; ${editorialLog.length} registros editoriais`);
console.log(`normalize: ${Object.keys(institucionais.paginas).length} páginas institucionais, ${institucionais.instaladores.lista.length} instaladores`);
for (const a of avisos) console.log(`aviso: ${a}`);
