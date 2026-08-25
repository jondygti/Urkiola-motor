/**
 * Lo que el contrato exige del servidor cuando se trabaja sin cobertura:
 * idempotencia, orden, fechas de cuando se hizo y no de cuando llegó, y
 * los códigos de error correctos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ErrorHttp } from '../src/errores';
import { servidorDePruebas, cmd, CLAVE } from './ayuda';
import type { User } from '../../src/data/types';

async function entrar(s: Awaited<ReturnType<typeof servidorDePruebas>>['servicio'], email: string) {
  const { user } = await s.login(email, CLAVE);
  return user;
}

test('un comando repetido no se aplica dos veces', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const log = await entrar(p.servicio, 'logistica@urkiolacarservice.com');

  const vehiculo = p.servicio.estado.vehicles.find((v) => v.location?.siteId === 'sondika')!;
  const orden = cmd('vehicle.check', { vehicleId: vehiculo.id }, { id: 'cmd-repe', userId: log.id });

  const antes = p.servicio.estado.events.length;
  const primera = await p.servicio.ejecutar(orden, log);
  const segunda = await p.servicio.ejecutar(orden, log);

  assert.equal(primera.repetido, false);
  assert.equal(segunda.repetido, true);
  // Un solo apunte en el histórico, no dos.
  assert.equal(p.servicio.estado.events.length, antes + 1);
});

test('los identificadores no dependen de la suerte: el móvil y el servidor coinciden', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const log = await entrar(p.servicio, 'logistica@urkiolacarservice.com');

  // Un vehículo sin preparación abierta.
  const conPrep = new Set(
    p.servicio.estado.preparations.filter((x) => x.runState !== 'terminado').map((x) => x.vehicleId)
  );
  const vehiculo = p.servicio.estado.vehicles.find((v) => !conPrep.has(v.id))!;

  const orden = cmd(
    'prep.create',
    { vehicleId: vehiculo.id, siteId: 'leioa' },
    { id: 'cmd-abc', userId: log.id }
  );
  await p.servicio.ejecutar(orden, log);

  const prep = p.servicio.estado.preparations.find((x) => x.vehicleId === vehiculo.id)!;
  // Este es el punto: el móvil, al aplicar el mismo comando en local, saca
  // exactamente este id, así que el siguiente comando ("empezar prep-…")
  // encuentra la preparación en el servidor.
  assert.equal(prep.id, 'prep-cmd-abc');

  // Y el que viene detrás funciona.
  const pedro = await entrar(p.servicio, 'pedro@urkiolacarservice.com');
  await p.servicio.ejecutar(
    cmd('prep.start', { prepId: 'prep-cmd-abc' }, { id: 'cmd-abd', userId: pedro.id }),
    pedro
  );
  assert.equal(
    p.servicio.estado.preparations.find((x) => x.id === 'prep-cmd-abc')?.runState,
    'en_curso'
  );
});

test('un comando que llega tarde cuenta con su fecha, no con la de llegada', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const log = await entrar(p.servicio, 'logistica@urkiolacarservice.com');
  const pedro = await entrar(p.servicio, 'pedro@urkiolacarservice.com');

  const conPrep = new Set(
    p.servicio.estado.preparations.filter((x) => x.runState !== 'terminado').map((x) => x.vehicleId)
  );
  const vehiculo = p.servicio.estado.vehicles.find((v) => !conPrep.has(v.id))!;

  const hace3h = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const hace2h = new Date(Date.now() - 2 * 3_600_000).toISOString();

  await p.servicio.ejecutar(
    cmd('prep.create', { vehicleId: vehiculo.id, siteId: 'leioa' }, { id: 'c1', at: hace3h, userId: log.id }),
    log
  );
  await p.servicio.ejecutar(
    cmd('prep.start', { prepId: 'prep-c1' }, { id: 'c2', at: hace3h, userId: pedro.id }),
    pedro
  );
  // El operario la pausó a las 2 h, pero el comando llega ahora, una hora
  // más tarde: el tiempo efectivo tiene que ser 1 h, no 3.
  await p.servicio.ejecutar(
    cmd('prep.pause', { prepId: 'prep-c1', reason: 'Material' }, { id: 'c3', at: hace2h, userId: pedro.id }),
    pedro
  );

  const prep = p.servicio.estado.preparations.find((x) => x.id === 'prep-c1')!;
  const horas = prep.effectiveMs / 3_600_000;
  assert.ok(horas > 0.99 && horas < 1.01, `esperaba ~1 h de trabajo efectivo, salió ${horas}`);
});

test('una fecha en el futuro (reloj del móvil mal puesto) se corrige', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const log = await entrar(p.servicio, 'logistica@urkiolacarservice.com');

  const vehiculo = p.servicio.estado.vehicles.find((v) => v.location?.siteId === 'sondika')!;
  const dentroDeUnAno = new Date(Date.now() + 365 * 86_400_000).toISOString();
  await p.servicio.ejecutar(
    cmd('vehicle.check', { vehicleId: vehiculo.id }, { id: 'c-futuro', at: dentroDeUnAno, userId: log.id }),
    log
  );

  const v = p.servicio.estado.vehicles.find((x) => x.id === vehiculo.id)!;
  assert.ok(new Date(v.lastCheckAt!).getTime() <= Date.now() + 1000);
});

test('el usuario del comando es el del token, diga lo que diga el cuerpo', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const pedro = await entrar(p.servicio, 'pedro@urkiolacarservice.com');

  const vehiculo = p.servicio.estado.vehicles.find((v) => v.location?.siteId === 'leioa')!;
  await p.servicio.ejecutar(
    // Dice ser el administrador. No cuela.
    cmd('vehicle.check', { vehicleId: vehiculo.id }, { id: 'c-suplanta', userId: 'u-admin' }),
    pedro
  );

  const evento = p.servicio.estado.events[0];
  assert.equal(evento.userId, 'u-pedro');
});

test('sin permiso se responde 403, que la app trata como rechazo', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const pedro = await entrar(p.servicio, 'pedro@urkiolacarservice.com');

  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('config.update', { patch: { staleCheckHours: 1 } }, { userId: pedro.id }),
        pedro
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('un comando inventado se responde 400 y no se guarda', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const log = await entrar(p.servicio, 'logistica@urkiolacarservice.com');

  await assert.rejects(
    () => p.servicio.ejecutar({ type: 'borrar.todo', id: 'x', at: new Date().toISOString() }, log),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 400
  );
});

test('quien tiene sedes asignadas no toca las de los demás', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  // Nerea es de recepción en Sondika.
  const nerea = await entrar(p.servicio, 'recepcion@urkiolacarservice.com');

  const enLeioa = p.servicio.estado.vehicles.find((v) => v.location?.siteId === 'leioa')!;
  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('vehicle.check', { vehicleId: enLeioa.id }, { userId: nerea.id }),
        nerea
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('el transportista solo mueve los coches de sus traslados', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const iker = await entrar(p.servicio, 'transporte@urkiolacarservice.com');

  const suyo = p.servicio.estado.requests.find(
    (r) => r.type === 'traslado' && r.status !== 'terminada' && r.carrierId === 'gruas-francis'
  )!;
  const ajeno = p.servicio.estado.vehicles.find(
    (v) =>
      v.id !== suyo.vehicleId &&
      !p.servicio.estado.requests.some(
        (r) => r.vehicleId === v.id && r.type === 'traslado' && r.status !== 'terminada'
      )
  )!;

  // El suyo, sí.
  const r = await p.servicio.ejecutar(
    cmd(
      'movement.register',
      { vehicleId: suyo.vehicleId, to: { siteId: suyo.siteId }, completesTransfer: true },
      { userId: iker.id }
    ),
    iker
  );
  assert.equal(r.repetido, false);

  // Cualquier otro, no.
  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('movement.register', { vehicleId: ajeno.id, to: { siteId: 'sondika' } }, { userId: iker.id }),
        iker
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('el transportista no puede reasignarse traslados de otra empresa', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const iker = await entrar(p.servicio, 'transporte@urkiolacarservice.com');

  const deLaOtra = p.servicio.estado.requests.find(
    (r) => r.type === 'traslado' && r.status !== 'terminada' && r.carrierId === 'gruas-betigoiz'
  );
  if (!deLaOtra) return; // el parque de ejemplo podría no tener ninguno

  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('request.update', { requestId: deLaOtra.id, status: 'en_ruta' }, { userId: iker.id }),
        iker
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('un usuario desactivado no entra', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const admin = await entrar(p.servicio, 'admin@urkiolacarservice.com');

  const pedro = p.servicio.estado.users.find((u) => u.id === 'u-pedro')!;
  await p.servicio.ejecutar(
    cmd('user.upsert', { user: { ...pedro, active: false } as User }, { userId: admin.id }),
    admin
  );

  await assert.rejects(
    () => p.servicio.login('pedro@urkiolacarservice.com', CLAVE),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 401
  );
});

test('el correo o la contraseña mal dan el mismo mensaje', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const fallo1 = await p.servicio.login('nadie@urkiolacarservice.com', 'x').catch((e) => e);
  const fallo2 = await p.servicio.login('admin@urkiolacarservice.com', 'mal').catch((e) => e);
  assert.equal((fallo1 as Error).message, (fallo2 as Error).message);
});

test('el transportista sí puede recoger y entregar lo suyo, y nada más', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const iker = await entrar(p.servicio, 'transporte@urkiolacarservice.com');

  const suyo = p.servicio.estado.requests.find(
    (r) =>
      r.type === 'traslado' &&
      (r.status === 'solicitada' || r.status === 'asignada') &&
      r.carrierId === 'gruas-francis'
  )!;

  await p.servicio.ejecutar(
    cmd('request.update', { requestId: suyo.id, status: 'en_ruta' }, { userId: iker.id }),
    iker
  );
  const tras = p.servicio.estado.requests.find((r) => r.id === suyo.id)!;
  assert.equal(tras.status, 'en_ruta');
  // Al recoger las llaves empieza a contar el plazo comprometido.
  assert.ok(tras.dueAt, 'la recogida tiene que fijar la fecha límite');

  // Pero abrir una preparación, ni de broma.
  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('prep.create', { vehicleId: suyo.vehicleId, siteId: 'leioa' }, { userId: iker.id }),
        iker
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('un rol con permisos de más no convierte a un externo en interno', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const admin = await entrar(p.servicio, 'admin@urkiolacarservice.com');
  const iker = await entrar(p.servicio, 'transporte@urkiolacarservice.com');

  // Alguien le da todos los permisos al rol de transportista desde
  // Administración, por error o por prisa.
  const rol = p.servicio.estado.config.roles.find((r) => r.id === 'transportista')!;
  await p.servicio.ejecutar(
    cmd(
      'role.upsert',
      { role: { ...rol, permissions: [...p.servicio.estado.config.roles[0].permissions] } },
      { userId: admin.id }
    ),
    admin
  );

  // Sigue sin poder tocar un coche que no es de sus traslados.
  const ajeno = p.servicio.estado.vehicles.find(
    (v) =>
      !p.servicio.estado.requests.some(
        (r) => r.vehicleId === v.id && r.type === 'traslado' && r.status !== 'terminada'
      )
  )!;
  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('vehicle.check', { vehicleId: ajeno.id }, { userId: iker.id }),
        iker
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('el preparador abre la preparación que le han pedido, pero no se la inventa', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const comercial = await entrar(p.servicio, 'juan@urkiolacarservice.com');
  const pedro = await entrar(p.servicio, 'pedro@urkiolacarservice.com');

  const conPrep = new Set(
    p.servicio.estado.preparations.filter((x) => x.runState !== 'terminado').map((x) => x.vehicleId)
  );
  const pedidos = new Set(
    p.servicio.estado.requests
      .filter((r) => r.type === 'preparacion' && r.status !== 'terminada')
      .map((r) => r.vehicleId)
  );
  const [uno, otro] = p.servicio.estado.vehicles.filter(
    (v) => v.location?.siteId === 'leioa' && !conPrep.has(v.id) && !pedidos.has(v.id)
  );

  // Sin que nadie la haya pedido, no.
  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('prep.create', { vehicleId: otro.id, siteId: 'leioa' }, { userId: pedro.id }),
        pedro
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );

  // El comercial la pide…
  await p.servicio.ejecutar(
    cmd(
      'request.create',
      { requestType: 'preparacion', vehicleId: uno.id, siteId: 'leioa', to: { siteId: 'leioa' } },
      { userId: comercial.id }
    ),
    comercial
  );

  // …y ahora el preparador sí puede abrirla.
  const r = await p.servicio.ejecutar(
    cmd('prep.create', { vehicleId: uno.id, siteId: 'leioa', preparerId: pedro.id }, { id: 'c-abre', userId: pedro.id }),
    pedro
  );
  assert.equal(r.repetido, false);
  assert.ok(p.servicio.estado.preparations.some((x) => x.id === 'prep-c-abre'));

  // Y la solicitud queda en curso y a su nombre, sin tocarla a mano.
  const solicitud = p.servicio.estado.requests.find(
    (x) => x.type === 'preparacion' && x.vehicleId === uno.id
  )!;
  assert.equal(solicitud.status, 'en_curso');
  assert.equal(solicitud.assignedTo, pedro.id);
});

test('un coche que no está en el parque se puede dar de alta con el bastidor', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const nerea = await entrar(p.servicio, 'recepcion@urkiolacarservice.com');

  const antes = p.servicio.estado.vehicles.length;
  await p.servicio.ejecutar(
    cmd('vehicle.create', { vin8: 'ZZ998877', plate: '1111 ZZZ' }, { id: 'c-alta', userId: nerea.id }),
    nerea
  );

  const nuevo = p.servicio.estado.vehicles.find((v) => v.vin8 === 'ZZ998877');
  assert.equal(p.servicio.estado.vehicles.length, antes + 1);
  assert.equal(nuevo?.id, 'v-ZZ998877');
  assert.equal(nuevo?.plate, '1111 ZZZ');
  // Entra activo: si no, no saldría en la operativa y no serviría de nada.
  assert.equal(nuevo?.logisticActive, true);
  // Y lo que no se sabe queda marcado como tal, no inventado.
  assert.equal(nuevo?.brand, 'Sin identificar');
});

test('dar de alta dos veces el mismo bastidor no duplica el coche', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const nerea = await entrar(p.servicio, 'recepcion@urkiolacarservice.com');

  await p.servicio.ejecutar(cmd('vehicle.create', { vin8: 'AB123456' }, { id: 'c-1', userId: nerea.id }), nerea);
  const despuesDeUno = p.servicio.estado.vehicles.length;

  // Otro comando distinto (otro móvil, otra persona) con el mismo bastidor.
  await p.servicio.ejecutar(
    cmd('vehicle.create', { vin8: 'ab123456', plate: '2222 BBB' }, { id: 'c-2', userId: nerea.id }),
    nerea
  );

  assert.equal(p.servicio.estado.vehicles.length, despuesDeUno);
  // Y la segunda vez completa lo que faltaba en vez de perderse.
  assert.equal(p.servicio.estado.vehicles.find((v) => v.vin8 === 'AB123456')?.plate, '2222 BBB');
});

test('el alta enlaza la línea del camión que estaba suelta', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const nerea = await entrar(p.servicio, 'recepcion@urkiolacarservice.com');

  await p.servicio.ejecutar(
    cmd('reception.create', { truckPlate: '0000 TRK', carrier: 'Grúas Francis', siteId: 'sondika' }, { id: 'c-rec', userId: nerea.id }),
    nerea
  );
  await p.servicio.ejecutar(
    cmd('reception.line', { receptionId: 'rec-c-rec', ref: 'NUEVO123' }, { userId: nerea.id }),
    nerea
  );

  const suelta = p.servicio.estado.receptions[0].lines.find((l) => l.ref === 'NUEVO123');
  assert.equal(suelta?.vehicleId, null, 'antes del alta la línea no apunta a ningún coche');

  await p.servicio.ejecutar(
    cmd('vehicle.create', { vin8: 'NUEVO123' }, { id: 'c-alta2', userId: nerea.id }),
    nerea
  );

  const enlazada = p.servicio.estado.receptions[0].lines.find((l) => l.ref === 'NUEVO123');
  assert.equal(enlazada?.vehicleId, 'v-NUEVO123');
});

test('un preparador no da de alta vehículos', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const pedro = await entrar(p.servicio, 'pedro@urkiolacarservice.com');

  await assert.rejects(
    () => p.servicio.ejecutar(cmd('vehicle.create', { vin8: 'XX000111' }, { userId: pedro.id }), pedro),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('una configuración inválida se rechaza en vez de romper la app de todos', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const admin = await entrar(p.servicio, 'admin@urkiolacarservice.com');

  const malas: Record<string, unknown>[] = [
    { staleCheckHours: 'muchas' },
    { transferDeadlineHours: 0 },
    { prepDeadlineHours: -5 },
    { prepTargetMinutes: { VN: 'dos horas' } },
    { waitReasons: 'Material' },
  ];

  for (const patch of malas) {
    await assert.rejects(
      () => p.servicio.ejecutar(cmd('config.update', { patch }, { userId: admin.id }), admin),
      (e: unknown) => e instanceof ErrorHttp && e.codigo === 400,
      `debería rechazar ${JSON.stringify(patch)}`
    );
  }

  // Y la buena pasa.
  await p.servicio.ejecutar(
    cmd('config.update', { patch: { prepTargetMinutes: { VN: 90, VO: 150 } } }, { userId: admin.id }),
    admin
  );
  assert.equal(p.servicio.estado.config.prepTargetMinutes.VN, 90);
});


test('el comercial se queda un coche libre, y lo suelta', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const juan = await entrar(p.servicio, 'juan@urkiolacarservice.com');

  const libre = p.servicio.estado.vehicles.find((v) => v.logisticActive && !v.salesRep)!;

  await p.servicio.ejecutar(
    cmd('vehicle.setSalesRep', { vehicleId: libre.id, salesRep: juan.name }, { id: 'c-mio', userId: juan.id }),
    juan
  );
  assert.equal(p.servicio.estado.vehicles.find((v) => v.id === libre.id)?.salesRep, 'Juan Bilbao');

  // Y queda el apunte de quién lo hizo.
  assert.match(p.servicio.estado.events[0].title, /Comercial asignado/);

  // Soltarlo también puede.
  await p.servicio.ejecutar(
    cmd('vehicle.setSalesRep', { vehicleId: libre.id, salesRep: null }, { userId: juan.id }),
    juan
  );
  assert.equal(p.servicio.estado.vehicles.find((v) => v.id === libre.id)?.salesRep, null);
});

test('un comercial no le quita un coche a otro', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const juan = await entrar(p.servicio, 'juan@urkiolacarservice.com');

  const deOtro = p.servicio.estado.vehicles.find(
    (v) => v.logisticActive && v.salesRep && !/juan/i.test(v.salesRep)
  )!;

  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('vehicle.setSalesRep', { vehicleId: deOtro.id, salesRep: juan.name }, { userId: juan.id }),
        juan
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('un comercial tampoco se lo asigna a un tercero', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const juan = await entrar(p.servicio, 'juan@urkiolacarservice.com');
  const libre = p.servicio.estado.vehicles.find((v) => v.logisticActive && !v.salesRep)!;

  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd('vehicle.setSalesRep', { vehicleId: libre.id, salesRep: 'Ane' }, { userId: juan.id }),
        juan
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('la oficina sí puede reasignar un coche de un comercial a otro', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const log = await entrar(p.servicio, 'logistica@urkiolacarservice.com');

  const deOtro = p.servicio.estado.vehicles.find((v) => v.logisticActive && v.salesRep)!;
  const antes = deOtro.salesRep;

  await p.servicio.ejecutar(
    cmd('vehicle.setSalesRep', { vehicleId: deOtro.id, salesRep: 'Juan Bilbao' }, { userId: log.id }),
    log
  );

  const despues = p.servicio.estado.vehicles.find((v) => v.id === deOtro.id)!;
  assert.equal(despues.salesRep, 'Juan Bilbao');
  // Y la trazabilidad dice a quién lo llevaba antes.
  assert.match(p.servicio.estado.events[0].detail ?? '', new RegExp(`antes ${antes}`));
});

test('asignar el comercial que ya estaba no ensucia el historial', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const log = await entrar(p.servicio, 'logistica@urkiolacarservice.com');

  const coche = p.servicio.estado.vehicles.find((v) => v.logisticActive && v.salesRep)!;
  const eventos = p.servicio.estado.events.length;

  await p.servicio.ejecutar(
    cmd('vehicle.setSalesRep', { vehicleId: coche.id, salesRep: coche.salesRep }, { userId: log.id }),
    log
  );
  assert.equal(p.servicio.estado.events.length, eventos, 'no se apunta un cambio que no ha cambiado nada');
});

test('un comercial de Leioa pide el traslado de un coche que está en Sondika', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  // Juan lleva Leioa; el stock de toda la red duerme en la campa de Sondika.
  const juan = await entrar(p.servicio, 'juan@urkiolacarservice.com');
  const enSondika = p.servicio.estado.vehicles.find(
    (v) => v.logisticActive && v.location?.siteId === 'sondika'
  )!;

  const r = await p.servicio.ejecutar(
    cmd(
      'request.create',
      {
        requestType: 'traslado',
        vehicleId: enSondika.id,
        siteId: 'leioa',
        to: { siteId: 'leioa' },
        carrierId: 'gruas-francis',
      },
      { userId: juan.id }
    ),
    juan
  );
  assert.equal(r.repetido, false);

  // Pero no puede encargar trabajo a una sede que no lleva.
  await assert.rejects(
    () =>
      p.servicio.ejecutar(
        cmd(
          'request.create',
          { requestType: 'preparacion', vehicleId: enSondika.id, siteId: 'irun', to: { siteId: 'irun' } },
          { userId: juan.id }
        ),
        juan
      ),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 403
  );
});

test('y le fija la fecha de entrega esté el coche donde esté', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const juan = await entrar(p.servicio, 'juan@urkiolacarservice.com');
  const enSondika = p.servicio.estado.vehicles.find(
    (v) => v.logisticActive && v.location?.siteId === 'sondika'
  )!;

  const r = await p.servicio.ejecutar(
    cmd(
      'vehicle.setDelivery',
      { vehicleId: enSondika.id, deliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      { userId: juan.id }
    ),
    juan
  );
  assert.equal(r.repetido, false);
  assert.ok(p.servicio.estado.vehicles.find((v) => v.id === enSondika.id)?.deliveryDate);
});
