import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { applyCommand, motivoAsignacionPreparacion } from '../../src/data/commands';
import { comprobarPermiso } from '../src/permisos';
import { cmd, servidorDePruebas } from './ayuda';

function escenario() {
  let s = buildSeedState(); s.requests = []; s.preparations = [];
  const v = s.vehicles[0];
  s = applyCommand(s, cmd('request.create', { requestType: 'preparacion', vehicleId: v.id, siteId: 'leioa' }));
  s = applyCommand(s, cmd('prep.create', { vehicleId: v.id, siteId: 'leioa', preparerId: null }));
  return s;
}

test('empezar una preparación libre la asigna al actor y enlaza la solicitud', () => {
  const s = escenario(); const p = s.preparations[0];
  const t = applyCommand(s, cmd('prep.start', { prepId: p.id }, { userId: 'u-pedro' }));
  assert.equal(t.preparations[0].preparerId, 'u-pedro');
  assert.equal(t.requests[0].assignedTo, 'u-pedro');
});

test('un compañero no puede modificar el trabajo asignado a otro', () => {
  const s = escenario(); s.preparations[0].preparerId = 'u-pedro';
  const ane = s.users.find(u => u.id === 'u-ane')!;
  const c = cmd('prep.start', { prepId: s.preparations[0].id }, { userId: ane.id });
  assert.ok(comprobarPermiso(s, ane, c));
  assert.deepEqual(applyCommand(s, c), s);
});

test('todos los comandos de trabajo rechazan a otro preparador sin quitar control al administrador', () => {
  const s = escenario(); const p = s.preparations[0]; p.preparerId = 'u-pedro';
  const ane = s.users.find(u => u.id === 'u-ane')!;
  const log = s.users.find(u => u.id === 'u-admin')!;
  for (const type of ['prep.start', 'prep.pause', 'prep.resume', 'prep.item', 'prep.finish'] as const) {
    const c = cmd(type, { prepId: p.id, requirementId: p.items[0].requirementId, state: 'completado' }, { userId: ane.id });
    assert.ok(comprobarPermiso(s, ane, c), type);
    assert.deepEqual(applyCommand(s, c), s, type);
    assert.equal(motivoAsignacionPreparacion(s, log, c), null, type);
  }
});

test('no se puede robar una solicitud asignada ni asignar a otro compañero al abrir', () => {
  const s = escenario(); s.preparations = [];
  const pedro = s.users.find(u => u.id === 'u-pedro')!;
  const datos = { vehicleId: s.vehicles[0].id, siteId: 'leioa' };
  assert.ok(comprobarPermiso(s, pedro, cmd('prep.create', { ...datos, preparerId: 'u-ane' })));
  s.requests[0].assignedTo = 'u-ane';
  const c = cmd('prep.create', { ...datos, preparerId: pedro.id }, { userId: pedro.id });
  assert.ok(comprobarPermiso(s, pedro, c));
  assert.deepEqual(applyCommand(s, c), s);
});

test('Backend: dos preparadores intentan coger el mismo trabajo; solo uno gana, con reintento idempotente', async t => {
  const p = await servidorDePruebas(); t.after(() => p.limpiar());
  const s = p.servicio;
  s.estado.requests = []; s.estado.preparations = [];
  const pedro = s.estado.users.find(u => u.id === 'u-pedro')!;
  const ane = s.estado.users.find(u => u.id === 'u-ane')!;
  const jon = s.estado.users.find(u => u.id === 'u-jon')!;
  const log = s.estado.users.find(u => u.id === 'u-log')!;
  const v = s.estado.vehicles[0]; v.targetSiteId = 'leioa';
  await s.ejecutar(cmd('request.create', { requestType: 'preparacion', vehicleId: v.id, siteId: 'leioa' }), log);
  assert.equal(s.estadoDe(pedro).requests.length, 1);
  assert.equal(s.estadoDe(ane).requests.length, 1);
  assert.equal(s.estadoDe(jon).requests.length, 0);
  const crear = cmd('prep.create', { vehicleId: v.id, siteId: 'leioa', preparerId: null });
  const resultados = await Promise.allSettled([s.ejecutar(crear, pedro),
    s.ejecutar(cmd('prep.create', { vehicleId: v.id, siteId: 'leioa', preparerId: ane.id }), ane)]);
  assert.equal(resultados[0].status, 'fulfilled');
  assert.equal(resultados[1].status, 'rejected');
  assert.equal(s.estado.preparations.length, 1);
  assert.equal(s.estado.preparations[0].preparerId, pedro.id);
  assert.equal(s.estadoDe(ane).preparations.length, 0);
  assert.equal(s.estadoDe(ane).requests.length, 0);
  assert.equal(s.estadoDe(log).preparations.length, 1);
  assert.equal((await s.ejecutar(crear, pedro)).repetido, true);
  const inicio = cmd('prep.start', { prepId: s.estado.preparations[0].id });
  await assert.rejects(s.ejecutar(inicio, ane));
  await s.ejecutar(inicio, pedro);
  assert.equal(s.estadoDe(pedro).preparations[0].runState, 'en_curso');
});

test('Backend: reclamar una preparación abierta sin dueño también es exclusivo', async t => {
  const p = await servidorDePruebas(); t.after(() => p.limpiar());
  const s = p.servicio;
  const base = escenario(); s.estado.requests = base.requests; s.estado.preparations = base.preparations;
  const pedro = s.estado.users.find(u => u.id === 'u-pedro')!;
  const ane = s.estado.users.find(u => u.id === 'u-ane')!;
  const resultados = await Promise.allSettled([s.ejecutar(cmd('prep.start', { prepId: base.preparations[0].id }), pedro),
    s.ejecutar(cmd('prep.start', { prepId: base.preparations[0].id }), ane)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(s.estado.preparations[0].preparerId, pedro.id);
  assert.equal(s.estado.requests[0].assignedTo, pedro.id);
});
