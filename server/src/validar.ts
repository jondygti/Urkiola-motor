/**
 * Comprobación de lo que llega por la API.
 *
 * Solo la forma: que sea un comando de los que existen y que sus campos
 * mínimos estén. Las reglas de negocio están en `applyCommand`, que es la
 * misma función que usa la app, y los permisos en `permisos.ts`.
 */
import type { Command } from '../../src/data/commands';
import { malaPeticion } from './errores';

/** Todos los tipos de comando que el servidor acepta. */
export const TIPOS: ReadonlySet<string> = new Set<Command['type']>([
  'vehicle.check',
  'movement.register',
  'request.create',
  'request.update',
  'prep.create',
  'prep.start',
  'prep.pause',
  'prep.resume',
  'prep.finish',
  'prep.item',
  'count.create',
  'count.finding',
  'count.close',
  'incident.create',
  'incident.close',
  'rule.create',
  'rule.toggle',
  'rule.delete',
  'alerts.sweep',
  'inbox.read',
  'inbox.readAll',
  'reception.create',
  'reception.line',
  'reception.albaran',
  'reception.close',
  'config.update',
  'requirement.upsert',
  'requirement.delete',
  'site.upsert',
  'site.delete',
  'zone.upsert',
  'zone.delete',
  'position.add',
  'position.delete',
  'user.upsert',
  'user.delete',
  'role.upsert',
  'role.delete',
  'customField.upsert',
  'customField.delete',
  'vehicle.setCustom',
  'carrier.upsert',
  'carrier.delete',
  'vehicle.setDelivery',
  'vehicle.activate',
  'vehicle.create',
  'vehicle.setSalesRep',
]);

/**
 * Números de la configuración que, si llegan mal, rompen la aplicación de
 * todo el mundo a la vez: un objetivo de preparación que no es un número
 * deja los cronómetros y las barras de progreso sin sentido en todas las
 * pantallas. Solo un administrador puede mandarlos, pero un dedazo desde
 * fuera de la app no debería tumbar la operativa.
 */
const NUMEROS_DE_CONFIG = [
  'staleCheckHours',
  'transferDeadlineHours',
  'prepDeadlineHours',
] as const;

function comprobarConfig(patch: unknown): void {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw malaPeticion('La configuración tiene que ser un objeto.');
  }
  const p = patch as Record<string, unknown>;

  for (const clave of NUMEROS_DE_CONFIG) {
    if (p[clave] === undefined) continue;
    const n = p[clave];
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
      throw malaPeticion(`${clave} tiene que ser un número de horas mayor que cero.`);
    }
  }

  if (p.prepTargetMinutes !== undefined) {
    const objetivos = p.prepTargetMinutes as Record<string, unknown> | null;
    if (!objetivos || typeof objetivos !== 'object') {
      throw malaPeticion('Los objetivos de preparación tienen que ser números.');
    }
    for (const tipo of ['VN', 'VO']) {
      const n = objetivos[tipo];
      if (n === undefined) continue;
      if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
        throw malaPeticion(`El objetivo de ${tipo} tiene que ser un número de minutos mayor que cero.`);
      }
    }
  }

  for (const [clave, valor] of Object.entries(p)) {
    // Las listas de la configuración son listas: si llega otra cosa, las
    // pantallas que las recorren se rompen al pintar.
    if (['waitReasons', 'requirements', 'customFields', 'fleetColumns', 'roles'].includes(clave)) {
      if (!Array.isArray(valor)) throw malaPeticion(`${clave} tiene que ser una lista.`);
    }
  }
}

/** Margen que se le permite al reloj del móvil antes de corregirlo. */
const MARGEN_FUTURO_MS = 5 * 60_000;

/**
 * Valida el comando y devuelve una copia lista para aplicar.
 *
 * Corrige dos cosas a propósito:
 *  - el `userId` se pone al del token, pase lo que pase: quien manda el
 *    comando no decide en nombre de quién queda registrado;
 *  - una fecha en el futuro (reloj del móvil mal puesto) se sustituye por
 *    la de llegada, o los plazos y el histórico salen disparatados.
 */
export function validarComando(cuerpo: unknown, userId: string, ahora = Date.now()): Command {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw malaPeticion('El comando tiene que ser un objeto.');
  }
  const c = cuerpo as Record<string, unknown>;

  if (typeof c.type !== 'string' || !TIPOS.has(c.type)) {
    throw malaPeticion(`Tipo de comando desconocido: ${String(c.type)}`);
  }
  if (typeof c.id !== 'string' || c.id.length === 0 || c.id.length > 200) {
    throw malaPeticion('El comando necesita un id.');
  }
  if (typeof c.at !== 'string') throw malaPeticion('El comando necesita una fecha.');

  const fecha = new Date(c.at);
  if (Number.isNaN(fecha.getTime())) throw malaPeticion('La fecha del comando no es válida.');

  const at = fecha.getTime() > ahora + MARGEN_FUTURO_MS ? new Date(ahora).toISOString() : c.at;

  if (c.type === 'config.update') comprobarConfig(c.patch);

  return { ...(c as object), at, userId } as Command;
}
