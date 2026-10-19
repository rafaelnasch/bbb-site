// Servidor estático mínimo para os testes de navegador: serve dist/ sob BASE_PATH, como o GitHub Pages
// (inclusive /x servindo x.html e 404.html quando existir). Uso direto: node tests/e2e/servidor.mjs [porta]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('../..', import.meta.url)), 'dist');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

async function arquivo(p) {
  try {
    const s = await stat(p);
    if (s.isDirectory()) return arquivo(join(p, 'index.html'));
    return p;
  } catch {
    return null;
  }
}

export function iniciar({ porta = 0, base = process.env.BASE_PATH ?? '/bbb-site' } = {}) {
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let caminho = decodeURIComponent(u.pathname);
    if (base && !caminho.startsWith(`${base}/`) && caminho !== base) {
      res.writeHead(404).end('fora do BASE_PATH');
      return;
    }
    caminho = caminho.slice(base.length) || '/';
    const alvo = normalize(join(RAIZ, caminho));
    if (!alvo.startsWith(RAIZ)) {
      res.writeHead(403).end();
      return;
    }
    const achado = (await arquivo(alvo)) || (extname(alvo) ? null : await arquivo(`${alvo}.html`));
    if (!achado) {
      const p404 = await arquivo(join(RAIZ, '404.html'));
      res.writeHead(404, { 'content-type': TIPOS['.html'] });
      res.end(p404 ? await readFile(p404) : 'não encontrado');
      return;
    }
    res.writeHead(200, { 'content-type': TIPOS[extname(achado)] || 'application/octet-stream' });
    res.end(await readFile(achado));
  });
  return new Promise((ok) => srv.listen(porta, '127.0.0.1', () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}${base}` })));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await iniciar({ porta: Number(process.argv[2] || 4173) });
  console.log(`servindo dist/ em ${url}/`);
}
