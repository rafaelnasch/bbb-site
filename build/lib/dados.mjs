// Leitura única de data/ para os templates. Nenhum dado da empresa vive em template: tudo sai daqui.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { paths, DATA_COLETA } from '../../site.config.mjs';
import { indexarContatos, waLink } from './wa.mjs';

const cache = new Map();

export function lerJson(nome) {
  if (!cache.has(nome)) {
    const p = join(paths.data, nome);
    cache.set(nome, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return cache.get(nome);
}

let _dados = null;

/** Dados do núcleo visual (cabeçalho, rodapé, gavetas) e acesso aos demais arquivos de data/. */
export function dados() {
  if (_dados) return _dados;
  const contatos = lerJson('contatos.json');
  const empresa = lerJson('empresa.json');
  const lojas = lerJson('lojas.json');
  const categorias = lerJson('categorias.json') || [];
  const meta = lerJson('meta.json') || {};
  if (!contatos || !empresa || !lojas) throw new Error('data/ incompleto: rode npm run normalize');
  const idx = indexarContatos(contatos);
  const catPorPath = new Map(categorias.map((c) => [c.d_path, c]));
  _dados = {
    contatos,
    empresa,
    lojas,
    categorias,
    catPorPath,
    meta,
    dataColeta: DATA_COLETA || meta.data_coleta || null,
    contato(papel) {
      const c = idx.porPapel.get(papel);
      if (!c) throw new Error(`Papel sem contato em contatos.json: ${papel}`);
      return c;
    },
    consultores() {
      return idx.lista
        .filter((c) => /^consultor_\d+$/.test(c.papel) && c.status === 'ativo' && c.link_ativo)
        .sort((a, b) => (a.ordem_rodape ?? 99) - (b.ordem_rodape ?? 99));
    },
    /** Contagem real de uma coleção (total_exibido), ou null se a coleção não existir. */
    contagem(dPath) {
      return catPorPath.get(dPath)?.total_exibido ?? null;
    },
    /**
     * Link wa.me de um papel. Texto padrão = prefilled_text literal do papel (vazio = sem texto).
     * Valida número ativo e fora da lista negra (lança se falhar).
     */
    wa(papel, texto) {
      const c = this.contato(papel);
      const t = texto === undefined ? c.prefilled_text || '' : texto;
      return waLink(c.numero, t, contatos);
    },
    ler: lerJson,
  };
  return _dados;
}
