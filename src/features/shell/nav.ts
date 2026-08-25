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
      // El panel de control es de dirección: se ve solo con permiso, y de
      // serie solo lo tiene el administrador. Quien no lo tenga entra
      // directamente a su trabajo.
      { href: '/', label: 'Dashboard', icon: '▦', short: 'Panel', anyOf: ['panel.ver'] },
      { href: '/flota', label: 'Flota', icon: '🚗', short: 'Flota', anyOf: ['flota.ver'] },
      {
        href: '/entregas',
        label: 'Entregas',
        icon: '📅',
        short: 'Entregas',
        anyOf: ['entregas.gestionar', 'solicitudes.gestionar'],
      },
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
        // Es la pantalla de la oficina: los encargos de toda la red, para
        // repartirlos. Quien solo los *pide* —el comercial— no necesita ver
        // los de los demás: los suyos los tiene en «Mis coches».
        anyOf: ['solicitudes.gestionar'],
      },
      {
        href: '/preparacion',
        label: 'Preparación',
        icon: '🧽',
        short: 'Preparar',
        anyOf: ['preparacion.ejecutar', 'preparacion.gestionar'],
      },
      {
        href: '/movimientos',
        label: 'Movimientos',
        icon: '↔',
        short: 'Histórico',
        // El histórico de toda la flota es una herramienta de oficina. Quien
        // mueve coches lo que necesita es «Mover coche», y el recorrido de
        // un coche concreto está en su ficha.
        anyOf: ['solicitudes.gestionar'],
      },
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
      // La pantalla de cada uno: lo suyo y nada más. «Mi trabajo» se quitó
      // porque no era de nadie: repetía en peor lo que ya hacían estas
      // —la cola del preparador, los encargos del transportista— y al
      // comercial le enseñaba el trabajo de los demás.
      {
        href: '/mis-coches',
        label: 'Mis coches',
        icon: '🚗',
        short: 'Míos',
        anyOf: ['flota.asignarse'],
      },
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
      {
        href: '/mover',
        label: 'Mover coche',
        icon: '📍',
        short: 'Mover',
        anyOf: ['movimientos.registrar'],
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

  // Si el rol no tiene nada configurado, al menos la flota: es lo único
  // que sirve para cualquiera y no depende de tener trabajo asignado.
  if (items.length === 0) return ALL_ITEMS.filter((i) => i.href === '/flota');
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
  return mobileNav(state, user)[0]?.href ?? '/flota';
}

/**
 * Dónde debe abrirse la aplicación para este usuario.
 *
 * El panel de control ya no es la puerta de entrada de todo el mundo: quien
 * no tiene ese permiso aterriza en la primera pantalla que sí puede usar,
 * no en un aviso de «no tienes acceso» nada más entrar.
 */
export function homeFor(state: AppState, user: User | null, isDesktop: boolean): string {
  if (!isDesktop) return mobileHome(state, user);
  // En la web, quien lleva el panel de dirección entra por el panel.
  if (can(state, user, 'panel.ver')) return '/';
  // Y el resto entra por **su** pantalla: la primera que tenga marcada el
  // rol en Administración. Antes entraba por la primera del menú, que es
  // Flota para casi todos: al comercial le abría el parque entero en vez de
  // sus coches, y a la oficina la flota en vez de los encargos del día.
  return mobileHome(state, user);
}

/** Permisos que exige una ruta según el menú. Vacío = abierta a cualquiera. */
export function permissionsForRoute(href: string): Permission[] {
  return ALL_ITEMS.find((i) => i.href === href)?.anyOf ?? [];
}
