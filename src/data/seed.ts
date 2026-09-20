import { ALL_PERMISSIONS, BASE_COLUMNS } from './types';
import type {
  AdminConfig,
  AppState,
  Carrier,
  ColumnPref,
  CustomField,
  DelayReason,
  RoleConfig,
  FleetCount,
  Id,
  Incident,
  Movement,
  NotificationEvent,
  NotificationRule,
  Preparation,
  Position,
  Reception,
  Requirement,
  ServiceRequest,
  Site,
  TraceEvent,
  User,
  Vehicle,
  Zone,
} from './types';

/* ------------------------------------------------------- utilidades PRNG */

/** Generador determinista: el parque demo es siempre el mismo. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEMILLA = 20260819;
let rnd = mulberry32(SEMILLA);

/**
 * Vuelve a empezar la serie.
 *
 * El generador es determinista, pero es uno solo para todo el módulo: sin
 * reiniciarlo, la segunda vez que se construye el parque de ejemplo sigue
 * la serie donde la dejó la primera y sale un parque distinto. Se notaba al
 * comparar dos estados recién creados —y habría hecho que «volver a los
 * datos de ejemplo» diera algo diferente cada vez.
 */
function reiniciarAzar() {
  rnd = mulberry32(SEMILLA);
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

/* ------------------------------------------------------------- catálogo */

export const SITES: Site[] = [
  { id: 'sondika', name: 'Sondika', kind: 'campa', prepares: false },
  { id: 'leioa', name: 'Leioa', kind: 'concesion', prepares: true },
  { id: 'galdakao', name: 'Galdakao', kind: 'concesion', prepares: true },
  { id: 'anoeta', name: 'Anoeta', kind: 'concesion', prepares: true },
  { id: 'irun', name: 'Irun', kind: 'concesion', prepares: true },
];

export const PREP_SITES = SITES.filter((s) => s.prepares);

function buildZonesAndPositions(): { zones: Zone[]; positions: Position[] } {
  const zones: Zone[] = [];
  const positions: Position[] = [];

  // Sondika: 12 tejavanas × 20 posiciones = 240 plazas.
  for (let i = 1; i <= 12; i++) {
    const name = `Tejavana ${String(i).padStart(2, '0')}`;
    const zoneId = `sondika-tej-${String(i).padStart(2, '0')}`;
    zones.push({ id: zoneId, siteId: 'sondika', name, kind: 'tejavana', capacity: 20 });
    for (let p = 1; p <= 20; p++) {
      positions.push({ id: `${zoneId}-p${String(p).padStart(2, '0')}`, zoneId, code: `P${String(p).padStart(2, '0')}` });
    }
  }

  // Concesiones: 3 parkings × 30 plazas.
  for (const site of PREP_SITES) {
    for (let i = 1; i <= 3; i++) {
      const zoneId = `${site.id}-park-${String(i).padStart(2, '0')}`;
      zones.push({
        id: zoneId,
        siteId: site.id,
        name: `Parking ${String(i).padStart(2, '0')}`,
        kind: 'parking',
        capacity: 30,
      });
      for (let p = 1; p <= 30; p++) {
        positions.push({ id: `${zoneId}-p${String(p).padStart(2, '0')}`, zoneId, code: `P${String(p).padStart(2, '0')}` });
      }
    }
  }

  // La azotea de Leioa: donde esperan las flotas de renting, que llegan de
  // golpe, se preparan enteras y se quedan meses hasta que hay entrega.
  zones.push({ id: 'leioa-azotea', siteId: 'leioa', name: 'Azotea', kind: 'parking', capacity: 40 });
  for (let p = 1; p <= 40; p++) {
    positions.push({
      id: `leioa-azotea-p${String(p).padStart(2, '0')}`,
      zoneId: 'leioa-azotea',
      code: `A${String(p).padStart(2, '0')}`,
    });
  }

  return { zones, positions };
}

export const USERS: User[] = [
  { id: 'u-admin', name: 'Jon Aranburu', role: 'admin', siteIds: [], email: 'admin@urkiolacarservice.com', active: true },
  { id: 'u-log', name: 'Marta Ibarra', role: 'logistica', siteIds: [], email: 'logistica@urkiolacarservice.com', active: true },
  { id: 'u-pedro', name: 'Pedro Larrea', role: 'preparador', siteIds: ['leioa'], email: 'pedro@urkiolacarservice.com', active: true },
  { id: 'u-ane', name: 'Ane Zubiaur', role: 'preparador', siteIds: ['leioa', 'galdakao'], email: 'ane@urkiolacarservice.com', active: true },
  { id: 'u-jon', name: 'Jon Etxaniz', role: 'preparador', siteIds: ['anoeta', 'irun'], email: 'jon@urkiolacarservice.com', active: true },
  { id: 'u-iker', name: 'Iker Solano', role: 'transportista', siteIds: [], email: 'transporte@urkiolacarservice.com', active: true, carrierId: 'gruas-francis' },
  { id: 'u-aitor', name: 'Aitor Bengoa', role: 'transportista', siteIds: [], email: 'betigoiz@urkiolacarservice.com', active: true, carrierId: 'gruas-betigoiz' },
  { id: 'u-nerea', name: 'Nerea Goiri', role: 'recepcion', siteIds: ['sondika'], email: 'recepcion@urkiolacarservice.com', active: true },
  {
    id: 'u-dir-vn',
    name: 'Dirección VN',
    role: 'director_comercial',
    siteIds: [],
    email: 'direccion.vn@urkiolacarservice.com',
    active: true,
    managedBrands: ['BMW', 'MINI'],
  },
  {
    id: 'u-resp-vo',
    name: 'Responsable VO',
    role: 'responsable_vo',
    siteIds: [],
    email: 'responsable.vo@urkiolacarservice.com',
    active: true,
  },
  { id: 'u-juan', name: 'Juan Bilbao', role: 'comercial', siteIds: ['leioa'], email: 'juan@urkiolacarservice.com', active: true, managerId: 'u-dir-vn' },
];

/* ------------------------------------------------------- roles y permisos */

/** Roles de serie. Se pueden renombrar y cambiar sus permisos desde la app. */
export const ROLES: RoleConfig[] = [
  {
    id: 'admin',
    label: 'Administrador',
    // Todo menos los tres permisos que marcan un oficio concreto: «vende
    // coches» (`flota.asignarse`), «lleva traslados» (`traslados.propios`) y
    // «trabaja preparaciones» (`preparacion.ejecutar`). Son los que hacen
    // aparecer «Mis coches», «Mis traslados» y «Mi preparación», que a quien
    // no hace ese trabajo le salen vacías o con el trabajo de otros. Si
    // alguna vez hace falta —cubrir una preparación un sábado— se marca
    // desde Administración como cualquier otro permiso.
    permissions: ALL_PERMISSIONS.filter(
      (p) => p !== 'flota.asignarse' && p !== 'traslados.propios' && p !== 'preparacion.ejecutar'
    ),
    mobileSections: ['/flota', '/solicitudes', '/mover', '/recuentos', '/incidencias'],
    builtin: true,
  },
  {
    id: 'logistica',
    label: 'Logística',
    // Todo menos administrar, el panel de control —que es de dirección— y
    // «vende coches». La oficina asigna comercial a cualquiera con
    // `flota.editar`, que es su herramienta; `flota.asignarse` es para
    // quedarse uno mismo un coche, y eso lo hace quien vende.
    permissions: ALL_PERMISSIONS.filter(
      (p) =>
        p !== 'admin.configurar' &&
        p !== 'panel.ver' &&
        p !== 'flota.asignarse' &&
        p !== 'traslados.propios' &&
        p !== 'preparacion.ejecutar'
    ),
    mobileSections: ['/solicitudes', '/entregas', '/mover', '/flota'],
    builtin: true,
  },
  {
    id: 'preparador',
    label: 'Preparador',
    permissions: [
      'flota.ver',
      'campa.ver',
      'movimientos.registrar',
      'solicitudes.crear',
      'preparacion.ejecutar',
      'recuentos.ejecutar',
      'incidencias.crear',
    ],
    // En el móvil entra directo a su cola de trabajo.
    mobileSections: ['/mi-preparacion', '/mover', '/recuentos', '/flota'],
    builtin: true,
  },
  {
    id: 'transportista',
    label: 'Transportista (externo)',
    // Un proveedor externo no tiene por qué ver la flota entera ni las
    // campas: solo los traslados que le han asignado.
    permissions: ['traslados.propios', 'movimientos.registrar', 'incidencias.crear'],
    mobileSections: ['/mis-traslados'],
    simple: true,
    builtin: true,
  },
  {
    id: 'recepcion',
    label: 'Recepción',
    permissions: [
      'flota.ver',
      'campa.ver',
      'movimientos.registrar',
      'recepcion.ejecutar',
      'incidencias.crear',
      'recuentos.ejecutar',
    ],
    // En el móvil entra directo a la descarga del camión.
    mobileSections: ['/mi-recepcion', '/mover', '/recuentos', '/flota'],
    builtin: true,
  },
  {
    id: 'director_comercial',
    label: 'Director comercial',
    permissions: ['flota.ver', 'solicitudes.crear', 'entregas.gestionar'],
    mobileSections: ['/flota', '/entregas'],
    builtin: true,
  },
  {
    id: 'responsable_vo',
    label: 'Responsable VO',
    permissions: ['flota.ver', 'solicitudes.crear', 'entregas.gestionar'],
    mobileSections: ['/flota', '/entregas'],
    builtin: true,
  },
  {
    id: 'comercial',
    label: 'Comercial',
    // El comercial también mueve coches: los saca a la puerta, los lleva a
    // la exposición y los devuelve.
    permissions: [
      'flota.ver',
      'movimientos.registrar',
      'solicitudes.crear',
      // Se queda los coches que va a vender él, sin pasar por la oficina.
      'flota.asignarse',
      'entregas.gestionar',
      'notificaciones.gestionar',
    ],
    mobileSections: ['/mis-coches', '/entregas', '/mover', '/flota'],
    builtin: true,
  },
];

/* ------------------------------------------------- campos propios y columnas */

/** Ejemplos de campo propio, para que se vea cómo funciona. */
const CUSTOM_FIELDS: CustomField[] = [
  {
    id: 'cf-financiera',
    label: 'Financiera',
    type: 'lista',
    options: ['Contado', 'Financiado', 'Renting'],
    showInTable: false,
    filterable: true,
    order: 1,
  },
  {
    id: 'cf-prioridad',
    label: 'Prioridad',
    type: 'lista',
    options: ['Normal', 'Alta', 'Urgente'],
    showInTable: false,
    filterable: true,
    order: 2,
  },
];

const FLEET_COLUMNS: ColumnPref[] = BASE_COLUMNS.map((col, i) => ({
  key: col.key,
  // De serie se ven las nueve del mockup; el resto se activan si hacen falta.
  visible: !['target', 'received'].includes(col.key),
  order: i + 1,
}));

const SALES_REPS = ['Juan', 'Ane', 'Pedro'];

/* ---------------------------------------------- empresas de transporte */

/**
 * Urkiola reparte los traslados por zona: dentro de Bizkaia una empresa y
 * fuera otra. Las sedes que cubre cada una sirven para proponerla sola.
 */
export const CARRIERS: Carrier[] = [
  {
    id: 'gruas-francis',
    name: 'Grúas Francis',
    siteIds: ['sondika', 'leioa', 'galdakao'],
    phone: '',
    active: true,
    note: 'Traslados dentro de Bizkaia.',
  },
  {
    id: 'gruas-betigoiz',
    name: 'Grúas Betigoiz',
    siteIds: ['anoeta', 'irun'],
    phone: '',
    active: true,
    note: 'Traslados fuera de Bizkaia.',
  },
];

/** Empresa que cubre una ruta: la que llega al destino, y mejor si también al origen. */
export function carrierForRoute(
  carriers: Carrier[],
  fromSiteId: Id | undefined,
  toSiteId: Id | undefined
): Carrier | undefined {
  const activos = carriers.filter((c) => c.active);
  if (!toSiteId) return undefined;
  const ambas = activos.find(
    (c) => c.siteIds.includes(toSiteId) && (!fromSiteId || c.siteIds.includes(fromSiteId))
  );
  return ambas ?? activos.find((c) => c.siteIds.includes(toSiteId));
}

const CATALOG: { brand: string; models: string[]; type: 'VN' | 'VO' }[] = [
  { brand: 'BMW', models: ['X1', 'X2', 'X3', 'Serie 1', 'Serie 3', 'iX1'], type: 'VN' },
  { brand: 'MINI', models: ['Cooper', 'Countryman', 'Clubman'], type: 'VN' },
  { brand: 'Toyota', models: ['Corolla', 'C-HR', 'Yaris Cross', 'RAV4'], type: 'VN' },
  { brand: 'BMW', models: ['X3', 'Serie 5', 'Serie 2'], type: 'VO' },
  { brand: 'Volkswagen', models: ['Golf', 'T-Roc', 'Polo'], type: 'VO' },
  { brand: 'Seat', models: ['León', 'Ateca', 'Ibiza'], type: 'VO' },
];

const PLATE_LETTERS = 'BCDFGHJKLMNPRSTVWXYZ';

function randomPlate(): string {
  const n = String(Math.floor(1000 + rnd() * 8999));
  const l = Array.from({ length: 3 }, () => PLATE_LETTERS[Math.floor(rnd() * PLATE_LETTERS.length)]).join('');
  return `${n} ${l}`;
}

function randomVin8(): string {
  return Array.from({ length: 8 }, () => '0123456789ABCDEFGHJKLMNPRSTUVWXYZ'[Math.floor(rnd() * 33)]).join('');
}

/* ------------------------------------------------------- configuración */

/**
 * El checklist de las dos clases de trabajo.
 *
 * Los diez de siempre son de la preparación de entrada. El repaso de
 * entrega lleva los suyos, que son dos: es limpiar un coche que ya está
 * preparado, y pedirle catorce requisitos a quien va a pasar un trapo acaba
 * con los catorce marcados sin mirar.
 */
const REQUIREMENTS: Requirement[] = [
  { id: 'req-lavado', label: 'Lavado', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: true, optional: false, order: 1 },
  { id: 'req-pdi', label: 'PDI', vehicleTypes: ['VN'], siteIds: [], tipos: ['entrada'], timed: true, optional: false, order: 2 },
  { id: 'req-combustible', label: 'Combustible', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: true, optional: false, order: 3 },
  { id: 'req-fotos', label: 'Reportaje final (4 fotos)', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: false, optional: false, order: 4 },
  { id: 'req-alfombrillas', label: 'Alfombrillas', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: true, optional: false, order: 5 },
  { id: 'req-matriculas', label: 'Matrículas', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: true, optional: false, order: 6 },
  { id: 'req-baliza', label: 'Baliza', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: true, optional: false, order: 7 },
  { id: 'req-kit', label: 'Kit reparapinchazos', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: true, optional: false, order: 8 },
  { id: 'req-preentrega', label: 'Preentrega cliente', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: false, optional: false, order: 9 },
  { id: 'req-campana', label: 'Campaña de marca', vehicleTypes: [], siteIds: [], tipos: ['entrada'], timed: true, optional: true, order: 10 },
  { id: 'req-repaso-ext', label: 'Limpieza exterior', vehicleTypes: [], siteIds: [], tipos: ['repaso'], timed: true, optional: false, order: 11 },
  { id: 'req-repaso-int', label: 'Limpieza interior', vehicleTypes: [], siteIds: [], tipos: ['repaso'], timed: true, optional: false, order: 12 },
];

export const CONFIG: AdminConfig = {
  prepTargetMinutes: { VN: 120, VO: 150 },
  // Media hora: es limpiar por dentro y por fuera un coche que ya está
  // preparado, no prepararlo.
  repasoTargetMinutes: 30,
  staleCheckHours: 72,
  pickupAlertHours: 24,
  waitReasons: ['Material', 'Matrículas', 'Documentación', 'Accesorios', 'Autorización', 'Incidencia', 'Otro'],
  requirements: REQUIREMENTS,
  transferDeadlineHours: 48,
  prepDeadlineHours: 48,
  customFields: CUSTOM_FIELDS,
  fleetColumns: FLEET_COLUMNS,
  roles: ROLES,
};

/* ----------------------------------------------------------- generación */

type Build = {
  vehicles: Vehicle[];
  movements: Movement[];
  requests: ServiceRequest[];
  preparations: Preparation[];
  incidents: Incident[];
  events: TraceEvent[];
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(5, '0')}`;

function makeVehicle(partial: Partial<Vehicle>): Vehicle {
  const entry = pick(CATALOG);
  const type = partial.type ?? entry.type;
  const vin8 = partial.vin8 ?? randomVin8();

  // Mantener exactamente el orden de consumo del PRNG de la demo: varios
  // tests dependen de que el mismo seed produzca el mismo parque.
  const vin = partial.vin ?? `WBA${randomVin8()}${vin8}`;
  const plate = partial.plate !== undefined
    ? partial.plate
    : type === 'VO' || chance(0.45)
      ? randomPlate()
      : null;
  const brand = partial.brand ?? entry.brand;
  const model = partial.model ?? pick(entry.models);
  const situation = partial.situation ?? (chance(0.45) ? 'pedido' : 'stock');
  const salesRep = partial.salesRep !== undefined ? partial.salesRep : chance(0.6) ? pick(SALES_REPS) : null;

  const coincidentes = salesRep
    ? USERS.filter((u) => u.active && u.role === 'comercial' && (
        u.name.trim().toLowerCase() === salesRep.trim().toLowerCase() ||
        u.name.trim().toLowerCase().startsWith(`${salesRep.trim().toLowerCase()} `)
      ))
    : [];
  const salesRepId = partial.salesRepId !== undefined
    ? partial.salesRepId
    : coincidentes.length === 1 ? coincidentes[0].id : null;

  const lastCheckAt = partial.lastCheckAt ?? iso(Math.floor(rnd() * 30) * HOUR);
  const lastCheckBy = partial.lastCheckBy ?? pick(['Pedro Larrea', 'Ane Zubiaur', 'Nerea Goiri']);
  const lastMovementAt = partial.lastMovementAt ?? iso(Math.floor(rnd() * 6) * DAY);
  const receivedAt = partial.receivedAt ?? iso(Math.floor(rnd() * 40) * DAY);

  return {
    id: partial.id ?? `v-${vin8}`,
    vin8,
    vin,
    plate,
    brand,
    model,
    type,
    situation,
    commercialArea: partial.commercialArea ?? (type === 'VO' ? 'vo' : 'vn'),
    commercialCategory: partial.commercialCategory ?? (type === 'VO' ? 'VO' : 'VN'),
    salesRep,
    salesRepId,
    origin: partial.origin ?? 'Camión · recepción',
    logisticActive: partial.logisticActive ?? true,
    location: partial.location ?? null,
    targetSiteId: partial.targetSiteId ?? null,
    status: partial.status ?? 'aparcado',
    lastCheckAt,
    lastCheckBy,
    lastMovementAt,
    receivedAt,
  };
}

function buildFleet(positions: Position[]): Build {
  const vehicles: Vehicle[] = [];
  const movements: Movement[] = [];
  const requests: ServiceRequest[] = [];
  const preparations: Preparation[] = [];
  const incidents: Incident[] = [];
  const events: TraceEvent[] = [];

  const positionsBySite = (siteId: Id) =>
    positions.filter((p) => p.zoneId.startsWith(siteId));

  const used = new Set<string>();
  // La azotea de Leioa se reserva para el renting: es donde esperan las
  // flotas y no un parking más donde repartir el stock del día.
  for (const p of positions) if (p.zoneId === 'leioa-azotea') used.add(p.id);
  const takePosition = (siteId: Id, preferred?: string): Position => {
    if (preferred) {
      const exact = positions.find((p) => p.id === preferred);
      if (exact && !used.has(exact.id)) {
        used.add(exact.id);
        return exact;
      }
    }
    const pool = positionsBySite(siteId).filter((p) => !used.has(p.id));
    const chosen = pool[Math.floor(rnd() * pool.length)] ?? positionsBySite(siteId)[0];
    used.add(chosen.id);
    return chosen;
  };

  const locate = (siteId: Id, preferred?: string) => {
    const pos = takePosition(siteId, preferred);
    return { siteId, zoneId: pos.zoneId, positionId: pos.id };
  };

  /** Primera plaza libre de una zona concreta; si está llena, cualquiera de la sede. */
  const locateInZone = (siteId: Id, zoneId: Id) => {
    const free = positions.find((p) => p.zoneId === zoneId && !used.has(p.id));
    if (!free) return locate(siteId);
    used.add(free.id);
    return { siteId, zoneId, positionId: free.id };
  };

  /* --- vehículos protagonistas del mockup ------------------------------ */

  const bmwX1 = makeVehicle({
    id: 'v-12345678',
    vin8: '12345678',
    vin: 'WBA0X1PL12345678',
    plate: null,
    brand: 'BMW',
    model: 'X1',
    type: 'VN',
    situation: 'pedido',
    salesRep: 'Juan',
    origin: 'Camión 9876 JKL · recepción',
    location: locate('sondika', 'sondika-tej-01-p04'),
    targetSiteId: 'leioa',
    status: 'traslado_solicitado',
    lastCheckAt: iso(2 * HOUR),
    lastCheckBy: 'Pedro Larrea',
    lastMovementAt: iso(7 * HOUR),
    receivedAt: iso(9 * HOUR),
  });
  vehicles.push(bmwX1);

  const bmwX3 = makeVehicle({
    id: 'v-4821LKM',
    vin8: '5UXTY3C0',
    plate: '4821 LKM',
    brand: 'BMW',
    model: 'X3',
    type: 'VO',
    situation: 'pedido',
    salesRep: 'Ane',
    location: locate('leioa', 'leioa-park-01-p02'),
    targetSiteId: 'leioa',
    status: 'en_preparacion',
    lastCheckAt: iso(3 * HOUR),
  });
  vehicles.push(bmwX3);

  const toyota = makeVehicle({
    id: 'v-7251KRX',
    vin8: 'JTNK4RBE',
    plate: '7251 KRX',
    brand: 'Toyota',
    model: 'Corolla',
    type: 'VN',
    situation: 'stock',
    salesRep: null,
    location: locate('galdakao', 'galdakao-park-01-p01'),
    status: 'aparcado',
    lastCheckAt: iso(4 * HOUR),
  });
  vehicles.push(toyota);

  const dmg = makeVehicle({
    id: 'v-23456789',
    vin8: '23456789',
    brand: 'BMW',
    model: 'Serie 1',
    type: 'VN',
    situation: 'stock',
    location: locate('sondika', 'sondika-tej-01-p05'),
    status: 'aparcado',
    lastCheckAt: iso(2 * HOUR + 10 * MIN),
  });
  vehicles.push(dmg);

  const pending = makeVehicle({
    id: 'v-34567890',
    vin8: '34567890',
    brand: 'MINI',
    model: 'Countryman',
    type: 'VN',
    situation: 'pedido',
    salesRep: 'Pedro',
    location: locate('sondika', 'sondika-tej-01-p06'),
    status: 'recepcionado',
    lastCheckAt: iso(2 * HOUR + 15 * MIN),
  });
  vehicles.push(pending);

  const blocked = makeVehicle({
    id: 'v-9032MTR',
    vin8: '3VW7T5AU',
    plate: '9032 MTR',
    brand: 'Volkswagen',
    model: 'T-Roc',
    type: 'VO',
    situation: 'pedido',
    salesRep: 'Ane',
    location: locate('anoeta', 'anoeta-park-01-p01'),
    targetSiteId: 'anoeta',
    status: 'en_preparacion',
    lastCheckAt: iso(5 * HOUR),
  });
  vehicles.push(blocked);

  // Dos vehículos deliberadamente sin comprobar hace días.
  const stale1 = makeVehicle({
    id: 'v-87654321',
    vin8: '87654321',
    brand: 'Seat',
    model: 'Ateca',
    type: 'VO',
    location: locate('sondika'),
    status: 'aparcado',
    lastCheckAt: iso(7 * DAY),
  });
  const stale2 = makeVehicle({
    id: 'v-98765432',
    vin8: '98765432',
    brand: 'Toyota',
    model: 'RAV4',
    type: 'VN',
    location: locate('sondika'),
    status: 'aparcado',
    lastCheckAt: iso(3 * DAY + 4 * HOUR),
  });
  vehicles.push(stale1, stale2);

  /* --- resto del parque activo ---------------------------------------- */

  const TOTAL_ACTIVE = 428;
  const SONDIKA_TOTAL = 183;

  // 3 plazas se reservan para los vehículos que están viajando: conservan su
  // última ubicación conocida (Sondika) hasta que se confirma la llegada.
  const IN_TRANSIT = 3;
  const sondikaRemaining =
    SONDIKA_TOTAL - vehicles.filter((v) => v.location?.siteId === 'sondika').length - IN_TRANSIT;
  const otherRemaining =
    TOTAL_ACTIVE - SONDIKA_TOTAL - vehicles.filter((v) => v.location?.siteId !== 'sondika').length;

  for (let i = 0; i < sondikaRemaining; i++) {
    // Las primeras completan la Tejavana 01, que es la que se usa en el
    // recuento de ejemplo; el resto se reparte por toda la campa.
    const location = i < 17 ? locateInZone('sondika', 'sondika-tej-01') : locate('sondika');
    vehicles.push(
      makeVehicle({
        location,
        status: chance(0.12) ? 'traslado_solicitado' : 'aparcado',
        targetSiteId: chance(0.12) ? pick(PREP_SITES).id : null,
      })
    );
  }

  for (let i = 0; i < otherRemaining; i++) {
    const site = pick(PREP_SITES);
    const roll = rnd();
    const status = roll < 0.1 ? 'en_preparacion' : roll < 0.2 ? 'apto_entrega' : 'aparcado';
    vehicles.push(
      makeVehicle({
        location: locate(site.id),
        targetSiteId: site.id,
        status,
      })
    );
  }

  // Vehículos que aún viajan hacia su sede de preparación.
  for (let i = 0; i < IN_TRANSIT; i++) {
    vehicles.push(
      makeVehicle({
        location: locate('sondika'),
        status: 'en_traslado',
        targetSiteId: pick(PREP_SITES).id,
      })
    );
  }

  /* --- parque de Quiter sin actividad logística ------------------------ */
  // Dos cosas distintas que se ven igual desde la operativa —el coche no
  // sale en ninguna pantalla— pero que no son lo mismo: uno todavía puede
  // entrar y el otro ya se ha ido con su dueño.

  // Solo dados de alta en Quiter: existen, pero nadie los ha tocado todavía.
  for (let i = 0; i < 44; i++) {
    vehicles.push(
      makeVehicle({
        logisticActive: false,
        location: null,
        status: 'recepcionado',
        lastCheckAt: null,
        lastCheckBy: null,
        lastMovementAt: null,
        origin: 'Parque Quiter',
      })
    );
  }

  // Y los que ya se llevó el cliente: fuera de la operativa para siempre.
  for (let i = 0; i < 110; i++) {
    const entregado = makeVehicle({
      logisticActive: false,
      location: null,
      status: 'entregado',
      lastCheckAt: null,
      lastCheckBy: null,
      lastMovementAt: null,
      origin: 'Parque Quiter',
    });
    // Repartidos por los últimos seis meses: así el registro de entregas de
    // cada comercial tiene meses que mirar. Se pone aquí y no dentro de
    // `makeVehicle` para no dejar la clave a `undefined` en los demás: al
    // guardar y volver a leer, esa clave desaparece y el estado recuperado
    // dejaba de ser idéntico al de antes.
    entregado.deliveredAt = iso(Math.floor(rnd() * 180) * DAY);
    vehicles.push(entregado);
  }

  /* --- la flota de renting de la azotea de Leioa ------------------------ */

  // Doce coches preparados hace tiempo, esperando arriba a que el cliente
  // fije la entrega. Tres se entregan hoy: son los que el barrido de la
  // mañana convierte en repasos en la cola del preparador.
  const AZOTEA = 12;
  for (let i = 0; i < AZOTEA; i++) {
    const coche = makeVehicle({
      situation: 'pedido',
      status: 'apto_entrega',
      location: {
        siteId: 'leioa',
        zoneId: 'leioa-azotea',
        positionId: `leioa-azotea-p${String(i + 1).padStart(2, '0')}`,
      },
      targetSiteId: 'leioa',
      origin: 'Flota renting',
      lastCheckAt: iso(Math.floor(rnd() * 20) * DAY),
    });
    // Los tres primeros se entregan hoy; el resto, en las próximas semanas.
    const dias = i < 3 ? 0 : 3 + Math.floor(rnd() * 40);
    // Partir del inicio del día: sumar diez horas a la hora actual hacía
    // desaparecer los repasos de «hoy» al abrir la demo por la tarde.
    const inicioDia = Math.floor(NOW / DAY) * DAY;
    coche.deliveryDate = new Date(inicioDia + dias * DAY + 10 * HOUR).toISOString();
    vehicles.push(coche);
  }

  /* --- fechas de entrega comprometidas ---------------------------------- */

  // Un puñado de coches con fecha, repartidos en los próximos días, para
  // que la pantalla de Entregas tenga casos de todo tipo.
  const conEntrega = vehicles.filter(
    (v) => v.logisticActive && v.situation === 'pedido' && v.salesRep
  );
  const DIA = 24 * HOUR;
  conEntrega.slice(0, 14).forEach((v, i) => {
    // Algunas hoy y mañana (las que aprietan), el resto repartidas.
    const dias = i < 2 ? 0 : i < 5 ? 1 : Math.floor(i / 2);
    v.deliveryDate = new Date(NOW + dias * DIA + 9 * HOUR).toISOString();
  });
  // Una atrasada, para que se vea el caso rojo.
  if (conEntrega[14]) conEntrega[14].deliveryDate = iso(1 * DIA);

  // El BMW X1 del mockup entrega pasado mañana.
  const x1 = vehicles.find((v) => v.id === 'v-12345678');
  if (x1) x1.deliveryDate = new Date(NOW + 2 * DIA + 9 * HOUR).toISOString();

  /* --- forzar exactamente 5 vehículos sin comprobar > 72 h ------------- */

  const staleTargets = vehicles.filter((v) => v.logisticActive).slice(20, 23);
  staleTargets.forEach((v, i) => {
    v.lastCheckAt = iso((4 + i) * DAY);
  });
  vehicles
    .filter((v) => v.logisticActive && !staleTargets.includes(v) && v.id !== stale1.id && v.id !== stale2.id)
    .forEach((v) => {
      const age = NOW - new Date(v.lastCheckAt ?? iso(0)).getTime();
      if (age > 72 * HOUR) v.lastCheckAt = iso(Math.floor(rnd() * 60) * HOUR);
    });

  return { vehicles, movements, requests, preparations, incidents, events };
}

/* --------------------------------------------------- preparaciones demo */

function checklistFor(type: 'VN' | 'VO', completed: number): Preparation['items'] {
  const applicable = REQUIREMENTS.filter(
    (r) => r.vehicleTypes.length === 0 || r.vehicleTypes.includes(type)
  );
  return applicable.map((r, idx) => {
    // El reportaje final solo se completa al cerrar la preparación con las
    // cuatro fotos reales. La semilla no debe inventarlo como hecho antes.
    const completado = r.id !== 'req-fotos' && idx < completed;
    return {
      requirementId: r.id,
      label: r.label,
      timed: r.timed,
      state: r.optional && chance(0.6) ? 'no_requerido' : completado ? 'completado' : 'pendiente',
      by: completado ? pick(['Pedro Larrea', 'Ane Zubiaur', 'Jon Etxaniz']) : undefined,
      at: completado ? iso(Math.floor(rnd() * 5) * HOUR) : undefined,
    };
  });
}

/* ------------------------------------------------------ estado completo */

export function buildSeedState(): AppState {
  reiniciarAzar();
  const { zones, positions } = buildZonesAndPositions();
  const build = buildFleet(positions);
  const { vehicles } = build;

  const movements: Movement[] = [
    {
      id: nextId('mov'),
      vehicleId: 'v-12345678',
      from: { siteId: 'sondika', zoneId: 'sondika-tej-01', positionId: 'sondika-tej-01-p04' },
      to: { siteId: 'leioa', zoneId: 'leioa-park-01', positionId: 'leioa-park-01-p02' },
      userId: 'u-iker',
      at: iso(7 * HOUR),
      status: 'en_ruta',
    },
    {
      id: nextId('mov'),
      vehicleId: 'v-4821LKM',
      from: { siteId: 'leioa', zoneId: 'leioa-park-01', positionId: 'leioa-park-01-p02' },
      to: { siteId: 'leioa', zoneId: 'leioa-park-01', positionId: 'leioa-park-01-p05' },
      userId: 'u-pedro',
      at: iso(9 * HOUR),
      status: 'completado',
    },
  ];

  /* solicitudes: 21 de preparación + 12 de traslado pendientes */
  const requests: ServiceRequest[] = [];
  const openPrepStatuses: ServiceRequest['status'][] = ['solicitada', 'asignada', 'en_curso'];
  const openMoveStatuses: ServiceRequest['status'][] = ['solicitada', 'asignada', 'en_ruta'];
  const activeVehicles = vehicles.filter((v) => v.logisticActive);

  requests.push({
    id: 'req-0001',
    type: 'preparacion',
    vehicleId: 'v-12345678',
    siteId: 'leioa',
    from: { siteId: 'sondika', zoneId: 'sondika-tej-01', positionId: 'sondika-tej-01-p04' },
    to: { siteId: 'leioa' },
    status: 'solicitada',
    urgent: false,
    createdAt: iso(10 * HOUR),
    createdBy: 'u-juan',
    assignedTo: null,
    // 48 h desde que la pidió el comercial: quedan 38.
    dueAt: iso(-38 * HOUR),
    pickedUpAt: null,
    deliveredAt: null,
    deliveredBy: null,
    carrierId: null,
  });
  requests.push({
    id: 'req-0002',
    type: 'traslado',
    vehicleId: 'v-23456789',
    siteId: 'leioa',
    from: { siteId: 'sondika', zoneId: 'sondika-tej-01', positionId: 'sondika-tej-01-p05' },
    to: { siteId: 'leioa', zoneId: 'leioa-park-01', positionId: 'leioa-park-01-p02' },
    status: 'asignada',
    urgent: false,
    createdAt: iso(6 * HOUR),
    createdBy: 'u-log',
    assignedTo: 'u-iker',
    // Aún sin recoger: el plazo del transportista no ha empezado.
    dueAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    deliveredBy: null,
    // Sondika → Leioa: dentro de Bizkaia.
    carrierId: 'gruas-francis',
  });
  requests.push({
    id: 'req-0003',
    type: 'preparacion',
    vehicleId: 'v-9032MTR',
    siteId: 'anoeta',
    from: { siteId: 'anoeta', zoneId: 'anoeta-park-01', positionId: 'anoeta-park-01-p01' },
    to: { siteId: 'anoeta' },
    status: 'bloqueada',
    urgent: true,
    createdAt: iso(28 * HOUR),
    createdBy: 'u-log',
    assignedTo: 'u-jon',
    // Pedida hace 28 h: quedan 20 y sigue bloqueada.
    dueAt: iso(-20 * HOUR),
    pickedUpAt: null,
    deliveredAt: null,
    deliveredBy: null,
    carrierId: null,
  });

  const pool = activeVehicles.filter((v) => !requests.some((r) => r.vehicleId === v.id));
  for (let i = 0; i < 19; i++) {
    const v = pool[i];
    const site = v.targetSiteId ?? pick(PREP_SITES).id;
    const hoursAgo = Math.floor(rnd() * 40);
    requests.push({
      id: nextId('req'),
      type: 'preparacion',
      vehicleId: v.id,
      siteId: site,
      from: v.location,
      to: { siteId: site },
      status: pick(openPrepStatuses),
      urgent: chance(0.15),
      createdAt: iso(hoursAgo * HOUR),
      createdBy: 'u-log',
      assignedTo: chance(0.5) ? pick(USERS.filter((u) => u.role === 'preparador')).id : null,
      // 48 h desde la solicitud; algunas ya se han pasado.
      dueAt: iso((hoursAgo - 48) * HOUR),
      pickedUpAt: null,
      deliveredAt: null,
      deliveredBy: null,
      carrierId: null,
    });
  }
  for (let i = 19; i < 30; i++) {
    const v = pool[i];
    const site = pick(PREP_SITES).id;
    const status = pick(openMoveStatuses);
    const hoursAgo = Math.floor(rnd() * 30);
    // El plazo del transportista solo corre desde que recoge las llaves.
    const pickedUpAt = status === 'en_ruta' ? iso(Math.floor(rnd() * 20) * HOUR) : null;
    requests.push({
      id: nextId('req'),
      type: 'traslado',
      vehicleId: v.id,
      siteId: site,
      from: v.location,
      to: { siteId: site },
      status,
      urgent: chance(0.1),
      createdAt: iso(hoursAgo * HOUR),
      createdBy: 'u-log',
      assignedTo: null,
      dueAt: pickedUpAt
        ? new Date(new Date(pickedUpAt).getTime() + 48 * HOUR).toISOString()
        : null,
      pickedUpAt,
      deliveredAt: null,
      deliveredBy: null,
      // Se reparte por zona, como en la realidad.
      carrierId: carrierForRoute(CARRIERS, v.location?.siteId, site)?.id ?? null,
    });
  }
  // Solicitudes ya cerradas, para el histórico.
  //
  // Los traslados terminados llevan empresa, recogida y entrega de verdad:
  // son los que forman el registro de lo que ha hecho cada transportista.
  // Sin ellos la pantalla de traslados hechos estaría vacía y no se vería si
  // funciona. Algunos se pasan de las 48 h a propósito, porque en la
  // realidad también pasa y es justo lo que hay que poder enseñar.
  // Repartidos como se reparten de verdad: casi siempre son las llaves.
  const MOTIVOS_RETRASO: DelayReason[] = ['llaves', 'llaves', 'llaves', 'cliente', 'averia', 'trafico'];
  const transportistas = USERS.filter((u) => u.role === 'transportista');
  for (let i = 30; i < 59; i++) {
    const v = pool[i];
    const esTraslado = chance(0.55);
    const destino = pick(PREP_SITES).id;
    // Repartidos por unos cinco meses: el transportista mira su trabajo por
    // meses, y con todo dentro del mismo el selector de mes no diría nada.
    const pedidoHace = Math.floor(24 + rnd() * 3600);
    const recogidoHace = pedidoHace - Math.floor(1 + rnd() * 8);
    // La mayoría llega dentro de plazo; uno de cada seis se pasa.
    const tardado = chance(1 / 6) ? 48 + Math.floor(rnd() * 30) : Math.floor(2 + rnd() * 40);
    const entregadoHace = Math.max(0, recogidoHace - tardado);
    // El retraso se mira con las fechas que quedan escritas, no con las
    // horas que se han sorteado: un traslado recogido hace poco y «tardado»
    // mucho se queda con la entrega tope en el futuro, y entonces no llegó
    // tarde por mucho que lo diga el sorteo. Un motivo de retraso sin
    // retraso es la explicación de algo que no pasó.
    const dueAt = esTraslado ? iso((recogidoHace - 48) * HOUR) : null;
    const deliveredAt = iso(entregadoHace * HOUR);
    const tarde = !!dueAt && deliveredAt > dueAt;
    const empresa = esTraslado ? carrierForRoute(CARRIERS, v.location?.siteId, destino) : null;
    const conductor = empresa
      ? (transportistas.find((u) => u.carrierId === empresa.id) ?? transportistas[0])
      : null;

    requests.push({
      id: nextId('req'),
      type: esTraslado ? 'traslado' : 'preparacion',
      vehicleId: v.id,
      siteId: destino,
      from: v.location,
      to: { siteId: destino },
      status: 'terminada',
      urgent: false,
      createdAt: iso(pedidoHace * HOUR),
      createdBy: 'u-log',
      assignedTo: esTraslado ? (conductor?.id ?? null) : 'u-pedro',
      dueAt,
      pickedUpAt: esTraslado ? iso(recogidoHace * HOUR) : null,
      deliveredAt,
      deliveredBy: esTraslado ? (conductor?.id ?? null) : 'u-pedro',
      // Los que llegaron tarde traen su motivo, que es lo que convierte
      // «llegan tarde» en algo que se puede arreglar.
      delayReason: tarde ? pick(MOTIVOS_RETRASO) : null,
      carrierId: empresa?.id ?? null,
    });
  }

  /* preparaciones: 9 en curso (4 fuera de SLA, 2 bloqueadas) + 27 hoy */
  const preparations: Preparation[] = [];

  preparations.push({
    id: 'prep-0001',
    vehicleId: 'v-12345678',
    siteId: 'leioa',
    preparerId: 'u-pedro',
    phase: 'pendiente_elementos',
    runState: 'en_curso',
    items: checklistFor('VN', 5),
    effectiveMs: 2 * HOUR + 5 * MIN,
    waitingMs: 41 * MIN,
    targetMs: 2 * HOUR,
    runningSince: iso(14 * MIN),
    waitingSince: null,
    waitReason: null,
    startedAt: iso(4 * HOUR),
    finishedAt: null,
  });
  preparations.push({
    id: 'prep-0002',
    vehicleId: 'v-4821LKM',
    siteId: 'leioa',
    preparerId: 'u-ane',
    phase: 'base',
    runState: 'en_curso',
    items: checklistFor('VO', 4),
    effectiveMs: 72 * MIN,
    waitingMs: 8 * MIN,
    targetMs: 2 * HOUR,
    runningSince: iso(6 * MIN),
    waitingSince: null,
    waitReason: null,
    startedAt: iso(2 * HOUR),
    finishedAt: null,
  });
  preparations.push({
    id: 'prep-0003',
    vehicleId: 'v-9032MTR',
    siteId: 'anoeta',
    preparerId: 'u-jon',
    phase: 'base',
    runState: 'bloqueado',
    items: checklistFor('VO', 3),
    effectiveMs: 2 * HOUR + 41 * MIN,
    waitingMs: 55 * MIN,
    targetMs: 2 * HOUR + 15 * MIN,
    runningSince: null,
    waitingSince: iso(55 * MIN),
    waitReason: 'Matrículas',
    startedAt: iso(5 * HOUR),
    finishedAt: null,
  });

  const prepPool = activeVehicles.filter(
    (v) => v.status === 'en_preparacion' && !preparations.some((p) => p.vehicleId === v.id)
  );
  for (let i = 0; i < 6 && i < prepPool.length; i++) {
    const v = prepPool[i];
    const target = (CONFIG.prepTargetMinutes[v.type] ?? 120) * MIN;
    const over = i < 2;
    const state: Preparation['runState'] = i === 5 ? 'bloqueado' : i === 4 ? 'en_espera' : 'en_curso';
    preparations.push({
      id: nextId('prep'),
      vehicleId: v.id,
      siteId: v.targetSiteId ?? pick(PREP_SITES).id,
      preparerId: pick(USERS.filter((u) => u.role === 'preparador')).id,
      phase: pick(['pendiente', 'base', 'pendiente_elementos'] as const),
      runState: state,
      items: checklistFor(v.type, 2 + Math.floor(rnd() * 4)),
      effectiveMs: over ? target + Math.floor(rnd() * 40) * MIN : Math.floor(rnd() * 0.8 * target),
      waitingMs: Math.floor(rnd() * 30) * MIN,
      targetMs: target,
      runningSince: state === 'en_curso' ? iso(Math.floor(rnd() * 20) * MIN) : null,
      waitingSince: state === 'en_curso' ? null : iso(Math.floor(rnd() * 30) * MIN),
      waitReason: state === 'en_curso' ? null : pick(CONFIG.waitReasons),
      startedAt: iso(Math.floor(2 + rnd() * 5) * HOUR),
      finishedAt: null,
    });
  }

  const donePool = activeVehicles.filter(
    (v) => v.status === 'apto_entrega' && !preparations.some((p) => p.vehicleId === v.id)
  );
  for (let i = 0; i < 27 && i < donePool.length; i++) {
    const v = donePool[i];
    const target = (CONFIG.prepTargetMinutes[v.type] ?? 120) * MIN;
    const items = checklistFor(v.type, 99);
    preparations.push({
      id: nextId('prep'),
      vehicleId: v.id,
      siteId: v.targetSiteId ?? pick(PREP_SITES).id,
      preparerId: pick(USERS.filter((u) => u.role === 'preparador')).id,
      phase: 'apto_entrega',
      runState: 'terminado',
      items: items.map((it) => (it.state === 'pendiente' ? { ...it, state: 'completado' as const } : it)),
      effectiveMs: Math.floor(target * (0.7 + rnd() * 0.6)),
      waitingMs: Math.floor(rnd() * 40) * MIN,
      targetMs: target,
      runningSince: null,
      waitingSince: null,
      waitReason: null,
      startedAt: iso(Math.floor(4 + rnd() * 8) * HOUR),
      finishedAt: iso(Math.floor(rnd() * 4) * HOUR),
    });
  }

  /* incidencias: 7 abiertas */
  const incidents: Incident[] = [
    {
      id: 'inc-0001',
      vehicleId: 'v-23456789',
      type: 'recepcion',
      description: 'Golpe en paragolpes trasero detectado en la descarga.',
      photos: ['demo://foto-1', 'demo://foto-2', 'demo://foto-3'],
      status: 'abierta',
      createdAt: iso(11 * HOUR),
      createdBy: 'u-nerea',
    },
    {
      id: 'inc-0002',
      vehicleId: 'v-4821LKM',
      type: 'preparacion',
      description: 'Falta accesorio: kit reparapinchazos no incluido.',
      photos: ['demo://foto-4'],
      status: 'pendiente',
      createdAt: iso(29 * HOUR),
      createdBy: 'u-ane',
    },
  ];
  const incPool = activeVehicles.slice(40, 60);
  for (let i = 0; i < 5; i++) {
    incidents.push({
      id: nextId('inc'),
      vehicleId: incPool[i].id,
      type: pick(['recepcion', 'transporte', 'preparacion', 'campa'] as const),
      description: pick([
        'Rayón en puerta delantera derecha.',
        'Batería descargada, no arranca.',
        'Falta segunda llave.',
        'Documentación incompleta en el albarán.',
        'Llanta con marca de bordillo.',
      ]),
      photos: ['demo://foto'],
      status: 'abierta',
      createdAt: iso(Math.floor(rnd() * 72) * HOUR),
      createdBy: pick(USERS).id,
    });
  }
  for (let i = 5; i < 12; i++) {
    incidents.push({
      id: nextId('inc'),
      vehicleId: incPool[i].id,
      type: pick(['recepcion', 'transporte', 'preparacion'] as const),
      description: 'Incidencia resuelta tras revisión del equipo.',
      photos: [],
      status: 'cerrada',
      createdAt: iso(Math.floor(72 + rnd() * 200) * HOUR),
      createdBy: 'u-log',
      closedAt: iso(Math.floor(rnd() * 60) * HOUR),
    });
  }

  /* recuentos */
  const tej01 = vehicles.filter((v) => v.location?.zoneId === 'sondika-tej-01');
  const counts: FleetCount[] = [
    {
      id: 'count-0042',
      code: '#0042',
      siteId: 'sondika',
      zoneId: 'sondika-tej-01',
      startedAt: iso(2 * HOUR + 30 * MIN),
      // Sigue abierto: quedan dos vehículos por localizar.
      closedAt: null,
      responsibleId: 'u-pedro',
      expected: tej01.map((v) => v.id),
      found: tej01.slice(0, Math.max(0, tej01.length - 2)).map((v) => ({
        vehicleId: v.id,
        at: iso(2 * HOUR + 10 * MIN),
        by: 'u-pedro',
        positionId: v.location?.positionId,
      })),
    },
    {
      id: 'count-0041',
      code: '#0041',
      siteId: 'leioa',
      zoneId: 'leioa-park-01',
      startedAt: iso(19 * HOUR),
      closedAt: iso(18 * HOUR),
      responsibleId: 'u-ane',
      expected: vehicles.filter((v) => v.location?.zoneId === 'leioa-park-01').map((v) => v.id),
      found: vehicles
        .filter((v) => v.location?.zoneId === 'leioa-park-01')
        .map((v) => ({ vehicleId: v.id, at: iso(18 * HOUR), by: 'u-ane', positionId: v.location?.positionId })),
    },
  ];

  /* reglas de notificación e inbox */
  const rules: NotificationRule[] = [
    {
      id: 'rule-0001',
      scopeKind: 'vehicle',
      scopeRef: 'v-12345678',
      condition: 'llegada_sede',
      targetSiteId: 'sondika',
      audience: { kind: 'comercial' },
      recipient: 'Comercial del coche',
      channels: ['push', 'web'],
      active: true,
      createdAt: iso(30 * HOUR),
    },
    {
      id: 'rule-0002',
      scopeKind: 'site',
      scopeRef: 'sondika',
      condition: 'sin_comprobar_72h',
      // A logística, que es quien va a mandar a alguien a mirar. Al
      // comercial le llegaban ocho avisos de coches que no son suyos.
      audience: { kind: 'rol', roleId: 'logistica' },
      recipient: 'Logística',
      channels: ['push', 'web'],
      active: true,
      createdAt: iso(80 * HOUR),
    },
    // Las tres que ahorran más trabajo, puestas de serie y dirigidas. Se
    // pueden desactivar o cambiar desde Notificaciones como cualquier otra.
    {
      id: 'rule-listo',
      scopeKind: 'fleet',
      scopeRef: null,
      condition: 'preparacion_terminada',
      // Al comercial del coche, no a todos: si no, cada uno recibe los
      // avisos de los coches de los demás y deja de mirar la campana.
      audience: { kind: 'comercial' },
      recipient: 'Comercial del coche',
      channels: ['push', 'web'],
      active: true,
      createdAt: iso(200 * HOUR),
    },
    {
      id: 'rule-prep-pedida',
      scopeKind: 'fleet',
      scopeRef: null,
      condition: 'preparacion_pedida',
      audience: { kind: 'rol', roleId: 'preparador' },
      recipient: 'Preparadores',
      channels: ['push', 'web'],
      active: true,
      createdAt: iso(200 * HOUR),
    },
    {
      id: 'rule-sin-recoger',
      scopeKind: 'fleet',
      scopeRef: null,
      condition: 'traslado_sin_recoger',
      audience: { kind: 'rol', roleId: 'logistica' },
      recipient: 'Logística',
      channels: ['push', 'web'],
      active: true,
      createdAt: iso(200 * HOUR),
    },
    {
      id: 'rule-0003',
      scopeKind: 'site',
      scopeRef: 'leioa',
      condition: 'preparacion_terminada',
      audience: { kind: 'comercial' },
      recipient: 'Comerciales',
      channels: ['push', 'web'],
      // Apagada: la sustituye `rule-listo`, que avisa solo al comercial de
      // ese coche en vez de a todos.
      active: false,
      createdAt: iso(120 * HOUR),
    },
    {
      id: 'rule-0004',
      scopeKind: 'vehicle',
      scopeRef: 'v-12345678',
      condition: 'preparacion_terminada',
      audience: { kind: 'comercial' },
      recipient: 'Comercial del coche',
      channels: ['push', 'web'],
      active: true,
      createdAt: iso(30 * HOUR),
    },
  ];

  // Los avisos de ejemplo también van dirigidos, como los de verdad: sin
  // destinatario le salían a todo el mundo, y al comercial le aparecían
  // coches que no son suyos.
  const inbox: NotificationEvent[] = [
    {
      id: 'nev-0001',
      ruleId: 'rule-0002',
      vehicleId: 'v-87654321',
      userIds: ['u-log'],
      title: 'Vehículo sin comprobar',
      body: '87654321 lleva 7 días sin comprobación física en Sondika.',
      at: iso(1 * HOUR),
      read: false,
      tone: 'danger',
    },
    {
      id: 'nev-0002',
      ruleId: 'rule-0001',
      vehicleId: 'v-12345678',
      // 12345678 lo lleva Juan: el aviso de que su coche sale es suyo.
      userIds: ['u-juan'],
      title: 'Traslado en ruta',
      body: 'BMW X1 · 12345678 ha salido de Sondika hacia Leioa.',
      at: iso(7 * HOUR),
      read: false,
      tone: 'info',
    },
    {
      id: 'nev-0003',
      ruleId: null,
      vehicleId: 'v-9032MTR',
      userIds: ['u-log'],
      title: 'Preparación bloqueada',
      body: '9032 MTR en Anoeta está bloqueado por: Matrículas.',
      at: iso(55 * MIN),
      read: false,
      tone: 'warn',
    },
  ];

  /* recepción del camión activo */
  const receptions: Reception[] = [
    {
      id: 'rec-0001',
      truckPlate: '9876 JKL',
      carrier: 'Transportista Norte',
      siteId: 'sondika',
      arrivedAt: iso(10 * HOUR),
      closedAt: null,
      albaranUri: 'demo://albaran-9876JKL.pdf',
      lines: [
        {
          vehicleId: 'v-12345678',
          ref: '12345678',
          unloaded: true,
          damage: null,
          photos: [],
          positionId: 'sondika-tej-01-p04',
        },
        {
          vehicleId: 'v-23456789',
          ref: '23456789',
          unloaded: true,
          damage: 'Golpe paragolpes trasero',
          photos: ['demo://foto-1', 'demo://foto-2'],
          positionId: 'sondika-tej-01-p05',
        },
        { vehicleId: 'v-34567890', ref: '34567890', unloaded: false, damage: null, photos: [], positionId: null },
        ...Array.from({ length: 11 }, (_, i) => {
          const v = vehicles.filter((x) => x.location?.siteId === 'sondika')[10 + i];
          return {
            vehicleId: v?.id ?? null,
            ref: v?.vin8 ?? `PEND-${i}`,
            unloaded: true,
            damage: null,
            photos: [],
            positionId: v?.location?.positionId ?? null,
          };
        }),
      ],
    },
  ];

  /* trazabilidad inicial */
  const events: TraceEvent[] = [
    {
      id: nextId('ev'),
      vehicleId: 'v-12345678',
      kind: 'recuento',
      title: 'Comprobación física',
      detail: 'Sondika · Tejavana 01 · P04 · Pedro Larrea · Recuento #0042',
      at: iso(2 * HOUR),
      userId: 'u-pedro',
    },
    {
      id: nextId('ev'),
      vehicleId: 'v-12345678',
      kind: 'movimiento',
      title: 'Traslado solicitado',
      detail: 'Sondika → Leioa · Logística',
      at: iso(7 * HOUR),
      userId: 'u-log',
    },
    {
      id: nextId('ev'),
      vehicleId: 'v-12345678',
      kind: 'solicitud',
      title: 'Preparación solicitada',
      detail: 'Leioa · Juan Bilbao',
      at: iso(10 * HOUR),
      userId: 'u-juan',
    },
    {
      id: nextId('ev'),
      vehicleId: 'v-12345678',
      kind: 'recepcion',
      title: 'Recepción',
      detail: 'Camión 9876 JKL · albarán adjunto',
      at: iso(11 * HOUR),
      userId: 'u-nerea',
    },
    {
      id: nextId('ev'),
      vehicleId: 'v-23456789',
      kind: 'incidencia',
      title: 'Incidencia de recepción',
      detail: 'Golpe en paragolpes trasero · 3 fotos',
      at: iso(11 * HOUR),
      userId: 'u-nerea',
    },
    {
      id: nextId('ev'),
      vehicleId: 'v-4821LKM',
      kind: 'preparacion',
      title: 'Preparación iniciada',
      detail: 'Leioa · Ane Zubiaur',
      at: iso(2 * HOUR),
      userId: 'u-ane',
    },
  ];

  // Ejemplos comerciales estables, sin consumir números aleatorios ni mover
  // vehículos: así la demo permite probar KM0 y DEMO sin alterar la operativa.
  const ejemplosMarca = vehicles.filter(v => v.type === 'VN' && v.brand === 'BMW' && v.logisticActive);
  if (ejemplosMarca[0]) ejemplosMarca[0].commercialCategory = 'KM0';
  if (ejemplosMarca[1]) ejemplosMarca[1].commercialCategory = 'DEMO';

  return {
    users: USERS,
    carriers: CARRIERS,
    sites: SITES,
    zones,
    positions,
    vehicles,
    movements,
    requests,
    preparations,
    counts,
    incidents,
    rules,
    inbox,
    receptions,
    events,
    config: CONFIG,
  };
}
