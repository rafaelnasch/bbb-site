// SPEC 7.2: lê as cotas das plantas oficiais (PDF) com pdfjs-dist, valida contra o rótulo do
// tamanho vendido e grava data/plantas/<sha1>.json.
//
// Leitura: a tabela "Nomenclaturas | Dimensões (m)" impressa na planta dá os pares letra -> valor
// (A a M/A). A posição de cada letra no desenho (fora da tabela) vira coordenada em pixels do PNG
// de 3400 px gerado por media-plantas.mjs, para o marcador do explorador.
//
// Validação automática: A, B e H precisam bater com o rótulo de cada tamanho vendido que aponta
// para a planta, com tolerância de 0,01 m. A e B são comparados como par (o site tem rótulos com
// comprimento e largura trocados); H com a profundidade do rótulo. Rótulo ilegível não valida.
//
// Segunda leitura independente: data/plantas/segunda-leitura.json (leitura visual do PNG por outro
// agente, sem olhar o JSON do pdfjs). Só revisões com independente=true formam a amostra do lote.
// Posições: A, B e H (ou H1/H2) precisam de exatamente uma posição no desenho (glifos soltos são
// juntados em palavras antes, para "VISTA" não virar cota). `validada` = valores conferidos E
// posições únicas; só ela libera tabela clicável e filme. O resto vai para cotas-a-revisar.csv.
// Ligações produto -> PDF sem tamanho correspondente ficam em data/plantas-nao-ligadas.csv.
//
// O nome e o registro da responsável técnica impressos na planta não são transcritos: só letras de
// cota e valores numéricos entram no JSON.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../site.config.mjs';
import { listarPlantas } from './lib/plantas.mjs';

const OUT = join(paths.data, 'plantas');
const PNG_LARGURA = 3400; // mesmo -s do qlmanage em media-plantas.mjs
const TOL = 0.01 + 1e-9;
mkdirSync(OUT, { recursive: true });

// Letras de cota: A..Z, com índice (H1, C2) ou referência (L/A, M/B). A primeira versão, só A a M/A,
// perdia N, O e M/B; a segunda leitura visual pegou a falta.
const reLetra = /^[A-Z]\d?(?:\/[A-Z])?$/;
const reValor = /^\d+,\d+$/;
const num = (s) => Number(String(s).replace(',', '.'));

const meta = JSON.parse(readFileSync(join(paths.data, 'meta.json'), 'utf8'));
const rasterPath = join(paths.public, 'media', 'plantas', 'manifest.json');
const rasterManifest = existsSync(rasterPath) ? JSON.parse(readFileSync(rasterPath, 'utf8')) : null;
const segundaPath = join(OUT, 'segunda-leitura.json');
// Formato: { revisoes: [{ revisor, independente, data, metodo, leituras: { <sha1>: { arquivo, cotas } },
// atestados?: { <sha1>: { arquivo, nota } } }] }. A leitura do próprio construtor fica registrada
// com independente=false e não conta para a amostra do lote (SPEC 7.2 pede um segundo agente).
const segunda = existsSync(segundaPath) ? JSON.parse(readFileSync(segundaPath, 'utf8')) : { revisoes: [] };
const revisoes = segunda.revisoes || [];
// Plantas sem tabela lida pelo pdfjs, classificadas por conferência visual: tabela em contorno
// (existe, leitura manual) ou sem tabela de letras (medidas escritas no desenho).
const semTextoPath = join(OUT, 'tabelas-sem-texto.json');
const semTexto = existsSync(semTextoPath) ? JSON.parse(readFileSync(semTextoPath, 'utf8')) : {};

async function lerPdf(pl) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(pl.arquivo_recon)), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const vp1 = page.getViewport({ scale: 1 });
  // Coordenadas no raster publicado: usa as dimensões reais do PNG do qlmanage (manifesto de
  // media-plantas.mjs); sem o manifesto, a escala teórica de 3400 px no lado maior.
  const real = rasterManifest?.plantas?.[pl.sha1];
  const vp = page.getViewport({ scale: 1 });
  const W = real?.largura_px ?? Math.round((PNG_LARGURA * vp1.width) / Math.max(vp1.width, vp1.height));
  const Hh = real?.altura_px ?? Math.round((PNG_LARGURA * vp1.height) / Math.max(vp1.width, vp1.height));
  const sx = W / vp.width;
  const sy = Hh / vp.height;
  const tc = await page.getTextContent();
  const toPx = (cx, cy) => {
    const [vx, vy] = vp.convertToViewportPoint(cx, cy);
    return [Math.round(vx * sx), Math.round(vy * sy)];
  };
  const itens = tc.items
    .filter((i) => i.str && i.str.trim())
    .map((i) => {
      const [a, b, , , e, f] = i.transform;
      const fs = Math.hypot(a, b);
      const ang = Math.atan2(b, a);
      // centro aproximado do texto em coordenadas do PDF
      const cx = e + (Math.cos(ang) * i.width) / 2 - (Math.sin(ang) * fs * 0.35);
      const cy = f + (Math.sin(ang) * i.width) / 2 + (Math.cos(ang) * fs * 0.35);
      const [px, py] = toPx(cx, cy);
      return { s: i.str.trim(), x: e, y: f, w: i.width, ang, fs, px, py };
    });
  return { itens, tokens: juntarGlifos(itens, toPx), largura_px: W, altura_px: Hh, raster_conferido: Boolean(real), paginas: doc.numPages };
}

// O PDF traz parte do texto do desenho glifo por glifo: a palavra "VISTA" impressa em vertical ao
// lado da planta baixa chega como "V", "I", "S", "T", "A" soltos, e a cota "C1" girada chega como
// "C" e "1". Glifos de um caractere com o mesmo ângulo, o mesmo corpo, na mesma linha de base e
// encostados no sentido da leitura são juntados num token. Assim o "A" e o "I" de VISTA deixam de
// parecer letras de cota, e "C1" volta a ser C1.
function juntarGlifos(itens, toPx) {
  const soltos = itens.filter((i) => i.s.length === 1);
  const resto = itens.filter((i) => i.s.length !== 1).map((i) => ({ s: i.s, px: i.px, py: i.py, itens: [i] }));
  const usados = new Set();
  const tokens = [];
  const ux = (i) => Math.cos(i.ang);
  const uy = (i) => Math.sin(i.ang);
  const ao = (i) => i.x * ux(i) + i.y * uy(i); // posição no sentido da leitura
  const pe = (i) => -i.x * uy(i) + i.y * ux(i); // posição na perpendicular (linha de base)
  const mesmaLinha = (p, q) =>
    Math.abs(p.ang - q.ang) < 0.035 && Math.abs(p.fs - q.fs) < 0.3 && Math.abs(pe(p) - pe(q)) < 0.6;
  const ordem = [...soltos].sort((p, q) => ao(p) - ao(q));
  for (const g of ordem) {
    if (usados.has(g)) continue;
    const run = [g];
    usados.add(g);
    // estende para a frente
    for (;;) {
      const ult = run[run.length - 1];
      const fim = ao(ult) + ult.w;
      const prox = ordem.find((q) => !usados.has(q) && mesmaLinha(ult, q) && ao(q) - fim > -0.8 && ao(q) - fim < 0.45 * ult.fs);
      if (!prox) break;
      run.push(prox);
      usados.add(prox);
    }
    const ini = run[0];
    const fimRun = run[run.length - 1];
    const comp = ao(fimRun) + fimRun.w - ao(ini);
    const cx = ini.x + (ux(ini) * comp) / 2 - uy(ini) * ini.fs * 0.35;
    const cy = ini.y + (uy(ini) * comp) / 2 + ux(ini) * ini.fs * 0.35;
    const [px, py] = toPx(cx, cy);
    tokens.push({ s: run.map((r) => r.s).join(''), px, py, itens: run });
  }
  return [...resto, ...tokens];
}

function extrairTabela(itens) {
  const hn = itens.filter((i) => /^nomenclaturas?$/i.test(i.s));
  const hd = itens.filter((i) => /^dimens(õ|o)es\s*\(m\)$/i.test(i.s));
  if (hn.length !== 1 || hd.length !== 1) return { erro: 'tabela de cotas não encontrada no layout padrão' };
  let [n, d] = [hn[0], hd[0]];
  // Tabela girada (página em retrato com a folha deitada): cabeçalhos na mesma coluna x.
  // Lê no referencial girado: X = -y, Y = x. O item original fica em `o`.
  let base = itens.map((i) => ({ s: i.s, x: i.x, y: i.y, o: i }));
  if (Math.abs(n.y - d.y) > 3 && Math.abs(n.x - d.x) <= 3 && d.y < n.y) {
    base = itens.map((i) => ({ s: i.s, x: -i.y, y: i.x, o: i }));
  }
  n = base.find((b) => b.o === n);
  d = base.find((b) => b.o === d);
  if (Math.abs(n.y - d.y) > 3 || d.x <= n.x) return { erro: 'cabeçalho da tabela fora do padrão' };
  const colLetra = base.filter((i) => reLetra.test(i.s) && i.y < n.y && i.x >= n.x - 5 && i.x < d.x - 5);
  const colValor = base.filter((i) => reValor.test(i.s) && i.y < n.y && i.x >= d.x - 8 && i.x < d.x + 60);
  const pares = [];
  const usados = new Set();
  for (const l of colLetra.sort((p, q) => q.y - p.y)) {
    let melhor = null;
    for (const v of colValor) {
      if (usados.has(v)) continue;
      const dy = Math.abs(v.y - l.y);
      if (dy <= 4 && (!melhor || dy < melhor.dy)) melhor = { v, dy };
    }
    if (melhor) {
      usados.add(melhor.v);
      pares.push({ letra: l.s, valor_texto: melhor.v.s, valor_m: num(melhor.v.s), tabela: l.o });
    }
  }
  const letrasSemValor = colLetra.filter((l) => !pares.some((p) => p.tabela === l.o)).map((l) => l.s);
  const valoresSemLetra = colValor.filter((v) => !usados.has(v)).map((v) => v.s);
  const repetidas = pares.map((p) => p.letra).filter((x, i, a) => a.indexOf(x) !== i);
  return { pares, letrasSemValor, valoresSemLetra, repetidas, naTabela: new Set(colLetra.map((l) => l.o)) };
}

function posicoesNoDesenho(tokens, letra, naTabela) {
  // Ocorrências da letra no desenho: tokens iguais à letra (depois de juntar glifos), menos os da
  // própria tabela. Letra que faz parte de palavra ("VISTA") não é token igual e fica de fora.
  return tokens
    .filter((t) => t.s === letra && !t.itens.some((i) => naTabela.has(i)))
    .map((t) => ({ x: t.px, y: t.py }));
}

// Letras que o filme e a tabela clicável marcam no desenho: A, B e H (ou H1 e H2, quando a planta
// imprime duas alturas). Cada uma precisa de exatamente uma posição no desenho; zero (texto em
// contorno, letra ausente) ou mais de uma (ambígua) manda a planta para revisão.
function conferirPosicoes(cotas) {
  const tem = (l) => cotas.some((c) => c.letra === l);
  const chave = ['A', 'B', ...(tem('H') ? ['H'] : ['H1', 'H2'].filter(tem))];
  const motivos = [];
  for (const l of chave) {
    const c = cotas.find((x) => x.letra === l);
    if (!c) continue; // ausência na tabela já é motivo da validação de valores
    if (c.posicoes.length === 0) motivos.push(`${l} sem posição no desenho`);
    else if (c.posicoes.length > 1) motivos.push(`${l} com ${c.posicoes.length} posições no desenho (ambígua)`);
  }
  return { ok: motivos.length === 0 && chave.length >= 3, letras: chave, motivos };
}

function validar(cotas, usos) {
  const v = (l) => cotas.find((c) => c.letra === l)?.valor_m;
  const A = v('A');
  const B = v('B');
  // H é a profundidade. Plantas sem H e com H1/H2 (duas alturas impressas): o rótulo precisa bater
  // com uma delas. Isto só valida; o site mostra as duas letras como estão na planta.
  const Hs = v('H') != null ? [v('H')] : ['H1', 'H2'].map(v).filter((x) => x != null);
  const motivos = [];
  if (A == null || B == null || !Hs.length) motivos.push('A, B ou H ausente na tabela da planta');
  if (!usos.length) motivos.push('nenhum tamanho vendido aponta para esta planta');
  const conferencias = [];
  for (const u of usos) {
    const r = { slug: u.slug, rotulo: u.rotulo, ok: false, troca_ab: false, legivel: true };
    if (u.a == null || u.b == null || u.c == null) {
      r.legivel = false;
      r.motivo = 'rótulo do tamanho ilegível (não entra na validação)';
    } else if (A != null && B != null && Hs.length) {
      const direto = Math.abs(A - u.a) <= TOL && Math.abs(B - u.b) <= TOL;
      const trocado = Math.abs(A - u.b) <= TOL && Math.abs(B - u.a) <= TOL;
      const h = Hs.some((x) => Math.abs(x - u.c) <= TOL);
      r.ok = (direto || trocado) && h;
      r.troca_ab = !direto && trocado;
      if (!r.ok) r.motivo = `planta A=${A} B=${B} H=${Hs.join('/')} x rótulo ${u.rotulo}`;
    }
    conferencias.push(r);
  }
  const legiveis = conferencias.filter((c) => c.legivel);
  const ok = motivos.length === 0 && legiveis.length > 0 && legiveis.every((c) => c.ok);
  if (!ok) {
    if (usos.length && !legiveis.length) motivos.push('nenhum rótulo legível para conferir');
    for (const c of legiveis) if (!c.ok) motivos.push(`${c.slug}: ${c.motivo || 'não confere'}`);
  }
  return { ok, motivos, conferencias };
}

const plantas = listarPlantas();
const revisar = [];
const resumo = { total: plantas.length, tabela_lida: 0, validacao_automatica: 0, segunda_leitura_conferida: 0, validadas: 0, divergencias_segunda_leitura: 0 };
// `validadas` conta plantas com valores E posições conferidos (as únicas com tabela clicável e filme).
const shasAtuais = new Set();
const registros = [];

for (const pl of plantas) {
  shasAtuais.add(pl.sha1);
  const lido = await lerPdf(pl);
  const tab = extrairTabela(lido.itens);
  let cotas = [];
  let auto = { ok: false, motivos: [], conferencias: [] };
  const avisos = [];
  if (tab.erro) {
    auto.motivos.push(tab.erro);
  } else {
    resumo.tabela_lida++;
    cotas = tab.pares.map((p) => {
      const pos = posicoesNoDesenho(lido.tokens, p.letra, tab.naTabela);
      return {
        letra: p.letra,
        valor_m: p.valor_m,
        valor_texto: p.valor_texto,
        // Posição principal só quando é única; com duas ou mais, nenhuma é escolhida.
        x: pos.length === 1 ? pos[0].x : null,
        y: pos.length === 1 ? pos[0].y : null,
        posicoes: pos,
        tabela_x: p.tabela.px,
        tabela_y: p.tabela.py,
      };
    });
    if (tab.letrasSemValor.length) avisos.push(`letras sem valor na tabela: ${tab.letrasSemValor.join(', ')}`);
    if (tab.valoresSemLetra.length) avisos.push(`valores sem letra na tabela: ${tab.valoresSemLetra.join(', ')}`);
    if (tab.repetidas.length) auto.motivos.push(`letra repetida na tabela: ${tab.repetidas.join(', ')}`);
    const v = validar(cotas, pl.usos);
    auto = { ok: v.ok && !tab.repetidas.length, motivos: [...auto.motivos, ...v.motivos], conferencias: v.conferencias };
    if (auto.ok) resumo.validacao_automatica++;
  }

  // Segunda leitura (visual): compara cada leitura com valores com o que o pdfjs extraiu.
  // Atestado (verificador que conferiu a planta e registrou que os valores batem) conta como
  // conferência independente sem valores transcritos.
  const leiturasDaPlanta = [];
  for (const rv of revisoes) {
    const sl = rv.leituras?.[pl.sha1];
    if (sl) {
      const div = [];
      const lidas = sl.cotas || {};
      for (const c of cotas) {
        if (!(c.letra in lidas)) div.push(`${c.letra}: não lida na segunda leitura`);
        else if (Math.abs(num(lidas[c.letra]) - c.valor_m) > 1e-9) div.push(`${c.letra}: pdf ${c.valor_texto} x visual ${lidas[c.letra]}`);
      }
      for (const l of Object.keys(lidas)) if (!cotas.some((c) => c.letra === l)) div.push(`${l}: só na segunda leitura (${lidas[l]})`);
      leiturasDaPlanta.push({ revisor: rv.revisor, independente: rv.independente === true, data: rv.data, tipo: 'valores', conferida: div.length === 0, divergencias: div });
    }
    const at = rv.atestados?.[pl.sha1];
    if (at) leiturasDaPlanta.push({ revisor: rv.revisor, independente: rv.independente === true, data: rv.data, tipo: 'atestado', conferida: true, divergencias: [], nota: at.nota ?? null });
  }
  let segundaRes = null;
  if (leiturasDaPlanta.length) {
    const div = leiturasDaPlanta.flatMap((x) => x.divergencias.map((d) => `${x.revisor}: ${d}`));
    segundaRes = {
      conferida: div.length === 0,
      independente: leiturasDaPlanta.some((x) => x.independente && x.tipo === 'valores'),
      divergencias: div,
      leituras: leiturasDaPlanta.map(({ revisor, independente, data, tipo, conferida }) => ({ revisor, independente, data, tipo, conferida })),
    };
    resumo.segunda_leitura_conferida++;
    if (div.length) resumo.divergencias_segunda_leitura++;
  }

  const record = {
    sha1: pl.sha1,
    pdf_path: pl.pdf_path,
    nome_arquivo: pl.nome_arquivo,
    fonte: pl.fonte,
    coletado_em: meta.data_coleta ?? null,
    largura_px: lido.largura_px,
    altura_px: lido.altura_px,
    paginas: lido.paginas,
    cotas: cotas.map(({ letra, valor_m, valor_texto, x, y, posicoes, tabela_x, tabela_y }) => ({ letra, valor_m, valor_texto, x, y, posicoes, tabela_x, tabela_y })),
    usos: pl.usos.map((u) => ({ slug: u.slug, rotulo: u.rotulo })),
    validacao_automatica: auto,
    posicoes: tab.erro ? { ok: false, letras: [], motivos: ['sem tabela lida'] } : conferirPosicoes(cotas),
    segunda_leitura: segundaRes,
    avisos,
    sem_texto_extraivel: lido.itens.length === 0,
    valores_validados: false,
    validada: false,
    revisor: null,
  };
  registros.push(record);
}

// Lote: a segunda leitura é amostral (SPEC 7.2). Só leituras independentes com valores transcritos
// formam a amostra. Se qualquer leitura (independente ou não) divergir, nenhuma planta do lote é
// validada e todas vão para revisão. Se a amostra bateu, cada planta com validação automática tem
// os valores validados; `validada` (tabela clicável e filme) exige também a posição única de A, B e H
// no desenho.
const formaDe = (r) => r.usos.map((u) => plantas.find((p) => p.sha1 === r.sha1).usos.find((x) => x.slug === u.slug)).filter((u) => u?.forma).map((u) => `${u.tipo} ${u.forma}`);
const amostra = registros.filter((r) => r.segunda_leitura?.independente);
const formasAmostra = new Set(amostra.flatMap(formaDe));
const formasComTabela = new Set(registros.filter((r) => r.validacao_automatica.ok).flatMap(formaDe));
const formasFaltando = [...formasComTabela].filter((f) => !formasAmostra.has(f));
const algumaDivergencia = registros.some((r) => r.segunda_leitura && !r.segunda_leitura.conferida);
const loteOk = amostra.length >= 20 && !algumaDivergencia && formasFaltando.length === 0;
const revisoresIndep = revisoes.filter((r) => r.independente).map((r) => r.revisor);
resumo.posicoes_ok = 0;
for (const r of registros) {
  const autoOk = r.validacao_automatica.ok;
  r.valores_validados = loteOk && autoOk;
  r.validada = r.valores_validados && r.posicoes.ok;
  if (r.posicoes.ok) resumo.posicoes_ok++;
  r.revisor = r.valores_validados
    ? `pdfjs (leitura automática) + ${r.segunda_leitura?.independente ? 'segunda leitura visual independente desta planta' : 'segunda leitura visual independente por amostra do lote'} (${revisoresIndep.join('; ')})`
    : null;
  if (r.validada) resumo.validadas++;
  const motivos = [];
  if (!autoOk) {
    const semTab = r.validacao_automatica.motivos.includes('tabela de cotas não encontrada no layout padrão');
    const tipo = semTab ? (semTexto.com_tabela_em_contorno?.[r.sha1] ? 'contorno' : semTexto.sem_tabela_de_letras?.[r.sha1] ? 'sem_tabela' : 'nao_conferida') : null;
    r.tabela_sem_texto = tipo;
    if (tipo === 'contorno') motivos.push(`PDF sem texto extraível na tabela (tabela de letras existe em contorno; leitura manual)${r.sem_texto_extraivel ? '; nenhum texto no PDF' : ''}`);
    else if (tipo === 'sem_tabela') motivos.push(`planta sem tabela de letras (medidas escritas direto no desenho)${r.sem_texto_extraivel ? '; texto em contorno' : ''}`);
    else if (tipo === 'nao_conferida') motivos.push('tabela de letras não lida pelo pdfjs e ainda sem conferência visual');
    else motivos.push(...r.validacao_automatica.motivos);
  }
  if (r.segunda_leitura && !r.segunda_leitura.conferida) motivos.push(...r.segunda_leitura.divergencias.map((d) => `segunda leitura: ${d}`));
  if (autoOk && !loteOk) {
    if (amostra.length < 20) motivos.push(`amostra independente da segunda leitura incompleta (${amostra.length} de 20)`);
    if (algumaDivergencia) motivos.push('lote com divergência na segunda leitura');
    if (formasFaltando.length) motivos.push(`formas sem amostra independente: ${formasFaltando.join(', ')}`);
  }
  if (r.valores_validados && !r.posicoes.ok) motivos.push(`valores conferidos, posição no desenho a revisar: ${r.posicoes.motivos.join('; ')}`);
  if (motivos.length) revisar.push({ sha1: r.sha1, pdf_path: r.pdf_path, slugs: [...new Set(r.usos.map((u) => u.slug))].join(' '), motivo: motivos.join(' | ') });
  writeFileSync(join(OUT, `${r.sha1}.json`), JSON.stringify(r, null, 1) + '\n');
}
// Remove JSONs de plantas que saíram do manifesto.
for (const f of readdirSync(OUT)) {
  const m = f.match(/^([0-9a-f]{40})\.json$/);
  if (m && !shasAtuais.has(m[1])) unlinkSync(join(OUT, f));
}
const csvCampo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
writeFileSync(
  join(paths.data, 'cotas-a-revisar.csv'),
  ['sha1,pdf_path,slugs,motivo', ...revisar.map((r) => [r.sha1, r.pdf_path, r.slugs, r.motivo].map(csvCampo).join(','))].join('\n') + '\n',
);
// Ligações produto -> PDF publicadas no site atual que não casaram com nenhum tamanho vendido.
// O PDF continua em d_plantas_sem_tamanho (normalize) e publicado no caminho de sempre; aqui fica o
// registro por produto, com o motivo, para o bloco do produto decidir com a empresa entre mostrar
// como download com as duas medidas lado a lado ou omitir. Nenhuma medida é escolhida.
{
  const produtos = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
  const linhas = [];
  for (const p of produtos) {
    const tams = (p.d_tamanhos || []).map((t) => t.rotulo ?? t.rotulo_ficha).filter(Boolean).join(' ; ');
    const outro = (p.alertas_da_fonte || []).some((a) => a.tipo === 'planta_de_outro_produto');
    for (const item of p.plantas_pdf || []) {
      const nome = decodeURIComponent(new URL(String(item.url).replace(/ /g, '%20')).pathname.split('/').pop());
      const ligado = (p.d_planta || []).some((t) => t.nome_arquivo === nome);
      if (ligado) continue;
      const sobra = (p.d_plantas_sem_tamanho || []).find((f) => f.nome_arquivo === nome);
      const amb = (p.d_planta || []).find((t) => (t.pdf_ambiguo || []).some((x) => x.endsWith('/' + nome)));
      let motivo;
      if (outro) motivo = 'a página atual linka a planta de outro modelo (alerta da fonte); nenhuma planta anexada';
      else if (amb) motivo = `mais de um PDF para o tamanho ${amb.rotulo}; nenhum escolhido`;
      else if (sobra) {
        const medNome = nome.match(/\d+,\d+/g)?.join(' x ') ?? 'sem medida no nome';
        motivo = `medidas no nome do PDF (${medNome}) não batem com nenhum tamanho vendido; mantido em d_plantas_sem_tamanho`;
      } else motivo = 'PDF sem registro no manifesto de imagens';
      linhas.push({ slug: p.slug, nome_arquivo: nome, sha1: sobra?.sha1 ?? null, pdf_path: sobra?.pdf_path ?? null, tamanhos: tams, motivo, decisao: 'pendente com a empresa: mostrar como download com as duas medidas e nota, ou omitir' });
    }
  }
  writeFileSync(
    join(paths.data, 'plantas-nao-ligadas.csv'),
    ['slug,nome_arquivo,sha1,pdf_path,tamanhos_vendidos,motivo,decisao', ...linhas.map((l) => [l.slug, l.nome_arquivo, l.sha1, l.pdf_path, l.tamanhos, l.motivo, l.decisao].map(csvCampo).join(','))].join('\n') + '\n',
  );
  resumo.ligacoes_nao_casadas = linhas.length;
}
resumo.posicoes_conferidas_visualmente = new Set(revisoes.flatMap((r) => Object.keys(r.posicoes_conferidas || {}))).size;
resumo.amostra = amostra.length;
resumo.amostra_revisores = revisoresIndep;
resumo.sem_texto_extraivel = registros.filter((r) => r.sem_texto_extraivel).length;
resumo.tabela_em_contorno = registros.filter((r) => r.tabela_sem_texto === 'contorno').length;
resumo.sem_tabela_de_letras = registros.filter((r) => r.tabela_sem_texto === 'sem_tabela').length;
resumo.tabela_nao_conferida = registros.filter((r) => r.tabela_sem_texto === 'nao_conferida').length;
resumo.formas_na_amostra = [...formasAmostra].sort();
resumo.formas_sem_amostra = formasFaltando;
resumo.lote_ok = loteOk;
resumo.a_revisar = revisar.length;
writeFileSync(join(OUT, '_resumo.json'), JSON.stringify(resumo, null, 1) + '\n');
console.log('cotas:', JSON.stringify(resumo));
