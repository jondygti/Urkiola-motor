/**
 * Permisos en el servidor.
 *
 * La app ya esconde lo que cada rol no puede usar, pero eso es comodidad de
 * interfaz: cualquiera puede llamar a la API a mano. Aquí se comprueba de
 * verdad, comando a comando, con los roles tal y como están guardados en la
 * configuración (que se edita desde Administración, no está en el código).
 *
 * La tabla de qué exige cada comando está en docs/BACKEND-API.md.
 */
import type { AppState, Id, Permission, User } from '../../src/data/types';
import type { Command } from '../../src/data/commands';
import { can, isSimpleRole } from '../../src/data/selectors';

/** Motivo del rechazo, o null si el comando se puede ejecutar. */
export type Rechazo = string | null;

const tiene = (s: AppState, u: User, p: Permission) => can(s, u, p);

/** Sedes del usuario. Vacío = todas. */
function sedeVetada(u: User, siteId: Id | null | undefined): boolean {
  if (!siteId) return false;
  if (!u.siteIds || u.siteIds.length === 0) return false;
  return !u.siteIds.includes(siteId);
}

/** ¿Este traslado es de esta persona o de su empresa de transporte? */
function trasladoSuyo(s: AppState, u: User, requestId: Id): boolean {
  const r = s.requests.find((x) => x.id === requestId);
  if (!r || r.type !== 'traslado') return false;
  if (r.assignedTo === u.id) return true;
  return !!u.carrierId && r.carrierId === u.carrierId;
}

/** ¿Hay algún traslado abierto suyo sobre este vehículo? */
function vehiculoDeSuTraslado(s: AppState, u: User, vehicleId: Id): boolean {
  return s.requests.some(
    (r) =>
      r.type === 'traslado' &&
      r.vehicleId === vehicleId &&
      r.status !== 'terminada' &&
      (r.assignedTo === u.id || (!!u.carrierId && r.carrierId === u.carrierId))
  );
}

/**
 * Sede a la que afecta el comando, para comprobar el reparto por sedes.
 * Devuelve `undefined` cuando el comando no va contra ninguna en concreto.
 */
function sedeAfectada(s: AppState, cmd: Command): Id | null | undefined {
  // Un alta manual todavía no tiene vehículo al que mirar.
  if (cmd.type === 'vehicle.create') return cmd.location?.siteId ?? null;
  if ('vehicleId' in cmd && cmd.vehicleId) {
    const v = s.vehicles.find((x) => x.id === cmd.vehicleId);
    if (v) return v.location?.siteId ?? v.targetSiteId ?? null;
  }
  if ('siteId' in cmd && cmd.siteId) return cmd.siteId;
  if ('prepId' in cmd) return s.preparations.find((p) => p.id === cmd.prepId)?.siteId ?? null;
  if ('countId' in cmd) return s.counts.find((c) => c.id === cmd.countId)?.siteId ?? null;
  if ('receptionId' in cmd) return s.receptions.find((r) => r.id === cmd.receptionId)?.siteId ?? null;
  if ('requestId' in cmd) return s.requests.find((r) => r.id === cmd.requestId)?.siteId ?? null;
  if ('incidentId' in cmd) {
    const inc = s.incidents.find((i) => i.id === cmd.incidentId);
    const v = inc ? s.vehicles.find((x) => x.id === inc.vehicleId) : undefined;
    return v?.location?.siteId ?? null;
  }
  return undefined;
}

/**
 * Regla aparte para los colaboradores externos (hoy, el transportista).
 *
 * Son proveedores, no personal de Urkiola, y las empresas de transporte
 * compiten entre ellas. Da igual qué permisos les ponga alguien desde
 * Administración: aquí solo pasan los comandos sobre **los traslados de su
 * empresa o los suyos**, y solo los que hacen falta para su trabajo. Al
 * revés —dejar pasar lo que el rol permita— bastaría con marcar una
 * casilla de más para que un proveedor viese la flota entera.
 */
function permisoColaborador(s: AppState, u: User, cmd: Command): Rechazo {
  const fuera = 'Solo puedes trabajar con los traslados que tienes asignados.';

  switch (cmd.type) {
    case 'movement.register':
    case 'vehicle.check':
    case 'vehicle.activate':
    case 'incident.create':
      return vehiculoDeSuTraslado(s, u, cmd.vehicleId) ? null : fuera;

    case 'request.update': {
      if (!trasladoSuyo(s, u, cmd.requestId)) return fuera;
      // Solo hacia adelante: recogido y entregado. Ni se lo asigna a otro
      // ni se lo pasa a otra empresa.
      const avance = cmd.status === 'en_ruta' || cmd.status === 'terminada';
      if (!avance) return 'Solo puedes marcar la recogida y la entrega.';
      if (cmd.assignedTo !== undefined || cmd.carrierId !== undefined) {
        return 'No puedes reasignar un traslado.';
      }
      return null;
    }

    case 'inbox.read':
    case 'inbox.readAll':
      return null;

    default:
      return 'Esta acción no está disponible para colaboradores externos.';
  }
}

/**
 * ¿Puede este usuario ejecutar este comando sobre este estado?
 *
 * Devuelve null si sí, y el motivo del rechazo si no. El motivo se le
 * enseña al operario en pantalla, así que se escribe en castellano llano.
 */
export function comprobarPermiso(s: AppState, u: User, cmd: Command): Rechazo {
  if (!u.active) return 'Tu usuario está desactivado.';

  // Los colaboradores externos van por su cuenta, antes que nada.
  if (isSimpleRole(s, u)) return permisoColaborador(s, u, cmd);

  // Reparto por sedes: quien tiene sedes asignadas no toca las demás.
  const sede = sedeAfectada(s, cmd);
  if (sedeVetada(u, sede)) return 'Ese vehículo no está en una de tus sedes.';

  switch (cmd.type) {
    case 'vehicle.check':
    case 'movement.register':
    case 'vehicle.activate': {
      if (tiene(s, u, 'movimientos.registrar') || tiene(s, u, 'recuentos.ejecutar')) return null;
      // El transportista solo mueve los coches de sus traslados.
      if (tiene(s, u, 'traslados.propios') && vehiculoDeSuTraslado(s, u, cmd.vehicleId)) return null;
      return 'No puedes registrar movimientos de este vehículo.';
    }

    case 'request.create':
      return tiene(s, u, 'solicitudes.crear') ? null : 'No puedes crear solicitudes.';

    case 'request.update': {
      if (tiene(s, u, 'solicitudes.gestionar')) return null;
      // El transportista sí puede mover su propio traslado, pero solo
      // adelante: recogido y terminado. Ni lo asigna ni lo cancela.
      const suyo = tiene(s, u, 'traslados.propios') && trasladoSuyo(s, u, cmd.requestId);
      const avance = cmd.status === 'en_ruta' || cmd.status === 'terminada';
      if (suyo && avance && cmd.assignedTo === undefined && cmd.carrierId === undefined) return null;
      return 'No puedes cambiar esta solicitud.';
    }

    case 'prep.create': {
      if (tiene(s, u, 'preparacion.gestionar')) return null;
      // El preparador abre la preparación que ya le han pedido: eso es
      // hacer su trabajo, no gestionarlo. Lo que no puede es inventarse
      // preparaciones que nadie ha solicitado.
      const pedida = s.requests.some(
        (r) => r.type === 'preparacion' && r.vehicleId === cmd.vehicleId && r.status !== 'terminada'
      );
      if (tiene(s, u, 'preparacion.ejecutar') && pedida) return null;
      return 'No puedes abrir preparaciones.';
    }

    case 'prep.start':
    case 'prep.pause':
    case 'prep.resume':
    case 'prep.item':
      return tiene(s, u, 'preparacion.ejecutar') ? null : 'No puedes trabajar en preparaciones.';

    case 'prep.finish': {
      if (!tiene(s, u, 'preparacion.ejecutar')) return 'No puedes trabajar en preparaciones.';
      // Si además dice dónde deja el coche, está registrando un movimiento.
      if (cmd.to && !tiene(s, u, 'movimientos.registrar')) return 'No puedes registrar movimientos.';
      return null;
    }

    case 'count.create':
    case 'count.finding':
    case 'count.close':
      return tiene(s, u, 'recuentos.ejecutar') ? null : 'No puedes hacer recuentos.';

    case 'incident.create':
      return tiene(s, u, 'incidencias.crear') ? null : 'No puedes registrar incidencias.';

    case 'incident.close':
      return tiene(s, u, 'incidencias.cerrar') ? null : 'No puedes cerrar incidencias.';

    case 'reception.create':
    case 'reception.line':
    case 'reception.albaran':
    case 'reception.close':
      return tiene(s, u, 'recepcion.ejecutar') ? null : 'No puedes recepcionar camiones.';

    case 'rule.create':
    case 'rule.toggle':
    case 'rule.delete':
      return tiene(s, u, 'notificaciones.gestionar') ? null : 'No puedes configurar avisos.';

    case 'vehicle.setCustom':
      return tiene(s, u, 'flota.editar') ? null : 'No puedes editar campos del vehículo.';

    case 'vehicle.create':
      // También quien descarga camiones: si llega un coche que no está en
      // el parque, tiene que poder registrarlo en el momento en vez de
      // apuntarlo en un papel.
      return tiene(s, u, 'flota.editar') || tiene(s, u, 'recepcion.ejecutar')
        ? null
        : 'No puedes dar de alta vehículos.';

    case 'vehicle.setDelivery':
      return tiene(s, u, 'entregas.gestionar') ? null : 'No puedes fijar fechas de entrega.';

    // La bandeja es de cada uno: leerla no necesita permiso.
    case 'inbox.read':
    case 'inbox.readAll':
      return null;

    /* --------------------------------------------------- administración */
    case 'config.update':
    case 'requirement.upsert':
    case 'requirement.delete':
    case 'site.upsert':
    case 'site.delete':
    case 'zone.upsert':
    case 'zone.delete':
    case 'position.add':
    case 'position.delete':
    case 'user.upsert':
    case 'user.delete':
    case 'role.upsert':
    case 'role.delete':
    case 'customField.upsert':
    case 'customField.delete':
    case 'carrier.upsert':
    case 'carrier.delete':
      return tiene(s, u, 'admin.configurar') ? null : 'No tienes permiso de administración.';

    default: {
      // Un comando que no aparezca aquí no se ejecuta. Si se añade uno
      // nuevo y se olvida su permiso, se nota enseguida en vez de quedar
      // abierto para todo el mundo.
      const nunca: never = cmd;
      return `Comando no reconocido: ${(nunca as Command).type}`;
    }
  }
}

/** Los colaboradores externos (transportista) tienen su propia regla. */
export function esColaboradorExterno(s: AppState, u: User): boolean {
  return isSimpleRole(s, u);
}
