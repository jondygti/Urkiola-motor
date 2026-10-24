/**
 * Lo que la plataforma hace sola para que no dependa de que alguien se
 * acuerde: el traslado que se pide con la preparación, el paso de logística
 * antes de que el transportista vea un traslado y tres avisos del reloj.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { applyCommand } from '../../src/data/commands';
import { myTransfers } from '../../src/data/selectors';
import { AVISOS_DE_SERIE, ofrecerAvisosDeSerie } from '../../src/data/avisos';
import type { AppState, Vehicle } from '../../src/data/types';
import { estadoParaColaborador } from '../src/recorte';
import { cmd } from './ayuda';

const HORA = 3_600_000;
const DIA = 24 * HORA;
const ahora = Date.parse('2026-10-20T08:00:00.000Z');
const en = (ms: number) => new Date(ahora + ms).toISOString();

/** Un solo coche, en Sondika, vendido por Juan Bilbao. */
function base(patch: Partial<Vehicle> = {}): AppState {
  const s = buildSeedState();
  const v: Vehicle = {
    ...s.vehicles.find((x) => x.type === 'VN')!,
    id: 'v-AUTO0001',
    vin8: 'AUTO0001',
    status: 'aparcado',
    logisticActive: true,
    location: { siteId: 'sondika' },
    targetSiteId: null,
    salesRep: 'Juan Bilbao',
    salesRepId: 'u-juan',
    deliveryDate: null,
    deliveredAt: null,
    deliveredBy: null,
    ...patch,
  };
  return { ...s, vehicles: [v], requests: [], preparations: [], inbox: [], events: [] };
}

const pedirPreparacion = (s: AppState, extra: Record<string, unknown> = {}, id = 'cmd-prep-auto') =>
  applyCommand(s, cmd('request.create', {
    requestType: 'preparacion', vehicleId: 'v-AUTO0001', siteId: 'leioa', to: { siteId: 'leioa' }, ...extra,
  }, { id, at: en(0), userId: 'u-juan' }));

const barrer = (s: AppState, at: string, id = `barrido-${at}`) =>
  applyCommand(s, cmd('alerts.sweep', {}, { id, at, userId: 'u-log' }));

const avisosDe = (s: AppState, texto: string) => s.inbox.filter((n) => n.body.includes(texto));

/* ------------------------------------------- traslado con la preparación */

test('pedir la preparación de un coche que está en otra sede pide también su traslado', () => {
  const s = pedirPreparacion(base());
  const prep = s.requests.find((r) => r.type === 'preparacion')!;
  const traslado = s.requests.find((r) => r.type === 'traslado')!;

  assert.ok(traslado, 'tenía que crear el traslado');
  assert.equal(s.requests[0].id, prep.id, 'la preparación sigue siendo lo último pedido');
  assert.equal(traslado.id, 'req-cmd-prep-auto-traslado', 'id derivado del comando');
  assert.equal(traslado.conPreparacion, prep.id);
  assert.equal(traslado.from?.siteId, 'sondika');
  assert.equal(traslado.to?.siteId, 'leioa');
  assert.equal(traslado.carrierId, 'gruas-francis', 'empresa propuesta por la ruta');
  assert.equal(traslado.keysReadyAt ?? null, null, 'queda para que logística lo revise');
  assert.equal(s.vehicles[0].status, 'traslado_solicitado');
});

test('repetir la petición no duplica el traslado', () => {
  const una = pedirPreparacion(base());
  const dos = pedirPreparacion(una);
  assert.deepEqual(dos, una);
});

test('sin traslado si ya está en la sede, si es un repaso o si ya tiene uno abierto', () => {
  const enLeioa = pedirPreparacion(base({ location: { siteId: 'leioa' } }));
  assert.equal(enLeioa.requests.filter((r) => r.type === 'traslado').length, 0);

  const repaso = pedirPreparacion(base(), { prepTipo: 'repaso' });
  assert.equal(repaso.requests.filter((r) => r.type === 'traslado').length, 0);

  let conTraslado = applyCommand(base(), cmd('request.create', {
    requestType: 'traslado', vehicleId: 'v-AUTO0001', siteId: 'galdakao', to: { siteId: 'galdakao' }, carrierId: 'gruas-francis',
  }, { at: en(0) }));
  conTraslado = pedirPreparacion(conTraslado);
  assert.equal(conTraslado.requests.filter((r) => r.type === 'traslado').length, 1, 'no pisa el que ya había');
});

/* ----------------------------------------------- listo para enviar */

test('el transportista no ve el traslado hasta que logística lo da por listo para enviar', () => {
  let s = pedirPreparacion(base());
  const traslado = s.requests.find((r) => r.type === 'traslado')!;
  const iker = s.users.find((u) => u.id === 'u-iker')!;

  assert.equal(myTransfers(s, 'u-iker').length, 0);
  assert.equal(estadoParaColaborador(s, iker).requests.length, 0, 'ni siquiera le llega');
  assert.equal(estadoParaColaborador(s, iker).vehicles.length, 0);

  s = applyCommand(s, cmd('request.update', { requestId: traslado.id, status: 'asignada' }, { at: en(HORA) }));
  assert.equal(s.requests.find((r) => r.id === traslado.id)?.keysReadyAt, en(HORA));
  assert.equal(myTransfers(s, 'u-iker').length, 1);
  assert.equal(estadoParaColaborador(s, iker).requests.length, 1);
});

/* ------------------------------------------------------- avisos del reloj */

test('entrega en 4 días sin preparación pedida: aviso al comercial, una sola vez', () => {
  let s = base({ deliveryDate: en(3 * DIA) });
  s = barrer(s, en(0));
  const avisos = avisosDe(s, 'no tiene pedida la preparación');
  assert.equal(avisos.length, 1);
  assert.deepEqual(avisos[0].userIds, ['u-juan']);

  s = barrer(s, en(2 * HORA));
  assert.equal(avisosDe(s, 'no tiene pedida la preparación').length, 1, 'no se repite');
});

test('sin aviso si la entrega queda lejos o la preparación ya está pedida', () => {
  const lejos = barrer(base({ deliveryDate: en(6 * DIA) }), en(0));
  assert.equal(avisosDe(lejos, 'no tiene pedida la preparación').length, 0);

  const pedida = barrer(pedirPreparacion(base({ deliveryDate: en(3 * DIA) })), en(0));
  assert.equal(avisosDe(pedida, 'no tiene pedida la preparación').length, 0);
});

test('preparación con menos de 12 h y sin empezar: a los preparadores de esa sede y a logística', () => {
  let s = pedirPreparacion(base({ location: { siteId: 'leioa' }, deliveryDate: en(10 * HORA) }));
  s = barrer(s, en(0));
  const avisos = avisosDe(s, 'todavía no se ha empezado');
  const destinatarios = new Set(avisos.flatMap((a) => a.userIds ?? []));
  assert.ok(destinatarios.has('u-pedro') && destinatarios.has('u-ane'), 'los de Leioa');
  assert.ok(!destinatarios.has('u-jon'), 'a uno de Anoeta e Irun no le sirve');
  assert.ok(destinatarios.has('u-log'), 'y a logística');

  s = barrer(s, en(HORA));
  assert.equal(avisosDe(s, 'todavía no se ha empezado').length, avisos.length, 'una vez por preparación');
});

test('una preparación empezada no está en riesgo', () => {
  let s = pedirPreparacion(base({ location: { siteId: 'leioa' }, deliveryDate: en(10 * HORA) }));
  s = applyCommand(s, cmd('prep.create', { vehicleId: 'v-AUTO0001', siteId: 'leioa', preparerId: 'u-pedro' }, { id: 'abrir', at: en(0), userId: 'u-log' }));
  s = applyCommand(s, cmd('prep.start', { prepId: 'prep-abrir' }, { at: en(0), userId: 'u-pedro' }));
  s = barrer(s, en(HORA));
  assert.equal(avisosDe(s, 'todavía no se ha empezado').length, 0);
});

test('dos días después de la entrega sin marcarla: recordatorio al comercial', () => {
  let s = base({ deliveryDate: en(-3 * DIA) });
  s = barrer(s, en(0));
  const avisos = avisosDe(s, 'sigue sin marcarse como entregado');
  assert.equal(avisos.length, 1);
  assert.deepEqual(avisos[0].userIds, ['u-juan']);

  const recien = barrer(base({ deliveryDate: en(-1 * DIA) }), en(0));
  assert.equal(avisosDe(recien, 'sigue sin marcarse como entregado').length, 0, 'todavía no');

  const entregado = barrer(base({ deliveryDate: en(-3 * DIA), status: 'entregado', deliveredAt: en(-3 * DIA) }), en(0));
  assert.equal(avisosDe(entregado, 'sigue sin marcarse como entregado').length, 0);
});

/* --------------------------------------------------- avisos de serie */

test('una instalación que ya funcionaba recibe los avisos nuevos una vez, y no vuelven si se borran', () => {
  const antigua: AppState = { ...base(), rules: [], config: { ...base().config, avisosOfrecidos: undefined } };
  let s = barrer(antigua, en(0));
  for (const a of AVISOS_DE_SERIE) assert.ok(s.rules.some((r) => r.id === a.id), a.id);

  s = applyCommand(s, cmd('rule.delete', { ruleId: 'rule-entrega-sin-marcar' }, { at: en(HORA), userId: 'u-admin' }));
  s = barrer(s, en(2 * HORA));
  assert.ok(!s.rules.some((r) => r.id === 'rule-entrega-sin-marcar'), 'borrado se queda borrado');
  assert.deepEqual(ofrecerAvisosDeSerie(s, en(3 * HORA)), s, 'aplicarlo otra vez no cambia nada');
});
