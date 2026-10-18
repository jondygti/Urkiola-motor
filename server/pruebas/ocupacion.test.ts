import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { applyCommand } from '../../src/data/commands';
import { diaEnEspana } from '../../src/data/delivery-date';
import {
  estadoOcupacion,
  leerDia,
  leerJornada,
  mesAnterior,
  ocupacionDelMes,
  sedesConOcupacionAlta,
} from '../../src/data/ocupacion';
import { minutosEstandar, tablaDeTiempos, tareaPorDefecto } from '../../src/data/tiempos';
import type { AppState, Preparation, TrabajoSuelto } from '../../src/data/types';
import { comprobarPermiso } from '../src/permisos';
import { estadoPara } from '../src/recorte';
import { cmd } from './ayuda';

const MIN = 60_000;
const usuario = (s: AppState, id: string) => s.users.find((u) => u.id === id)!;

/** Un estado limpio: solo Pedro prepara, 100 % en Leioa, sin trabajo ni calendario. */
function limpio(): AppState {
  const s = buildSeedState();
  s.preparations = [];
  s.requests = [];
  s.trabajosSueltos = [];
  s.ausencias = [];
  s.config = { ...s.config, festivos: [] };
  s.users = s.users.map((u) => (u.role === 'preparador' && u.id !== 'u-pedro' ? { ...u, active: false } : u));
  s.fichasLaborales = [
    { id: 'ficha-u-pedro-2026-01-01', userId: 'u-pedro', desde: '2026-01-01', jornadaMinutos: 460, reparto: [{ siteId: 'leioa', pct: 100 }] },
  ];
  return s;
}

function terminada(id: string, effectiveMs: number, targetMs: number, finishedAt: string, extra: Partial<Preparation> = {}): Preparation {
  return {
    id, vehicleId: 'v-x', siteId: 'leioa', preparerId: 'u-pedro', tipo: 'entrada', tarea: 'vn', phase: 'apto_entrega',
    runState: 'terminado', items: [], effectiveMs, waitingMs: 0, targetMs, runningSince: null, waitingSince: null,
    waitReason: null, startedAt: effectiveMs ? finishedAt : null, finishedAt, ...extra,
  };
}

/* ------------------------------------------------------------ tareas */

test('cada coche tiene su tarea por defecto y su tiempo estándar', () => {
  const s = buildSeedState();
  const tabla = tablaDeTiempos(s.config);
  const vn = { ...s.vehicles[0], type: 'VN' as const, origin: 'Camión', custom: {} };
  assert.equal(tareaPorDefecto(vn, 'entrada'), 'vn');
  assert.equal(tareaPorDefecto({ ...vn, type: 'VO' }, 'entrada'), 'vo_fondo');
  assert.equal(tareaPorDefecto({ ...vn, origin: 'Flota renting' }, 'entrada'), 'flota');
  assert.equal(tareaPorDefecto({ ...vn, type: 'VO' }, 'repaso'), 'vo_repaso');
  assert.equal(tareaPorDefecto(vn, 'repaso'), 'repaso_entrega');
  assert.equal(minutosEstandar(tabla, 'vn', 'irun'), 120);
  assert.equal(minutosEstandar(tabla, 'flota', 'leioa'), 90);
  assert.equal(minutosEstandar(tabla, 'flota', 'ford-mazda'), 120);
  assert.equal(minutosEstandar(tabla, 'vo_fondo', 'anoeta'), 240);
  assert.equal(minutosEstandar(tabla, 'vo_repaso', 'anoeta'), 30);
  assert.equal(minutosEstandar(tabla, 'carroceria', 'leioa'), 45);
});

test('la preparación copia la tarea pedida y su estándar; una tarea que no cabe se ignora', () => {
  let s = limpio();
  const v = s.vehicles.find((x) => x.logisticActive && x.type === 'VN' && x.status !== 'entregado')!;
  s = applyCommand(s, cmd('request.create', { requestType: 'preparacion', vehicleId: v.id, siteId: 'leioa', tarea: 'flota' }));
  assert.equal(s.requests[0].tarea, 'flota');
  s = applyCommand(s, cmd('prep.create', { vehicleId: v.id, siteId: 'leioa' }));
  assert.equal(s.preparations[0].tarea, 'flota');
  assert.equal(s.preparations[0].targetMs, 90 * MIN);

  // «VO a fondo» en un repaso no cabe: se queda la del coche.
  let t = limpio();
  t = applyCommand(t, cmd('request.create', { requestType: 'preparacion', prepTipo: 'repaso', vehicleId: v.id, siteId: 'leioa', tarea: 'vo_fondo' }));
  assert.equal(t.requests[0].tarea, undefined);
  t = applyCommand(t, cmd('prep.create', { vehicleId: v.id, siteId: 'leioa', tipo: 'repaso' }));
  assert.equal(t.preparations[0].tarea, 'repaso_entrega');
  assert.equal(t.preparations[0].targetMs, 30 * MIN);
});

test('cambiar la tarea cambia su estándar; cambiar la tabla no toca lo ya abierto', () => {
  let s = limpio();
  const v = s.vehicles.find((x) => x.logisticActive && x.type === 'VN' && x.status !== 'entregado')!;
  s = applyCommand(s, cmd('prep.create', { vehicleId: v.id, siteId: 'leioa' }));
  const id = s.preparations[0].id;
  s = applyCommand(s, cmd('prep.setTarea', { prepId: id, tarea: 'vo_fondo' }));
  assert.equal(s.preparations[0].targetMs, 240 * MIN);
  // Una tarea de repaso en una preparación entera no cabe.
  assert.deepEqual(applyCommand(s, cmd('prep.setTarea', { prepId: id, tarea: 'vo_repaso' })), s);

  s = applyCommand(s, cmd('tiempo.set', { tarea: 'vo_fondo', siteId: null, minutos: 200 }));
  assert.equal(s.preparations[0].targetMs, 240 * MIN, 'lo abierto conserva su estándar');
  assert.equal(minutosEstandar(tablaDeTiempos(s.config), 'vo_fondo', 'leioa'), 200);
  s = applyCommand(s, cmd('tiempo.set', { tarea: 'vo_fondo', siteId: 'leioa', minutos: 180 }));
  assert.equal(minutosEstandar(tablaDeTiempos(s.config), 'vo_fondo', 'leioa'), 180);
  assert.equal(minutosEstandar(tablaDeTiempos(s.config), 'vo_fondo', 'irun'), 200);
  s = applyCommand(s, cmd('tiempo.set', { tarea: 'vo_fondo', siteId: 'leioa', minutos: null }));
  assert.equal(minutosEstandar(tablaDeTiempos(s.config), 'vo_fondo', 'leioa'), 200);
  // El general no se quita, y un disparate no entra.
  assert.deepEqual(applyCommand(s, cmd('tiempo.set', { tarea: 'vo_fondo', siteId: null, minutos: null })), s);
  assert.deepEqual(applyCommand(s, cmd('tiempo.set', { tarea: 'vo_fondo', siteId: null, minutos: -5 })), s);
});

/* ------------------------------------------------------------ cálculo */

test('ocupación = trabajado ÷ presencia, con festivos, ausencias, estándar y carrocería', () => {
  const s = limpio();
  // Febrero de 2026: 20 días de lunes a viernes. Menos un festivo y cinco
  // días de vacaciones, 14 días de 7 h 40: 6440 minutos de presencia.
  s.config.festivos = [{ id: 'f', fecha: '2026-02-16', siteId: null, nombre: 'Festivo' }];
  s.ausencias = [{ id: 'a', userId: 'u-pedro', desde: '2026-02-23', hasta: '2026-02-27', tipo: 'vacaciones' }];
  s.preparations = [
    terminada('p1', 3220 * MIN, 120 * MIN, '2026-02-10T10:00:00Z'),
    // Sin cronómetro: cuenta el estándar.
    terminada('p2', 0, 120 * MIN, '2026-02-11T10:00:00Z'),
    // Otro mes: no cuenta.
    terminada('p3', 600 * MIN, 120 * MIN, '2026-03-02T10:00:00Z'),
    // Las 23:30 del 28 de febrero en Greenwich ya son 1 de marzo en España.
    terminada('p4', 600 * MIN, 120 * MIN, '2026-02-28T23:30:00Z'),
  ];
  const sueltos: TrabajoSuelto[] = [{
    id: 's1', tarea: 'carroceria', siteId: 'leioa', preparerId: 'u-pedro', matricula: '1234ABC', runState: 'terminado',
    effectiveMs: 0, runningSince: null, targetMs: 45 * MIN, createdAt: '2026-02-12T09:00:00Z', startedAt: null,
    finishedAt: '2026-02-12T09:00:00Z',
  }];
  s.trabajosSueltos = sueltos;

  const leioa = ocupacionDelMes(s, '2026-02').find((o) => o.site.id === 'leioa')!;
  assert.equal(leioa.presenciaMs, 6440 * MIN);
  assert.equal(leioa.trabajadoMs, (3220 + 120 + 45) * MIN);
  assert.equal(leioa.pct, 53);
  assert.equal(leioa.estado, 'gris');
  assert.equal(leioa.trabajos, 3);
  assert.equal(leioa.conEstandar, 2);
  assert.equal(leioa.revisar, 1, 'p1 marca más de tres veces su estándar');
  assert.equal(leioa.preparadores.length, 1);

  // Un festivo de otra sede no cuenta aquí.
  s.config.festivos = [{ id: 'g', fecha: '2026-02-17', siteId: 'irun', nombre: 'Local de Irun' }];
  s.ausencias = [];
  assert.equal(ocupacionDelMes(s, '2026-02').find((o) => o.site.id === 'leioa')!.presenciaMs, 20 * 460 * MIN);

  // Lo que va de mes: hasta el día 6 (5 laborables).
  assert.equal(ocupacionDelMes(s, '2026-02', '2026-02-06').find((o) => o.site.id === 'leioa')!.presenciaMs, 5 * 460 * MIN);
});

test('el reparto entre sedes y las fichas con fecha', () => {
  const s = limpio();
  s.fichasLaborales = [
    { id: 'a', userId: 'u-pedro', desde: '2026-01-01', jornadaMinutos: 460, reparto: [{ siteId: 'leioa', pct: 100 }] },
    // Desde el 16 de febrero, mitad y mitad con Galdakao.
    { id: 'b', userId: 'u-pedro', desde: '2026-02-16', jornadaMinutos: 460, reparto: [{ siteId: 'leioa', pct: 50 }, { siteId: 'galdakao', pct: 50 }] },
  ];
  const meses = ocupacionDelMes(s, '2026-02');
  const leioa = meses.find((o) => o.site.id === 'leioa')!;
  const galdakao = meses.find((o) => o.site.id === 'galdakao')!;
  // 10 días enteros en Leioa y 10 a medias.
  assert.equal(leioa.presenciaMs, (10 * 460 + 10 * 230) * MIN);
  assert.equal(galdakao.presenciaMs, 10 * 230 * MIN);
  // Enero sigue entero en Leioa.
  assert.equal(ocupacionDelMes(s, '2026-01').find((o) => o.site.id === 'galdakao')!.presenciaMs, 0);
});

test('reasignada a medias: cada uno lo que trabajó', () => {
  const s = limpio();
  s.preparations = [terminada('p', 180 * MIN, 120 * MIN, '2026-02-10T10:00:00Z', {
    tiempoAnterior: { 'u-ane': { efectivoMs: 60 * MIN, esperaMs: 0 } },
  })];
  const filas = ocupacionDelMes(s, '2026-02').find((o) => o.site.id === 'leioa')!.preparadores;
  assert.equal(filas.find((f) => f.userId === 'u-pedro')!.trabajadoMs, 120 * MIN);
  assert.equal(filas.find((f) => f.userId === 'u-ane')!.trabajadoMs, 60 * MIN);
});

test('sin ficha, la jornada de serie repartida entre sus sedes', () => {
  const s = limpio();
  s.fichasLaborales = [];
  s.users = s.users.map((u) => (u.id === 'u-ane' ? { ...u, active: true } : u));
  const meses = ocupacionDelMes(s, '2026-02');
  const ane = meses.find((o) => o.site.id === 'galdakao')!.preparadores.find((p) => p.userId === 'u-ane')!;
  assert.equal(ane.presenciaMs, 20 * 230 * MIN);
  assert.equal(ane.sinFicha, true);
});

test('los colores: verde del 70 al 80, ámbar por encima, gris por debajo', () => {
  assert.equal(estadoOcupacion(69), 'gris');
  assert.equal(estadoOcupacion(70), 'verde');
  assert.equal(estadoOcupacion(80), 'verde');
  assert.equal(estadoOcupacion(81), 'ambar');
  assert.equal(estadoOcupacion(null), 'sin_datos');
  assert.equal(mesAnterior('2026-01'), '2025-12');
});

test('fechas y jornadas escritas a mano', () => {
  assert.equal(leerDia('18/10/2026'), '2026-10-18');
  assert.equal(leerDia('1/2/26'), '2026-02-01');
  assert.equal(leerDia('2026-10-18'), '2026-10-18');
  assert.equal(leerDia('31/02/2026'), null);
  assert.equal(leerJornada('7:40'), 460);
  assert.equal(leerJornada('7 h 40'), 460);
  assert.equal(leerJornada('7,5'), 450);
  assert.equal(leerJornada('8'), 480);
  assert.equal(leerJornada('460'), 460);
});

/* ------------------------------------------------------------ aviso */

test('dos meses cerrados por encima del 80 % avisan una vez a dirección y a logística', () => {
  const s = limpio();
  // Diciembre y enero por encima, cada uno con su trabajo.
  const presencia = (mes: string) => ocupacionDelMes(s, mes).find((o) => o.site.id === 'leioa')!.presenciaMs;
  s.preparations = [
    terminada('d', Math.round(presencia('2025-12') * 0.85), 120 * MIN, '2025-12-15T10:00:00Z'),
    terminada('e', Math.round(presencia('2026-01') * 0.9), 120 * MIN, '2026-01-15T10:00:00Z'),
  ];
  assert.deepEqual(sedesConOcupacionAlta(s, '2026-02').map((x) => [x.site.id, x.pcts]), [['leioa', [85, 90]]]);

  const at = '2026-02-02T08:00:00Z';
  const t = applyCommand(s, cmd('alerts.sweep', {}, { at }));
  const avisos = t.inbox.filter((n) => n.id.startsWith('nev-ocupacion-leioa-2026-01'));
  assert.equal(avisos.length, 2, 'uno para dirección y otro para logística');
  assert.deepEqual(new Set(avisos.flatMap((n) => n.userIds ?? [])), new Set(['u-admin', 'u-log']));
  assert.match(avisos[0].body, /Leioa: 85 % de ocupación en diciembre de 2025 y 90 % en enero de 2026/);

  // El barrido siguiente no lo repite.
  const u = applyCommand(t, cmd('alerts.sweep', {}, { at: '2026-02-03T08:00:00Z' }));
  assert.equal(u.inbox.filter((n) => n.id.startsWith('nev-ocupacion-')).length, 2);

  // Con un solo mes por encima no avisa.
  s.preparations = s.preparations.filter((p) => p.id !== 'd');
  assert.equal(applyCommand(s, cmd('alerts.sweep', {}, { at })).inbox.filter((n) => n.id.startsWith('nev-ocupacion-')).length, 0);
});

test('la demo enseña los tres colores y Leioa avisa', () => {
  const s = buildSeedState();
  const mes = diaEnEspana(new Date().toISOString()).slice(0, 7);
  const pasado = ocupacionDelMes(s, mesAnterior(mes));
  const de = (id: string) => pasado.find((o) => o.site.id === id)!;
  assert.equal(de('leioa').estado, 'ambar', `Leioa ${de('leioa').pct} %`);
  assert.equal(de('anoeta').estado, 'gris', `Anoeta ${de('anoeta').pct} %`);
  assert.ok(['galdakao', 'irun'].some((id) => de(id).estado === 'verde'), 'alguna en verde');
  assert.equal(de('ford-mazda').estado, 'sin_datos');
  assert.deepEqual(sedesConOcupacionAlta(s, mes).map((x) => x.site.id), ['leioa']);
});

/* ------------------------------------------------------------ carrocería */

test('carrocería: empezar, pausar, terminar; repetir no duplica y lo tardío no reabre', () => {
  let s = limpio();
  const empezar = cmd('suelto.empezar', { siteId: 'leioa', matricula: '1234 abc', tarea: 'carroceria' },
    { userId: 'u-pedro', at: '2026-02-10T08:00:00Z' });
  s = applyCommand(s, empezar);
  s = applyCommand(s, empezar);
  assert.equal(s.trabajosSueltos!.length, 1);
  const t = s.trabajosSueltos![0];
  assert.equal(t.matricula, '1234ABC');
  assert.equal(t.targetMs, 45 * MIN);
  assert.equal(s.vehicles.some((v) => v.plate?.replace(' ', '') === '1234ABC' && v.id.includes('1234ABC')), false, 'no crea coche');
  s = applyCommand(s, cmd('suelto.pausar', { sueltoId: t.id }, { userId: 'u-pedro', at: '2026-02-10T08:20:00Z' }));
  s = applyCommand(s, cmd('suelto.reanudar', { sueltoId: t.id }, { userId: 'u-pedro', at: '2026-02-10T09:00:00Z' }));
  s = applyCommand(s, cmd('suelto.terminar', { sueltoId: t.id }, { userId: 'u-pedro', at: '2026-02-10T09:30:00Z' }));
  assert.equal(s.trabajosSueltos![0].effectiveMs, 50 * MIN, 'sin la pausa');
  // Una pausa que sube tarde no lo reabre.
  const tarde = applyCommand(s, cmd('suelto.pausar', { sueltoId: t.id }, { userId: 'u-pedro', at: '2026-02-10T09:10:00Z' }));
  assert.deepEqual(tarde, s);
  assert.equal(ocupacionDelMes(s, '2026-02').find((o) => o.site.id === 'leioa')!.trabajadoMs, 50 * MIN);

  // «Ya está hecho»: sin cronómetro, cuenta el estándar.
  s = applyCommand(s, cmd('suelto.apuntar', { siteId: 'leioa', matricula: '9999ZZZ', tarea: 'carroceria' },
    { userId: 'u-pedro', at: '2026-02-11T08:00:00Z' }));
  assert.equal(ocupacionDelMes(s, '2026-02').find((o) => o.site.id === 'leioa')!.trabajadoMs, 95 * MIN);
  // Anulado deja de contar.
  s = applyCommand(s, cmd('suelto.cancelar', { sueltoId: s.trabajosSueltos![0].id }, { userId: 'u-pedro' }));
  assert.equal(ocupacionDelMes(s, '2026-02').find((o) => o.site.id === 'leioa')!.trabajadoMs, 50 * MIN);
});

/* ------------------------------------------------------------ permisos y recorte */

test('permisos: el preparador apunta su carrocería; el calendario y los tiempos son de administración', () => {
  let s = buildSeedState();
  const pedro = usuario(s, 'u-pedro');
  const ane = usuario(s, 'u-ane');
  const admin = usuario(s, 'u-admin');
  const transportista = usuario(s, 'u-iker');
  const empezar = cmd('suelto.empezar', { siteId: 'leioa', matricula: '1234ABC', tarea: 'carroceria' }, { userId: pedro.id });
  assert.equal(comprobarPermiso(s, pedro, empezar), null);
  assert.ok(comprobarPermiso(s, pedro, cmd('suelto.empezar', { siteId: 'irun', matricula: '1', tarea: 'carroceria' })), 'fuera de su sede');
  assert.ok(comprobarPermiso(s, transportista, empezar));
  s = applyCommand(s, empezar);
  const id = s.trabajosSueltos!.find((t) => t.matricula === '1234ABC')!.id;
  assert.ok(comprobarPermiso(s, ane, cmd('suelto.terminar', { sueltoId: id })), 'el de otro');
  assert.equal(comprobarPermiso(s, pedro, cmd('suelto.terminar', { sueltoId: id })), null);
  assert.equal(comprobarPermiso(s, admin, cmd('suelto.terminar', { sueltoId: id })), null);

  for (const c of [
    cmd('tiempo.set', { tarea: 'vn', siteId: null, minutos: 100 }),
    cmd('calendario.ficha', { preparadorId: 'u-pedro', desde: '2026-02-01', jornadaMinutos: 460, reparto: [{ siteId: 'leioa', pct: 100 }] }),
    cmd('calendario.ausencia', { preparadorId: 'u-pedro', desde: '2026-02-01', hasta: '2026-02-02', tipo: 'baja' }),
    cmd('calendario.festivo', { fecha: '2026-02-01', siteId: null, nombre: 'X' }),
    cmd('prep.setTarea', { prepId: s.preparations[0].id, tarea: 'vo_fondo' }),
  ]) {
    assert.ok(comprobarPermiso(s, pedro, c), c.type);
    assert.equal(comprobarPermiso(s, admin, c), null, c.type);
  }
});

test('calendario: una ficha por persona y fecha, reparto que sume 100, ausencias idempotentes', () => {
  let s = limpio();
  const ficha = (reparto: { siteId: string; pct: number }[]) =>
    cmd('calendario.ficha', { preparadorId: 'u-pedro', desde: '2026-03-01', jornadaMinutos: 460, reparto });
  s = applyCommand(s, ficha([{ siteId: 'leioa', pct: 70 }, { siteId: 'galdakao', pct: 30 }]));
  s = applyCommand(s, ficha([{ siteId: 'leioa', pct: 60 }, { siteId: 'galdakao', pct: 40 }]));
  assert.equal(s.fichasLaborales!.filter((f) => f.desde === '2026-03-01').length, 1);
  assert.equal(s.fichasLaborales!.find((f) => f.desde === '2026-03-01')!.reparto[0].pct, 60);
  assert.deepEqual(applyCommand(s, ficha([{ siteId: 'leioa', pct: 60 }])), s, 'no suma 100');
  assert.deepEqual(applyCommand(s, ficha([{ siteId: 'sondika', pct: 100 }])), s, 'Sondika no prepara');

  const ausencia = cmd('calendario.ausencia', { preparadorId: 'u-pedro', desde: '2026-03-02', hasta: '2026-03-03', tipo: 'baja' });
  s = applyCommand(s, ausencia);
  s = applyCommand(s, ausencia);
  assert.equal(s.ausencias!.length, 1);
  assert.equal('motivo' in s.ausencias![0], false);
  assert.deepEqual(
    applyCommand(s, cmd('calendario.ausencia', { preparadorId: 'u-pedro', desde: '2026-03-05', hasta: '2026-03-04', tipo: 'baja' })), s);
});

test('el calendario solo llega a quien ve la ocupación; la carrocería, a cada uno la suya', () => {
  let s = buildSeedState();
  s = applyCommand(s, cmd('suelto.empezar', { siteId: 'leioa', matricula: '1111AAA', tarea: 'carroceria' }, { userId: 'u-ane' }));
  const para = (id: string) => estadoPara(s, usuario(s, id), id === 'u-iker');
  assert.ok(para('u-admin').fichasLaborales!.length > 0);
  assert.ok(para('u-admin').ausencias!.length > 0);
  for (const id of ['u-pedro', 'u-log', 'u-juan', 'u-iker', 'u-nerea']) {
    assert.equal(para(id).fichasLaborales!.length, 0, id);
    assert.equal(para(id).ausencias!.length, 0, id);
  }
  assert.ok(para('u-pedro').trabajosSueltos!.every((t) => t.preparerId === 'u-pedro'));
  assert.ok(para('u-ane').trabajosSueltos!.some((t) => t.matricula === '1111AAA'));
  assert.equal(para('u-iker').trabajosSueltos!.length, 0);
});
