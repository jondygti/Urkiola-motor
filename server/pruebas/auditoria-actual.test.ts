import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { requestsBySite } from '../../src/data/selectors';
import { VEHICLE_FLOW, VEHICLE_STATUS_LABEL } from '../../src/data/types';

test('la ficha 360 contempla todos los estados logísticos del vehículo', () => {
  assert.deepEqual(new Set(VEHICLE_FLOW), new Set(Object.keys(VEHICLE_STATUS_LABEL)));
});

test('el resumen de solicitudes cuenta también traslados con Sondika como sede', () => {
  const s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId !== 'sondika')!;
  s.requests.unshift({
    id: 'req-auditoria-sondika', type: 'traslado', vehicleId: v.id, siteId: 'sondika',
    from: v.location, to: { siteId: 'sondika' }, status: 'solicitada', urgent: false,
    createdAt: '2026-09-16T00:00:00.000Z', createdBy: 'u-admin', assignedTo: null,
    dueAt: null, pickedUpAt: null, deliveredAt: null, deliveredBy: null, carrierId: null,
  });
  const fila = requestsBySite(s).find((x) => x.site.id === 'sondika');
  assert.ok(fila);
  assert.ok((fila?.transfers ?? 0) >= 1);
});
