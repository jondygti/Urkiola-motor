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
} from './types';
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
  | { type: 'vehicle.activate'; id: Id; at: string; userId: Id; vehicleId: Id };

/** Metadatos que añade el store automáticamente. */
export type CommandMeta = { id: Id; at: string; userId: Id };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Comando tal y como lo escriben las pantallas: sin id, fecha ni usuario. */
export type CommandInput = DistributiveOmit<Command, keyof CommandMeta> & Partial<CommandMeta>;

/* ------------------------------------------------------------ utilidades */

let counter = 0;
export function newId(prefix = 'c'): Id {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function replace<T extends { id: Id }>(list: T[], id: Id, patch: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function addEvent(state: AppState, ev: Omit<TraceEvent, 'id'>): AppState {
  const event: TraceEvent = { id: newId('ev'), ...ev };
  return { ...state, events: [event, ...state.events].slice(0, 4000) };
}

function addInbox(state: AppState, ev: Omit<NotificationEvent, 'id' | 'read'>): AppState {
  const item: NotificationEvent = { id: newId('nev'), read: false, ...ev };
  return { ...state, inbox: [item, ...state.inbox].slice(0, 500) };
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
      at: new Date().toISOString(),
      tone: ctx.tone ?? 'info',
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
      const movement: Movement = {
        id: newId('mov'),
        vehicleId: cmd.vehicleId,
        from: vehicle.location,
        to: cmd.to,
        userId: cmd.userId,
        at: cmd.at,
        status: 'completado',
        note: cmd.note,
      };
      const changedSite = vehicle.location?.siteId !== cmd.to.siteId;
      const arrivedAtTarget = vehicle.targetSiteId === cmd.to.siteId;

      let status: Vehicle['status'] = vehicle.status;
      if (changedSite) status = arrivedAtTarget ? 'en_campa' : 'en_campa';
      if (vehicle.status === 'traslado_solicitado' && changedSite) status = 'en_campa';

      let next: AppState = {
        ...activate(state, cmd.vehicleId),
        movements: [movement, ...state.movements],
        vehicles: replace(state.vehicles, cmd.vehicleId, {
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
        id: newId('req'),
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
        title: `Solicitud ${cmd.status}`,
        detail: `${req.type === 'traslado' ? 'Traslado' : 'Preparación'} · ${userName(state, cmd.userId)}`,
        at: cmd.at,
        userId: cmd.userId,
      });
    }

    /* -------------------------------------------------------- preparación */
    case 'prep.create': {
      if (!vehicle) return state;
      const existing = state.preparations.find(
        (p) => p.vehicleId === cmd.vehicleId && p.runState !== 'terminado'
      );
      if (existing) return state;
      const target = (state.config.prepTargetMinutes[vehicle.type] ?? 120) * 60_000;
      const prep: Preparation = {
        id: newId('prep'),
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
      const next: AppState = {
        ...activate(state, cmd.vehicleId),
        preparations: [prep, ...state.preparations],
        vehicles: replace(state.vehicles, cmd.vehicleId, { status: 'en_preparacion', targetSiteId: cmd.siteId }),
      };
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
      const waitedMs = p.waitingSince ? Date.now() - new Date(p.waitingSince).getTime() : 0;
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
      const ranMs = p.runningSince ? Date.now() - new Date(p.runningSince).getTime() : 0;
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
      const ranMs = p.runningSince ? Date.now() - new Date(p.runningSince).getTime() : 0;
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
      const expected = state.vehicles
        .filter((v) =>
          cmd.zoneId ? v.location?.zoneId === cmd.zoneId : v.location?.siteId === cmd.siteId
        )
        .map((v) => v.id);
      const count: FleetCount = {
        id: newId('count'),
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

      let next: AppState = {
        ...activate(state, cmd.vehicleId),
        counts: state.counts.map((c) => (c.id === cmd.countId ? { ...c, found: [...c.found, found] } : c)),
        vehicles: replace(state.vehicles, cmd.vehicleId, {
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
      const incident: Incident = {
        id: newId('inc'),
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
      const rule: NotificationRule = { id: newId('rule'), createdAt: cmd.at, ...cmd.rule };
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
      const reception: Reception = {
        id: newId('rec'),
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
        next = {
          ...activate(next, matched),
          vehicles: replace(next.vehicles, matched, {
            location: { siteId: rec.siteId, zoneId, positionId: line.positionId },
            status: 'en_campa',
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
