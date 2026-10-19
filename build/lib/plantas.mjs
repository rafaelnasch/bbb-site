// Fonte única das plantas oficiais (PDF): deduplicadas por sha1 a partir de
// _recon/images-manifest.json, com o caminho do site atual e os rótulos de tamanho
// vendidos que apontam para cada uma (data/produtos.json, campo d_planta).
// Nada aqui é digitado: tudo vem do manifesto e dos dados normalizados.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../../site.config.mjs';

export function pathDoSite(url) {
  const u = new URL(String(url).replace(/ /g, '%20'));
  return decodeURIComponent(u.pathname).replace(/^\/+/, '');
}

/** "plantas/Banheiras/x.pdf" -> "plantas/banheiras/x.pdf" (pasta em minúsculas, nome literal). */
export function pdfPathPublicado(pathSite) {
  return pathSite.replace(/^plantas\/(banheiras|spas)\//i, (m, g) => `plantas/${g.toLowerCase()}/`);
}

export function listarPlantas() {
  const manifest = JSON.parse(readFileSync(join(paths.recon, 'images-manifest.json'), 'utf8'));
  const produtos = JSON.parse(readFileSync(join(paths.data, 'produtos.json'), 'utf8'));
  const porSha = new Map();
  for (const a of manifest.arquivos) {
    if (a.tipo !== 'planta_pdf' || !a.sha1 || !a.arquivo) continue;
    if (!porSha.has(a.sha1)) {
      const site = pathDoSite(a.url_original);
      porSha.set(a.sha1, {
        sha1: a.sha1,
        arquivo_recon: join(paths.recon, a.arquivo),
        fonte: a.url_original,
        pdf_path: pdfPathPublicado(site),
        nome_arquivo: site.split('/').pop(),
        bytes: a.bytes,
        usos: [],
      });
    }
  }
  for (const p of produtos) {
    for (const t of p.d_planta || []) {
      if (!t.sha1 || !porSha.has(t.sha1)) continue;
      const tam = (p.d_tamanhos || []).find((x) => x.rotulo === t.rotulo) || null;
      porSha.get(t.sha1).usos.push({
        slug: p.slug,
        rotulo: t.rotulo,
        a: tam?.a ?? null,
        b: tam?.b ?? null,
        c: tam?.c ?? null,
        medida_confirmada: p.d_medida_confirmada !== false,
        tipo: p.d_tipo,
        forma: p.especificacoes?.Forma ?? null,
      });
    }
  }
  const lista = [...porSha.values()].sort((x, y) => x.pdf_path.localeCompare(y.pdf_path, 'pt-BR'));
  for (const pl of lista) {
    if (!existsSync(pl.arquivo_recon)) throw new Error(`PDF ausente no _recon: ${pl.arquivo_recon}`);
  }
  return lista;
}
