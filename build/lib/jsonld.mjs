// Dados estruturados (SPEC 11.2). Um só bloco JSON-LD por página, montado no layout:
// os templates entregam os nós da página (Product, CollectionPage, FAQPage, Store, Article...) e
// consolidar() junta tudo num @graph, troca os nós mínimos de Organization/WebSite pelos completos,
// garante a Organization em todas as páginas e valida a estrutura. Falha de validação derruba o build.
//
// Regras fixas da SPEC: Organization sem taxID e sem legalName (a empresa ainda não disse qual CNPJ
// representa o site), endereço sem postalCode (CEP em conflito na fonte), Product sem aggregateRating,
// sem priceValidUntil e sem shippingDetails; nada de HowTo nem Review agregada.
import { abs, SITE_URL } from './url.mjs';
import { dados } from './dados.mjs';

export const ORG_ID = abs('#org');
export const SITE_ID = abs('#site');

/** "…, Coutinhos, Congonhal-MG" -> { cidade: 'Congonhal', uf: 'MG' } (derivado do endereço literal). */
export function cidadeDaFabrica(endereco) {
  const m = /([^,]+?)\s*-\s*([A-Z]{2})\s*$/.exec(String(endereco || ''));
  return m ? { cidade: m[1].trim(), uf: m[2] } : null;
}

/** "Segunda à Quinta-feira: 07:00 às 17:00 | Sexta-feira: 07:00 às 16:00" -> OpeningHoursSpecification[]. */
export function horarioSchema(literal) {
  const DIA = { segunda: 'Monday', terca: 'Tuesday', quarta: 'Wednesday', quinta: 'Thursday', sexta: 'Friday', sabado: 'Saturday', domingo: 'Sunday' };
  const ORDEM = Object.keys(DIA);
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out = [];
  for (const parte of String(literal || '').split('|')) {
    const m = /^(.*?):\s*(\d{2}:\d{2})\s*(?:às|as|a)\s*(\d{2}:\d{2})/i.exec(parte.trim());
    if (!m) continue;
    const dias = [...norm(m[1]).matchAll(/(segunda|terca|quarta|quinta|sexta|sabado|domingo)/g)].map((x) => x[1]);
    if (!dias.length) continue;
    const lista = dias.length === 2 && /\b(a|à|ate)\b/.test(norm(m[1])) ? ORDEM.slice(ORDEM.indexOf(dias[0]), ORDEM.indexOf(dias[1]) + 1) : dias;
    out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: lista.map((d) => `https://schema.org/${DIA[d]}`), opens: m[2], closes: m[3] });
  }
  return out;
}

/** 5535992194882 -> "+55 35 99219-4882" (formato do schema.org, só a partir do número de contatos.json). */
export function telefoneSchema(n) {
  return /^55(\d{2})(\d{4,5})(\d{4})$/.test(n) ? n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '+55 $1 $2-$3') : `+${n}`;
}

/** Organization completa (SPEC 11.2), só com campos de data/empresa.json e data/contatos.json. */
export function organizacao(D = dados()) {
  const E = D.empresa;
  const local = cidadeDaFabrica(E.endereco_fabrica);
  const ponto = (papel, tipo) => {
    let c;
    try { c = D.contato(papel); } catch { return null; }
    if (!c || c.status !== 'ativo') return null;
    const horas = horarioSchema(E.horario?.literal);
    return { '@type': 'ContactPoint', contactType: tipo, telephone: telefoneSchema(c.numero), areaServed: 'BR', availableLanguage: 'pt-BR', ...(horas.length ? { hoursAvailable: horas } : {}) };
  };
  const fixo = E.telefone_fixo?.tel ? E.telefone_fixo.tel.replace(/^tel:/, '').replace(/^\+55(\d{2})(\d{4})(\d{4})$/, '+55 $1 $2-$3') : null;
  const sameAs = [...(E.redes || []).filter((r) => r.principal).map((r) => r.url), E.reclame_aqui?.url].filter(Boolean);
  const org = {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: E.nome,
    ...(E.alternate_name ? { alternateName: E.alternate_name } : {}),
    url: abs(''),
    logo: { '@type': 'ImageObject', url: abs('brand/logo-bbb-azul-oficial-206x99.png'), width: 206, height: 99 },
    ...(E.emails?.find((e) => /^sac@/.test(e.email)) ? { email: E.emails.find((e) => /^sac@/.test(e.email)).email } : {}),
    ...(fixo ? { telephone: fixo } : {}),
    ...(E.endereco_fabrica ? { address: { '@type': 'PostalAddress', streetAddress: E.endereco_fabrica, ...(local ? { addressLocality: local.cidade, addressRegion: local.uf } : {}), addressCountry: 'BR' } } : {}),
    contactPoint: [ponto('venda_principal', 'sales'), ponto('ajuda', 'customer support'), ponto('sac', 'customer service'), ponto('rastreio', 'order tracking')].filter(Boolean),
    ...(sameAs.length ? { sameAs } : {}),
  };
  return org;
}

/** WebSite; com busca=true, o SearchAction da home (SPEC 11.2). */
export function website(D = dados(), { busca = false } = {}) {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: D.empresa.nome,
    url: abs(''),
    inLanguage: 'pt-BR',
    publisher: { '@id': ORG_ID },
    ...(busca ? { potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${abs('busca.html')}?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } } : {}),
  };
}

/** BreadcrumbList a partir da trilha [{ nome, path }] (o último item pode vir sem path). */
export function breadcrumb(trilha) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trilha.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.nome, ...(t.path != null || t.abs ? { item: t.abs || abs(t.path) } : {}) })),
  };
}

const PROIBIDOS_GLOBAIS = ['aggregateRating', 'review', 'taxID', 'legalName', 'priceValidUntil', 'shippingDetails', 'postalCode'];
const TIPOS_PROIBIDOS = new Set(['HowTo', 'Review', 'AggregateRating']);
const DISP = new Set(['https://schema.org/InStock', 'https://schema.org/OutOfStock', 'https://schema.org/PreOrder', 'https://schema.org/LimitedAvailability']);
const URL_ABS = /^https?:\/\/[^\s"<>]+$/;

function tipos(n) {
  return [].concat(n?.['@type'] || []);
}

function percorrer(v, fn, caminho = '') {
  if (Array.isArray(v)) v.forEach((x, i) => percorrer(x, fn, `${caminho}[${i}]`));
  else if (v && typeof v === 'object') {
    fn(v, caminho);
    for (const [k, x] of Object.entries(v)) percorrer(x, fn, caminho ? `${caminho}.${k}` : k);
  }
}

/**
 * Valida um bloco JSON-LD já consolidado ({ @context, @graph }). Devolve a lista de erros (vazia = ok).
 * Cobre os campos obrigatórios e recomendados que a SPEC 11.2 e as diretrizes de resultado rico pedem.
 */
export function validarJsonLd(bloco, { semImagem = false } = {}) {
  const erros = [];
  const e = (m) => erros.push(m);
  if (bloco?.['@context'] !== 'https://schema.org') e('@context diferente de https://schema.org');
  const grafo = bloco?.['@graph'];
  if (!Array.isArray(grafo) || !grafo.length) { e('sem @graph'); return erros; }
  const ids = new Map();
  for (const n of grafo) {
    if (!n['@type']) e(`nó sem @type: ${JSON.stringify(n).slice(0, 80)}`);
    if (n['@id']) {
      if (ids.has(n['@id'])) e(`@id repetido no grafo: ${n['@id']}`);
      ids.set(n['@id'], n);
    }
  }
  // Referências {"@id"} sozinhas precisam resolver dentro da própria página ou ser URL absoluta do site.
  percorrer(grafo, (o, cam) => {
    for (const t of tipos(o)) if (TIPOS_PROIBIDOS.has(t)) e(`${cam}: tipo proibido ${t}`);
    for (const k of PROIBIDOS_GLOBAIS) if (k in o) e(`${cam}: campo proibido ${k}`);
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === null || v === '') e(`${cam}.${k} vazio`);
      if (['url', 'item', 'logo', 'hasMap', 'mainEntityOfPage'].includes(k) && typeof v === 'string' && !URL_ABS.test(v)) e(`${cam}.${k} não é URL absoluta: ${v}`);
    }
    const ks = Object.keys(o);
    // Referência a nó de outra página do site (versões irmãs) é válida; fora disso, o nó tem de estar no grafo.
    if (ks.length === 1 && ks[0] === '@id' && !ids.has(o['@id']) && !o['@id'].startsWith(`${SITE_URL}/`)) e(`${cam}: referência sem nó no grafo: ${o['@id']}`);
  });
  const temOrg = grafo.some((n) => tipos(n).includes('Organization') && n['@id'] === ORG_ID);
  if (!temOrg) e('sem Organization');
  for (const n of grafo) {
    const t = tipos(n);
    if (t.includes('Organization')) {
      for (const k of ['name', 'url', 'logo', 'address', 'contactPoint']) if (!n[k]) e(`Organization sem ${k}`);
    }
    if (t.includes('Product')) {
      for (const k of ['name', 'sku', 'url', 'description', 'brand', 'offers']) if (!n[k]) e(`Product sem ${k}`);
      if (!semImagem && !(Array.isArray(n.image) ? n.image.length : n.image)) e('Product sem image');
      for (const i of [].concat(n.image || [])) if (!URL_ABS.test(i)) e(`Product.image não absoluta: ${i}`);
      const of = n.offers || {};
      const ot = tipos(of);
      if (!ot.includes('Offer') && !ot.includes('AggregateOffer')) e('Product.offers sem Offer/AggregateOffer');
      if (of.priceCurrency !== 'BRL') e('offers.priceCurrency diferente de BRL');
      if (!DISP.has(of.availability)) e(`offers.availability inválida: ${of.availability}`);
      if (ot.includes('AggregateOffer')) {
        for (const k of ['lowPrice', 'highPrice', 'offerCount']) if (!(typeof of[k] === 'number' && of[k] > 0)) e(`AggregateOffer sem ${k} numérico`);
        if (of.lowPrice > of.highPrice) e('AggregateOffer com lowPrice maior que highPrice');
      } else if (!(typeof of.price === 'number' && of.price > 0)) e('Offer sem price numérico');
      if (of.hasMerchantReturnPolicy) {
        const r = of.hasMerchantReturnPolicy;
        if (r.applicableCountry !== 'BR' || !r.returnPolicyCategory || !(r.merchantReturnDays > 0)) e('MerchantReturnPolicy incompleta');
      }
    }
    if (t.includes('ProductGroup')) {
      for (const k of ['name', 'productGroupID', 'variesBy', 'hasVariant']) if (!n[k] || (Array.isArray(n[k]) && !n[k].length)) e(`ProductGroup sem ${k}`);
    }
    if (t.includes('BreadcrumbList')) {
      const it = n.itemListElement || [];
      if (it.length < 2) e('BreadcrumbList com menos de 2 itens');
      it.forEach((x, i) => {
        if (x.position !== i + 1 || !x.name) e(`BreadcrumbList item ${i + 1} incompleto`);
        if (i < it.length - 1 && !x.item) e(`BreadcrumbList item ${i + 1} sem item`);
      });
    }
    if (t.includes('ItemList') || n.mainEntity?.['@type'] === 'ItemList') {
      const l = t.includes('ItemList') ? n : n.mainEntity;
      const it = l.itemListElement || [];
      if (!it.length) e('ItemList vazia');
      it.forEach((x, i) => { if (x.position !== i + 1 || !URL_ABS.test(x.url || '')) e(`ItemList item ${i + 1} sem posição ou URL`); });
      if (l.numberOfItems != null && l.numberOfItems !== it.length) e('ItemList.numberOfItems diferente da lista');
    }
    if (t.includes('FAQPage')) {
      const q = n.mainEntity || [];
      if (!q.length) e('FAQPage sem perguntas');
      for (const x of q) if (x['@type'] !== 'Question' || !x.name || x.acceptedAnswer?.['@type'] !== 'Answer' || !String(x.acceptedAnswer?.text || '').trim()) e('FAQPage com pergunta incompleta');
      if (q.some((x) => /garantia/i.test(`${x.name} ${x.acceptedAnswer?.text}`))) e('FAQPage com item de garantia');
    }
    if (t.includes('Store')) {
      for (const k of ['name', 'address', 'parentOrganization']) if (!n[k]) e(`Store sem ${k}`);
      if ('openingHours' in n || 'openingHoursSpecification' in n) e('Store com horário (SPEC 11.2: sem openingHours)');
    }
    if (t.includes('Article')) {
      for (const k of ['headline', 'author', 'dateModified', 'publisher']) if (!n[k]) e(`Article sem ${k}`);
      if (n.headline && n.headline.length > 110) e('Article.headline acima de 110 caracteres');
      if (n.dateModified && !/^\d{4}-\d{2}-\d{2}/.test(n.dateModified)) e('Article.dateModified fora do formato ISO');
    }
  }
  if (grafo.filter((n) => tipos(n).includes('FAQPage')).length > 1) e('mais de um FAQPage');
  return erros;
}

/**
 * Junta os blocos da página num único { @context, @graph }: achata @graph, troca Organization e
 * WebSite mínimos pelos completos, garante a Organization, une nós repetidos pelo @id e valida.
 * @param {Array} blocos  objetos JSON-LD do template
 * @param {object} op     { saida, semImagem }
 */
export function consolidar(blocos, { saida = '?', semImagem = false, D = dados() } = {}) {
  const nos = [];
  for (const b of blocos || []) {
    if (!b) continue;
    for (const n of b['@graph'] || [b]) {
      const { '@context': _c, ...resto } = n;
      nos.push(resto);
    }
  }
  const org = organizacao(D);
  const temBusca = nos.some((n) => n['@id'] === SITE_ID && n.potentialAction);
  const porId = new Map();
  const grafo = [];
  for (const n of nos) {
    let no = n;
    if (n['@id'] === ORG_ID || (tipos(n).includes('Organization') && !n['@id'])) no = org;
    else if (n['@id'] === SITE_ID || tipos(n).includes('WebSite')) no = website(D, { busca: temBusca });
    const id = no['@id'];
    if (id && porId.has(id)) {
      // mesmo @id duas vezes: une os campos (o primeiro vence em conflito)
      Object.assign(porId.get(id), { ...no, ...porId.get(id) });
      continue;
    }
    const copia = { ...no };
    if (id) porId.set(id, copia);
    grafo.push(copia);
  }
  if (!porId.has(ORG_ID)) grafo.push({ ...org });
  // Ordem estável: nós da página primeiro, Organization e WebSite no fim.
  const peso = (n) => (n['@id'] === ORG_ID ? 2 : n['@id'] === SITE_ID ? 1 : 0);
  grafo.sort((a, b) => peso(a) - peso(b));
  const bloco = { '@context': 'https://schema.org', '@graph': grafo };
  const erros = validarJsonLd(bloco, { semImagem });
  if (erros.length) throw new Error(`JSON-LD de ${saida}: ${erros.join('; ')}`);
  return bloco;
}

/** Serializa para <script type="application/ld+json"> (sem "<" cru, que fecharia o script). */
export function serializar(bloco) {
  return JSON.stringify(bloco).replace(/</g, '\\u003c');
}
