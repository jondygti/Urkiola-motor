import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState, LIMITES_DIAS } from '../../src/data/seed';
import { diasDelCoche, diasMediosPorSede, limitesDias, requiereAtencionHoy } from '../../src/data/selectors';
import type { AppState, Vehicle } from '../../src/data/types';
import { servidorDePruebas, cmd } from './ayuda';

const AHORA = Date.parse('2026-09-30T10:00:00Z');
const hace = (dias: number, horas = 0) => new Date(AHORA - dias * 86_400_000 - horas * 3_600_000).toISOString();

/** Un coche aparcado, sin nada pedido, con el historial que se le dé. */
function cocheAparcado(s: AppState): Vehicle {
  const v = s.vehicles.find(
    (x) =>
      x.logisticActive &&
      x.status === 'aparcado' &&
      !s.requests.some((r) => r.vehicleId === x.id && r.status !== 'terminada' && r.status !== 'cancelada')
  )!;
  return v;
}

test('en campa se cuenta desde el último movimiento del historial', () => {
  const s = buildSeedState();
  const v = cocheAparcado(s);
  s.movements = s.movements.filter((m) => m.vehicleId !== v.id);
  s.movements.push(
    { id: 'm-viejo', vehicleId: v.id, from: null, to: v.location!, userId: 'u-log', at: hace(40), status: 'completado' },
    { id: 'm-nuevo', vehicleId: v.id, from: null, to: v.location!, userId: 'u-log', at: hace(12), status: 'completado' },
    // Uno planificado no dice que el coche se moviera.
    { id: 'm-plan', vehicleId: v.id, from: null, to: v.location!, userId: 'u-log', at: hace(1), status: 'planificado' }
  );
  const d = diasDelCoche(s, v, AHORA)!;
  assert.equal(d.fase, 'campa');
  assert.equal(d.dias, 12);
  assert.equal(d.pasado, false);
});

test('los días se cuentan en hora de España, no de Greenwich', () => {
  const s = buildSeedState();
  const v = cocheAparcado(s);
  s.movements = s.movements.filter((m) => m.vehicleId !== v.id);
  // Llegó el 29 a las 23:30 en España (21:30 UTC); a la 01:00 del 30 en
  // España ya es «otro día»: un día, no cero.
  s.movements.push({ id: 'm', vehicleId: v.id, from: null, to: v.location!, userId: 'u-log', at: '2026-09-29T21:30:00Z', status: 'completado' });
  assert.equal(diasDelCoche(s, v, Date.parse('2026-09-29T23:00:00Z'))!.dias, 1);
  assert.equal(diasDelCoche(s, v, Date.parse('2026-09-29T21:45:00Z'))!.dias, 0);
});

test('en preparación y esperando traslado se cuenta desde que se pidió', () => {
  const s = buildSeedState();
  const v = cocheAparcado(s);
  s.requests.push({
    ...s.requests.find((r) => r.type === 'preparacion')!,
    id: 'r-prueba',
    vehicleId: v.id,
    status: 'solicitada',
    createdAt: hace(5),
  });
  v.status = 'en_preparacion';
  const d = diasDelCoche(s, v, AHORA)!;
  assert.equal(d.fase, 'preparacion');
  assert.equal(d.dias, 5);
  assert.equal(d.limite, LIMITES_DIAS.preparacion);
  assert.equal(d.pasado, true);

  const r = s.requests.find((x) => x.id === 'r-prueba')!;
  r.type = 'traslado';
  v.status = 'traslado_solicitado';
  assert.equal(diasDelCoche(s, v, AHORA)!.fase, 'traslado');
});

test('un coche entregado o sin actividad no cuenta', () => {
  const s = buildSeedState();
  const v = cocheAparcado(s);
  v.status = 'entregado';
  assert.equal(diasDelCoche(s, v, AHORA), null);
  v.status = 'aparcado';
  v.logisticActive = false;
  assert.equal(diasDelCoche(s, v, AHORA), null);
});

test('«Requiere atención hoy» sale de los límites configurados, lo más pasado arriba', () => {
  const s = buildSeedState();
  const antes = requiereAtencionHoy(s, AHORA).coches.length;
  s.config = { ...s.config, limitesDias: { campa: 3650, preparacion: 3650, traslado: 3650 } };
  assert.equal(requiereAtencionHoy(s, AHORA).coches.length, 0);
  s.config = { ...s.config, limitesDias: { campa: 1, preparacion: 1, traslado: 1 } };
  const muchos = requiereAtencionHoy(s, AHORA);
  assert.ok(muchos.coches.length >= antes);
  const exceso = muchos.coches.map((c) => c.dias.dias - c.dias.limite);
  assert.deepEqual(exceso, [...exceso].sort((a, b) => b - a));
  assert.equal(muchos.incidencias.length, s.incidents.filter((i) => i.status !== 'cerrada').length);
});

test('un estado guardado sin límites usa los de serie', () => {
  const s = buildSeedState();
  const { limitesDias: _, ...sin } = s.config;
  assert.deepEqual(limitesDias({ ...s, config: sin }), LIMITES_DIAS);
});

test('los días medios por sede solo cuentan los coches que están ahí', () => {
  const s = buildSeedState();
  const filas = diasMediosPorSede(s, AHORA);
  const total = filas.reduce((n, f) => n + f.campa.coches + f.preparacion.coches, 0);
  const esperados = s.vehicles.filter((v) => {
    const d = diasDelCoche(s, v, AHORA);
    return !!v.location?.siteId && !!d && d.fase !== 'traslado';
  }).length;
  assert.equal(total, esperados);
});

test('el servidor no acepta límites de días que no son días', async () => {
  const p = await servidorDePruebas();
  try {
    const admin = p.servicio.estado.users.find((u) => u.id === 'u-admin')!;
    for (const malo of [{ campa: 0, preparacion: 3, traslado: 3 }, { campa: 'mucho', preparacion: 3, traslado: 3 }, { campa: 30 }, [30, 3, 3]]) {
      await assert.rejects(() => p.servicio.ejecutar(cmd('config.update', { patch: { limitesDias: malo } }), admin), { codigo: 400 });
    }
    await p.servicio.ejecutar(cmd('config.update', { patch: { limitesDias: { campa: 45, preparacion: 4, traslado: 2 } } }), admin);
    assert.deepEqual(p.servicio.estado.config.limitesDias, { campa: 45, preparacion: 4, traslado: 2 });
    // Y quien no configura no los cambia.
    const log = p.servicio.estado.users.find((u) => u.id === 'u-log')!;
    await assert.rejects(() => p.servicio.ejecutar(cmd('config.update', { patch: { limitesDias: { campa: 1, preparacion: 1, traslado: 1 } } }), log), { codigo: 403 });
  } finally {
    await p.limpiar();
  }
});
