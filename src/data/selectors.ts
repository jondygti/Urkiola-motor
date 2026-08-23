import type {
  AppState,
  ColumnPref,
  CustomField,
  FleetCount,
  Id,
  Permission,
  Preparation,
  Role,
  RoleConfig,
  ServiceRequest,
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
  s.requests.filter((r) => r.status !== 'terminada');

export const openPrepRequests = (s: AppState): ServiceRequest[] =>
  openRequests(s).filter((r) => r.type === 'preparacion');

export const openTransferRequests = (s: AppState): ServiceRequest[] =>
  openRequests(s).filter((r) => r.type === 'traslado');

export const openIncidents = (s: AppState) => s.incidents.filter((i) => i.status !== 'cerrada');

export const activePreparations = (s: AppState): Preparation[] =>
  s.preparations.filter((p) => p.runState !== 'terminado');

export const blockedPreparations = (s: AppState): Preparation[] =>
  s.preparations.filter((p) => p.runState === 'bloqueado');

/** Vehículos sin comprobación física por encima del umbral configurado. */
export const staleVehicles = (s: AppState): Vehicle[] =>
  activeVehicles(s)
    .filter((v) => hoursSince(v.lastCheckAt) > s.config.staleCheckHours)
    .sort((a, b) => hoursSince(b.lastCheckAt) - hoursSince(a.lastCheckAt));

export const unreadCount = (s: AppState): number => s.inbox.filter((n) => !n.read).length;

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
    .filter((site) => site.prepares)
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
    s.preparations.find((p) => p.vehicleId === vehicleId && p.runState !== 'terminado') ??
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

/* ------------------------------------------------------- tareas del día */

export interface MyWork {
  preparations: Preparation[];
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
    transfers: myTransfers(s, userId),
    counts: s.counts.filter((c) => !c.closedAt && inScope(c.siteId)),
    incidents: openIncidents(s).length,
  };
}

/** Ocupación de una campa/zona. */
export function zoneOccupancy(s: AppState, zoneId: Id) {
  const zone = s.zones.find((z) => z.id === zoneId);
  const positions = s.positions.filter((p) => p.zoneId === zoneId);
  const occupied = vehiclesInZone(s, zoneId).length;
  return {
    zone,
    capacity: zone?.capacity ?? positions.length,
    occupied,
    pct: positions.length ? Math.round((occupied / positions.length) * 100) : 0,
  };
}

export function siteOccupancy(s: AppState, siteId: Id) {
  const zones = s.zones.filter((z) => z.siteId === siteId);
  const capacity = zones.reduce((a, z) => a + z.capacity, 0);
  const occupied = vehiclesAtSite(s, siteId).length;
  return { zones: zones.length, capacity, occupied, pct: capacity ? Math.round((occupied / capacity) * 100) : 0 };
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
 * Traslados abiertos asignados a esta persona.
 *
 * Solo los suyos: un transportista externo no debe ver la carga de trabajo
 * de los demás ni los traslados que todavía no se han repartido.
 */
export function myTransfers(s: AppState, userId: Id): ServiceRequest[] {
  // Clave de recorrido: sede, luego zona, luego plaza. Ordenar por ella
  // evita que el transportista cruce la campa de un lado a otro.
  const ruta = (r: ServiceRequest) => {
    const pos = r.from?.positionId ? s.positions.find((p) => p.id === r.from!.positionId) : undefined;
    const zone = r.from?.zoneId ? s.zones.find((z) => z.id === r.from!.zoneId) : undefined;
    return [r.from?.siteId ?? '', zone?.name ?? '', pos?.code ?? ''].join('|');
  };

  return s.requests
    .filter((r) => r.type === 'traslado' && r.status !== 'terminada' && r.assignedTo === userId)
    .sort((a, b) => {
      // Primero lo que ya está en marcha; el resto, en orden de recorrido.
      const enRuta = (r: ServiceRequest) => (r.status === 'en_ruta' ? 0 : 1);
      const urgente = (r: ServiceRequest) => (r.urgent ? 0 : 1);
      return (
        enRuta(a) - enRuta(b) ||
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
