/**
 * Ocupación de los preparadores: horas de preparación ÷ horas de presencia,
 * por preparador, por sede y por mes.
 *
 * Funciones puras, como el resto de `src/data`: las usa el panel y las usa
 * el reloj de avisos (`alerts.sweep`), que tiene que llegar a la misma cifra
 * que enseña la pantalla.
 *
 * Decisiones que salen de hablarlo con Jon (octubre de 2026):
 * - Las horas de preparación son el **tiempo trabajado, sin pausas**, no fin
 *   menos inicio: un coche empezado a las 18:00 y terminado a las 9:00 del
 *   día siguiente no son quince horas de trabajo.
 * - Si el cronómetro marca 0 (terminó sin haberlo empezado) se cuenta el
 *   tiempo estándar de la tarea. Si pasa de tres veces el estándar se
 *   cuenta lo que marca, pero se señala para revisar: casi siempre es alguien
 *   que se olvidó de pulsar «Terminar».
 * - Un trabajo cuenta en el mes en el que se termina.
 * - Presencia: de lunes a viernes, menos festivos de la sede y ausencias, por
 *   la jornada y por el % de esa sede.
 */
import { diaEnEspana } from './delivery-date';
import { can, tiempoDePreparador } from './selectors';
import type { AppState, Ausencia, FichaLaboral, Festivo, Id, Site, User } from './types';

/** 7 h 40 min. */
export const JORNADA_MINUTOS = 460;

/** Por encima, ámbar; entre esto y `OCUPACION_BAJA`, verde; por debajo, gris. */
export const OCUPACION_ALTA = 80;
export const OCUPACION_BAJA = 70;

/** Un trabajo que marca más de esto por su estándar se señala para revisar. */
export const VECES_ESTANDAR_REVISAR = 3;

export type EstadoOcupacion = 'verde' | 'ambar' | 'gris' | 'sin_datos';

export interface OcupacionPreparador {
  userId: Id;
  nombre: string;
  /** Horas de preparación, en milisegundos. */
  trabajadoMs: number;
  presenciaMs: number;
  /** Porcentaje redondeado; null sin presencia en esta sede. */
  pct: number | null;
  /** Sin ficha laboral: la presencia sale de la jornada y sedes de serie. */
  sinFicha: boolean;
}

export interface OcupacionSede {
  site: Site;
  mes: string;
  trabajadoMs: number;
  presenciaMs: number;
  pct: number | null;
  estado: EstadoOcupacion;
  /** Trabajos contados con el tiempo estándar porque no se usó el cronómetro. */
  conEstandar: number;
  /** Trabajos que marcan más de tres veces su estándar. */
  revisar: number;
  /** Trabajos terminados que cuentan este mes. */
  trabajos: number;
  preparadores: OcupacionPreparador[];
}

/** El estado del indicador. Se clasifica el número que se enseña, ya redondeado. */
export function estadoOcupacion(pct: number | null): EstadoOcupacion {
  if (pct === null) return 'sin_datos';
  if (pct > OCUPACION_ALTA) return 'ambar';
  if (pct >= OCUPACION_BAJA) return 'verde';
  return 'gris';
}

/** AAAA-MM del mes anterior. */
export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Los días del mes, AAAA-MM-DD, hasta `hasta` incluido si se da. */
function diasDelMes(mes: string, hasta?: string): string[] {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dias: string[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const dia = `${mes}-${String(d).padStart(2, '0')}`;
    if (hasta && dia > hasta) break;
    dias.push(dia);
  }
  return dias;
}

/** De lunes a viernes. El día es una fecha, no un instante: se mira en UTC a mediodía. */
function esLaborable(dia: string): boolean {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return semana >= 1 && semana <= 5;
}

/** La ficha que vale ese día: la última que empieza antes o ese mismo día. */
export function fichaVigente(fichas: FichaLaboral[], userId: Id, dia: string): FichaLaboral | null {
  let mejor: FichaLaboral | null = null;
  for (const f of fichas) {
    if (f.userId !== userId || f.desde > dia) continue;
    if (!mejor || f.desde > mejor.desde) mejor = f;
  }
  return mejor;
}

/**
 * Sin ficha, lo de serie: la jornada de siempre repartida a partes iguales
 * entre las sedes que tiene asignadas y que preparan. Así el indicador dice
 * algo desde el primer día, y la pantalla avisa de que falta la ficha.
 */
export function fichaDeSerie(s: AppState, u: User): FichaLaboral | null {
  const sedes = u.siteIds.filter((id) => s.sites.find((x) => x.id === id)?.prepares);
  if (sedes.length === 0) return null;
  const pct = 100 / sedes.length;
  return {
    id: `serie-${u.id}`,
    userId: u.id,
    desde: '0000-01-01',
    jornadaMinutos: JORNADA_MINUTOS,
    reparto: sedes.map((siteId) => ({ siteId, pct })),
  };
}

const ausente = (ausencias: Ausencia[], userId: Id, dia: string) =>
  ausencias.some((a) => a.userId === userId && a.desde <= dia && dia <= a.hasta);

const festivoEn = (festivos: Festivo[], siteId: Id, dia: string) =>
  festivos.some((f) => f.fecha === dia && (f.siteId === null || f.siteId === siteId));

/** Quién cuenta como preparador: quien prepara de oficio, o quien tiene ficha. */
export function preparadores(s: AppState): User[] {
  const conFicha = new Set((s.fichasLaborales ?? []).map((f) => f.userId));
  return s.users.filter((u) => conFicha.has(u.id) || (u.active && can(s, u, 'preparacion.ejecutar')));
}

/**
 * Ocupación de un mes, por sede y preparador.
 *
 * `hasta` (AAAA-MM-DD) corta la presencia en ese día: el mes en curso se
 * mide contra lo que va de mes, no contra el mes entero, o el día 5 todas
 * las sedes saldrían en gris.
 */
export function ocupacionDelMes(s: AppState, mes: string, hasta?: string): OcupacionSede[] {
  const fichas = s.fichasLaborales ?? [];
  const ausencias = s.ausencias ?? [];
  const festivos = s.config.festivos ?? [];
  const sedes = s.sites.filter((x) => x.prepares);

  // sede → persona → milisegundos
  const trabajado = new Map<Id, Map<Id, number>>();
  const presencia = new Map<Id, Map<Id, number>>();
  const cuenta = new Map<Id, { trabajos: number; conEstandar: number; revisar: number }>();
  const sumar = (mapa: Map<Id, Map<Id, number>>, sede: Id, persona: Id, ms: number) => {
    if (ms <= 0) return;
    const fila = mapa.get(sede) ?? new Map<Id, number>();
    fila.set(persona, (fila.get(persona) ?? 0) + ms);
    mapa.set(sede, fila);
  };
  const contar = (sede: Id, estandar: boolean, revisar: boolean) => {
    const c = cuenta.get(sede) ?? { trabajos: 0, conEstandar: 0, revisar: 0 };
    c.trabajos += 1;
    if (estandar) c.conEstandar += 1;
    if (revisar) c.revisar += 1;
    cuenta.set(sede, c);
  };
  const delMes = (fin: string | null) => {
    if (!fin) return false;
    const dia = diaEnEspana(fin);
    return dia.slice(0, 7) === mes && (!hasta || dia <= hasta);
  };

  for (const p of s.preparations) {
    if (p.runState !== 'terminado' || !delMes(p.finishedAt)) continue;
    const sinCronometro = p.effectiveMs <= 0;
    contar(p.siteId, sinCronometro, p.effectiveMs > VECES_ESTANDAR_REVISAR * p.targetMs);
    if (sinCronometro) {
      // El estándar es de quien la cerró: es quien dice que la hizo.
      sumar(trabajado, p.siteId, p.preparerId ?? '', p.targetMs);
      continue;
    }
    // Cada uno lo que trabajó, aunque la cerrara otro (regla 28).
    const personas = new Set<Id | null>([p.preparerId,
      ...Object.keys(p.tiempoAnterior ?? {}).map((k) => (k === '' ? null : k))]);
    for (const persona of personas) {
      sumar(trabajado, p.siteId, persona ?? '', tiempoDePreparador(p, persona).efectivoMs);
    }
  }

  for (const t of s.trabajosSueltos ?? []) {
    if (t.runState !== 'terminado' || !delMes(t.finishedAt)) continue;
    const sinCronometro = t.effectiveMs <= 0;
    contar(t.siteId, sinCronometro, t.effectiveMs > VECES_ESTANDAR_REVISAR * t.targetMs);
    sumar(trabajado, t.siteId, t.preparerId, sinCronometro ? t.targetMs : t.effectiveMs);
  }

  const sinFicha = new Set<Id>();
  const dias = diasDelMes(mes, hasta).filter(esLaborable);
  for (const u of preparadores(s)) {
    for (const dia of dias) {
      let ficha = fichaVigente(fichas, u.id, dia);
      if (!ficha) {
        ficha = fichaDeSerie(s, u);
        if (!ficha) continue;
        sinFicha.add(u.id);
      }
      if (ausente(ausencias, u.id, dia)) continue;
      for (const r of ficha.reparto) {
        if (festivoEn(festivos, r.siteId, dia)) continue;
        sumar(presencia, r.siteId, u.id, (ficha.jornadaMinutos * 60_000 * r.pct) / 100);
      }
    }
  }

  const nombre = (id: Id) => (id ? s.users.find((u) => u.id === id)?.name ?? id : 'Sin asignar');
  const porcentaje = (t: number, p: number) => (p > 0 ? Math.round((t / p) * 100) : null);

  return sedes.map((site) => {
    const t = trabajado.get(site.id) ?? new Map<Id, number>();
    const p = presencia.get(site.id) ?? new Map<Id, number>();
    const personas = new Set([...t.keys(), ...p.keys()]);
    const filas = [...personas].map((userId) => {
      const trabajadoMs = t.get(userId) ?? 0;
      const presenciaMs = p.get(userId) ?? 0;
      return {
        userId,
        nombre: nombre(userId),
        trabajadoMs,
        presenciaMs,
        pct: porcentaje(trabajadoMs, presenciaMs),
        sinFicha: sinFicha.has(userId),
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const trabajadoMs = filas.reduce((x, f) => x + f.trabajadoMs, 0);
    const presenciaMs = filas.reduce((x, f) => x + f.presenciaMs, 0);
    const pct = porcentaje(trabajadoMs, presenciaMs);
    const c = cuenta.get(site.id) ?? { trabajos: 0, conEstandar: 0, revisar: 0 };
    return { site, mes, trabajadoMs, presenciaMs, pct, estado: estadoOcupacion(pct), ...c, preparadores: filas };
  });
}

/**
 * Sedes que han pasado del 80 % los dos últimos meses **cerrados** antes de
 * `mes`. El mes en curso no cuenta: el día 3 un mes a medias no dice nada.
 */
export function sedesConOcupacionAlta(s: AppState, mes: string): { site: Site; pcts: [number, number] }[] {
  const uno = mesAnterior(mes);
  const dos = mesAnterior(uno);
  const ultimo = new Map(ocupacionDelMes(s, uno).map((o) => [o.site.id, o]));
  return ocupacionDelMes(s, dos).flatMap((antes) => {
    const despues = ultimo.get(antes.site.id);
    if (!despues || antes.estado !== 'ambar' || despues.estado !== 'ambar') return [];
    return [{ site: antes.site, pcts: [antes.pct as number, despues.pct as number] as [number, number] }];
  });
}

/** «460» → «7 h 40 min». */
export function textoJornada(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** «7:40», «7 h 40», «7,5» o «460» (minutos) → minutos. */
export function leerJornada(texto: string): number | null {
  const t = texto.trim().toLowerCase();
  const hm = t.match(/^(\d{1,2})\s*(?::|h)\s*(\d{1,2})?\s*(?:min)?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const decimal = t.match(/^(\d{1,2})[.,](\d+)$/);
  if (decimal) return Math.round(Number(`${decimal[1]}.${decimal[2]}`) * 60);
  const n = t.match(/^\d+$/) ? Number(t) : NaN;
  if (!Number.isFinite(n)) return null;
  return n <= 12 ? n * 60 : n;
}

/** «18/10/2026» o «2026-10-18» → «2026-10-18». */
export function leerDia(texto: string): string | null {
  const t = texto.trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const es = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  const partes = iso ? [iso[1], iso[2], iso[3]] : es ? [es[3].length === 2 ? `20${es[3]}` : es[3], es[2], es[1]] : null;
  if (!partes) return null;
  const [y, m, d] = partes;
  const dia = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const fecha = new Date(`${dia}T12:00:00Z`);
  return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== dia ? null : dia;
}

/** «2026-10-18» → «18/10/2026». */
export function textoDia(dia: string): string {
  const [y, m, d] = dia.split('-');
  return `${d}/${m}/${y}`;
}

/** Nombre del mes en castellano: «2026-09» → «septiembre de 2026». */
export function nombreDelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[m - 1]} de ${y}`;
}
