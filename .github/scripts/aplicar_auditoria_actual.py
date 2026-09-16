from pathlib import Path


def repl(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"No se encontró patrón en {path}: {old[:140]!r}")
    p.write_text(s.replace(old, new, count))


# 1) Al recoger las llaves el coche está realmente «en traslado».
repl(
    "src/data/commands.ts",
    "      const next: AppState = { ...state, requests: replace(state.requests, cmd.requestId, patch) };\n      return addEvent(next, {",
    "      let next: AppState = { ...state, requests: replace(state.requests, cmd.requestId, patch) };\n      if (recoge) {\n        next = { ...next, vehicles: replace(next.vehicles, req.vehicleId, { status: 'en_traslado' }) };\n      }\n      return addEvent(next, {",
)

repl(
    "src/data/types.ts",
    "  'traslado_solicitado',\n  'en_preparacion',",
    "  'traslado_solicitado',\n  'en_traslado',\n  'en_preparacion',",
)

# 2) Las solicitudes no se terminan a mano. El traslado lo cierra el
# movimiento al destino y la preparación, prep.finish.
p = Path("server/src/permisos.ts")
s = p.read_text()
old = """      // Solo hacia adelante: recogido y entregado. Ni se lo asigna a otro
      // ni se lo pasa a otra empresa.
      const avance = cmd.status === 'en_ruta' || cmd.status === 'terminada';
      if (!avance) return 'Solo puedes marcar la recogida y la entrega.';
      if (cmd.assignedTo !== undefined || cmd.carrierId !== undefined) {
        return 'No puedes reasignar un traslado.';
      }
      if (cmd.status === 'en_ruta' && necesitaLlavesPreparadas(s, r.id) && !r.keysReadyAt && !r.pickedUpAt) {
        return 'Logística todavía no ha marcado las llaves como preparadas.';
      }
      if (cmd.status === 'terminada' && !r.pickedUpAt) {
        return 'Primero tienes que registrar la recogida de las llaves.';
      }
      return null;"""
new = """      // El transportista registra la recogida aquí. La entrega no es un
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
      return null;"""
if old not in s:
    raise SystemExit("No se encontró bloque externo request.update")
s = s.replace(old, new, 1)

old = """      const r = s.requests.find((x) => x.id === cmd.requestId);
      if (cmd.status === 'cancelada' || r?.status === 'cancelada') return 'Usa Cancelar solicitud; una cancelación no se reabre.';
      // En Sondika no basta con que el traslado esté asignado: Logística"""
new = """      const r = s.requests.find((x) => x.id === cmd.requestId);
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

      // En Sondika no basta con que el traslado esté asignado: Logística"""
if old not in s:
    raise SystemExit("No se encontró bloque interno request.update")
s = s.replace(old, new, 1)

old = """      // El transportista sí puede mover su propio traslado, pero solo
      // adelante: recogido y terminado. Ni lo asigna ni lo cancela.
      const suyo = tiene(s, u, 'traslados.propios') && trasladoSuyo(s, u, cmd.requestId);
      const avance = cmd.status === 'en_ruta' || cmd.status === 'terminada';
      if (suyo && avance && cmd.assignedTo === undefined && cmd.carrierId === undefined) return null;"""
new = """      // Un rol interno con «traslados propios» puede registrar la recogida;
      // la entrega también se cierra únicamente mediante el movimiento físico.
      const suyo = tiene(s, u, 'traslados.propios') && trasladoSuyo(s, u, cmd.requestId);
      const avance = cmd.status === 'en_ruta';
      if (suyo && avance && cmd.assignedTo === undefined && cmd.carrierId === undefined) return null;"""
if old not in s:
    raise SystemExit("No se encontró bloque de traslados propios")
s = s.replace(old, new, 1)
p.write_text(s)

# 3) La pantalla de gestión solo ofrece estados compatibles y el histórico
# terminado/cancelado queda de solo lectura.
repl(
    "app/(shell)/solicitudes.tsx",
    """      render: (r) =>
        puedeGestionar ? (
          <Btn small onPress={() => setEditing(r)}>""",
    """      render: (r) =>
        puedeGestionar && r.status !== 'terminada' && r.status !== 'cancelada' ? (
          <Btn small onPress={() => setEditing(r)}>""",
)

repl(
    "app/(shell)/solicitudes.tsx",
    """          options={Object.entries(REQUEST_STATUS_LABEL)
            .filter(([key]) => key !== 'cancelada' && !(requiereLlaves && !llavesPreparadas && key === 'en_ruta'))
            .map(([value, label]) => ({""",
    """          options={Object.entries(REQUEST_STATUS_LABEL)
            .filter(([key]) => {
              const permitido = request.type === 'traslado'
                ? ['solicitada', 'asignada', 'en_ruta'].includes(key)
                : ['solicitada', 'asignada', 'en_curso', 'bloqueada'].includes(key);
              if (!permitido) return false;
              if (request.type === 'traslado' && request.pickedUpAt && key !== 'en_ruta') return false;
              if (requiereLlaves && !llavesPreparadas && key === 'en_ruta') return false;
              return true;
            })
            .map(([value, label]) => ({""",
)

# 4) El resumen de solicitudes incluye Sondika: allí no se prepara, pero sí
# puede ser origen/destino de traslados.
repl(
    "src/data/selectors.ts",
    """export function requestsBySite(s: AppState) {
  return s.sites
    .filter((site) => site.prepares)
    .map((site) => {""",
    """export function requestsBySite(s: AppState) {
  return s.sites
    .map((site) => {""",
)

# 5) Recorte por sede: targetSiteId vacío no significa «todas las sedes».
# Los comerciales conservan el stock central y sus propios coches fuera.
p = Path("server/src/recorte.ts")
s = p.read_text()
s = s.replace(
    "import { avisoLeido } from '../../src/data/selectors';",
    "import { avisoLeido, can, esDelComercial } from '../../src/data/selectors';",
    1,
)
old = """  const suyas = new Set(u.siteIds);
  const dentro = (siteId: Id | null | undefined) => !siteId || suyas.has(siteId);

  const vehicles = s.vehicles.filter(
    (v) => dentro(v.location?.siteId) || dentro(v.targetSiteId)
  );"""
new = """  const suyas = new Set(u.siteIds);
  const campas = new Set(s.sites.filter((site) => site.kind === 'campa').map((site) => site.id));
  const vendeCoches = can(s, u, 'flota.asignarse');

  const vehicles = s.vehicles.filter((v) => {
    const enSuSede = !!v.location?.siteId && suyas.has(v.location.siteId);
    const vaASuSede = !!v.targetSiteId && suyas.has(v.targetSiteId);
    // El comercial necesita ver el stock central aunque duerma en Sondika,
    // y sus propios coches aunque estén temporalmente fuera de su sede.
    const stockCentral = vendeCoches && !!v.location?.siteId && campas.has(v.location.siteId);
    const cocheSuyo = vendeCoches && esDelComercial(v, u);
    return enSuSede || vaASuSede || stockCentral || cocheSuyo;
  });"""
if old not in s:
    raise SystemExit("No se encontró recorte por sedes")
p.write_text(s.replace(old, new, 1))

# 6) Una preparación cancelada está cerrada, pero no está terminada ni
# convierte el coche en apto para entrega.
p = Path("src/features/prep/PrepPanel.tsx")
s = p.read_text()
old = """  const finished = (prep.runState === 'terminado' || prep.runState === 'cancelado');
  const bloqueado = finished || !puedeEjecutar;
  const apt = finished || (pct === 100 && prep.phase === 'apto_entrega');"""
new = """  const terminada = prep.runState === 'terminado';
  const cancelada = prep.runState === 'cancelado';
  const cerrada = terminada || cancelada;
  const bloqueado = cerrada || !puedeEjecutar;
  const apt = !cancelada && (terminada || (pct === 100 && prep.phase === 'apto_entrega'));"""
if old not in s:
    raise SystemExit("No se encontró estado de PrepPanel")
s = s.replace(old, new, 1)
s = s.replace("!finished && puedeEjecutar", "!cerrada && puedeEjecutar", 1)
s = s.replace(") : finished ? (", ") : cerrada ? (", 1)
s = s.replace(
    "            Terminada · {formatShortDuration(prep.effectiveMs)} efectivos · preparador{' '}",
    "            {cancelada ? 'Cancelada' : 'Terminada'} · {formatShortDuration(prep.effectiveMs)} efectivos · preparador{' '}",
    1,
)
p.write_text(s)

# 7) Las invariantes no cuentan cancelaciones como trabajo abierto.
repl(
    "server/pruebas/invariantes.ts",
    """  for (const p of s.preparations) {
    if (p.runState === 'terminado') continue;
    abiertas.set(p.vehicleId, (abiertas.get(p.vehicleId) ?? 0) + 1);""",
    """  for (const p of s.preparations) {
    if (p.runState === 'terminado' || p.runState === 'cancelado') continue;
    abiertas.set(p.vehicleId, (abiertas.get(p.vehicleId) ?? 0) + 1);""",
)
repl(
    "server/pruebas/invariantes.ts",
    """  for (const p of s.preparations) {
    if (p.runState === 'terminado') continue;
    if (!s.sites.find((x) => x.id === p.siteId)?.prepares) {""",
    """  for (const p of s.preparations) {
    if (p.runState === 'terminado' || p.runState === 'cancelado') continue;
    if (!s.sites.find((x) => x.id === p.siteId)?.prepares) {""",
)
repl(
    "server/pruebas/invariantes.ts",
    """  for (const r of s.requests) {
    if (r.type !== 'preparacion' || r.status === 'terminada') continue;""",
    """  for (const r of s.requests) {
    if (r.type !== 'preparacion' || r.status === 'terminada' || r.status === 'cancelada') continue;""",
)

# 8) Regresiones del flujo de llaves y cierre físico.
p = Path("server/pruebas/llaves-traslados.test.ts")
s = p.read_text()
s = s.replace(
    """  assert.equal(request.pickedUpAt, at(11));
  assert.ok(request.dueAt);""",
    """  assert.equal(request.pickedUpAt, at(11));
  assert.ok(request.dueAt);
  assert.equal(state.vehicles.find((v) => v.id === request.vehicleId)?.status, 'en_traslado');""",
    1,
)
old = """test('un transportista no puede marcar entregado un traslado sin haber recogido las llaves', () => {
  const { state, requestId, transportista } = escenario('sondika');
  const rechazo = puede(state, transportista, {
    type: 'request.update',
    requestId,
    status: 'terminada',
  });
  assert.match(rechazo ?? '', /primero tienes que registrar la recogida/i);
});"""
new = """test('un traslado no se puede cerrar a mano: lo cierra el movimiento al destino', () => {
  let { state, requestId, vehicleId, logistica, transportista } = escenario('sondika');
  state = applyCommand(state, cmd({ type: 'request.update', requestId, status: 'asignada' }, logistica.id, 10));
  state = applyCommand(state, cmd({ type: 'request.update', requestId, status: 'en_ruta' }, transportista.id, 11));

  const cerrarTransportista = puede(state, transportista, { type: 'request.update', requestId, status: 'terminada' }, 12);
  const cerrarLogistica = puede(state, logistica, { type: 'request.update', requestId, status: 'terminada' }, 12);
  assert.match(cerrarTransportista ?? '', /mov(er|imiento).*destino|destino del traslado/i);
  assert.match(cerrarLogistica ?? '', /movimiento.*destino|llega.*destino/i);

  state = applyCommand(state, cmd({ type: 'movement.register', vehicleId, to: { siteId: 'leioa' } }, transportista.id, 12));
  assert.equal(state.requests.find((r) => r.id === requestId)?.status, 'en_ruta', 'otra sede no lo cierra');

  state = applyCommand(state, cmd({ type: 'movement.register', vehicleId, to: { siteId: 'galdakao' } }, transportista.id, 13));
  assert.equal(state.requests.find((r) => r.id === requestId)?.status, 'terminada');
  assert.equal(state.vehicles.find((v) => v.id === vehicleId)?.location?.siteId, 'galdakao');
});"""
if old not in s:
    raise SystemExit("No se encontró última regresión de llaves")
p.write_text(s.replace(old, new, 1))

# 9) Recorte por sede: pruebas específicas del agujero encontrado.
p = Path("server/pruebas/recorte.test.ts")
s = p.read_text()
s = s.replace(
    "import { CAMPOS_DEL_VEHICULO } from '../src/recorte';",
    "import { CAMPOS_DEL_VEHICULO, estadoParaSedes } from '../src/recorte';\nimport { buildSeedState } from '../../src/data/seed';",
    1,
)
marker = "test('el administrador lo ve todo', async (t) => {"
extra = """test('targetSiteId vacío no abre a un usuario el parque de otras sedes', () => {
  const s = buildSeedState();
  const pedro = s.users.find((u) => u.id === 'u-pedro')!;
  const ajeno = s.vehicles.find((v) => v.location?.siteId === 'irun')!;
  const preparado = {
    ...s,
    vehicles: s.vehicles.map((v) => v.id === ajeno.id ? { ...v, targetSiteId: null, salesRep: null } : v),
  };
  const visto = estadoParaSedes(preparado, pedro);
  assert.equal(visto.vehicles.some((v) => v.id === ajeno.id), false);
});

test('el comercial conserva el stock central y sus coches aunque estén fuera', () => {
  const s = buildSeedState();
  const juan = s.users.find((u) => u.id === 'u-juan')!;
  const central = s.vehicles.find((v) => v.location?.siteId === 'sondika')!;
  const ajeno = s.vehicles.find((v) => v.location?.siteId === 'irun' && v.id !== central.id)!;
  const preparado = {
    ...s,
    vehicles: s.vehicles.map((v) => {
      if (v.id === central.id) return { ...v, targetSiteId: null, salesRep: null };
      if (v.id === ajeno.id) return { ...v, targetSiteId: null, salesRep: 'Otra Persona' };
      return v;
    }),
  };
  const visto = estadoParaSedes(preparado, juan);
  assert.ok(visto.vehicles.some((v) => v.id === central.id), 've el stock de la campa central');
  assert.equal(visto.vehicles.some((v) => v.id === ajeno.id), false, 'no recibe un coche ajeno de Irun');
});

"""
if marker not in s:
    raise SystemExit("No se encontró marcador recorte.test")
p.write_text(s.replace(marker, extra + marker, 1))

# 10) Pruebas de selectores y del flujo visual.
Path("server/pruebas/auditoria-actual.test.ts").write_text(
    """import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { requestsBySite } from '../../src/data/selectors';
import { VEHICLE_FLOW, VEHICLE_STATUS_LABEL } from '../../src/data/types';

test('la ficha 360 contempla todos los estados logísticos del vehículo', () => {
  assert.deepEqual(new Set(VEHICLE_FLOW), new Set(Object.keys(VEHICLE_STATUS_LABEL)));
});

test('el resumen de solicitudes cuenta también traslados con Sondika como sede', () => {
  const s = buildSeedState();
  const v = s.vehicles.find((x) => x.location?.siteId !== 'sondika')!;
  s.requests.unshift({
    id: 'req-auditoria-sondika', type: 'traslado', vehicleId: v.id, siteId: 'sondika',
    from: v.location, to: { siteId: 'sondika' }, status: 'solicitada', urgent: false,
    createdAt: '2026-09-16T00:00:00.000Z', createdBy: 'u-admin', assignedTo: null,
    dueAt: null, pickedUpAt: null, deliveredAt: null, deliveredBy: null, carrierId: null,
  });
  const fila = requestsBySite(s).find((x) => x.site.id === 'sondika');
  assert.ok(fila);
  assert.ok((fila?.transfers ?? 0) >= 1);
});
"""
)

# 11) La prueba Chromium sigue el flujo nuevo de llaves de extremo a extremo.
p = Path("scripts/verify/funciones.mjs")
s = p.read_text()
inicio = s.index("  /* --------------------------------------------- 4 · recogida de llaves */")
fin = s.index("  /* ------------ 12 · lo que pide el comercial llega al preparador */")
bloque = """  /* --------------------------------------------- 4 · recogida de llaves */
  {
    // Mismo navegador/dispositivo para comprobar el relevo Logística → transportista.
    const { context, page, errores } = await entrarComo(browser, USUARIOS.transportista);
    await page.goto(`${BASE}/mis-traslados`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const inicial = await estadoGuardado(page);
    const target = inicial?.requests
      ?.filter((r) => r.type === 'traslado' && r.carrierId === USUARIOS.transportista.carrierId &&
        r.from?.siteId === 'sondika' && r.status !== 'terminada' && r.status !== 'cancelada' &&
        !r.keysReadyAt && !r.pickedUpAt)
      .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.createdAt.localeCompare(b.createdAt))[0];
    ok('10 · hay un traslado de Sondika esperando llaves', !!target);

    if (target) {
      const vehiculo = inicial.vehicles.find((v) => v.id === target.vehicleId);
      const ref = vehiculo?.plate ?? vehiculo?.vin8 ?? target.vehicleId;
      const cardPendiente = page.getByTestId('transfer-card').filter({ hasText: ref }).first();
      ok('10 · el transportista ve las llaves pendientes', (await cardPendiente.textContent() ?? '').includes('Llaves pendientes'));
      ok('10 · no puede recogerlas antes de tiempo', (await cardPendiente.getByText('🔑 He recogido las llaves').count()) === 0);

      await cambiarDeUsuario(context, page, USUARIOS.logistica, `${BASE}/solicitudes`);
      await page.waitForTimeout(800);
      const antesLogistica = await estadoGuardado(page);
      const cola = antesLogistica.requests
        .filter((r) => r.type === 'traslado' && r.from?.siteId === 'sondika' &&
          r.status !== 'terminada' && r.status !== 'cancelada' && !r.keysReadyAt && !r.pickedUpAt)
        .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.createdAt.localeCompare(b.createdAt));
      const indice = cola.findIndex((r) => r.id === target.id);
      ok('10 · Logística lo tiene en «Llaves por preparar»', indice >= 0);
      if (indice >= 0) {
        await page.getByText('🔑 Llaves preparadas', { exact: true }).nth(indice).click();
        await page.waitForTimeout(700);
      }
      const trasPreparar = await estadoGuardado(page);
      const preparado = trasPreparar.requests.find((r) => r.id === target.id);
      ok('10 · al prepararlas queda quién y cuándo', !!preparado?.keysReadyAt && preparado?.keysReadyBy === USUARIOS.logistica.id);

      await cambiarDeUsuario(context, page, USUARIOS.transportista, `${BASE}/mis-traslados`);
      await page.waitForTimeout(800);
      const cardLista = page.getByTestId('transfer-card').filter({ hasText: ref }).first();
      ok('11 · el transportista las ve listas', (await cardLista.textContent() ?? '').includes('Llaves listas'));
      await cardLista.getByText('🔑 He recogido las llaves').click();
      await page.waitForTimeout(700);

      const despues = await estadoGuardado(page);
      const req = despues?.requests?.find((r) => r.id === target.id);
      const coche = despues?.vehicles?.find((v) => v.id === target.vehicleId);
      const reciente = req?.pickedUpAt && Date.now() - new Date(req.pickedUpAt).getTime() < 60_000;
      const horas = req?.pickedUpAt && req?.dueAt
        ? (new Date(req.dueAt).getTime() - new Date(req.pickedUpAt).getTime()) / 3_600_000
        : 0;
      ok('11 · se guarda la hora de recogida', !!reciente);
      ok('11 · el plazo arranca ahí: 48 h justas', horas === 48, `${horas} h`);
      ok('11 · el vehículo pasa a «En traslado»', coche?.status === 'en_traslado', coche?.status ?? '');
      ok('11 · la trazabilidad habla de llaves recogidas',
        despues.events.some((e) => e.vehicleId === target.vehicleId && e.title.startsWith('Llaves recogidas')));

      await pulsar(page, 'Los llevo yo');
      await page.waitForTimeout(700);
      const cardRuta = page.getByTestId('transfer-card').filter({ hasText: ref }).first();
      ok('11 · pasa a «Los llevo yo»', (await cardRuta.textContent() ?? '').includes('En ruta'));
    }

    ok('11 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

"""
p.write_text(s[:inicio] + bloque + s[fin:])

# 12) Tarjeta identificable para que la regresión Chromium apunte al traslado correcto.
repl(
    "app/(shell)/mis-traslados.tsx",
    """  return (
    <View
      style={{
        borderWidth: 1,""",
    """  return (
    <View
      testID=\"transfer-card\"
      style={{
        borderWidth: 1,""",
)
repl(
    "app/(shell)/mis-traslados.tsx",
    """                Nada por recoger. Cuando logística te asigne un traslado aparecerá aquí; puedes cerrar la
                app, que te llegará un aviso.""",
    """                Nada por recoger. Cuando logística te asigne un traslado aparecerá aquí en cuanto el
                dispositivo sincronice.""",
)
