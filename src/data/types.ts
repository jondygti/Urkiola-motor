/**
 * Modelo de dominio de Urkiola Car Service.
 *
 * Regla de datos del proyecto (recogida del mockup V18):
 *   - Quiter aporta el parque maestro (datos comerciales y de vehículo).
 *   - Urkiola controla la actividad logística: ubicación, movimientos,
 *     solicitudes, preparación, incidencias y recuentos.
 *   - Un vehículo pasa a "activo logístico" en cuanto tiene cualquiera
 *     de esas actividades.
 */

export type Id = string;
export type ISODate = string;

/* ------------------------------------------------------------ ubicación */

export type SiteKind = 'campa' | 'concesion';

export interface Site {
  id: Id;
  name: string;
  kind: SiteKind;
  /** Sondika solo almacena; Leioa, Galdakao, Anoeta e Irun preparan. */
  prepares: boolean;
}

export type ZoneKind = 'tejavana' | 'parking' | 'taller';

export interface Zone {
  id: Id;
  siteId: Id;
  name: string;
  kind: ZoneKind;
  capacity: number;
}

export interface Position {
  id: Id;
  zoneId: Id;
  code: string;
}

/** Ubicación resuelta y lista para mostrar. */
export interface LocationRef {
  siteId: Id;
  zoneId?: Id;
  positionId?: Id;
}

/* ------------------------------------------------------------- vehículo */

export type VehicleType = 'VN' | 'VO';
export type Situation = 'stock' | 'pedido';

export type VehicleStatus =
  | 'recepcionado'
  | 'en_campa'
  | 'traslado_solicitado'
  | 'en_traslado'
  | 'en_preparacion'
  | 'apto_entrega'
  | 'entregado';

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  recepcionado: 'Recepcionado',
  en_campa: 'En campa',
  traslado_solicitado: 'Traslado solicitado',
  en_traslado: 'En traslado',
  en_preparacion: 'En preparación',
  apto_entrega: 'Apto entrega',
  entregado: 'Entregado',
};

/** Orden del flujo que se pinta en la ficha 360º. */
export const VEHICLE_FLOW: VehicleStatus[] = [
  'recepcionado',
  'en_campa',
  'traslado_solicitado',
  'en_preparacion',
  'apto_entrega',
];

export interface Vehicle {
  id: Id;
  /** Últimos 8 caracteres del bastidor: identificador operativo. */
  vin8: string;
  vin: string;
  plate: string | null;
  brand: string;
  model: string;
  type: VehicleType;
  situation: Situation;
  /** Comercial asignado; null = sin asignar. */
  salesRep: string | null;
  dealership: string;
  origin: string;
  /** false = está en el parque de Quiter pero sin actividad logística. */
  logisticActive: boolean;
  location: LocationRef | null;
  /** Sede a la que debe ir (destino operativo). */
  targetSiteId: Id | null;
  status: VehicleStatus;
  lastCheckAt: ISODate | null;
  lastCheckBy: string | null;
  lastMovementAt: ISODate | null;
  receivedAt: ISODate | null;
}

/* ----------------------------------------------------------- movimiento */

export type MovementStatus = 'planificado' | 'en_ruta' | 'completado' | 'cancelado';

export interface Movement {
  id: Id;
  vehicleId: Id;
  from: LocationRef | null;
  to: LocationRef;
  userId: Id;
  at: ISODate;
  status: MovementStatus;
  note?: string;
}

/* ------------------------------------------------------------ solicitud */

export type RequestType = 'traslado' | 'preparacion';
export type RequestStatus =
  | 'solicitada'
  | 'asignada'
  | 'en_ruta'
  | 'en_curso'
  | 'terminada'
  | 'bloqueada';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  solicitada: 'Solicitada',
  asignada: 'Asignada',
  en_ruta: 'En ruta',
  en_curso: 'En curso',
  terminada: 'Terminada',
  bloqueada: 'Bloqueada',
};

export interface ServiceRequest {
  id: Id;
  type: RequestType;
  vehicleId: Id;
  /** Sede responsable de atender la solicitud. */
  siteId: Id;
  from: LocationRef | null;
  to: LocationRef | null;
  status: RequestStatus;
  urgent: boolean;
  createdAt: ISODate;
  createdBy: Id;
  assignedTo: Id | null;
  note?: string;
}

/* ---------------------------------------------------------- preparación */

export type PrepPhase = 'pendiente' | 'base' | 'pendiente_elementos' | 'preentrega' | 'apto_entrega';

export const PREP_PHASES: PrepPhase[] = [
  'pendiente',
  'base',
  'pendiente_elementos',
  'preentrega',
  'apto_entrega',
];

export const PREP_PHASE_LABEL: Record<PrepPhase, string> = {
  pendiente: 'Pendiente',
  base: 'Base',
  pendiente_elementos: 'Pendiente elementos',
  preentrega: 'Preentrega',
  apto_entrega: 'Apto entrega',
};

export type PrepRunState = 'pendiente' | 'en_curso' | 'en_espera' | 'bloqueado' | 'terminado';

export const PREP_RUN_STATE_LABEL: Record<PrepRunState, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  en_espera: 'En espera',
  bloqueado: 'Bloqueado',
  terminado: 'Terminado',
};

/** Los tres estados de cada requisito. "No requerido" no penaliza el %. */
export type CheckState = 'completado' | 'pendiente' | 'no_requerido';

export interface ChecklistItem {
  requirementId: Id;
  label: string;
  state: CheckState;
  by?: string;
  at?: ISODate;
  /** "Preentrega cliente" es un simple check y no tiene cronómetro propio. */
  timed: boolean;
}

export interface Preparation {
  id: Id;
  vehicleId: Id;
  siteId: Id;
  preparerId: Id | null;
  phase: PrepPhase;
  runState: PrepRunState;
  items: ChecklistItem[];
  /** Milisegundos ya consolidados (sin contar el tramo en curso). */
  effectiveMs: number;
  waitingMs: number;
  targetMs: number;
  /** Instante desde el que corre el cronómetro; null si está parado. */
  runningSince: ISODate | null;
  waitingSince: ISODate | null;
  waitReason: string | null;
  startedAt: ISODate | null;
  finishedAt: ISODate | null;
}

/* ------------------------------------------------------------- recuento */

export interface CountFinding {
  vehicleId: Id;
  at: ISODate;
  by: Id;
  positionId?: Id;
  /** true si apareció en una posición distinta a la esperada. */
  misplaced?: boolean;
}

export interface FleetCount {
  id: Id;
  code: string;
  siteId: Id;
  zoneId: Id | null;
  startedAt: ISODate;
  closedAt: ISODate | null;
  responsibleId: Id;
  expected: Id[];
  found: CountFinding[];
}

/* ----------------------------------------------------------- incidencia */

export type IncidentType = 'recepcion' | 'transporte' | 'preparacion' | 'campa' | 'otro';
export type IncidentStatus = 'abierta' | 'pendiente' | 'cerrada';

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  recepcion: 'Recepción',
  transporte: 'Transporte',
  preparacion: 'Preparación',
  campa: 'Campa',
  otro: 'Otro',
};

export interface Incident {
  id: Id;
  vehicleId: Id;
  type: IncidentType;
  description: string;
  photos: string[];
  status: IncidentStatus;
  createdAt: ISODate;
  createdBy: Id;
  closedAt?: ISODate | null;
}

/* --------------------------------------------------------- notificación */

export type NotifyScopeKind = 'vehicle' | 'site' | 'fleet';

export type NotifyCondition =
  | 'llegada_sede'
  | 'preparacion_terminada'
  | 'sin_comprobar_72h'
  | 'incidencia_abierta'
  | 'traslado_completado'
  | 'preparacion_bloqueada';

export const NOTIFY_CONDITION_LABEL: Record<NotifyCondition, string> = {
  llegada_sede: 'Cuando llegue a la sede',
  preparacion_terminada: 'Cuando termine la preparación',
  sin_comprobar_72h: 'Si lleva más de 72 h sin comprobación',
  incidencia_abierta: 'Cuando se abra una incidencia',
  traslado_completado: 'Cuando se complete el traslado',
  preparacion_bloqueada: 'Cuando una preparación se bloquee',
};

export interface NotificationRule {
  id: Id;
  scopeKind: NotifyScopeKind;
  /** vehicleId o siteId según scopeKind; null para toda la flota. */
  scopeRef: Id | null;
  condition: NotifyCondition;
  /** Sede de referencia para la condición "llegada_sede". */
  targetSiteId?: Id | null;
  recipient: string;
  channels: ('push' | 'web' | 'email')[];
  active: boolean;
  createdAt: ISODate;
}

export interface NotificationEvent {
  id: Id;
  ruleId: Id | null;
  vehicleId: Id | null;
  title: string;
  body: string;
  at: ISODate;
  read: boolean;
  tone: 'info' | 'warn' | 'danger';
}

/* ------------------------------------------------------------ recepción */

export interface ReceptionLine {
  vehicleId: Id | null;
  /** Identificador leído del albarán aunque el vehículo aún no exista. */
  ref: string;
  unloaded: boolean;
  damage: string | null;
  photos: string[];
  positionId: Id | null;
}

export interface Reception {
  id: Id;
  truckPlate: string;
  carrier: string;
  siteId: Id;
  arrivedAt: ISODate;
  closedAt: ISODate | null;
  albaranUri: string | null;
  lines: ReceptionLine[];
}

/* -------------------------------------------------------- usuarios/roles */

export type Role = 'admin' | 'logistica' | 'preparador' | 'transportista' | 'recepcion' | 'comercial';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  logistica: 'Logística',
  preparador: 'Preparador',
  transportista: 'Transportista',
  recepcion: 'Recepción',
  comercial: 'Comercial',
};

export interface User {
  id: Id;
  name: string;
  role: Role;
  /** Sedes a las que tiene acceso; vacío = todas. */
  siteIds: Id[];
  email: string;
}

/* ------------------------------------------------- configuración (admin) */

export interface Requirement {
  id: Id;
  label: string;
  /** Si está vacío aplica a los dos tipos. */
  vehicleTypes: VehicleType[];
  /** Si está vacío aplica a todas las sedes. */
  siteIds: Id[];
  /** false = simple check sin cronómetro (p. ej. preentrega cliente). */
  timed: boolean;
  /** Se marca "no requerido" por defecto salvo que aplique. */
  optional: boolean;
  order: number;
}

export interface AdminConfig {
  /** Objetivo de preparación en minutos. */
  prepTargetMinutes: Record<VehicleType, number>;
  /** Horas sin comprobación física a partir de las que se avisa. */
  staleCheckHours: number;
  waitReasons: string[];
  requirements: Requirement[];
}

/* ---------------------------------------------------------- trazabilidad */

export type EventKind =
  | 'recepcion'
  | 'movimiento'
  | 'solicitud'
  | 'preparacion'
  | 'incidencia'
  | 'recuento'
  | 'notificacion'
  | 'estado';

export interface TraceEvent {
  id: Id;
  vehicleId: Id | null;
  kind: EventKind;
  title: string;
  detail: string;
  at: ISODate;
  userId: Id | null;
}

/* -------------------------------------------------------------- estado */

export interface AppState {
  users: User[];
  sites: Site[];
  zones: Zone[];
  positions: Position[];
  vehicles: Vehicle[];
  movements: Movement[];
  requests: ServiceRequest[];
  preparations: Preparation[];
  counts: FleetCount[];
  incidents: Incident[];
  rules: NotificationRule[];
  inbox: NotificationEvent[];
  receptions: Reception[];
  events: TraceEvent[];
  config: AdminConfig;
}
