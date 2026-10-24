/**
 * Avisos de serie que se han añadido con la plataforma ya en marcha.
 *
 * Los de siempre vienen en la semilla, pero una instalación que ya tenía sus
 * datos no vuelve a leer la semilla. Estos los pone el reloj (`alerts.sweep`)
 * la primera vez que pasa, y apunta en `config.avisosOfrecidos` que ya lo
 * hizo: si alguien borra uno desde Notificaciones, no reaparece.
 *
 * Funciones puras, como el resto de `src/data`.
 */
import type { AppState, Id, ISODate, NotificationRule } from './types';

/** Días antes de la entrega a partir de los que se avisa si no hay preparación pedida. */
export const DIAS_AVISO_SIN_PREPARACION = 4;
/** Horas de plazo por debajo de las que una preparación sin empezar está en riesgo. */
export const HORAS_PREPARACION_EN_RIESGO = 12;
/** Días después de la fecha de entrega a partir de los que se recuerda marcarla. */
export const DIAS_AVISO_SIN_MARCAR = 2;

type AvisoDeSerie = Omit<NotificationRule, 'createdAt'>;

export const AVISOS_DE_SERIE: AvisoDeSerie[] = [
  {
    // Cuatro días: dos de plazo de preparación y margen para traerlo si está
    // en otra sede. Antes se descubría el día anterior.
    id: 'rule-entrega-sin-prep',
    scopeKind: 'fleet',
    scopeRef: null,
    condition: 'entrega_sin_preparacion',
    audience: { kind: 'comercial' },
    recipient: 'Comercial del coche',
    channels: ['push', 'web'],
    active: true,
  },
  {
    // A los preparadores de esa sede, no a todos: es su cola.
    id: 'rule-prep-riesgo-preparadores',
    scopeKind: 'fleet',
    scopeRef: null,
    condition: 'preparacion_en_riesgo',
    audience: { kind: 'rol', roleId: 'preparador' },
    recipient: 'Preparadores de la sede',
    channels: ['push', 'web'],
    active: true,
  },
  {
    // Y a logística, que es quien puede mover gente de una sede a otra.
    id: 'rule-prep-riesgo-logistica',
    scopeKind: 'fleet',
    scopeRef: null,
    condition: 'preparacion_en_riesgo',
    audience: { kind: 'rol', roleId: 'logistica' },
    recipient: 'Logística',
    channels: ['push', 'web'],
    active: true,
  },
  {
    // Un coche entregado que nadie marca sigue ocupando su plaza.
    id: 'rule-entrega-sin-marcar',
    scopeKind: 'fleet',
    scopeRef: null,
    condition: 'entrega_sin_marcar',
    audience: { kind: 'comercial' },
    recipient: 'Comercial del coche',
    channels: ['push', 'web'],
    active: true,
  },
];

/**
 * Añade los avisos de serie que esta instalación todavía no ha tenido nunca.
 * Aplicarlo dos veces da lo mismo que una.
 */
export function ofrecerAvisosDeSerie(s: AppState, at: ISODate): AppState {
  const ofrecidos = new Set<Id>(s.config.avisosOfrecidos ?? []);
  const nuevos = AVISOS_DE_SERIE.filter((a) => !ofrecidos.has(a.id));
  if (nuevos.length === 0) return s;
  const existentes = new Set(s.rules.map((r) => r.id));
  const reglas = nuevos.filter((a) => !existentes.has(a.id)).map((a) => ({ ...a, createdAt: at }));
  return {
    ...s,
    rules: [...s.rules, ...reglas],
    config: { ...s.config, avisosOfrecidos: [...ofrecidos, ...nuevos.map((a) => a.id)] },
  };
}
