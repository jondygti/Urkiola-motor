import type { AppState, Id, Preparation, ServiceRequest, User, Vehicle } from './types';
import { conflictoSolicitud, type Command, type CommandInput } from './commands';
import { comprobarPermiso } from './permisos';
import { comercialDelVehiculo, suggestCarrier } from './selectors';
import { siteName, vehicleRef } from './format';

/**
 * Acciones en bloque: la misma acción sobre muchos coches a la vez.
 *
 * Una acción en bloque **no es un comando nuevo**: son los comandos de
 * siempre, uno por coche, cada uno con su id, su apunte en el historial y
 * su comprobación de permisos en el servidor. Así es imposible hacer en
 * bloque lo que no se puede hacer coche a coche: si se pudiera, habría un
 * atajo para saltarse los permisos marcando una casilla más.
 *
 * Aquí se decide, antes de confirmar, qué coches admiten la acción y por
 * qué no los demás, con la misma regla que aplicará el servidor
 * (`comprobarPermiso`). Lo que no se puede se dice con nombre y motivo, y
 * se hace con el resto: pedir el traslado de doce coches no debe fallar
 * entero porque uno ya tenga el suyo.
 */

/** Un coche de la selección y lo que se haría con él. */
export interface FilaBloque {
  /** Lo que ve la persona: matrícula o bastidor. */
  etiqueta: string;
  /** El comando para este coche, o null si ya se sabe que no se puede. */
  comando: CommandInput | null;
  /** Por qué no se puede, cuando no se puede. */
  motivo?: string;
}

export interface ResultadoBloque {
  admitidos: { etiqueta: string; comando: CommandInput }[];
  rechazados: { etiqueta: string; motivo: string }[];
}

/**
 * Pasa cada fila por la comprobación de permisos del servidor. El comando
 * se completa con un id provisional solo para comprobarlo: al ejecutarlo,
 * `run` le pone el suyo, como a cualquier otro.
 */
export function comprobarBloque(state: AppState, user: User | null, filas: FilaBloque[], at = new Date().toISOString()): ResultadoBloque {
  const resultado: ResultadoBloque = { admitidos: [], rechazados: [] };
  for (const f of filas) {
    if (!f.comando) {
      resultado.rechazados.push({ etiqueta: f.etiqueta, motivo: f.motivo ?? 'No admite esta acción.' });
      continue;
    }
    const motivo = user
      ? comprobarPermiso(state, user, { ...f.comando, id: 'bloque-comprobacion', at, userId: user.id } as Command)
      : 'Sin sesión.';
    if (motivo) resultado.rechazados.push({ etiqueta: f.etiqueta, motivo });
    else resultado.admitidos.push({ etiqueta: f.etiqueta, comando: f.comando });
  }
  return resultado;
}

const etiquetaDe = (v: Vehicle | undefined, id: Id) => (v ? vehicleRef(v) : id);
const entregado = 'Está entregado al cliente.';

/* -------------------------------------------------------------- flota */

/** Pedir traslado o preparación para varios coches. */
export function filasPedirSolicitud(
  state: AppState,
  vehicles: Vehicle[],
  pedido: { requestType: 'traslado' | 'preparacion'; siteId: Id; urgent?: boolean }
): FilaBloque[] {
  return vehicles.map((v) => {
    const etiqueta = etiquetaDe(v, v.id);
    if (v.status === 'entregado') return { etiqueta, comando: null, motivo: entregado };
    if (pedido.requestType === 'traslado' && v.location?.siteId === pedido.siteId) {
      return { etiqueta, comando: null, motivo: `Ya está en ${siteName(state, pedido.siteId)}.` };
    }
    const prepTipo = pedido.requestType === 'preparacion' ? ('entrada' as const) : undefined;
    const conflicto = conflictoSolicitud(state, { requestType: pedido.requestType, vehicleId: v.id, siteId: pedido.siteId, prepTipo });
    if (conflicto) return { etiqueta, comando: null, motivo: conflicto };
    return {
      etiqueta,
      comando: {
        type: 'request.create',
        requestType: pedido.requestType,
        prepTipo,
        vehicleId: v.id,
        siteId: pedido.siteId,
        to: { siteId: pedido.siteId },
        urgent: !!pedido.urgent,
        // La empresa se propone para cada coche según su ruta, igual que al
        // pedirlo de uno en uno.
        carrierId:
          pedido.requestType === 'traslado' ? (suggestCarrier(state, v.location?.siteId, pedido.siteId)?.id ?? null) : undefined,
      },
    };
  });
}

/** Asignar el mismo comercial a varios coches. */
export function filasAsignarComercial(state: AppState, vehicles: Vehicle[], comercial: User): FilaBloque[] {
  return vehicles.map((v) => {
    const etiqueta = etiquetaDe(v, v.id);
    if (comercialDelVehiculo(state, v)?.id === comercial.id) {
      return { etiqueta, comando: null, motivo: `Ya lo lleva ${comercial.name}.` };
    }
    return {
      etiqueta,
      comando: { type: 'vehicle.setSalesRep', vehicleId: v.id, salesRep: comercial.name, salesRepUserId: comercial.id },
    };
  });
}

/* -------------------------------------------------------- solicitudes */

const cerrada = (r: ServiceRequest) =>
  r.status === 'cancelada' ? 'Ya está cancelada.' : r.status === 'terminada' ? 'Ya está terminada.' : null;

/** Cancelar varias solicitudes con el mismo motivo. */
export function filasCancelar(state: AppState, requests: ServiceRequest[], reason: string): FilaBloque[] {
  return requests.map((r) => {
    const etiqueta = etiquetaDe(state.vehicles.find((v) => v.id === r.vehicleId), r.vehicleId);
    const motivo = cerrada(r);
    if (motivo) return { etiqueta, comando: null, motivo };
    return { etiqueta, comando: { type: 'request.cancel', requestId: r.id, reason } };
  });
}

/**
 * Marcar como preparadas las llaves de varios traslados. Solo tiene
 * sentido en los que salen de Sondika y aún no las tienen: en los demás el
 * transportista no espera a nadie.
 */
export function filasLlavesPreparadas(state: AppState, requests: ServiceRequest[]): FilaBloque[] {
  return requests.map((r) => {
    const etiqueta = etiquetaDe(state.vehicles.find((v) => v.id === r.vehicleId), r.vehicleId);
    const motivo = cerrada(r);
    if (motivo) return { etiqueta, comando: null, motivo };
    if (r.type !== 'traslado') return { etiqueta, comando: null, motivo: 'Es una preparación, no un traslado.' };
    if (!esDesdeSondika(state, r)) return { etiqueta, comando: null, motivo: 'No sale de Sondika: no espera llaves.' };
    if (r.keysReadyAt || r.pickedUpAt) return { etiqueta, comando: null, motivo: 'Las llaves ya estaban preparadas.' };
    return {
      etiqueta,
      comando: { type: 'request.update', requestId: r.id, status: 'asignada', assignedTo: r.assignedTo, carrierId: r.carrierId },
    };
  });
}

function esDesdeSondika(state: AppState, r: ServiceRequest): boolean {
  const origen = r.from?.siteId;
  if (!origen) return false;
  return origen === 'sondika' || state.sites.find((s) => s.id === origen)?.name.trim().toLowerCase() === 'sondika';
}

/* -------------------------------------------------------- preparación */

/**
 * Pasar varias preparaciones a otro preparador. Se hace sobre su
 * solicitud, igual que desde «Solicitudes»: el tiempo ya trabajado se queda
 * con quien lo trabajó (regla 28), porque lo reparte el mismo comando.
 */
export function filasAsignarPreparador(state: AppState, preps: Preparation[], preparador: User): FilaBloque[] {
  return preps.map((p) => {
    const etiqueta = etiquetaDe(state.vehicles.find((v) => v.id === p.vehicleId), p.vehicleId);
    if (p.runState === 'terminado' || p.runState === 'cancelado') {
      return { etiqueta, comando: null, motivo: 'Ya está cerrada.' };
    }
    if (p.preparerId === preparador.id) return { etiqueta, comando: null, motivo: `Ya la tiene ${preparador.name}.` };
    if (preparador.siteIds.length && !preparador.siteIds.includes(p.siteId)) {
      return { etiqueta, comando: null, motivo: `${preparador.name} no trabaja en ${siteName(state, p.siteId)}.` };
    }
    const r = p.requestId ? state.requests.find((x) => x.id === p.requestId) : undefined;
    if (!r) return { etiqueta, comando: null, motivo: 'Se abrió sin solicitud: se reasigna desde su ficha.' };
    const motivo = cerrada(r);
    if (motivo) return { etiqueta, comando: null, motivo };
    return {
      etiqueta,
      comando: { type: 'request.update', requestId: r.id, status: r.status, assignedTo: preparador.id, carrierId: r.carrierId },
    };
  });
}

/** Cancelar las solicitudes de varias preparaciones. */
export function filasCancelarPreparaciones(state: AppState, preps: Preparation[], reason: string): FilaBloque[] {
  return preps.map((p) => {
    const etiqueta = etiquetaDe(state.vehicles.find((v) => v.id === p.vehicleId), p.vehicleId);
    const r = p.requestId ? state.requests.find((x) => x.id === p.requestId) : undefined;
    if (!r) return { etiqueta, comando: null, motivo: 'Se abrió sin solicitud: no hay nada que cancelar.' };
    const motivo = cerrada(r);
    if (motivo) return { etiqueta, comando: null, motivo };
    return { etiqueta, comando: { type: 'request.cancel', requestId: r.id, reason } };
  });
}
