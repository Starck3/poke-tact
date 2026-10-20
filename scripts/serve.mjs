import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

export function createAppServer() {
  return createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(root, path === '' ? 'index.html' : path);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    let body;
    try {
      body = await readFile(file); // lê ANTES de enviar cabeçalhos: arquivo ausente vira 404 em vez de derrubar o servidor
    } catch {
      return res.writeHead(404).end('not found');
    }
    // no-cache: o navegador sempre confere a versão — sem isso, depois de uma atualização ele podia juntar o index.html novo
    // com um app.mjs antigo (página quebrada até recarregar com Ctrl+F5)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 5173;
  createAppServer().listen(port, () => console.log(`http://localhost:${port}`));
}
