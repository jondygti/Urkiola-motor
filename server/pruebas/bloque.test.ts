import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import {
  comprobarBloque,
  filasAsignarComercial,
  filasAsignarPreparador,
  filasCancelar,
  filasCancelarPreparaciones,
  filasLlavesPreparadas,
  filasPedirSolicitud,
  type FilaBloque,
} from '../../src/data/bloque';
import { comprobarPermiso } from '../../src/data/permisos';
import { can } from '../../src/data/selectors';
import type { AppState, User } from '../../src/data/types';
import type { Command } from '../../src/data/commands';
import { servidorDePruebas, cmd } from './ayuda';

const AT = '2026-09-30T10:00:00.000Z';

/** Todas las acciones en bloque que ofrece la app, sobre todo lo que hay. */
function todasLasAcciones(s: AppState): { nombre: string; filas: FilaBloque[] }[] {
  const comercial = s.users.find((u) => u.id === 'u-juan')!;
  const preparador = s.users.find((u) => u.id === 'u-pedro')!;
  const activos = s.vehicles.filter((v) => v.logisticActive);
  const abiertas = s.requests.filter((r) => r.status !== 'terminada' && r.status !== 'cancelada');
  const preps = s.preparations.filter((p) => p.runState !== 'terminado' && p.runState !== 'cancelado');
  return [
    { nombre: 'traslado a Leioa', filas: filasPedirSolicitud(s, activos, { requestType: 'traslado', siteId: 'leioa' }) },
    { nombre: 'preparación en Galdakao', filas: filasPedirSolicitud(s, activos, { requestType: 'preparacion', siteId: 'galdakao' }) },
    { nombre: 'asignar comercial', filas: filasAsignarComercial(s, activos, comercial) },
    { nombre: 'cancelar solicitudes', filas: filasCancelar(s, abiertas, 'Prueba en bloque') },
    { nombre: 'llaves preparadas', filas: filasLlavesPreparadas(s, abiertas) },
    { nombre: 'asignar preparador', filas: filasAsignarPreparador(s, preps, preparador) },
    { nombre: 'cancelar preparaciones', filas: filasCancelarPreparaciones(s, preps, 'Prueba en bloque') },
  ];
}

test('nadie puede hacer en bloque lo que no puede hacer coche a coche', () => {
  const s = buildSeedState();
  for (const user of s.users.filter((u) => u.active)) {
    for (const { nombre, filas } of todasLasAcciones(s)) {
      const { admitidos } = comprobarBloque(s, user, filas, AT);
      for (const a of admitidos) {
        // Lo que la confirmación deja pasar es exactamente lo que el
        // servidor dejaría pasar con ese mismo comando suelto.
        const motivo = comprobarPermiso(s, user, { ...a.comando, id: 'x', at: AT, userId: user.id } as Command);
        assert.equal(motivo, null, `${user.id} · ${nombre} · ${a.etiqueta}: el bloque admite lo que el servidor rechaza`);
      }
      // Y el resultado de cada coche no depende de con cuántos más vaya.
      for (const f of filas.slice(0, 15)) {
        const solo = comprobarBloque(s, user, [f], AT);
        const enGrupo = admitidos.some((a) => a.comando === f.comando);
        assert.equal(solo.admitidos.length === 1, enGrupo, `${user.id} · ${nombre} · ${f.etiqueta}`);
      }
    }
  }
});

test('el transportista y quien no tiene el permiso no consiguen nada en bloque', () => {
  const s = buildSeedState();
  const transportista = s.users.find((u) => u.id === 'u-iker')!;
  const preparador = s.users.find((u) => u.id === 'u-pedro')!;
  for (const { nombre, filas } of todasLasAcciones(s)) {
    assert.equal(comprobarBloque(s, transportista, filas, AT).admitidos.length, 0, `transportista · ${nombre}`);
  }
  // El preparador no asigna comerciales ni reparte preparaciones.
  const acciones = todasLasAcciones(s);
  const comercial = acciones.find((a) => a.nombre === 'asignar comercial')!;
  const asignar = acciones.find((a) => a.nombre === 'asignar preparador')!;
  assert.equal(can(s, preparador, 'flota.editar'), false);
  assert.equal(comprobarBloque(s, preparador, comercial.filas, AT).admitidos.length, 0);
  assert.equal(comprobarBloque(s, preparador, asignar.filas, AT).admitidos.length, 0);
});

test('un director comercial solo pide sobre los coches de sus marcas, y dice por qué no los demás', () => {
  const s = buildSeedState();
  const director = s.users.find((u) => u.id === 'u-dir-vn')!;
  const activos = s.vehicles.filter((v) => v.logisticActive && v.status !== 'entregado');
  const r = comprobarBloque(s, director, filasPedirSolicitud(s, activos, { requestType: 'preparacion', siteId: 'leioa' }), AT);
  assert.ok(r.admitidos.length > 0, 'algo de lo suyo tiene que admitir');
  assert.ok(r.rechazados.some((x) => /ámbito comercial/.test(x.motivo)), 'lo ajeno sale con su motivo');
});

test('lo que no admite la acción se dice coche a coche y no frena al resto', () => {
  const s = buildSeedState();
  const log = s.users.find((u) => u.id === 'u-log')!;
  const conTraslado = s.vehicles.find((v) =>
    s.requests.some((r) => r.vehicleId === v.id && r.type === 'traslado' && r.status !== 'terminada' && r.status !== 'cancelada')
  )!;
  const libres = s.vehicles
    .filter((v) => v.logisticActive && v.status !== 'entregado' && v.location?.siteId !== 'irun')
    .filter((v) => !s.requests.some((r) => r.vehicleId === v.id && r.type === 'traslado' && r.status !== 'terminada' && r.status !== 'cancelada'))
    .slice(0, 3);
  const r = comprobarBloque(s, log, filasPedirSolicitud(s, [conTraslado, ...libres], { requestType: 'traslado', siteId: 'irun' }), AT);
  assert.equal(r.admitidos.length, 3);
  assert.equal(r.rechazados.length, 1);
  assert.match(r.rechazados[0].motivo, /ya tiene un traslado abierto/);
});

test('en el servidor: cada coche con su comando, su apunte y su comprobación', async () => {
  const p = await servidorDePruebas();
  try {
    const s = p.servicio;
    const log = s.estado.users.find((u) => u.id === 'u-log')!;
    const director = s.estado.users.find((u) => u.id === 'u-dir-vn')!;
    const activos = s.estado.vehicles.filter((v) => v.logisticActive && v.status !== 'entregado' && v.location?.siteId !== 'anoeta');
    const filas = filasPedirSolicitud(s.estado, activos.slice(0, 40), { requestType: 'traslado', siteId: 'anoeta' });

    // Lo que el director no puede, el servidor tampoco se lo deja hacer
    // mandándolo a mano, uno a uno: el bloque no abre ningún atajo.
    const delDirector = comprobarBloque(s.estado, director, filas, AT);
    for (const x of delDirector.rechazados.filter((r) => /ámbito/.test(r.motivo)).slice(0, 5)) {
      const fila = filas.find((f) => f.etiqueta === x.etiqueta)!;
      await assert.rejects(() => s.ejecutar(cmd(fila.comando!.type, fila.comando as Record<string, unknown>), director as User), {
        codigo: 403,
      });
    }

    // Logística lo aplica: un comando por coche, un apunte por coche.
    const { admitidos } = comprobarBloque(s.estado, log, filas, AT);
    assert.ok(admitidos.length > 3);
    const antes = new Map(admitidos.map((a) => {
      const id = (a.comando as { vehicleId: string }).vehicleId;
      return [id, s.estado.events.filter((e) => e.vehicleId === id).length];
    }));
    const solicitudesAntes = s.estado.requests.length;
    for (const a of admitidos) await s.ejecutar(cmd(a.comando.type, a.comando as Record<string, unknown>), log);
    assert.equal(s.estado.requests.length, solicitudesAntes + admitidos.length);
    for (const [id, n] of antes) {
      assert.ok(s.estado.events.filter((e) => e.vehicleId === id).length > n, `${id} sin apunte propio`);
    }
    // Repetir el bloque no duplica nada: ahora todos tienen su traslado.
    const otraVez = comprobarBloque(s.estado, log, filasPedirSolicitud(s.estado, activos.slice(0, 40), { requestType: 'traslado', siteId: 'anoeta' }), AT);
    for (const a of admitidos) {
      const id = (a.comando as { vehicleId: string }).vehicleId;
      assert.ok(!otraVez.admitidos.some((x) => (x.comando as { vehicleId: string }).vehicleId === id));
    }
  } finally {
    await p.limpiar();
  }
});

test('en bloque se aplica la regla de las 48 h igual que coche a coche', () => {
  const s = buildSeedState();
  const libres = s.vehicles.filter(
    (v) =>
      v.logisticActive &&
      v.status !== 'entregado' &&
      !s.requests.some((r) => r.vehicleId === v.id && r.status !== 'terminada' && r.status !== 'cancelada') &&
      !s.preparations.some((p) => p.vehicleId === v.id && p.runState !== 'terminado' && p.runState !== 'cancelado')
  );
  const [pronto, holgado] = libres;
  const ahora = Date.parse(AT);
  pronto.deliveryDate = new Date(ahora + 10 * 3_600_000).toISOString();
  holgado.deliveryDate = new Date(ahora + 10 * 24 * 3_600_000).toISOString();
  const filas = filasPedirSolicitud(s, [pronto, holgado], { requestType: 'preparacion', siteId: 'leioa' }, ahora);
  const urgente = (f: FilaBloque) => (f.comando as { urgent?: boolean }).urgent;
  assert.equal(urgente(filas[0]), true, 'con menos de 48 h va como urgente');
  assert.match(filas[0].aviso ?? '', /menos de 48 h/);
  assert.equal(urgente(filas[1]), false);
  assert.equal(filas[1].aviso, undefined);
});
