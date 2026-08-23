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
  /** Valores de los campos propios definidos en Administración. */
  custom?: Record<Id, string>;
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
  /**
   * Fecha límite del servicio.
   *
   * - Traslado: 48 h desde que el transportista recoge las llaves, así que
   *   no existe hasta la recogida.
   * - Preparación: 48 h desde que el comercial la solicita, que es el
   *   plazo mínimo que tiene que dar.
   *
   * Se guarda calculada, no se recalcula: si mañana cambia el plazo en
   * Administración, lo ya comprometido no se mueve.
   */
  dueAt: ISODate | null;
  /** Cuándo se recogieron las llaves (solo traslados). */
  pickedUpAt: ISODate | null;
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

/**
 * Los roles son configurables desde Administración, así que `Role` es un
 * identificador libre. Los seis de abajo vienen de serie y no se pueden
 * borrar, pero sí renombrar y cambiarles los permisos.
 */
export type Role = string;

export const BUILTIN_ROLES = [
  'admin',
  'logistica',
  'preparador',
  'transportista',
  'recepcion',
  'comercial',
] as const;

/** Todo lo que se puede permitir o denegar a un rol. */
export type Permission =
  | 'flota.ver'
  | 'flota.editar'
  | 'campa.ver'
  | 'movimientos.registrar'
  | 'traslados.propios'
  | 'solicitudes.crear'
  | 'solicitudes.gestionar'
  | 'preparacion.ejecutar'
  | 'preparacion.gestionar'
  | 'recuentos.ejecutar'
  | 'incidencias.crear'
  | 'incidencias.cerrar'
  | 'recepcion.ejecutar'
  | 'notificaciones.gestionar'
  | 'admin.configurar';

export const PERMISSION_LABEL: Record<Permission, string> = {
  'flota.ver': 'Ver la flota y las fichas',
  'flota.editar': 'Editar campos propios del vehículo',
  'campa.ver': 'Ver campas y plazas',
  'movimientos.registrar': 'Registrar movimientos',
  'traslados.propios': 'Ver y completar solo sus traslados asignados',
  'solicitudes.crear': 'Crear solicitudes',
  'solicitudes.gestionar': 'Gestionar y asignar solicitudes',
  'preparacion.ejecutar': 'Trabajar en preparaciones',
  'preparacion.gestionar': 'Ver y gestionar todas las preparaciones',
  'recuentos.ejecutar': 'Hacer recuentos',
  'incidencias.crear': 'Registrar incidencias',
  'incidencias.cerrar': 'Cerrar incidencias',
  'recepcion.ejecutar': 'Recepcionar camiones',
  'notificaciones.gestionar': 'Configurar avisos',
  'admin.configurar': 'Administrar la configuración',
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABEL) as Permission[];

export interface RoleConfig {
  id: Role;
  label: string;
  permissions: Permission[];
  /**
   * Secciones que este rol ve en el teléfono. La app es deliberadamente
   * más corta que la web: aquí se decide cuánto.
   */
  mobileSections: string[];
  /**
   * Interfaz reducida para colaboradores externos: una sola pantalla con
   * su trabajo asignado, sin menú, sin pestañas y sin acceso al resto.
   */
  simple?: boolean;
  /** Los de serie no se pueden borrar. */
  builtin: boolean;
}

export interface User {
  id: Id;
  name: string;
  role: Role;
  /** Sedes a las que tiene acceso; vacío = todas. */
  siteIds: Id[];
  email: string;
  active: boolean;
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

export type CustomFieldType = 'texto' | 'lista' | 'numero' | 'si_no';

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  texto: 'Texto libre',
  lista: 'Lista de opciones',
  numero: 'Número',
  si_no: 'Sí / No',
};

/**
 * Campo propio de vehículo, para clasificar la flota de formas que no
 * estaban previstas (campaña, financiera, cliente, prioridad…).
 */
export interface CustomField {
  id: Id;
  label: string;
  type: CustomFieldType;
  /** Opciones cuando el tipo es 'lista'. */
  options: string[];
  /** Si aparece como columna en la lista de flota. */
  showInTable: boolean;
  /** Si se puede filtrar por él. */
  filterable: boolean;
  order: number;
}

/** Preferencia de una columna de la tabla de flota. */
export interface ColumnPref {
  /** Clave base ('vin8', 'plate'…) o `custom:<id>` para un campo propio. */
  key: string;
  visible: boolean;
  order: number;
}

/** Columnas de serie de la lista de flota. */
export const BASE_COLUMNS: { key: string; label: string }[] = [
  { key: 'vin8', label: 'VIN-8' },
  { key: 'plate', label: 'Matrícula' },
  { key: 'model', label: 'Vehículo' },
  { key: 'type', label: 'Tipo' },
  { key: 'rep', label: 'Comercial' },
  { key: 'situation', label: 'Situación' },
  { key: 'location', label: 'Ubicación' },
  { key: 'status', label: 'Estado' },
  { key: 'check', label: 'Última comprobación' },
  { key: 'dealership', label: 'Concesión' },
  { key: 'target', label: 'Destino operativo' },
  { key: 'received', label: 'Fecha de recepción' },
];

export interface AdminConfig {
  /** Objetivo de preparación en minutos. */
  prepTargetMinutes: Record<VehicleType, number>;
  /** Horas sin comprobación física a partir de las que se avisa. */
  staleCheckHours: number;
  waitReasons: string[];
  requirements: Requirement[];
  /** Horas que tiene el transportista desde que recoge las llaves. */
  transferDeadlineHours: number;
  /** Horas de preparación que como mínimo debe dar el comercial. */
  prepDeadlineHours: number;
  /** Campos propios de vehículo. */
  customFields: CustomField[];
  /** Qué columnas se ven en la lista de flota y en qué orden. */
  fleetColumns: ColumnPref[];
  /** Roles y sus permisos. */
  roles: RoleConfig[];
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
