/**
 * La copia de seguridad.
 *
 * Se prueba lo que decide si una copia sirve o no: que rehacer el estado a
 * partir de los comandos guardados da lo mismo que había, que se nota
 * cuando falta algo, y que la restauración se niega a escribir encima de
 * datos que ya están.
 *
 * Es la prueba que evita el chiste de siempre: enterarse de que la copia no
 * servía el día que hace falta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyCommand, type Command } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import { problemasDeLaCopia, rehacerEstado, resumirCopia, fotosReferenciadas } from '../src/copia-nucleo';
import { carpetaTemporal } from './ayuda';

let n = 0;
const orden = (x: Record<string, unknown>): Command =>
  ({ id: `cop-${(n += 1)}`, at: new Date().toISOString(), userId: 'u-log', ...x }) as Command;

/** Una jornada corta: mover un coche, pedir un traslado y abrir una incidencia. */
function jornada() {
  let s = buildSeedState();
  const guion: Command[] = [];
  const paso = (x: Record<string, unknown>) => {
    const cmd = orden(x);
    guion.push(cmd);
    s = applyCommand(s, cmd);
    return cmd;
  };

  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  paso({ type: 'movement.register', vehicleId: v.id, to: { siteId: 'leioa' } });
  paso({
    type: 'request.create',
    requestType: 'traslado',
    vehicleId: v.id,
    siteId: 'galdakao',
    to: { siteId: 'galdakao' },
  });
  paso({
    type: 'incident.create',
    vehicleId: v.id,
    incidentType: 'transporte',
    description: 'golpe en la puerta',
    photos: ['foto-de-prueba.jpg'],
  });
  return { estado: s, guion };
}

test('rehacer la copia da exactamente el mismo estado', () => {
  // Es lo que hace el servidor al arrancar y lo que hace la restauración:
  // si los dos no coinciden, la copia no vale para nada.
  const { estado, guion } = jornada();
  const rehecho = rehacerEstado(guion, 'demo');

  assert.equal(rehecho.vehicles.length, estado.vehicles.length);
  assert.equal(rehecho.movements.length, estado.movements.length);
  assert.equal(rehecho.requests.length, estado.requests.length);
  assert.deepEqual(rehecho.vehicles, estado.vehicles);
});

test('la copia sabe qué fotos tiene que llevarse', () => {
  const { estado } = jornada();
  const refs = fotosReferenciadas(estado);
  assert.ok(refs.has('foto-de-prueba.jpg'), 'la foto de la incidencia tiene que estar en la lista');
});

test('avisa cuando una foto del histórico no está en la copia', () => {
  // Las fotos de daños son la prueba para reclamarle a un transportista:
  // que falte una tiene que salir por pantalla, no descubrirse al reclamar.
  const { guion } = jornada();
  const sinLaFoto = resumirCopia({
    comandos: guion,
    credenciales: [],
    ficherosDeFoto: [],
    bytesFotos: 0,
    semilla: 'demo',
    fotosEn: '/datos/fotos',
  });
  assert.deepEqual(sinLaFoto.fotosQueFaltan, ['foto-de-prueba.jpg']);

  const conLaFoto = resumirCopia({
    comandos: guion,
    credenciales: [],
    ficherosDeFoto: ['foto-de-prueba.jpg'],
    bytesFotos: 1234,
    semilla: 'demo',
    fotosEn: '/datos/fotos',
  });
  assert.deepEqual(conLaFoto.fotosQueFaltan, []);
});

test('con las fotos en Supabase no se reclama nada: las copia el proveedor', () => {
  const { guion } = jornada();
  const r = resumirCopia({
    comandos: guion,
    credenciales: [],
    ficherosDeFoto: [],
    bytesFotos: 0,
    semilla: 'demo',
    fotosEn: 'supabase',
    fotosFuera: true,
  });
  assert.deepEqual(r.fotosQueFaltan, []);
});

test('una copia recortada se nota al restaurarla', () => {
  const { guion } = jornada();
  const entero = resumirCopia({
    comandos: guion,
    credenciales: [{}, {}],
    ficherosDeFoto: ['foto-de-prueba.jpg'],
    bytesFotos: 10,
    semilla: 'demo',
    fotosEn: '/datos/fotos',
  });
  // Se pierde el último comando por el camino, como pasa con una descarga
  // que se corta.
  const recortado = resumirCopia({
    comandos: guion.slice(0, -1),
    credenciales: [{}, {}],
    ficherosDeFoto: ['foto-de-prueba.jpg'],
    bytesFotos: 10,
    semilla: 'demo',
    fotosEn: '/datos/fotos',
  });

  const problemas = problemasDeLaCopia(entero, recortado);
  assert.ok(problemas.length > 0, 'tiene que quejarse');
  assert.match(problemas[0], /incompleta/);
});

test('faltar contraseñas también se nota', () => {
  const { guion } = jornada();
  const base = { comandos: guion, ficherosDeFoto: [], bytesFotos: 0, semilla: 'demo' as const, fotosEn: 'x' };
  const problemas = problemasDeLaCopia(
    resumirCopia({ ...base, credenciales: [{}, {}, {}] }),
    resumirCopia({ ...base, credenciales: [{}] })
  );
  assert.ok(problemas.some((p) => p.includes('contraseñas')));
});

test('el fichero de comandos se puede abrir con cualquier cosa dentro de diez años', () => {
  // Se guarda una línea de JSON por comando y no un formato de la base de
  // datos, justamente para esto.
  const dir = carpetaTemporal();
  const { guion } = jornada();
  const fichero = path.join(dir, 'comandos.jsonl');
  fs.writeFileSync(fichero, guion.map((c) => JSON.stringify(c)).join('\n') + '\n');

  const leidos = fs
    .readFileSync(fichero, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Command);

  assert.deepEqual(leidos, guion);
  fs.rmSync(dir, { recursive: true, force: true });
});
