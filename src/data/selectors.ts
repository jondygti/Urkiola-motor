import type {
  AppState,
  ColumnPref,
  CustomField,
  DelayReason,
  FleetCount,
  NotificationEvent,
  Incident,
  Id,
  Permission,
  Preparation,
  Role,
  RoleConfig,
  ServiceRequest,
  Carrier,
  Site,
  User,
  Vehicle,
} from './types';
import { BASE_COLUMNS } from './types';
import { prepElapsedMs, prepIsOverSla, prepProgress } from './commands';
import { hoursSince } from './format';

const HOUR = 3_600_000;

export const activeVehicles = (s: AppState): Vehicle[] => s.vehicles.filter((v) => v.logisticActive);

export const vehicleById = (s: AppState, id: Id | undefined): Vehicle | undefined =>
  id ? s.vehicles.find((v) => v.id === id) : undefined;

/** Busca por matrícula o por los 8 últimos del bastidor. */
export const vehicleByRef = (s: AppState, ref: string): Vehicle | undefined => {
  const norm = ref.trim().toUpperCase().replace(/\s+/g, '');
  // Sin texto no hay coincidencia: si no, los vehículos sin matrícula
  // (que son la mayoría de los VN) casarían con la cadena vacía.
  if (!norm) return undefined;
  return s.vehicles.find(
    (v) =>
      v.vin8.toUpperCase() === norm ||
      (v.plate ? v.plate.toUpperCase().replace(/\s+/g, '') === norm : false)
  );
};

export const openRequests = (s: AppState): ServiceRequest[] =>
  s.requests.filter((r) => (r.status !== 'terminada' && r.status !== 'cancelada'));

export const openPrepRequests = (s: AppState): ServiceRequest[] =>
  openRequests(s).filter((r) => r.type === 'preparacion');

export const openTransferRequests = (s: AppState): ServiceRequest[] =>
  openRequests(s).filter((r) => r.type === 'traslado');

export const openIncidents = (s: AppState) => s.incidents.filter((i) => i.status !== 'cerrada');

export const activePreparations = (s: AppState): Preparation[] =>
  s.preparations.filter((p) => (p.runState !== 'terminado' && p.runState !== 'cancelado'));

export const blockedPreparations = (s: AppState): Preparation[] =>
  s.preparations.filter((p) => p.runState === 'bloqueado');

/** Vehículos sin comprobación física por encima del umbral configurado. */
export const staleVehicles = (s: AppState): Vehicle[] =>
  activeVehicles(s)
    .filter((v) => hoursSince(v.lastCheckAt) > s.config.staleCheckHours)
    .sort((a, b) => hoursSince(b.lastCheckAt) - hoursSince(a.lastCheckAt));

/**
 * Los avisos que le tocan a esta persona.
 *
 * Un aviso sin destinatarios es de casa y lo ve todo el mundo; el resto solo
 * quien está apuntado. Antes la bandeja era una sola para todos: al
 * preparador le llegaban los avisos de las entregas del comercial, y a los
 * dos meses ya nadie miraba la campana.
 */
export function bandejaDe(s: AppState, user: User | null): NotificationEvent[] {
  if (!user) return [];
  return s.inbox
    .filter((n) => avisoPara(s, n, user))
    .map((n) => ({ ...n, read: avisoLeido(n, user.id) }));
}

/** La escritura de una lectura respeta el mismo destinatario que la bandeja. */
export function avisoPara(s: AppState, n: NotificationEvent, user: User): boolean {
  if (n.userIds?.length && !n.userIds.includes(user.id)) return false;
  if (!isSimpleRole(s, user)) return true;
  return !!n.vehicleId && s.requests.some((r) =>
    r.type === 'traslado' && r.vehicleId === n.vehicleId &&
    (r.assignedTo === user.id || (!!user.carrierId && r.carrierId === user.carrierId))
  );
}

export const avisoLeido = (n: NotificationEvent, userId: Id): boolean =>
  n.readBy === undefined ? n.read : n.readBy.includes(userId);

export const unreadCount = (s: AppState, user?: User | null): number =>
  (user === undefined ? s.inbox : bandejaDe(s, user)).filter((n) => !n.read).length;

export function vehiclesAtSite(s: AppState, siteId: Id): Vehicle[] {
  return activeVehicles(s).filter((v) => v.location?.siteId === siteId);
}

export function vehiclesInZone(s: AppState, zoneId: Id): Vehicle[] {
  return activeVehicles(s).filter((v) => v.location?.zoneId === zoneId);
}

/* ------------------------------------------------------------ dashboard */

export interface DashboardKpis {
  fleetTotal: number;
  quiterTotal: number;
  sondika: number;
  prepPending: number;
  transfersPending: number;
  incidentsOpen: number;
  stale: number;
}

export function dashboardKpis(s: AppState): DashboardKpis {
  return {
    fleetTotal: activeVehicles(s).length,
    quiterTotal: s.vehicles.length,
    sondika: vehiclesAtSite(s, 'sondika').length,
    prepPending: openPrepRequests(s).length,
    transfersPending: openTransferRequests(s).length,
    incidentsOpen: openIncidents(s).length,
    stale: staleVehicles(s).length,
  };
}

export interface SitePerformance {
  site: Site;
  inProgress: number;
  avgMs: number;
  targetMs: number;
  outOfSla: number;
  atRisk: number;
}

/** Rendimiento de preparación por sede (tabla del dashboard). */
export function sitePerformance(s: AppState, now = Date.now()): SitePerformance[] {
  return s.sites
    .filter((site) => site.prepares)
    .map((site) => {
      const preps = activePreparations(s).filter((p) => p.siteId === site.id);
      const durations = preps.map((p) => prepElapsedMs(p, now));
      const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
      const targetMs = preps.length
        ? Math.round(preps.reduce((a, p) => a + p.targetMs, 0) / preps.length)
        : s.config.prepTargetMinutes.VN * 60_000;
      const outOfSla = preps.filter((p) => prepIsOverSla(p, now)).length;
      const atRisk = preps.filter(
        (p) => !prepIsOverSla(p, now) && prepElapsedMs(p, now) > p.targetMs * 0.85
      ).length;
      return { site, inProgress: preps.length, avgMs, targetMs, outOfSla, atRisk };
    });
}

export interface PrepKpis {
  inProgress: number;
  avgMs: number;
  outOfSla: number;
  blocked: number;
  finishedToday: number;
  checklistPct: number;
}

export function prepKpis(s: AppState, now = Date.now()): PrepKpis {
  const active = activePreparations(s);
  const durations = active.map((p) => prepElapsedMs(p, now));
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const finishedToday = s.preparations.filter(
    (p) => p.finishedAt && new Date(p.finishedAt).getTime() >= startOfDay.getTime()
  ).length;
  const allItems = active.flatMap((p) => p.items.filter((i) => i.state !== 'no_requerido'));
  const doneItems = allItems.filter((i) => i.state === 'completado').length;
  return {
    inProgress: active.length,
    avgMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    outOfSla: active.filter((p) => prepIsOverSla(p, now)).length,
    blocked: blockedPreparations(s).length,
    finishedToday,
    checklistPct: allItems.length ? Math.round((doneItems / allItems.length) * 100) : 0,
  };
}

/** Resumen por sede de la pantalla de solicitudes. */
export function requestsBySite(s: AppState) {
  return s.sites
    .map((site) => {
      const list = openRequests(s).filter((r) => r.siteId === site.id);
      return {
        site,
        total: list.length,
        prep: list.filter((r) => r.type === 'preparacion').length,
        transfers: list.filter((r) => r.type === 'traslado').length,
      };
    });
}

/* ------------------------------------------------------------- recuentos */

export interface CountSummary {
  count: FleetCount;
  expected: number;
  found: number;
  missing: number;
  missingVehicles: Vehicle[];
  misplaced: number;
}

export function countSummary(s: AppState, count: FleetCount): CountSummary {
  const foundIds = new Set(count.found.map((f) => f.vehicleId));
  const missingVehicles = count.expected
    .filter((id) => !foundIds.has(id))
    .map((id) => s.vehicles.find((v) => v.id === id))
    .filter((v): v is Vehicle => !!v);
  return {
    count,
    expected: count.expected.length,
    found: count.found.length,
    missing: missingVehicles.length,
    missingVehicles,
    misplaced: count.found.filter((f) => f.misplaced).length,
  };
}

export const openCount = (s: AppState): FleetCount | undefined => s.counts.find((c) => !c.closedAt);

/* --------------------------------------------------------- trazabilidad */

export function vehicleTimeline(s: AppState, vehicleId: Id) {
  return s.events
    .filter((e) => e.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function recentActivity(s: AppState, limit = 12) {
  return [...s.events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}

export function preparationFor(s: AppState, vehicleId: Id): Preparation | undefined {
  return (
    s.preparations.find((p) => p.vehicleId === vehicleId && (p.runState !== 'terminado' && p.runState !== 'cancelado')) ??
    s.preparations.find((p) => p.vehicleId === vehicleId)
  );
}

export function incidentsFor(s: AppState, vehicleId: Id) {
  return s.incidents.filter((i) => i.vehicleId === vehicleId);
}

export function requestsFor(s: AppState, vehicleId: Id) {
  return s.requests.filter((r) => r.vehicleId === vehicleId);
}

export function movementsFor(s: AppState, vehicleId: Id) {
  return s.movements.filter((m) => m.vehicleId === vehicleId);
}

/* ---------------------------------------------- las tres fases del viaje */

/**
 * Los meses que tienen traslados entregados, del más reciente al más
 * antiguo. Es lo que llena el desplegable de «Entregados».
 */
export function mesesConEntregas(hechos: TrasladoHecho[]): string[] {
  const meses = new Set<string>();
  for (const h of hechos) {
    if (h.request.deliveredAt) meses.add(h.request.deliveredAt.slice(0, 7));
  }
  return [...meses].sort().reverse();
}

/** Nombre del mes tal como se dice: «agosto de 2026». */
export function nombreDeMes(mes: string): string {
  const [ano, m] = mes.split('-');
  const nombres = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${nombres[Number(m) - 1] ?? m} de ${ano}`;
}

/* ------------------------------------------------- traslados hechos */

/** Un traslado ya entregado, con lo que tardó. */
export interface TrasladoHecho {
  request: ServiceRequest;
  vehicle: Vehicle | undefined;
  /** Horas entre recoger las llaves y entregar. Null si falta algún dato. */
  horas: number | null;
  /** Se pasó del plazo comprometido. */
  fueraDePlazo: boolean;
}

/**
 * Los traslados que ya se han hecho.
 *
 * Un traslado terminado desaparecía de todas las pantallas: dejaba de estar
 * pendiente y ahí se acababa. Ni el transportista podía ver lo que había
 * hecho ni Urkiola lo que le habían hecho, y eso es justo lo que hay que
 * poder mirar cuando hay que hablar con el proveedor.
 *
 * Se ordenan por fecha de entrega, lo último primero.
 */
export function trasladosHechos(
  s: AppState,
  filtro: { carrierId?: Id | null; userId?: Id | null; desde?: string; hasta?: string } = {}
): TrasladoHecho[] {
  return s.requests
    .filter((r) => r.type === 'traslado' && r.status === 'terminada')
    .filter((r) => (filtro.carrierId ? r.carrierId === filtro.carrierId : true))
    .filter((r) => (filtro.userId ? r.assignedTo === filtro.userId || r.deliveredBy === filtro.userId : true))
    .filter((r) => {
      // Sin fecha de entrega no se puede situar en el tiempo: son los
      // traslados que se cerraron antes de que esto se registrara.
      if (!filtro.desde && !filtro.hasta) return true;
      if (!r.deliveredAt) return false;
      if (filtro.desde && r.deliveredAt < filtro.desde) return false;
      if (filtro.hasta && r.deliveredAt > filtro.hasta) return false;
      return true;
    })
    .map((request): TrasladoHecho => {
      const horas =
        request.pickedUpAt && request.deliveredAt
          ? (new Date(request.deliveredAt).getTime() - new Date(request.pickedUpAt).getTime()) / 3_600_000
          : null;
      return {
        request,
        vehicle: s.vehicles.find((v) => v.id === request.vehicleId),
        horas,
        // Manda el plazo que se comprometió, no el de hoy: si mañana cambia
        // en Administración, lo ya hecho no se vuelve bueno ni malo.
        fueraDePlazo: !!request.dueAt && !!request.deliveredAt && request.deliveredAt > request.dueAt,
      };
    })
    .sort((a, b) => (b.request.deliveredAt ?? '').localeCompare(a.request.deliveredAt ?? ''));
}

/**
 * Los motivos de los retrasos, contados y ordenados por frecuencia.
 *
 * Es lo que convierte doce discusiones en un dato: «ocho de doce fue que no
 * estaban las llaves» se puede arreglar; «llegan tarde» no.
 */
export function motivosDeRetraso(hechos: TrasladoHecho[]): { motivo: DelayReason; veces: number }[] {
  const cuenta = new Map<DelayReason, number>();
  for (const h of hechos) {
    if (!h.fueraDePlazo) continue;
    const m = h.request.delayReason;
    if (m) cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([motivo, veces]) => ({ motivo, veces }))
    .sort((a, b) => b.veces - a.veces);
}

/** Lo que resume a un transportista: cuántos, cuántos en plazo y cuánto tarda. */
export interface ResumenTransporte {
  total: number;
  enPlazo: number;
  fueraDePlazo: number;
  /** Horas medias de puerta a puerta, de los que tienen las dos fechas. */
  horasMedia: number | null;
}

export function resumenTransporte(hechos: TrasladoHecho[]): ResumenTransporte {
  const conHoras = hechos.filter((x) => x.horas !== null);
  const fuera = hechos.filter((x) => x.fueraDePlazo).length;
  return {
    total: hechos.length,
    enPlazo: hechos.length - fuera,
    fueraDePlazo: fuera,
    horasMedia: conHoras.length
      ? conHoras.reduce((a, x) => a + (x.horas ?? 0), 0) / conHoras.length
      : null,
  };
}

/* --------------------------------------------------- los coches de uno */

/** Un coche del comercial con todo lo que está pasando con él. */
export interface CocheMio {
  vehicle: Vehicle;
  /** Traslado pedido y sin terminar, si lo hay. */
  traslado: ServiceRequest | null;
  /** Preparación pedida y todavía sin abrir por nadie. */
  prepPedida: ServiceRequest | null;
  /** Preparación abierta, con su cronómetro. */
  preparacion: Preparation | null;
  /** Incidencias abiertas: es lo que puede retrasar una entrega. */
  incidencias: Incident[];
  /** En qué punto está, contado como lo cuenta el comercial. */
  fase: 'listo' | 'preparando' | 'trasladando' | 'parado' | 'entregado';
}

/**
 * Los coches que lleva un comercial, con lo que está pasando con cada uno.
 *
 * El comercial no quiere una lista de solicitudes: quiere saber en qué punto
 * está **su** coche, que es otra pregunta. Antes tenía que mirar en tres
 * sitios —Solicitudes para lo pedido, Flota para dónde está, Entregas para
 * el compromiso— y ninguno de los tres le enseñaba solo lo suyo.
 *
 * Las fases son las suyas, no las del sistema:
 *
 * - **listo**: apto para entregar, no hay que hacer nada más.
 * - **preparando**: pedida o en marcha; da igual quién la tenga.
 * - **trasladando**: viene de camino o está pedido que venga.
 * - **parado**: no se ha pedido nada. Si tiene fecha de entrega, corre prisa.
 * - **entregado**: se lo llevó el cliente. Sale de las cuatro fases de
 *   trabajo —ya no hay nada que hacer con él— pero se queda en la lista
 *   aparte, porque quien marca una entrega tiene que poder comprobar
 *   después que la marcó.
 */
export function misCoches(s: AppState, user: User | null): CocheMio[] {
  if (!user) return [];

  const abiertas = s.preparations.filter((p) => (p.runState !== 'terminado' && p.runState !== 'cancelado'));
  const conPrepAbierta = new Set(abiertas.map((p) => p.vehicleId));

  return s.vehicles
    .filter((v) => esDelComercial(v, user))
    .map((v): CocheMio => {
      const preparacion = abiertas.find((p) => p.vehicleId === v.id) ?? null;
      const traslado =
        s.requests.find((r) => r.vehicleId === v.id && r.type === 'traslado' && (r.status !== 'terminada' && r.status !== 'cancelada')) ??
        null;
      const prepPedida = conPrepAbierta.has(v.id)
        ? null
        : (s.requests.find(
            (r) => r.vehicleId === v.id && r.type === 'preparacion' && (r.status !== 'terminada' && r.status !== 'cancelada')
          ) ?? null);
      const incidencias = s.incidents.filter((i) => i.vehicleId === v.id && i.status !== 'cerrada');

      const fase: CocheMio['fase'] =
        v.status === 'entregado'
          ? 'entregado'
          : v.status === 'apto_entrega'
          ? 'listo'
          : preparacion || prepPedida
            ? 'preparando'
            : traslado
              ? 'trasladando'
              : 'parado';

      return { vehicle: v, traslado, prepPedida, preparacion, incidencias, fase };
    })
    .sort((a, b) => {
      // Lo entregado, al final y de lo más reciente a lo más antiguo: es un
      // registro, no trabajo.
      if (a.fase === 'entregado' || b.fase === 'entregado') {
        if (a.fase !== 'entregado') return -1;
        if (b.fase !== 'entregado') return 1;
        return (b.vehicle.deliveredAt ?? '').localeCompare(a.vehicle.deliveredAt ?? '');
      }
      // Delante lo que tiene fecha de entrega comprometida y más cerca está:
      // es lo único con una fecha de verdad delante de un cliente.
      const fa = a.vehicle.deliveryDate;
      const fb = b.vehicle.deliveryDate;
      if (fa && fb) return fa.localeCompare(fb);
      if (fa) return -1;
      if (fb) return 1;
      return vehicleOrden(a.vehicle).localeCompare(vehicleOrden(b.vehicle));
    });
}

const vehicleOrden = (v: Vehicle) => `${v.brand} ${v.model} ${v.plate ?? v.vin8}`;

/* ------------------------------------------------------- tareas del día */

export interface MyWork {
  preparations: Preparation[];
  /** Pedidas por el comercial y todavía sin abrir: también son suyas. */
  prepRequests: ServiceRequest[];
  transfers: ServiceRequest[];
  counts: FleetCount[];
  incidents: number;
}

/** Tareas pendientes del usuario que ha iniciado sesión. */
export function myWork(s: AppState, userId: Id): MyWork {
  const user = s.users.find((u) => u.id === userId);
  const inScope = (siteId: Id) => !user || user.siteIds.length === 0 || user.siteIds.includes(siteId);

  return {
    preparations: activePreparations(s).filter(
      (p) => (p.preparerId === userId || !p.preparerId) && inScope(p.siteId)
    ),
    prepRequests: prepRequestsSinAbrir(s, userId),
    transfers: myTransfers(s, userId),
    counts: s.counts.filter((c) => !c.closedAt && inScope(c.siteId)),
    incidents: openIncidents(s).length,
  };
}

/**
 * Preparaciones que ha pedido un comercial y que todavía no ha abierto
 * nadie.
 *
 * Son trabajo del preparador igual que las abiertas: si no salen en su
 * pantalla, la solicitud se queda esperando en el escritorio de la oficina
 * y el coche parado. Al empezarla se abre la preparación de verdad.
 *
 * Se ordenan por plazo, con lo urgente y lo vencido delante.
 */
export function prepRequestsSinAbrir(s: AppState, userId: Id, now = Date.now()): ServiceRequest[] {
  const user = s.users.find((u) => u.id === userId);
  const inScope = (siteId: Id) => !user || user.siteIds.length === 0 || user.siteIds.includes(siteId);
  const yaAbierta = new Set(
    s.preparations.filter((p) => (p.runState !== 'terminado' && p.runState !== 'cancelado')).map((p) => p.vehicleId)
  );

  return s.requests
    .filter(
      (r) =>
        r.type === 'preparacion' &&
        (r.status !== 'terminada' && r.status !== 'cancelada') &&
        !yaAbierta.has(r.vehicleId) &&
        inScope(r.siteId) &&
        (r.assignedTo === null || r.assignedTo === userId)
    )
    .sort((a, b) => {
      const vencido = (r: ServiceRequest) => (deadlineOf(s, r, now).overdue ? 0 : 1);
      const urgente = (r: ServiceRequest) => (r.urgent ? 0 : 1);
      return (
        vencido(a) - vencido(b) ||
        urgente(a) - urgente(b) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
}

/** Ocupación de una campa/zona. */
export function zoneOccupancy(s: AppState, zoneId: Id) {
  const zone = s.zones.find((z) => z.id === zoneId);
  const positions = s.positions.filter((p) => p.zoneId === zoneId);
  const occupied = vehiclesInZone(s, zoneId).length;
  return {
    zone,
    hasCapacity: positions.length > 0,
    capacity: zone?.capacity ?? positions.length,
    occupied,
    pct: positions.length ? Math.round((occupied / positions.length) * 100) : 0,
  };
}

export function siteOccupancy(s: AppState, siteId: Id) {
  const zones = s.zones.filter((z) => z.siteId === siteId);
  const capacity = zones.reduce((a, z) => a + z.capacity, 0);
  const occupied = vehiclesAtSite(s, siteId).length;
  return { hasCapacity: zones.length > 0 && zones.every(z => z.capacity > 0), zones: zones.length, capacity, occupied, pct: capacity ? Math.round((occupied / capacity) * 100) : 0 };
}

/** Avisos de la tarjeta "Atención" del dashboard. */
export function attentionItems(s: AppState) {
  const items: { tone: 'info' | 'warn' | 'danger'; text: string; href?: string }[] = [];
  const lastCount = s.counts[0];
  if (lastCount) {
    const summary = countSummary(s, lastCount);
    if (summary.missing > 0) {
      items.push({
        tone: 'danger',
        text: `${summary.missing} vehículos no encontrados en el último recuento.`,
        href: '/recuentos',
      });
    }
  }
  const stale = staleVehicles(s).length;
  if (stale > 0) {
    items.push({
      tone: 'warn',
      text: `${stale} vehículos sin comprobación física de más de ${s.config.staleCheckHours} h.`,
      href: '/recuentos',
    });
  }
  const blocked = blockedPreparations(s).length;
  if (blocked > 0) {
    items.push({ tone: 'warn', text: `${blocked} preparaciones bloqueadas.`, href: '/preparacion' });
  }
  const pendingTransfer = activeVehicles(s).filter((v) => v.status === 'traslado_solicitado').length;
  if (pendingTransfer > 0) {
    items.push({ tone: 'info', text: `${pendingTransfer} vehículos pendientes de traslado.`, href: '/solicitudes' });
  }
  const outOfSla = activePreparations(s).filter((p) => prepIsOverSla(p)).length;
  if (outOfSla > 0) {
    items.push({ tone: 'warn', text: `${outOfSla} preparaciones fuera de SLA.`, href: '/preparacion' });
  }
  return items;
}

/** % de checklist de una preparación (reexport cómodo para las pantallas). */
export { prepProgress, prepElapsedMs, prepIsOverSla };
export const HOUR_MS = HOUR;


/* ------------------------------------------------------ roles y permisos */

export function roleConfig(s: AppState, role: Role | undefined): RoleConfig | undefined {
  if (!role) return undefined;
  return s.config.roles.find((r) => r.id === role);
}

/** Nombre visible de un rol, tal y como esté configurado. */
export function roleLabel(s: AppState, role: Role | undefined): string {
  if (!role) return '—';
  return roleConfig(s, role)?.label ?? role;
}

/** ¿Puede este usuario hacer esto? Sin usuario, no. */
export function can(s: AppState, user: User | null, permission: Permission): boolean {
  if (!user) return false;
  const cfg = roleConfig(s, user.role);
  // Un rol borrado o desconocido no da permisos: mejor quedarse corto.
  return cfg ? cfg.permissions.includes(permission) : false;
}

/** Secciones que este rol ve en el teléfono. */
export function mobileSections(s: AppState, user: User | null): string[] {
  if (!user) return [];
  return roleConfig(s, user.role)?.mobileSections ?? [];
}

/** Usuarios activos, que son los que pueden aparecer como responsables. */
export const activeUsers = (s: AppState): User[] => s.users.filter((u) => u.active);

/* ------------------------------------------- columnas y campos propios */

export interface ResolvedColumn {
  key: string;
  label: string;
  /** Campo propio asociado, si la columna lo es. */
  field?: CustomField;
  order: number;
}

/** Columnas visibles de la lista de flota, en el orden configurado. */
export function fleetColumns(s: AppState): ResolvedColumn[] {
  const prefs = new Map(s.config.fleetColumns.map((p) => [p.key, p]));
  const out: ResolvedColumn[] = [];

  for (const base of BASE_COLUMNS) {
    const pref = prefs.get(base.key);
    // Una columna sin preferencia guardada se muestra: así, al añadir
    // columnas nuevas en una versión futura, no desaparecen sin avisar.
    if (pref && !pref.visible) continue;
    out.push({ key: base.key, label: base.label, order: pref?.order ?? 99 });
  }

  for (const field of s.config.customFields) {
    const key = `custom:${field.id}`;
    const pref = prefs.get(key);
    const visible = pref ? pref.visible : field.showInTable;
    if (!visible) continue;
    out.push({ key, label: field.label, field, order: pref?.order ?? 100 + field.order });
  }

  return out.sort((a, b) => a.order - b.order);
}

/** Todas las columnas posibles, para la pantalla de configuración. */
export function allColumns(s: AppState): { key: string; label: string; pref: ColumnPref }[] {
  const prefs = new Map(s.config.fleetColumns.map((p) => [p.key, p]));
  const base = BASE_COLUMNS.map((c, i) => ({
    key: c.key,
    label: c.label,
    pref: prefs.get(c.key) ?? { key: c.key, visible: true, order: i + 1 },
  }));
  const custom = s.config.customFields.map((f) => {
    const key = `custom:${f.id}`;
    return {
      key,
      label: `${f.label} (campo propio)`,
      pref: prefs.get(key) ?? { key, visible: f.showInTable, order: 100 + f.order },
    };
  });
  return [...base, ...custom].sort((a, b) => a.pref.order - b.pref.order);
}

/** Valor de un campo propio de un vehículo, listo para mostrar. */
export function customValue(v: Vehicle, field: CustomField): string {
  const raw = v.custom?.[field.id];
  if (raw === undefined || raw === '') return '—';
  if (field.type === 'si_no') return raw === 'si' ? 'Sí' : 'No';
  return raw;
}

/* ----------------------------------------------- traslados asignados */

/**
 * Traslados abiertos que le tocan a esta persona.
 *
 * Un transportista pertenece a una empresa (Grúas Francis, Betigoiz…) y ve
 * los traslados encargados a **su empresa**, más los que se le hayan
 * asignado a él en concreto. Nunca los de otra empresa ni los que aún no se
 * han repartido.
 */
/**
 * Los traslados de una persona, separados por la fase del viaje.
 *
 * Son tres momentos distintos y hasta ahora salían mezclados en una lista:
 * los que están esperando a que pase a por las llaves, los que lleva encima
 * ahora mismo y los que ya entregó. El transportista no trabaja igual en los
 * tres: los primeros los planifica, el segundo lo tiene que cerrar hoy y los
 * terceros son su registro de trabajo.
 */
export function misTrasladosPorFase(
  s: AppState,
  userId: Id
): { porRecoger: ServiceRequest[]; recogidos: ServiceRequest[] } {
  const pendientes = myTransfers(s, userId);
  return {
    porRecoger: pendientes.filter((r) => !r.pickedUpAt),
    recogidos: pendientes.filter((r) => !!r.pickedUpAt),
  };
}

export function myTransfers(s: AppState, userId: Id): ServiceRequest[] {
  const user = s.users.find((u) => u.id === userId);
  const carrierId = user?.carrierId ?? null;
  // Clave de recorrido: sede, luego zona, luego plaza. Ordenar por ella
  // evita que el transportista cruce la campa de un lado a otro.
  const ruta = (r: ServiceRequest) => {
    const pos = r.from?.positionId ? s.positions.find((p) => p.id === r.from!.positionId) : undefined;
    const zone = r.from?.zoneId ? s.zones.find((z) => z.id === r.from!.zoneId) : undefined;
    return [r.from?.siteId ?? '', zone?.name ?? '', pos?.code ?? ''].join('|');
  };

  return s.requests
    .filter((r) => {
      if (r.type !== 'traslado' || r.status === 'terminada' || r.status === 'cancelada' || !r.carrierId) return false;
      if (r.assignedTo === userId) return true;
      return carrierId !== null && r.carrierId === carrierId;
    })
    .sort((a, b) => {
      // Lo vencido primero, después lo urgente, y lo demás en orden de
      // recorrido para no cruzar la campa de un lado a otro.
      const vencido = (r: ServiceRequest) => (deadlineOf(s, r).overdue ? 0 : 1);
      const urgente = (r: ServiceRequest) => (r.urgent ? 0 : 1);
      return (
        vencido(a) - vencido(b) ||
        urgente(a) - urgente(b) ||
        ruta(a).localeCompare(ruta(b), 'es')
      );
    });
}

/** ¿Este rol usa la interfaz reducida de colaborador externo? */
export function isSimpleRole(s: AppState, user: User | null): boolean {
  if (!user) return false;
  return roleConfig(s, user.role)?.simple === true;
}


/* ------------------------------------------------------------- plazos */

export interface Deadline {
  /** Fecha límite, si el reloj ya ha arrancado. */
  dueAt: string | null;
  /** Milisegundos que quedan; negativo si ya se ha pasado. */
  remainingMs: number | null;
  overdue: boolean;
  /** Queda menos de una cuarta parte del plazo. */
  atRisk: boolean;
}

/**
 * Plazo de una solicitud.
 *
 * Traslado: 48 h desde que el transportista recoge las llaves.
 * Preparación: 48 h desde que el comercial la pide.
 */
export function deadlineOf(s: AppState, r: ServiceRequest, now = Date.now()): Deadline {
  if (!r.dueAt || r.status === 'terminada' || r.status === 'cancelada') {
    return { dueAt: r.dueAt, remainingMs: null, overdue: false, atRisk: false };
  }
  const remainingMs = new Date(r.dueAt).getTime() - now;
  const total =
    (r.type === 'traslado' ? s.config.transferDeadlineHours : s.config.prepDeadlineHours) * 3_600_000;
  return {
    dueAt: r.dueAt,
    remainingMs,
    overdue: remainingMs < 0,
    atRisk: remainingMs >= 0 && remainingMs < total / 4,
  };
}

/** Solicitudes abiertas cuyo plazo ya se ha pasado. */
export function overdueRequests(s: AppState, now = Date.now()): ServiceRequest[] {
  return openRequests(s).filter((r) => deadlineOf(s, r, now).overdue);
}

/** Ordena por urgencia real: primero lo vencido, luego lo que menos tiempo tiene. */
export function byDeadline(s: AppState, now = Date.now()) {
  return (a: ServiceRequest, b: ServiceRequest) => {
    const da = deadlineOf(s, a, now).remainingMs;
    const db = deadlineOf(s, b, now).remainingMs;
    // Lo que aún no tiene plazo va al final: nadie lo ha comprometido.
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  };
}


/* --------------------------------------------- empresas de transporte */

export const activeCarriers = (s: AppState): Carrier[] => s.carriers.filter((c) => c.active);

export function carrierName(s: AppState, id: Id | null | undefined): string {
  if (!id) return 'Sin asignar';
  return s.carriers.find((c) => c.id === id)?.name ?? id;
}

/**
 * Empresa que cubre una ruta. Se propone sola al pedir el traslado: la que
 * llega al destino, y mejor todavía si también cubre el origen.
 */
export function suggestCarrier(s: AppState, fromSiteId?: Id, toSiteId?: Id): Carrier | undefined {
  const activos = activeCarriers(s);
  if (!toSiteId) return undefined;
  const ambas = activos.find(
    (c) => c.siteIds.includes(toSiteId) && (!fromSiteId || c.siteIds.includes(fromSiteId))
  );
  return ambas ?? activos.find((c) => c.siteIds.includes(toSiteId));
}

/* --------------------------------------------------- entregas a cliente */

/** Vehículos con fecha de entrega comprometida, del más próximo al más lejano. */
/**
 * Sede desde la que se entrega un vehículo.
 *
 * Manda la sede de destino: es la concesión que ha quedado en preparar y
 * entregar. Si todavía no la tiene, la sede donde está ahora.
 */
/**
 * ¿Es este coche del comercial que ha entrado?
 *
 * El comercial de un vehículo viene de Quiter como **texto** ('Juan'), no
 * como un usuario de la aplicación ('Juan Bilbao'), así que hay que
 * emparejarlos con cuidado: se acepta el nombre completo o el de pila, en
 * los dos sentidos. Cuando llegue el importador de Quiter y se vea el
 * formato real, este es el único sitio que hay que tocar.
 */
export function esDelComercial(v: Vehicle, user: User | null): boolean {
  if (!user) return false;
  if (v.salesRepId) return v.salesRepId === user.id;
  if (!v.salesRep) return false;
  const rep = v.salesRep.trim().toLowerCase();
  const nombre = user.name.trim().toLowerCase();
  if (!rep) return false;
  return rep === nombre || nombre.startsWith(`${rep} `) || rep.startsWith(`${nombre} `);
}

/** Área comercial efectiva; los datos antiguos siguen funcionando por VN/VO. */
export function areaComercialDe(v: Vehicle): 'vn' | 'vo' {
  return v.commercialArea ?? (v.type === 'VO' ? 'vo' : 'vn');
}

/** Roles con ámbito comercial propio y recortado. */
export function esGestorComercial(user: User | null): boolean {
  return !!user && (user.role === 'director_comercial' || user.role === 'responsable_vo');
}

/** Comerciales que dependen directamente de un responsable/director. */
export function equipoComercial(s: AppState, responsableId: Id): User[] {
  return s.users.filter((u) => u.active && u.managerId === responsableId);
}

/**
 * Ámbito comercial real:
 * - responsable VO: todo el stock VO, lo venda quien lo venda;
 * - director VN: VN/KM0/demo de sus marcas, más cualquier VO asignado a
 *   uno de sus comerciales.
 */
export function vehiculoEnAmbitoComercial(s: AppState, user: User | null, v: Vehicle): boolean {
  if (!user) return false;
  const area = areaComercialDe(v);

  if (user.role === 'responsable_vo') return area === 'vo';
  if (user.role !== 'director_comercial') return true;

  const marcas = new Set((user.managedBrands ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean));
  const esStockDeMarca = area === 'vn' && marcas.has(v.brand.trim().toLowerCase());
  if (esStockDeMarca) return true;

  if (area !== 'vo') return false;
  return equipoComercial(s, user.id).some((comercial) => esDelComercial(v, comercial));
}

/** Lista visible en cliente/demo; el backend aplica el mismo ámbito al estado. */
export function vehiculosVisiblesPara(s: AppState, user: User | null): Vehicle[] {
  if (!esGestorComercial(user)) return s.vehicles;
  return s.vehicles.filter((v) => vehiculoEnAmbitoComercial(s, user, v));
}

export function sedeDeEntrega(v: Vehicle): Id | null {
  return v.targetSiteId ?? v.location?.siteId ?? null;
}

/** La oficina gestiona la red; el comercial gestiona sus propias entregas. */
export function puedeGestionarEntrega(s: AppState, user: User | null, v: Vehicle): boolean {
  if (!can(s, user, 'entregas.gestionar')) return false;
  if (can(s, user, 'flota.editar')) return true;
  if (esGestorComercial(user)) return vehiculoEnAmbitoComercial(s, user, v);
  return esDelComercial(v, user);
}

export function upcomingDeliveries(s: AppState, days = 14): Vehicle[] {
  const limite = Date.now() + days * 86_400_000;
  return activeVehicles(s)
    .filter((v) => v.deliveryDate && new Date(v.deliveryDate).getTime() <= limite)
    .sort((a, b) => new Date(a.deliveryDate!).getTime() - new Date(b.deliveryDate!).getTime());
}

export interface DeliveryStatus {
  vehicle: Vehicle;
  /** Milisegundos hasta la entrega; negativo si ya pasó. */
  inMs: number;
  /** Lo que falta para poder entregar. */
  missing: string[];
  ready: boolean;
  atRisk: boolean;
}

/** Qué le falta a cada entrega y si llega a tiempo. */
export function deliveryStatus(s: AppState, v: Vehicle, now = Date.now()): DeliveryStatus {
  const inMs = v.deliveryDate ? new Date(v.deliveryDate).getTime() - now : 0;
  const missing: string[] = [];

  const prep = preparationFor(s, v.id);
  if (v.status !== 'apto_entrega' && v.status !== 'entregado') {
    if (!prep) missing.push('Sin preparación abierta');
    else if ((prep.runState !== 'terminado' && prep.runState !== 'cancelado')) {
      const { done, total } = prepProgress(prep);
      missing.push(
        prep.runState === 'bloqueado'
          ? `Preparación bloqueada (${done}/${total})`
          : `Preparación ${done}/${total}`
      );
    }
  }

  const traslado = s.requests.find(
    (r) => r.vehicleId === v.id && r.type === 'traslado' && (r.status !== 'terminada' && r.status !== 'cancelada')
  );
  if (traslado) missing.push('Traslado pendiente');

  if (incidentsFor(s, v.id).some((i) => i.status !== 'cerrada')) missing.push('Incidencia abierta');

  const ready = missing.length === 0;
  // En riesgo: quedan menos de 48 h y todavía falta algo.
  return { vehicle: v, inMs, missing, ready, atRisk: !ready && inMs < 48 * 3_600_000 };
}

/** Agrupa solo los encargos ya filtrados por usuario, sin mezclar sentidos. */
export function agruparTrasladosPorTrayecto(solicitudes: ServiceRequest[]) {
  const grupos = new Map<string, { id: string; origen: Id | null; destino: Id | null; solicitudes: ServiceRequest[] }>();
  for (const r of solicitudes) {
    const origen = r.from?.siteId ?? null;
    const destino = r.to?.siteId ?? r.siteId ?? null;
    const id = JSON.stringify([origen, destino]);
    if (!grupos.has(id)) grupos.set(id, { id, origen, destino, solicitudes: [] });
    grupos.get(id)!.solicitudes.push(r);
  }
  return [...grupos.values()];
}
