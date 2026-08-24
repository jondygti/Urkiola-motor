/**
 * El panel web servido por la propia API.
 *
 * La comprobación que importa es la última: una dirección que no es un
 * fichero tiene que devolver `index.html`. Sin eso, recargar la página en
 * la ficha de un coche da 404.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { crearServidor } from '../src/http';
import { servidorDePruebas, carpetaTemporal } from './ayuda';

test('sirve la web y devuelve el index para las rutas de la app', async (t) => {
  const web = carpetaTemporal();
  fs.writeFileSync(path.join(web, 'index.html'), '<html>panel</html>');
  fs.mkdirSync(path.join(web, '_expo'), { recursive: true });
  fs.writeFileSync(path.join(web, '_expo', 'app.js'), 'console.log(1)');

  const p = await servidorDePruebas({ carpetaWeb: web });
  const servidor = crearServidor(p.servicio, p.config);
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await new Promise<void>((r) => servidor.close(() => r()));
    await p.limpiar();
    fs.rmSync(web, { recursive: true, force: true });
  });

  const raiz = await fetch(`${base}/`);
  assert.equal(raiz.status, 200);
  assert.match(await raiz.text(), /panel/);

  const recurso = await fetch(`${base}/_expo/app.js`);
  assert.equal(recurso.status, 200);
  assert.match(recurso.headers.get('content-type') ?? '', /javascript/);

  // Esta es la importante: no es un fichero, pero es una pantalla de la app.
  const ficha = await fetch(`${base}/vehiculo/12345678`);
  assert.equal(ficha.status, 200);
  assert.match(await ficha.text(), /panel/);

  // Y la API sigue siendo la API.
  const salud = await fetch(`${base}/health`);
  assert.equal(salud.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await salud.json(), { ok: true });

  // Sin sesión, /state no se convierte en la web: sigue dando 401.
  assert.equal((await fetch(`${base}/state`)).status, 401);
});
