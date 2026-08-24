/** A quién le llega cada aviso. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { avisosNuevos, idsDestinatarios, enviarAvisos } from '../src/push';
import { servidorDePruebas, cmd, CLAVE } from './ayuda';
import type { NotificationEvent } from '../../src/data/types';

const aviso = (extra: Partial<NotificationEvent> = {}): NotificationEvent => ({
  id: 'nev-1',
  ruleId: 'rule-1',
  vehicleId: null,
  title: 'Logística · aviso',
  body: 'Algo ha pasado',
  at: new Date().toISOString(),
  read: false,
  tone: 'info',
  ...extra,
});

test('un aviso a un grupo va a todos los de ese rol', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const ids = idsDestinatarios(p.servicio.estado, aviso({ title: 'Logística · aviso' }));
  assert.deepEqual(ids, ['u-log']);
});

test('un aviso a una persona va solo a esa persona', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const ids = idsDestinatarios(p.servicio.estado, aviso({ title: 'Juan Bilbao · aviso' }));
  assert.deepEqual(ids, ['u-juan']);
});

test('un destinatario que no se sabe quién es no le llega a nadie', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  assert.deepEqual(idsDestinatarios(p.servicio.estado, aviso({ title: 'Vete a saber · aviso' })), []);
});

test('solo se manda lo que ha generado este comando', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const { user: log } = await p.servicio.login('logistica@urkiolacarservice.com', CLAVE);

  const antes = p.servicio.estado;
  const vehiculo = antes.vehicles.find((v) => v.location?.siteId === 'sondika')!;
  await p.servicio.ejecutar(
    cmd('incident.create', {
      vehicleId: vehiculo.id,
      incidentType: 'campa',
      description: 'Golpe en la puerta',
      photos: [],
    }, { userId: log.id }),
    log
  );

  const nuevos = avisosNuevos(antes, p.servicio.estado);
  assert.ok(nuevos.length <= p.servicio.estado.inbox.length);
  for (const n of nuevos) assert.ok(!antes.inbox.some((x) => x.id === n.id));
});

test('un token que Expo da por muerto se borra', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const { user: log } = await p.servicio.login('logistica@urkiolacarservice.com', CLAVE);
  await p.servicio.registrarTokenPush(log, 'ExponentPushToken[xxxxx]');

  const falso = (async () =>
    new Response(JSON.stringify({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }), {
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

  const almacen = (p.servicio as unknown as { almacen: import('../src/almacen/tipos').Almacen }).almacen;
  const enviados = await enviarAvisos(almacen, p.servicio.estado, [aviso()], falso);
  assert.equal(enviados, 1);
  assert.deepEqual(await almacen.tokensPushDe(['u-log']), []);
});
