import type { AppState, Permission, User } from '@/data/types';
import { can, mobileSections } from '@/data/selectors';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Etiqueta corta para la barra inferior del móvil. */
  short?: string;
  /** Se ve si el rol tiene al menos uno de estos permisos. Vacío = siempre. */
  anyOf?: Permission[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Menú lateral de la web, con los mismos grupos y orden que el mockup V18. */
export const NAV: NavGroup[] = [
  {
    title: 'CONTROL',
    items: [
      { href: '/', label: 'Dashboard', icon: '▦', short: 'Panel' },
      { href: '/flota', label: 'Flota', icon: '🚗', short: 'Flota', anyOf: ['flota.ver'] },
    ],
  },
  {
    title: 'LOGÍSTICA',
    items: [
      { href: '/recepcion', label: 'Recepción', icon: '🚚', short: 'Recibir', anyOf: ['recepcion.ejecutar'] },
      {
        href: '/mi-recepcion',
        label: 'Descargar camión',
        icon: '📦',
        short: 'Descargar',
        anyOf: ['recepcion.ejecutar'],
      },
      { href: '/campa', label: 'Campa Sondika', icon: '📍', short: 'Campa', anyOf: ['campa.ver'] },
    ],
  },
  {
    title: 'PREPARACIÓN',
    items: [
      {
        href: '/solicitudes',
        label: 'Solicitudes',
        icon: '📋',
        short: 'Tareas',
        anyOf: ['solicitudes.crear', 'solicitudes.gestionar'],
      },
      {
        href: '/preparacion',
        label: 'Preparación',
        icon: '🧽',
        short: 'Preparar',
        anyOf: ['preparacion.ejecutar', 'preparacion.gestionar'],
      },
      { href: '/movimientos', label: 'Movimientos', icon: '↔', short: 'Mover', anyOf: ['movimientos.registrar'] },
      { href: '/recuentos', label: 'Recuentos', icon: '📋', short: 'Recuento', anyOf: ['recuentos.ejecutar'] },
    ],
  },
  {
    title: 'CONTROL Y ADMIN',
    items: [
      { href: '/incidencias', label: 'Incidencias', icon: '⚠', short: 'Incid.', anyOf: ['incidencias.crear', 'incidencias.cerrar'] },
      { href: '/notificaciones', label: 'Notificaciones', icon: '🔔', short: 'Avisos' },
      { href: '/administracion', label: 'Administración', icon: '⚙', short: 'Config.', anyOf: ['admin.configurar'] },
    ],
  },
  {
    title: 'OPERATIVA',
    items: [
      { href: '/mi-trabajo', label: 'Mi trabajo', icon: '📱', short: 'Inicio' },
      {
        href: '/mis-traslados',
        label: 'Mis traslados',
        icon: '🚚',
        short: 'Traslados',
        anyOf: ['traslados.propios'],
      },
      {
        href: '/mi-preparacion',
        label: 'Mi preparación',
        icon: '🧽',
        short: 'Preparar',
        anyOf: ['preparacion.ejecutar'],
      },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

function allowed(state: AppState, user: User | null, item: NavItem): boolean {
  if (!item.anyOf || item.anyOf.length === 0) return true;
  return item.anyOf.some((p) => can(state, user, p));
}

/** Menú completo de la web, filtrado por los permisos del rol. */
export function visibleNav(state: AppState, user: User | null): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed(state, user, i)) })).filter(
    (g) => g.items.length > 0
  );
}

/**
 * Menú del teléfono: deliberadamente más corto que el de la web.
 * Cada rol elige sus secciones en Administración → Usuarios y roles, y
 * además se respetan los permisos.
 */
export function mobileNav(state: AppState, user: User | null): NavItem[] {
  const wanted = mobileSections(state, user);
  const items = wanted
    .map((href) => ALL_ITEMS.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i && allowed(state, user, i));

  // Si el rol no tiene nada configurado, al menos su trabajo del día.
  if (items.length === 0) return ALL_ITEMS.filter((i) => i.href === '/mi-trabajo');
  return items;
}

/** Barra inferior: las cuatro primeras secciones del rol. */
export function mobileTabs(state: AppState, user: User | null): NavItem[] {
  return mobileNav(state, user).slice(0, 4);
}

/** Título de cabecera a partir de la ruta actual. */
export function titleForPath(path: string): string {
  if (path === '/' || path === '/index') return 'Centro de control';
  if (path.startsWith('/vehiculo')) return 'Ficha de vehículo';
  return ALL_ITEMS.find((i) => i.href === path)?.label ?? 'Urkiola Car Service';
}

/** Primera sección del rol en el móvil: es donde debe abrirse la app. */
export function mobileHome(state: AppState, user: User | null): string {
  return mobileNav(state, user)[0]?.href ?? '/mi-trabajo';
}

/** Permisos que exige una ruta según el menú. Vacío = abierta a cualquiera. */
export function permissionsForRoute(href: string): Permission[] {
  return ALL_ITEMS.find((i) => i.href === href)?.anyOf ?? [];
}
