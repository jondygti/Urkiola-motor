import test from 'node:test';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { applyCommand, idCreadoPor } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import { avisoLeido, bandejaDe, puedeGestionarEntrega } from '../../src/data/selectors';
import { estadoPara } from '../src/recorte';
import { comprobarPermiso } from '../src/permisos';
import { cmd, servidorDePruebas } from './ayuda';
import type { AppState, NotificationEvent } from '../../src/data/types';

const FOTOS_FINAL = {
  frontLeft: 'foto:final-fl.jpg',
  frontRight: 'foto:final-fr.jpg',
  rearLeft: 'foto:final-rl.jpg',
  rearRight: 'foto:final-rr.jpg',
} as const;

/** Dos coches sin observaciones recientes, con dos plazas conocidas. */
function campa() {
  const seed = buildSeedState();
  const [a, b] = seed.vehicles.filter((v) => v.logisticActive && v.location?.positionId).slice(0, 2);
  const limpiar = (v: typeof a) => ({ ...v, status: 'aparcado' as const, lastCheckAt: null, lastMovementAt: null, deliveredAt: null, locationObservedAt: null });
  const state: AppState = { ...seed, vehicles: [limpiar(a), limpiar(b)], requests: [], preparations: [], counts: [], receptions: [], movements: [], events: [], inbox: [] };
  const viejo = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const reciente = new Date(Date.now() - 3_600_000).toISOString();
  return { state, a: state.vehicles[0], b: state.vehicles[1], viejo, reciente };
}

test('un movimiento antiguo queda en el historial sin sustituir la ubicación actual', () => {
  const { state, a, b, viejo, reciente } = campa();
  const actual = applyCommand(state, cmd('movement.register', { vehicleId: a.id, to: b.location }, { at: reciente }));
  const tarde = cmd('movement.register', { vehicleId: a.id, to: a.location, completesTransfer: true }, { at: viejo });
  const final = applyCommand(actual, tarde);
  assert.deepEqual(final.vehicles.find((v) => v.id === a.id), actual.vehicles.find((v) => v.id === a.id));
  assert.equal(final.movements.length, 2);
  assert.ok(final.events.some((e) => e.title.includes('con retraso')));
  assert.deepEqual(applyCommand(final, tarde), final, 'el reintento no duplica el registro');
});

test('una observación antigua de otro coche no desaloja una plaza comprobada después', () => {
  const { state, a, b, viejo, reciente } = campa();
  const actual = applyCommand(state, cmd('vehicle.check', { vehicleId: b.id }, { at: reciente }));
  const final = applyCommand(actual, cmd('movement.register', { vehicleId: a.id, to: b.location }, { at: viejo }));
  assert.equal(final.vehicles.find((v) => v.id === b.id)!.location!.positionId, b.location!.positionId);
  assert.equal(final.vehicles.find((v) => v.id === a.id)!.location!.positionId, undefined);
  assert.equal(final.vehicles.find((v) => v.id === a.id)!.location!.zoneId, b.location!.zoneId);
});

test('liberar la plaza de un coche impide que su movimiento anterior vuelva a ocuparla', () => {
  const { state, a, b, viejo, reciente } = campa();
  const actual = applyCommand(state, cmd('movement.register', { vehicleId: b.id, to: a.location }, { at: reciente }));
  const final = applyCommand(actual, cmd('movement.register', { vehicleId: a.id, to: b.location }, { at: viejo }));
  assert.deepEqual(final.vehicles, actual.vehicles);
});

test('comprobación, recuento y descarga tardíos conservan la ubicación más reciente', () => {
  const { state, a, b, viejo, reciente } = campa();
  const actual = applyCommand(state, cmd('movement.register', { vehicleId: a.id, to: b.location }, { at: reciente }));
  const check = applyCommand(actual, cmd('vehicle.check', { vehicleId: a.id, positionId: a.location!.positionId }, { at: viejo }));
  assert.deepEqual(check.vehicles, actual.vehicles);

  const contar = cmd('count.create', { code: 'R-ANTIGUO', siteId: a.location!.siteId }, { at: viejo });
  const conRecuento = applyCommand(actual, contar);
  const contado = applyCommand(conRecuento, cmd('count.finding', { countId: conRecuento.counts[0].id, vehicleId: a.id, positionId: a.location!.positionId }, { at: viejo }));
  assert.equal(contado.counts[0].found.length, 1, 'se conserva el trabajo del recuento');
  assert.deepEqual(contado.vehicles, actual.vehicles);

  const recibir = cmd('reception.create', { truckPlate: '0000 ABC', carrier: 'Pruebas', siteId: a.location!.siteId }, { at: viejo });
  const conRecepcion = applyCommand(actual, recibir);
  const recibido = applyCommand(conRecepcion, cmd('reception.line', { receptionId: conRecepcion.receptions[0].id, ref: a.vin8, unloaded: true, positionId: a.location!.positionId }, { at: viejo }));
  assert.equal(recibido.receptions[0].lines[0].unloaded, true);
  assert.deepEqual(recibido.vehicles, actual.vehicles);
});

test('una entrega no se deshace por un movimiento que ocurrió antes', () => {
  const { state, a, b, viejo, reciente } = campa();
  const entregado = applyCommand(state, cmd('vehicle.deliver', { vehicleId: a.id }, { at: reciente }));
  const final = applyCommand(entregado, cmd('movement.register', { vehicleId: a.id, to: b.location }, { at: viejo }));
  assert.deepEqual(final.vehicles, entregado.vehicles);
  assert.equal(final.vehicles[0].status, 'entregado');
});

test('el alta tardía tampoco quita una plaza comprobada después', () => {
  const { state, a, viejo, reciente } = campa();
  const actual = applyCommand(state, cmd('vehicle.check', { vehicleId: a.id }, { at: reciente }));
  const final = applyCommand(actual, cmd('vehicle.create', { vin8: 'NUEVO001', location: a.location }, { at: viejo }));
  assert.equal(final.vehicles.find((v) => v.id === 'v-NUEVO001')!.location!.positionId, undefined);
  assert.deepEqual(final.vehicles.find((v) => v.id === a.id), actual.vehicles.find((v) => v.id === a.id));
});

test('leer todos solo marca lo visible para el lector y respeta a los otros destinatarios', () => {
  const s = buildSeedState();
  const [a, b] = s.users;
  const aviso = (id: string, userIds: string[] | null): NotificationEvent => ({ id, userIds, ruleId: null, vehicleId: null, title: id, body: 'Prueba', at: new Date().toISOString(), tone: 'info', read: false, readBy: [] });
  s.inbox = [aviso('compartido', [a.id, b.id]), aviso('de-b', [b.id]), aviso('general', null)];
  const final = applyCommand(s, cmd('inbox.readAll', {}, { userId: a.id }));
  assert.equal(bandejaDe(final, a).filter((n) => !n.read).length, 0);
  assert.equal(bandejaDe(final, b).filter((n) => !n.read).length, 3);
  assert.deepEqual(final.inbox[1], s.inbox[1]);
  assert.deepEqual(applyCommand(final, cmd('inbox.read', { eventId: 'de-b' }, { userId: a.id })).inbox, final.inbox);
  const paraB = estadoPara(final, b, false);
  assert.equal(paraB.inbox[0].read, false);
  assert.deepEqual(paraB.inbox[0].readBy, [], 'no expone quién más ha leído el aviso');
});

test('un transportista no marca avisos de vehículos ajenos con leer todos', () => {
  const s = buildSeedState();
  const externo = s.users.find((u) => u.role === 'transportista')!;
  const id = s.vehicles.find((v) => !s.requests.some((r) => r.vehicleId === v.id && (r.assignedTo === externo.id || r.carrierId === externo.carrierId)))!.id;
  s.inbox = [{ id: 'ajeno', ruleId: null, vehicleId: id, title: 'Ajeno', body: 'Prueba', at: new Date().toISOString(), tone: 'info', read: false, readBy: [] }];
  const final = applyCommand(s, cmd('inbox.readAll', {}, { userId: externo.id }));
  assert.equal(avisoLeido(final.inbox[0], externo.id), false);
});

test('entregas y fechas solo se permiten al comercial propietario o a la oficina', () => {
  const s = buildSeedState();
  const comercial = { ...s.users.find((u) => u.role === 'comercial')!, siteIds: [] };
  const admin = s.users.find((u) => u.role === 'admin')!;
  const v = { ...s.vehicles[0], salesRep: 'Otra Persona', salesRepId: null };
  s.vehicles = [v];
  for (const type of ['vehicle.deliver', 'vehicle.setDelivery'] as const) {
    const orden = cmd(type, { vehicleId: v.id, deliveryDate: null });
    assert.ok(comprobarPermiso(s, comercial, orden));
    assert.equal(puedeGestionarEntrega(s, comercial, v), false);
    assert.equal(comprobarPermiso(s, admin, orden), null);
    const propio = { ...s, vehicles: [{ ...v, salesRep: comercial.name, salesRepId: comercial.id }] };
    assert.equal(comprobarPermiso(propio, comercial, orden), null);
    assert.equal(puedeGestionarEntrega(propio, comercial, propio.vehicles[0]), true);
  }
});

test('un usuario nuevo crea su primera contraseña por enlace y usa su correo actualizado', async (t) => {
  const clave = randomBytes(24).toString('base64url');
  const otraClave = randomBytes(24).toString('base64url');
  const { servicio, correo, limpiar } = await servidorDePruebas();
  t.after(limpiar);
  const admin = servicio.estado.users.find((u) => u.role === 'admin')!;
  const nuevo = { ...admin, id: 'u-alta-fiabilidad', name: 'Persona Nueva', role: 'comercial', email: 'alta-fiabilidad@example.invalid' };
  await servicio.ejecutar(cmd('user.upsert', { user: nuevo }), admin);
  await servicio.pedirEnlace(nuevo.email);
  assert.equal(correo.enviados.length, 1);
  const codigo = correo.ultimoCodigo()!;
  assert.ok(codigo);
  await servicio.restablecer(codigo, clave);
  assert.equal((await servicio.login(nuevo.email, clave)).user.id, nuevo.id);
  await assert.rejects(servicio.restablecer(codigo, otraClave), /usado|caducado/);
  await servicio.pedirEnlace(nuevo.email);
  const enlaceAnterior = correo.ultimoCodigo()!;
  const cambiado = { ...nuevo, email: 'alta-nueva-direccion@example.invalid' };
  await servicio.ejecutar(cmd('user.upsert', { user: cambiado }), admin);
  await assert.rejects(servicio.restablecer(enlaceAnterior, otraClave), /usado|caducado/);
  await assert.rejects(servicio.login(nuevo.email, clave), /incorrectos/);
  assert.equal((await servicio.login(cambiado.email, clave)).user.id, nuevo.id);
  await assert.rejects(servicio.ejecutar(cmd('user.upsert', { user: { ...nuevo, id: 'otro', email: cambiado.email.toUpperCase() } }), admin), /Ya hay/);
});

test('el administrador conserva la contraseña cambiada después de reiniciar', async (t) => {
  // Claves efímeras: solo existen durante esta prueba, nunca en el repositorio.
  const inicial = randomBytes(24).toString('base64url');
  const cambiada = randomBytes(24).toString('base64url');
  const { servicio, reiniciar, limpiar } = await servidorDePruebas({ adminEmail: 'admin@urkiolacarservice.com', adminPassword: inicial });
  t.after(limpiar);
  const { user } = await servicio.login('admin@urkiolacarservice.com', inicial);
  await servicio.cambiarPassword(user, user.id, inicial, cambiada);
  const nuevo = await reiniciar();
  t.after(() => nuevo.cerrar());
  assert.equal((await nuevo.login(user.email, cambiada)).user.id, user.id);
  await assert.rejects(nuevo.login(user.email, inicial), /incorrectos/);
});

test('el reloj del servidor prepara el repaso del día sin abrir un cliente y no lo duplica', async (t) => {
  const { servicio, limpiar } = await servidorDePruebas();
  t.after(limpiar);
  const admin = servicio.estado.users.find((u) => u.role === 'admin')!;
  const hoy = new Date().toISOString();
  const alta = cmd('vehicle.create', { vin8: 'RELOJ001', location: { siteId: 'leioa' } });
  await servicio.ejecutar(alta, admin);
  const id = 'v-RELOJ001';
  await servicio.ejecutar(cmd('vehicle.setDelivery', { vehicleId: id, deliveryDate: hoy }), admin);
  const abrir = cmd('prep.create', { vehicleId: id, siteId: 'leioa' });
  await servicio.ejecutar(abrir, admin);
  const preparador = servicio.estado.users.find((u) => u.role === 'preparador')!;
  // El operario acepta el trabajo libre antes de darlo por terminado.
  await servicio.ejecutar(cmd('prep.start', { prepId: idCreadoPor('prep', abrir) }), preparador);
  assert.equal(servicio.estado.preparations.find(p => p.id === idCreadoPor('prep', abrir))?.preparerId, preparador.id);
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    ids.push(await servicio.guardarFoto(Buffer.from([137, 80, 78, 71, i]), 'image/png', preparador));
  }
  await servicio.ejecutar(cmd('prep.finish', {
    prepId: idCreadoPor('prep', abrir),
    finalPhotos: {
      frontLeft: `foto:${ids[0]}`,
      frontRight: `foto:${ids[1]}`,
      rearLeft: `foto:${ids[2]}`,
      rearRight: `foto:${ids[3]}`,
    },
  }), preparador);
  await servicio.barrerAvisos(hoy);
  await servicio.barrerAvisos(hoy);
  assert.equal(servicio.estado.requests.filter((r) => r.vehicleId === id && r.prepTipo === 'repaso').length, 1);
});
