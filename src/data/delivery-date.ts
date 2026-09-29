/** Fecha y hora locales del usuario; el contrato persistido sigue siendo ISO. */
export function deliveryTime(iso: string, hour: number, minute: number): string {
  const d = new Date(iso);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Último domingo de un mes, en UTC. */
function ultimoDomingo(year: number, month: number): number {
  const ultimo = new Date(Date.UTC(year, month + 1, 0));
  return ultimo.getUTCDate() - ultimo.getUTCDay();
}

/**
 * El día (AAAA-MM-DD) de un instante en la España peninsular.
 *
 * Las fechas se guardan en UTC y cortar el texto daba el día de Greenwich:
 * de 00:00 a 02:00 en verano, «hoy» era todavía ayer, y una entrega a esa
 * hora se quedaba sin repaso. Se calcula a mano con la regla europea de
 * cambio de hora —último domingo de marzo y de octubre, a la 01:00 UTC—
 * para no depender de que el móvil traiga las zonas horarias de `Intl`, y
 * para que el servidor, que corre en UTC, cuente el mismo día que el móvil.
 */
export function diaEnEspana(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso.slice(0, 10);
  const year = new Date(t).getUTCFullYear();
  const verano = Date.UTC(year, 2, ultimoDomingo(year, 2), 1);
  const invierno = Date.UTC(year, 9, ultimoDomingo(year, 9), 1);
  const horas = t >= verano && t < invierno ? 2 : 1;
  return new Date(t + horas * 3_600_000).toISOString().slice(0, 10);
}

/** Cambiar el día conserva la hora; una fecha nueva mantiene las 09:00 históricas. */
export function parseDeliveryDate(text: string, previous: string | null): string | null {
  const m = text.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const old = previous ? new Date(previous) : null;
  const d = new Date(year, Number(mm) - 1, Number(dd), old?.getHours() ?? 9, old?.getMinutes() ?? 0, 0, 0);
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return d.toISOString();
}
