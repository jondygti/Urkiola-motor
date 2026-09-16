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
import { motivoCancelacion, type Command } from '../../src/data/commands';
import { can, esDelComercial, isSimpleRole, puedeGestionarEntrega } from '../../src/data/selectors';

/** Dos formas de escribir el mismo nombre: «Juan» y «Juan Bilbao». */
function mismoNombre(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `);
}

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
  if (!r || r.type !== 'traslado' || !r.carrierId || r.status === 'cancelada') return false;
  if (r.assignedTo === u.id) return true;
  return !!u.carrierId && r.carrierId === u.carrierId;
}

/** El traslado abierto de este vehículo que corresponde al transportista. */
function trasladoAbiertoSuyo(s: AppState, u: User, vehicleId: Id) {
  return s.requests.find(
    (r) =>
      r.type === 'traslado' && !!r.carrierId &&
      r.vehicleId === vehicleId &&
      (r.status !== 'terminada' && r.status !== 'cancelada') &&
      (r.assignedTo === u.id || (!!u.carrierId && r.carrierId === u.carrierId))
  );
}

/** ¿Hay algún traslado abierto suyo sobre este vehículo? */
function vehiculoDeSuTraslado(s: AppState, u: User, vehicleId: Id): boolean {
  return !!trasladoAbiertoSuyo(s, u, vehicleId);
}

/**
 * Los coches de Sondika tienen las llaves en Logística de Leioa. Para esos
 * traslados el hecho fiable es `keysReadyAt`: una asignación antigua o un
 * cambio de responsable no cuenta como preparación de llaves.
 */
function necesitaLlavesPreparadas(s: AppState, requestId: Id): boolean {
  const r = s.requests.find((x) => x.id === requestId);
  if (!r || r.type !== 'traslado') return false;
  const origen = r.from?.siteId;
  if (!origen) return false;
  if (origen === 'sondika') return true;
  return s.sites.find((site) => site.id === origen)?.name.trim().toLowerCase() === 'sondika';
}

/**
 * Sede a la que afecta el comando, para comprobar el reparto por sedes.
 * Devuelve `undefined` cuando el comando no va contra ninguna en concreto.
 */
function sedeAfectada(s: AppState, cmd: Command): Id | null | undefined {
  // Un alta manual todavía no tiene vehículo al que mirar.
  if (cmd.type === 'vehicle.create') return cmd.location?.siteId ?? null;

  // Hay decisiones que no son físicas y no dependen de dónde esté el coche:
  // quién lo vende, cuándo se entrega al cliente y darlo por entregado.
  // Sondika guarda el stock de toda la red, así que atarlas a la ubicación
  // dejaría a un comercial de Leioa sin poder tocar sus propios coches por
  // estar en la campa.
  if (
    cmd.type === 'vehicle.setSalesRep' ||
    cmd.type === 'vehicle.setDelivery' ||
    cmd.type === 'vehicle.deliver'
  ) {
    return undefined;
  }

  // Y una solicitud se mide por la sede que la tiene que atender, no por
  // dónde está el coche ahora: pedir que traigan a Leioa un coche que está
  // en Sondika es justo para lo que existe la pantalla.
  if (cmd.type === 'request.create') return cmd.requestType === 'traslado' ? undefined : cmd.siteId;
  if (cmd.type === 'request.cancel' || cmd.type === 'vehicle.setKeys') return undefined;
  if (cmd.type === 'prep.create') return cmd.siteId;

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
    case 'movement.register': {
      const r = trasladoAbiertoSuyo(s, u, cmd.vehicleId);
      if (!r) return fuera;
      // Un proveedor no puede saltarse el paso de recoger las llaves llamando
      // directamente al endpoint de movimientos.
      if (necesitaLlavesPreparadas(s, r.id) && !r.pickedUpAt) {
        return 'Primero tienes que recoger las llaves preparadas por Logística.';
      }
      return null;
    }

    case 'vehicle.check':
    case 'vehicle.activate':
    case 'incident.create':
      return vehiculoDeSuTraslado(s, u, cmd.vehicleId) ? null : fuera;

    case 'request.update': {
      const r = s.requests.find((x) => x.id === cmd.requestId);
      if (!r || !trasladoSuyo(s, u, cmd.requestId)) return fuera;
      // El transportista registra la recogida aquí. La entrega no es un
      // estado que se pulse: la registra movement.register al llegar al destino.
      if (cmd.status === 'terminada') {
        return 'La entrega se registra al mover el coche hasta el destino del traslado.';
      }
      if (cmd.status !== 'en_ruta') return 'Solo puedes registrar la recogida de las llaves.';
      if (cmd.assignedTo !== undefined || cmd.carrierId !== undefined) {
        return 'No puedes reasignar un traslado.';
      }
      if (necesitaLlavesPreparadas(s, r.id) && !r.keysReadyAt && !r.pickedUpAt) {
        return 'Logística todavía no ha marcado las llaves como preparadas.';
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

    case 'request.cancel': {
      const r = s.requests.find(r => r.id === cmd.requestId);
      return r ? motivoCancelacion(s, u, r) : 'Solicitud inexistente.';
    }

    case 'vehicle.setKeys':
      return tiene(s, u, 'flota.editar') || tiene(s, u, 'movimientos.registrar') ? null : 'No puedes editar la ubicación de llaves.';

    case 'request.create':
      return tiene(s, u, 'solicitudes.crear') ? null : 'No puedes crear solicitudes.';

    case 'request.update': {
      const r = s.requests.find((x) => x.id === cmd.requestId);
      if (cmd.status === 'cancelada' || r?.status === 'cancelada') return 'Usa Cancelar solicitud; una cancelación no se reabre.';
      if (!r) return 'Solicitud inexistente.';

      if (r.type === 'traslado') {
        if (!['solicitada', 'asignada', 'en_ruta'].includes(cmd.status)) {
          return cmd.status === 'terminada'
            ? 'El traslado se completa al registrar el movimiento que llega a su destino.'
            : 'Ese estado no pertenece al flujo de un traslado.';
        }
        if (r.pickedUpAt && cmd.status !== 'en_ruta') {
          return 'Con las llaves recogidas el traslado sigue en ruta hasta llegar al destino.';
        }
      } else if (!['solicitada', 'asignada', 'en_curso', 'bloqueada'].includes(cmd.status)) {
        return cmd.status === 'terminada'
          ? 'La solicitud se completa al finalizar la preparación.'
          : 'Ese estado no pertenece al flujo de una preparación.';
      }

      // En Sondika no basta con que el traslado esté asignado: Logística
      // tiene que haber dejado constancia expresa de que las llaves están listas.
      if (cmd.status === 'en_ruta' && r && necesitaLlavesPreparadas(s, r.id) && !r.keysReadyAt && !r.pickedUpAt) {
        return 'Marca primero las llaves como preparadas.';
      }
      if (tiene(s, u, 'solicitudes.gestionar')) return null;
      // Un rol interno con «traslados propios» puede registrar la recogida;
      // la entrega también se cierra únicamente mediante el movimiento físico.
      const suyo = tiene(s, u, 'traslados.propios') && trasladoSuyo(s, u, cmd.requestId);
      const avance = cmd.status === 'en_ruta';
      if (suyo && avance && cmd.assignedTo === undefined && cmd.carrierId === undefined) return null;
      return 'No puedes cambiar esta solicitud.';
    }

    case 'prep.create': {
      if (tiene(s, u, 'preparacion.gestionar')) return null;
      // El preparador abre la preparación que ya le han pedido: eso es
      // hacer su trabajo, no gestionarlo. Lo que no puede es inventarse
      // preparaciones que nadie ha solicitado.
      const pedida = s.requests.some(
        (r) => r.type === 'preparacion' && r.vehicleId === cmd.vehicleId && (r.status !== 'terminada' && r.status !== 'cancelada')
          && r.siteId === cmd.siteId && (!cmd.tipo || (r.prepTipo ?? 'entrada') === cmd.tipo)
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
    case 'rule.setActive':
    case 'rule.delete':
      return tiene(s, u, 'notificaciones.gestionar') ? null : 'No puedes configurar avisos.';

    case 'vehicle.setCustom':
      return tiene(s, u, 'flota.editar') ? null : 'No puedes editar campos del vehículo.';

    case 'vehicle.setSalesRep': {
      // Quien administra la flota asigna a quien sea.
      if (tiene(s, u, 'flota.editar')) return null;

      // Y un comercial coge los suyos: puede quedarse un coche que no tiene
      // comercial y puede soltar el suyo, pero no quitarle uno a otro. Eso
      // último se pide a la oficina, que para eso lleva la cuenta.
      if (!tiene(s, u, 'flota.asignarse')) return 'No puedes asignar el comercial de un vehículo.';

      const vehiculo = s.vehicles.find((v) => v.id === cmd.vehicleId);
      const actual = vehiculo?.salesRep?.trim() ?? '';
      const suyo = esDelComercial(vehiculo ?? ({} as never), u);
      const nuevo = cmd.salesRep?.trim() ?? '';

      if (actual && !suyo) return 'Ese vehículo ya lo lleva otro comercial. Pídeselo a la oficina.';
      if (nuevo && !mismoNombre(nuevo, u.name)) return 'Solo puedes asignarte a ti mismo.';
      return null;
    }

    case 'vehicle.create':
      // También quien descarga camiones: si llega un coche que no está en
      // el parque, tiene que poder registrarlo en el momento en vez de
      // apuntarlo en un papel.
      return tiene(s, u, 'flota.editar') || tiene(s, u, 'recepcion.ejecutar')
        ? null
        : 'No puedes dar de alta vehículos.';

    case 'vehicle.deliver':
    case 'vehicle.setDelivery': {
      const v = s.vehicles.find((x) => x.id === cmd.vehicleId);
      return v && puedeGestionarEntrega(s, u, v) ? null : 'No puedes gestionar la entrega de este vehículo.';
    }

    // La bandeja es de cada uno: leerla no necesita permiso.
    case 'alerts.sweep':
      // No es una acción de nadie: es el repaso del reloj. Cualquiera con
      // sesión lo puede disparar al abrir la app. Genera los avisos que ya
      // estaban configurados y pone los repasos de entrega del día, y lo que
      // sale de ahí **no lo elige quien lo dispara**: sale del estado —qué
      // coches se entregan hoy—, así que abrirlo antes solo adelanta el
      // reloj, no crea trabajo que nadie había pedido.
      return null;

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
