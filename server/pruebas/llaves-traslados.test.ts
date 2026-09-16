import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import type { AppState, User } from '../../src/data/types';
import { comprobarPermiso } from '../src/permisos';

let n = 0;
const at = (hour: number) => `2026-09-15T${String(hour).padStart(2, '0')}:00:00.000Z`;
const cmd = (data: object, userId: string, hour = 9): Command => ({
  id: `llaves-${++n}`,
  at: at(hour),
  userId,
  ...data,
}) as Command;

function escenario(origen: 'sondika' | 'leioa' = 'sondika') {
  const seed = buildSeedState();
  const logistica = seed.users.find((u) => u.role === 'logistica')!;
  const transportista = seed.users.find((u) => u.role === 'transportista' && !!u.carrierId)!;
  const vehicle = seed.vehicles.find((v) => v.id === 'v-12345678') ?? seed.vehicles[0];
  const state: AppState = {
    ...seed,
    requests: [],
    vehicles: seed.vehicles.map((v) => v.id === vehicle.id ? {
      ...v,
      logisticActive: true,
      status: 'aparcado',
      location: { siteId: origen },
      targetSiteId: null,
      locationObservedAt: null,
      lastCheckAt: null,
      lastMovementAt: null,
      deliveredAt: null,
      deliveredBy: null,
    } : v),
  };

  const creado = applyCommand(state, cmd({
    type: 'request.create',
    requestType: 'traslado',
    vehicleId: vehicle.id,
    siteId: 'galdakao',
    to: { siteId: 'galdakao' },
    carrierId: transportista.carrierId,
  }, logistica.id));

  return {
    state: creado,
    requestId: creado.requests[0].id,
    vehicleId: vehicle.id,
    logistica,
    transportista,
  } as const;
}

function puede(s: AppState, u: User, data: object, hour = 10) {
  return comprobarPermiso(s, u, cmd(data, u.id, hour));
}

test('un traslado desde Sondika no puede recoger llaves hasta que Logística las marque preparadas', () => {
  let { state, requestId, logistica, transportista } = escenario('sondika');

  assert.match(
    puede(state, transportista, { type: 'request.update', requestId, status: 'en_ruta' }) ?? '',
    /todavía no ha marcado las llaves como preparadas/i
  );

  const preparar = cmd({ type: 'request.update', requestId, status: 'asignada' }, logistica.id, 10);
  assert.equal(comprobarPermiso(state, logistica, preparar), null);
  state = applyCommand(state, preparar);
  const preparada = state.requests.find((r) => r.id === requestId)!;
  assert.equal(preparada.status, 'asignada');
  assert.equal(preparada.keysReadyAt, at(10));
  assert.equal(preparada.keysReadyBy, logistica.id);

  const recoger = cmd({ type: 'request.update', requestId, status: 'en_ruta' }, transportista.id, 11);
  assert.equal(comprobarPermiso(state, transportista, recoger), null);
  state = applyCommand(state, recoger);
  const request = state.requests.find((r) => r.id === requestId)!;
  assert.equal(request.status, 'en_ruta');
  assert.equal(request.pickedUpAt, at(11));
  assert.ok(request.dueAt);
  assert.equal(state.vehicles.find((v) => v.id === request.vehicleId)?.status, 'en_traslado');
});

test('el transportista tampoco puede saltarse las llaves registrando directamente el movimiento', () => {
  const { state, vehicleId, transportista } = escenario('sondika');
  const rechazo = puede(state, transportista, {
    type: 'movement.register',
    vehicleId,
    to: { siteId: 'galdakao' },
  });
  assert.match(rechazo ?? '', /primero tienes que recoger las llaves/i);
});

test('un traslado antiguo asignado sin keysReadyAt sigue pendiente de llaves', () => {
  const { state, requestId, transportista } = escenario('sondika');
  const antiguo = {
    ...state,
    requests: state.requests.map((r) => r.id === requestId ? { ...r, status: 'asignada' as const, keysReadyAt: undefined, keysReadyBy: undefined } : r),
  };
  const rechazo = puede(antiguo, transportista, { type: 'request.update', requestId, status: 'en_ruta' });
  assert.match(rechazo ?? '', /todavía no ha marcado las llaves como preparadas/i);
});

test('un traslado desde otra sede conserva el flujo anterior y puede recoger directamente', () => {
  const { state, requestId, transportista } = escenario('leioa');
  assert.equal(
    puede(state, transportista, { type: 'request.update', requestId, status: 'en_ruta' }),
    null
  );
});

test('un traslado no se puede cerrar a mano: lo cierra el movimiento al destino', () => {
  let { state, requestId, vehicleId, logistica, transportista } = escenario('sondika');
  state = applyCommand(state, cmd({ type: 'request.update', requestId, status: 'asignada' }, logistica.id, 10));
  state = applyCommand(state, cmd({ type: 'request.update', requestId, status: 'en_ruta' }, transportista.id, 11));

  const cerrarTransportista = puede(state, transportista, { type: 'request.update', requestId, status: 'terminada' }, 12);
  const cerrarLogistica = puede(state, logistica, { type: 'request.update', requestId, status: 'terminada' }, 12);
  assert.match(cerrarTransportista ?? '', /mov(er|imiento).*destino|destino del traslado/i);
  assert.match(cerrarLogistica ?? '', /movimiento.*destino|llega.*destino/i);

  state = applyCommand(state, cmd({ type: 'movement.register', vehicleId, to: { siteId: 'leioa' } }, transportista.id, 12));
  assert.equal(state.requests.find((r) => r.id === requestId)?.status, 'en_ruta', 'otra sede no lo cierra');

  state = applyCommand(state, cmd({ type: 'movement.register', vehicleId, to: { siteId: 'galdakao' } }, transportista.id, 13));
  assert.equal(state.requests.find((r) => r.id === requestId)?.status, 'terminada');
  assert.equal(state.vehicles.find((v) => v.id === vehicleId)?.location?.siteId, 'galdakao');
});
