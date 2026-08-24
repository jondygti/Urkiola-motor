/**
 * `tsc` solo copia ficheros .ts. El esquema de la base de datos es .sql y
 * se lee en tiempo de ejecución, así que hay que llevarlo a mano al build.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destino = path.join(raiz, 'dist', 'server', 'src', 'almacen');
await mkdir(destino, { recursive: true });
await copyFile(
  path.join(raiz, 'src', 'almacen', 'esquema.sql'),
  path.join(destino, 'esquema.sql')
);
