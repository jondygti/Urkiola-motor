/** La API por HTTP, tal y como la llama la app. */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { crearServidor } from '../src/http';
import { servidorDePruebas, CLAVE } from './ayuda';
import type { AppState } from '../../src/data/types';

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
  return { base, servicio: p.servicio };
}

const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;

test('/health contesta sin sesión', async (t) => {
  const { base } = await levantar(t);
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await json(r), { ok: true });
});

test('/auth/login devuelve token y usuario', async (t) => {
  const { base } = await levantar(t);
  const r = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@urkiolacarservice.com', password: CLAVE }),
  });
  assert.equal(r.status, 200);
  const cuerpo = (await json(r)) as { token: string; user: { id: string } };
  assert.ok(cuerpo.token.length > 20);
  assert.equal(cuerpo.user.id, 'u-admin');
});

test('con la contraseña mal, 401', async (t) => {
  const { base } = await levantar(t);
  const r = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@urkiolacarservice.com', password: 'no' }),
  });
  assert.equal(r.status, 401);
});

test('/state sin token, 401; con token, el estado', async (t) => {
  const { base } = await levantar(t);
  assert.equal((await fetch(`${base}/state`)).status, 401);

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@urkiolacarservice.com', password: CLAVE }),
  });
  const { token } = (await json(login)) as { token: string };

  const r = await fetch(`${base}/state`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200);
  const estado = (await r.json()) as AppState;
  assert.ok(estado.vehicles.length > 0);
  assert.ok(estado.config.roles.length > 0);
});

test('/commands aplica, repite sin duplicar y rechaza lo que no toca', async (t) => {
  const { base, servicio } = await levantar(t);
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'logistica@urkiolacarservice.com', password: CLAVE }),
  });
  const { token } = (await json(login)) as { token: string };
  const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const vehiculo = servicio.estado.vehicles.find((v) => v.location?.siteId === 'sondika')!;
  const orden = {
    type: 'vehicle.check',
    id: 'cmd-http-1',
    at: new Date().toISOString(),
    userId: 'u-log',
    vehicleId: vehiculo.id,
  };

  const uno = await fetch(`${base}/commands`, { method: 'POST', headers: cabeceras, body: JSON.stringify(orden) });
  assert.equal(uno.status, 200);
  assert.deepEqual(await json(uno), { ok: true, repetido: false });

  const dos = await fetch(`${base}/commands`, { method: 'POST', headers: cabeceras, body: JSON.stringify(orden) });
  assert.equal(dos.status, 200);
  assert.deepEqual(await json(dos), { ok: true, repetido: true });

  // Logística no administra.
  const prohibido = await fetch(`${base}/commands`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      type: 'config.update',
      id: 'cmd-http-2',
      at: new Date().toISOString(),
      userId: 'u-log',
      patch: { staleCheckHours: 1 },
    }),
  });
  assert.equal(prohibido.status, 403);
});

test('un cuerpo que no es JSON da 400, no 500', async (t) => {
  const { base } = await levantar(t);
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@urkiolacarservice.com', password: CLAVE }),
  });
  const { token } = (await json(login)) as { token: string };

  const r = await fetch(`${base}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: 'esto no es json',
  });
  assert.equal(r.status, 400);
});

test('una ruta que no existe da 404', async (t) => {
  const { base } = await levantar(t);
  assert.equal((await fetch(`${base}/lo-que-sea`)).status, 404);
});

test('los comandos se aplican en fila aunque lleguen a la vez', async (t) => {
  const { base, servicio } = await levantar(t);
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'logistica@urkiolacarservice.com', password: CLAVE }),
  });
  const { token } = (await json(login)) as { token: string };
  const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const vehiculo = servicio.estado.vehicles.find((v) => v.location?.siteId === 'sondika')!;
  const ordenes = Array.from({ length: 10 }, (_, i) => ({
    type: 'vehicle.check',
    id: `cmd-paralelo-${i}`,
    at: new Date().toISOString(),
    userId: 'u-log',
    vehicleId: vehiculo.id,
  }));

  const antes = servicio.estado.events.length;
  await Promise.all(
    ordenes.map((o) =>
      fetch(`${base}/commands`, { method: 'POST', headers: cabeceras, body: JSON.stringify(o) })
    )
  );
  // Diez comandos, diez apuntes: ninguno se ha perdido al aplicarse encima
  // de un estado que otro estaba cambiando.
  assert.equal(servicio.estado.events.length, antes + 10);
});
