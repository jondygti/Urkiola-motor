/**
 * Las invariantes: cosas que no pueden dejar de ser verdad nunca.
 *
 * Están aquí, y no dentro de una prueba, porque las usan dos: la jornada
 * escrita a mano (`invariantes.test.ts`) y el disparo al azar
 * (`aleatorio.test.ts`). Cada invariante que se añada aquí la comprueban
 * las dos sin tocar nada más.
 */
import { prepProgress } from '../../src/data/commands';
import type { AppState, Id } from '../../src/data/types';

export interface Problema {
  invariante: string;
  detalle: string;
}

export function revisar(s: AppState): Problema[] {
  const problemas: Problema[] = [];
  const mal = (invariante: string, detalle: string) => problemas.push({ invariante, detalle });

  const vehiculos = new Set(s.vehicles.map((v) => v.id));
  const sedes = new Set(s.sites.map((x) => x.id));
  const zonas = new Map(s.zones.map((z) => [z.id, z]));
  const plazas = new Map(s.positions.map((p) => [p.id, p]));
  const usuarios = new Set(s.users.map((u) => u.id));
  const roles = new Set(s.config.roles.map((r) => r.id));

  /* 1 · Una plaza, un coche. Dos coches en el mismo hueco significa que
     alguien va a bajar a la campa a buscar uno que no está. */
  const porPlaza = new Map<Id, Id[]>();
  for (const v of s.vehicles) {
    const p = v.location?.positionId;
    if (!p) continue;
    porPlaza.set(p, [...(porPlaza.get(p) ?? []), v.id]);
  }
  for (const [plaza, coches] of porPlaza) {
    if (coches.length > 1) mal('una plaza, un coche', `${plaza}: ${coches.join(', ')}`);
  }

  /* 2 · La ubicación existe y encaja: la plaza es de esa zona y la zona de
     esa sede. Una plaza inventada deja ocupado un hueco que está libre. */
  for (const v of s.vehicles) {
    const loc = v.location;
    if (!loc) continue;
    if (loc.siteId && !sedes.has(loc.siteId)) mal('ubicación válida', `${v.id}: sede ${loc.siteId}`);
    if (loc.zoneId) {
      const z = zonas.get(loc.zoneId);
      if (!z) mal('ubicación válida', `${v.id}: zona ${loc.zoneId} no existe`);
      else if (z.siteId !== loc.siteId) mal('ubicación válida', `${v.id}: zona de otra sede`);
    }
    if (loc.positionId) {
      const p = plazas.get(loc.positionId);
      if (!p) mal('ubicación válida', `${v.id}: plaza ${loc.positionId} no existe`);
      else if (loc.zoneId && p.zoneId !== loc.zoneId) mal('ubicación válida', `${v.id}: plaza de otra zona`);
    }
  }

  /* 3 · Nada apunta a lo que no existe. */
  const refVehiculo = (id: Id, donde: string) => {
    if (!vehiculos.has(id)) mal('sin referencias huérfanas', `${donde} → vehículo ${id}`);
  };
  for (const m of s.movements) refVehiculo(m.vehicleId, `movimiento ${m.id}`);
  for (const r of s.requests) {
    refVehiculo(r.vehicleId, `solicitud ${r.id}`);
    if (!sedes.has(r.siteId)) mal('sin referencias huérfanas', `solicitud ${r.id} → sede ${r.siteId}`);
    if (r.carrierId && !s.carriers.some((c) => c.id === r.carrierId)) {
      mal('sin referencias huérfanas', `solicitud ${r.id} → empresa ${r.carrierId}`);
    }
  }
  for (const p of s.preparations) {
    refVehiculo(p.vehicleId, `preparación ${p.id}`);
    if (!sedes.has(p.siteId)) mal('sin referencias huérfanas', `preparación ${p.id} → sede ${p.siteId}`);
    if (p.preparerId && !usuarios.has(p.preparerId)) {
      mal('sin referencias huérfanas', `preparación ${p.id} → usuario ${p.preparerId}`);
    }
  }
  for (const i of s.incidents) refVehiculo(i.vehicleId, `incidencia ${i.id}`);
  for (const c of s.counts) {
    if (!sedes.has(c.siteId)) mal('sin referencias huérfanas', `recuento ${c.id} → sede ${c.siteId}`);
    for (const f of c.found) refVehiculo(f.vehicleId, `hallazgo del recuento ${c.id}`);
  }
  for (const u of s.users) {
    if (!roles.has(u.role)) mal('sin referencias huérfanas', `usuario ${u.id} → rol ${u.role}`);
  }

  /* 4 · Una preparación abierta por coche como mucho. Dos serían dos
     cronómetros contando lo mismo. */
  const abiertas = new Map<Id, number>();
  for (const p of s.preparations) {
    if (p.runState === 'terminado') continue;
    abiertas.set(p.vehicleId, (abiertas.get(p.vehicleId) ?? 0) + 1);
  }
  for (const [v, cuantas] of abiertas) {
    if (cuantas > 1) mal('una preparación abierta por coche', `${v}: ${cuantas}`);
  }

  /* 5 · Los cronómetros no van hacia atrás ni corren dos a la vez. */
  for (const p of s.preparations) {
    if (p.effectiveMs < 0) mal('tiempos coherentes', `${p.id}: efectivo negativo`);
    if (p.waitingMs < 0) mal('tiempos coherentes', `${p.id}: espera negativa`);
    if (p.runningSince && p.waitingSince) {
      mal('tiempos coherentes', `${p.id}: trabajando y esperando a la vez`);
    }
    if (p.runState === 'terminado' && (p.runningSince || p.waitingSince)) {
      mal('tiempos coherentes', `${p.id}: terminada con el reloj en marcha`);
    }
    if (p.startedAt && p.finishedAt && new Date(p.finishedAt) < new Date(p.startedAt)) {
      mal('tiempos coherentes', `${p.id}: termina antes de empezar`);
    }
    const { done, total, pct } = prepProgress(p);
    if (done > total) mal('porcentaje coherente', `${p.id}: ${done} de ${total}`);
    if (pct < 0 || pct > 100) mal('porcentaje coherente', `${p.id}: ${pct}%`);
    // Los "no requerido" no cuentan ni arriba ni abajo.
    const noRequeridos = p.items.filter((i) => i.state === 'no_requerido').length;
    if (total !== p.items.length - noRequeridos) {
      mal('porcentaje coherente', `${p.id}: los no requeridos cuentan`);
    }
  }

  /* 6 · Sondika almacena, no prepara.

     Solo se mira el trabajo abierto. Si mañana Jon marca que Galdakao deja
     de preparar, las preparaciones que se hicieron allí siguieron siendo
     verdad: son historia y no se pueden volver falsas. Lo que no puede
     quedar es trabajo pendiente en una sede donde no lo va a hacer nadie. */
  for (const p of s.preparations) {
    if (p.runState === 'terminado') continue;
    if (!s.sites.find((x) => x.id === p.siteId)?.prepares) {
      mal('solo preparan las sedes que preparan', `preparación ${p.id} en ${p.siteId}`);
    }
  }
  for (const r of s.requests) {
    if (r.type !== 'preparacion' || r.status === 'terminada') continue;
    if (!s.sites.find((x) => x.id === r.siteId)?.prepares) {
      mal('solo preparan las sedes que preparan', `solicitud ${r.id} en ${r.siteId}`);
    }
  }

  /* 7 · Ningún identificador repetido. */
  const unicos = (nombre: string, ids: Id[]) => {
    const vistos = new Set<Id>();
    for (const id of ids) {
      if (vistos.has(id)) mal('identificadores únicos', `${nombre}: ${id}`);
      vistos.add(id);
    }
  };
  unicos('vehículos', s.vehicles.map((x) => x.id));
  unicos('movimientos', s.movements.map((x) => x.id));
  unicos('solicitudes', s.requests.map((x) => x.id));
  unicos('preparaciones', s.preparations.map((x) => x.id));
  unicos('recuentos', s.counts.map((x) => x.id));
  unicos('incidencias', s.incidents.map((x) => x.id));
  unicos('recepciones', s.receptions.map((x) => x.id));
  unicos('avisos', s.inbox.map((x) => x.id));
  unicos('eventos', s.events.map((x) => x.id));
  unicos('usuarios', s.users.map((x) => x.id));

  /* 8 · Un coche con actividad está activo: si no, desaparece de todas las
     pantallas y nadie vuelve a acordarse de él. */
  const conActividad = new Set<Id>([
    ...s.movements.map((m) => m.vehicleId),
    ...s.preparations.map((p) => p.vehicleId),
    ...s.requests.map((r) => r.vehicleId),
    ...s.incidents.map((i) => i.vehicleId),
  ]);
  for (const v of s.vehicles) {
    if (conActividad.has(v.id) && !v.logisticActive) {
      mal('actividad = activo', `${v.id} tiene actividad y está inactivo`);
    }
  }

  /* 9 · Los plazos comprometidos no se recalculan solos. */
  for (const r of s.requests) {
    if (r.type === 'traslado' && r.pickedUpAt && !r.dueAt) {
      mal('plazos comprometidos', `traslado ${r.id} recogido y sin fecha límite`);
    }
  }

  return problemas;
}

