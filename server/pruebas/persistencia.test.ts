/**
 * Que un reinicio no pierda nada.
 *
 * Es la comprobación que más veces ha salvado este proyecto: probar con la
 * base vacía siempre funciona; los fallos aparecen con datos ya guardados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePruebas, cmd, CLAVE } from './ayuda';

test('lo hecho antes de reiniciar sigue ahí después', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const { user: log } = await p.servicio.login('logistica@urkiolacarservice.com', CLAVE);
  const vehiculo = p.servicio.estado.vehicles.find((v) => v.location?.siteId === 'sondika')!;

  await p.servicio.ejecutar(
    cmd('vehicle.check', { vehicleId: vehiculo.id }, { id: 'c-persistencia', userId: log.id }),
    log
  );
  const comprobadoEn = p.servicio.estado.vehicles.find((v) => v.id === vehiculo.id)!.lastCheckAt;

  const otro = await p.reiniciar();
  const despues = otro.estado.vehicles.find((v) => v.id === vehiculo.id)!;
  assert.equal(despues.lastCheckAt, comprobadoEn);

  // Y sigue sin admitir el mismo comando dos veces.
  const { user: log2 } = await otro.login('logistica@urkiolacarservice.com', CLAVE);
  const r = await otro.ejecutar(
    cmd('vehicle.check', { vehicleId: vehiculo.id }, { id: 'c-persistencia', userId: log2.id }),
    log2
  );
  assert.equal(r.repetido, true);
  await otro.cerrar();
});

test('rehacer los comandos desde la foto da el mismo resultado', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const { user: log } = await p.servicio.login('logistica@urkiolacarservice.com', CLAVE);
  const conPrep = new Set(
    p.servicio.estado.preparations.filter((x) => x.runState !== 'terminado').map((x) => x.vehicleId)
  );
  const vehiculo = p.servicio.estado.vehicles.find((v) => !conPrep.has(v.id))!;

  await p.servicio.ejecutar(
    cmd('prep.create', { vehicleId: vehiculo.id, siteId: 'leioa' }, { id: 'c-foto', userId: log.id }),
    log
  );
  const antes = JSON.stringify(p.servicio.estado);

  // Al reiniciar, la foto está por detrás y hay que rehacer el comando.
  const otro = await p.reiniciar();
  assert.equal(JSON.stringify(otro.estado), antes);
  await otro.cerrar();
});
