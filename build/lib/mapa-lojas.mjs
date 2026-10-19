// Mapa SVG das lojas na home (SPEC 9.1, seção 9): contorno do Brasil com um ponto por cidade, sem
// iframe e sem recurso de terceiros. Geografia pública, nenhum dado da empresa:
//  - contorno: Natural Earth 1:50m (domínio público), em build/lib/geo/brasil-contorno.json;
//  - cidades: coordenadas aproximadas da sede do município (IBGE). O ponto marca a cidade, não o
//    endereço da loja (o endereço literal fica na página de lojas).
// Cidade nova em data/lojas.json sem coordenada aqui derruba o build (nunca se chuta a posição).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTORNO = JSON.parse(readFileSync(join(AQUI, 'geo', 'brasil-contorno.json'), 'utf8')).poligonos;

// [longitude, latitude, lado do rótulo: e (direita), w (esquerda), n (acima), s (abaixo), ne (acima, à direita)]. Contagem e Belo
// Horizonte ficam a 12 km uma da outra: um rótulo abaixo e o outro acima, para não encostarem.
const CIDADES = Object.freeze({
  'Congonhal/MG': [-46.0425, -22.1488, 'n'],
  'Taubaté/SP': [-45.5553, -23.0264, 'n'],
  'Caraguatatuba/SP': [-45.4131, -23.6203, 's'],
  'Belo Horizonte/MG': [-43.9345, -19.9167, 'n'],
  'Ribeirão Preto/SP': [-47.8103, -21.1775, 'n'],
  'Campinas/SP': [-47.0608, -22.9056, 'w'],
  'Rio de Janeiro/RJ': [-43.1729, -22.9068, 'ne'],
  'Goiânia/GO': [-49.2648, -16.6869, 'e'],
  'Contagem/MG': [-44.0539, -19.932, 's'],
});

// Região ampliada (graus) e escala: 10 unidades por grau, longitude corrigida pelo cosseno de 20° S.
const REGIAO = Object.freeze({ lonMin: -51.4, lonMax: -39.6, latMax: -15.3, latMin: -24.7 });
const K = 10, COS = Math.cos((20 * Math.PI) / 180);
const PAIS = Object.freeze({ lonMin: -74.2, lonMax: -34.6, latMax: 5.4, latMin: -33.9 });

const r1 = (n) => Math.round(n * 10) / 10;

function projetar([lon, lat], caixa) {
  return [(lon - caixa.lonMin) * COS * K, (caixa.latMax - lat) * K];
}

/** Recorte de polígono por retângulo (Sutherland-Hodgman), em graus. */
function recortar(pts, c) {
  const lados = [
    [(p) => p[0] >= c.lonMin, (a, b) => inter(a, b, 0, c.lonMin)],
    [(p) => p[0] <= c.lonMax, (a, b) => inter(a, b, 0, c.lonMax)],
    [(p) => p[1] >= c.latMin, (a, b) => inter(a, b, 1, c.latMin)],
    [(p) => p[1] <= c.latMax, (a, b) => inter(a, b, 1, c.latMax)],
  ];
  let saida = pts;
  for (const [dentro, corte] of lados) {
    const ent = saida;
    saida = [];
    for (let i = 0; i < ent.length; i++) {
      const a = ent[i], b = ent[(i + 1) % ent.length];
      if (dentro(b)) {
        if (!dentro(a)) saida.push(corte(a, b));
        saida.push(b);
      } else if (dentro(a)) saida.push(corte(a, b));
    }
    if (!saida.length) break;
  }
  return saida;
}
function inter(a, b, eixo, v) {
  const t = (v - a[eixo]) / (b[eixo] - a[eixo]);
  return eixo === 0 ? [v, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), v];
}

/** Douglas-Peucker simples para o contorno pequeno do país inteiro. */
function simplificar(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const d = dx === 0 && dy === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.hypot(dx, dy);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return [...simplificar(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplificar(pts.slice(idx), eps)];
}

function caminho(poligonos, caixa) {
  return poligonos
    .filter((p) => p.length >= 3)
    .map((p) => `M${p.map((q) => projetar(q, caixa).map(r1).join(' ')).join('L')}Z`)
    .join('');
}

const tamanho = (c) => [r1((c.lonMax - c.lonMin) * COS * K), r1((c.latMax - c.latMin) * K)];

/**
 * @param lojas  data/lojas.json
 * @returns {{ regiao:{w,h,d}, pais:{w,h,d,caixa:{x,y,w,h}}, pontos:[{loja,x,y,lado}] }}
 *          x e y dos pontos em porcentagem da região (para rótulos em HTML, que não escalam com o SVG).
 */
export function mapaLojas(lojas) {
  const margem = { lonMin: REGIAO.lonMin - 1, lonMax: REGIAO.lonMax + 1, latMin: REGIAO.latMin - 1, latMax: REGIAO.latMax + 1 };
  const recortes = CONTORNO.map((p) => recortar(p, margem)).filter((p) => p.length >= 3);
  const [rw, rh] = tamanho(REGIAO);
  const [pw, ph] = tamanho(PAIS);
  const pontos = lojas.map((l) => {
    const c = CIDADES[`${l.cidade}/${l.uf}`];
    if (!c) throw new Error(`mapa-lojas: sem coordenada para ${l.cidade}/${l.uf} (acrescente em build/lib/mapa-lojas.mjs)`);
    const [x, y] = projetar(c, REGIAO);
    if (x < 0 || y < 0 || x > rw || y > rh) throw new Error(`mapa-lojas: ${l.cidade} fora da região do mapa`);
    return { loja: l, x: r1((x / rw) * 1000) / 10, y: r1((y / rh) * 1000) / 10, lado: c[2] };
  });
  const [cx, cy] = projetar([REGIAO.lonMin, REGIAO.latMax], PAIS);
  const [cw, chh] = tamanho(REGIAO);
  return {
    regiao: { w: rw, h: rh, d: caminho(recortes, REGIAO) },
    pais: {
      w: pw,
      h: ph,
      d: caminho(CONTORNO.filter((p) => p.length > 30).map((p) => simplificar(p, 0.35)), PAIS),
      caixa: { x: r1(cx), y: r1(cy), w: cw, h: chh },
    },
    pontos,
  };
}
