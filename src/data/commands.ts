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
  FinalPreparationPhotos,
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
  TipoPreparacion,
  Site,
  TraceEvent,
  User,
  Vehicle,
  Zone,
  CustomField,
  Carrier,
  DelayReason,
  VehicleType,
  Situation,
  CommercialArea,
  CommercialCategory,
} from './types';
import { REQUEST_STATUS_LABEL } from './types';
import { CONFIG } from './seed';
import { avisoPara } from './selectors';
import { locationLabel, siteName, userName, vehicleTitle } from './format';

/* ------------------------------------------------------------- comandos */

export type Command =
  | { type: 'request.cancel'; id: Id; at: string; userId: Id; requestId: Id; reason: string }
  | { type: 'vehicle.setKeys'; id: Id; at: string; userId: Id; vehicleId: Id; primary?: string | null; secondary?: string | null }
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
      /** Por qué llega tarde, cuando este movimiento cierra un traslado. */
      delayReason?: DelayReason | null;
      delayNote?: string | null;
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
      /** Qué trabajo se pide, solo para preparaciones. */
      prepTipo?: TipoPreparacion;
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
      /** Por qué llega tarde. Solo se pide si se pasa del plazo. */
      delayReason?: DelayReason | null;
      delayNote?: string | null;
    }
  | {
      type: 'prep.create';
      id: Id;
      at: string;
      userId: Id;
      vehicleId: Id;
      siteId: Id;
      preparerId?: Id | null;
      /** Preparación de entrada (por defecto) o repaso de entrega. */
      tipo?: TipoPreparacion;
    }
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
      /** Cuatro diagonales obligatorias del estado del coche al terminar. */
      finalPhotos?: FinalPreparationPhotos;
      /** Si ve un daño, queda registrado en la misma operación de cierre. */
      damageDescription?: string | null;
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
  | {
      /**
       * Activar o pausar una regla de aviso.
       *
       * Lleva el valor que tiene que quedar, no «lo contrario de lo que
       * hay». Un comando que invierte no se puede aplicar dos veces: si la
       * respuesta se pierde y el comando se reintenta, la regla vuelve a
       * como estaba y el aviso se apaga solo sin que nadie lo haya tocado.
       */
      type: 'rule.setActive';
      id: Id;
      at: string;
      userId: Id;
      ruleId: Id;
      active: boolean;
    }
  | { type: 'rule.delete'; id: Id; at: string; userId: Id; ruleId: Id }
  | {
      /**
       * Repasa las condiciones que no dispara nadie al hacer algo, sino el
       * paso del tiempo: un coche que lleva 72 h sin comprobar, un traslado
       * que lleva 24 h sin que nadie recoja las llaves.
       *
       * Lo lanza el servidor cada hora y la app al abrirse. Es idempotente
       * por el día: el mismo coche no avisa dos veces el mismo día aunque el
       * barrido pase veinte veces.
       */
      type: 'alerts.sweep';
      id: Id;
      at: string;
      userId: Id;
    }
  | { type: 'inbox.read'; id: Id; at: string; userId: Id; eventId: Id }
  | { type: 'inbox.readAll'; id: Id; at: string; userId: Id }
  | { type: 'reception.create'; id: Id; at: string; userId: Id; truckPlate: string; carrier: string; siteId: Id }
  | {
      type: 'reception.line';
      zoneId?: Id | null;
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
      /**
       * El coche se ha entregado al cliente y sale de la operativa.
       *
       * Hasta ahora el estado «Entregado» existía en la lista pero no lo
       * ponía ningún comando: la flota no se vaciaba nunca y la plaza de un
       * coche vendido seguía ocupada para siempre. En una campa con 600
       * huecos eso se nota en meses.
       */
      type: 'vehicle.deliver';
      id: Id;
      at: string;
      userId: Id;
      vehicleId: Id;
      note?: string;
    }
  | {
      type: 'vehicle.setSalesRep';
      id: Id;
      at: string;
      userId: Id;
      vehicleId: Id;
      /** Nombre del comercial, o null para dejarlo sin asignar. */
      salesRep: string | null;
      /** Usuario relacionado cuando existe en Urkiola. */
      salesRepUserId?: Id | null;
    }
  | {
      type: 'vehicle.setCommercial';
      id: Id;
      at: string;
      userId: Id;
      vehicleId: Id;
      commercialArea: CommercialArea;
      commercialCategory: CommercialCategory;
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
      commercialArea?: CommercialArea;
      commercialCategory?: CommercialCategory;
      salesRep?: string | null;
      salesRepUserId?: Id | null;
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

/**
 * Mete un aviso en la bandeja.
 *
 * El `sufijo` es para el barrido por tiempo: allí el id no puede salir del
 * comando —cada barrido es un comando distinto— sino de *qué* se avisa y de
 * *qué día*, o el mismo coche sin comprobar avisaría en cada barrido hasta
 * llenar la bandeja de lo mismo.
 */
function addInbox(
  state: AppState,
  ev: Omit<NotificationEvent, 'id' | 'read'>,
  sufijo?: string
): AppState {
  const item: NotificationEvent = { id: sufijo ?? derivado('nev'), read: false, readBy: [], ...ev };
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
/**
 * A quién le llega este aviso, resuelto en el momento de crearlo.
 *
 * `null` quiere decir «a todo el mundo». Se resuelve aquí y no al leer la
 * bandeja porque el comercial de un coche puede cambiar mañana, y el aviso
 * de hoy era para el de hoy.
 */
function destinatarios(state: AppState, rule: NotificationRule, vehicle: Vehicle | null): Id[] | null {
  const audiencia = rule.audience ?? { kind: 'todos' as const };
  if (audiencia.kind === 'todos') return null;
  if (audiencia.kind === 'rol') {
    return state.users.filter((u) => u.active && u.role === audiencia.roleId).map((u) => u.id);
  }
  // El comercial del coche: se busca por nombre, que es como viene de
  // Quiter, con el mismo emparejamiento que usa el resto de la aplicación.
  if (!vehicle?.salesRep) return [];
  const rep = vehicle.salesRep.trim().toLowerCase();
  return state.users
    .filter((u) => {
      if (!u.active) return false;
      const nombre = u.name.trim().toLowerCase();
      return rep === nombre || nombre.startsWith(`${rep} `) || rep.startsWith(`${nombre} `);
    })
    .map((u) => u.id);
}

function fireRules(
  state: AppState,
  condition: NotifyCondition,
  vehicle: Vehicle | null,
  ctx: { siteId?: Id | null; body: string; tone?: NotificationEvent['tone']; sufijo?: string }
): AppState {
  let next = state;
  for (const rule of state.rules) {
    if (!rule.active || rule.condition !== condition) continue;
    if (rule.scopeKind === 'vehicle' && rule.scopeRef !== vehicle?.id) continue;
    if (rule.scopeKind === 'site' && rule.scopeRef !== ctx.siteId) continue;
    if (condition === 'llegada_sede' && rule.targetSiteId && rule.targetSiteId !== ctx.siteId) continue;

    const userIds = destinatarios(next, rule, vehicle);
    // Una regla dirigida a alguien que no existe no genera un aviso que no
    // va a leer nadie: un coche sin comercial no avisa a ningún comercial.
    if (userIds !== null && userIds.length === 0) continue;

    next = addInbox(next, {
      ruleId: rule.id,
      vehicleId: vehicle?.id ?? null,
      userIds,
      title: `${rule.recipient} · aviso`,
      body: ctx.body,
      // La fecha del comando, no la de ahora: si el servidor rehace su
      // estado a partir del histórico, los avisos salen con la misma fecha
      // que tenían y no con la del reinicio.
      at: enCurso?.at ?? new Date().toISOString(),
      tone: ctx.tone ?? 'info',
    }, ctx.sufijo);
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
function fechaDeUbicacion(v: Vehicle): number {
  return Math.max(0, ...[v.locationObservedAt, v.lastCheckAt, v.lastMovementAt, v.deliveredAt]
    .map((fecha) => fecha ? Date.parse(fecha) || 0 : 0));
}

function observacionAtrasada(v: Vehicle, cmd: Command): boolean {
  return Date.parse(cmd.at) < fechaDeUbicacion(v);
}

/** Una observación antigua tampoco puede quitarle la plaza a otro coche
 * comprobado después. Se conserva la zona, con la plaza sin confirmar. */
function ubicacionObservable(state: AppState, lugar: LocationRef | null, vehicleId: Id, cmd: Command): LocationRef | null {
  if (!lugar?.positionId) return lugar;
  const ocupacionPosterior = state.vehicles.some((v) => v.id !== vehicleId &&
    v.location?.positionId === lugar.positionId && observacionAtrasada(v, cmd));
  return ocupacionPosterior ? { ...lugar, positionId: undefined } : lugar;
}

function anotarObservacionAntigua(state: AppState, vehicleId: Id, cmd: Command, detail: string): AppState {
  return addEvent(state, {
    vehicleId, kind: 'movimiento', title: 'Observación anterior recibida con retraso',
    detail: `${detail}. Se conserva la ubicación comprobada después.`, at: cmd.at, userId: cmd.userId,
  });
}

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
        locationObservedAt: cmd.at,
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

/**
 * Lo que hay que cambiarle a un vehículo para devolverlo a la operativa.
 *
 * Vale para los dos casos en los que un coche está fuera: el parque de
 * Quiter sin actividad, y el que se dio por entregado.
 *
 * Con el entregado manda la observación física, igual que con las plazas:
 * si alguien lo mueve, lo cuenta o lo comprueba, el coche está aquí y el
 * «Entregado» era mentira. Se le quita también la fecha de entrega, porque
 * si no seguiría contando como entregado en el registro del mes.
 */
function vuelveALaOperativa(v: Vehicle, patch: Partial<Vehicle>): Partial<Vehicle> {
  const completo: Partial<Vehicle> = { logisticActive: true, ...patch };
  if (v.status !== 'entregado') return completo;
  // La ubicación que va a quedar, no la de antes: el mismo comando que lo
  // trae de vuelta suele decir dónde está.
  const donde = patch.location !== undefined ? patch.location : v.location;
  return {
    ...completo,
    status: patch.status ?? (donde ? 'aparcado' : 'recepcionado'),
    deliveredAt: null,
    deliveredBy: null,
  };
}

/** Un vehículo con actividad logística pasa a estar activo. */
function activate(state: AppState, vehicleId: Id): AppState {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return state;
  if (v.logisticActive && v.status !== 'entregado') return state;
  return { ...state, vehicles: replace(state.vehicles, vehicleId, vuelveALaOperativa(v, {})) };
}

/**
 * Cambia datos del vehículo sin traerlo de vuelta si estaba entregado.
 *
 * Corregir quién lo vendió, un campo propio o la fecha comprometida es
 * papeleo, no una observación física: no puede resucitar en la flota un
 * coche que se llevó el cliente hace tres semanas. Con los del parque de
 * Quiter sí lo activa, porque ahí el papeleo *es* la señal de que el coche
 * entra en nuestra operativa.
 */
function apuntarEnVehiculo(state: AppState, vehicleId: Id, patch: Partial<Vehicle>): AppState {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return state;
  const completo = v.status === 'entregado' ? patch : { logisticActive: true, ...patch };
  return { ...state, vehicles: replace(state.vehicles, vehicleId, completo) };
}

/**
 * Activa el vehículo y le cambia lo que haga falta, en ese orden.
 *
 * Existe porque hacerlo a mano salía mal de una forma que no se ve leyendo:
 *
 *     { ...activate(state, id), vehicles: replace(state.vehicles, id, patch) }
 *
 * El `replace` parte de `state.vehicles` —el de antes— y pisa el resultado
 * de `activate`, así que la activación se perdía en silencio. Pasaba en
 * cinco comandos: pedir un traslado, abrir una preparación, poner la fecha
 * de entrega, asignar comercial y rellenar un campo propio. El coche se
 * quedaba fuera de la operativa con trabajo pedido encima: nadie lo veía en
 * ninguna pantalla y el traslado no lo hacía nadie.
 */
function tocarVehiculo(state: AppState, vehicleId: Id, patch: Partial<Vehicle>): AppState {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return state;
  return { ...state, vehicles: replace(state.vehicles, vehicleId, vuelveALaOperativa(v, patch)) };
}

/**
 * La ubicación completa de una plaza: plaza → zona → sede.
 *
 * La plaza es el único dato fiable de los tres, porque es lo que el operario
 * ve escrito en el suelo. La sede y la zona salen de ella, nunca de lo que
 * venga en el comando ni de donde creíamos que estaba el coche: si no,
 * confirmar un coche en una plaza de Anoeta con el coche apuntado en Sondika
 * dejaba «Sondika · zona de Anoeta», una ubicación que no existe.
 */
function ubicacionDePlaza(state: AppState, positionId: Id): LocationRef | null {
  const plaza = state.positions.find((p) => p.id === positionId);
  if (!plaza) return null;
  const zona = state.zones.find((z) => z.id === plaza.zoneId);
  if (!zona) return null;
  return { siteId: zona.siteId, zoneId: zona.id, positionId: plaza.id };
}

/**
 * Deja una ubicación en algo que existe de verdad.
 *
 * El servidor no se puede creer lo que le mandan (regla: la comprobación del
 * cliente es comodidad de interfaz, no seguridad), y aquí la mentira sale
 * cara: una plaza inventada deja ocupado un hueco que está libre, y alguien
 * baja a la campa a buscar un coche que no está.
 *
 * Manda la plaza, porque es lo único que el operario lee escrito en el
 * suelo: si la plaza existe, de ella salen la zona y la sede. Si no existe,
 * se cae al detalle de al lado —la zona basta— y como último recurso a la
 * sede sola. Perder la plaza no pierde el coche; inventarla, sí.
 */
function normalizarUbicacion(state: AppState, ref: LocationRef | null | undefined): LocationRef | null {
  if (!ref) return null;
  if (ref.positionId) {
    const porPlaza = ubicacionDePlaza(state, ref.positionId);
    if (porPlaza) return porPlaza;
  }
  if (!state.sites.some((x) => x.id === ref.siteId)) return null;
  const zona = ref.zoneId ? state.zones.find((z) => z.id === ref.zoneId) : null;
  return zona && zona.siteId === ref.siteId
    ? { siteId: ref.siteId, zoneId: zona.id }
    : { siteId: ref.siteId };
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

function checklistFor(
  state: AppState,
  vehicle: Vehicle,
  tipo: TipoPreparacion = 'entrada'
): Preparation['items'] {
  return state.config.requirements
    .filter((r) => r.vehicleTypes.length === 0 || r.vehicleTypes.includes(vehicle.type))
    .filter((r) => r.siteIds.length === 0 || r.siteIds.includes(vehicle.targetSiteId ?? ''))
    // Pedirle los catorce requisitos de una preparación entera a quien va a
    // pasar un trapo acaba con los catorce marcados sin mirar.
    .filter((r) => !r.tipos || r.tipos.length === 0 || r.tipos.includes(tipo))
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
      if (observacionAtrasada(vehicle, cmd)) return anotarObservacionAntigua(state, vehicle.id, cmd, 'Comprobación física');
      // La sede y la zona salen de la plaza, no de donde teníamos apuntado
      // el coche: antes se mezclaban las dos y salía «Sondika · zona de
      // Anoeta». Una plaza que no existe no mueve el coche a ningún sitio.
      const location = ubicacionObservable(state, cmd.positionId
        ? (ubicacionDePlaza(state, cmd.positionId) ?? vehicle.location)
        : vehicle.location, vehicle.id, cmd);

      // Comprobar un coche en una plaza es una observación física: si está
      // aquí, el que teníamos apuntado en esta plaza ya no está.
      let next = liberarPlaza(state, location?.positionId, cmd.vehicleId, cmd);
      next = tocarVehiculo(next, cmd.vehicleId, {
        lastCheckAt: cmd.at,
        lastCheckBy: userName(state, cmd.userId),
        location,
        locationObservedAt: cmd.at,
      });
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
      // Mover un coche a una sede que no existe no es mover un coche.
      const observado = normalizarUbicacion(state, cmd.to);
      const destino = ubicacionObservable(state, observado, vehicle.id, cmd);
      if (!destino) return state;
      const movement: Movement = {
        id: unico('mov', cmd),
        vehicleId: cmd.vehicleId,
        from: vehicle.location,
        to: observado!,
        userId: cmd.userId,
        at: cmd.at,
        status: 'completado',
        note: cmd.note,
      };
      if (observacionAtrasada(vehicle, cmd)) {
        return anotarObservacionAntigua({ ...state, movements: [movement, ...state.movements] }, vehicle.id, cmd,
          `Movimiento a ${locationLabel(state, observado)}`);
      }
      const changedSite = vehicle.location?.siteId !== destino.siteId;

      // Al cambiar de sede el coche queda aparcado a la espera, llegue a su
      // destino previsto o a otro sitio.
      const status: Vehicle['status'] =
        changedSite || vehicle.status === 'entregado' ? 'aparcado' : vehicle.status;

      let next: AppState = {
        ...liberarPlaza(activate(state, cmd.vehicleId), destino.positionId, cmd.vehicleId, cmd),
        movements: [movement, ...state.movements],
      };
      next = {
        ...next,
        vehicles: replace(next.vehicles, cmd.vehicleId, {
          location: destino,
          locationObservedAt: cmd.at,
          lastMovementAt: cmd.at,
          lastCheckAt: cmd.at,
          lastCheckBy: userName(state, cmd.userId),
          status,
        }),
      };

      // Un traslado completado cierra su solicitud.
      if (changedSite) {
        const open = next.requests.find(
          (r) => r.vehicleId === cmd.vehicleId && r.type === 'traslado' && (r.status !== 'terminada' && r.status !== 'cancelada')
            && (r.to?.siteId ?? r.siteId) === destino.siteId
            && (!r.to?.zoneId || r.to.zoneId === destino.zoneId)
            && (!r.to?.positionId || r.to.positionId === destino.positionId)
        );
        if (open) {
          next = {
            ...next,
            requests: replace(next.requests, open.id, {
              status: 'terminada' as RequestStatus,
              // El traslado se cierra por el movimiento que deja el coche en
              // destino: esa es la hora de entrega y ese, quien lo entregó.
              deliveredAt: open.deliveredAt ?? cmd.at,
              deliveredBy: open.deliveredBy ?? cmd.userId,
              ...(cmd.delayReason && open.dueAt && cmd.at > open.dueAt
                ? { delayReason: cmd.delayReason, delayNote: cmd.delayNote?.trim() || null }
                : {}),
            }),
          };
          next = fireRules(next, 'traslado_completado', vehicle, {
            siteId: destino.siteId,
            body: `${vehicleTitle(vehicle)} ha llegado a ${siteName(next, destino.siteId)}.`,
          });
        }
      }

      if (changedSite) {
        next = fireRules(next, 'llegada_sede', vehicle, {
          siteId: destino.siteId,
          body: `${vehicleTitle(vehicle)} ha llegado a ${siteName(next, destino.siteId)}.`,
        });
      }

      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'movimiento',
        title: changedSite ? 'Traslado registrado' : 'Movimiento interno',
        detail: `${locationLabel(state, vehicle.location)} → ${locationLabel(state, destino)} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* -------------------------------------------------------- solicitudes */
    case 'request.create': {
      if (!vehicle) return state;
      if (yaCreado(state.requests, unico('req', cmd))) return state;
      // No se pide preparar en una sede que no prepara: la solicitud saldría
      // en una cola que nadie mira.
      if (cmd.requestType === 'preparacion' && !state.sites.find((x) => x.id === cmd.siteId)?.prepares) {
        return state;
      }
      if (!state.sites.some((x) => x.id === cmd.siteId)) return state;
      if (conflictoSolicitud(state, cmd)) return state;
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
        // Igual que en un movimiento: el destino tiene que existir. Si no,
        // el transportista abre el encargo y ve un sitio que no está.
        to: normalizarUbicacion(state, cmd.to),
        status: 'solicitada',
        urgent: cmd.urgent ?? false,
        createdAt: cmd.at,
        createdBy: cmd.userId,
        assignedTo: null,
        note: cmd.note,
        dueAt,
        keysReadyAt: null,
        keysReadyBy: null,
        pickedUpAt: null,
        deliveredAt: null,
        deliveredBy: null,
        carrierId: cmd.requestType === 'traslado' ? (cmd.carrierId ?? null) : null,
        prepTipo: cmd.requestType === 'preparacion' ? (cmd.prepTipo ?? 'entrada') : undefined,
      };
      const vehiclePatch: Partial<Vehicle> =
        cmd.requestType === 'traslado'
          ? { status: 'traslado_solicitado', targetSiteId: cmd.to?.siteId ?? cmd.siteId }
          : { targetSiteId: cmd.siteId };

      let next: AppState = {
        ...tocarVehiculo(state, cmd.vehicleId, vehiclePatch),
        requests: [request, ...state.requests],
      };

      // Los repasos no avisan de uno en uno: los pone el reloj en cuanto se
      // abre la app y una flota de renting entrega cuarenta coches el mismo
      // día. Cuarenta avisos a la vez es un aviso que nadie lee. El barrido
      // manda uno solo con la cuenta del día.
      if (cmd.requestType === 'preparacion' && (cmd.prepTipo ?? 'entrada') !== 'repaso') {
        // El preparador se entera al momento en vez de descubrirlo cuando
        // entra a mirar la cola: es el aviso que más tiempo ahorra, porque
        // el coche está parado desde que se pide.
        next = fireRules(next, 'preparacion_pedida', vehicle, {
          siteId: cmd.siteId,
          body: `${vehicleTitle(vehicle)}: preparación pedida en ${siteName(state, cmd.siteId)}${cmd.urgent ? ' · URGENTE' : ''}.`,
          tone: cmd.urgent ? 'warn' : 'info',
        });
      }

      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'solicitud',
        title:
          cmd.requestType === 'traslado'
            ? 'Traslado solicitado'
            : cmd.prepTipo === 'repaso'
              ? 'Repaso de entrega pedido'
              : 'Preparación solicitada',
        detail: `${siteName(state, cmd.siteId)} · ${userName(state, cmd.userId)}${cmd.urgent ? ' · URGENTE' : ''}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'request.cancel': {
      const r = state.requests.find((r) => r.id === cmd.requestId);
      const actor = state.users.find((u) => u.id === cmd.userId);
      if (!r || r.status === 'cancelada' || motivoCancelacion(state, actor, r) || !cmd.reason?.trim()) return state;
      if (cmd.at < r.createdAt || (r.pickedUpAt && cmd.at < r.pickedUpAt)) return state;
      const motivo = cmd.reason.trim();
      const datos = { cancelledAt: cmd.at, cancelledBy: cmd.userId, cancelReason: motivo };
      let next = { ...state, requests: replace(state.requests, r.id, { status: 'cancelada', ...datos }) };
      const preparaciones = r.type === 'preparacion' ? preparacionesDeSolicitud(state, r) : [];
      for (const p of preparaciones) {
        if (p.startedAt && cmd.at < p.startedAt) return state;
        next = { ...next, preparations: replace(next.preparations, p.id, {
          runState: 'cancelado', ...datos, runningSince: null, waitingSince: null,
          effectiveMs: p.effectiveMs + transcurrido(p.runningSince, cmd),
          waitingMs: p.waitingMs + transcurrido(p.waitingSince, cmd),
        }) };
      }
      const abiertos = next.requests.filter((x) => x.vehicleId === r.vehicleId && x.status !== 'terminada' && x.status !== 'cancelada');
      const prep = next.preparations.find((p) => p.vehicleId === r.vehicleId && p.runState !== 'terminado' && p.runState !== 'cancelado');
      const viaje = abiertos.find((x) => x.type === 'traslado');
      const coche = next.vehicles.find((v) => v.id === r.vehicleId);
      const terminada = next.preparations.find((p) => p.vehicleId === r.vehicleId && p.runState === 'terminado');
      if (coche) next = { ...next, vehicles: replace(next.vehicles, coche.id, {
        status: viaje ? (viaje.pickedUpAt ? 'en_traslado' : 'traslado_solicitado') : prep ? 'en_preparacion' :
          coche.status === 'entregado' ? 'entregado' : terminada && !preparaciones.some(p => p.startedAt) ? 'apto_entrega' : 'aparcado',
        targetSiteId: viaje?.to?.siteId ?? viaje?.siteId ?? prep?.siteId ?? abiertos[0]?.siteId ?? null,
      }) };
      const userIds = [...new Set([r.assignedTo, ...preparaciones.map(p => p.preparerId),
        ...state.users.filter(u => r.carrierId && u.carrierId === r.carrierId).map(u => u.id)].filter((id): id is string => !!id))];
      if (userIds.length) next = addInbox(next, { ruleId: null, tone: 'info', at: cmd.at, vehicleId: r.vehicleId, userIds,
        title: 'Solicitud cancelada', body: `${coche ? vehicleTitle(coche) : r.vehicleId}: ${motivo}` });
      return addEvent(next, { vehicleId: r.vehicleId, kind: 'solicitud', title: 'Solicitud cancelada',
        detail: `${r.id} · ${motivo} · ${userName(state, cmd.userId)}`, at: cmd.at, userId: cmd.userId });
    }

    case 'vehicle.setKeys': {
      if (!vehicle) return state;
      const patch: Partial<Vehicle> = {};
      const primaryAt = vehicle.primaryKeyUpdatedAt ?? (vehicle.primaryKeyLocation != null ? vehicle.keysUpdatedAt : null);
      const secondaryAt = vehicle.secondaryKeyUpdatedAt ?? (vehicle.secondaryKeyLocation != null ? vehicle.keysUpdatedAt : null);
      let primaryChanged = false;
      let secondaryChanged = false;

      if (cmd.primary !== undefined && (!primaryAt || cmd.at >= primaryAt)) {
        const value = cmd.primary?.trim() || null;
        if ((vehicle.primaryKeyLocation ?? null) !== value) {
          primaryChanged = true;
          patch.primaryKeyLocation = value;
          patch.primaryKeyUpdatedAt = cmd.at;
          patch.primaryKeyUpdatedBy = cmd.userId;
        }
      }
      if (cmd.secondary !== undefined && (!secondaryAt || cmd.at >= secondaryAt)) {
        const value = cmd.secondary?.trim() || null;
        if ((vehicle.secondaryKeyLocation ?? null) !== value) {
          secondaryChanged = true;
          patch.secondaryKeyLocation = value;
          patch.secondaryKeyUpdatedAt = cmd.at;
          patch.secondaryKeyUpdatedBy = cmd.userId;
        }
      }
      if (!primaryChanged && !secondaryChanged) return state;
      if (!vehicle.keysUpdatedAt || cmd.at >= vehicle.keysUpdatedAt) {
        patch.keysUpdatedAt = cmd.at;
        patch.keysUpdatedBy = cmd.userId;
      }
      const next = { ...state, vehicles: replace(state.vehicles, vehicle.id, patch) };
      return addEvent(next, { vehicleId: vehicle.id, kind: 'solicitud', title: 'Ubicación de llaves actualizada',
        detail: `${primaryChanged ? `Principal: ${patch.primaryKeyLocation ?? 'sin indicar'}. ` : ''}${secondaryChanged ? `Segunda: ${patch.secondaryKeyLocation ?? 'sin indicar'}. ` : ''}${userName(state, cmd.userId)}`,
        at: cmd.at, userId: cmd.userId });
    }

    case 'request.update': {
      const req = state.requests.find((r) => r.id === cmd.requestId);
      if (!req || req.status === 'cancelada' || cmd.status === 'cancelada') return state;
      if (req.status === 'terminada' && cmd.status !== 'terminada' &&
        conflictoSolicitud(state, { requestType: req.type, vehicleId: req.vehicleId, siteId: req.siteId, prepTipo: req.prepTipo })) return state;

      // Un comando que llega tarde no resucita un traslado ya entregado.
      //
      // Pasa así: el transportista marca «he recogido las llaves» en un
      // sótano sin cobertura, entrega el coche una hora después ya con
      // señal, y el primer comando sube al final. Si se aplicara, el coche
      // volvería a «los llevo yo», desaparecería del registro de entregados
      // y el transportista lo vería otra vez pendiente.
      //
      // Se compara con `cmd.at` y no con el reloj: reabrir hoy un traslado
      // que se cerró por error sigue funcionando, porque ese comando es
      // posterior a la entrega.
      if (req.deliveredAt && cmd.status !== 'terminada' && cmd.at < req.deliveredAt) {
        return state;
      }

      const origenSondika =
        req.from?.siteId === 'sondika' ||
        state.sites.find((site) => site.id === req.from?.siteId)?.name.trim().toLowerCase() === 'sondika';

      // Una asignación antigua no demuestra que las llaves estén listas. El
      // hecho queda fechado y firmado expresamente en la propia solicitud.
      // Tampoco se puede volver a la fase previa una vez recogidas.
      if (req.type === 'traslado' && req.pickedUpAt && cmd.status === 'asignada') return state;

      const preparaLlaves =
        req.type === 'traslado' && origenSondika && cmd.status === 'asignada' && !req.keysReadyAt && !req.pickedUpAt;

      // Esta regla vive también en la lógica compartida, no solo en permisos:
      // un cliente offline no debe poder ponerse «en ruta» localmente antes
      // de que Logística haya confirmado las llaves.
      if (req.type === 'traslado' && origenSondika && cmd.status === 'en_ruta' && !req.keysReadyAt && !req.pickedUpAt) {
        return state;
      }

      // Al recoger las llaves arranca el plazo del transportista.
      const recoge = req.type === 'traslado' && cmd.status === 'en_ruta' && !req.pickedUpAt;
      const patch: Partial<ServiceRequest> = {
        status: cmd.status,
        assignedTo: cmd.assignedTo !== undefined ? cmd.assignedTo : req.assignedTo,
        carrierId: cmd.carrierId !== undefined ? cmd.carrierId : req.carrierId,
      };
      if (preparaLlaves) {
        patch.keysReadyAt = cmd.at;
        patch.keysReadyBy = cmd.userId;
      }
      if (recoge) {
        patch.pickedUpAt = cmd.at;
        patch.dueAt = new Date(
          new Date(cmd.at).getTime() + state.config.transferDeadlineHours * 3_600_000
        ).toISOString();
      }
      // Reabrir un traslado borra la entrega: si vuelve a estar pendiente es
      // que no se entregó, o que hay que rehacerlo. Dejar la fecha puesta
      // metería en «Traslados hechos» un viaje que no está hecho, y ese
      // registro es lo que se le enseña a la empresa de transporte.
      if (req.deliveredAt && cmd.status !== 'terminada') {
        patch.deliveredAt = null;
        patch.deliveredBy = null;
        patch.delayReason = null;
        patch.delayNote = null;
      }

      // Cuándo se entregó y quién lo dio por entregado. Sin esto, un
      // traslado terminado no dice cuándo se hizo —solo que ya no está
      // pendiente— y sin fecha no hay registro que enseñar ni al
      // transportista ni a nadie.
      if (cmd.status === 'terminada' && !req.deliveredAt) {
        patch.deliveredAt = cmd.at;
        patch.deliveredBy = cmd.userId;
        // El motivo solo se guarda si de verdad llegó tarde: si no, sería
        // una explicación de algo que no pasó.
        if (cmd.delayReason && req.dueAt && cmd.at > req.dueAt) {
          patch.delayReason = cmd.delayReason;
          patch.delayNote = cmd.delayNote?.trim() || null;
        }
      }

      let next: AppState = { ...state, requests: replace(state.requests, cmd.requestId, patch) };
      if (recoge) {
        next = { ...next, vehicles: replace(next.vehicles, req.vehicleId, { status: 'en_traslado' }) };
      }
      return addEvent(next, {
        vehicleId: req.vehicleId,
        kind: 'solicitud',
        // La recogida de llaves es el hecho que arranca el plazo, así que
        // en la trazabilidad se nombra por lo que es y no por el estado.
        title: recoge
          ? `Llaves recogidas · empiezan ${state.config.transferDeadlineHours} h`
          : preparaLlaves
            ? 'Llaves preparadas'
            : `Solicitud ${REQUEST_STATUS_LABEL[cmd.status].toLowerCase()}`,
        detail: preparaLlaves
          ? `Leioa · Logística · ${userName(state, cmd.userId)}`
          : `${req.type === 'traslado' ? 'Traslado' : 'Preparación'} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* -------------------------------------------------------- preparación */
    case 'prep.create': {
      if (!vehicle) return state;
      if (yaCreado(state.preparations, unico('prep', cmd))) return state;
      const existing = state.preparations.find(
        (p) => p.vehicleId === cmd.vehicleId && (p.runState !== 'terminado' && p.runState !== 'cancelado')
      );
      if (existing) return state;
      // Sondika almacena, no prepara. Estaba escrito como regla de negocio
      // pero no puesto en el código: se podía abrir una preparación en la
      // campa, con su cronómetro corriendo, en una sede donde no hay nadie
      // que la haga. Qué sedes preparan se configura desde Administración.
      if (!state.sites.find((x) => x.id === cmd.siteId)?.prepares) return state;
      // El tipo viene del comando, y si no de lo que se pidió: el preparador
      // abre desde su cola lo que le han encargado, y un repaso abierto como
      // preparación de entrada se mediría contra dos horas.
      const pedidoAbierto = state.requests.find(
        (r) => r.type === 'preparacion' && r.vehicleId === cmd.vehicleId && (r.status !== 'terminada' && r.status !== 'cancelada')
          && r.siteId === cmd.siteId && (!cmd.tipo || (r.prepTipo ?? 'entrada') === cmd.tipo)
      );
      const tipo: TipoPreparacion = cmd.tipo ?? pedidoAbierto?.prepTipo ?? 'entrada';
      const target =
        tipo === 'repaso'
          ? (state.config.repasoTargetMinutes ?? 30) * 60_000
          : (state.config.prepTargetMinutes[vehicle.type] ?? 120) * 60_000;
      const prep: Preparation = {
        id: unico('prep', cmd),
        requestId: pedidoAbierto?.id ?? null,
        vehicleId: cmd.vehicleId,
        siteId: cmd.siteId,
        preparerId: cmd.preparerId ?? null,
        tipo,
        phase: 'pendiente',
        runState: 'pendiente',
        items: checklistFor(state, vehicle, tipo),
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
        ...tocarVehiculo(state, cmd.vehicleId, { status: 'en_preparacion', targetSiteId: cmd.siteId }),
        preparations: [prep, ...state.preparations],
      };

      // Si esto viene de una solicitud del comercial, esa solicitud pasa a
      // «en curso» y queda a nombre de quien la prepara. Antes había que
      // acordarse de cambiarla a mano y se quedaba en «solicitada» aunque
      // el coche ya estuviera en el taller.
      const pedido = next.requests.find(
        (r) => r.type === 'preparacion' && r.vehicleId === cmd.vehicleId && (r.status !== 'terminada' && r.status !== 'cancelada')
          && r.siteId === cmd.siteId && (r.prepTipo ?? 'entrada') === tipo
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
        title: tipo === 'repaso' ? 'Repaso de entrega abierto' : 'Preparación creada',
        detail: `${siteName(state, cmd.siteId)} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'prep.start':
    case 'prep.resume': {
      const p = state.preparations.find((x) => x.id === cmd.prepId);
      if (!p || (p.runState === 'terminado' || p.runState === 'cancelado')) return state;
      if (p.runState === 'en_curso') return state;
      if (p.waitingSince && cmd.at < p.waitingSince) return state;
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
      if (!p || (p.runState === 'terminado' || p.runState === 'cancelado')) return state;
      if (p.runningSince && cmd.at < p.runningSince) return state;
      if (p.waitingSince && cmd.at < p.waitingSince) return state;
      const ranMs = transcurrido(p.runningSince, cmd);
      let next: AppState = {
        ...state,
        preparations: replace(state.preparations, cmd.prepId, {
          runState: cmd.blocked ? 'bloqueado' : 'en_espera',
          effectiveMs: p.effectiveMs + ranMs,
          runningSince: null,
          // Cambiar el motivo no reinicia la espera que ya estaba corriendo.
          waitingSince: p.waitingSince ?? cmd.at,
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
      if (!p || (p.runState === 'terminado' || p.runState === 'cancelado')) return state;
      if (!['pendiente', 'completado', 'no_requerido'].includes(cmd.state)) return state;
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
      if (!p || (p.runState === 'terminado' || p.runState === 'cancelado')) return state;
      const finales = cmd.finalPhotos;
      if (!finales || [finales.frontLeft, finales.frontRight, finales.rearLeft, finales.rearRight].some((x) => !x?.trim())) {
        return state;
      }

      // Si el preparador declara un daño, la incidencia nace dentro del mismo
      // comando. Así no existe el estado «preparación terminada» sin que el
      // golpe que vio quede registrado.
      const descripcionDano = cmd.damageDescription?.trim() || null;
      const conIncidencia: AppState = descripcionDano
        ? applyCommand(state, {
            type: 'incident.create',
            id: `${cmd.id}-damage`,
            at: cmd.at,
            userId: cmd.userId,
            vehicleId: p.vehicleId,
            incidentType: 'preparacion',
            description: descripcionDano,
            photos: [finales.frontLeft, finales.frontRight, finales.rearLeft, finales.rearRight],
          })
        : state;

      // Si el preparador dice dónde deja el coche, el movimiento se registra
      // antes de cerrar: así la ficha no se queda diciendo que sigue en el
      // taller. Es el mismo comando de siempre, con un id derivado del de
      // esta orden para que un reintento no duplique el movimiento.
      const base: AppState = cmd.to
        ? applyCommand(conIncidencia, {
            type: 'movement.register',
            id: `${cmd.id}-mov`,
            at: cmd.at,
            userId: cmd.userId,
            vehicleId: p.vehicleId,
            to: cmd.to,
            note: 'Ubicación al terminar la preparación',
          })
        : conIncidencia;
      const ranMs = transcurrido(p.runningSince, cmd);
      const items = p.items.map((i) => {
        if (i.state !== 'pendiente') return i;
        return {
          ...i,
          state: 'completado' as CheckState,
          ...(i.requirementId === 'req-fotos' ? { by: userName(state, cmd.userId), at: cmd.at } : {}),
        };
      });
      let next: AppState = {
        ...base,
        preparations: replace(base.preparations, cmd.prepId, {
          runState: 'terminado',
          phase: 'apto_entrega',
          items,
          effectiveMs: p.effectiveMs + ranMs,
          waitingMs: p.waitingMs + transcurrido(p.waitingSince, cmd),
          runningSince: null,
          waitingSince: null,
          waitReason: null,
          // Nunca antes de haber empezado: un móvil con la hora mal puesta
          // registraría una preparación que dura menos de cero.
          finishedAt: p.startedAt && cmd.at < p.startedAt ? p.startedAt : cmd.at,
          finalPhotos: finales,
          damageIncidentId: descripcionDano ? `inc-${cmd.id}-damage` : null,
        }),
        vehicles: replace(base.vehicles, p.vehicleId, { status: 'apto_entrega' }),
      };
      const openReq = next.requests.find(
        (r) => r.vehicleId === p.vehicleId && r.type === 'preparacion' && (r.status !== 'terminada' && r.status !== 'cancelada')
          && r.siteId === p.siteId && (r.prepTipo ?? 'entrada') === (p.tipo ?? 'entrada')
      );
      if (openReq) next = { ...next, requests: replace(next.requests, openReq.id, { status: 'terminada' }) };

      const v = next.vehicles.find((x) => x.id === p.vehicleId) ?? null;
      next = fireRules(next, 'preparacion_terminada', v, {
        siteId: p.siteId,
        body: `${v ? vehicleTitle(v) : 'Vehículo'} ya está listo para entregar en ${siteName(state, p.siteId)}.`,
      });
      return addEvent(next, {
        vehicleId: p.vehicleId,
        kind: 'preparacion',
        title: p.tipo === 'repaso' ? 'Repaso de entrega terminado · apto entrega' : 'Preparación terminada · apto entrega',
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

      const mismaZona = v.location?.siteId === count.siteId && (!count.zoneId || v.location?.zoneId === count.zoneId);
      const expectedPos = mismaZona ? v.location?.positionId : undefined;
      const found = {
        vehicleId: cmd.vehicleId,
        at: cmd.at,
        by: cmd.userId,
        positionId: cmd.positionId ?? expectedPos,
        misplaced: !!cmd.positionId && !!expectedPos && cmd.positionId !== expectedPos,
      };
      if (observacionAtrasada(v, cmd)) {
        return anotarObservacionAntigua({ ...state,
          counts: replace(state.counts, count.id, { found: [...count.found, found] }),
        }, v.id, cmd, `Comprobado en recuento ${count.code}`);
      }
      // Igual que en la comprobación suelta: manda la plaza. Antes se
      // mezclaba la sede del recuento con la zona de la plaza y podía salir
      // una ubicación que no existe en ningún sitio.
      const location = ubicacionObservable(state, cmd.positionId
        ? (ubicacionDePlaza(state, cmd.positionId) ?? v.location)
        : mismaZona ? v.location : normalizarUbicacion(state, { siteId: count.siteId, zoneId: count.zoneId ?? undefined }), v.id, cmd);

      // El recuento es una observación física: si el coche está aquí, el que
      // teníamos apuntado en esta plaza ya no está.
      const base = liberarPlaza(
        tocarVehiculo(state, cmd.vehicleId, { location }),
        location?.positionId,
        cmd.vehicleId,
        cmd
      );
      let next: AppState = {
        ...base,
        counts: base.counts.map((c) => (c.id === cmd.countId ? { ...c, found: [...c.found, found] } : c)),
        vehicles: replace(base.vehicles, cmd.vehicleId, {
          lastCheckAt: cmd.at,
          lastCheckBy: userName(state, cmd.userId),
          location,
          locationObservedAt: cmd.at,
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
    case 'rule.setActive': {
      const rule = state.rules.find((r) => r.id === cmd.ruleId);
      if (!rule || rule.active === cmd.active) return state;
      return { ...state, rules: replace(state.rules, cmd.ruleId, { active: cmd.active }) };
    }
    case 'rule.delete':
      return { ...state, rules: state.rules.filter((r) => r.id !== cmd.ruleId) };

    case 'alerts.sweep': {
      const ahora = new Date(cmd.at).getTime();
      const dia = cmd.at.slice(0, 10);
      let next = state;

      // Coches que llevan demasiado sin que nadie confirme dónde están.
      const limiteComprobacion = state.config.staleCheckHours ?? 72;
      for (const v of state.vehicles) {
        if (!v.logisticActive) continue;
        const desde = v.lastCheckAt ?? v.receivedAt;
        if (!desde) continue;
        const horas = (ahora - new Date(desde).getTime()) / 3_600_000;
        if (horas < limiteComprobacion) continue;
        next = fireRules(next, 'sin_comprobar_72h', v, {
          siteId: v.location?.siteId ?? null,
          body: `${vehicleTitle(v)} lleva ${Math.floor(horas)} h sin que nadie confirme dónde está (${locationLabel(next, v.location, true)}).`,
          tone: 'warn',
          // Uno por coche y día: si no, cada barrido repetiría el mismo
          // aviso hasta que la bandeja no sirviera para nada.
          sufijo: `nev-stale-${v.id}-${dia}`,
        });
      }

      // Los repasos de entrega del día.
      //
      // Nace de las flotas de renting de Leioa: el coche se preparó entero
      // hace meses y lleva desde entonces en la azotea, y el día que se
      // entrega hay que repasarle la limpieza por dentro y por fuera.
      //
      // Lo pone el reloj y no una persona porque una entrega de flota son
      // cuarenta coches: pedirlos a mano de uno en uno no lo hace nadie. Y
      // se ponen el mismo día y no antes: cuarenta repasos en la cola del
      // preparador tres días antes es trabajo que todavía no puede hacer, y
      // una cola así deja de mirarse.
      const repasosPorSede = new Map<Id, number>();
      for (const v of next.vehicles) {
        if (!v.logisticActive || v.status !== 'apto_entrega' || !v.deliveryDate) continue;
        // Hoy, contado por el día del comando: un móvil sin cobertura puede
        // subir el barrido más tarde, y el día que valía era aquel.
        if (v.deliveryDate.slice(0, 10) !== dia) continue;
        // Donde está el coche, si ahí se prepara. Un coche que el día de la
        // entrega sigue en la campa de Sondika no tiene quien lo repase:
        // eso es un traslado que no se hizo, no un repaso que falta.
        const sede = v.location?.siteId;
        if (!sede || !next.sites.find((x) => x.id === sede)?.prepares) continue;
        // Ni encima de lo que ya está pedido o abierto.
        if (next.preparations.some((p) => p.vehicleId === v.id && (p.runState !== 'terminado' && p.runState !== 'cancelado'))) continue;
        if (next.requests.some((r) => r.status === 'cancelada' && r.vehicleId === v.id && r.prepTipo === 'repaso' && r.cancelledAt?.slice(0, 10) === dia)) continue;
        if (next.requests.some((r) => r.type === 'preparacion' && r.vehicleId === v.id && (r.status !== 'terminada' && r.status !== 'cancelada'))) {
          continue;
        }

        // El id sale del coche y del día, no del comando: cada barrido es un
        // comando distinto y, sin esto, abrir la app cuatro veces pondría
        // cuatro repasos del mismo coche.
        const antes = next.requests.length;
        next = applyCommand(next, {
          type: 'request.create',
          id: `repaso-${v.id}-${dia}`,
          at: cmd.at,
          userId: cmd.userId,
          requestType: 'preparacion',
          prepTipo: 'repaso',
          vehicleId: v.id,
          siteId: sede,
          to: null,
          note: 'Repaso de limpieza antes de entregar',
        });
        // Solo cuenta lo que de verdad se ha creado: aplicar el barrido dos
        // veces no puede acabar diciendo «hay 24 repasos» cuando son 12.
        if (next.requests.length > antes) {
          repasosPorSede.set(sede, (repasosPorSede.get(sede) ?? 0) + 1);
        }
      }

      // Un aviso por sede y día con la cuenta, en vez de uno por coche.
      for (const [sede, cuantos] of repasosPorSede) {
        next = fireRules(next, 'preparacion_pedida', null, {
          siteId: sede,
          body: `${siteName(next, sede)}: ${cuantos === 1 ? 'hay 1 repaso de entrega para hoy' : `hay ${cuantos} repasos de entrega para hoy`}.`,
          sufijo: `nev-repasos-${sede}-${dia}`,
        });
      }

      // Traslados encargados que nadie ha ido a recoger.
      const limiteRecogida = state.config.pickupAlertHours ?? 24;
      for (const r of state.requests) {
        if (r.type !== 'traslado' || r.status === 'terminada' || r.status === 'cancelada' || r.pickedUpAt) continue;
        const horas = (ahora - new Date(r.createdAt).getTime()) / 3_600_000;
        if (horas < limiteRecogida) continue;
        const v = state.vehicles.find((x) => x.id === r.vehicleId) ?? null;
        next = fireRules(next, 'traslado_sin_recoger', v, {
          siteId: r.siteId,
          body: `${v ? vehicleTitle(v) : r.vehicleId}: encargado hace ${Math.floor(horas)} h y todavía nadie ha recogido las llaves.`,
          tone: 'warn',
          sufijo: `nev-recogida-${r.id}-${dia}`,
        });
      }

      return next;
    }

    case 'inbox.read':
    case 'inbox.readAll': {
      const quien = state.users.find((u) => u.id === cmd.userId);
      if (!quien) return state;
      return {
        ...state,
        inbox: state.inbox.map((n) => {
          if (cmd.type === 'inbox.read' && n.id !== cmd.eventId) return n;
          if (!avisoPara(state, n, quien)) return n;
          // Los avisos antiguos ya leídos mantienen su estado. No se puede
          // deducir quién los leyó; las lecturas nuevas sí son individuales.
          if (n.readBy === undefined && n.read) return n;
          const anteriores = n.readBy ?? [];
          return anteriores.includes(quien.id) ? n : { ...n, readBy: [...anteriores, quien.id] };
        }),
      };
    }

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
        zoneId: cmd.zoneId !== undefined ? cmd.zoneId : ('zoneId' in base ? base.zoneId : null),
      };
      const lines = idx >= 0 ? rec.lines.map((l, i) => (i === idx ? line : l)) : [...rec.lines, line];

      let next: AppState = { ...state, receptions: replace(state.receptions, cmd.receptionId, { lines }) };

      // Al descargar y asignar plaza, el vehículo entra en campa.
      if (matched && line.unloaded && (line.positionId || line.zoneId)) {
        const coche = state.vehicles.find((v) => v.id === matched)!;
        if (observacionAtrasada(coche, cmd)) return anotarObservacionAntigua(next, matched, cmd, `Descarga del camión ${rec.truckPlate}`);
        // La plaza manda sobre la sede del albarán: si el operario descarga
        // en una plaza de otra campa, el coche está donde está la plaza.
        const donde = ubicacionObservable(state, normalizarUbicacion(state, { siteId: rec.siteId, zoneId: line.zoneId ?? undefined, positionId: line.positionId ?? undefined }), matched, cmd);
        next = liberarPlaza(activate(next, matched), donde?.positionId, matched, cmd);
        next = {
          ...next,
          vehicles: replace(next.vehicles, matched, {
            location: donde,
            locationObservedAt: cmd.at,
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
          detail: `Camión ${rec.truckPlate} · ${locationLabel(next, donde)}`,
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
      // Quitarle a una sede el «aquí se prepara» con preparaciones abiertas
      // dentro dejaría ese trabajo en tierra de nadie: se terminan primero.
      // Lo ya terminado se queda como está: es historia y fue verdad.
      const anterior = state.sites.find((x) => x.id === cmd.site.id);
      if (anterior?.prepares && !cmd.site.prepares) {
        const enMarcha =
          state.preparations.some((p) => p.siteId === cmd.site.id && (p.runState !== 'terminado' && p.runState !== 'cancelado')) ||
          state.requests.some(
            (r) => r.siteId === cmd.site.id && r.type === 'preparacion' && (r.status !== 'terminada' && r.status !== 'cancelada')
          );
        if (enMarcha) return state;
      }
      const exists = state.sites.some((x) => x.id === cmd.site.id);
      const sites = exists
        ? state.sites.map((x) => (x.id === cmd.site.id ? cmd.site : x))
        : [...state.sites, cmd.site];
      return { ...state, sites };
    }

    case 'site.delete': {
      // Nunca se borra una sede con vehículos dentro: se perdería el rastro.
      // Ni una que aparezca en el trabajo o en el histórico, aunque esté
      // vacía ahora mismo: había 14 traslados pedidos hacia Irun y borrarla
      // los dejaba apuntando a una sede que ya no existe —encargos a
      // ninguna parte, y pantallas que no saben qué nombre poner—.
      // Una sede solo se borra si se acaba de crear por error.
      const inUse =
        state.vehicles.some((v) => v.location?.siteId === cmd.siteId || v.targetSiteId === cmd.siteId) ||
        state.requests.some((r) => r.siteId === cmd.siteId || r.to?.siteId === cmd.siteId) ||
        state.preparations.some((p) => p.siteId === cmd.siteId) ||
        state.counts.some((x) => x.siteId === cmd.siteId) ||
        state.receptions.some((x) => x.siteId === cmd.siteId) ||
        state.movements.some((m) => m.to?.siteId === cmd.siteId || m.from?.siteId === cmd.siteId);
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
      const positionsSolicitadas = cmd.positions ?? cmd.zone.capacity;
      if (!Number.isInteger(positionsSolicitadas) || positionsSolicitadas < 0) return state;
      const current = state.positions.filter((p) => p.zoneId === cmd.zone.id);
      const occupied = new Set(
        state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as string[]
      );
      const occupiedCount = current.filter((p) => occupied.has(p.id)).length;
      if (positionsSolicitadas < occupiedCount) return state;

      const normalizedZone = { ...cmd.zone, capacity: positionsSolicitadas };
      const exists = state.zones.some((z) => z.id === cmd.zone.id);
      const zones = exists
        ? state.zones.map((z) => (z.id === cmd.zone.id ? normalizedZone : z))
        : [...state.zones, normalizedZone];
      let positions = [...state.positions];

      if (positionsSolicitadas > current.length) {
        for (let i = current.length; i < positionsSolicitadas; i++) {
          const n = String(i + 1).padStart(2, '0');
          positions.push({ id: `${cmd.zone.id}-p${n}`, zoneId: cmd.zone.id, code: `P${n}` });
        }
      } else if (positionsSolicitadas < current.length) {
        const removable = current
          .slice()
          .reverse()
          .filter((p) => !occupied.has(p.id))
          .slice(0, current.length - positionsSolicitadas)
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
      const zone = state.zones.find((z) => z.id === cmd.zoneId);
      if (!zone || !code) return state;
      if (state.positions.some((p) => p.zoneId === cmd.zoneId && p.code === code)) return state;
      const positions = [
        ...state.positions,
        { id: `${cmd.zoneId}-${code.toLowerCase()}`, zoneId: cmd.zoneId, code },
      ];
      const capacity = positions.filter((p) => p.zoneId === cmd.zoneId).length;
      return { ...state, positions, zones: replace(state.zones, zone.id, { capacity }) };
    }

    case 'position.delete': {
      const position = state.positions.find((p) => p.id === cmd.positionId);
      if (!position) return state;
      const occupied = state.vehicles.some((v) => v.location?.positionId === cmd.positionId);
      if (occupied) return state;
      const positions = state.positions.filter((p) => p.id !== cmd.positionId);
      const capacity = positions.filter((p) => p.zoneId === position.zoneId).length;
      return { ...state, positions, zones: replace(state.zones, position.zoneId, { capacity }) };
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
      // «Gente asignada» incluye a los dados de baja: su ficha guarda el rol,
      // y al volver a darles de alta se encontrarían con un rol que ya no
      // existe, sin permisos y con pantallas que no saben qué enseñarles.
      // Para borrarlo hay que cambiarles el rol antes, desde «Ver dados de
      // baja» en Administración.
      if (!role || role.builtin) return state;
      if (state.users.some((u) => u.role === cmd.roleId)) return state;
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
      return apuntarEnVehiculo(state, cmd.vehicleId, { custom });
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
        (r) => r.carrierId === cmd.carrierId && (r.status !== 'terminada' && r.status !== 'cancelada')
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
      let next: AppState = apuntarEnVehiculo(state, cmd.vehicleId, { deliveryDate: cmd.deliveryDate });

      // Si ya hay una preparación pedida, su plazo pasa a ser la entrega.
      const prepReqs = next.requests.filter(
        (r) => r.vehicleId === cmd.vehicleId && r.type === 'preparacion' && (r.status !== 'terminada' && r.status !== 'cancelada')
      );
      for (const prepReq of prepReqs) {
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

    case 'vehicle.deliver': {
      if (!vehicle) return state;
      if (observacionAtrasada(vehicle, cmd)) return anotarObservacionAntigua(state, vehicle.id, cmd, 'Entrega al cliente');
      // Repetirlo no vuelve a entregarlo ni duplica el apunte.
      if (vehicle.status === 'entregado' && !vehicle.logisticActive) return state;

      const desde = locationLabel(state, vehicle.location, true);

      // Se va con el cliente: deja de estar en ninguna de nuestras campas y
      // su plaza queda libre para el siguiente.
      let next: AppState = {
        ...state,
        vehicles: replace(state.vehicles, cmd.vehicleId, {
          status: 'entregado',
          logisticActive: false,
          location: null,
          locationObservedAt: cmd.at,
          targetSiteId: null,
          // Con `cmd.at`, no con la hora de ahora: el comercial que entrega
          // en el parking sin cobertura marca la entrega cuando ocurre, y
          // el comando puede subir dos horas después.
          deliveredAt: cmd.at,
          deliveredBy: cmd.userId,
        }),
      };

      // Un coche que se ha ido no puede tener trabajo pendiente: lo que
      // quede abierto se cierra aquí, o se queda en la cola de alguien
      // esperando a un coche que ya no está.
      const prepAbierta = next.preparations.find(
        (p) => p.vehicleId === cmd.vehicleId && (p.runState !== 'terminado' && p.runState !== 'cancelado')
      );
      if (prepAbierta) {
        next = {
          ...next,
          preparations: replace(next.preparations, prepAbierta.id, {
            runState: 'terminado',
            phase: 'apto_entrega',
            runningSince: null,
            waitingSince: null,
            waitReason: null,
            finishedAt: prepAbierta.finishedAt ?? cmd.at,
            effectiveMs: prepAbierta.effectiveMs + transcurrido(prepAbierta.runningSince, cmd),
          }),
        };
      }
      for (const r of next.requests) {
        if (r.vehicleId !== cmd.vehicleId || r.status === 'terminada' || r.status === 'cancelada') continue;
        next = { ...next, requests: replace(next.requests, r.id, { status: 'terminada' as RequestStatus }) };
      }

      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'estado',
        title: 'Entregado al cliente',
        detail: `Sale de la operativa desde ${desde} · ${userName(state, cmd.userId)}${cmd.note ? ` · ${cmd.note.trim()}` : ''}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    case 'vehicle.activate': {
      // Volver a la operativa un coche entregado por error: se le quita el
      // «Entregado», porque si no volvería a la flota con un estado que
      // dice que ya no está.
      if (vehicle?.status === 'entregado') {
        return addEvent(activate(state, cmd.vehicleId), {
          vehicleId: cmd.vehicleId,
          kind: 'estado',
          title: 'Vuelve a la operativa',
          detail: `Estaba entregado · ${userName(state, cmd.userId)}`,
          at: cmd.at,
          userId: cmd.userId,
        });
      }
      return activate(state, cmd.vehicleId);
    }

    /* ------------------------------------------- comercial del vehículo */
    case 'vehicle.setSalesRep': {
      if (!vehicle) return state;
      const nombre = cmd.salesRep?.trim() || null;
      const candidatos = nombre
        ? state.users.filter(
            (u) =>
              u.active &&
              u.role === 'comercial' &&
              (u.name.trim().toLowerCase() === nombre.toLowerCase() ||
                u.name.trim().toLowerCase().startsWith(`${nombre.toLowerCase()} `))
          )
        : [];
      const salesRepId =
        cmd.salesRepUserId !== undefined
          ? cmd.salesRepUserId
          : candidatos.length === 1
            ? candidatos[0].id
            : null;
      if (nombre === (vehicle.salesRep ?? null) && salesRepId === (vehicle.salesRepId ?? null)) return state;

      const next: AppState = apuntarEnVehiculo(state, cmd.vehicleId, { salesRep: nombre, salesRepId });

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

    /* ----------------------------------------- clasificación comercial */
    case 'vehicle.setCommercial': {
      if (!vehicle) return state;
      if (
        (vehicle.commercialArea ?? (vehicle.type === 'VO' ? 'vo' : 'vn')) === cmd.commercialArea &&
        (vehicle.commercialCategory ?? (vehicle.type === 'VO' ? 'VO' : 'VN')) === cmd.commercialCategory
      ) return state;

      const next = apuntarEnVehiculo(state, cmd.vehicleId, {
        commercialArea: cmd.commercialArea,
        commercialCategory: cmd.commercialCategory,
      });
      return addEvent(next, {
        vehicleId: cmd.vehicleId,
        kind: 'estado',
        title: 'Clasificación comercial actualizada',
        detail: `${cmd.commercialCategory} · stock ${cmd.commercialArea === 'vo' ? 'VO' : 'VN'} · ${userName(state, cmd.userId)}`,
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
        if (!existente.salesRepId && cmd.salesRepUserId) relleno.salesRepId = cmd.salesRepUserId;
        if (!existente.commercialArea && cmd.commercialArea) relleno.commercialArea = cmd.commercialArea;
        if (!existente.commercialCategory && cmd.commercialCategory) relleno.commercialCategory = cmd.commercialCategory;
        return { ...state, vehicles: replace(state.vehicles, existente.id, relleno) };
      }

      const donde = ubicacionObservable(state, normalizarUbicacion(state, cmd.location), id, cmd);

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
        commercialArea: cmd.commercialArea ?? (cmd.vehicleType === 'VO' ? 'vo' : 'vn'),
        commercialCategory: cmd.commercialCategory ?? (cmd.vehicleType === 'VO' ? 'VO' : 'VN'),
        salesRep: cmd.salesRep?.trim() || null,
        salesRepId: cmd.salesRepUserId ?? null,
        origin: cmd.origin?.trim() || 'Alta manual',
        logisticActive: true,
        location: donde,
        locationObservedAt: cmd.at,
        targetSiteId: null,
        status: donde ? 'aparcado' : 'recepcionado',
        lastCheckAt: cmd.at,
        lastCheckBy: userName(state, cmd.userId),
        lastMovementAt: null,
        receivedAt: cmd.at,
      };

      // Dar de alta un coche en una plaza es una observación física como
      // cualquier otra: se está delante y el coche está ahí. El que teníamos
      // apuntado en esa plaza se queda en la zona sin plaza confirmada.
      let next: AppState = liberarPlaza(state, donde?.positionId, vehicle.id, cmd);
      next = { ...next, vehicles: [vehicle, ...next.vehicles] };

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


export function preparacionesDeSolicitud(s: AppState, r: ServiceRequest) {
  return s.preparations.filter(p => p.runState !== 'terminado' && p.runState !== 'cancelado' &&
    (p.requestId ? p.requestId === r.id : p.vehicleId === r.vehicleId && p.siteId === r.siteId && (p.tipo ?? 'entrada') === (r.prepTipo ?? 'entrada')));
}

export function motivoCancelacion(s: AppState, u: User | null | undefined, r: ServiceRequest): string | null {
  if (!u?.active) return 'Usuario no autorizado.';
  const rol = s.config.roles.find(x => x.id === u.role);
  if (rol?.simple || u.carrierId) return 'El transportista puede comunicar una incidencia, no cancelar solicitudes.';
  if (r.status === 'terminada') return 'La solicitud ya ha terminado.';
  const gestiona = rol?.permissions.includes('solicitudes.gestionar') || rol?.permissions.includes('admin.configurar');
  if (gestiona) return u.siteIds.length && !u.siteIds.includes(r.siteId) ? 'Solicitud de otra sede.' : null;
  if (r.createdBy !== u.id) return 'Solo el creador o Logística pueden cancelar.';
  const iniciada = r.type === 'traslado' ? !!r.pickedUpAt || r.status === 'en_ruta' :
    preparacionesDeSolicitud(s, r).some(p => !!p.startedAt || !!p.runningSince || p.effectiveMs > 0);
  return iniciada ? 'El trabajo ya ha comenzado. Debe gestionarlo Logística.' : null;
}

export function conflictoSolicitud(s: AppState, c: Pick<Extract<Command, { type: 'request.create' }>, 'requestType' | 'vehicleId' | 'siteId' | 'prepTipo'>): string | null {
  const abiertas = s.requests.filter(r => r.vehicleId === c.vehicleId && r.status !== 'terminada' && r.status !== 'cancelada');
  if (c.requestType === 'traslado' && abiertas.some(r => r.type === 'traslado')) return 'Este vehículo ya tiene un traslado abierto. Cancélalo antes de pedir otro.';
  if (c.requestType === 'preparacion' && (abiertas.some(r => r.type === 'preparacion' && (r.prepTipo ?? 'entrada') === (c.prepTipo ?? 'entrada')) ||
    s.preparations.some(p => p.vehicleId === c.vehicleId && (p.tipo ?? 'entrada') === (c.prepTipo ?? 'entrada') && p.runState !== 'terminado' && p.runState !== 'cancelado'))) return 'Ya existe una solicitud o preparación equivalente abierta.';
  return null;
}
