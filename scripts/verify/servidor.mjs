import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

/**
 * Servidor estático mínimo para las pruebas, sin dependencias.
 *
 * Lo importante es la última línea: si el fichero no existe, devuelve
 * index.html. Sin eso, direcciones como /vehiculo/12345678 dan 404 y las
 * pruebas «pasan» sobre una pantalla que en realidad nunca se ha cargado.
 * Ya ocurrió una vez.
 */
export function servirEstatico(raiz, puerto = 4310) {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const candidato = join(raiz, normalize(url));

    try {
      const info = await stat(candidato);
      if (info.isFile()) {
        const cuerpo = await readFile(candidato);
        res.writeHead(200, { 'Content-Type': TIPOS[extname(candidato)] ?? 'application/octet-stream' });
        res.end(cuerpo);
        return;
      }
    } catch {
      /* no existe: cae al index */
    }

    const index = await readFile(join(raiz, 'index.html'));
    res.writeHead(200, { 'Content-Type': TIPOS['.html'] });
    res.end(index);
  });

  return new Promise((resolve) => {
    server.listen(puerto, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${puerto}`, cerrar: () => server.close() })
    );
  });
}
