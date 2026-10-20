import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { applyCommand } from '../../src/data/commands';
import { accesoriosPorDefecto, lineasOrden, ordenesPorAbrir, textoOrden } from '../../src/data/ordenTrabajo';
import type { AppState } from '../../src/data/types';
import { comprobarPermiso } from '../src/permisos';
import { cmd } from './ayuda';

function base(): { s: AppState; vehicleId: string } {
  const s = buildSeedState();
  s.requests = [];
  s.preparations = [];
  const v = s.vehicles.find((x) => x.logisticActive && x.type === 'VN' && x.status !== 'entregado')!;
  return { s, vehicleId: v.id };
}

const estadoDe = (s: AppState, requirementId: string) => s.preparations[0].items.find((i) => i.requirementId === requirementId)?.state;

test('se piden solo los accesorios que existen, y el repaso no lleva', () => {
  let { s, vehicleId } = base();
  s = applyCommand(s, cmd('request.create', {
    requestType: 'preparacion', vehicleId, siteId: 'leioa', accesorios: ['req-baliza', 'req-kit', 'req-lavado', 'inventado', 'req-baliza'],
  }));
  assert.deepEqual(s.requests[0].accesorios, ['req-baliza', 'req-kit']);
  assert.deepEqual(lineasOrden(s, s.requests[0]), ['Limpieza y preentrega', 'Baliza', 'Kit reparapinchazos']);

  let t = base().s;
  t = applyCommand(t, cmd('request.create', { requestType: 'preparacion', prepTipo: 'repaso', vehicleId, siteId: 'leioa', accesorios: ['req-baliza'] }));
  assert.equal(t.requests[0].accesorios, undefined);
  assert.deepEqual(ordenesPorAbrir(t), [], 'los repasos no llevan orden');
});

test('al preparador le salen como «no requerido» los accesorios que no se han pedido', () => {
  let { s, vehicleId } = base();
  s = applyCommand(s, cmd('request.create', { requestType: 'preparacion', vehicleId, siteId: 'leioa', accesorios: ['req-baliza'] }));
  s = applyCommand(s, cmd('prep.create', { vehicleId, siteId: 'leioa' }));
  assert.equal(estadoDe(s, 'req-baliza'), 'pendiente');
  assert.equal(estadoDe(s, 'req-kit'), 'no_requerido');
  assert.equal(estadoDe(s, 'req-matriculas'), 'no_requerido');
  assert.equal(estadoDe(s, 'req-lavado'), 'pendiente', 'lo que no es accesorio no cambia');

  // Cambiar los accesorios cambia la lista del preparador, sin deshacer lo hecho.
  const prepId = s.preparations[0].id;
  s = applyCommand(s, cmd('prep.item', { prepId, requirementId: 'req-baliza', state: 'completado' }));
  s = applyCommand(s, cmd('request.setAccesorios', { requestId: s.requests[0].id, accesorios: ['req-kit'] }));
  assert.equal(estadoDe(s, 'req-kit'), 'pendiente');
  assert.equal(estadoDe(s, 'req-baliza'), 'completado', 'la baliza ya puesta se queda puesta');
});

test('sin lista de accesorios (solicitudes de antes) se piden todos', () => {
  let { s, vehicleId } = base();
  s = applyCommand(s, cmd('request.create', { requestType: 'preparacion', vehicleId, siteId: 'leioa' }));
  s = applyCommand(s, cmd('prep.create', { vehicleId, siteId: 'leioa' }));
  assert.equal(estadoDe(s, 'req-kit'), 'pendiente');
  assert.equal(lineasOrden(s, s.requests[0]).length, 5);
});

test('las matrículas no se marcan de entrada si el coche ya las tiene', () => {
  const { s } = base();
  const conPlaca = s.vehicles.find((v) => v.type === 'VN' && v.plate)!;
  const sinPlaca = s.vehicles.find((v) => v.type === 'VN' && !v.plate)!;
  assert.ok(!accesoriosPorDefecto(s, conPlaca).includes('req-matriculas'));
  assert.ok(accesoriosPorDefecto(s, sinPlaca).includes('req-matriculas'));
});

test('el número de la orden de Quiter: se apunta, sale de la lista y se puede quitar', () => {
  let { s, vehicleId } = base();
  s = applyCommand(s, cmd('request.create', { requestType: 'preparacion', vehicleId, siteId: 'leioa', accesorios: ['req-baliza'] }));
  const r = s.requests[0];
  assert.deepEqual(ordenesPorAbrir(s).map((x) => x.id), [r.id]);
  const texto = textoOrden(s, r);
  const v = s.vehicles.find((x) => x.id === vehicleId)!;
  assert.match(texto, /Preparación · Leioa/);
  assert.ok(texto.includes(v.vin), 'lleva el bastidor');
  assert.match(texto, /- Limpieza y preentrega\n- Baliza$/);

  const apuntar = cmd('request.setOrden', { requestId: r.id, numero: '  OT-2026-0042 ' }, { userId: 'u-admin' });
  s = applyCommand(s, apuntar);
  assert.equal(s.requests[0].ordenTrabajo?.numero, 'OT-2026-0042');
  assert.equal(s.requests[0].ordenTrabajo?.by, 'u-admin');
  assert.deepEqual(ordenesPorAbrir(s), []);
  // Repetir no apunta otra vez en el historial.
  const eventos = s.events.length;
  assert.equal(applyCommand(s, cmd('request.setOrden', { requestId: r.id, numero: 'OT-2026-0042' })).events.length, eventos);
  s = applyCommand(s, cmd('request.setOrden', { requestId: r.id, numero: null }));
  assert.equal(s.requests[0].ordenTrabajo, null);
  assert.equal(ordenesPorAbrir(s).length, 1);
});

test('la orden la lleva la oficina: el comercial y el preparador no', () => {
  let { s, vehicleId } = base();
  s = applyCommand(s, cmd('request.create', { requestType: 'preparacion', vehicleId, siteId: 'leioa' }));
  const r = s.requests[0];
  for (const id of ['u-juan', 'u-pedro', 'u-iker']) {
    const u = s.users.find((x) => x.id === id)!;
    assert.ok(comprobarPermiso(s, u, cmd('request.setOrden', { requestId: r.id, numero: '1' })), id);
    assert.ok(comprobarPermiso(s, u, cmd('request.setAccesorios', { requestId: r.id, accesorios: [] })), id);
  }
  for (const id of ['u-admin', 'u-log']) {
    const u = s.users.find((x) => x.id === id)!;
    assert.equal(comprobarPermiso(s, u, cmd('request.setOrden', { requestId: r.id, numero: '1' })), null, id);
  }
});
