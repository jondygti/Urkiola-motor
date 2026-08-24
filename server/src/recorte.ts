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
import type { AppState, Id, User, Vehicle } from '../../src/data/types';

/** Vehículo sin nada que un proveedor no necesite saber. */
function vehiculoRecortado(v: Vehicle): Vehicle {
  return {
    ...v,
    salesRep: null,
    dealership: '',
    custom: undefined,
    deliveryDate: null,
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
    inbox: s.inbox.filter((n) => n.vehicleId !== null && idsVehiculos.has(n.vehicleId)),
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
export function estadoParaSedes(s: AppState, u: User): AppState {
  if (!u.siteIds || u.siteIds.length === 0) return s;
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
  };
}

/** El estado que le toca a cada uno. */
export function estadoPara(s: AppState, u: User, colaboradorExterno: boolean): AppState {
  return colaboradorExterno ? estadoParaColaborador(s, u) : estadoParaSedes(s, u);
}
