import { crearIdSubida, subidaDelUsuario } from '../src/auth';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { servidorDePruebas, cmd, carpetaTemporal, configPruebas, CorreoDePruebas } from './ayuda';
import { FotosEnFichero, FotosEnSupabase } from '../src/almacen/fotos';
import { AlmacenFichero } from '../src/almacen/fichero';
import { Servicio } from '../src/servicio';
import { crearServidor } from '../src/http';
import type { AddressInfo } from 'node:net';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('conocer una foto ajena no permite incorporarla a una incidencia propia', async () => {
  const p = await servidorDePruebas();
  try {
    const s = p.servicio;
    const admin = s.estado.users.find(u => u.id === 'u-admin')!;
    const preparador = s.estado.users.find(u => u.id === 'u-pedro')!;
    const visibles = s.estadoDe(preparador).vehicles;
    const propio = visibles.find(v => v.location?.siteId === 'leioa')!;
    const ajeno = s.estado.vehicles.find(v => !visibles.some(x => x.id === v.id))!;
    const id = await s.guardarFoto(PNG, 'image/png', admin);
    await s.ejecutar(cmd('incident.create', { vehicleId: ajeno.id, incidentType: 'recepcion', description: 'Privada', photos: [`foto:${id}`] }), admin);
    await assert.rejects(() => s.leerFoto(id, preparador), { codigo: 404 });
    const antes = s.estado.incidents.length;
    await assert.rejects(() => s.ejecutar(cmd('incident.create', { vehicleId: propio.id, incidentType: 'recepcion', description: 'Referencia ajena', photos: [`foto:${id}`] }), preparador), { codigo: 403 });
    assert.equal(s.estado.incidents.length, antes);
    await assert.rejects(() => s.leerFoto(id, preparador), { codigo: 404 });
  } finally { await p.limpiar(); }
});

test('una subida pendiente pertenece a su autor y sigue utilizable tras reiniciar', async () => {
  const p = await servidorDePruebas();
  let reiniciado: Servicio | undefined;
  try {
    const autor = p.servicio.estado.users.find(u => u.id === 'u-pedro')!;
    const otro = p.servicio.estado.users.find(u => u.id === 'u-ane')!;
    const coche = p.servicio.estadoDe(autor).vehicles.find(v => v.location?.siteId === 'leioa')!;
    const id = await p.servicio.guardarFoto(PNG, 'image/png', autor);
    const datos = { vehicleId: coche.id, incidentType: 'recepcion', description: 'Foto pendiente', photos: [`foto:${id}`] };
    await assert.rejects(() => p.servicio.ejecutar(cmd('incident.create', datos), otro), { codigo: 403 });
    reiniciado = await p.reiniciar();
    const orden = cmd('incident.create', datos);
    await reiniciado.ejecutar(orden, autor);
    assert.deepEqual((await reiniciado.leerFoto(id, autor)).cuerpo, PNG);
    assert.equal((await reiniciado.ejecutar(orden, autor)).repetido, true);
  } finally { await reiniciado?.cerrar(); await p.limpiar(); }
});

test('las fotos históricas autorizadas siguen siendo reutilizables', async () => {
  const p = await servidorDePruebas();
  try {
    const s = p.servicio;
    const actor = s.estado.users.find(u => u.id === 'u-pedro')!;
    const coche = s.estadoDe(actor).vehicles.find(v => v.location?.siteId === 'leioa')!;
    const antigua = 'evidencia-historica.png';
    await new FotosEnFichero(p.config.carpetaFotos).guardar(antigua, { cuerpo: PNG, tipo: 'image/png' });
    // Simula una referencia legítima anterior a la incorporación de autoría de subidas.
    s.estado.incidents.push({ id: 'inc-historica', vehicleId: coche.id, type: 'recepcion', description: 'Histórica', photos: [`foto:${antigua}`], status: 'abierta', createdAt: new Date().toISOString(), createdBy: actor.id });
    await s.ejecutar(cmd('incident.create', { vehicleId: coche.id, incidentType: 'recepcion', description: 'Reutilización autorizada', photos: [`foto:${antigua}`] }), actor);
    assert.deepEqual((await s.leerFoto(antigua, actor)).cuerpo, PNG);
  } finally { await p.limpiar(); }
});

for (const status of [429, 500, 503, 403]) {
  test(`Storage ${status} no se confunde con un objeto inexistente`, async () => {
    const fotos = new FotosEnSupabase('https://storage.invalid', 'prueba', 'fotos', async () => new Response('', { status }));
    await assert.rejects(() => fotos.leer('prueba.png'), { codigo: 503 });
  });
}
test('Storage 404 sigue significando objeto inexistente', async () => {
  const fotos = new FotosEnSupabase('https://storage.invalid', 'prueba', 'fotos', async () => new Response('', { status: 404 }));
  assert.equal(await fotos.leer('prueba.png'), null);
});

test('la API conserva el comando para reintentar tras un fallo temporal de Storage', async () => {
  const dir = carpetaTemporal();
  const config = configPruebas();
  let caido = false;
  const fotos = new FotosEnSupabase('https://storage.invalid', 'prueba', 'fotos', async () => new Response(PNG, { status: caido ? 503 : 200, headers: { 'Content-Type': 'image/png' } }));
  const s = await Servicio.crear(new AlmacenFichero(path.join(dir, 'estado.json')), config, fotos, new CorreoDePruebas());
  const http = crearServidor(s, config);
  await new Promise<void>(r => http.listen(0, '127.0.0.1', r));
  try {
    const { user, token } = await s.login('pedro@urkiolacarservice.com', 'urkiola');
    const coche = s.estadoDe(user).vehicles.find(v => v.location?.siteId === 'leioa')!;
    const id = await s.guardarFoto(PNG, 'image/png', user);
    const orden = cmd('incident.create', { vehicleId: coche.id, incidentType: 'recepcion', description: 'Reintento', photos: [`foto:${id}`] });
    const enviar = () => fetch(`http://127.0.0.1:${(http.address() as AddressInfo).port}/commands`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(orden) });
    caido = true;
    const antes = s.estado.incidents.length;
    assert.equal((await enviar()).status, 503);
    assert.equal(s.estado.incidents.length, antes);
    caido = false;
    assert.equal((await enviar()).status, 200);
    assert.equal((await (await enviar()).json() as { repetido: boolean }).repetido, true);
    assert.equal(s.estado.incidents.length, antes + 1);
  } finally {
    await new Promise<void>(r => http.close(() => r()));
    await s.cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('la autoría de una subida no se falsifica cambiando autor, firma o extensión', () => {
  const id = crearIdSubida('u-pedro', 'png', 'secreto-pruebas');
  assert.equal(subidaDelUsuario(id, 'u-pedro', 'secreto-pruebas'), true);
  assert.equal(subidaDelUsuario(id, 'u-ane', 'secreto-pruebas'), false);
  assert.equal(subidaDelUsuario(id, 'u-pedro', 'otro-secreto'), false);
  assert.equal(subidaDelUsuario(id.replace('.png', '.pdf'), 'u-pedro', 'secreto-pruebas'), false);
  assert.equal(subidaDelUsuario(`v1_${'a'.repeat(32)}_${'a'.repeat(43)}.png`, 'u-pedro', 'secreto-pruebas'), false);
});

test('un error de disco no se presenta como una foto inexistente', async () => {
  const dir = carpetaTemporal();
  try {
    fs.mkdirSync(path.join(dir, 'foto.png'));
    await assert.rejects(() => new FotosEnFichero(dir).leer('foto.png'), { code: 'EISDIR' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
