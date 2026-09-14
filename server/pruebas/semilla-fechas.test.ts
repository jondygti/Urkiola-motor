import test from 'node:test';
import assert from 'node:assert/strict';

test('la demo genera tres repasos de hoy también al abrirse por la tarde', (t) => {
  const at = '2026-09-13T23:30:00.000Z';
  t.mock.timers.enable({ apis: ['Date'], now: new Date(at) });
  // Cargar después de fijar el reloj: la semilla captura la hora del módulo.
  const { buildSeedState } = require('../../src/data/seed') as typeof import('../../src/data/seed');
  const { applyCommand } = require('../../src/data/commands') as typeof import('../../src/data/commands');
  const s = buildSeedState();
  const hoy = s.vehicles.filter((v) => v.origin === 'Flota renting' && v.deliveryDate?.startsWith('2026-09-13'));
  assert.equal(hoy.length, 3);
  const tras = applyCommand(s, { type: 'alerts.sweep', id: 'barrido-tarde', userId: 'u-admin', at });
  for (const v of hoy) {
    assert.equal(tras.requests.filter((r) => r.vehicleId === v.id && r.prepTipo === 'repaso').length, 1);
  }
});
