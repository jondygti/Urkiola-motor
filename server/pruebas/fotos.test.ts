/**
 * Las fotos.
 *
 * Lo que importa: que salgan del móvil de quien las hace, que no las vea
 * cualquiera y que no se pueda usar la subida para colar otra cosa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { crearServidor } from '../src/http';
import { FotosEnFichero, FotosEnSupabase } from '../src/almacen/fotos';
import { servidorDePruebas, carpetaTemporal, CLAVE } from './ayuda';

/** Un PNG de 1×1 de verdad, para no inventarse bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function levantar(t: { after: (f: () => unknown) => void }) {
  const p = await servidorDePruebas();
  const servidor = crearServidor(p.servicio, p.config);
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await new Promise<void>((r) => servidor.close(() => r()));
    await p.limpiar();
  });

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'recepcion@urkiolacarservice.com', password: CLAVE }),
  });
  const { token } = (await login.json()) as { token: string };
  return { base, token, p };
}

test('una foto sube y se puede volver a ver igual que se subió', async (t) => {
  const { base, token } = await levantar(t);

  const subida = await fetch(`${base}/fotos`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` },
    body: PNG,
  });
  assert.equal(subida.status, 200);
  const { id } = (await subida.json()) as { id: string };
  assert.match(id, /\.png$/);

  const vuelta = await fetch(`${base}/fotos/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(vuelta.status, 200);
  assert.equal(vuelta.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await vuelta.arrayBuffer()), PNG, 'los bytes son los mismos');
});

test('sin sesión no se ven las fotos, ni se suben', async (t) => {
  const { base, token } = await levantar(t);

  const subida = await fetch(`${base}/fotos`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` },
    body: PNG,
  });
  const { id } = (await subida.json()) as { id: string };

  assert.equal((await fetch(`${base}/fotos/${encodeURIComponent(id)}`)).status, 401, 'sin token, 401');
  assert.equal(
    (await fetch(`${base}/fotos/${encodeURIComponent(id)}?t=inventado`)).status,
    401,
    'con un token inventado, 401'
  );
  assert.equal(
    (await fetch(`${base}/fotos`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: PNG }))
      .status,
    401,
    'tampoco se sube sin sesión'
  );
});

test('la sesión vale también en la dirección, para poder pintarlas', async (t) => {
  const { base, token } = await levantar(t);
  const subida = await fetch(`${base}/fotos`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` },
    body: PNG,
  });
  const { id } = (await subida.json()) as { id: string };

  // Una etiqueta <img> no puede mandar cabeceras: la sesión va en la url.
  const r = await fetch(`${base}/fotos/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`);
  assert.equal(r.status, 200);
});

test('los identificadores no se adivinan', async (t) => {
  const { base, token } = await levantar(t);
  const ids = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${base}/fotos`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` },
      body: PNG,
    });
    ids.add(((await r.json()) as { id: string }).id);
  }
  assert.equal(ids.size, 5, 'cinco subidas, cinco identificadores distintos');
  for (const id of ids) assert.ok(id.length > 30, `${id} es demasiado corto`);

  // Y uno que no existe no dice nada de más.
  assert.equal(
    (await fetch(`${base}/fotos/inventada.png`, { headers: { Authorization: `Bearer ${token}` } })).status,
    404
  );
});

test('no se puede colar cualquier cosa por la subida de fotos', async (t) => {
  const { base, token } = await levantar(t);
  const cabeceras = (tipo: string) => ({ 'Content-Type': tipo, Authorization: `Bearer ${token}` });

  for (const tipo of ['text/html', 'application/javascript', 'application/octet-stream', '']) {
    const r = await fetch(`${base}/fotos`, { method: 'POST', headers: cabeceras(tipo), body: PNG });
    assert.equal(r.status, 400, `${tipo || 'sin tipo'} debería rechazarse`);
  }

  // Y una foto vacía tampoco.
  assert.equal(
    (await fetch(`${base}/fotos`, { method: 'POST', headers: cabeceras('image/png'), body: '' })).status,
    400
  );
});

test('una foto demasiado grande se rechaza', async (t) => {
  const { base, token } = await levantar(t);
  const enorme = Buffer.alloc(9 * 1024 * 1024, 1);
  const r = await fetch(`${base}/fotos`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${token}` },
    body: enorme,
  });
  assert.ok(r.status === 413 || r.status === 400, `esperaba 413 o 400, salió ${r.status}`);
});

test('el almacén en fichero guarda y devuelve lo mismo', async () => {
  const dir = carpetaTemporal();
  const almacen = new FotosEnFichero(dir);
  await almacen.guardar('prueba.png', { cuerpo: PNG, tipo: 'image/png' });

  const leida = await almacen.leer('prueba.png');
  assert.deepEqual(leida?.cuerpo, PNG);
  assert.equal(leida?.tipo, 'image/png');

  await almacen.borrar('prueba.png');
  assert.equal(await almacen.leer('prueba.png'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('el almacén en fichero no deja salirse de su carpeta', async () => {
  const dir = carpetaTemporal();
  const almacen = new FotosEnFichero(path.join(dir, 'fotos'));
  await almacen.guardar('../../fuera.png', { cuerpo: PNG, tipo: 'image/png' });

  assert.equal(fs.existsSync(path.join(dir, 'fuera.png')), false, 'no se escribe fuera de la carpeta');
  assert.ok(fs.existsSync(path.join(dir, 'fotos', 'fuera.png')), 'se queda dentro');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('el almacén de Supabase habla su idioma', async () => {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const falso = (async (url: string | URL | Request, init: RequestInit = {}) => {
    llamadas.push({ url: String(url), init });
    return new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } });
  }) as unknown as typeof fetch;

  const almacen = new FotosEnSupabase('https://xyz.supabase.co', 'clave-de-servicio', 'urkiola-fotos', falso);
  await almacen.guardar('abc.png', { cuerpo: PNG, tipo: 'image/png' });

  const guardar = llamadas[0]!;
  assert.equal(guardar.url, 'https://xyz.supabase.co/storage/v1/object/urkiola-fotos/abc.png');
  assert.equal(guardar.init.method, 'POST');
  const cabeceras = guardar.init.headers as Record<string, string>;
  assert.equal(cabeceras.Authorization, 'Bearer clave-de-servicio');
  assert.equal(cabeceras['Content-Type'], 'image/png');

  const leida = await almacen.leer('abc.png');
  assert.deepEqual(leida?.cuerpo, PNG);
});

test('si Supabase falla al guardar, se entera quien sube', async () => {
  const falso = (async () => new Response('bucket not found', { status: 404 })) as unknown as typeof fetch;
  const almacen = new FotosEnSupabase('https://xyz.supabase.co', 'clave', 'bucket', falso);
  await assert.rejects(() => almacen.guardar('x.png', { cuerpo: PNG, tipo: 'image/png' }));
});
