import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparTrasladosPorTrayecto, misTrasladosPorFase } from '../../src/data/selectors';
import { buildSeedState } from '../../src/data/seed';
import type { ServiceRequest } from '../../src/data/types';

test('los trayectos separan destinos y sentidos y conservan la prioridad dentro del grupo', () => {
  const base = buildSeedState().requests.find((r) => r.type === 'traslado')!;
  const viaje = (id: string, desde: string, hasta: string): ServiceRequest => ({
    ...base, id, from: { siteId: desde }, to: { siteId: hasta }, siteId: hasta,
  });
  const lista = [viaje('urgente', 'sondika', 'leioa'), viaje('otro', 'sondika', 'galdakao'),
    viaje('vuelta', 'leioa', 'sondika'), viaje('normal', 'sondika', 'leioa')];
  const grupos = agruparTrasladosPorTrayecto(lista);
  assert.equal(grupos.length, 3);
  assert.deepEqual(grupos[0].solicitudes.map((r) => r.id), ['urgente', 'normal']);
  assert.deepEqual(grupos.map((g) => [g.origen, g.destino]),
    [['sondika', 'leioa'], ['sondika', 'galdakao'], ['leioa', 'sondika']]);
});

test('agrupar no añade encargos de otra empresa ni pierde los autorizados', () => {
  const s = buildSeedState();
  const fases = misTrasladosPorFase(s, 'u-iker');
  for (const lista of [fases.porRecoger, fases.recogidos]) {
    const ids = agruparTrasladosPorTrayecto(lista).flatMap((g) => g.solicitudes.map((r) => r.id));
    assert.deepEqual(ids.sort(), lista.map((r) => r.id).sort());
    assert.equal(new Set(ids).size, ids.length);
  }
});
