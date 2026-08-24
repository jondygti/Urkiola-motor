/**
 * Matriz de permisos: cada comando contra cada rol.
 *
 * La tabla de abajo dice, para los 44 comandos, quién debe poder ejecutarlos
 * y quién no. No es una comprobación de lo que hace el código: es lo que
 * TIENE que hacer, escrito aparte. Si alguien añade un comando y se olvida
 * de su permiso, o afloja uno sin querer, esto lo canta.
 *
 * Los roles de serie están en `src/data/seed.ts`; los permisos, en
 * `docs/BACKEND-API.md`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { comprobarPermiso } from '../src/permisos';
import { TIPOS } from '../src/validar';
import { buildSeedState } from '../../src/data/seed';
import type { AppState, Id, User } from '../../src/data/types';
import type { Command, CommandInput } from '../../src/data/commands';

type Rol = 'admin' | 'logistica' | 'preparador' | 'transportista' | 'recepcion' | 'comercial';

const ROLES: Rol[] = ['admin', 'logistica', 'preparador', 'transportista', 'recepcion', 'comercial'];

/** Quién puede ejecutar cada comando. Lo que no está listado, no puede. */
const PUEDEN: Record<string, Rol[]> = {
  // Operativa de campa
  // El comercial también: si puede mover un coche, puede confirmar que
  // está donde dice. Comprobar es menos que mover.
  'vehicle.check': ['admin', 'logistica', 'preparador', 'recepcion', 'comercial'],
  'movement.register': ['admin', 'logistica', 'preparador', 'recepcion', 'comercial'],
  'vehicle.activate': ['admin', 'logistica', 'preparador', 'recepcion', 'comercial'],

  // Solicitudes
  'request.create': ['admin', 'logistica', 'preparador', 'comercial'],
  'request.update': ['admin', 'logistica'],

  // Preparación. Ojo con `prep.create`: aquí se comprueba el caso base, un
  // coche que nadie ha pedido preparar. Que el preparador SÍ pueda abrir la
  // que le han pedido está comprobado aparte, en comandos.test.ts.
  'prep.create': ['admin', 'logistica'],
  'prep.start': ['admin', 'logistica', 'preparador'],
  'prep.pause': ['admin', 'logistica', 'preparador'],
  'prep.resume': ['admin', 'logistica', 'preparador'],
  'prep.item': ['admin', 'logistica', 'preparador'],
  'prep.finish': ['admin', 'logistica', 'preparador'],

  // Recuentos
  'count.create': ['admin', 'logistica', 'preparador', 'recepcion'],
  'count.finding': ['admin', 'logistica', 'preparador', 'recepcion'],
  'count.close': ['admin', 'logistica', 'preparador', 'recepcion'],

  // Incidencias
  'incident.create': ['admin', 'logistica', 'preparador', 'recepcion'],
  'incident.close': ['admin', 'logistica'],

  // Avisos
  'rule.create': ['admin', 'logistica', 'comercial'],
  'rule.toggle': ['admin', 'logistica', 'comercial'],
  'rule.delete': ['admin', 'logistica', 'comercial'],
  'inbox.read': ROLES,
  'inbox.readAll': ROLES,

  // Recepción de camiones
  'reception.create': ['admin', 'logistica', 'recepcion'],
  'reception.line': ['admin', 'logistica', 'recepcion'],
  'reception.albaran': ['admin', 'logistica', 'recepcion'],
  'reception.close': ['admin', 'logistica', 'recepcion'],

  // Vehículo
  'vehicle.setCustom': ['admin', 'logistica'],
  'vehicle.setDelivery': ['admin', 'logistica', 'comercial'],
  'vehicle.create': ['admin', 'logistica', 'recepcion'],

  // Administración
  'config.update': ['admin'],
  'requirement.upsert': ['admin'],
  'requirement.delete': ['admin'],
  'site.upsert': ['admin'],
  'site.delete': ['admin'],
  'zone.upsert': ['admin'],
  'zone.delete': ['admin'],
  'position.add': ['admin'],
  'position.delete': ['admin'],
  'user.upsert': ['admin'],
  'user.delete': ['admin'],
  'role.upsert': ['admin'],
  'role.delete': ['admin'],
  'customField.upsert': ['admin'],
  'customField.delete': ['admin'],
  'carrier.upsert': ['admin'],
  'carrier.delete': ['admin'],
};

/**
 * Un estado de laboratorio: sin sedes asignadas a nadie y con un vehículo,
 * una preparación, una solicitud y un recuento conocidos. Así lo único que
 * decide el resultado es el rol, no dónde está el coche.
 */
function laboratorio(): { estado: AppState; usuarios: Record<Rol, User> } {
  const base = buildSeedState();
  const usuarios = {} as Record<Rol, User>;

  const users = base.users.map((u) => {
    const sinSedes: User = { ...u, siteIds: [] };
    if (!usuarios[u.role as Rol]) usuarios[u.role as Rol] = sinSedes;
    return sinSedes;
  });

  return { estado: { ...base, users }, usuarios };
}

/** Un comando de ejemplo de cada tipo, con datos que existen de verdad. */
function ejemplos(s: AppState): Record<string, CommandInput> {
  const vehiculo = s.vehicles.find((v) => v.logisticActive && v.location)!;
  // Para `prep.create`, uno que nadie haya pedido preparar: con solicitud
  // abierta el preparador sí puede, y eso se comprueba por separado.
  const sinPedir = s.vehicles.find(
    (v) =>
      v.logisticActive &&
      !s.requests.some(
        (r) => r.type === 'preparacion' && r.vehicleId === v.id && r.status !== 'terminada'
      )
  )!;
  const prep = s.preparations[0];
  const solicitud = s.requests.find((r) => r.type === 'preparacion')!;
  const recuento = s.counts[0];
  const incidencia = s.incidents[0];
  const regla = s.rules[0];
  const sede = s.sites[0];
  const zona = s.zones[0];
  const plaza = s.positions[0];
  const usuario = s.users[0];
  const rol = s.config.roles[0];
  const campo = s.config.customFields[0];
  const empresa = s.carriers[0];
  const requisito = s.config.requirements[0];

  return {
    'vehicle.check': { type: 'vehicle.check', vehicleId: vehiculo.id },
    'movement.register': { type: 'movement.register', vehicleId: vehiculo.id, to: { siteId: 'leioa' } },
    'vehicle.activate': { type: 'vehicle.activate', vehicleId: vehiculo.id },
    'request.create': {
      type: 'request.create',
      requestType: 'preparacion',
      vehicleId: vehiculo.id,
      siteId: 'leioa',
      to: { siteId: 'leioa' },
    },
    'request.update': { type: 'request.update', requestId: solicitud.id, status: 'en_curso' },
    'prep.create': { type: 'prep.create', vehicleId: sinPedir.id, siteId: 'leioa' },
    'prep.start': { type: 'prep.start', prepId: prep.id },
    'prep.pause': { type: 'prep.pause', prepId: prep.id, reason: 'Material' },
    'prep.resume': { type: 'prep.resume', prepId: prep.id },
    'prep.item': { type: 'prep.item', prepId: prep.id, requirementId: 'req-lavado', state: 'completado' },
    'prep.finish': { type: 'prep.finish', prepId: prep.id },
    'count.create': { type: 'count.create', siteId: 'sondika', zoneId: null, code: 'R-PRUEBA' },
    'count.finding': { type: 'count.finding', countId: recuento.id, vehicleId: vehiculo.id },
    'count.close': { type: 'count.close', countId: recuento.id },
    'incident.create': {
      type: 'incident.create',
      vehicleId: vehiculo.id,
      incidentType: 'campa',
      description: 'Prueba',
      photos: [],
    },
    'incident.close': { type: 'incident.close', incidentId: incidencia.id },
    'rule.create': {
      type: 'rule.create',
      rule: {
        scopeKind: 'fleet',
        scopeRef: null,
        condition: 'llegada_sede',
        recipient: 'Logística',
        channels: ['web'],
        active: true,
      },
    },
    'rule.toggle': { type: 'rule.toggle', ruleId: regla.id },
    'rule.delete': { type: 'rule.delete', ruleId: regla.id },
    'inbox.read': { type: 'inbox.read', eventId: s.inbox[0]?.id ?? 'nev-x' },
    'inbox.readAll': { type: 'inbox.readAll' },
    'reception.create': {
      type: 'reception.create',
      truckPlate: '0000 XXX',
      carrier: 'Prueba',
      siteId: 'sondika',
    },
    'reception.line': { type: 'reception.line', receptionId: 'rec-x', ref: 'ABC12345' },
    'reception.albaran': { type: 'reception.albaran', receptionId: 'rec-x', uri: 'file://x' },
    'reception.close': { type: 'reception.close', receptionId: 'rec-x' },
    'vehicle.setCustom': {
      type: 'vehicle.setCustom',
      vehicleId: vehiculo.id,
      fieldId: campo.id,
      value: 'x',
    },
    'vehicle.setDelivery': {
      type: 'vehicle.setDelivery',
      vehicleId: vehiculo.id,
      deliveryDate: new Date().toISOString(),
    },
    'vehicle.create': { type: 'vehicle.create', vin8: 'PRUEBA01' },
    'config.update': { type: 'config.update', patch: { staleCheckHours: 48 } },
    'requirement.upsert': { type: 'requirement.upsert', requirement: requisito },
    'requirement.delete': { type: 'requirement.delete', requirementId: requisito.id },
    'site.upsert': { type: 'site.upsert', site: sede },
    'site.delete': { type: 'site.delete', siteId: 'irun' },
    'zone.upsert': { type: 'zone.upsert', zone: zona, positions: 10 },
    'zone.delete': { type: 'zone.delete', zoneId: zona.id },
    'position.add': { type: 'position.add', zoneId: zona.id, code: 'P99' },
    'position.delete': { type: 'position.delete', positionId: plaza.id },
    'user.upsert': { type: 'user.upsert', user: usuario },
    'user.delete': { type: 'user.delete', targetUserId: usuario.id },
    'role.upsert': { type: 'role.upsert', role: rol },
    'role.delete': { type: 'role.delete', roleId: rol.id },
    'customField.upsert': { type: 'customField.upsert', field: campo },
    'customField.delete': { type: 'customField.delete', fieldId: campo.id },
    'carrier.upsert': { type: 'carrier.upsert', carrier: empresa },
    'carrier.delete': { type: 'carrier.delete', carrierId: empresa.id },
  };
}

test('no falta ningún comando por comprobar', () => {
  const { estado } = laboratorio();
  const cubiertos = Object.keys(ejemplos(estado));
  for (const tipo of TIPOS) {
    assert.ok(cubiertos.includes(tipo), `el comando ${tipo} no está en la matriz de permisos`);
    assert.ok(PUEDEN[tipo] !== undefined, `el comando ${tipo} no dice quién puede ejecutarlo`);
  }
  assert.equal(cubiertos.length, TIPOS.size);
});

test('cada rol puede exactamente lo que debe', () => {
  const { estado, usuarios } = laboratorio();
  const muestras = ejemplos(estado);
  const fallos: string[] = [];

  for (const [tipo, plantilla] of Object.entries(muestras)) {
    for (const rol of ROLES) {
      const user = usuarios[rol];
      const cmd = {
        ...plantilla,
        id: `cmd-matriz-${tipo}-${rol}`,
        at: new Date().toISOString(),
        userId: user.id,
      } as Command;

      const rechazo = comprobarPermiso(estado, user, cmd);
      const deberia = PUEDEN[tipo]!.includes(rol);
      const puede = rechazo === null;

      if (puede !== deberia) {
        fallos.push(
          `${tipo} · ${rol}: ${puede ? 'PUEDE y no debería' : `NO puede y debería (${rechazo})`}`
        );
      }
    }
  }

  assert.deepEqual(fallos, [], `\n${fallos.join('\n')}\n`);
});

/**
 * El transportista es proveedor externo: aparte de la tabla, no puede tocar
 * un vehículo que no sea de sus traslados por mucho permiso que tenga.
 */
test('al transportista no le valen los permisos si el coche no es suyo', () => {
  const { estado, usuarios } = laboratorio();
  const iker = usuarios.transportista;
  const ajeno = estado.vehicles.find(
    (v) =>
      !estado.requests.some(
        (r) => r.vehicleId === v.id && r.type === 'traslado' && r.status !== 'terminada'
      )
  )!;

  for (const tipo of ['vehicle.check', 'movement.register', 'incident.create'] as const) {
    const cmd = {
      type: tipo,
      id: `cmd-ext-${tipo}`,
      at: new Date().toISOString(),
      userId: iker.id,
      vehicleId: ajeno.id,
      ...(tipo === 'movement.register' ? { to: { siteId: 'leioa' } } : {}),
      ...(tipo === 'incident.create' ? { incidentType: 'campa', description: 'x', photos: [] } : {}),
    } as Command;
    assert.notEqual(comprobarPermiso(estado, iker, cmd), null, `${tipo} debería estar prohibido`);
  }
});

test('las sedes asignadas cierran la puerta a los coches de otras', () => {
  const base = buildSeedState();
  const soloIrun: User = { ...base.users.find((u) => u.role === 'logistica')!, siteIds: ['irun'] };
  const estado: AppState = { ...base, users: [...base.users, soloIrun] };
  const enLeioa = estado.vehicles.find((v) => v.location?.siteId === 'leioa')!;

  const cmd: Command = {
    type: 'vehicle.check',
    id: 'cmd-sede',
    at: new Date().toISOString(),
    userId: soloIrun.id,
    vehicleId: enLeioa.id,
  };
  assert.notEqual(comprobarPermiso(estado, soloIrun, cmd), null);
});

test('un usuario desactivado no puede hacer nada', () => {
  const { estado, usuarios } = laboratorio();
  const apagado: User = { ...usuarios.admin, active: false };
  const cmd: Command = {
    type: 'inbox.readAll',
    id: 'cmd-apagado',
    at: new Date().toISOString(),
    userId: apagado.id,
  };
  assert.notEqual(comprobarPermiso(estado, apagado, cmd), null);
});

/** Los ids de rol de serie no se pueden renombrar sin darse cuenta. */
test('los roles de serie siguen siendo los que espera la matriz', () => {
  const s = buildSeedState();
  assert.deepEqual(
    s.config.roles.map((r) => r.id).sort(),
    [...ROLES].sort() as Id[]
  );
});
