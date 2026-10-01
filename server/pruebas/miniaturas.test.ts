import test from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePruebas, cmd } from './ayuda';
import { crearServidor } from '../src/http';
import type { AddressInfo } from 'node:net';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MINI = Buffer.concat([PNG, Buffer.from('mini')]);

/** Pedro sube una foto de un coche de Leioa y la deja en una incidencia. */
async function fotoDePedro() {
  const p = await servidorDePruebas();
  const s = p.servicio;
  const pedro = s.estado.users.find((u) => u.id === 'u-pedro')!;
  const coche = s.estadoDe(pedro).vehicles.find((v) => v.location?.siteId === 'leioa')!;
  const id = await s.guardarFoto(PNG, 'image/png', pedro);
  await s.ejecutar(
    cmd('incident.create', { vehicleId: coche.id, incidentType: 'recepcion', description: 'Con foto', photos: [`foto:${id}`] }),
    pedro
  );
  return { p, s, pedro, id };
}

test('la miniatura la pone quien subió la foto, y nadie más', async () => {
  const { p, s, pedro, id } = await fotoDePedro();
  try {
    const ane = s.estado.users.find((u) => u.id === 'u-ane')!;
    const admin = s.estado.users.find((u) => u.id === 'u-admin')!;
    // Ni otra preparadora ni el administrador pueden cambiar la imagen que
    // ven los demás en las listas.
    await assert.rejects(() => s.guardarMiniatura(id, MINI, 'image/png', ane), { codigo: 404 });
    await assert.rejects(() => s.guardarMiniatura(id, MINI, 'image/png', admin), { codigo: 404 });
    await s.guardarMiniatura(id, MINI, 'image/png', pedro);
    assert.deepEqual((await s.leerMiniatura(id, pedro)).cuerpo, MINI);
    // Repetir la subida (reintento) no rompe nada.
    await s.guardarMiniatura(id, MINI, 'image/png', pedro);
    assert.deepEqual((await s.leerMiniatura(id, pedro)).cuerpo, MINI);
  } finally {
    await p.limpiar();
  }
});

test('una miniatura no puede ser la foto entera ni cualquier fichero', async () => {
  const { p, s, pedro, id } = await fotoDePedro();
  try {
    await assert.rejects(() => s.guardarMiniatura(id, Buffer.alloc(300 * 1024, 1), 'image/jpeg', pedro), { codigo: 400 });
    await assert.rejects(() => s.guardarMiniatura(id, MINI, 'application/pdf', pedro), { codigo: 400 });
    await assert.rejects(() => s.guardarMiniatura(id, Buffer.alloc(0), 'image/png', pedro), { codigo: 400 });
  } finally {
    await p.limpiar();
  }
});

test('la miniatura se ve con la misma autorización que la foto, y nunca se sirve la original en su lugar', async () => {
  const { p, s, pedro, id } = await fotoDePedro();
  try {
    const transportista = s.estado.users.find((u) => u.id === 'u-iker')!;
    // Sin miniatura: 404, no la original.
    await assert.rejects(() => s.leerMiniatura(id, pedro), { codigo: 404 });
    await s.guardarMiniatura(id, MINI, 'image/png', pedro);
    // Quien no puede ver la incidencia tampoco ve su miniatura.
    await assert.rejects(() => s.leerMiniatura(id, transportista), { codigo: 404 });
    assert.deepEqual(s.crearAccesosMiniatura([id], transportista), {});
    // Pedir la miniatura por su nombre de fichero como si fuera una foto no cuela.
    await assert.rejects(() => s.leerFoto(`${id}.mini`, pedro), { codigo: 404 });
  } finally {
    await p.limpiar();
  }
});

test('los accesos de una lista entera salen de una vez y solo los que tocan', async () => {
  const { p, s, pedro, id } = await fotoDePedro();
  try {
    const accesos = s.crearAccesosMiniatura([id, 'no-existe.png'], pedro);
    assert.deepEqual(Object.keys(accesos), [id]);
    assert.throws(() => s.crearAccesosMiniatura('nada', pedro), { codigo: 400 });
    assert.throws(() => s.crearAccesosMiniatura(Array(201).fill(id), pedro), { codigo: 400 });
  } finally {
    await p.limpiar();
  }
});

test('por la API: subir la miniatura, pedir los accesos y bajarla', async () => {
  const { p, s, id } = await fotoDePedro();
  const http = crearServidor(s, p.config);
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  try {
    const { token } = await s.login('pedro@urkiolacarservice.com', 'urkiola');
    const subir = await fetch(`${base}/fotos/${encodeURIComponent(id)}/miniatura`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body: new Uint8Array(MINI),
    });
    assert.equal(subir.status, 200);

    const accesos = await fetch(`${base}/fotos/miniaturas/acceso`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    const { urls } = (await accesos.json()) as { urls: Record<string, string> };
    assert.match(urls[id], /&m=1$/);

    const mini = await fetch(`${base}${urls[id]}`);
    assert.equal(mini.status, 200);
    assert.deepEqual(Buffer.from(await mini.arrayBuffer()), MINI);

    // La misma capacidad sin `m=1` da la original: es de la misma foto.
    const original = await fetch(`${base}${urls[id].replace('&m=1', '')}`);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), PNG);

    // Sin sesión no se sube nada.
    const anonima = await fetch(`${base}/fotos/${encodeURIComponent(id)}/miniatura`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(MINI),
    });
    assert.equal(anonima.status, 401);
  } finally {
    await new Promise<void>((r) => http.close(() => r()));
    await p.limpiar();
  }
});
