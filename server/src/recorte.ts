/**
 * Estado recortado para colaboradores externos.
 *
 * El transportista es un proveedor, no personal de Urkiola. Si le
 * devolviéramos el estado entero vería el parque completo, qué comercial
 * lleva cada coche y cuántas plazas hay libres en cada campa; y las
 * empresas de transporte competidoras verían los encargos de las otras.
 *
 * Así que su `GET /state` lleva solo lo suyo: sus traslados, los vehículos
 * implicados (sin los datos comerciales), las sedes y las plazas que
 * necesita para leer una ubicación, y su propio rol.
 */
import type { AppState, Id, NotificationEvent, User, Vehicle } from '../../src/data/types';

/**
 * Qué campos del vehículo puede ver un proveedor externo y cuáles no.
 *
 * Es un mapa **completo** a propósito. `Record<keyof Vehicle, …>` obliga a
 * que estén todos: el día que se le añada un campo al vehículo —el precio,
 * el nombre del cliente, lo que sea— esto deja de compilar hasta que alguien
 * decida si una empresa de transporte puede verlo. Sin esto, un campo nuevo
 * se le colaba al proveedor sin que nadie se enterase, que es como pasan
 * estas cosas: no por una decisión, sino por un descuido.
 */
export const CAMPOS_DEL_VEHICULO: Record<keyof Vehicle, 'va' | 'se-borra'> = {
  // Lo que necesita para reconocer el coche y llevarlo donde toca.
  id: 'va',
  vin8: 'va',
  vin: 'va',
  plate: 'va',
  brand: 'va',
  model: 'va',
  type: 'va',
  location: 'va',
  targetSiteId: 'va',
  status: 'va',
  logisticActive: 'va',
  lastMovementAt: 'va',
  receivedAt: 'va',
  origin: 'va',
  // Comercial: a quién se lo vendemos, cuándo se entrega y a qué precio no
  // es asunto de quien lo transporta.
  salesRep: 'se-borra',
  deliveryDate: 'se-borra',
  // Cuándo se lo llevó el cliente tampoco: dice el ritmo de ventas de
  // Urkiola a una empresa que solo tiene que mover coches.
  deliveredAt: 'se-borra',
  deliveredBy: 'se-borra',
  custom: 'se-borra',
  situation: 'se-borra',
  // Nombres de gente de Urkiola.
  lastCheckAt: 'se-borra',
  lastCheckBy: 'se-borra',
};

/** Vehículo sin nada que un proveedor no necesite saber. */
function vehiculoRecortado(v: Vehicle): Vehicle {
  return {
    ...v,
    salesRep: null,
    custom: undefined,
    deliveryDate: null,
    deliveredAt: null,
    deliveredBy: null,
    situation: 'stock',
    lastCheckAt: null,
    lastCheckBy: null,
  };
}

export function estadoParaColaborador(s: AppState, u: User): AppState {
  const suyos = s.requests.filter(
    (r) =>
      r.type === 'traslado' &&
      (r.assignedTo === u.id || (!!u.carrierId && r.carrierId === u.carrierId))
  );

  const idsVehiculos = new Set(suyos.map((r) => r.vehicleId));
  const vehicles = s.vehicles.filter((v) => idsVehiculos.has(v.id)).map(vehiculoRecortado);

  // Solo las zonas y plazas que aparecen en su trabajo: nombrar "Sondika ·
  // Zona B · P14" no debe costar enseñarle el plano entero de la campa.
  const zonasUsadas = new Set<Id>();
  const plazasUsadas = new Set<Id>();
  const anota = (ref: { zoneId?: Id | null; positionId?: Id | null } | null | undefined) => {
    if (!ref) return;
    if (ref.zoneId) zonasUsadas.add(ref.zoneId);
    if (ref.positionId) plazasUsadas.add(ref.positionId);
  };
  for (const r of suyos) {
    anota(r.from);
    anota(r.to);
  }
  for (const v of vehicles) anota(v.location);

  // Solo las plazas que aparecen en su trabajo. El transportista no elige
  // hueco: entrega en el destino que trae la orden, así que darle el plano
  // completo de la campa sería enseñarle la ocupación por nada.
  const positions = s.positions.filter((p) => plazasUsadas.has(p.id));
  for (const p of positions) zonasUsadas.add(p.zoneId);
  const zones = s.zones.filter((z) => zonasUsadas.has(z.id));

  return {
    users: s.users.filter((x) => x.id === u.id),
    carriers: s.carriers.filter((c) => c.id === u.carrierId),
    sites: s.sites,
    zones,
    positions,
    vehicles,
    movements: [],
    requests: suyos,
    preparations: [],
    counts: [],
    incidents: [],
    rules: [],
    // Los avisos que van dirigidos a alguien de casa no salen de casa,
    // aunque hablen de un coche que él ha movido: «el coche de Juan está
    // listo para entregar» le dice a un proveedor quién vende qué.
    inbox: s.inbox.filter(
      (n) => n.vehicleId !== null && idsVehiculos.has(n.vehicleId) && paraEste(n, u)
    ),
    receptions: [],
    events: [],
    config: {
      ...s.config,
      // Su rol basta: los permisos de los demás no son asunto suyo.
      roles: s.config.roles.filter((r) => r.id === u.role),
      customFields: [],
      fleetColumns: [],
    },
  };
}

/**
 * Estado para un usuario de Urkiola con sedes asignadas.
 *
 * No es una barrera de seguridad como la anterior —son compañeros, no
 * proveedores— pero evita mandar al móvil de Irun los 400 coches de
 * Sondika cada vez que arranca.
 */
/**
 * ¿Este aviso es para esta persona?
 *
 * Sin destinatarios es de casa y lo ve todo el mundo; con ellos, solo quien
 * esté apuntado. La pantalla ya lo filtraba, pero eso es comodidad de
 * interfaz: si el aviso llega al dispositivo, está en el dispositivo. Y al
 * transportista, que es de fuera, le llegaban los de los comerciales.
 */
function paraEste(n: NotificationEvent, u: User): boolean {
  return !n.userIds || n.userIds.length === 0 || n.userIds.includes(u.id);
}

export function estadoParaSedes(s: AppState, u: User): AppState {
  // Los avisos se filtran para todos, tengan sedes o no: el administrador
  // tampoco necesita en el móvil los avisos dirigidos a otra persona.
  const conSusAvisos = { ...s, inbox: s.inbox.filter((n) => paraEste(n, u)) };
  if (!u.siteIds || u.siteIds.length === 0) return conSusAvisos;
  s = conSusAvisos;
  const suyas = new Set(u.siteIds);
  const dentro = (siteId: Id | null | undefined) => !siteId || suyas.has(siteId);

  const vehicles = s.vehicles.filter(
    (v) => dentro(v.location?.siteId) || dentro(v.targetSiteId)
  );
  const ids = new Set(vehicles.map((v) => v.id));

  return {
    ...s,
    vehicles,
    movements: s.movements.filter((m) => ids.has(m.vehicleId)),
    requests: s.requests.filter((r) => ids.has(r.vehicleId) || suyas.has(r.siteId)),
    preparations: s.preparations.filter((p) => suyas.has(p.siteId)),
    counts: s.counts.filter((c) => suyas.has(c.siteId)),
    incidents: s.incidents.filter((i) => ids.has(i.vehicleId)),
    receptions: s.receptions.filter((r) => suyas.has(r.siteId)),
    events: s.events.filter((e) => !e.vehicleId || ids.has(e.vehicleId)),
    // Cada uno recibe sus avisos y no los de los demás. Mandarlos todos y
    // esconderlos en la pantalla es dejarlos en el móvil de cualquiera.
    inbox: s.inbox.filter((n) => paraEste(n, u)),
  };
}

/** El estado que le toca a cada uno. */
export function estadoPara(s: AppState, u: User, colaboradorExterno: boolean): AppState {
  return colaboradorExterno ? estadoParaColaborador(s, u) : estadoParaSedes(s, u);
}
