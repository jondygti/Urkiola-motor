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
]);

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

  return { ...(c as object), at, userId } as Command;
}
