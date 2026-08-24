/**
 * El panel web, servido por la propia API.
 *
 * Sale del mismo dominio que la API, así que no hay CORS que configurar ni
 * un segundo sitio que desplegar. Es opcional: si no hay carpeta compilada,
 * el servidor funciona igual como API a secas.
 *
 * Lo importante está en `enviarIndex`: cuando el fichero no existe hay que
 * devolver `index.html`, no un 404. La app tiene direcciones como
 * `/vehiculo/12345678` que no son ficheros; sin esto, recargar la página en
 * la ficha de un coche da error. Ya pasó una vez.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const TIPOS: Record<string, string> = {
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

export function hayWeb(carpeta: string): boolean {
  return fs.existsSync(path.join(carpeta, 'index.html'));
}

/**
 * Sirve un fichero de la web compilada. Devuelve false si la petición no le
 * corresponde (para que la traten las rutas de la API).
 */
export async function servirWeb(
  carpeta: string,
  ruta: string,
  res: http.ServerResponse
): Promise<boolean> {
  // Nada de subir por el árbol de directorios con «..».
  const destino = path.join(carpeta, path.normalize(ruta));
  if (!destino.startsWith(path.resolve(carpeta))) {
    await enviarIndex(carpeta, res);
    return true;
  }

  try {
    const info = await fsp.stat(destino);
    if (info.isFile()) {
      const cuerpo = await fsp.readFile(destino);
      const tipo = TIPOS[path.extname(destino)] ?? 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': tipo,
        // Los ficheros con huella en el nombre no cambian nunca; el resto
        // se revalida para que un despliegue nuevo llegue enseguida.
        'Cache-Control': destino.includes('/_expo/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(cuerpo);
      return true;
    }
  } catch {
    /* no existe: cae al index */
  }

  await enviarIndex(carpeta, res);
  return true;
}

async function enviarIndex(carpeta: string, res: http.ServerResponse) {
  const index = await fsp.readFile(path.join(carpeta, 'index.html'));
  res.writeHead(200, { 'Content-Type': TIPOS['.html'], 'Cache-Control': 'no-cache' });
  res.end(index);
}
