/**
 * Todas las mutaciones de la app pasan por un "comando".
 *
 * `applyCommand` es una función pura: recibe el estado y un comando y
 * devuelve el estado nuevo. La app la usa para actualizar la pantalla al
 * instante y, cuando hay backend configurado, envía el mismo comando a
 * `POST /api/commands`. El servidor puede reutilizar esta misma función,
 * de modo que web, móvil y servidor comparten exactamente la misma lógica.
 */
import type {
  AppState,
  CheckState,
  FleetCount,
  Id,
  Incident,
  IncidentType,
  LocationRef,
  Movement,
  NotificationEvent,
  NotificationRule,
  NotifyCondition,
  Preparation,
  Reception,
  Requirement,
  RoleConfig,
  ServiceRequest,
  RequestStatus,
  RequestType,
  Site,
  TraceEvent,
  User,
  Vehicle,
  Zone,
  CustomField,
  Carrier,
  VehicleType,
  Situation,
} from './types';
import { REQUEST_STATUS_LABEL } from './types';
import { CONFIG } from './seed';
import { locationLabel, siteName, userName, vehicleTitle } from './format';

/* ------------------------------------------------------------- comandos */

export type Command =
  | { type: 'vehicle.check'; id: Id; at: string; userId: Id; vehicleId: Id; positionId?: Id | null }
  | {
      type: 'movement.register';
      id: Id;
      at: string;
      userId: Id;
      vehicleId: Id;
      to: LocationRef;
      note?: string;
      completesTransfer?: boolean;
    }
  | {
      type: 'request.create';
      id: Id;
      at: string;
      userId: Id;
      requestType: RequestType;
      vehicleId: Id;
      siteId: Id;
      to: LocationRef | null;
      urgent?: boolean;
      note?: string;
      /** Empresa de transporte, solo para traslados. */
      carrierId?: Id | null;
    }
  | {
      type: 'request.update';
      id: Id;
      at: string;
      userId: Id;
      requestId: Id;
      status: RequestStatus;
      assignedTo?: Id | null;
      carrierId?: Id | null;
    }
  | { type: 'prep.create'; id: Id; at: string; userId: Id; vehicleId: Id; siteId: Id; preparerId?: Id | null }
  | { type: 'prep.start'; id: Id; at: string; userId: Id; prepId: Id }
  | { type: 'prep.pause'; id: Id; at: string; userId: Id; prepId: Id; reason: string; blocked?: boolean }
  | { type: 'prep.resume'; id: Id; at: string; userId: Id; prepId: Id }
  | {
      type: 'prep.finish';
      id: Id;
      at: string;
      userId: Id;
      prepId: Id;
      /** Dónde deja el coche el preparador. Opcional: si no lo dice, no se mueve. */
      to?: LocationRef;
    }
  | { type: 'prep.item'; id: Id; at: string; userId: Id; prepId: Id; requirementId: Id; state: CheckState }
  | { type: 'count.create'; id: Id; at: string; userId: Id; siteId: Id; zoneId: Id | null; code: string }
  | { type: 'count.finding'; id: Id; at: string; userId: Id; countId: Id; vehicleId: Id; positionId?: Id | null }
  | { type: 'count.close'; id: Id; at: string; userId: Id; countId: Id }
  | {
      type: 'incident.create';
      id: Id;
      at: string;
      userId: Id;
      vehicleId: Id;
      incidentType: IncidentType;
      description: string;
      photos: string[];
    }
  | { type: 'incident.close'; id: Id; at: string; userId: Id; incidentId: Id }
  | { type: 'rule.create'; id: Id; at: string; userId: Id; rule: Omit<NotificationRule, 'id' | 'createdAt'> }
  | { type: 'rule.toggle'; id: Id; at: string; userId: Id; ruleId: Id }
  | { type: 'rule.delete'; id: Id; at: string; userId: Id; ruleId: Id }
  | { type: 'inbox.read'; id: Id; at: string; userId: Id; eventId: Id }
  | { type: 'inbox.readAll'; id: Id; at: string; userId: Id }
  | { type: 'reception.create'; id: Id; at: string; userId: Id; truckPlate: string; carrier: string; siteId: Id }
  | {
      type: 'reception.line';
      id: Id;
      at: string;
      userId: Id;
      receptionId: Id;
      ref: string;
      unloaded?: boolean;
      damage?: string | null;
      positionId?: Id | null;
      photos?: string[];
    }
  | { type: 'reception.albaran'; id: Id; at: string; userId: Id; receptionId: Id; uri: string }
  | { type: 'reception.close'; id: Id; at: string; userId: Id; receptionId: Id }
  | { type: 'config.update'; id: Id; at: string; userId: Id; patch: Partial<AppState['config']> }
  | { type: 'requirement.upsert'; id: Id; at: string; userId: Id; requirement: Requirement }
  | { type: 'requirement.delete'; id: Id; at: string; userId: Id; requirementId: Id }
  | { type: 'site.upsert'; id: Id; at: string; userId: Id; site: Site }
  | { type: 'site.delete'; id: Id; at: string; userId: Id; siteId: Id }
  | { type: 'zone.upsert'; id: Id; at: string; userId: Id; zone: Zone; positions: number }
  | { type: 'zone.delete'; id: Id; at: string; userId: Id; zoneId: Id }
  | { type: 'position.add'; id: Id; at: string; userId: Id; zoneId: Id; code: string }
  | { type: 'position.delete'; id: Id; at: string; userId: Id; positionId: Id }
  | { type: 'user.upsert'; id: Id; at: string; userId: Id; user: User }
  | { type: 'user.delete'; id: Id; at: string; userId: Id; targetUserId: Id }
  | { type: 'role.upsert'; id: Id; at: string; userId: Id; role: RoleConfig }
  | { type: 'role.delete'; id: Id; at: string; userId: Id; roleId: Id }
  | { type: 'customField.upsert'; id: Id; at: string; userId: Id; field: CustomField }
  | { type: 'customField.delete'; id: Id; at: string; userId: Id; fieldId: Id }
  | { type: 'vehicle.setCustom'; id: Id; at: string; userId: Id; vehicleId: Id; fieldId: Id; value: string }
  | { type: 'carrier.upsert'; id: Id; at: string; userId: Id; carrier: Carrier }
  | { type: 'carrier.delete'; id: Id; at: string; userId: Id; carrierId: Id }
  | {
      type: 'vehicle.setDelivery';
      id: Id;
      at: string;
      userId: Id;
      vehicleId: Id;
      deliveryDate: string | null;
    }
  | { type: 'vehicle.activate'; id: Id; at: string; userId: Id; vehicleId: Id }
  | {
      type: 'vehicle.setSalesRep';
      id: Id;
      at: string;
      userId: Id;
      vehicleId: Id;
      /** Nombre del comercial, o null para dejarlo sin asignar. */
      salesRep: string | null;
    }
  | {
      type: 'vehicle.create';
      id: Id;
      at: string;
      userId: Id;
      /** Los 8 últimos del bastidor: lo único imprescindible. */
      vin8: string;
      vin?: string | null;
      plate?: string | null;
      brand?: string;
      model?: string;
      vehicleType?: VehicleType;
      situation?: Situation;
      salesRep?: string | null;
      origin?: string;
      /** Dónde está, si ya se sabe. */
      location?: LocationRef | null;
    };

/** Metadatos que añade el store automáticamente. */
export type CommandMeta = { id: Id; at: string; userId: Id };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Comando tal y como lo escriben las pantallas: sin id, fecha ni usuario. */
export type CommandInput = DistributiveOmit<Command, keyof CommandMeta> & Partial<CommandMeta>;

/* ------------------------------------------------------------ utilidades */

let counter = 0;
/**
 * Identificador de comando.
 *
 * Lleva parte aleatoria a propósito: dos operarios que pulsan el mismo
 * botón en el mismo milisegundo, cada uno en su móvil, generarían el mismo
 * id sin ella. Como el servidor descarta los comandos repetidos por id, uno
 * de los dos movimientos desaparecería sin que nadie se enterase.
 */
export function newId(prefix = 'c'): Id {
  counter += 1;
  const azar = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${azar}`;
}

/**
 * Contexto del comando que se está aplicando ahora mismo.
 *
 * Sirve para que todo lo que nace de un comando (la preparación, el aviso,
 * el apunte del histórico) reciba un identificador **derivado del id del
 * comando** y no uno aleatorio. Es imprescindible para trabajar sin
 * cobertura: el móvil aplica el comando en local y luego el servidor aplica
 * el mismo comando por su cuenta; si cada uno inventase su propio id, el
 * siguiente comando ("empezar la preparación prep-…") no encontraría nada
 * en el servidor y el trabajo del operario se perdería en silencio.
 */
let enCurso: { id: Id; at: string; seq: number } | null = null;

/** Id derivado del comando en curso. Único dentro del comando. */
function derivado(prefix: string): Id {
  if (!enCurso) return newId(prefix);
  enCurso.seq += 1;
  return `${prefix}-${enCurso.id}-${enCurso.seq}`;
}

/**
 * Id de lo que crea un comando.
 *
 * Es público a propósito: cuando una pantalla encadena dos comandos (crear
 * la preparación y empezarla), necesita saber cómo se va a llamar lo que
 * acaba de crear sin esperar respuesta del servidor.
 */
export function idCreadoPor(
  prefix: 'mov' | 'req' | 'prep' | 'count' | 'inc' | 'rec' | 'rule',
  cmd: { id: Id }
): Id {
  return `${prefix}-${cmd.id}`;
}

/** Id derivado fijo, para lo que un comando crea una sola vez. */
function unico(prefix: 'mov' | 'req' | 'prep' | 'count' | 'inc' | 'rec' | 'rule', cmd: Command): Id {
  return idCreadoPor(prefix, cmd);
}


const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * ¿Ya está creado lo que iba a crear este comando?
 *
 * Aplicar dos veces el mismo comando tiene que dar el mismo resultado que
 * aplicarlo una. Pasa de verdad y sin que nadie se equivoque: el móvil
 * manda un movimiento, el servidor lo aplica y la respuesta se pierde por
 * el camino; el comando se queda en la cola y, al arrancar la app otra vez,
 * se vuelve a aplicar encima del estado que ya lo traía. Sin esto, el
 * operario vería el mismo movimiento dos veces.
 */
function yaCreado(lista: { id: Id }[], id: Id): boolean {
  return lista.some((x) => x.id === id);
}

function replace<T extends { id: Id }>(list: T[], id: Id, patch: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function addEvent(state: AppState, ev: Omit<TraceEvent, 'id'>): AppState {
  const event: TraceEvent = { id: derivado('ev'), ...ev };
  // Si ya está, este comando se está aplicando por segunda vez: el
  // historial del vehículo no debe contar dos veces lo que pasó una.
  if (yaCreado(state.events, event.id)) return state;
  return { ...state, events: [event, ...state.events].slice(0, 4000) };
}

function addInbox(state: AppState, ev: Omit<NotificationEvent, 'id' | 'read'>): AppState {
  const item: NotificationEvent = { id: derivado('nev'), read: false, ...ev };
  if (yaCreado(state.inbox, item.id)) return state;
  return { ...state, inbox: [item, ...state.inbox].slice(0, 500) };
}

/** Milisegundos transcurridos entre `desde` y la fecha del comando. */
function transcurrido(desde: string | null, cmd: Command): number {
  if (!desde) return 0;
  // La fecha del comando, no la de ahora: un comando registrado en un
  // sótano puede aplicarse dos horas después, y esas dos horas no las
  // trabajó ni las esperó nadie.
  return Math.max(0, new Date(cmd.at).getTime() - new Date(desde).getTime());
}

/** Evalúa las reglas activas y genera avisos en la bandeja. */
function fireRules(
  state: AppState,
  condition: NotifyCondition,
  vehicle: Vehicle | null,
  ctx: { siteId?: Id | null; body: string; tone?: NotificationEvent['tone'] }
): AppState {
  let next = state;
  for (const rule of state.rules) {
    if (!rule.active || rule.condition !== condition) continue;
    if (rule.scopeKind === 'vehicle' && rule.scopeRef !== vehicle?.id) continue;
    if (rule.scopeKind === 'site' && rule.scopeRef !== ctx.siteId) continue;
    if (condition === 'llegada_sede' && rule.targetSiteId && rule.targetSiteId !== ctx.siteId) continue;
    next = addInbox(next, {
      ruleId: rule.id,
      vehicleId: vehicle?.id ?? null,
      title: `${rule.recipient} · aviso`,
      body: ctx.body,
      // La fecha del comando, no la de ahora: si el servidor rehace su
      // estado a partir del histórico, los avisos salen con la misma fecha
      // que tenían y no con la del reinicio.
      at: enCurso?.at ?? new Date().toISOString(),
      tone: ctx.tone ?? 'info',
    });
  }
  return next;
}

/**
 * Deja libre una plaza antes de meter otro coche en ella.
 *
 * Dos coches en el mismo hueco es un fallo que se paga abajo, en la campa:
 * alguien baja a buscar uno y no está. Cuando llega una observación física
 * —un movimiento, una descarga, un recuento— esa observación manda: el
 * coche que estaba apuntado ahí ya no está, así que se le quita la plaza
 * (se queda en la zona, que es lo último que se sabe de él) y se anota en su
 * historial para que alguien lo busque.
 *
 * Es la misma idea de la regla de las plazas: mejor «en esta zona, plaza sin
 * confirmar» que una plaza concreta que es mentira.
 */
function liberarPlaza(state: AppState, positionId: Id | undefined | null, salvo: Id, cmd: Command): AppState {
  if (!positionId) return state;
  const ocupantes = state.vehicles.filter(
    (v) => v.id !== salvo && v.location?.positionId === positionId
  );
  if (ocupantes.length === 0) return state;

  let next = state;
  for (const otro of ocupantes) {
    next = {
      ...next,
      vehicles: replace(next.vehicles, otro.id, {
        location: { siteId: otro.location!.siteId, zoneId: otro.location!.zoneId, positionId: undefined },
      }),
    };
    next = addEvent(next, {
      vehicleId: otro.id,
      kind: 'movimiento',
      title: 'Plaza liberada: hay otro coche ahí',
      detail: `${locationLabel(state, otro.location, true)} la ocupa ahora ${vehicleTitle(
        state.vehicles.find((v) => v.id === salvo) ?? otro
      )}. Queda en la zona, sin plaza confirmada.`,
      at: cmd.at,
      userId: cmd.userId,
    });
  }
  return next;
}

/** Un vehículo con actividad logística pasa a estar activo. */
function activate(state: AppState, vehicleId: Id): AppState {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v || v.logisticActive) return state;
  return { ...state, vehicles: replace(state.vehicles, vehicleId, { logisticActive: true }) };
}

/* ------------------------------------------------------- cálculos de prep */

export function prepElapsedMs(p: Preparation, now = Date.now()): number {
  return p.effectiveMs + (p.runningSince ? now - new Date(p.runningSince).getTime() : 0);
}

export function prepWaitingMs(p: Preparation, now = Date.now()): number {
  return p.waitingMs + (p.waitingSince ? now - new Date(p.waitingSince).getTime() : 0);
}

/** % de checklist ignorando los requisitos "no requerido". */
export function prepProgress(p: Preparation): { done: number; total: number; pct: number } {
  const applicable = p.items.filter((i) => i.state !== 'no_requerido');
  const done = applicable.filter((i) => i.state === 'completado').length;
  const total = applicable.length;
  return { done, total, pct: total === 0 ? 100 : Math.round((done / total) * 100) };
}

export function prepIsOverSla(p: Preparation, now = Date.now()): boolean {
  return prepElapsedMs(p, now) > p.targetMs;
}

/** Fase derivada del avance del checklist. */
function derivePhase(p: Preparation): Preparation['phase'] {
  const { done, total } = prepProgress(p);
  if (done === 0) return 'pendiente';
  if (done >= total) return 'apto_entrega';
  const preentrega = p.items.find((i) => i.requirementId === 'req-preentrega');
  const restDone = p.items
    .filter((i) => i.state !== 'no_requerido' && i.requirementId !== 'req-preentrega')
    .every((i) => i.state === 'completado');
  if (restDone && preentrega?.state === 'pendiente') return 'preentrega';
  if (done >= Math.ceil(total / 2)) return 'pendiente_elementos';
  return 'base';
}

function checklistFor(state: AppState, vehicle: Vehicle): Preparation['items'] {
  return state.config.requirements
    .filter((r) => r.vehicleTypes.length === 0 || r.vehicleTypes.includes(vehicle.type))
    .filter((r) => r.siteIds.length === 0 || r.siteIds.includes(vehicle.targetSiteId ?? ''))
    .sort((a, b) => a.order - b.order)
    .map((r) => ({
      requirementId: r.id,
      label: r.label,
      timed: r.timed,
      state: (r.optional ? 'no_requerido' : 'pendiente') as CheckState,
    }));
}

/* ----------------------------------------------------------- aplicación */

export function applyCommand(state: AppState, cmd: Command): AppState {
  // El contexto se apila porque un comando puede aplicar otro por dentro
  // (`prep.finish` registra el movimiento). Al volver, el de fuera sigue
  // numerando donde lo dejó.
  const previo = enCurso;
  enCurso = { id: cmd.id, at: cmd.at, seq: 0 };
  try {
    return aplicar(state, cmd);
  } finally {
    enCurso = previo;
  }
}

function aplicar(state: AppState, cmd: Command): AppState {
  const vehicle = 'vehicleId' in cmd ? state.vehicles.find((v) => v.id === cmd.vehicleId) ?? null : null;

  switch (cmd.type) {
    /* ------------------------------------------------ comprobación física */
    case 'vehicle.check': {
      if (!vehicle) return state;
      let next = activate(state, cmd.vehicleId);
      const location: LocationRef | null = cmd.positionId
        ? {
            siteId: vehicle.location?.siteId ?? state.positions.find((p) => p.id === cmd.positionId)?.zoneId.split('-')[0] ?? '',
            zoneId: state.positions.find((p) => p.id === cmd.positionId)?.zoneId,
            positionId: cmd.positionId,
          }
        : vehicle.location;
      next = {
        ...next,
        vehicles: replace(next.vehicles, cmd.vehicleId, {
          lastCheckAt: cmd.at,
          lastCheckBy: userName(state, cmd.userId),
          location,
        }),
      };
      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'recuento',
        title: 'Comprobación física',
        detail: `${locationLabel(next, location)} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* ------------------------------------------------------- movimientos */
    case 'movement.register': {
      if (!vehicle) return state;
      if (yaCreado(state.movements, unico('mov', cmd))) return state;
      const movement: Movement = {
        id: unico('mov', cmd),
        vehicleId: cmd.vehicleId,
        from: vehicle.location,
        to: cmd.to,
        userId: cmd.userId,
        at: cmd.at,
        status: 'completado',
        note: cmd.note,
      };
      const changedSite = vehicle.location?.siteId !== cmd.to.siteId;

      // Al cambiar de sede el coche queda aparcado a la espera, llegue a su
      // destino previsto o a otro sitio.
      const status: Vehicle['status'] = changedSite ? 'aparcado' : vehicle.status;

      let next: AppState = {
        ...liberarPlaza(activate(state, cmd.vehicleId), cmd.to.positionId, cmd.vehicleId, cmd),
        movements: [movement, ...state.movements],
      };
      next = {
        ...next,
        vehicles: replace(next.vehicles, cmd.vehicleId, {
          location: cmd.to,
          lastMovementAt: cmd.at,
          lastCheckAt: cmd.at,
          lastCheckBy: userName(state, cmd.userId),
          status,
        }),
      };

      // Un traslado completado cierra su solicitud.
      if (cmd.completesTransfer || changedSite) {
        const open = next.requests.find(
          (r) => r.vehicleId === cmd.vehicleId && r.type === 'traslado' && r.status !== 'terminada'
        );
        if (open) {
          next = { ...next, requests: replace(next.requests, open.id, { status: 'terminada' as RequestStatus }) };
          next = fireRules(next, 'traslado_completado', vehicle, {
            siteId: cmd.to.siteId,
            body: `${vehicleTitle(vehicle)} ha llegado a ${siteName(next, cmd.to.siteId)}.`,
          });
        }
      }

      if (changedSite) {
        next = fireRules(next, 'llegada_sede', vehicle, {
          siteId: cmd.to.siteId,
          body: `${vehicleTitle(vehicle)} ha llegado a ${siteName(next, cmd.to.siteId)}.`,
        });
      }

      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'movimiento',
        title: changedSite ? 'Traslado registrado' : 'Movimiento interno',
        detail: `${locationLabel(state, vehicle.location)} → ${locationLabel(state, cmd.to)} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* -------------------------------------------------------- solicitudes */
    case 'request.create': {
      if (!vehicle) return state;
      if (yaCreado(state.requests, unico('req', cmd))) return state;
      // La preparación arranca el reloj al pedirla: es el plazo mínimo que
      // el comercial tiene que dar. Si el vehículo ya tiene fecha de entrega
      // comprometida, manda esa, que es la que de verdad importa. El
      // traslado no tiene plazo hasta que recogen las llaves.
      const dueAt =
        cmd.requestType === 'preparacion'
          ? (vehicle.deliveryDate ??
            new Date(new Date(cmd.at).getTime() + state.config.prepDeadlineHours * 3_600_000).toISOString())
          : null;

      const request: ServiceRequest = {
        id: unico('req', cmd),
        type: cmd.requestType,
        vehicleId: cmd.vehicleId,
        siteId: cmd.siteId,
        from: vehicle.location,
        to: cmd.to,
        status: 'solicitada',
        urgent: cmd.urgent ?? false,
        createdAt: cmd.at,
        createdBy: cmd.userId,
        assignedTo: null,
        note: cmd.note,
        dueAt,
        pickedUpAt: null,
        carrierId: cmd.requestType === 'traslado' ? (cmd.carrierId ?? null) : null,
      };
      const vehiclePatch: Partial<Vehicle> =
        cmd.requestType === 'traslado'
          ? { status: 'traslado_solicitado', targetSiteId: cmd.to?.siteId ?? cmd.siteId }
          : { targetSiteId: cmd.siteId };

      let next: AppState = {
        ...activate(state, cmd.vehicleId),
        requests: [request, ...state.requests],
        vehicles: replace(state.vehicles, cmd.vehicleId, vehiclePatch),
      };

      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'solicitud',
        title: cmd.requestType === 'traslado' ? 'Traslado solicitado' : 'Preparación solicitada',
        detail: `${siteName(state, cmd.siteId)} · ${userName(state, cmd.userId)}${cmd.urgent ? ' · URGENTE' : ''}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'request.update': {
      const req = state.requests.find((r) => r.id === cmd.requestId);
      if (!req) return state;

      // Al recoger las llaves arranca el plazo del transportista.
      const recoge = req.type === 'traslado' && cmd.status === 'en_ruta' && !req.pickedUpAt;
      const patch: Partial<ServiceRequest> = {
        status: cmd.status,
        assignedTo: cmd.assignedTo !== undefined ? cmd.assignedTo : req.assignedTo,
        carrierId: cmd.carrierId !== undefined ? cmd.carrierId : req.carrierId,
      };
      if (recoge) {
        patch.pickedUpAt = cmd.at;
        patch.dueAt = new Date(
          new Date(cmd.at).getTime() + state.config.transferDeadlineHours * 3_600_000
        ).toISOString();
      }

      const next: AppState = { ...state, requests: replace(state.requests, cmd.requestId, patch) };
      return addEvent(next, {
        vehicleId: req.vehicleId,
        kind: 'solicitud',
        // La recogida de llaves es el hecho que arranca el plazo, así que
        // en la trazabilidad se nombra por lo que es y no por el estado.
        title: recoge
          ? `Llaves recogidas · empiezan ${state.config.transferDeadlineHours} h`
          : `Solicitud ${REQUEST_STATUS_LABEL[cmd.status].toLowerCase()}`,
        detail: `${req.type === 'traslado' ? 'Traslado' : 'Preparación'} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* -------------------------------------------------------- preparación */
    case 'prep.create': {
      if (!vehicle) return state;
      if (yaCreado(state.preparations, unico('prep', cmd))) return state;
      const existing = state.preparations.find(
        (p) => p.vehicleId === cmd.vehicleId && p.runState !== 'terminado'
      );
      if (existing) return state;
      const target = (state.config.prepTargetMinutes[vehicle.type] ?? 120) * 60_000;
      const prep: Preparation = {
        id: unico('prep', cmd),
        vehicleId: cmd.vehicleId,
        siteId: cmd.siteId,
        preparerId: cmd.preparerId ?? null,
        phase: 'pendiente',
        runState: 'pendiente',
        items: checklistFor(state, vehicle),
        effectiveMs: 0,
        waitingMs: 0,
        targetMs: target,
        runningSince: null,
        waitingSince: null,
        waitReason: null,
        startedAt: null,
        finishedAt: null,
      };
      let next: AppState = {
        ...activate(state, cmd.vehicleId),
        preparations: [prep, ...state.preparations],
        vehicles: replace(state.vehicles, cmd.vehicleId, { status: 'en_preparacion', targetSiteId: cmd.siteId }),
      };

      // Si esto viene de una solicitud del comercial, esa solicitud pasa a
      // «en curso» y queda a nombre de quien la prepara. Antes había que
      // acordarse de cambiarla a mano y se quedaba en «solicitada» aunque
      // el coche ya estuviera en el taller.
      const pedido = next.requests.find(
        (r) => r.type === 'preparacion' && r.vehicleId === cmd.vehicleId && r.status !== 'terminada'
      );
      if (pedido) {
        next = {
          ...next,
          requests: replace(next.requests, pedido.id, {
            status: 'en_curso',
            assignedTo: cmd.preparerId ?? pedido.assignedTo,
          }),
        };
      }

      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'preparacion',
        title: 'Preparación creada',
        detail: `${siteName(state, cmd.siteId)} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'prep.start':
    case 'prep.resume': {
      const p = state.preparations.find((x) => x.id === cmd.prepId);
      if (!p || p.runState === 'terminado') return state;
      const waitedMs = transcurrido(p.waitingSince, cmd);
      const next: AppState = {
        ...state,
        preparations: replace(state.preparations, cmd.prepId, {
          runState: 'en_curso',
          runningSince: cmd.at,
          waitingSince: null,
          waitingMs: p.waitingMs + waitedMs,
          waitReason: null,
          startedAt: p.startedAt ?? cmd.at,
        }),
        vehicles: replace(state.vehicles, p.vehicleId, { status: 'en_preparacion' }),
      };
      return addEvent(next, {
        vehicleId: p.vehicleId,
        kind: 'preparacion',
        title: cmd.type === 'prep.start' ? 'Preparación iniciada' : 'Preparación reanudada',
        detail: userName(state, cmd.userId),
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'prep.pause': {
      const p = state.preparations.find((x) => x.id === cmd.prepId);
      if (!p) return state;
      const ranMs = transcurrido(p.runningSince, cmd);
      let next: AppState = {
        ...state,
        preparations: replace(state.preparations, cmd.prepId, {
          runState: cmd.blocked ? 'bloqueado' : 'en_espera',
          effectiveMs: p.effectiveMs + ranMs,
          runningSince: null,
          waitingSince: cmd.at,
          waitReason: cmd.reason,
        }),
      };
      if (cmd.blocked) {
        const v = state.vehicles.find((x) => x.id === p.vehicleId) ?? null;
        next = fireRules(next, 'preparacion_bloqueada', v, {
          siteId: p.siteId,
          tone: 'warn',
          body: `${v ? vehicleTitle(v) : 'Vehículo'} bloqueado en ${siteName(state, p.siteId)}: ${cmd.reason}.`,
        });
      }
      return addEvent(next, {
        vehicleId: p.vehicleId,
        kind: 'preparacion',
        title: cmd.blocked ? 'Preparación bloqueada' : 'Preparación en espera',
        detail: `Motivo: ${cmd.reason} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'prep.item': {
      const p = state.preparations.find((x) => x.id === cmd.prepId);
      if (!p) return state;
      const items = p.items.map((i) =>
        i.requirementId === cmd.requirementId
          ? {
              ...i,
              state: cmd.state,
              by: cmd.state === 'completado' ? userName(state, cmd.userId) : undefined,
              at: cmd.state === 'completado' ? cmd.at : undefined,
            }
          : i
      );
      const updated: Preparation = { ...p, items };
      const next: AppState = {
        ...state,
        preparations: replace(state.preparations, cmd.prepId, { items, phase: derivePhase(updated) }),
      };
      const label = p.items.find((i) => i.requirementId === cmd.requirementId)?.label ?? cmd.requirementId;
      return addEvent(next, {
        vehicleId: p.vehicleId,
        kind: 'preparacion',
        title: `${label}: ${cmd.state.replace('_', ' ')}`,
        detail: userName(state, cmd.userId),
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'prep.finish': {
      const p = state.preparations.find((x) => x.id === cmd.prepId);
      if (!p) return state;
      // Si el preparador dice dónde deja el coche, el movimiento se registra
      // antes de cerrar: así la ficha no se queda diciendo que sigue en el
      // taller. Es el mismo comando de siempre, con un id derivado del de
      // esta orden para que un reintento no duplique el movimiento.
      const base: AppState = cmd.to
        ? applyCommand(state, {
            type: 'movement.register',
            id: `${cmd.id}-mov`,
            at: cmd.at,
            userId: cmd.userId,
            vehicleId: p.vehicleId,
            to: cmd.to,
            note: 'Ubicación al terminar la preparación',
          })
        : state;
      const ranMs = transcurrido(p.runningSince, cmd);
      const items = p.items.map((i) => (i.state === 'pendiente' ? { ...i, state: 'completado' as CheckState } : i));
      let next: AppState = {
        ...base,
        preparations: replace(base.preparations, cmd.prepId, {
          runState: 'terminado',
          phase: 'apto_entrega',
          items,
          effectiveMs: p.effectiveMs + ranMs,
          runningSince: null,
          waitingSince: null,
          waitReason: null,
          finishedAt: cmd.at,
        }),
        vehicles: replace(base.vehicles, p.vehicleId, { status: 'apto_entrega' }),
      };
      const openReq = next.requests.find(
        (r) => r.vehicleId === p.vehicleId && r.type === 'preparacion' && r.status !== 'terminada'
      );
      if (openReq) next = { ...next, requests: replace(next.requests, openReq.id, { status: 'terminada' }) };

      const v = next.vehicles.find((x) => x.id === p.vehicleId) ?? null;
      next = fireRules(next, 'preparacion_terminada', v, {
        siteId: p.siteId,
        body: `${v ? vehicleTitle(v) : 'Vehículo'} apto para entrega en ${siteName(state, p.siteId)}.`,
      });
      return addEvent(next, {
        vehicleId: p.vehicleId,
        kind: 'preparacion',
        title: 'Preparación terminada · apto entrega',
        detail: cmd.to
          ? `${userName(state, cmd.userId)} · lo deja en ${locationLabel(next, cmd.to, true)}`
          : userName(state, cmd.userId),
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* ---------------------------------------------------------- recuentos */
    case 'count.create': {
      if (yaCreado(state.counts, unico('count', cmd))) return state;
      const expected = state.vehicles
        .filter((v) =>
          cmd.zoneId ? v.location?.zoneId === cmd.zoneId : v.location?.siteId === cmd.siteId
        )
        .map((v) => v.id);
      const count: FleetCount = {
        id: unico('count', cmd),
        code: cmd.code,
        siteId: cmd.siteId,
        zoneId: cmd.zoneId,
        startedAt: cmd.at,
        closedAt: null,
        responsibleId: cmd.userId,
        expected,
        found: [],
      };
      return { ...state, counts: [count, ...state.counts] };
    }

    case 'count.finding': {
      const count = state.counts.find((c) => c.id === cmd.countId);
      const v = state.vehicles.find((x) => x.id === cmd.vehicleId);
      if (!count || !v) return state;
      if (count.found.some((f) => f.vehicleId === cmd.vehicleId)) return state;

      const expectedPos = v.location?.positionId;
      const found = {
        vehicleId: cmd.vehicleId,
        at: cmd.at,
        by: cmd.userId,
        positionId: cmd.positionId ?? expectedPos,
        misplaced: !!cmd.positionId && !!expectedPos && cmd.positionId !== expectedPos,
      };
      const location: LocationRef | null = cmd.positionId
        ? {
            siteId: count.siteId,
            zoneId: state.positions.find((p) => p.id === cmd.positionId)?.zoneId ?? v.location?.zoneId,
            positionId: cmd.positionId,
          }
        : v.location;

      // El recuento es una observación física: si el coche está aquí, el que
      // teníamos apuntado en esta plaza ya no está.
      const base = liberarPlaza(activate(state, cmd.vehicleId), cmd.positionId, cmd.vehicleId, cmd);
      let next: AppState = {
        ...base,
        counts: base.counts.map((c) => (c.id === cmd.countId ? { ...c, found: [...c.found, found] } : c)),
        vehicles: replace(base.vehicles, cmd.vehicleId, {
          lastCheckAt: cmd.at,
          lastCheckBy: userName(state, cmd.userId),
          location,
        }),
      };
      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'recuento',
        title: 'Comprobado en recuento',
        detail: `${count.code} · ${locationLabel(next, location)} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'count.close': {
      return { ...state, counts: replace(state.counts, cmd.countId, { closedAt: cmd.at }) };
    }

    /* -------------------------------------------------------- incidencias */
    case 'incident.create': {
      if (yaCreado(state.incidents, unico('inc', cmd))) return state;
      const incident: Incident = {
        id: unico('inc', cmd),
        vehicleId: cmd.vehicleId,
        type: cmd.incidentType,
        description: cmd.description,
        photos: cmd.photos,
        status: 'abierta',
        createdAt: cmd.at,
        createdBy: cmd.userId,
      };
      let next: AppState = { ...activate(state, cmd.vehicleId), incidents: [incident, ...state.incidents] };
      next = fireRules(next, 'incidencia_abierta', vehicle, {
        siteId: vehicle?.location?.siteId,
        tone: 'danger',
        body: `${vehicle ? vehicleTitle(vehicle) : 'Vehículo'}: ${cmd.description}`,
      });
      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'incidencia',
        title: 'Incidencia registrada',
        detail: `${cmd.description}${cmd.photos.length ? ` · ${cmd.photos.length} fotos` : ''}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'incident.close': {
      const inc = state.incidents.find((i) => i.id === cmd.incidentId);
      if (!inc) return state;
      const next: AppState = {
        ...state,
        incidents: replace(state.incidents, cmd.incidentId, { status: 'cerrada', closedAt: cmd.at }),
      };
      return addEvent(next, {
        vehicleId: inc.vehicleId,
        kind: 'incidencia',
        title: 'Incidencia cerrada',
        detail: userName(state, cmd.userId),
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* ------------------------------------------------------ notificaciones */
    case 'rule.create': {
      if (yaCreado(state.rules, unico('rule', cmd))) return state;
      const rule: NotificationRule = { id: unico('rule', cmd), createdAt: cmd.at, ...cmd.rule };
      return { ...state, rules: [rule, ...state.rules] };
    }
    case 'rule.toggle': {
      const rule = state.rules.find((r) => r.id === cmd.ruleId);
      if (!rule) return state;
      return { ...state, rules: replace(state.rules, cmd.ruleId, { active: !rule.active }) };
    }
    case 'rule.delete':
      return { ...state, rules: state.rules.filter((r) => r.id !== cmd.ruleId) };

    case 'inbox.read':
      return { ...state, inbox: replace(state.inbox, cmd.eventId, { read: true }) };
    case 'inbox.readAll':
      return { ...state, inbox: state.inbox.map((n) => ({ ...n, read: true })) };

    /* ----------------------------------------------------------- recepción */
    case 'reception.create': {
      if (yaCreado(state.receptions, unico('rec', cmd))) return state;
      const reception: Reception = {
        id: unico('rec', cmd),
        truckPlate: cmd.truckPlate,
        carrier: cmd.carrier,
        siteId: cmd.siteId,
        arrivedAt: cmd.at,
        closedAt: null,
        albaranUri: null,
        lines: [],
      };
      return { ...state, receptions: [reception, ...state.receptions] };
    }

    case 'reception.line': {
      const rec = state.receptions.find((r) => r.id === cmd.receptionId);
      if (!rec) return state;
      const idx = rec.lines.findIndex((l) => l.ref === cmd.ref);
      const base = idx >= 0 ? rec.lines[idx] : { vehicleId: null, ref: cmd.ref, unloaded: false, damage: null, photos: [], positionId: null };
      const matched =
        base.vehicleId ??
        state.vehicles.find((v) => v.vin8 === cmd.ref || v.plate === cmd.ref)?.id ??
        null;
      const line = {
        ...base,
        vehicleId: matched,
        unloaded: cmd.unloaded ?? base.unloaded,
        damage: cmd.damage !== undefined ? cmd.damage : base.damage,
        positionId: cmd.positionId !== undefined ? cmd.positionId : base.positionId,
        photos: cmd.photos ?? base.photos,
      };
      const lines = idx >= 0 ? rec.lines.map((l, i) => (i === idx ? line : l)) : [...rec.lines, line];

      let next: AppState = { ...state, receptions: replace(state.receptions, cmd.receptionId, { lines }) };

      // Al descargar y asignar plaza, el vehículo entra en campa.
      if (matched && line.unloaded && line.positionId) {
        const zoneId = state.positions.find((p) => p.id === line.positionId)?.zoneId;
        next = liberarPlaza(activate(next, matched), line.positionId, matched, cmd);
        next = {
          ...next,
          vehicles: replace(next.vehicles, matched, {
            location: { siteId: rec.siteId, zoneId, positionId: line.positionId },
            status: 'aparcado',
            receivedAt: cmd.at,
            lastCheckAt: cmd.at,
            lastCheckBy: userName(state, cmd.userId),
            lastMovementAt: cmd.at,
          }),
        };
        next = addEvent(next, {
          vehicleId: matched,
          kind: 'recepcion',
          title: 'Descargado del camión',
          detail: `Camión ${rec.truckPlate} · ${locationLabel(next, { siteId: rec.siteId, zoneId, positionId: line.positionId })}`,
          at: cmd.at,
          userId: cmd.userId,
        });
      }
      return next;
    }

    case 'reception.albaran':
      return { ...state, receptions: replace(state.receptions, cmd.receptionId, { albaranUri: cmd.uri }) };

    case 'reception.close':
      return { ...state, receptions: replace(state.receptions, cmd.receptionId, { closedAt: cmd.at }) };

    /* ---------------------------------------------------------- admin */
    case 'config.update':
      return { ...state, config: { ...state.config, ...cmd.patch } };

    case 'requirement.upsert': {
      const exists = state.config.requirements.some((r) => r.id === cmd.requirement.id);
      const requirements = exists
        ? state.config.requirements.map((r) => (r.id === cmd.requirement.id ? cmd.requirement : r))
        : [...state.config.requirements, cmd.requirement];
      return { ...state, config: { ...state.config, requirements: requirements.sort((a, b) => a.order - b.order) } };
    }

    case 'requirement.delete':
      return {
        ...state,
        config: {
          ...state.config,
          requirements: state.config.requirements.filter((r) => r.id !== cmd.requirementId),
        },
      };

    /* ------------------------------------------------------- ubicaciones */
    case 'site.upsert': {
      const exists = state.sites.some((x) => x.id === cmd.site.id);
      const sites = exists
        ? state.sites.map((x) => (x.id === cmd.site.id ? cmd.site : x))
        : [...state.sites, cmd.site];
      return { ...state, sites };
    }

    case 'site.delete': {
      // Nunca se borra una sede con vehículos dentro: se perdería el rastro.
      const inUse = state.vehicles.some((v) => v.location?.siteId === cmd.siteId);
      if (inUse) return state;
      return {
        ...state,
        sites: state.sites.filter((x) => x.id !== cmd.siteId),
        zones: state.zones.filter((z) => z.siteId !== cmd.siteId),
        positions: state.positions.filter(
          (p) => !state.zones.some((z) => z.siteId === cmd.siteId && z.id === p.zoneId)
        ),
      };
    }

    case 'zone.upsert': {
      const exists = state.zones.some((z) => z.id === cmd.zone.id);
      const zones = exists
        ? state.zones.map((z) => (z.id === cmd.zone.id ? cmd.zone : z))
        : [...state.zones, cmd.zone];

      const current = state.positions.filter((p) => p.zoneId === cmd.zone.id);
      let positions = [...state.positions];

      if (cmd.positions > current.length) {
        // Se añaden plazas al final, sin tocar las existentes.
        for (let i = current.length; i < cmd.positions; i++) {
          const n = String(i + 1).padStart(2, '0');
          positions.push({ id: `${cmd.zone.id}-p${n}`, zoneId: cmd.zone.id, code: `P${n}` });
        }
      } else if (cmd.positions < current.length) {
        // Al reducir, solo se quitan las plazas vacías, empezando por el final.
        const occupied = new Set(
          state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as string[]
        );
        const removable = current
          .slice()
          .reverse()
          .filter((p) => !occupied.has(p.id))
          .slice(0, current.length - cmd.positions)
          .map((p) => p.id);
        positions = positions.filter((p) => !removable.includes(p.id));
      }

      return { ...state, zones, positions };
    }

    case 'zone.delete': {
      const inUse = state.vehicles.some((v) => v.location?.zoneId === cmd.zoneId);
      if (inUse) return state;
      return {
        ...state,
        zones: state.zones.filter((z) => z.id !== cmd.zoneId),
        positions: state.positions.filter((p) => p.zoneId !== cmd.zoneId),
      };
    }

    case 'position.add': {
      const code = cmd.code.trim().toUpperCase();
      if (!code) return state;
      if (state.positions.some((p) => p.zoneId === cmd.zoneId && p.code === code)) return state;
      return {
        ...state,
        positions: [
          ...state.positions,
          { id: `${cmd.zoneId}-${code.toLowerCase()}`, zoneId: cmd.zoneId, code },
        ],
      };
    }

    case 'position.delete': {
      const occupied = state.vehicles.some((v) => v.location?.positionId === cmd.positionId);
      if (occupied) return state;
      return { ...state, positions: state.positions.filter((p) => p.id !== cmd.positionId) };
    }

    /* ---------------------------------------------------- usuarios y roles */
    case 'user.upsert': {
      const exists = state.users.some((u) => u.id === cmd.user.id);
      const users = exists
        ? state.users.map((u) => (u.id === cmd.user.id ? cmd.user : u))
        : [...state.users, cmd.user];
      return { ...state, users };
    }

    case 'user.delete': {
      // Se desactiva en vez de borrar: su nombre sigue en el histórico.
      return {
        ...state,
        users: state.users.map((u) => (u.id === cmd.targetUserId ? { ...u, active: false } : u)),
      };
    }

    case 'role.upsert': {
      const exists = state.config.roles.some((r) => r.id === cmd.role.id);
      const roles = exists
        ? state.config.roles.map((r) => (r.id === cmd.role.id ? { ...cmd.role, builtin: r.builtin } : r))
        : [...state.config.roles, cmd.role];
      return { ...state, config: { ...state.config, roles } };
    }

    case 'role.delete': {
      const role = state.config.roles.find((r) => r.id === cmd.roleId);
      // Los roles de serie y los que tienen gente asignada no se borran.
      if (!role || role.builtin) return state;
      if (state.users.some((u) => u.active && u.role === cmd.roleId)) return state;
      return {
        ...state,
        config: { ...state.config, roles: state.config.roles.filter((r) => r.id !== cmd.roleId) },
      };
    }

    /* -------------------------------------------------- campos propios */
    case 'customField.upsert': {
      const exists = state.config.customFields.some((f) => f.id === cmd.field.id);
      const customFields = exists
        ? state.config.customFields.map((f) => (f.id === cmd.field.id ? cmd.field : f))
        : [...state.config.customFields, cmd.field];
      return {
        ...state,
        config: { ...state.config, customFields: customFields.sort((a, b) => a.order - b.order) },
      };
    }

    case 'customField.delete': {
      return {
        ...state,
        config: {
          ...state.config,
          customFields: state.config.customFields.filter((f) => f.id !== cmd.fieldId),
          fleetColumns: state.config.fleetColumns.filter((c) => c.key !== `custom:${cmd.fieldId}`),
        },
      };
    }

    case 'vehicle.setCustom': {
      const v = state.vehicles.find((x) => x.id === cmd.vehicleId);
      if (!v) return state;
      const custom = { ...(v.custom ?? {}), [cmd.fieldId]: cmd.value };
      return {
        ...activate(state, cmd.vehicleId),
        vehicles: replace(state.vehicles, cmd.vehicleId, { custom }),
      };
    }

    /* ------------------------------------------- empresas de transporte */
    case 'carrier.upsert': {
      const exists = state.carriers.some((x) => x.id === cmd.carrier.id);
      const carriers = exists
        ? state.carriers.map((x) => (x.id === cmd.carrier.id ? cmd.carrier : x))
        : [...state.carriers, cmd.carrier];
      return { ...state, carriers };
    }

    case 'carrier.delete': {
      // Con traslados abiertos no se borra: se desactiva para que deje de
      // aparecer al asignar, pero el histórico sigue teniendo su nombre.
      const enUso = state.requests.some(
        (r) => r.carrierId === cmd.carrierId && r.status !== 'terminada'
      );
      if (enUso) {
        return {
          ...state,
          carriers: state.carriers.map((x) => (x.id === cmd.carrierId ? { ...x, active: false } : x)),
        };
      }
      return { ...state, carriers: state.carriers.filter((x) => x.id !== cmd.carrierId) };
    }

    /* --------------------------------------------- fecha de entrega */
    case 'vehicle.setDelivery': {
      if (!vehicle) return state;
      let next: AppState = {
        ...activate(state, cmd.vehicleId),
        vehicles: replace(state.vehicles, cmd.vehicleId, { deliveryDate: cmd.deliveryDate }),
      };

      // Si ya hay una preparación pedida, su plazo pasa a ser la entrega.
      const prepReq = next.requests.find(
        (r) => r.vehicleId === cmd.vehicleId && r.type === 'preparacion' && r.status !== 'terminada'
      );
      if (prepReq) {
        next = {
          ...next,
          requests: replace(next.requests, prepReq.id, {
            dueAt:
              cmd.deliveryDate ??
              new Date(
                new Date(prepReq.createdAt).getTime() + state.config.prepDeadlineHours * 3_600_000
              ).toISOString(),
          }),
        };
      }

      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'estado',
        title: cmd.deliveryDate ? 'Fecha de entrega fijada' : 'Fecha de entrega retirada',
        detail: `${cmd.deliveryDate ? new Date(cmd.deliveryDate).toLocaleDateString('es-ES') : '—'} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'vehicle.activate':
      return activate(state, cmd.vehicleId);

    /* ------------------------------------------- comercial del vehículo */
    case 'vehicle.setSalesRep': {
      if (!vehicle) return state;
      const nombre = cmd.salesRep?.trim() || null;
      if (nombre === (vehicle.salesRep ?? null)) return state;

      const next: AppState = {
        ...activate(state, cmd.vehicleId),
        vehicles: replace(state.vehicles, cmd.vehicleId, { salesRep: nombre }),
      };

      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'estado',
        title: nombre ? 'Comercial asignado' : 'Comercial retirado',
        detail: `${nombre ?? '—'}${
          vehicle.salesRep ? ` · antes ${vehicle.salesRep}` : ''
        } · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* ------------------------------------------------- alta de vehículo */
    case 'vehicle.create': {
      const vin8 = cmd.vin8.trim().toUpperCase().replace(/\s+/g, '');
      if (vin8.length < 4) return state;

      const matricula = cmd.plate?.trim().toUpperCase() || null;

      // El identificador sale del bastidor, no del comando: si el mismo
      // coche se da de alta dos veces —en recepción y en la oficina, o en
      // dos móviles sin cobertura— tiene que ser el mismo coche, no dos.
      // Es también lo que permite que el importador de Quiter lo reconozca.
      const id: Id = `v-${vin8}`;

      const existente =
        state.vehicles.find((v) => v.id === id) ??
        state.vehicles.find(
          (v) =>
            v.vin8.toUpperCase() === vin8 ||
            (!!matricula && !!v.plate && v.plate.toUpperCase().replace(/\s+/g, '') === matricula.replace(/\s+/g, ''))
        );

      // Ya estaba: no se duplica. Se completa lo que faltaba (una matrícula
      // que antes no se sabía, por ejemplo) y se deja activo.
      if (existente) {
        const relleno: Partial<Vehicle> = { logisticActive: true };
        if (!existente.plate && matricula) relleno.plate = matricula;
        if (!existente.vin && cmd.vin) relleno.vin = cmd.vin;
        if (!existente.salesRep && cmd.salesRep) relleno.salesRep = cmd.salesRep;
        return { ...state, vehicles: replace(state.vehicles, existente.id, relleno) };
      }

      const vehicle: Vehicle = {
        id,
        vin8,
        vin: cmd.vin?.trim().toUpperCase() || vin8,
        plate: matricula,
        // Lo que no se sabe se deja marcado como tal en vez de inventarlo:
        // Quiter lo completará y así se ve qué falta.
        brand: cmd.brand?.trim() || 'Sin identificar',
        model: cmd.model?.trim() || '—',
        type: cmd.vehicleType ?? 'VN',
        situation: cmd.situation ?? 'stock',
        salesRep: cmd.salesRep?.trim() || null,
        origin: cmd.origin?.trim() || 'Alta manual',
        logisticActive: true,
        location: cmd.location ?? null,
        targetSiteId: null,
        status: cmd.location ? 'aparcado' : 'recepcionado',
        lastCheckAt: cmd.at,
        lastCheckBy: userName(state, cmd.userId),
        lastMovementAt: null,
        receivedAt: cmd.at,
      };

      let next: AppState = { ...state, vehicles: [vehicle, ...state.vehicles] };

      // Si venía en un camión que se está descargando, la línea del albarán
      // deja de estar huérfana en el momento: al operario le aparece el
      // coche con nombre en vez de un bastidor suelto.
      next = {
        ...next,
        receptions: next.receptions.map((r) =>
          r.closedAt
            ? r
            : {
                ...r,
                lines: r.lines.map((l) =>
                  !l.vehicleId && l.ref.toUpperCase().replace(/\s+/g, '') === vin8
                    ? { ...l, vehicleId: id }
                    : l
                ),
              }
        ),
      };

      return addEvent(next, {
        vehicleId: id,
        kind: 'estado',
        title: 'Vehículo dado de alta a mano',
        detail: `${vin8}${matricula ? ` · ${matricula}` : ''} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    default:
      return state;
  }
}

/** Aplica una lista de comandos en orden (útil para sincronizar). */
export function applyAll(state: AppState, commands: Command[]): AppState {
  return commands.reduce(applyCommand, clone(state));
}

/** Objetivo por defecto en ms para un tipo de vehículo. */
export function defaultTargetMs(type: 'VN' | 'VO'): number {
  return (CONFIG.prepTargetMinutes[type] ?? 120) * 60_000;
}
