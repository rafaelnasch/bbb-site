// Dados das páginas institucionais (SPEC 3.3, 4 linha 10 e 9.6) que ainda não estavam em data/:
// _recon/ -> data/institucionais.json, e o PDF do manual -> public/manual/manual-do-usuario.pdf.
// Chamado no fim do build/normalize.mjs; também roda sozinho (node build/institucional-dados.mjs).
//
//  - texto: o literal da página do site atual (_recon/html/inst-txt e institucional.json), só com os
//    e-mails protegidos pelo Cloudflare ("[email protected]") trocados pelo endereço real, decodificado
//    do atributo data-cfemail da mesma página (_recon/html/inst), na ordem em que aparecem.
//  - texto_exibido: o literal menos as frases que violam as regras editoriais (saúde, superlativo,
//    ISO, autodeclaração, termo proibido), as mesmas do normalize (build/lib/texto.mjs), linha a linha, e menos as
//    remoções pontuais listadas em REMOCOES (cada uma com o motivo). Tudo que sai fica em `removidos`.
//  - Nada é reescrito: o que vai ao HTML é recorte do literal.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { paths } from '../site.config.mjs';
import { filtrarFrasesEditorial, detectoresEditoriais } from './lib/texto.mjs';

const R = paths.recon;
const SITE_ATUAL = 'https://www.banheirasbombanho.com.br';

/** Decodifica o e-mail protegido pelo Cloudflare (data-cfemail: chave XOR no primeiro byte). */
export function decodificarCfemail(hex) {
  const k = parseInt(hex.slice(0, 2), 16);
  let s = '';
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return s;
}

/** E-mails protegidos de uma página, na ordem do documento (o conteúdo vem antes do rodapé). */
function emailsDaPagina(arquivoHtml) {
  const p = join(R, 'html', 'inst', arquivoHtml);
  if (!existsSync(p)) return [];
  const h = readFileSync(p, 'utf8');
  return [...h.matchAll(/data-cfemail="([0-9a-f]+)"/g)].map((m) => decodificarCfemail(m[1]));
}

/**
 * Troca cada "[email protected]" pelo e-mail decodificado da mesma posição. A proteção do Cloudflare
 * quebra a linha antes e depois do endereço; a troca junta o endereço à frase ("via e-mail x@y.").
 */
export function trocarEmails(texto, emails) {
  let i = 0;
  const usados = [];
  const out = String(texto).replace(/\s*\[email(?:&#160;| | )protected\]\s*(\.)?/g, (_, ponto) => {
    const e = emails[i++];
    if (!e) throw new Error('e-mail protegido sem correspondente decodificado');
    usados.push(e);
    return ` ${e}${ponto ? '.' : ' '}`;
  }).replace(/ +\n/g, '\n');
  return { texto: out, usados };
}

// Remoções pontuais, além do filtro editorial. Cada uma com o motivo; o literal fica em `texto`.
const REMOCOES = {
  'politica-devolucao-reembolso': [
    {
      re: /^Cartão de crédito: O valor será estornado em até 10 \(dez\) dias úteis da data se solicitação da Randora.*$/m,
      regra: 'residuo_de_template',
      motivo: 'a frase cita outra empresa ("Randora", resíduo de modelo, alerta da própria coleta); a mesma regra aparece, com o nome da Banheiras Bom Banho, na seção "Por motivo de desistência ou arrependimento"',
    },
  ],
  'seja-revendedor': [
    { re: /\s*Preencha o formulário abaixo e aguarde nosso retorno\./, regra: 'formulario_inexistente', motivo: 'o site novo não tem formulário (CSP form-action \'none\', SPEC 9.6): o contato é pelo WhatsApp' },
  ],
  'vendas-corporativas': [
    { re: /^(?:Saiba Mais|Veja nossos projetos!|Fale com nossa equipe!)$\n?/gm, regra: 'navegacao_do_tema', motivo: 'rótulo de botão do tema antigo, sem texto' },
    { re: /^ATENDIMENTO\nNossos representantes oferecem as melhores condições comerciais e entrega rápida e segura$\n?/m, regra: 'superlativo_nao_comprovado', motivo: '"as melhores condições" (SPEC 0.5); o título sai junto com a única frase do bloco' },
    { re: /^Agora saiba\nPorquê escolher a\nBanheiras Bom Banho\n[\s\S]*$/m, regra: 'numero_da_empresa_sem_segundo_a_empresa', motivo: 'os números aparecem só por empresa.numeros_declarados, com "segundo a empresa"' },
  ],
};

function filtrar(chave, literal, detectores) {
  let t = literal;
  const removidos = [];
  for (const r of REMOCOES[chave] || []) {
    const ms = r.re.global ? [...t.matchAll(r.re)] : [r.re.exec(t)].filter(Boolean);
    for (const m of ms) removidos.push({ frase: m[0].trim(), regra: r.regra, motivo: r.motivo });
    if (ms.length) t = t.replace(r.re, '');
  }
  t = t.replace(/\n{2,}/g, '\n');
  // Por linha: nestas páginas cada linha é um título, um item ou um parágrafo; uma frase que viola
  // a regra sai sem levar junto o título ou a assinatura da linha vizinha.
  const f = filtrarFrasesEditorial(t, detectores);
  for (const x of f.removidos) removidos.push({ frase: x.frase, regra: x.regra, termos: x.termos });
  return { texto_exibido: f.texto.replace(/^\s+/u, ''), removidos };
}

const lerTxt = (n) => readFileSync(join(R, 'html', 'inst-txt', `${n}.txt`), 'utf8').replace(/\r/g, '').replace(/[ \t]+$/gm, '').trim();

/**
 * Páginas: chave (= arquivo de saída sem .html) -> origem do literal.
 * `inst`: nome em _recon/html/inst(-txt); `catalogo`: texto em catalog.json.paginas_institucionais_e_blog.
 * `pular_linhas`: linhas iniciais que são navegação do tema (trilha "Início / Institucional / ..."), não texto.
 */
const PAGINAS = {
  'como-comprar': { inst: 'como-comprar', url: '/como-comprar' },
  'prazo-de-entrega': { inst: 'prazo-de-entrega', url: '/prazo-de-entrega' },
  'politica-devolucao-reembolso': { inst: 'politica-devolucao-reembolso', url: '/politica-devolucao-reembolso' },
  'politica-de-privacidade': { inst: 'politica-de-privacidade', url: '/politica-de-privacidade' },
  'termos-de-uso': { inst: 'termos-de-uso', url: '/termos-de-uso' },
  seguranca: { inst: 'seguranca', url: '/seguranca' },
  inmetro: { inst: 'inmetro', url: '/inmetro' },
  'politica-da-qualidade': { inst: 'politica-da-qualidade', url: '/politica-da-qualidade' },
  instaladores: { inst: 'instaladores', url: '/instaladores' },
  'seja-revendedor': { inst: 'seja-revendedor', url: '/seja-revendedor', ate: /\nInformações Pessoais/ },
  'vendas-corporativas': { inst: 'vendas-corporativas', url: '/vendas-corporativas.html', pular_linhas: 3 },
  localizacao: { inst: 'localizacao', url: '/localizacao' },
  'loja-fabrica-de-banheiras': { inst: 'loja-fabrica-de-banheiras', url: '/loja-fabrica-de-banheiras' },
  'loja-fisica': { inst: 'loja-fisica', url: '/loja-fisica', ate: /\n×/ },
  'lojas/loja-fisica': { inst: 'lojas_loja-fisica', url: '/lojas/loja-fisica.html', pular_linhas: 4, ate: /\n×/ },
  'lojas/loja-showrooms': { inst: 'lojas_loja-showrooms', url: '/lojas/loja-showrooms.html', pular_linhas: 3, ate: /\nLOJA 1/ },
  contacts: { inst: 'contacts', url: '/contacts', ate: /\nDeixe uma Mensagem/ },
  rastreio: { inst: 'rastreio', url: '/rastreio' },
  'manual-usuario-instalacao': { inst: 'manual-usuario-instalacao', url: '/manual-usuario-instalacao' },
  'banheiras-instaladas': { catalogo: '/banheiras-instaladas.html', url: '/banheiras-instaladas.html' },
};

export function gerarInstitucionais({ gravar = true } = {}) {
  const inst = JSON.parse(readFileSync(join(R, 'institucional.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(R, 'catalog.json'), 'utf8'));
  const empresa = JSON.parse(readFileSync(join(paths.data, 'empresa.json'), 'utf8'));
  const coletado = inst._meta?.coletado_em || empresa.coletado_em || null;
  const detectores = detectoresEditoriais({ claims: empresa.claims_nao_publicar || null });
  const metaInst = JSON.parse(readFileSync(join(R, 'html', 'inst-txt', '_meta.json'), 'utf8'));
  const porUrl = new Map(catalog.paginas_institucionais_e_blog.map((p) => [p.url.replace(SITE_ATUAL, ''), p]));

  const paginas = {};
  for (const [chave, o] of Object.entries(PAGINAS)) {
    let literal;
    let meta = null;
    let emails = [];
    if (o.catalogo) {
      const p = porUrl.get(o.catalogo);
      if (!p) throw new Error(`página ausente em catalog.json: ${o.catalogo}`);
      literal = p.texto.replace(/\r/g, '').trim();
      meta = p.meta ? { title: p.meta.title || null, description: (p.meta.description || '').trim() || null } : null;
    } else {
      literal = lerTxt(o.inst);
      const m = metaInst[`${o.inst}.html`];
      meta = m ? { title: m.title || null, description: (m.description || '').trim() || null } : null;
      emails = emailsDaPagina(`${o.inst}.html`);
    }
    if (o.pular_linhas) literal = literal.split('\n').slice(o.pular_linhas).join('\n');
    if (o.ate) {
      const m = o.ate.exec(literal);
      if (m) literal = literal.slice(0, m.index);
    }
    const tr = trocarEmails(literal, emails);
    const f = filtrar(chave, tr.texto, detectores);
    paginas[chave] = {
      fonte: `${SITE_ATUAL}${o.url}`,
      meta_atual: meta,
      texto: tr.texto.trim(),
      texto_exibido: f.texto_exibido.trim(),
      emails_decodificados: tr.usados,
      removidos: f.removidos,
    };
  }

  // Instaladores: lista literal da página (técnicos citados pela empresa), sem coluna de WhatsApp
  // própria (no site atual ela repete o telefone).
  const instaladores = {
    fonte: inst.instaladores.source_url,
    intro_literal: 'Segue a lista dos Instaladores Abaixo:',
    lista: inst.instaladores.lista.map((x) => ({ uf: x.uf, cidade: x.cidade, tecnico: x.tecnico, telefone: x.telefone })),
  };
  if (!lerTxt('instaladores').includes(instaladores.intro_literal)) throw new Error('instaladores: introdução literal não encontrada');

  // Vídeos do canal citados pela página /tutoriais (links reais, sem embed na carga).
  const tutoriais = {
    fonte: inst.suporte_pos_venda.tutoriais_video.source_url,
    canal: inst.suporte_pos_venda.tutoriais_video.canal,
    videos: inst.suporte_pos_venda.tutoriais_video.videos,
  };

  // Projetos e testemunhos da página "Projetos" (/banheiras-instaladas.html), lidos do literal.
  const bi = paginas['banheiras-instaladas'].texto.split('\n');
  const projetos = { banheiras: [], spas: [] };
  let alvo = null;
  for (let i = 0; i < bi.length; i++) {
    const l = bi[i].trim();
    if (/^Projetos de Banheiras$/i.test(l)) { alvo = 'banheiras'; continue; }
    if (/^Projetos realizados de Spas$/i.test(l)) { alvo = 'spas'; continue; }
    if (!alvo || l === '<' || l === '>') continue;
    const prox = (bi[i + 1] || '').trim();
    if (/^(Banheira|Spa) completo?a? /i.test(prox)) { projetos[alvo].push({ nome: l, legenda: prox }); i++; }
  }
  const depoimentos = [];
  const ini = bi.findIndex((l) => /^O que nossos clientes falam/i.test(l));
  const fim = bi.findIndex((l) => /^Projetos de Banheiras$/i.test(l));
  if (ini >= 0 && fim > ini) {
    const bloco = bi.slice(ini + 1, fim).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i + 1 < bloco.length; i += 2) {
      // O depoimento cuja frase viola a regra editorial sai inteiro, com o nome de quem assina.
      const f = filtrarFrasesEditorial(bloco[i], detectores);
      if (f.removidos.length) {
        paginas['banheiras-instaladas'].removidos.push(...f.removidos.map((x) => ({ frase: `${x.frase} (${bloco[i + 1]})`, regra: x.regra, termos: x.termos, obs: 'depoimento inteiro fora da exibição' })));
        continue;
      }
      depoimentos.push({ texto: bloco[i], autor: bloco[i + 1] });
    }
  }

  // Decisões editoriais das páginas deste bloco (auditáveis; nenhuma escolhe entre duas versões).
  const decisoes = [
    { item: 'faq.json faq-01 (valor do frete)', decisao: 'fora da página de perguntas', motivo: 'a resposta descreve o carrinho do site atual ("ADD CARRINHO", "CALCULAR"), que não existe no site novo (alerta da coleta); o texto literal fica no dado' },
    { item: 'como-comprar: passos do carrinho', decisao: 'fora da página', motivo: 'o texto literal ensina a usar o carrinho, o login e o "FECHAR PEDIDO" da loja antiga; no site novo o pedido é feito com um consultor pelo WhatsApp (SPEC 10). A página mostra o caminho do site novo e os textos literais que continuam válidos (pagamento, entrega, desistência)' },
    { item: 'representantes-credenciados: nomes, e-mails, CNPJs e CORE', decisao: 'não publicados', motivo: 'SPEC 4 e 15, até autorização da empresa; a página leva aos 8 consultores do rodapé' },
    { item: 'contacts: lista de "Vendas", telefone e e-mail de marketing', decisao: 'não publicados', motivo: 'a lista diverge do rodapé e tem números fora de contatos.json; marketing omitido até confirmação (SPEC 15)' },
    { item: 'inmetro: organismo certificador', decisao: 'as duas versões, com nota', motivo: 'a página cita ACERT e o rodapé cita o Instituto Brasileiro de Certificação (SPEC 0.3)' },
    { item: 'loja-showrooms2 (lojas antigas: Pouso Alegre e outro endereço em Taubaté)', decisao: 'não publicado', motivo: 'versão antiga não linkada, sem confirmação (institucional.json)' },
    { item: 'banheiras-instaladas: fotos dos projetos', decisao: 'não publicadas', motivo: 'as fotos dos projetos e das fachadas ainda não passaram pela revisão (uma foto da galeria mostra telefone fora dos contatos ativos); a página traz os nomes e legendas literais' },
  ];

  const out = {
    sobre: 'Textos das páginas institucionais do site atual (literal em `texto`, recorte publicado em `texto_exibido`). Gerado por build/institucional-dados.mjs.',
    coletado_em: coletado,
    paginas,
    instaladores,
    tutoriais,
    projetos,
    depoimentos_projetos: depoimentos,
    decisoes,
  };

  if (gravar) {
    writeFileSync(join(paths.data, 'institucionais.json'), `${JSON.stringify(out, null, 2)}\n`);
    // PDF oficial do manual, no mesmo caminho do site atual (SPEC 2: public/manual/manual-do-usuario.pdf).
    const pdf = join(R, 'html', 'pdf', 'manual-do-usuario.pdf');
    const dest = join(paths.public, 'manual', 'manual-do-usuario.pdf');
    if (existsSync(pdf)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(pdf, dest);
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = gerarInstitucionais();
  const n = Object.values(o.paginas).reduce((s, p) => s + p.removidos.length, 0);
  console.log(`institucionais: ${Object.keys(o.paginas).length} páginas, ${o.instaladores.lista.length} instaladores, ${o.projetos.banheiras.length + o.projetos.spas.length} projetos, ${n} trechos fora da exibição`);
}
