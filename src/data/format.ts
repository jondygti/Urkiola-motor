import type { AppState, LocationRef, Vehicle } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** 02:05:14 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** 2h 14m */
export function formatShortDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 19/08 · 12:07 */
export function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "hace 3 h", "hace 2 días" */
export function timeAgo(isoDate: string | null | undefined): string {
  if (!isoDate) return 'nunca';
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < MIN) return 'ahora mismo';
  if (diff < HOUR) return `hace ${Math.floor(diff / MIN)} min`;
  if (diff < 24 * HOUR) return `hace ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / (24 * HOUR));
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

export function hoursSince(isoDate: string | null | undefined): number {
  if (!isoDate) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(isoDate).getTime()) / HOUR;
}

/* ------------------------------------------------------------ ubicación */

/** "Sondika · Tejavana 01 · P04" */
export function locationLabel(state: AppState, loc: LocationRef | null | undefined, short = false): string {
  if (!loc) return 'Sin ubicación';
  const site = state.sites.find((s) => s.id === loc.siteId);
  const zone = loc.zoneId ? state.zones.find((z) => z.id === loc.zoneId) : null;
  const pos = loc.positionId ? state.positions.find((p) => p.id === loc.positionId) : null;
  const zoneName = short && zone ? zone.name.replace('Tejavana ', 'Tej.').replace('Parking ', 'P.') : zone?.name;
  return [site?.name ?? loc.siteId, zoneName, pos?.code].filter(Boolean).join(' · ');
}

export function siteName(state: AppState, siteId: string | null | undefined): string {
  if (!siteId) return '—';
  return state.sites.find((s) => s.id === siteId)?.name ?? siteId;
}

export function userName(state: AppState, userId: string | null | undefined): string {
  if (!userId) return '—';
  return state.users.find((u) => u.id === userId)?.name ?? userId;
}

/* -------------------------------------------------------------- vehículo */

/** "BMW X1" */
export function vehicleName(v: Vehicle): string {
  return `${v.brand} ${v.model}`.trim();
}

/** Identificador operativo: matrícula si la tiene, si no VIN-8. */
export function vehicleRef(v: Vehicle): string {
  return v.plate ?? v.vin8;
}

/** "BMW X1 · 12345678" */
export function vehicleTitle(v: Vehicle): string {
  return `${vehicleName(v)} · ${vehicleRef(v)}`;
}

/** Busca por matrícula o por los 8 últimos del bastidor (sin QR). */
export function matchesSearch(v: Vehicle, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return true;
  const haystack = [v.vin8, v.vin, v.plate ?? '', v.brand, v.model, v.salesRep ?? '']
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, '');
  return haystack.includes(q);
}

/** El ID manda; el texto de Quiter sigue sirviendo si no hay usuario enlazado. */
export function comercialLabel(state: AppState, vehicle: Vehicle | undefined): string {
  if (!vehicle) return 'Sin asignar';
  return (vehicle.salesRepId ? state.users.find(u => u.id === vehicle.salesRepId)?.name : null)
    ?? vehicle.salesRep ?? 'Sin asignar';
}
