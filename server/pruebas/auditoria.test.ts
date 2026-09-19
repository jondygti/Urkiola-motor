import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import { validarComando } from '../src/validar';
import { comprobarPermiso } from '../src/permisos';
import type { AppState } from '../../src/data/types';

const FOTOS_FINAL = {
  frontLeft: 'foto:final-fl.jpg',
  frontRight: 'foto:final-fr.jpg',
  rearLeft: 'foto:final-rl.jpg',
  rearRight: 'foto:final-rr.jpg',
} as const;

const hora = (min: number) => new Date(Date.UTC(2026, 8, 13, 10, min)).toISOString();
let n = 0;
function aplicar(s: AppState, min: number, datos: object) {
  return applyCommand(s, { id: `auditoria-${++n}`, userId: 'u-admin', at: hora(min), ...datos } as Command);
}
function trabajo() {
  let s = buildSeedState();
  s = { ...s, preparations: [], requests: [] };
  s = aplicar(s, 0, { type: 'prep.create', vehicleId: s.vehicles[0].id, siteId: 'leioa' });
  s = aplicar(s, 0, { type: 'prep.start', prepId: s.preparations[0].id });
  return s;
}

test('doble inicio no pierde minutos trabajados', () => {
  let s = trabajo(); const prepId = s.preparations[0].id;
  s = aplicar(s, 10, { type: 'prep.start', prepId });
  s = aplicar(s, 20, { type: 'prep.pause', prepId, reason: 'Espera' });
  assert.equal(s.preparations[0].effectiveMs, 20 * 60000);
});
test('cambiar el motivo de espera no borra el tiempo esperando', () => {
  let s = trabajo(); const prepId = s.preparations[0].id;
  s = aplicar(s, 10, { type: 'prep.pause', prepId, reason: 'Piezas' });
  s = aplicar(s, 20, { type: 'prep.pause', prepId, reason: 'Taller', blocked: true });
  s = aplicar(s, 30, { type: 'prep.resume', prepId });
  assert.equal(s.preparations[0].waitingMs, 20 * 60000);
});
test('terminar durante una espera conserva los minutos de espera', () => {
  let s = trabajo(); const prepId = s.preparations[0].id;
  s = aplicar(s, 10, { type: 'prep.pause', prepId, reason: 'Piezas' });
  s = aplicar(s, 30, { type: 'prep.finish', finalPhotos: FOTOS_FINAL, prepId });
  assert.equal(s.preparations[0].waitingMs, 20 * 60000);
});
test('una pausa atrasada no deshace una reanudación posterior', () => {
  let s = trabajo(); const prepId = s.preparations[0].id;
  s = aplicar(s, 10, { type: 'prep.pause', prepId, reason: 'Piezas' });
  s = aplicar(s, 30, { type: 'prep.resume', prepId });
  const despues = aplicar(s, 20, { type: 'prep.pause', prepId, reason: 'Taller' });
  assert.deepEqual(despues, s);
});
test('una pausa o un check atrasado no reabre un servicio terminado', () => {
  let s = trabajo(); const prepId = s.preparations[0].id;
  s = aplicar(s, 30, { type: 'prep.finish', finalPhotos: FOTOS_FINAL, prepId });
  assert.deepEqual(aplicar(s, 20, { type: 'prep.pause', prepId, reason: 'Piezas' }), s);
  assert.deepEqual(aplicar(s, 20, { type: 'prep.item', prepId,
    requirementId: s.preparations[0].items[0].requirementId, state: 'pendiente' }), s);
});
test('cambiar la entrega actualiza los plazos de ambos servicios', () => {
  let s = trabajo(); const vehicleId = s.preparations[0].vehicleId;
  for (const prepTipo of ['entrada', 'repaso']) s = aplicar(s, 1, {
    type: 'request.create', requestType: 'preparacion', vehicleId, siteId: 'leioa', to: null, prepTipo });
  s = aplicar(s, 2, { type: 'vehicle.setDelivery', vehicleId, deliveryDate: hora(50) });
  assert.ok(s.requests.every(r => r.dueAt === hora(50)));
});
test('la API normaliza fechas equivalentes antes de comparar observaciones', () => {
  const c = validarComando({ type: 'prep.start', id: 'fecha', at: '2026-09-13T12:00:00+02:00',
    prepId: 'p' }, 'u', Date.parse(hora(30)));
  assert.equal(c.at, hora(0));
});
test('la API rechaza estados de checklist y tipos de servicio inventados', () => {
  for (const datos of [{ type: 'prep.item', prepId: 'p', requirementId: 'r', state: 'inventado' },
    { type: 'prep.create', vehicleId: 'v', siteId: 'leioa', tipo: 'inventado' }]) {
    assert.throws(() => validarComando({ id: 'invalido', at: hora(0), ...datos }, 'u'));
  }
});
test('no se abre un servicio en otra sede aprovechando dónde está el coche', () => {
  const s = buildSeedState();
  const usuario = s.users.find(u => u.id === 'u-pedro')!;
  const v = s.vehicles.find(v => v.location?.siteId === 'leioa')!;
  const conGestion = { ...s, config: { ...s.config, roles: s.config.roles.map(r =>
    r.id === usuario.role ? { ...r, permissions: [...r.permissions, 'preparacion.gestionar' as const] } : r) } };
  assert.notEqual(comprobarPermiso(conGestion, usuario, { type: 'prep.create', id: 'sede',
    at: hora(0), userId: usuario.id, vehicleId: v.id, siteId: 'irun' }), null);
});
