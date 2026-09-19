import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import { comprobarPermiso } from '../src/permisos';

const FOTOS_FINAL = {
  frontLeft: 'foto:final-fl.jpg',
  frontRight: 'foto:final-fr.jpg',
  rearLeft: 'foto:final-rl.jpg',
  rearRight: 'foto:final-rr.jpg',
} as const;

for (const tipo of ['entrada', 'repaso'] as const) {
  test(`abrir y terminar ${tipo} no altera la solicitud del otro servicio`, () => {
    let state = buildSeedState();
    state = { ...state, requests: [], preparations: [] };
    const vehicleId = state.vehicles[0].id;
    let n = 0;
    const orden = (datos: object) => ({ id: `servicio-${++n}`, at: new Date().toISOString(),
      userId: 'u-admin', ...datos }) as Command;
    for (const prepTipo of [tipo, tipo === 'entrada' ? 'repaso' : 'entrada']) {
      state = applyCommand(state, orden({ type: 'request.create', requestType: 'preparacion',
        vehicleId, siteId: 'leioa', prepTipo }));
    }
    const otra = state.requests.find(r => r.prepTipo !== tipo)!;
    const propia = state.requests.find(r => r.prepTipo === tipo)!;
    state = applyCommand(state, orden({ type: 'prep.create', vehicleId, siteId: 'leioa', tipo }));
    assert.equal(state.requests.find(r => r.id === propia.id)?.status, 'en_curso');
    assert.deepEqual(state.requests.find(r => r.id === otra.id), otra);
    const prep = state.preparations[0];
    assert.equal(prep.tipo, tipo);
    assert.equal(prep.items.some(i => i.requirementId === 'req-repaso-ext'), tipo === 'repaso');
    const terminar = orden({ type: 'prep.finish', finalPhotos: FOTOS_FINAL, prepId: prep.id });
    state = applyCommand(state, terminar);
    assert.equal(state.requests.find(r => r.id === propia.id)?.status, 'terminada');
    assert.deepEqual(state.requests.find(r => r.id === otra.id), otra);
    assert.deepEqual(applyCommand(state, terminar), state, 'reintentar no altera solicitudes ni historial');
    state = applyCommand(state, orden({ type: 'prep.create', vehicleId, siteId: 'leioa', tipo: otra.prepTipo }));
    assert.equal(state.preparations[0].tipo, otra.prepTipo);
    assert.equal(state.requests.find(r => r.id === otra.id)?.status, 'en_curso');
  });
}

test('un encargo de repaso no autoriza a inventar una preparación completa', () => {
  let s = buildSeedState();
  s = { ...s, requests: [], preparations: [] };
  const vehicleId = s.vehicles.find(v => v.location?.siteId === 'leioa')!.id;
  const base = { id: 'servicio-permiso', at: new Date().toISOString(), userId: 'u-pedro' };
  s = applyCommand(s, { ...base, type: 'request.create', requestType: 'preparacion',
    vehicleId, siteId: 'leioa', to: null, prepTipo: 'repaso' });
  const usuario = s.users.find(u => u.id === 'u-pedro')!;
  assert.notEqual(comprobarPermiso(s, usuario, { ...base, type: 'prep.create', vehicleId,
    siteId: 'leioa', tipo: 'entrada' }), null);
});
