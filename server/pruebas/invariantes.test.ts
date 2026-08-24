/**
 * Invariantes: cosas que no pueden dejar de ser verdad nunca.
 *
 * Las demás pruebas comprueban que cada comando hace lo suyo. Estas
 * comprueban lo contrario: que después de una jornada entera de trabajo —de
 * las de verdad, con coches que llegan, se mueven, se preparan y se
 * entregan— los datos siguen teniendo sentido.
 *
 * Es donde salen los fallos que no se ven probando comando a comando: dos
 * coches en la misma plaza, una preparación que apunta a un vehículo que ya
 * no existe, un cronómetro que va hacia atrás.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, prepProgress, type Command, type CommandInput } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import type { AppState, Id } from '../../src/data/types';

let n = 0;
const orden = (input: CommandInput, at?: string): Command =>
  ({
    id: `inv-${(n += 1)}`,
    at: at ?? new Date().toISOString(),
    userId: 'u-log',
    ...input,
  }) as Command;

const aplicar = (s: AppState, input: CommandInput, at?: string) => applyCommand(s, orden(input, at));

/* --------------------------------------------------------- las invariantes */

interface Problema {
  invariante: string;
  detalle: string;
}

function revisar(s: AppState): Problema[] {
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

  /* 6 · Sondika almacena, no prepara. */
  for (const p of s.preparations) {
    if (!s.sites.find((x) => x.id === p.siteId)?.prepares) {
      mal('solo preparan las sedes que preparan', `preparación ${p.id} en ${p.siteId}`);
    }
  }
  for (const r of s.requests) {
    if (r.type !== 'preparacion') continue;
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

/* ------------------------------------------------------------ la jornada */

/**
 * Una jornada de trabajo real, de principio a fin.
 *
 * Devuelve el estado final y el guion de comandos que lo produjo, para
 * poder repetirlo tal cual.
 */
function jornada(): { estado: AppState; guion: Command[] } {
  const guion: Command[] = [];
  let s = buildSeedState();
  const ahora = Date.now();
  const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();

  /** Ejecuta un comando y lo apunta en el guion. */
  const paso = (input: CommandInput, at?: string): Command => {
    const cmd = orden(input, at);
    guion.push(cmd);
    s = applyCommand(s, cmd);
    return cmd;
  };

  // 1 · Llega un camión a Sondika con cuatro coches, uno sin registrar.
  paso({ type: 'reception.create', truckPlate: '1111 CAM', carrier: 'Grúas Francis', siteId: 'sondika' }, hace(300));
  const recepcion = s.receptions[0]!;
  const libres = s.positions
    .filter((p) => {
      const zona = s.zones.find((z) => z.id === p.zoneId);
      return zona?.siteId === 'sondika' && !s.vehicles.some((v) => v.location?.positionId === p.id);
    })
    .slice(0, 4);

  const enCamion = s.vehicles.filter((v) => v.logisticActive && v.vin8).slice(0, 3);
  enCamion.forEach((v, i) => {
    paso({
      type: 'reception.line',
      receptionId: recepcion.id,
      ref: v.vin8,
      unloaded: true,
      positionId: libres[i]!.id,
    }, hace(290 - i));
  });

  // El cuarto no está en el parque: se da de alta con el bastidor y se baja.
  paso({ type: 'reception.line', receptionId: recepcion.id, ref: 'NUEVO001' }, hace(285));
  paso({ type: 'vehicle.create', vin8: 'NUEVO001', plate: '4444 NEW' }, hace(284));
  paso({
    type: 'reception.line',
    receptionId: recepcion.id,
    ref: 'NUEVO001',
    unloaded: true,
    positionId: libres[3]!.id,
  }, hace(283));
  paso({ type: 'reception.close', receptionId: recepcion.id }, hace(280));

  // 2 · El comercial pide una preparación para el coche nuevo, en Leioa.
  paso({
    type: 'request.create',
    requestType: 'preparacion',
    vehicleId: 'v-NUEVO001',
    siteId: 'leioa',
    to: { siteId: 'leioa' },
    userId: 'u-juan',
  }, hace(270));

  // 3 · Y un traslado de Sondika a Leioa, que el transportista recoge y entrega.
  paso({
    type: 'request.create',
    requestType: 'traslado',
    vehicleId: 'v-NUEVO001',
    siteId: 'leioa',
    to: { siteId: 'leioa' },
    carrierId: 'gruas-francis',
  }, hace(265));
  const traslado = s.requests.find((r) => r.type === 'traslado' && r.vehicleId === 'v-NUEVO001')!;
  paso({ type: 'request.update', requestId: traslado.id, status: 'en_ruta' }, hace(260));
  paso({
    type: 'movement.register',
    vehicleId: 'v-NUEVO001',
    to: { siteId: 'leioa' },
    completesTransfer: true,
    userId: 'u-iker',
  }, hace(200));

  // 4 · El preparador la abre, trabaja, se le bloquea, la reanuda y termina.
  const abre = paso({ type: 'prep.create', vehicleId: 'v-NUEVO001', siteId: 'leioa', preparerId: 'u-pedro' }, hace(190));
  const prepId = `prep-${abre.id}`;
  paso({ type: 'prep.start', prepId, userId: 'u-pedro' }, hace(185));
  paso({ type: 'prep.item', prepId, requirementId: 'req-lavado', state: 'completado', userId: 'u-pedro' }, hace(170));
  paso({ type: 'prep.pause', prepId, reason: 'Material', blocked: true, userId: 'u-pedro' }, hace(160));
  paso({ type: 'prep.resume', prepId, userId: 'u-pedro' }, hace(100));
  paso({ type: 'prep.item', prepId, requirementId: 'req-preentrega', state: 'no_requerido', userId: 'u-pedro' }, hace(90));

  // 5 · Una incidencia por el camino, que la oficina cierra.
  paso({
    type: 'incident.create',
    vehicleId: 'v-NUEVO001',
    incidentType: 'transporte',
    description: 'Golpe en el paragolpes',
    photos: [],
    userId: 'u-pedro',
  }, hace(150));
  paso({ type: 'incident.close', incidentId: s.incidents[0]!.id }, hace(140));

  // 6 · Un recuento en Sondika, con un coche fuera de su sitio.
  const cuenta = paso({ type: 'count.create', siteId: 'sondika', zoneId: null, code: 'R-JORNADA' }, hace(120));
  const countId = `count-${cuenta.id}`;
  const enSondika = s.vehicles.filter((v) => v.location?.siteId === 'sondika').slice(0, 5);
  enSondika.forEach((v, i) => {
    paso({
      type: 'count.finding',
      countId,
      vehicleId: v.id,
      // Al quinto lo encuentran en otra plaza de las que se descargaron.
      positionId: i === 4 ? libres[0]!.id : v.location?.positionId,
    }, hace(115 - i));
  });
  paso({ type: 'count.close', countId }, hace(100));

  // 7 · Se termina la preparación dejando el coche en su sitio.
  const zonaLeioa = s.zones.find((z) => z.siteId === 'leioa')!;
  const huecoLeioa = s.positions.find(
    (p) => p.zoneId === zonaLeioa.id && !s.vehicles.some((v) => v.location?.positionId === p.id)
  )!;
  paso({
    type: 'prep.finish',
    prepId,
    to: { siteId: 'leioa', zoneId: zonaLeioa.id, positionId: huecoLeioa.id },
    userId: 'u-pedro',
  }, hace(60));

  // 8 · Y la oficina fija la entrega al cliente.
  paso({
    type: 'vehicle.setDelivery',
    vehicleId: 'v-NUEVO001',
    deliveryDate: new Date(ahora + 3 * 86_400_000).toISOString(),
  }, hace(50));

  return { estado: s, guion };
}

test('el parque de ejemplo ya cumple las invariantes', () => {
  const problemas = revisar(buildSeedState());
  assert.deepEqual(problemas, [], resumen(problemas));
});

test('después de una jornada entera los datos siguen teniendo sentido', () => {
  const problemas = revisar(jornada().estado);
  assert.deepEqual(problemas, [], resumen(problemas));
});

test('la jornada hace lo que dice hacer', () => {
  const s = jornada().estado;
  const coche = s.vehicles.find((v) => v.id === 'v-NUEVO001')!;

  assert.ok(coche, 'el coche nuevo existe');
  assert.equal(coche.logisticActive, true);
  assert.equal(coche.status, 'apto_entrega', 'acaba apto para entrega');
  assert.equal(coche.location?.siteId, 'leioa', 'y en Leioa');
  assert.ok(coche.deliveryDate, 'con fecha de entrega');

  const prep = s.preparations.find((p) => p.vehicleId === 'v-NUEVO001')!;
  assert.equal(prep.runState, 'terminado');
  // Trabajó 185→160 y 100→60: 25 + 40 minutos. Esperó 160→100: 60.
  assert.equal(Math.round(prep.effectiveMs / 60_000), 65, 'tiempo efectivo');
  assert.equal(Math.round(prep.waitingMs / 60_000), 60, 'tiempo en espera');

  const solicitud = s.requests.find((r) => r.type === 'preparacion' && r.vehicleId === 'v-NUEVO001')!;
  assert.equal(solicitud.status, 'terminada', 'la solicitud se cierra sola al terminar');

  const traslado = s.requests.find((r) => r.type === 'traslado' && r.vehicleId === 'v-NUEVO001')!;
  assert.equal(traslado.status, 'terminada', 'el traslado se cierra al entregar');

  const recuento = s.counts.find((c) => c.code === 'R-JORNADA')!;
  assert.ok(recuento.closedAt, 'el recuento queda cerrado');
  assert.ok(recuento.found.some((f) => f.misplaced), 'y detecta el coche fuera de sitio');
});

/**
 * Aplicar la jornada entera dos veces tiene que dar exactamente lo mismo
 * que aplicarla una.
 *
 * No es un capricho: es lo que pasa cuando el móvil manda un comando, el
 * servidor lo aplica y la respuesta se pierde. El comando se queda en la
 * cola y se vuelve a aplicar encima de un estado que ya lo traía.
 */
test('repetir los comandos no duplica nada', () => {
  const { guion } = jornada();

  let unaVez = buildSeedState();
  for (const cmd of guion) unaVez = applyCommand(unaVez, cmd);

  let dosVeces = buildSeedState();
  for (const cmd of guion) dosVeces = applyCommand(dosVeces, cmd);
  // Y ahora todo otra vez, como si nadie hubiera confirmado nada.
  for (const cmd of guion) dosVeces = applyCommand(dosVeces, cmd);

  const cuenta = (s: AppState) => ({
    vehiculos: s.vehicles.length,
    movimientos: s.movements.length,
    solicitudes: s.requests.length,
    preparaciones: s.preparations.length,
    recuentos: s.counts.length,
    incidencias: s.incidents.length,
    recepciones: s.receptions.length,
    reglas: s.rules.length,
  });

  assert.deepEqual(cuenta(dosVeces), cuenta(unaVez), 'no se crea nada por segunda vez');
  assert.deepEqual(revisar(dosVeces), [], 'y el estado sigue siendo coherente');
});

function resumen(problemas: Problema[]): string {
  if (problemas.length === 0) return '';
  const porTipo = new Map<string, string[]>();
  for (const p of problemas) porTipo.set(p.invariante, [...(porTipo.get(p.invariante) ?? []), p.detalle]);
  return (
    '\n' +
    [...porTipo]
      .map(([inv, casos]) => `· ${inv} (${casos.length}):\n    ${casos.slice(0, 5).join('\n    ')}`)
      .join('\n') +
    '\n'
  );
}
