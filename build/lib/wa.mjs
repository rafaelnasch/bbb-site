// WhatsApp: o checkout do site (SPEC 10). Números só de data/contatos.json.

/**
 * Lista negra (SPEC 10.1), com a correção registrada abaixo.
 *
 * A SPEC escreve "qualquer 55359918200\d\d". Essa expressão casaria o SAC ativo
 * 5535991820062 (que a própria SPEC manda usar) e deixaria de fora 3 dos 6 números que
 * só existem no GTM das landing pages satélite. Como a SPEC manda o dado do _recon
 * prevalecer, a lista usa os 6 números exatos de whatsapp.json.gtm_only_numbers.
 */
export const LISTA_NEGRA = Object.freeze([
  // removidos ou só na página /contacts (whatsapp.json, status != ativo)
  '5535997392842',
  '5535991480035',
  '5535991240879',
  '5535991847189',
  '553599123084',
  '5535992194395',
  // variante sem o 9 da representante Dulci Paula (representantes-credenciados)
  '553597392842',
  // telefone comercial com um dígito a menos em /contacts (tel:+553592192256)
  '553592192256',
  // só gatilhos do GTM para landing pages satélite (whatsapp.json.gtm_only_numbers)
  '5535991820084',
  '5535991820085',
  '5535991820093',
  '5535991820102',
  '5535991820105',
  '5535991820107',
  // telefones de marketing, omitidos até confirmação (SPEC 15)
  '5535992194888',
  '5535991240959',
  '55991240959',
]);

/**
 * Faixa da SPEC 10.1 ("55359918200\\d\\d"), mantida além dos números exatos acima, com a única
 * exceção do SAC ativo 5535991820062 (contatos.json). Assim um número da mesma faixa que não
 * esteja na lista exata, e não seja o SAC, continua bloqueado. Vale com e sem o DDI 55.
 */
export const LISTA_NEGRA_FAIXA = Object.freeze({ re: /^(?:55)?359918200\d\d$/, excecoes: Object.freeze(['5535991820062']) });

function naFaixa(d) {
  if (!LISTA_NEGRA_FAIXA.re.test(d)) return false;
  const com55 = d.startsWith('55') ? d : `55${d}`;
  return !LISTA_NEGRA_FAIXA.excecoes.includes(com55);
}

/** Só dígitos. */
export function digitos(s) {
  return String(s ?? '').replace(/\D+/g, '');
}

/** Variantes de busca de um número: com DDI, sem DDI e o par DDD+número. */
function variantes(n) {
  const v = new Set([n]);
  if (n.startsWith('55') && n.length >= 12) v.add(n.slice(2));
  return [...v];
}

const reTelefone = /\+?\(?\d[\d\s().-]{6,}\d/g;

/**
 * Procura números da lista negra num texto qualquer (HTML, JSON, CSV).
 * Confere sequências de dígitos isoladas e telefones formatados.
 */
export function numerosProibidosEm(texto) {
  const s = String(texto ?? '');
  const achados = new Set();
  const candidatos = new Set();
  for (const m of s.matchAll(/\d+/g)) candidatos.add(m[0]);
  for (const m of s.matchAll(reTelefone)) candidatos.add(digitos(m[0]));
  for (const c of candidatos) {
    if (naFaixa(c)) achados.add(c.startsWith('55') ? c : `55${c}`);
    for (const proibido of LISTA_NEGRA) {
      for (const v of variantes(proibido)) {
        if (c === v || c === `55${v}`) achados.add(proibido);
      }
    }
  }
  return [...achados];
}

export function estaNaListaNegra(numero) {
  const d = digitos(numero);
  if (naFaixa(d)) return true;
  return LISTA_NEGRA.some((p) => variantes(p).includes(d) || variantes(p).some((v) => `55${v}` === d));
}

/** Índice dos contatos por papel e por número. */
export function indexarContatos(contatosJson) {
  const lista = contatosJson.contatos || contatosJson;
  const porPapel = new Map(lista.map((c) => [c.papel, c]));
  const porNumero = new Map();
  for (const c of lista) if (!porNumero.has(c.numero)) porNumero.set(c.numero, c);
  return { lista, porPapel, porNumero };
}

/**
 * Link wa.me. Falha (lança) se o número não for ativo e linkável em contatos.json
 * ou se estiver na lista negra: é o teste da SPEC 13.3 aplicado na geração.
 */
export function waLink(numero, texto, contatosJson) {
  const d = digitos(numero);
  if (estaNaListaNegra(d)) throw new Error(`Número na lista negra: ${d}`);
  if (contatosJson) {
    const { lista } = indexarContatos(contatosJson);
    const ok = lista.some((c) => c.numero === d && c.status === 'ativo' && c.link_ativo === true);
    if (!ok) throw new Error(`Número sem contato ativo e linkável em contatos.json: ${d}`);
  }
  const t = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${d}${t}`;
}

/** Junta linhas omitindo as vazias (SPEC 10: "Linhas vazias são omitidas"). */
function linhas(arr) {
  return arr.filter((l) => l != null && String(l).trim() !== '').join('\n');
}

/**
 * Mensagem de compra do produto (SPEC 10.2). Todos os valores chegam já lidos dos dados.
 * abertura: prefilled_text literal do papel venda_principal.
 */
export function mensagemCompra({ abertura, nome, sku, tamanho, voltagem, cor, adicionais, dataColeta, somaFormatada, url }) {
  const modelo = nome ? `Modelo: ${nome}${sku ? ` (SKU ${sku})` : ''}` : null;
  return [
    abertura,
    '',
    linhas([
      modelo,
      tamanho ? `Tamanho: ${tamanho}` : null,
      voltagem ? `Voltagem: ${voltagem}` : null,
      cor ? `Cor: ${cor}` : null,
      adicionais && adicionais.length ? `Adicionais: ${adicionais.join(', ')}` : null,
      somaFormatada && dataColeta ? `Valor pelos preços do site em ${dataColeta}: ${somaFormatada}` : null,
      url,
    ]),
  ].join('\n');
}
