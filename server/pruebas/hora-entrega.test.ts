import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeliveryDate, deliveryTime } from '../../src/data/delivery-date';
import { cmd, servidorDePruebas } from './ayuda';

test('fecha local conserva hora y minutos al cambiar día, incluido medianoche', () => {
  const fecha = parseDeliveryDate('25/09/2026', null)!;
  assert.equal(new Date(fecha).getHours(), 9);
  for (const [hour, minute] of [[16, 45], [0, 0], [23, 59]]) {
    const iso = deliveryTime(fecha, hour, minute);
    const cambiada = new Date(parseDeliveryDate('27/09/2026', iso)!);
    assert.equal(cambiada.getDate(), 27);
    assert.equal(cambiada.getHours(), hour);
    assert.equal(cambiada.getMinutes(), minute);
  }
  assert.equal(parseDeliveryDate('31/02/2026', fecha), null);
});

for (const prepTipo of ['entrada', 'repaso'] as const) {
  test(`Backend: entrega con hora en ${prepTipo}, modificación de plazo e idempotencia`, async () => {
    const p = await servidorDePruebas();
    try {
      const s = p.servicio;
      const log = s.estado.users.find(u => u.id === 'u-log')!;
      s.estado.requests = []; s.estado.preparations = [];
      const v = s.estado.vehicles[0];
      const entrega = '2026-10-30T16:45:00.000Z';
      const guardar = cmd('vehicle.setDelivery', { vehicleId: v.id, deliveryDate: entrega });
      await s.ejecutar(guardar, log);
      assert.equal((await s.ejecutar(guardar, log)).repetido, true);
      await s.ejecutar(cmd('request.create', { requestType: 'preparacion', prepTipo,
        vehicleId: v.id, siteId: 'leioa' }), log);
      assert.equal(s.estado.vehicles.find(x => x.id === v.id)!.deliveryDate, entrega);
      assert.equal(s.estado.requests[0].dueAt, entrega);
      assert.equal(s.estado.requests[0].prepTipo, prepTipo);
      const nueva = '2026-10-30T18:20:00.000Z';
      await s.ejecutar(cmd('vehicle.setDelivery', { vehicleId: v.id, deliveryDate: nueva }), log);
      assert.equal(s.estado.requests[0].dueAt, nueva);
      await s.ejecutar(cmd('vehicle.setDelivery', { vehicleId: v.id, deliveryDate: null }), log);
      assert.equal(s.estado.vehicles.find(x => x.id === v.id)!.deliveryDate, null);
      assert.equal(s.estado.requests[0].dueAt, new Date(new Date(s.estado.requests[0].createdAt).getTime()
        + s.estado.config.prepDeadlineHours * 3_600_000).toISOString());
    } finally { await p.limpiar(); }
  });
}
