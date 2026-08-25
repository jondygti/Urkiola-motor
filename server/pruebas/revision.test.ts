/**
 * Lo que encontró el disparo al azar.
 *
 * Cada prueba de aquí es un fallo que estuvo dentro y que nadie vio
 * probando a mano, porque para dar con él había que hacer las cosas en un
 * orden que a nadie se le ocurre. Están escritas una a una para que, si
 * alguna vuelve, se sepa exactamente cuál es y por qué importaba.
 *
 * Se prueban contra `applyCommand` directamente y no contra el servidor
 * entero: son reglas de los datos, y valen igual en el móvil sin cobertura
 * que en el servidor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import { revisar } from './invariantes';
import type { AppState, Id } from '../../src/data/types';

let n = 0;
const orden = (x: Record<string, unknown>): Command =>
  ({ id: `rev-${(n += 1)}`, at: new Date().toISOString(), userId: 'u-admin', ...x }) as Command;
const aplicar = (s: AppState, x: Record<string, unknown>) => applyCommand(s, orden(x));

/** Un vehículo que no está en la operativa: existe en Quiter y nada más. */
function dormido(s: AppState) {
  const v = s.vehicles.find((x) => !x.logisticActive);
  assert.ok(v, 'el parque de ejemplo tiene que traer algún coche fuera de la operativa');
  return v;
}

/* ═══════════ 1 · La activación que se perdía por el camino ═══════════ */

test('pedir un traslado de un coche fuera de la operativa lo mete en la operativa', () => {
  // Era el fallo más caro de los encontrados: el traslado se creaba, pero el
  // coche seguía marcado como fuera de la operativa, así que no salía en
  // ninguna pantalla. Nadie lo trasladaba y nadie sabía que estaba pedido.
  const s = buildSeedState();
  const v = dormido(s);
  const t = aplicar(s, {
    type: 'request.create',
    requestType: 'traslado',
    vehicleId: v.id,
    siteId: 'leioa',
    to: { siteId: 'leioa' },
  });
  assert.equal(t.requests.filter((r) => r.vehicleId === v.id).length, 1);
  assert.equal(t.vehicles.find((x) => x.id === v.id)?.logisticActive, true);
  assert.deepEqual(revisar(t), []);
});

test('abrir una preparación de un coche fuera de la operativa lo mete en la operativa', () => {
  const s = buildSeedState();
  const v = dormido(s);
  const t = aplicar(s, { type: 'prep.create', vehicleId: v.id, siteId: 'leioa' });
  assert.equal(t.preparations.filter((p) => p.vehicleId === v.id).length, 1);
  assert.equal(t.vehicles.find((x) => x.id === v.id)?.logisticActive, true);
  assert.deepEqual(revisar(t), []);
});

test('la fecha de entrega, el comercial y los campos propios también lo activan', () => {
  const s = buildSeedState();
  const v = dormido(s);
  const activo = (t: AppState) => t.vehicles.find((x) => x.id === v.id)?.logisticActive;

  assert.equal(activo(aplicar(s, { type: 'vehicle.setDelivery', vehicleId: v.id, deliveryDate: new Date().toISOString() })), true);
  assert.equal(activo(aplicar(s, { type: 'vehicle.setSalesRep', vehicleId: v.id, salesRep: 'Juan Bilbao' })), true);

  const campo = s.config.customFields[0];
  if (campo) {
    assert.equal(activo(aplicar(s, { type: 'vehicle.setCustom', vehicleId: v.id, fieldId: campo.id, value: 'x' })), true);
  }
});

/* ═══════════ 2 · Una plaza, un coche: también al comprobar ═══════════ */

test('comprobar un coche en una plaza ocupada echa al que estaba apuntado', () => {
  // La regla ya estaba puesta al mover, al descargar y al contar, pero no al
  // comprobar: quedaban los dos coches en el mismo hueco. Quien bajara a la
  // campa a por el segundo se encontraría el sitio con otro coche dentro.
  const s = buildSeedState();
  const ocupado = s.vehicles.find((v) => v.location?.positionId)!;
  const plaza = ocupado.location!.positionId!;
  const otro = s.vehicles.find((v) => v.id !== ocupado.id && v.location?.positionId !== plaza)!;

  const t = aplicar(s, { type: 'vehicle.check', vehicleId: otro.id, positionId: plaza });

  assert.equal(t.vehicles.find((v) => v.id === otro.id)?.location?.positionId, plaza);
  assert.equal(t.vehicles.find((v) => v.id === ocupado.id)?.location?.positionId, undefined);
  // El que se queda sin plaza sigue en su zona y con su apunte en el historial.
  assert.ok(t.vehicles.find((v) => v.id === ocupado.id)?.location?.zoneId);
  assert.ok(t.events.some((e) => e.vehicleId === ocupado.id && e.title.includes('Plaza liberada')));
  assert.deepEqual(revisar(t), []);
});

test('dar de alta un coche en una plaza ocupada echa igualmente al que estaba', () => {
  const s = buildSeedState();
  const ocupado = s.vehicles.find((v) => v.location?.positionId)!;
  const plaza = ocupado.location!.positionId!;
  const t = aplicar(s, {
    type: 'vehicle.create',
    vin8: 'NUEVO123',
    location: { siteId: ocupado.location!.siteId, positionId: plaza },
  });
  assert.equal(t.vehicles.find((v) => v.id === ocupado.id)?.location?.positionId, undefined);
  assert.deepEqual(revisar(t), []);
});

/* ═══════════ 3 · La plaza manda, y la inventada no vale ═══════════ */

test('una plaza de otra campa lleva el coche a esa campa, no a media ubicación', () => {
  // Antes se mezclaba: la sede de donde creíamos que estaba el coche con la
  // zona de la plaza nueva. Salía «Sondika · zona de Anoeta», que no existe.
  const s = buildSeedState();
  const enSondika = s.vehicles.find((v) => v.location?.siteId === 'sondika')!;
  const plazaDeOtra = s.positions.find((p) => {
    const z = s.zones.find((x) => x.id === p.zoneId);
    return z && z.siteId !== 'sondika';
  })!;
  const zona = s.zones.find((z) => z.id === plazaDeOtra.zoneId)!;

  const t = aplicar(s, { type: 'vehicle.check', vehicleId: enSondika.id, positionId: plazaDeOtra.id });
  const loc = t.vehicles.find((v) => v.id === enSondika.id)?.location;

  assert.equal(loc?.siteId, zona.siteId);
  assert.equal(loc?.zoneId, zona.id);
  assert.deepEqual(revisar(t), []);
});

test('una plaza que no existe no mueve el coche a ninguna parte', () => {
  // Regla de la casa: la zona basta, y una plaza inventada deja ocupado un
  // hueco que está libre.
  const s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  const t = aplicar(s, {
    type: 'movement.register',
    vehicleId: v.id,
    to: { siteId: 'leioa', zoneId: 'leioa-park-01', positionId: 'plaza-que-no-existe' },
  });
  const loc = t.vehicles.find((x) => x.id === v.id)?.location;
  assert.equal(loc?.siteId, 'leioa');
  assert.equal(loc?.zoneId, 'leioa-park-01');
  assert.equal(loc?.positionId, undefined, 'la plaza inventada no se guarda');
  assert.deepEqual(revisar(t), []);
});

test('mover un coche a una sede que no existe no lo mueve', () => {
  const s = buildSeedState();
  const v = s.vehicles.find((x) => x.location)!;
  const antes = v.location;
  const t = aplicar(s, { type: 'movement.register', vehicleId: v.id, to: { siteId: 'sede-inventada' } });
  assert.deepEqual(t.vehicles.find((x) => x.id === v.id)?.location, antes);
  assert.equal(t.movements.length, s.movements.length);
});

/* ═══════════ 4 · Sondika almacena, no prepara ═══════════ */

test('no se abre una preparación en una sede que no prepara', () => {
  const s = buildSeedState();
  assert.equal(s.sites.find((x) => x.id === 'sondika')?.prepares, false);
  const v = s.vehicles[0];
  const t = aplicar(s, { type: 'prep.create', vehicleId: v.id, siteId: 'sondika' });
  assert.equal(t.preparations.length, s.preparations.length);
});

test('ni se pide preparar en una sede que no prepara', () => {
  const s = buildSeedState();
  const v = s.vehicles[0];
  const t = aplicar(s, {
    type: 'request.create',
    requestType: 'preparacion',
    vehicleId: v.id,
    siteId: 'sondika',
    to: null,
  });
  assert.equal(t.requests.length, s.requests.length);
});

test('una sede no deja de preparar con preparaciones a medias dentro', () => {
  // Se terminan primero: si no, ese trabajo se queda en tierra de nadie.
  const s = buildSeedState();
  const abierta = s.preparations.find((p) => p.runState !== 'terminado')!;
  const sede = s.sites.find((x) => x.id === abierta.siteId)!;
  const t = aplicar(s, { type: 'site.upsert', site: { ...sede, prepares: false } });
  assert.equal(t.sites.find((x) => x.id === sede.id)?.prepares, true);
  assert.deepEqual(revisar(t), []);
});

/* ═══════════ 5 · Borrar sin dejar cosas colgando ═══════════ */

test('no se borra un rol que aún tiene gente, aunque esté dada de baja', () => {
  // Al volver a dar de alta a esa persona se encontraría con un rol que ya
  // no existe: sin permisos y con pantallas que no saben qué enseñarle.
  let s = buildSeedState();
  s = aplicar(s, {
    type: 'role.upsert',
    role: { id: 'jefe-campa', name: 'Jefe de campa', label: 'Jefe de campa', builtin: false, permissions: ['flota.ver'], mobileSections: [] },
  });
  const base = s.users[0];
  s = aplicar(s, {
    type: 'user.upsert',
    user: { ...base, id: 'u-baja', name: 'Ana Prueba', email: 'ana@urkiolacarservice.com', role: 'jefe-campa', active: false, siteIds: [] },
  });
  const t = aplicar(s, { type: 'role.delete', roleId: 'jefe-campa' });

  assert.ok(t.config.roles.some((r) => r.id === 'jefe-campa'), 'el rol no se borra');
  assert.deepEqual(revisar(t), []);
});

test('no se borra una sede con traslados pedidos hacia ella', () => {
  let s = buildSeedState();
  // Se vacía Irun de coches, que es lo único que se miraba antes.
  for (const v of s.vehicles.filter((v) => v.location?.siteId === 'irun')) {
    s = aplicar(s, { type: 'movement.register', vehicleId: v.id, to: { siteId: 'sondika' } });
  }
  const pendientes = s.requests.filter((r) => r.siteId === 'irun').length;
  assert.ok(pendientes > 0, 'el parque de ejemplo trae encargos hacia Irun');

  const t = aplicar(s, { type: 'site.delete', siteId: 'irun' });
  assert.ok(t.sites.some((x) => x.id === 'irun'), 'la sede no se borra');
  assert.deepEqual(revisar(t), []);
});

test('una sede recién creada por error sí se borra', () => {
  // La regla no puede ser «no se borra nunca»: equivocarse escribiendo el
  // nombre de una sede tiene que tener arreglo.
  let s = buildSeedState();
  s = aplicar(s, { type: 'site.upsert', site: { id: 'sondkia', name: 'Sondkia', kind: 'campa', prepares: false } });
  const t = aplicar(s, { type: 'site.delete', siteId: 'sondkia' });
  assert.equal(t.sites.some((x) => x.id === 'sondkia'), false);
});

/* ═══════════ 6 · Los relojes no van hacia atrás ═══════════ */

test('una preparación no termina antes de haber empezado', () => {
  // Un móvil con la hora mal puesta registraría una preparación que dura
  // menos de cero.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => !s.preparations.some((p) => p.vehicleId === x.id && p.runState !== 'terminado'))!;
  const crear = orden({ type: 'prep.create', vehicleId: v.id, siteId: 'leioa' });
  s = applyCommand(s, crear);
  const prep = s.preparations.find((p) => p.vehicleId === v.id)!;
  s = applyCommand(s, orden({ type: 'prep.start', prepId: prep.id }));

  const enElPasado = new Date(Date.now() - 3_600_000).toISOString();
  s = applyCommand(s, { ...orden({ type: 'prep.finish', prepId: prep.id }), at: enElPasado } as Command);

  const fin = s.preparations.find((p) => p.id === prep.id)!;
  assert.ok(fin.finishedAt! >= fin.startedAt!, `${fin.finishedAt} no puede ser anterior a ${fin.startedAt}`);
  assert.deepEqual(revisar(s), []);
});
