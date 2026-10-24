/**
 * Tiempos estándar de cada tarea.
 *
 * Va en un fichero aparte, sin depender de nada más que de los tipos, porque
 * lo usan a la vez la semilla, los comandos (que copian el estándar al abrir
 * una preparación) y el cálculo de ocupación. Si viviera en `seed.ts`, los
 * comandos tendrían que importar la semilla entera para leer una tabla.
 */
import type { AdminConfig, Id, Preparation, TareaPreparacion, TiempoEstandar, TipoPreparacion, Vehicle } from './types';
import { TAREAS_DE_TIPO } from './types';

/** La sede de Ford/Mazda en Galdakao, del grupo Easo. Se gestiona como Bizkaia. */
export const SEDE_FORD_MAZDA = 'ford-mazda';

/**
 * Los de serie. Se cambian en Administración → Tiempos estándar.
 *
 * El repaso VO no es el repaso de entrega de las flotas, pero cuesta lo
 * mismo: media hora. Va como tarea propia para poder separarlos en los
 * números aunque hoy tengan el mismo tiempo.
 */
export const TIEMPOS_ESTANDAR: TiempoEstandar[] = [
  { tarea: 'vn', siteId: null, minutos: 120 },
  { tarea: 'flota', siteId: null, minutos: 120 },
  { tarea: 'flota', siteId: 'leioa', minutos: 90 },
  { tarea: 'flota', siteId: SEDE_FORD_MAZDA, minutos: 120 },
  { tarea: 'vo_fondo', siteId: null, minutos: 240 },
  { tarea: 'vo_repaso', siteId: null, minutos: 30 },
  { tarea: 'repaso_entrega', siteId: null, minutos: 30 },
  { tarea: 'carroceria', siteId: null, minutos: 45 },
];

export const tablaDeTiempos = (config: AdminConfig): TiempoEstandar[] =>
  config.tiemposEstandar ?? TIEMPOS_ESTANDAR;

/**
 * Minutos estándar de una tarea en una sede: el de la sede si lo tiene, y si
 * no el general. Si alguien borra el general de la tabla, el de serie: una
 * preparación sin objetivo pintaría el cronómetro siempre en rojo.
 */
export function minutosEstandar(tabla: TiempoEstandar[], tarea: TareaPreparacion, siteId: Id | null): number {
  const propio = siteId ? tabla.find((t) => t.tarea === tarea && t.siteId === siteId) : undefined;
  const general = tabla.find((t) => t.tarea === tarea && t.siteId === null);
  const deSerie = TIEMPOS_ESTANDAR.find((t) => t.tarea === tarea && t.siteId === null);
  return (propio ?? general ?? deSerie)?.minutos ?? 120;
}

/**
 * ¿Es un coche de flota? Las flotas de renting llegan con ese origen desde
 * Quiter, o con «Renting» en algún campo propio (la forma de pago).
 */
export function esDeFlota(v: Vehicle | null | undefined): boolean {
  if (!v) return false;
  if (/renting|flota/i.test(v.origin ?? '')) return true;
  return Object.values(v.custom ?? {}).some((x) => /renting/i.test(x));
}

/**
 * La tarea que le toca a un coche si nadie dice otra cosa: un VO se prepara
 * a fondo, un coche de renting es flota y lo demás es VN. En un repaso, el
 * de VO o el de entrega.
 */
export function tareaPorDefecto(v: Vehicle | null | undefined, tipo: TipoPreparacion): TareaPreparacion {
  if (tipo === 'repaso') return v?.type === 'VO' ? 'vo_repaso' : 'repaso_entrega';
  if (v?.type === 'VO') return 'vo_fondo';
  return esDeFlota(v) ? 'flota' : 'vn';
}

/** Una tarea de repaso no cabe en una preparación entera, ni al revés. */
export function tareaCompatible(tipo: TipoPreparacion, tarea: TareaPreparacion): boolean {
  return TAREAS_DE_TIPO[tipo].includes(tarea);
}

/** La tarea de una preparación, también de las guardadas antes de existir. */
export function tareaDePreparacion(p: Preparation, v: Vehicle | null | undefined): TareaPreparacion {
  return p.tarea ?? tareaPorDefecto(v, p.tipo ?? 'entrada');
}
