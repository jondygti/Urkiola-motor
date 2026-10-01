import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';

/**
 * Los datos de ejemplo tienen que cuadrar como cuadraría la app de verdad:
 * un coche «traslado solicitado» tiene su traslado pedido, y al revés; uno
 * «en preparación» tiene su preparación abierta. Se generaban al azar y
 * salían 58 descuadrados, que en la demo se veían enseguida.
 */
test('el estado de cada coche de ejemplo cuadra con su trabajo abierto', () => {
  const s = buildSeedState();
  const abierta = (t: string, id: string) =>
    s.requests.some((r) => r.vehicleId === id && r.type === t && r.status !== 'terminada' && r.status !== 'cancelada');
  const enMarcha = (id: string) =>
    s.preparations.some((p) => p.vehicleId === id && p.runState !== 'terminado' && p.runState !== 'cancelado');
  const mal: string[] = [];
  for (const v of s.vehicles.filter((x) => x.logisticActive && x.status !== 'entregado')) {
    const enTraslado = v.status === 'traslado_solicitado' || v.status === 'en_traslado';
    if (enTraslado !== abierta('traslado', v.id)) mal.push(`${v.vin8}: ${v.status} y traslado ${abierta('traslado', v.id) ? 'abierto' : 'no pedido'}`);
    if (v.status === 'en_preparacion' && !enMarcha(v.id)) mal.push(`${v.vin8}: en preparación sin preparación abierta`);
  }
  assert.deepEqual(mal, []);
});
