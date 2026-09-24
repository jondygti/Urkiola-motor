import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { applyCommand } from '../../src/data/commands';
import { cmd, servidorDePruebas } from './ayuda';

const fecha = (hora: number) => `2026-09-23T${String(hora).padStart(2, '0')}:00:00.000Z`;
function escenario() {
  let s = buildSeedState();
  s.requests = []; s.preparations = [];
  s.vehicles = [{ ...s.vehicles[0], location: { siteId: 'leioa' }, status: 'aparcado',
    locationObservedAt: fecha(8), lastMovementAt: null, lastCheckAt: null, deliveredAt: null }];
  s = applyCommand(s, cmd('request.create', { requestType: 'traslado', vehicleId: s.vehicles[0].id,
    siteId: 'galdakao', to: { siteId: 'galdakao' }, carrierId: 'gruas-francis' }, { at: fecha(10) }));
  return s;
}

for (const hora of [9, 11]) {
  test(`movimiento offline a las ${hora} no entrega el traslado recogido a las 12`, () => {
    let s = escenario();
    s = applyCommand(s, cmd('request.update', { requestId: s.requests[0].id, status: 'en_ruta' }, { at: fecha(12) }));
    const t = applyCommand(s, cmd('movement.register', { vehicleId: s.vehicles[0].id,
      to: { siteId: 'galdakao' } }, { at: fecha(hora) }));
    assert.equal(t.requests[0].status, 'en_ruta');
    assert.ok(!t.requests[0].deliveredAt);
    assert.equal(t.vehicles[0].location?.siteId, 'galdakao');
  });
}

test('un movimiento anterior a la solicitud tampoco cierra un traslado sin recogida', () => {
  const s = escenario();
  const t = applyCommand(s, cmd('movement.register', { vehicleId: s.vehicles[0].id,
    to: { siteId: 'galdakao' } }, { at: fecha(9) }));
  assert.equal(t.requests[0].status, 'solicitada');
  assert.ok(!t.requests[0].deliveredAt);
});

test('Backend: llegada anterior a la recogida queda abierta y una llegada posterior la completa una sola vez', async () => {
  const p = await servidorDePruebas();
  try {
    const s = p.servicio;
    const log = s.estado.users.find(u => u.id === 'u-log')!;
    const v = s.estado.vehicles[0];
    const ahora = Date.now();
    const at = (minutos: number) => new Date(ahora + minutos * 60_000).toISOString();
    s.estado.requests = []; s.estado.preparations = [];
    v.location = { siteId: 'leioa' }; v.locationObservedAt = at(-60);
    v.lastMovementAt = null; v.lastCheckAt = null;
    await s.ejecutar(cmd('request.create', { requestType: 'traslado', vehicleId: v.id,
      siteId: 'galdakao', to: { siteId: 'galdakao' }, carrierId: 'gruas-francis' }, { at: at(-40) }), log);
    const id = s.estado.requests[0].id;
    await s.ejecutar(cmd('request.update', { requestId: id, status: 'en_ruta' }, { at: at(-20) }), log);
    await s.ejecutar(cmd('movement.register', { vehicleId: v.id, to: { siteId: 'galdakao' } }, { at: at(-30) }), log);
    assert.equal(s.estado.requests[0].status, 'en_ruta');
    await s.ejecutar(cmd('movement.register', { vehicleId: v.id, to: { siteId: 'leioa' } }, { at: at(-10) }), log);
    const llegada = cmd('movement.register', { vehicleId: v.id, to: { siteId: 'galdakao' } }, { at: at(0) });
    await s.ejecutar(llegada, log);
    assert.equal(s.estado.requests[0].status, 'terminada');
    assert.equal(s.estado.requests[0].deliveredAt, at(0));
    assert.equal((await s.ejecutar(llegada, log)).repetido, true);
  } finally { await p.limpiar(); }
});
