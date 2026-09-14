import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import { estadoParaColaborador } from '../src/recorte';
import type { AppState } from '../../src/data/types';

let n = 0;
const t = (day: number, hour = 12) => `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
function cmd(datos: object, at = t(14), userId = 'u-admin'): Command {
  return { id: `aud-final-${++n}`, at, userId, ...datos } as Command;
}
function base(): AppState {
  const s = buildSeedState();
  const v = s.vehicles.find(x => x.id === 'v-12345678')!;
  return {
    ...s,
    requests: [],
    preparations: [],
    inbox: [],
    vehicles: s.vehicles.map(x => x.id === v.id ? {
      ...x,
      status: 'aparcado',
      logisticActive: true,
      targetSiteId: null,
      deliveredAt: null,
      deliveredBy: null,
      locationObservedAt: t(10),
      lastCheckAt: t(10),
      lastMovementAt: t(10),
    } : x),
  };
}
function traslado(s = base(), at = t(10)): AppState {
  return applyCommand(s, cmd({
    type: 'request.create', requestType: 'traslado', vehicleId: 'v-12345678',
    siteId: 'leioa', to: { siteId: 'leioa' }, carrierId: null,
  }, at));
}

test('una solicitud cancelada sigue cancelada al entregar el coche al cliente', () => {
  let s = traslado();
  const id = s.requests[0].id;
  s = applyCommand(s, cmd({ type: 'request.cancel', requestId: id, reason: 'Ya no hace falta' }, t(11)));
  assert.equal(s.requests[0].status, 'cancelada');
  s = applyCommand(s, cmd({ type: 'vehicle.deliver', vehicleId: 'v-12345678' }, t(12)));
  assert.equal(s.requests.find(r => r.id === id)?.status, 'cancelada');
  assert.equal(s.requests.find(r => r.id === id)?.cancelReason, 'Ya no hace falta');
});

test('un traslado cancelado no vuelve a avisar como sin recoger', () => {
  let s = traslado(base(), t(10));
  const id = s.requests[0].id;
  s = applyCommand(s, cmd({ type: 'request.cancel', requestId: id, reason: 'Cancelado' }, t(11)));
  s = applyCommand(s, cmd({ type: 'alerts.sweep' }, t(14)));
  assert.equal(s.inbox.some(x => x.id.startsWith(`nev-recogida-${id}-`)), false);
});

test('no admite dos preparaciones equivalentes del mismo coche en sedes distintas', () => {
  let s = base();
  s = applyCommand(s, cmd({
    type: 'request.create', requestType: 'preparacion', prepTipo: 'entrada',
    vehicleId: 'v-12345678', siteId: 'leioa', to: { siteId: 'leioa' },
  }, t(10)));
  s = applyCommand(s, cmd({
    type: 'request.create', requestType: 'preparacion', prepTipo: 'entrada',
    vehicleId: 'v-12345678', siteId: 'galdakao', to: { siteId: 'galdakao' },
  }, t(11)));
  assert.equal(s.requests.filter(r => r.type === 'preparacion').length, 1);

  s = applyCommand(s, cmd({
    type: 'request.create', requestType: 'preparacion', prepTipo: 'repaso',
    vehicleId: 'v-12345678', siteId: 'galdakao', to: { siteId: 'galdakao' },
  }, t(12)));
  assert.equal(s.requests.filter(r => r.type === 'preparacion').length, 2, 'repaso sigue siendo un servicio distinto');
});

test('las ubicaciones de llaves no salen al transportista externo', () => {
  const s = buildSeedState();
  const req = s.requests.find(r => r.type === 'traslado' && r.carrierId === 'gruas-francis')!;
  const v = s.vehicles.find(x => x.id === req.vehicleId)!;
  v.primaryKeyLocation = 'Caja fuerte de Leioa';
  v.secondaryKeyLocation = 'Despacho comercial';
  v.primaryKeyUpdatedAt = t(14);
  v.primaryKeyUpdatedBy = 'u-log';
  v.secondaryKeyUpdatedAt = t(14);
  v.secondaryKeyUpdatedBy = 'u-log';
  v.keysUpdatedAt = t(14);
  v.keysUpdatedBy = 'u-log';
  const iker = s.users.find(u => u.id === 'u-iker')!;
  const visto = estadoParaColaborador(s, iker).vehicles.find(x => x.id === v.id)!;
  assert.equal(visto.primaryKeyLocation ?? null, null);
  assert.equal(visto.secondaryKeyLocation ?? null, null);
  assert.equal(visto.primaryKeyUpdatedAt ?? null, null);
  assert.equal(visto.primaryKeyUpdatedBy ?? null, null);
  assert.equal(visto.secondaryKeyUpdatedAt ?? null, null);
  assert.equal(visto.secondaryKeyUpdatedBy ?? null, null);
  assert.equal(visto.keysUpdatedAt ?? null, null);
  assert.equal(visto.keysUpdatedBy ?? null, null);
});

test('las dos llaves siguen siendo independientes con comandos offline fuera de orden', () => {
  let s = base();
  s = applyCommand(s, cmd({ type: 'vehicle.setKeys', vehicleId: 'v-12345678', secondary: 'Cliente' }, t(14, 12), 'u-log'));
  s = applyCommand(s, cmd({ type: 'vehicle.setKeys', vehicleId: 'v-12345678', primary: 'Recepción' }, t(14, 11), 'u-admin'));
  const v = s.vehicles.find(x => x.id === 'v-12345678')!;
  assert.equal(v.primaryKeyLocation, 'Recepción');
  assert.equal(v.secondaryKeyLocation, 'Cliente');
});

test('no convierte en parking sin plazas una zona con plazas todavía ocupadas', () => {
  const s = buildSeedState();
  const zone = s.zones.find(z => z.id === 'sondika-tej-01')!;
  assert.ok(s.vehicles.some(v => v.location?.zoneId === zone.id && v.location.positionId));
  const after = applyCommand(s, cmd({ type: 'zone.upsert', zone: { ...zone, capacity: 0 }, positions: 0 }));
  assert.equal(after.zones.find(z => z.id === zone.id)?.capacity, zone.capacity);
  assert.equal(after.positions.filter(p => p.zoneId === zone.id).length, s.positions.filter(p => p.zoneId === zone.id).length);
});

test('añadir o borrar plazas manualmente mantiene la capacidad de la zona sincronizada', () => {
  let s = base();
  s.zones.push({ id: 'zona-manual', siteId: 'leioa', name: 'Zona manual', kind: 'parking', capacity: 0 });
  s = applyCommand(s, cmd({ type: 'position.add', zoneId: 'zona-manual', code: 'P01' }));
  assert.equal(s.zones.find(z => z.id === 'zona-manual')?.capacity, 1);
  const id = s.positions.find(p => p.zoneId === 'zona-manual')!.id;
  s = applyCommand(s, cmd({ type: 'position.delete', positionId: id }));
  assert.equal(s.zones.find(z => z.id === 'zona-manual')?.capacity, 0);
});
