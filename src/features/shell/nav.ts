import type { Role } from '@/data/types';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Roles que ven la entrada; vacío = todos. */
  roles?: Role[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Menú lateral, con los mismos grupos y orden que el mockup V18. */
export const NAV: NavGroup[] = [
  {
    title: 'CONTROL',
    items: [
      { href: '/', label: 'Dashboard', icon: '▦' },
      { href: '/flota', label: 'Flota', icon: '🚗' },
    ],
  },
  {
    title: 'LOGÍSTICA',
    items: [
      { href: '/recepcion', label: 'Recepción', icon: '🚚' },
      { href: '/campa', label: 'Campa Sondika', icon: '📍' },
    ],
  },
  {
    title: 'PREPARACIÓN',
    items: [
      { href: '/solicitudes', label: 'Solicitudes', icon: '📋' },
      { href: '/preparacion', label: 'Preparación', icon: '🧽' },
      { href: '/movimientos', label: 'Movimientos', icon: '↔' },
      { href: '/recuentos', label: 'Recuentos', icon: '📋' },
    ],
  },
  {
    title: 'CONTROL Y ADMIN',
    items: [
      { href: '/incidencias', label: 'Incidencias', icon: '⚠' },
      { href: '/notificaciones', label: 'Notificaciones', icon: '🔔' },
      { href: '/administracion', label: 'Administración', icon: '⚙', roles: ['admin', 'logistica'] },
    ],
  },
  {
    title: 'OPERATIVA',
    items: [{ href: '/mi-trabajo', label: 'Mi trabajo', icon: '📱' }],
  },
];

/** Barra inferior en móvil (equivalente a la del mockup). */
export const TABS: NavItem[] = [
  { href: '/mi-trabajo', label: 'Inicio', icon: '⌂' },
  { href: '/flota', label: 'Flota', icon: '🚗' },
  { href: '/solicitudes', label: 'Tareas', icon: '📋' },
  { href: '/recuentos', label: 'Recuento', icon: '📍' },
];

export function visibleNav(role: Role | undefined): NavGroup[] {
  if (!role) return NAV;
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}

/** Título de cabecera a partir de la ruta actual. */
export function titleForPath(path: string): string {
  if (path === '/' || path === '/index') return 'Centro de control';
  if (path.startsWith('/vehiculo')) return 'Ficha de vehículo';
  const all = NAV.flatMap((g) => g.items);
  return all.find((i) => i.href === path)?.label ?? 'Urkiola Car Service';
}
