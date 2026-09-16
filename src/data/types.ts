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
  | 'aparcado'
  | 'traslado_solicitado'
  | 'en_traslado'
  | 'en_preparacion'
  | 'apto_entrega'
  | 'entregado';

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  recepcionado: 'Recepcionado',
  // «Aparcado» y no «En campa»: el coche puede estar tan aparcado en la
  // campa de Sondika como en el parking de una concesión, y llamarlo «en
  // campa» estando en Galdakao decía una cosa que no era.
  aparcado: 'Aparcado',
  traslado_solicitado: 'Traslado solicitado',
  en_traslado: 'En traslado',
  en_preparacion: 'En preparación',
  apto_entrega: 'Apto entrega',
  entregado: 'Entregado',
};

/**
 * Orden del flujo que se pinta en la ficha 360º.
 *
 * «Entregado» va al final porque es el único estado del que no se vuelve
 * solo: sin él, un coche ya entregado pintaba el flujo en «Recepcionado»
 * —`indexOf` daba -1— y la ficha decía justo lo contrario de lo que pasa.
 */
export const VEHICLE_FLOW: VehicleStatus[] = [
  'recepcionado',
  'aparcado',
  'traslado_solicitado',
  'en_traslado',
  'en_preparacion',
  'apto_entrega',
  'entregado',
];

export interface Vehicle {
  primaryKeyLocation?: string | null;
  secondaryKeyLocation?: string | null;
  primaryKeyUpdatedAt?: ISODate | null;
  primaryKeyUpdatedBy?: Id | null;
  secondaryKeyUpdatedAt?: ISODate | null;
  secondaryKeyUpdatedBy?: Id | null;
  /** Último cambio de cualquiera de las dos, para compatibilidad e interfaz. */
  keysUpdatedAt?: ISODate | null;
  keysUpdatedBy?: Id | null;
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
  origin: string;
  /** false = está en el parque de Quiter pero sin actividad logística. */
  logisticActive: boolean;
  location: LocationRef | null;
  /** Fecha de la última observación que cambió o dejó sin confirmar la ubicación. */
  locationObservedAt?: ISODate | null;
  /** Sede a la que debe ir (destino operativo). */
  targetSiteId: Id | null;
  status: VehicleStatus;
  lastCheckAt: ISODate | null;
  lastCheckBy: string | null;
  lastMovementAt: ISODate | null;
  receivedAt: ISODate | null;
  /** Valores de los campos propios definidos en Administración. */
  custom?: Record<Id, string>;
  /** Fecha comprometida de entrega al cliente. */
  deliveryDate?: ISODate | null;
  /**
   * Cuándo se entregó de verdad al cliente, y quién lo dio por entregado.
   *
   * La fecha comprometida es una promesa y la de aquí es un hecho: un coche
   * puede entregarse antes, después o nunca. Sin este apunte, el comercial
   * que marca la entrega no tiene después dónde comprobar que la marcó.
   */
  deliveredAt?: ISODate | null;
  deliveredBy?: Id | null;
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
  | 'bloqueada'
  | 'cancelada';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  solicitada: 'Solicitada',
  asignada: 'Asignada',
  en_ruta: 'En ruta',
  en_curso: 'En curso',
  terminada: 'Terminada',
  bloqueada: 'Bloqueada',
  cancelada: 'Cancelada',
};

/**
 * Los motivos por los que un traslado llega tarde.
 *
 * Salen de lo que pasa de verdad en la campa, no de una lista teórica: si
 * las opciones no son las suyas, el transportista marca «otro» siempre y el
 * dato no sirve para nada.
 */
export type DelayReason = 'llaves' | 'averia' | 'cliente' | 'trafico' | 'carga' | 'otro';

export const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  llaves: 'No estaban las llaves',
  averia: 'Avería o problema con el coche',
  cliente: 'El cliente o la sede no estaba',
  trafico: 'Tráfico o carretera cortada',
  carga: 'Sin sitio en el camión',
  otro: 'Otro motivo',
};

export interface ServiceRequest {
  cancelledAt?: ISODate | null;
  cancelledBy?: Id | null;
  cancelReason?: string | null;
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
  /** Cuándo Logística dejó preparadas las llaves para este traslado. */
  keysReadyAt?: ISODate | null;
  /** Quién confirmó que las llaves estaban preparadas. */
  keysReadyBy?: Id | null;
  /** Cuándo se recogieron las llaves (solo traslados). */
  pickedUpAt: ISODate | null;
  /**
   * Cuándo se entregó de verdad, y quién lo dio por entregado.
   *
   * Sin esto un traslado terminado no dice cuándo se hizo: solo que ya no
   * está pendiente. Y sin la fecha no hay registro que mirar cuando hay que
   * hablar con la empresa de transporte.
   */
  deliveredAt: ISODate | null;
  deliveredBy: Id | null;
  /**
   * Qué trabajo se pide, en las solicitudes de preparación.
   *
   * El repaso de entrega lo pide el reloj el mismo día de la entrega, y el
   * preparador tiene que ver en su cola que son treinta minutos de limpieza
   * y no una preparación entera.
   */
  prepTipo?: TipoPreparacion;
  /**
   * Por qué se entregó fuera de plazo.
   *
   * Queda registrado *que* se pasó de las 48 h, pero sin el motivo la
   * conversación con el transportista es su palabra contra la nuestra. Con
   * el motivo apuntado en el momento, doce retrasos dejan de ser doce
   * discusiones y pasan a ser un dato: «ocho de doce fue que no estaban las
   * llaves». Solo se pide cuando llega tarde: al que llega a tiempo no se le
   * pregunta nada.
   */
  delayReason?: DelayReason | null;
  /** Lo que escriba el transportista cuando el motivo es «otro». */
  delayNote?: string | null;
  /** Empresa de transporte a la que se encarga el traslado. */
  carrierId: Id | null;
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

/**
 * Los dos trabajos distintos que se hacen sobre un coche en el taller.
 *
 * - **entrada**: la preparación de siempre, cuando el coche llega.
 * - **repaso**: el repaso de limpieza el día que se entrega al cliente.
 *
 * Son dos trabajos y no uno con dos duraciones. Si el repaso fuera una
 * preparación normal se rompían dos cosas: el reloj —media hora contra un
 * objetivo de dos horas hace que todo parezca ir de maravilla y esconde las
 * preparaciones de verdad— y el checklist, porque pedirle catorce requisitos
 * a quien va a pasar un trapo acaba con los catorce marcados sin mirar.
 *
 * Nace de las flotas de renting de Leioa: llegan muchos coches de golpe, se
 * preparan enteros, se quedan meses en la azotea y el día de la entrega se
 * les da un repaso por dentro y por fuera.
 */
export type TipoPreparacion = 'entrada' | 'repaso';

export const TIPO_PREPARACION_LABEL: Record<TipoPreparacion, string> = {
  entrada: 'Preparación',
  repaso: 'Repaso de entrega',
};

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

export type PrepRunState = 'pendiente' | 'en_curso' | 'en_espera' | 'bloqueado' | 'terminado' | 'cancelado';

export const PREP_RUN_STATE_LABEL: Record<PrepRunState, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  en_espera: 'En espera',
  bloqueado: 'Bloqueado',
  terminado: 'Terminado',
  cancelado: 'Cancelado',
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
  requestId?: Id | null;
  cancelledAt?: ISODate | null;
  cancelledBy?: Id | null;
  cancelReason?: string | null;
  id: Id;
  vehicleId: Id;
  siteId: Id;
  preparerId: Id | null;
  /** Preparación de entrada o repaso de entrega. Sin valor = entrada. */
  tipo?: TipoPreparacion;
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
  | 'preparacion_pedida'
  | 'preparacion_terminada'
  | 'sin_comprobar_72h'
  | 'traslado_sin_recoger'
  | 'incidencia_abierta'
  | 'traslado_completado'
  | 'preparacion_bloqueada';

export const NOTIFY_CONDITION_LABEL: Record<NotifyCondition, string> = {
  llegada_sede: 'Cuando llegue a la sede',
  preparacion_pedida: 'Cuando se pida una preparación',
  preparacion_terminada: 'Cuando el coche quede listo para entregar',
  sin_comprobar_72h: 'Si lleva más de 72 h sin comprobación',
  traslado_sin_recoger: 'Si un traslado lleva 24 h sin que recojan las llaves',
  incidencia_abierta: 'Cuando se abra una incidencia',
  traslado_completado: 'Cuando se complete el traslado',
  preparacion_bloqueada: 'Cuando una preparación se bloquee',
};

/**
 * Las condiciones que no las dispara nadie al hacer algo, sino el paso del
 * tiempo. Las revisa `alerts.sweep` (ver `commands.ts`).
 *
 * Antes `sin_comprobar_72h` estaba en la lista y en la configuración de
 * ejemplo, pero **no la disparaba nada**: la regla se podía crear y no
 * avisaba nunca. Es el motivo de que exista este apartado.
 */
export const CONDICIONES_POR_TIEMPO: NotifyCondition[] = ['sin_comprobar_72h', 'traslado_sin_recoger'];

/**
 * A quién va el aviso.
 *
 * Hasta ahora `recipient` era solo un nombre escrito y la bandeja la veía
 * todo el mundo: el aviso «Juan · llegó tu coche» le salía también al
 * preparador y al de recepción. Un aviso que le llega a todos no se lo cree
 * nadie, y en un mes ya nadie mira la campana.
 */
export type NotifyAudience =
  /** Todo el que entre: avisos de casa, como una incidencia grave. */
  | { kind: 'todos' }
  /** A todos los de un rol: los preparadores de la sede, la oficina. */
  | { kind: 'rol'; roleId: Role }
  /** Al comercial que lleva ese coche, sea quien sea en ese momento. */
  | { kind: 'comercial' };

export interface NotificationRule {
  id: Id;
  scopeKind: NotifyScopeKind;
  /** vehicleId o siteId según scopeKind; null para toda la flota. */
  scopeRef: Id | null;
  condition: NotifyCondition;
  /** Sede de referencia para la condición "llegada_sede". */
  targetSiteId?: Id | null;
  /** A quién le llega. Sin esto, a todo el mundo. */
  audience?: NotifyAudience;
  recipient: string;
  channels: ('push' | 'web' | 'email')[];
  active: boolean;
  createdAt: ISODate;
}

export interface NotificationEvent {
  id: Id;
  ruleId: Id | null;
  vehicleId: Id | null;
  /**
   * Quién tiene que verlo. Vacío o ausente = todo el mundo.
   *
   * Se resuelve al crear el aviso y no al leerlo: el comercial de un coche
   * puede cambiar mañana, y el aviso de hoy era para el de hoy.
   */
  userIds?: Id[] | null;
  title: string;
  body: string;
  at: ISODate;
  read: boolean;
  /** Lectura individual. `read` se conserva para las versiones antiguas. */
  readBy?: Id[];
  tone: 'info' | 'warn' | 'danger';
}

/* ------------------------------------------------------------ recepción */

export interface ReceptionLine {
  zoneId?: Id | null;
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

/* ------------------------------------------------- empresas de transporte */

/**
 * Empresa que hace los traslados. Urkiola trabaja con varias según la zona:
 * una para Bizkaia y otra para fuera.
 */
export interface Carrier {
  id: Id;
  name: string;
  /** Sedes que cubre; sirve para proponerla sola al pedir el traslado. */
  siteIds: Id[];
  phone: string;
  active: boolean;
  note?: string;
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
  | 'panel.ver'
  | 'flota.ver'
  | 'flota.editar'
  | 'flota.asignarse'
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
  | 'entregas.gestionar'
  | 'notificaciones.gestionar'
  | 'admin.configurar';

export const PERMISSION_LABEL: Record<Permission, string> = {
  'panel.ver': 'Ver el panel de control',
  'flota.ver': 'Ver la flota y las fichas',
  'flota.editar': 'Editar campos propios del vehículo',
  'flota.asignarse': 'Vende coches: se los asigna y ve «Mis coches»',
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
  'entregas.gestionar': 'Fijar fechas de entrega al cliente',
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
  /** Solo para transportistas: la empresa a la que pertenecen. */
  carrierId?: Id | null;
}

/* ------------------------------------------------- configuración (admin) */

export interface Requirement {
  id: Id;
  label: string;
  /** Si está vacío aplica a los dos tipos. */
  vehicleTypes: VehicleType[];
  /** Si está vacío aplica a todas las sedes. */
  siteIds: Id[];
  /**
   * En qué trabajo aparece. Si está vacío, en los dos.
   *
   * Los diez requisitos de siempre son de la preparación de entrada; el
   * repaso lleva los suyos, que son dos.
   */
  tipos?: TipoPreparacion[];
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
  { key: 'target', label: 'Destino operativo' },
  { key: 'received', label: 'Fecha de recepción' },
];

export interface AdminConfig {
  /** Objetivo de preparación en minutos. */
  prepTargetMinutes: Record<VehicleType, number>;
  /**
   * Objetivo del repaso de entrega, en minutos.
   *
   * Va aparte del de la preparación porque no es el mismo trabajo: media
   * hora de limpieza no se mide contra las dos horas de una preparación
   * entera.
   */
  repasoTargetMinutes: number;
  /** Horas sin comprobación física a partir de las que se avisa. */
  staleCheckHours: number;
  /**
   * Horas que puede estar un traslado encargado sin que nadie recoja las
   * llaves antes de avisar. Es donde se pierden los días: el plazo de 48 h
   * del transportista no empieza hasta la recogida, así que un traslado
   * olvidado no llega tarde nunca, simplemente no avanza.
   */
  pickupAlertHours: number;
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
  carriers: Carrier[];
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
