/**
 * La orden de trabajo de Quiter de cada preparación.
 *
 * Quiter no deja que otra aplicación abra órdenes (su acceso es de solo
 * lectura), así que la abre Jon a mano. Lo que hace la app es dejársela
 * escrita: qué coche, en qué sede y qué líneas lleva —la limpieza y la
 * preentrega siempre, en la misma orden, y los accesorios que haya pedido
 * quien encargó la preparación—, para copiarla en Quiter, y guardar el
 * número de orden cuando está abierta. Los repasos no llevan orden.
 *
 * Funciones puras, como el resto de `src/data`.
 */
import type { AppState, ChecklistItem, Id, Requirement, ServiceRequest, Vehicle, VehicleType } from './types';

/**
 * Los accesorios de serie. Los estados guardados antes de existir la marca
 * `accesorio` no la traen: sin esto, sus solicitudes no tendrían ninguno.
 */
const ACCESORIOS_DE_SERIE = ['req-alfombrillas', 'req-matriculas', 'req-baliza', 'req-kit'];

export const esAccesorio = (r: Requirement) => r.accesorio ?? ACCESORIOS_DE_SERIE.includes(r.id);

/** Lo que va siempre en la orden, con o sin accesorios. */
export const LINEA_FIJA = 'Limpieza y preentrega';

/** Los accesorios que se le pueden pedir a un coche de este tipo. */
export function accesoriosPara(s: AppState, tipo: VehicleType): Requirement[] {
  return s.config.requirements
    .filter(esAccesorio)
    .filter((r) => r.vehicleTypes.length === 0 || r.vehicleTypes.includes(tipo))
    .filter((r) => !r.tipos || r.tipos.length === 0 || r.tipos.includes('entrada'))
    .sort((a, b) => a.order - b.order);
}

/**
 * Lo que se marca de entrada al pedir la preparación: todo, menos las
 * matrículas si el coche ya las tiene. Quien pide desmarca lo que no haga
 * falta; no siempre necesita todo.
 */
export function accesoriosPorDefecto(s: AppState, v: Vehicle): Id[] {
  return accesoriosPara(s, v.type)
    .filter((r) => !(v.plate && r.id === 'req-matriculas'))
    .map((r) => r.id);
}

/** Los accesorios de una solicitud. Sin lista (solicitudes de antes), todos. */
export function accesoriosDeSolicitud(s: AppState, r: ServiceRequest): Requirement[] {
  const v = s.vehicles.find((x) => x.id === r.vehicleId);
  const posibles = accesoriosPara(s, v?.type ?? 'VN');
  return r.accesorios ? posibles.filter((x) => r.accesorios!.includes(x.id)) : posibles;
}

/** ¿Esta solicitud lleva orden de trabajo? Las preparaciones sí; los repasos no. */
export const llevaOrden = (r: ServiceRequest) => r.type === 'preparacion' && (r.prepTipo ?? 'entrada') === 'entrada';

/** Las líneas de la orden, como se escriben en Quiter. */
export function lineasOrden(s: AppState, r: ServiceRequest): string[] {
  return [LINEA_FIJA, ...accesoriosDeSolicitud(s, r).map((x) => x.label)];
}

/** La orden escrita entera, para copiarla y pegarla en Quiter. */
export function textoOrden(s: AppState, r: ServiceRequest): string {
  const v = s.vehicles.find((x) => x.id === r.vehicleId);
  const sede = s.sites.find((x) => x.id === r.siteId)?.name ?? r.siteId;
  const cabecera = [`Preparación · ${sede}`, v ? `${v.brand} ${v.model}` : r.vehicleId];
  if (v) cabecera.push(v.vin ? `Bastidor: ${v.vin}` : `VIN-8: ${v.vin8}`);
  cabecera.push(v?.plate ? `Matrícula: ${v.plate}` : 'Sin matrícula');
  return [...cabecera, '', ...lineasOrden(s, r).map((l) => `- ${l}`)].join('\n');
}

/** Las preparaciones pedidas que todavía no tienen su orden abierta en Quiter. */
export function ordenesPorAbrir(s: AppState): ServiceRequest[] {
  return s.requests
    .filter((r) => llevaOrden(r) && r.status !== 'terminada' && r.status !== 'cancelada' && !r.ordenTrabajo)
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * La lista de la preparación con los accesorios que no se han pedido como
 * «no requerido». Lo ya hecho no se toca: si el preparador puso la baliza y
 * luego alguien la quita de la orden, la baliza sigue puesta.
 */
export function aplicarAccesorios(
  items: ChecklistItem[],
  requirements: Requirement[],
  pedidos: Id[] | undefined
): ChecklistItem[] {
  if (!pedidos) return items;
  return items.map((i) => {
    const req = requirements.find((r) => r.id === i.requirementId);
    if (!req || !esAccesorio(req) || i.state === 'completado') return i;
    return { ...i, state: pedidos.includes(i.requirementId) ? 'pendiente' : 'no_requerido' };
  });
}
