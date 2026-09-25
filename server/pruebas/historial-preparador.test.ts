import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { historialPreparador, resumenPreparador } from '../../src/data/selectors';
import { estadoPara } from '../src/recorte';

test('historial propio ordenado, sin trabajos ajenos/activos/cancelados; tiempos efectivos y espera separados', () => {
  const s = buildSeedState(); const plantilla = s.preparations[0];
  s.preparations = [
    { ...plantilla, id: 'a', siteId: 'leioa', preparerId: 'u-pedro', runState: 'terminado', finishedAt: '2026-09-23T12:00:00Z', effectiveMs: 60000, waitingMs: 120000, tipo: 'entrada' },
    { ...plantilla, id: 'b', siteId: 'leioa', preparerId: 'u-pedro', runState: 'terminado', finishedAt: '2026-09-24T12:00:00Z', effectiveMs: 180000, waitingMs: 0, tipo: 'repaso' },
    { ...plantilla, id: 'ajena', siteId: 'leioa', preparerId: 'u-ane', runState: 'terminado', finishedAt: '2026-09-24T12:00:00Z' },
    { ...plantilla, id: 'activa', siteId: 'leioa', preparerId: 'u-pedro', runState: 'en_curso', finishedAt: null },
    { ...plantilla, id: 'cancelada', siteId: 'leioa', preparerId: 'u-pedro', runState: 'cancelado', finishedAt: null },
  ];
  const pedro = s.users.find(u => u.id === 'u-pedro')!;
  const visto = estadoPara(s, pedro, false);
  const historial = historialPreparador(visto, pedro.id);
  assert.deepEqual(historial.map(p => p.id), ['b', 'a']);
  assert.equal(visto.preparations.some(p => p.id === 'ajena'), false);
  assert.deepEqual(resumenPreparador(historial), { total: 2, effectiveMs: 240000, avgMs: 120000, waitingMs: 120000 });
  assert.deepEqual(resumenPreparador([]), { total: 0, effectiveMs: 0, avgMs: 0, waitingMs: 0 });
});
