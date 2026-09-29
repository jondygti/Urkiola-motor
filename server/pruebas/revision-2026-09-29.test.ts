/**
 * Revisión del 29/09/2026: reparto del tiempo al reasignar, historial por
 * coche y día contado en hora de España.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { buildSeedState } from '../../src/data/seed';
import { applyCommand, HISTORIAL_POR_VEHICULO, idCreadoPor } from '../../src/data/commands';
import { productividadPorPreparador, tiempoDePreparador, resumenPreparador } from '../../src/data/selectors';
import { diaEnEspana } from '../../src/data/delivery-date';
import type { AppState, TraceEvent } from '../../src/data/types';
import { estadoPara, historialDeVehiculo } from '../src/recorte';
import { crearServidor } from '../src/http';
import { CLAVE, cmd, servidorDePruebas } from './ayuda';

const T0 = Date.parse('2026-09-28T08:00:00.000Z');
const a = (min: number) => new Date(T0 + min * 60_000).toISOString();
const MIN = 60_000;

/** Pedro abre y empieza una preparación en Leioa a las 08:01. */
function enMarcha() {
  let s = buildSeedState();
  s.requests = [];
  s.preparations = [];
  const v = s.vehicles[0];
  s = applyCommand(s, cmd('request.create', { requestType: 'preparacion', vehicleId: v.id, siteId: 'leioa', to: null }, { at: a(0) }));
  const crear = cmd('prep.create', { vehicleId: v.id, siteId: 'leioa' }, { userId: 'u-pedro', at: a(1) });
  s = applyCommand(s, crear);
  const prepId = idCreadoPor('prep', crear);
  s = applyCommand(s, cmd('prep.start', { prepId }, { userId: 'u-pedro', at: a(1) }));
  return { s, prepId, requestId: s.requests[0].id, vehicleId: v.id };
}

const prep = (s: AppState, id: string) => s.preparations.find((p) => p.id === id)!;

test('reasignar a medias: cada uno se queda con lo que trabajó', () => {
  let { s, prepId, requestId } = enMarcha();
  const reasignar = cmd('request.update', { requestId, status: 'en_curso', assignedTo: 'u-ane' }, { at: a(61) });
  s = applyCommand(s, reasignar);
  // Aplicarlo otra vez (respuesta perdida) no puede volver a partir el tiempo.
  assert.deepEqual(applyCommand(s, reasignar), s);

  assert.equal(prep(s, prepId).preparerId, 'u-ane');
  assert.equal(prep(s, prepId).runState, 'en_curso', 'el cronómetro sigue corriendo para Ane');

  s = applyCommand(s, cmd('prep.pause', { prepId, reason: 'Falta material' }, { userId: 'u-ane', at: a(71) }));
  const p = prep(s, prepId);
  assert.equal(p.effectiveMs, 70 * MIN, 'el total no cambia');
  assert.equal(tiempoDePreparador(p, 'u-pedro').efectivoMs, 60 * MIN);
  assert.equal(tiempoDePreparador(p, 'u-ane').efectivoMs, 10 * MIN);
});

test('la productividad cuenta la terminada a quien la cierra y el tiempo a cada uno', () => {
  let { s, prepId, requestId } = enMarcha();
  s = applyCommand(s, cmd('request.update', { requestId, status: 'en_curso', assignedTo: 'u-ane' }, { at: a(61) }));
  s = applyCommand(s, cmd('prep.finish', {
    prepId,
    finalPhotos: { frontLeft: 'demo://1', frontRight: 'demo://2', rearLeft: 'demo://3', rearRight: 'demo://4' },
  }, { userId: 'u-ane', at: a(91) }));

  const filas = productividadPorPreparador(s.preparations.filter((p) => p.runState === 'terminado'));
  const pedro = filas.find((f) => f.preparerId === 'u-pedro')!;
  const ane = filas.find((f) => f.preparerId === 'u-ane')!;
  assert.equal(pedro.effectiveMs, 60 * MIN);
  assert.equal(pedro.total, 0);
  assert.equal(ane.effectiveMs, 30 * MIN);
  assert.equal(ane.total, 1);
  assert.equal(ane.avgMs, 30 * MIN);
  // «Mi historial» de Ane cuenta solo lo suyo.
  assert.equal(resumenPreparador([prep(s, prepId)], 'u-ane').effectiveMs, 30 * MIN);
});

test('ida y vuelta: Pedro → Ane → Pedro suma los dos tramos de Pedro', () => {
  let { s, prepId, requestId } = enMarcha();
  s = applyCommand(s, cmd('request.update', { requestId, status: 'en_curso', assignedTo: 'u-ane' }, { at: a(21) }));
  s = applyCommand(s, cmd('request.update', { requestId, status: 'en_curso', assignedTo: 'u-pedro' }, { at: a(31) }));
  s = applyCommand(s, cmd('prep.pause', { prepId, reason: 'Comida' }, { userId: 'u-pedro', at: a(41) }));
  const p = prep(s, prepId);
  assert.equal(p.effectiveMs, 40 * MIN);
  assert.equal(tiempoDePreparador(p, 'u-pedro').efectivoMs, 30 * MIN);
  assert.equal(tiempoDePreparador(p, 'u-ane').efectivoMs, 10 * MIN);
});

test('reasignar una preparación sin empezar no le apunta nada a nadie', () => {
  let s = buildSeedState();
  s.requests = [];
  s.preparations = [];
  const v = s.vehicles[0];
  s = applyCommand(s, cmd('request.create', { requestType: 'preparacion', vehicleId: v.id, siteId: 'leioa', to: null }, { at: a(0) }));
  s = applyCommand(s, cmd('prep.create', { vehicleId: v.id, siteId: 'leioa', preparerId: 'u-pedro' }, { at: a(1) }));
  s = applyCommand(s, cmd('request.update', { requestId: s.requests[0].id, status: 'asignada', assignedTo: 'u-ane' }, { at: a(5) }));
  assert.equal(s.preparations[0].preparerId, 'u-ane');
  assert.equal(s.preparations[0].tiempoAnterior, undefined);
});

test('reclamar una preparación en marcha sin dueño no se lleva el tiempo de antes', () => {
  let { s, prepId } = enMarcha();
  // Datos anteriores a la asignación exclusiva: en curso y sin dueño.
  s = {
    ...s,
    preparations: s.preparations.map((p) => (p.id === prepId ? { ...p, preparerId: null } : p)),
    requests: s.requests.map((r) => ({ ...r, assignedTo: null })),
  };
  s = applyCommand(s, cmd('prep.resume', { prepId }, { userId: 'u-ane', at: a(31) }));
  s = applyCommand(s, cmd('prep.pause', { prepId, reason: 'x' }, { userId: 'u-ane', at: a(41) }));
  const p = prep(s, prepId);
  assert.equal(p.preparerId, 'u-ane');
  assert.equal(tiempoDePreparador(p, 'u-ane').efectivoMs, 10 * MIN);
  assert.equal(tiempoDePreparador(p, null).efectivoMs, 30 * MIN, 'lo de antes queda sin dueño');
  const filas = productividadPorPreparador([{ ...p, runState: 'terminado', finishedAt: a(41) }]);
  assert.equal(filas.find((f) => f.preparerId === null)?.effectiveMs, 30 * MIN);
});

/* ------------------------------------------------------------ historial */

function conRuido(s: AppState, n: number, vehicleId: string): AppState {
  let t = s;
  for (let i = 0; i < n; i++) {
    t = applyCommand(t, cmd('vehicle.check', { vehicleId }, { at: a(100 + i) }));
  }
  return t;
}

test('el trasiego de otros coches no borra el historial de uno', () => {
  let s = buildSeedState();
  const [uno, otro] = s.vehicles;
  s = applyCommand(s, cmd('vehicle.check', { vehicleId: uno.id }, { at: a(0) }));
  const antes = s.events.filter((e) => e.vehicleId === uno.id).length;
  assert.ok(antes > 0, 'la comprobación deja apunte');
  s = conRuido(s, 4500, otro.id);
  assert.equal(s.events.filter((e) => e.vehicleId === uno.id).length, antes, 'los apuntes del primero siguen');
  assert.equal(s.events.filter((e) => e.vehicleId === otro.id).length, HISTORIAL_POR_VEHICULO,
    'el que se pasa pierde los suyos más viejos');
});

test('al móvil le llega lo reciente; la ficha pide el historial entero y solo si le toca', () => {
  let s = buildSeedState();
  const leioa = s.vehicles.find((v) => v.location?.siteId === 'leioa')!;
  s = { ...s, events: [] };
  const muchos: TraceEvent[] = [];
  // Suficientes coches distintos para pasar del límite que viaja al móvil.
  for (let i = 0; i < 5000; i++) {
    muchos.push({ id: `ev-r-${i}`, vehicleId: s.vehicles[i % s.vehicles.length].id, kind: 'movimiento',
      title: 'x', detail: '', at: a(i), userId: null });
  }
  s = { ...s, events: muchos.reverse() };
  const admin = s.users.find((u) => u.id === 'u-admin')!;
  const visto = estadoPara(s, admin, false);
  assert.equal(visto.events.length, 4000);
  assert.equal(visto.events[0].at, a(4999), 'lo más reciente primero');

  const completo = historialDeVehiculo(s, admin, false, leioa.id)!;
  assert.equal(completo.length, muchos.filter((e) => e.vehicleId === leioa.id).length);

  const jon = s.users.find((u) => u.id === 'u-jon')!; // Anoeta e Irun
  assert.equal(historialDeVehiculo(s, jon, false, leioa.id), null, 'coche fuera de sus sedes');
  const transportista = s.users.find((u) => u.role === 'transportista')!;
  assert.equal(historialDeVehiculo(s, transportista, true, leioa.id), null, 'el proveedor no recibe historial');
});

test('GET /historial/:id: con sesión y dentro de su ámbito', async (t) => {
  const p = await servidorDePruebas();
  const servidor = crearServidor(p.servicio, p.config);
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  t.after(async () => {
    await new Promise<void>((r) => servidor.close(() => r()));
    await p.limpiar();
  });
  const entrar = async (email: string) => {
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: CLAVE }),
    });
    return ((await r.json()) as { token: string }).token;
  };
  const leioa = p.servicio.estado.vehicles.find((v) => v.location?.siteId === 'leioa')!;

  assert.equal((await fetch(`${base}/historial/${leioa.id}`)).status, 401);

  const admin = await entrar('admin@urkiolacarservice.com');
  const r = await fetch(`${base}/historial/${leioa.id}`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(r.status, 200);
  const { events } = (await r.json()) as { events: TraceEvent[] };
  assert.ok(events.every((e) => e.vehicleId === leioa.id));

  const jon = await entrar('jon@urkiolacarservice.com');
  const fuera = await fetch(`${base}/historial/${leioa.id}`, { headers: { Authorization: `Bearer ${jon}` } });
  assert.equal(fuera.status, 404, 'fuera de su ámbito, lo mismo que si no existiera');
});

/* ------------------------------------------------------------ hora de España */

test('el día se cuenta en hora peninsular española, con cambio de hora', () => {
  assert.equal(diaEnEspana('2026-07-14T22:30:00.000Z'), '2026-07-15', 'verano: 00:30 del 15');
  assert.equal(diaEnEspana('2026-07-14T21:59:00.000Z'), '2026-07-14');
  assert.equal(diaEnEspana('2026-01-10T23:30:00.000Z'), '2026-01-11', 'invierno: 00:30 del 11');
  assert.equal(diaEnEspana('2026-01-10T22:30:00.000Z'), '2026-01-10');
  // 2026: horario de verano del 29/03 01:00 UTC al 25/10 01:00 UTC.
  assert.equal(diaEnEspana('2026-03-29T00:30:00.000Z'), '2026-03-29', 'antes del cambio, +1');
  assert.equal(diaEnEspana('2026-10-24T22:30:00.000Z'), '2026-10-25', 'aún en verano, +2');
  assert.equal(diaEnEspana('2026-10-25T23:30:00.000Z'), '2026-10-26', 'ya en invierno, +1');
  assert.equal(diaEnEspana('2026-09-28'), '2026-09-28', 'fecha sin hora');
});

test('una entrega a las 00:30 de hoy tiene su repaso en el barrido de la mañana', () => {
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'leioa')!;
  s = {
    ...s,
    requests: s.requests.filter((r) => r.vehicleId !== v.id),
    preparations: s.preparations.filter((p) => p.vehicleId !== v.id),
    vehicles: s.vehicles.map((x) => x.id === v.id
      ? { ...x, logisticActive: true, status: 'apto_entrega' as const, deliveryDate: '2026-07-14T22:30:00.000Z' }
      : x),
  };
  // 08:00 del 15 de julio en Bilbao.
  s = applyCommand(s, cmd('alerts.sweep', {}, { at: '2026-07-15T06:00:00.000Z' }));
  assert.ok(s.requests.some((r) => r.vehicleId === v.id && r.prepTipo === 'repaso'), 'se pide el repaso');
});
