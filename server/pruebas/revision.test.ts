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
import { bandejaDe, misCoches } from '../../src/data/selectors';
import type { AppState, Id } from '../../src/data/types';

let n = 0;
const orden = (x: Record<string, unknown>): Command =>
  ({ id: `rev-${(n += 1)}`, at: new Date().toISOString(), userId: 'u-admin', ...x }) as Command;
const aplicar = (s: AppState, x: Record<string, unknown>) => applyCommand(s, orden(x));

/** Un vehículo que no está en la operativa: existe en Quiter y nada más. */
function dormido(s: AppState) {
  // Que no sea uno ya entregado: ese está fuera porque se lo llevó el
  // cliente, y corregirle el papeleo no tiene que devolverlo a la flota.
  const v = s.vehicles.find((x) => !x.logisticActive && x.status !== 'entregado');
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

/* ═══════════ 7 · El registro de traslados ═══════════ */

test('entregar un traslado deja apuntado cuándo y quién', () => {
  // Un traslado terminado no decía cuándo se hizo, solo que ya no estaba
  // pendiente. Sin fecha de entrega no hay registro que enseñar a nadie.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  const crear = orden({
    type: 'request.create',
    requestType: 'traslado',
    vehicleId: v.id,
    siteId: 'leioa',
    to: { siteId: 'leioa' },
  });
  s = applyCommand(s, crear);
  const req = s.requests.find((r) => r.vehicleId === v.id && r.type === 'traslado')!;

  s = applyCommand(s, orden({ type: 'request.update', requestId: req.id, status: 'en_ruta' }));
  const entrega = orden({ type: 'request.update', requestId: req.id, status: 'terminada' });
  s = applyCommand(s, entrega);

  const fin = s.requests.find((r) => r.id === req.id)!;
  assert.equal(fin.status, 'terminada');
  assert.equal(fin.deliveredAt, entrega.at);
  assert.equal(fin.deliveredBy, entrega.userId);
  assert.deepEqual(revisar(s), []);
});

test('y también cuando lo cierra el movimiento que deja el coche en destino', () => {
  // Es el camino de verdad: el transportista pulsa «he entregado» y lo que
  // se manda es un movimiento, no un cambio de estado.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  s = applyCommand(
    s,
    orden({
      type: 'request.create',
      requestType: 'traslado',
      vehicleId: v.id,
      siteId: 'leioa',
      to: { siteId: 'leioa' },
    })
  );
  const req = s.requests.find((r) => r.vehicleId === v.id && r.type === 'traslado')!;
  s = applyCommand(s, orden({ type: 'request.update', requestId: req.id, status: 'en_ruta' }));

  const mov = orden({
    type: 'movement.register',
    vehicleId: v.id,
    to: { siteId: 'leioa' },
    completesTransfer: true,
  });
  s = applyCommand(s, mov);

  const fin = s.requests.find((r) => r.id === req.id)!;
  assert.equal(fin.status, 'terminada');
  assert.equal(fin.deliveredAt, mov.at);
  assert.equal(fin.deliveredBy, mov.userId);
  assert.deepEqual(revisar(s), []);
});

test('la hora de entrega no se reescribe si el comando llega dos veces', () => {
  // Regla de siempre: aplicarlo dos veces tiene que dar lo mismo. Aquí
  // importa el doble, porque la fecha es lo que se le enseña al proveedor.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  s = applyCommand(
    s,
    orden({
      type: 'request.create',
      requestType: 'traslado',
      vehicleId: v.id,
      siteId: 'leioa',
      to: { siteId: 'leioa' },
    })
  );
  const req = s.requests.find((r) => r.vehicleId === v.id && r.type === 'traslado')!;
  const entrega = orden({ type: 'request.update', requestId: req.id, status: 'terminada' });

  s = applyCommand(s, entrega);
  const primera = s.requests.find((r) => r.id === req.id)!.deliveredAt;

  // Otra vez, más tarde: la hora buena es la de la primera entrega.
  const masTarde = { ...entrega, id: 'rev-otro', at: new Date(Date.now() + 7_200_000).toISOString() } as Command;
  s = applyCommand(s, masTarde);
  assert.equal(s.requests.find((r) => r.id === req.id)!.deliveredAt, primera);
});

/* ═══════════ 8 · Los avisos llegan a quien tienen que llegar ═══════════ */

test('el aviso de coche listo va al comercial de ese coche, no a todos', () => {
  // Un aviso que le llega a todo el mundo no se lo cree nadie: en dos meses
  // deja de mirarse la campana.
  let s = buildSeedState();
  const juan = s.users.find((u) => u.name === 'Juan Bilbao')!;
  const v = s.vehicles.find((x) => x.logisticActive && !x.salesRep)!;
  s = aplicar(s, { type: 'vehicle.setSalesRep', vehicleId: v.id, salesRep: juan.name });

  const antes = s.inbox.length;
  s = aplicar(s, { type: 'prep.create', vehicleId: v.id, siteId: 'leioa' });
  const prep = s.preparations.find((p) => p.vehicleId === v.id)!;
  s = aplicar(s, { type: 'prep.start', prepId: prep.id });
  s = aplicar(s, { type: 'prep.finish', prepId: prep.id });

  const nuevos = s.inbox.slice(0, s.inbox.length - antes);
  const listo = nuevos.find((n) => n.vehicleId === v.id && n.body.includes('listo'));
  assert.ok(listo, `tenía que haber un aviso de coche listo: ${nuevos.map((n) => n.body).join(' | ')}`);
  assert.deepEqual(listo.userIds, [juan.id], 'solo al comercial de ese coche');
});

test('un coche sin comercial no genera un aviso que no va a leer nadie', () => {
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.logisticActive && !x.salesRep)!;
  const antes = s.inbox.length;
  s = aplicar(s, { type: 'prep.create', vehicleId: v.id, siteId: 'leioa' });
  const prep = s.preparations.find((p) => p.vehicleId === v.id)!;
  s = aplicar(s, { type: 'prep.start', prepId: prep.id });
  s = aplicar(s, { type: 'prep.finish', prepId: prep.id });
  const nuevos = s.inbox.slice(0, s.inbox.length - antes);
  assert.equal(
    nuevos.filter((n) => n.userIds && n.userIds.length === 0).length,
    0,
    'no se crean avisos sin destinatario'
  );
});

test('pedir una preparación avisa a los preparadores', () => {
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.logisticActive)!;
  const antes = s.inbox.length;
  s = aplicar(s, {
    type: 'request.create',
    requestType: 'preparacion',
    vehicleId: v.id,
    siteId: 'leioa',
    to: null,
  });
  const nuevos = s.inbox.slice(0, s.inbox.length - antes);
  const aviso = nuevos.find((n) => n.body.includes('preparación pedida'));
  assert.ok(aviso, 'el preparador tiene que enterarse sin entrar a mirar la cola');
  const preparadores = s.users.filter((u) => u.active && u.role === 'preparador').map((u) => u.id);
  assert.deepEqual([...(aviso.userIds ?? [])].sort(), preparadores.sort());
});

test('un traslado que nadie recoge acaba avisando a logística', () => {
  // Es donde se pierden los días: el plazo del transportista no empieza
  // hasta la recogida, así que un traslado olvidado no llega tarde nunca.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  const hace30h = new Date(Date.now() - 30 * 3_600_000).toISOString();
  s = applyCommand(s, {
    ...orden({
      type: 'request.create',
      requestType: 'traslado',
      vehicleId: v.id,
      siteId: 'leioa',
      to: { siteId: 'leioa' },
    }),
    at: hace30h,
  } as Command);

  const antes = s.inbox.length;
  s = aplicar(s, { type: 'alerts.sweep' });
  const nuevos = s.inbox.slice(0, s.inbox.length - antes);
  const aviso = nuevos.find((n) => n.vehicleId === v.id && n.body.includes('recogido las llaves'));
  assert.ok(aviso, 'tenía que avisar de que lleva 30 h sin recoger');
  const logistica = s.users.filter((u) => u.active && u.role === 'logistica').map((u) => u.id);
  assert.deepEqual([...(aviso.userIds ?? [])].sort(), logistica.sort());
});

test('el barrido no repite el mismo aviso aunque se lance veinte veces', () => {
  // La app lo lanza al abrirse: si cada apertura repitiera los avisos, la
  // bandeja se llenaría de lo mismo y dejaría de servir.
  let s = buildSeedState();
  s = aplicar(s, { type: 'alerts.sweep' });
  const despuesDelPrimero = s.inbox.length;
  for (let i = 0; i < 20; i++) s = aplicar(s, { type: 'alerts.sweep' });
  assert.equal(s.inbox.length, despuesDelPrimero, 'el mismo día no vuelve a avisar');
});

test('la bandeja de cada uno es la suya', () => {
  let s = buildSeedState();
  s = aplicar(s, { type: 'alerts.sweep' });
  const juan = s.users.find((u) => u.name === 'Juan Bilbao')!;
  const pedro = s.users.find((u) => u.name === 'Pedro Larrea')!;

  const deJuan = bandejaDe(s, juan);
  const dePedro = bandejaDe(s, pedro);
  // Ninguno puede ver un aviso dirigido en exclusiva al otro.
  assert.ok(
    !deJuan.some((n) => n.userIds?.length && !n.userIds.includes(juan.id)),
    'Juan no ve avisos que no son suyos'
  );
  assert.ok(
    !dePedro.some((n) => n.userIds?.length && !n.userIds.includes(pedro.id)),
    'Pedro no ve avisos que no son suyos'
  );
});

/* ═══════════ 9 · El motivo del retraso ═══════════ */

test('entregar fuera de plazo guarda el motivo; a tiempo no guarda nada', () => {
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  s = aplicar(s, {
    type: 'request.create',
    requestType: 'traslado',
    vehicleId: v.id,
    siteId: 'leioa',
    to: { siteId: 'leioa' },
  });
  const req = s.requests.find((r) => r.vehicleId === v.id && r.type === 'traslado')!;
  // Recoge las llaves hace tres días: el plazo de 48 h ya se ha pasado.
  s = applyCommand(s, {
    ...orden({ type: 'request.update', requestId: req.id, status: 'en_ruta' }),
    at: new Date(Date.now() - 72 * 3_600_000).toISOString(),
  } as Command);

  s = aplicar(s, {
    type: 'request.update',
    requestId: req.id,
    status: 'terminada',
    delayReason: 'llaves',
    delayNote: '  ',
  });
  const fin = s.requests.find((r) => r.id === req.id)!;
  assert.equal(fin.delayReason, 'llaves');
  assert.equal(fin.delayNote, null, 'una nota en blanco no se guarda');
});

test('un traslado entregado a tiempo no guarda motivo aunque lo manden', () => {
  // Sería la explicación de algo que no pasó.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  s = aplicar(s, {
    type: 'request.create',
    requestType: 'traslado',
    vehicleId: v.id,
    siteId: 'leioa',
    to: { siteId: 'leioa' },
  });
  const req = s.requests.find((r) => r.vehicleId === v.id && r.type === 'traslado')!;
  s = aplicar(s, { type: 'request.update', requestId: req.id, status: 'en_ruta' });
  s = aplicar(s, {
    type: 'request.update',
    requestId: req.id,
    status: 'terminada',
    delayReason: 'trafico',
  });
  assert.equal(s.requests.find((r) => r.id === req.id)!.delayReason, undefined);
});

/* ═══════════ 10 · Lo que encontró la segunda revisión a fondo ═══════════ */

/** Un traslado creado, recogido y entregado, con las horas que se le digan. */
function trasladoEntregado(hRecoge: number, hEntrega: number) {
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId === 'sondika')!;
  const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

  s = applyCommand(s, {
    ...orden({
      type: 'request.create',
      requestType: 'traslado',
      vehicleId: v.id,
      siteId: 'leioa',
      to: { siteId: 'leioa' },
    }),
    at: hace(hRecoge + 1),
  } as Command);
  const req = s.requests.find((r) => r.vehicleId === v.id && r.type === 'traslado')!;

  const recoger = { ...orden({ type: 'request.update', requestId: req.id, status: 'en_ruta' }), at: hace(hRecoge) } as Command;
  s = applyCommand(s, recoger);
  s = applyCommand(s, {
    ...orden({ type: 'movement.register', vehicleId: v.id, to: { siteId: 'leioa' }, completesTransfer: true }),
    at: hace(hEntrega),
  } as Command);

  return { estado: s, reqId: req.id, recoger };
}

test('un comando atrasado no resucita un traslado ya entregado', () => {
  // Pasa así: el transportista marca «he recogido las llaves» en un sótano
  // sin cobertura, entrega el coche una hora después ya con señal, y el
  // primer comando sube al final. Si se aplicara, el coche volvería a «los
  // llevo yo» y desaparecería del registro de entregados.
  const { estado, reqId, recoger } = trasladoEntregado(9, 5);
  assert.equal(estado.requests.find((r) => r.id === reqId)!.status, 'terminada');

  const despues = applyCommand(estado, recoger);
  const req = despues.requests.find((r) => r.id === reqId)!;
  assert.equal(req.status, 'terminada', 'el traslado sigue entregado');
  assert.ok(req.deliveredAt);
  assert.deepEqual(revisar(despues), []);
});

test('pero la oficina sí puede reabrirlo hoy, y entonces se borra la entrega', () => {
  // Si vuelve a estar pendiente es que no se entregó. Dejar la fecha puesta
  // metería en «Traslados hechos» un viaje que no está hecho, y ese registro
  // es lo que se le enseña a la empresa de transporte.
  const { estado, reqId } = trasladoEntregado(9, 5);
  const reabrir = aplicar(estado, { type: 'request.update', requestId: reqId, status: 'en_ruta' });

  const req = reabrir.requests.find((r) => r.id === reqId)!;
  assert.equal(req.status, 'en_ruta');
  assert.equal(req.deliveredAt, null, 'sin fecha de entrega');
  assert.equal(req.deliveredBy, null);
  assert.equal(req.delayReason, null, 'ni motivo de retraso de un retraso que ya no existe');
  assert.deepEqual(revisar(reabrir), []);
});

test('activar o pausar un aviso dos veces lo deja igual que una', () => {
  // Antes era un comando que invertía el valor: si la respuesta se perdía y
  // el comando se reintentaba, la regla volvía a como estaba y el aviso se
  // apagaba solo sin que nadie lo hubiera tocado.
  let s = buildSeedState();
  const regla = s.rules.find((r) => r.active)!;
  const pausar = orden({ type: 'rule.setActive', ruleId: regla.id, active: false });

  s = applyCommand(s, pausar);
  assert.equal(s.rules.find((r) => r.id === regla.id)!.active, false);

  s = applyCommand(s, pausar);
  assert.equal(s.rules.find((r) => r.id === regla.id)!.active, false, 'sigue pausada');
});

/* ═══════════════ 9 · El coche que se lleva el cliente ═══════════════ */

test('entregar un coche libera su plaza y lo saca de la operativa', () => {
  // Es el motivo del comando: un coche vendido que sigue apuntado en su
  // hueco se come la campa poco a poco, y el que baja a aparcar encuentra
  // un sitio marcado como lleno que está vacío.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.logisticActive && x.location?.positionId)!;
  const plaza = v.location!.positionId!;

  s = aplicar(s, { type: 'vehicle.deliver', vehicleId: v.id });
  const despues = s.vehicles.find((x) => x.id === v.id)!;

  assert.equal(despues.status, 'entregado');
  assert.equal(despues.logisticActive, false);
  assert.equal(despues.location, null);
  assert.ok(despues.deliveredAt, 'queda la fecha, que es lo que se cuenta por meses');
  assert.equal(
    s.vehicles.filter((x) => x.logisticActive && x.location?.positionId === plaza).length,
    0,
    'la plaza queda libre'
  );
  assert.deepEqual(revisar(s), []);
});

test('entregar cierra lo que tuviera pedido', () => {
  // Si no, el preparador se queda con una preparación en la cola de un
  // coche que ya no existe, y el transportista con un traslado imposible.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.logisticActive && x.location)!;
  s = aplicar(s, {
    type: 'request.create',
    requestType: 'preparacion',
    vehicleId: v.id,
    siteId: 'leioa',
    to: null,
  });
  s = aplicar(s, { type: 'prep.create', vehicleId: v.id, siteId: 'leioa' });
  const prep = s.preparations.find((p) => p.vehicleId === v.id)!;
  s = aplicar(s, { type: 'prep.start', prepId: prep.id });

  s = aplicar(s, { type: 'vehicle.deliver', vehicleId: v.id });

  assert.equal(
    s.requests.filter((r) => r.vehicleId === v.id && r.status !== 'terminada').length,
    0,
    'nada pendiente'
  );
  assert.equal(s.preparations.find((p) => p.id === prep.id)!.runState, 'terminado');
  assert.deepEqual(revisar(s), []);
});

test('entregar dos veces es como entregar una', () => {
  // El comando puede subir dos veces si se pierde la respuesta del
  // servidor: la segunda no puede volver a cerrar nada ni duplicar apuntes.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.logisticActive && x.location)!;
  const cmd = orden({ type: 'vehicle.deliver', vehicleId: v.id });

  const una = applyCommand(s, cmd);
  const dos = applyCommand(una, cmd);
  assert.deepEqual(dos, una, 'el segundo intento no cambia nada');
});

test('deshacer una entrega devuelve el coche sin dejarlo dado por entregado', () => {
  // Quien se equivoca al marcarlo lo ve enseguida. Si al volver se quedara
  // en «Entregado», el coche saldría en la flota diciendo que ya no está.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.logisticActive && x.location)!;
  s = aplicar(s, { type: 'vehicle.deliver', vehicleId: v.id });
  s = aplicar(s, { type: 'vehicle.activate', vehicleId: v.id });

  const despues = s.vehicles.find((x) => x.id === v.id)!;
  assert.equal(despues.logisticActive, true);
  assert.notEqual(despues.status, 'entregado');
  assert.equal(despues.deliveredAt, null, 'ya no cuenta como entregado este mes');
  assert.deepEqual(revisar(s), []);
});

test('un coche entregado no le sale al comercial entre sus coches por hacer', () => {
  // «Mis coches» es la lista de trabajo del comercial: lo entregado se va a
  // su pestaña aparte, que es un registro.
  let s = buildSeedState();
  const juan = s.users.find((u) => u.name === 'Juan Bilbao')!;
  const v = s.vehicles.find((x) => x.logisticActive && !x.salesRep)!;
  s = aplicar(s, { type: 'vehicle.setSalesRep', vehicleId: v.id, salesRep: juan.name });

  assert.ok(misCoches(s, juan).some((x) => x.vehicle.id === v.id && x.fase !== 'entregado'));

  s = aplicar(s, { type: 'vehicle.deliver', vehicleId: v.id });
  const mio = misCoches(s, juan).find((x) => x.vehicle.id === v.id)!;
  assert.equal(mio.fase, 'entregado');
});

test('verlo en una plaza deshace la entrega: manda lo que se ve', () => {
  // Es la misma regla de siempre con las plazas: si el coche está aquí,
  // está aquí. Un «entregado» de un coche que aparece en el recuento era un
  // error al marcarlo, y dejarlo entregado con una plaza ocupada es lo peor
  // de los dos mundos.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.logisticActive && x.location?.positionId)!;
  s = aplicar(s, { type: 'vehicle.deliver', vehicleId: v.id });

  s = aplicar(s, { type: 'vehicle.check', vehicleId: v.id, positionId: v.location!.positionId });
  const despues = s.vehicles.find((x) => x.id === v.id)!;

  assert.equal(despues.status, 'aparcado', 'vuelve a estar aparcado donde se le ha visto');
  assert.equal(despues.logisticActive, true);
  assert.equal(despues.deliveredAt, null);
  assert.deepEqual(revisar(s), []);
});

test('corregir el papeleo de un coche entregado no lo devuelve a la flota', () => {
  // Cambiar quién lo vendió o un campo propio de un coche que se llevó el
  // cliente hace tres semanas es papeleo, no verlo en la campa. Si lo
  // reactivara, volvería a la flota de todos sin que nadie lo haya visto.
  let s = buildSeedState();
  const v = s.vehicles.find((x) => x.logisticActive && x.location)!;
  s = aplicar(s, { type: 'vehicle.deliver', vehicleId: v.id });

  s = aplicar(s, { type: 'vehicle.setSalesRep', vehicleId: v.id, salesRep: 'Juan Bilbao' });
  const despues = s.vehicles.find((x) => x.id === v.id)!;

  assert.equal(despues.salesRep, 'Juan Bilbao', 'el dato se corrige');
  assert.equal(despues.status, 'entregado', 'pero sigue entregado');
  assert.equal(despues.logisticActive, false);
  assert.deepEqual(revisar(s), []);
});
