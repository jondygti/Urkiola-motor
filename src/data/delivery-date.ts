/** Fecha y hora locales del usuario; el contrato persistido sigue siendo ISO. */
export function deliveryTime(iso: string, hour: number, minute: number): string {
  const d = new Date(iso);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
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
