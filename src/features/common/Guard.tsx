import React from 'react';
import { H1, Muted, Notice, Screen, Spacer } from '@/ui';
import { useStore } from '@/data/store';
import { can, roleLabel } from '@/data/selectors';
import type { Permission } from '@/data/types';
import { permissionsForRoute } from '@/features/shell/nav';

/**
 * Comprobación de permisos para usar dentro de las pantallas.
 *
 * El menú ya oculta lo que un rol no puede usar, pero eso no basta: se
 * puede llegar a una pantalla por un enlace, por el historial o escribiendo
 * la dirección. Aquí se comprueba de verdad.
 *
 * Ojo: esto es comodidad de interfaz, no seguridad. La comprobación que
 * cuenta la hace el servidor en cada comando, porque cualquier cliente
 * puede mentir.
 */
export function usePerms() {
  const { state, user } = useStore();
  return {
    /** ¿Tiene este permiso? */
    can: (p: Permission) => can(state, user, p),
    /** ¿Tiene al menos uno de estos? */
    canAny: (...list: Permission[]) => list.some((p) => can(state, user, p)),
    role: roleLabel(state, user?.role),
  };
}

/**
 * Envuelve una pantalla entera. Si el rol no tiene permiso, enseña un aviso
 * en vez del contenido.
 *
 * Lo normal es pasar `href`: así los permisos salen de la definición del
 * menú y no pueden acabar diciendo cosas distintas. `anyOf` queda para las
 * pantallas que no tienen entrada de menú, como la ficha del vehículo.
 */
export function ScreenGuard({
  anyOf,
  href,
  title,
  children,
}: {
  anyOf?: Permission[];
  href?: string;
  title: string;
  children: React.ReactNode;
}) {
  const { canAny, role } = usePerms();
  const required = href ? permissionsForRoute(href) : (anyOf ?? []);
  if (required.length === 0 || canAny(...required)) return <>{children}</>;

  return (
    <Screen>
      <H1>{title}</H1>
      <Spacer />
      <Notice tone="warn">
        Tu rol ({role}) no tiene acceso a esta pantalla. Si necesitas entrar, pídeselo a un administrador.
      </Notice>
      <Spacer />
      <Muted>Los permisos se configuran en Administración → Usuarios y roles.</Muted>
    </Screen>
  );
}

/** Muestra el contenido solo si el rol tiene el permiso. */
export function IfCan({
  permission,
  anyOf,
  children,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  children: React.ReactNode;
}) {
  const { can: has, canAny } = usePerms();
  const ok = permission ? has(permission) : anyOf ? canAny(...anyOf) : true;
  return ok ? <>{children}</> : null;
}
