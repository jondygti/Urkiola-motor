import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { buildSeedState } from '../../src/data/seed';
import { applyCommand, type Command } from '../../src/data/commands';
import type { AppState, Preparation } from '../../src/data/types';
import { comprobarPermiso } from '../src/permisos';
import { leerConfig } from '../src/config';
import { fotosReferenciadas } from '../src/copia-nucleo';
import { crearServidor } from '../src/http';
import { servidorDePruebas, CLAVE } from './ayuda';

const FINAL = {
  frontLeft: 'foto:a.jpg',
  frontRight: 'foto:b.jpg',
  rearLeft: 'foto:c.jpg',
  rearRight: 'foto:d.jpg',
} as const;

let n = 0;
const orden = (userId: string, x: Record<string, unknown>): Command => ({
  id: `preprod-${++n}`,
  at: new Date().toISOString(),
  userId,
  ...x,
}) as Command;

test('un usuario limitado no puede crear un traslado ajeno entre sedes', () => {
  const s = buildSeedState();
  const pedro = s.users.find((u) => u.id === 'u-pedro')!;
  const ajeno = s.vehicles.find((v) => v.location?.siteId === 'irun')!;
  const rechazo = comprobarPermiso(
    s,
    pedro,
    orden(pedro.id, {
      type: 'request.create',
      requestType: 'traslado',
      vehicleId: ajeno.id,
      siteId: 'leioa',
      to: { siteId: 'leioa' },
    })
  );
  assert.match(rechazo ?? '', /fuera de tu ámbito/i);
});

test('el comercial de Leioa conserva el traslado del stock central Sondika a Leioa', () => {
  const s = buildSeedState();
  const juan = s.users.find((u) => u.id === 'u-juan')!;
  const central = s.vehicles.find((v) => v.location?.siteId === 'sondika')!;
  const permiso = comprobarPermiso(
    s,
    juan,
    orden(juan.id, {
      type: 'request.create',
      requestType: 'traslado',
      vehicleId: central.id,
      siteId: 'leioa',
      to: { siteId: 'leioa' },
    })
  );
  assert.equal(permiso, null);
});

test('un usuario limitado no puede cambiar llaves de un coche de otra sede', () => {
  const s = buildSeedState();
  const pedro = s.users.find((u) => u.id === 'u-pedro')!;
  const ajeno = s.vehicles.find((v) => v.location?.siteId === 'irun')!;
  const rechazo = comprobarPermiso(
    s,
    pedro,
    orden(pedro.id, { type: 'vehicle.setKeys', vehicleId: ajeno.id, primary: 'Recepción' })
  );
  assert.match(rechazo ?? '', /ámbito/i);
});

test('el dominio no termina una preparación sin las cuatro fotos finales', () => {
  const s = buildSeedState();
  const abierta = s.preparations.find((p) => p.runState !== 'terminado' && p.runState !== 'cancelado')!;
  const antes = s.preparations.find((p) => p.id === abierta.id)!;
  const despues = applyCommand(s, orden('u-admin', { type: 'prep.finish', prepId: abierta.id }));
  assert.deepEqual(despues.preparations.find((p) => p.id === abierta.id), antes);
});

test('el reportaje final queda en la preparación y un daño abre incidencia atómica', () => {
  const s = buildSeedState();
  const abierta = s.preparations.find((p) => p.runState !== 'terminado' && p.runState !== 'cancelado')!;
  const cmd = orden('u-pedro', {
    type: 'prep.finish',
    prepId: abierta.id,
    finalPhotos: FINAL,
    damageDescription: 'Roce nuevo en puerta trasera derecha',
  });
  const despues = applyCommand(s, cmd);
  const prep = despues.preparations.find((p) => p.id === abierta.id)!;
  assert.equal(prep.runState, 'terminado');
  assert.deepEqual(prep.finalPhotos, FINAL);
  assert.equal(prep.damageIncidentId, `inc-${cmd.id}-damage`);
  const inc = despues.incidents.find((i) => i.id === prep.damageIncidentId)!;
  assert.ok(inc);
  assert.equal(inc.status, 'abierta');
  assert.equal(inc.type, 'preparacion');
  assert.deepEqual(inc.photos, Object.values(FINAL));
  const fotos = prep.items.find((i) => i.requirementId === 'req-fotos')!;
  assert.equal(fotos.state, 'completado');
  assert.equal(fotos.at, cmd.at);
});

test('el backend rechaza referencias foto: que no existen y acepta cuatro fotos reales', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const preparador = p.servicio.estado.users.find(
    (u) => u.role === 'preparador' && p.servicio.estado.preparations.some(
      (prep) => prep.siteId && u.siteIds.includes(prep.siteId) && prep.runState !== 'terminado' && prep.runState !== 'cancelado'
    )
  )!;
  const prep = p.servicio.estado.preparations.find(
    (x) => preparador.siteIds.includes(x.siteId) && x.runState !== 'terminado' && x.runState !== 'cancelado'
  )!;
  assert.ok(prep, 'la semilla necesita una preparación abierta');

  const falso = orden(preparador.id, { type: 'prep.finish', prepId: prep.id, finalPhotos: FINAL });
  await assert.rejects(() => p.servicio.ejecutar(falso, preparador), /Falta una foto/i);

  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    ids.push(await p.servicio.guardarFoto(Buffer.from([137, 80, 78, 71, i]), 'image/png'));
  }
  const reales = {
    frontLeft: `foto:${ids[0]}`,
    frontRight: `foto:${ids[1]}`,
    rearLeft: `foto:${ids[2]}`,
    rearRight: `foto:${ids[3]}`,
  };
  const bueno = orden(preparador.id, { type: 'prep.finish', prepId: prep.id, finalPhotos: reales });
  const res = await p.servicio.ejecutar(bueno, preparador);
  assert.equal(res.repetido, false);
  assert.equal(p.servicio.estado.preparations.find((x) => x.id === prep.id)?.runState, 'terminado');
});

test('producción se niega a arrancar si faltan servicios críticos', () => {
  assert.throws(
    () => leerConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(64), CORS_ORIGEN: 'https://app.example' }),
    /Configuración de producción incompleta/
  );

  const c = leerConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(64),
    CORS_ORIGEN: 'https://app.example',
    DATABASE_URL: 'postgresql://example.invalid/db',
    URKIOLA_SEMILLA: 'vacia',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    PUBLIC_URL: 'https://app.example',
    URKIOLA_ADMIN_EMAIL: 'admin@example.com',
    URKIOLA_ADMIN_PASSWORD: 'una frase de acceso inicial segura',
    EMAIL_API_KEY: 'mail-key',
  });
  assert.equal(c.produccion, true);
  assert.equal(c.semilla, 'vacia');
});

test('el backup incluye reportaje final y normaliza foto:<id>', () => {
  const s = buildSeedState();
  const prep = s.preparations[0]!;
  const estado: AppState = {
    ...s,
    preparations: s.preparations.map((p): Preparation =>
      p.id === prep.id ? { ...p, finalPhotos: FINAL } : p
    ),
  };
  const refs = fotosReferenciadas(estado);
  for (const ref of Object.values(FINAL)) assert.ok(refs.has(ref.slice('foto:'.length)));
  assert.ok(![...refs].some((x) => x.startsWith('foto:')));
});

test('/health devuelve 500 si el almacenamiento esencial deja de responder', async (t) => {
  const p = await servidorDePruebas();
  const original = p.servicio.salud.bind(p.servicio);
  p.servicio.salud = async () => { throw new Error('base caída'); };
  const servidor = crearServidor(p.servicio, p.config);
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    p.servicio.salud = original;
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
    await p.limpiar();
  });
  const port = (servidor.address() as AddressInfo).port;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 500);
});


test('el límite por IP no se esquiva falsificando el primer X-Forwarded-For', async (t) => {
  const p = await servidorDePruebas();
  const servidor = crearServidor(p.servicio, p.config);
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
    await p.limpiar();
  });
  const port = (servidor.address() as AddressInfo).port;
  let ultimo = 0;
  for (let i = 0; i <= 60; i++) {
    const res = await fetch(`http://127.0.0.1:${port}/auth/olvidada`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Cada cliente inventa un primer salto diferente; el proxy de
        // confianza conserva como último la dirección real.
        'X-Forwarded-For': `203.0.113.${i % 250}, 198.51.100.77`,
      },
      body: JSON.stringify({ email: `nadie-${i}@example.invalid` }),
    });
    ultimo = res.status;
  }
  assert.equal(ultimo, 429);
});
