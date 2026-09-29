import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';

/**
 * La demo abierta a una hora dada (en UTC) tiene sus tres repasos de «hoy»,
 * contando «hoy» en hora de España. Antes la prueba abría «por la tarde» a
 * las 23:30 UTC, que en Bilbao es la 01:30 del día siguiente: daba por
 * buena la cuenta en hora de Greenwich.
 */
function repasosDeHoy(t: TestContext, at: string, dia: string) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(at) });
  // Cargar después de fijar el reloj: la semilla captura la hora del módulo.
  for (const m of ['../../src/data/seed', '../../src/data/commands']) delete require.cache[require.resolve(m)];
  const { buildSeedState } = require('../../src/data/seed') as typeof import('../../src/data/seed');
  const { applyCommand } = require('../../src/data/commands') as typeof import('../../src/data/commands');
  const { diaEnEspana } = require('../../src/data/delivery-date') as typeof import('../../src/data/delivery-date');
  const s = buildSeedState();
  const hoy = s.vehicles.filter((v) => v.origin === 'Flota renting' && v.deliveryDate && diaEnEspana(v.deliveryDate) === dia);
  assert.equal(hoy.length, 3);
  const tras = applyCommand(s, { type: 'alerts.sweep', id: `barrido-${at}`, userId: 'u-admin', at });
  for (const v of hoy) {
    assert.equal(tras.requests.filter((r) => r.vehicleId === v.id && r.prepTipo === 'repaso').length, 1);
  }
}

test('la demo genera tres repasos de hoy también al abrirse por la tarde', (t) => {
  repasosDeHoy(t, '2026-09-13T16:30:00.000Z', '2026-09-13'); // 18:30 en Bilbao
});

test('y pasada la medianoche de Bilbao, los del día nuevo', (t) => {
  repasosDeHoy(t, '2026-09-13T22:30:00.000Z', '2026-09-14'); // 00:30 del 14 en Bilbao
});
