import { USUARIOS, entrarComo, elegirEnLista, estadoGuardado, marcador, pulsar } from './entorno.mjs';

/**
 * La jornada de cada rol, de principio a fin.
 *
 * `funciones.mjs` comprueba operaciones concretas. Esto comprueba otra cosa:
 * que cada persona puede hacer su trabajo entero con la aplicación, y que
 * lo que no le toca no lo ve ni lo puede tocar.
 *
 * Se mira siempre lo que queda guardado, no lo que se pinta: una pantalla
 * puede enseñar algo correcto y no haber registrado nada.
 */
export async function ejecutar(browser, BASE) {
  const { ok, resumen } = marcador();

  /* ═══════════════════════════════ ADMINISTRADOR ═══════════════════════ */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.admin, 1440);

    // 1 · El panel de control, que es suyo y de nadie más de serie.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const panel = await page.evaluate(() => document.body.innerText);
    ok('ADMIN · entra en el centro de control', panel.includes('Centro de control'));
    ok('ADMIN · con la flota contada', /FLOTA TOTAL/i.test(panel));
    ok('ADMIN · y el menú completo', panel.includes('Administración') && panel.includes('Recuentos'));

    // 2 · Cambia un objetivo de preparación y queda guardado.
    await page.goto(`${BASE}/administracion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const campoVN = page.getByText('Vehículo nuevo (VN) · minutos', { exact: false }).first();
    ok('ADMIN · puede configurar los objetivos', await campoVN.isVisible());

    await page.locator('input').filter({ hasNot: page.locator('[type=password]') }).first().waitFor();
    const inputs = page.locator('input');
    await inputs.nth(0).fill('135');
    await page.waitForTimeout(1200);
    const cfg = await estadoGuardado(page);
    ok(
      'ADMIN · el objetivo de VN queda guardado',
      cfg?.config?.prepTargetMinutes?.VN === 135,
      String(cfg?.config?.prepTargetMinutes?.VN)
    );

    // 3 · Da de alta un usuario nuevo.
    // Las pestañas de Administración son botones, no un desplegable.
    await pulsar(page, 'Usuarios y roles', { exact: true });
    await page.waitForTimeout(800);
    const textoUsuarios = await page.evaluate(() => document.body.innerText);
    ok('ADMIN · ve los usuarios y sus roles', textoUsuarios.includes('Marta Ibarra'));
    // Los permisos se editan en la pestaña de roles.
    await pulsar(page, 'Roles ·');
    await page.waitForTimeout(700);
    await pulsar(page, 'Editar permisos');
    await page.waitForTimeout(800);
    ok(
      'ADMIN · y edita los permisos de un rol',
      (await page.evaluate(() => document.body.innerText)).includes('Ver el panel de control')
    );

    ok('ADMIN · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ═══════════════════════════════ LOGÍSTICA ═══════════════════════════ */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.logistica, 1440);

    // 1 · No ve el panel: aterriza en su trabajo.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    ok(
      'LOGÍSTICA · no entra al panel de dirección',
      !(await page.evaluate(() => document.body.innerText)).includes('Centro de control'),
      page.url()
    );

    // 2 · Cierra una incidencia abierta.
    await page.goto(`${BASE}/incidencias`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const abiertasAntes = await page.evaluate(() => document.body.innerText);
    ok('LOGÍSTICA · ve las incidencias', abiertasAntes.includes('Incidencias'));

    // La primera fila: las de arriba son las abiertas.
    await pulsar(page, 'Ver', { exact: true, primero: true });
    await page.waitForTimeout(700);
    const tieneCerrar = await page
      .getByText('✓ Cerrar incidencia', { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    ok('LOGÍSTICA · puede cerrar incidencias', tieneCerrar);
    if (tieneCerrar) {
      await pulsar(page, '✓ Cerrar incidencia');
      await page.waitForTimeout(1000);
      const s = await estadoGuardado(page);
      ok(
        'LOGÍSTICA · la incidencia queda cerrada con fecha',
        s?.incidents?.some((i) => i.status === 'cerrada' && i.closedAt),
        'cerrada'
      );
    }

    // 3 · Crea una regla de aviso.
    await page.goto(`${BASE}/notificaciones`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    // El número de reglas se lee de la propia pestaña: al arrancar limpio
    // todavía no hay nada guardado en el dispositivo.
    const leerReglas = async () =>
      Number((await page.evaluate(() => document.body.innerText)).match(/Reglas · (\d+)/)?.[1] ?? -1);
    const reglasAntes = await leerReglas();
    await pulsar(page, '+ Nueva regla');
    await page.waitForTimeout(700);
    await pulsar(page, 'Crear notificación', { exact: true });
    await page.waitForTimeout(1000);
    const reglasDespues = await leerReglas();
    ok(
      'LOGÍSTICA · puede crear una regla de aviso',
      reglasDespues === reglasAntes + 1,
      `${reglasAntes} → ${reglasDespues}`
    );

    // 4 · El histórico de movimientos.
    await page.goto(`${BASE}/movimientos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    ok(
      'LOGÍSTICA · consulta el histórico de movimientos',
      (await page.evaluate(() => document.body.innerText)).includes('Movimientos')
    );

    ok('LOGÍSTICA · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ═══════════════════════════════ PREPARADOR ══════════════════════════ */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.preparador, 420);

    await page.goto(`${BASE}/mi-trabajo`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const trabajo = await page.evaluate(() => document.body.innerText);
    ok('PREPARADOR · abre su trabajo del día', trabajo.includes('Hola, Pedro'));
    ok('PREPARADOR · con sus preparaciones contadas', /PREPARACIONES/i.test(trabajo));

    // Dónde está el coche: sin esto sabe qué le toca pero no a dónde ir.
    await page.goto(`${BASE}/mi-preparacion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1100);
    const cola = await page.evaluate(() => document.body.innerText);
    ok('PREPARADOR · su cola dice dónde está cada coche', cola.includes('📍'), cola.match(/📍[^\n]*/)?.[0] ?? '');
    ok(
      'PREPARADOR · con sede, zona y plaza',
      /📍\s*\w+ · (Tej\.|P\.|Tejavana|Parking)/.test(cola),
      cola.match(/📍[^\n]*/)?.[0] ?? ''
    );

    // Si el coche está en otra sede, se avisa: no se puede empezar todavía.
    const enOtraSede = /📍\s*(Sondika|Galdakao|Anoeta|Irun)/.test(cola);
    ok(
      'PREPARADOR · y avisa si el coche aún no ha llegado',
      !enOtraSede || cola.includes('Todavía no está en'),
      enOtraSede ? (cola.match(/Todavía no está en [^\n.]*/)?.[0] ?? 'sin aviso') : 'todos en su sede'
    );

    // Y al abrirla para trabajar, también. El botón de la primera tarjeta
    // depende de si está empezada o solo pedida: vale cualquiera de ellos.
    await pulsar(page, /Empezar|Reanudar|Seguir trabajando/, { primero: true });
    await page.waitForTimeout(1000);
    const dentro = await page.evaluate(() => document.body.innerText);
    ok('PREPARADOR · y también al abrir la preparación', dentro.includes('📍'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Recuento completo: crear, comprobar un coche y cerrar.
    await page.goto(`${BASE}/recuentos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const antes = await estadoGuardado(page);
    const abierto = antes?.counts?.find((c) => !c.closedAt);
    if (abierto) {
      await pulsar(page, '✓ Cerrar recuento');
      await page.waitForTimeout(900);
    }

    await pulsar(page, '+ Nuevo recuento');
    await page.waitForTimeout(700);
    await elegirEnLista(page, /^Sondika$/, 'Leioa');
    await page.waitForTimeout(400);
    await pulsar(page, 'Crear recuento', { exact: true });
    await page.waitForTimeout(1000);

    const conRecuento = await estadoGuardado(page);
    const nuevo = conRecuento?.counts?.find((c) => !c.closedAt);
    ok('PREPARADOR · abre un recuento en su sede', !!nuevo && nuevo.siteId === 'leioa', nuevo?.code ?? '');
    ok('PREPARADOR · con los coches que espera encontrar', (nuevo?.expected?.length ?? 0) > 0, `${nuevo?.expected?.length} esperados`);

    // Comprueba un coche del recuento.
    const matricula = conRecuento?.vehicles?.find((v) => nuevo?.expected?.includes(v.id) && v.plate)?.plate;
    await pulsar(page, '📷 Escanear vehículo');
    await page.waitForTimeout(700);
    await page.getByPlaceholder('Ej.: 4821 LKM o 12345678').fill(matricula ?? '');
    await page.waitForTimeout(700);
    await pulsar(page, 'Confirmar comprobación');
    await page.waitForTimeout(1000);

    const trasContar = await estadoGuardado(page);
    const recuento = trasContar?.counts?.find((c) => c.id === nuevo?.id);
    ok('PREPARADOR · el coche queda comprobado en el recuento', (recuento?.found?.length ?? 0) === 1, matricula ?? '');

    // El escáner se queda abierto para seguir contando: se cierra antes.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/recuentos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await pulsar(page, '✓ Cerrar recuento');
    await page.waitForTimeout(1000);
    const cerrado = (await estadoGuardado(page))?.counts?.find((c) => c.id === nuevo?.id);
    ok('PREPARADOR · y lo cierra al terminar', !!cerrado?.closedAt);

    // Lo que no le toca, no lo ve.
    await page.goto(`${BASE}/administracion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const bloqueo = await page.evaluate(() => document.body.innerText);
    ok(
      'PREPARADOR · no entra en Administración',
      /no tiene (acceso|permiso)/.test(bloqueo),
      bloqueo.split('\n').slice(0, 3).join(' · ')
    );

    ok('PREPARADOR · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ═══════════════════════════════ RECEPCIÓN ═══════════════════════════ */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.recepcion, 420);

    await page.goto(`${BASE}/campa`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const campa = await page.evaluate(() => document.body.innerText);
    ok('RECEPCIÓN · ve la campa de Sondika', campa.includes('Sondika'));
    ok('RECEPCIÓN · con la ocupación de las tejavanas', /Tejavana|Parking/.test(campa));

    // Registra una incidencia desde la ficha de un vehículo de su sede.
    await page.goto(`${BASE}/flota`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const placa = await page.evaluate(() => {
      const t = [...document.querySelectorAll('div')].map((d) => d.textContent ?? '').join('\n');
      const m = t.match(/\b\d{4}\s?[A-Z]{3}\b/);
      return m ? m[0] : null;
    });
    await page.goto(`${BASE}/vehiculo/${encodeURIComponent(placa ?? '')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const incidenciasAntes = (await estadoGuardado(page))?.incidents?.length ?? null;
    await pulsar(page, '📸 Incidencia');
    await page.waitForTimeout(700);
    await page.getByPlaceholder('Ej.: golpe en paragolpes trasero').first().fill('Rayón en la puerta');
    await page.waitForTimeout(300);
    await pulsar(page, 'Registrar incidencia');
    await page.waitForTimeout(300);
    await page.waitForTimeout(1000);

    const sInc = await estadoGuardado(page);
    const creada = sInc?.incidents?.find((i) => i.description === 'Rayón en la puerta');
    ok('RECEPCIÓN · registra una incidencia con foto o sin ella', !!creada, creada?.type ?? 'no se creó');
    ok('RECEPCIÓN · la incidencia nace abierta', creada?.status === 'abierta');
    ok(
      'RECEPCIÓN · y el coche queda activo en la operativa',
      sInc?.vehicles?.find((v) => v.id === creada?.vehicleId)?.logisticActive === true
    );

    // Pero no puede cerrarla: eso es de la oficina.
    await page.goto(`${BASE}/incidencias`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await pulsar(page, 'Ver', { exact: true, primero: true });
    await page.waitForTimeout(700);
    ok(
      'RECEPCIÓN · no puede cerrar incidencias',
      !(await page.getByText('✓ Cerrar incidencia', { exact: false }).first().isVisible().catch(() => false))
    );

    ok('RECEPCIÓN · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ═══════════════════════════════ COMERCIAL ═══════════════════════════ */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.comercial, 1440);

    await page.goto(`${BASE}/entregas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    ok(
      'COMERCIAL · ve sus entregas comprometidas',
      (await page.evaluate(() => document.body.innerText)).includes('Entregas')
    );

    // Fija una fecha de entrega desde la ficha del coche.
    await page.goto(`${BASE}/flota`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const placa = await page.evaluate(() => {
      const t = [...document.querySelectorAll('div')].map((d) => d.textContent ?? '').join('\n');
      const m = t.match(/\b\d{4}\s?[A-Z]{3}\b/);
      return m ? m[0] : null;
    });
    await page.goto(`${BASE}/vehiculo/${encodeURIComponent(placa ?? '')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    ok(
      'COMERCIAL · puede fijar la fecha de entrega',
      await page.getByText('En 1 semana', { exact: true }).first().isVisible()
    );
    await pulsar(page, 'En 1 semana', { exact: true });
    await page.waitForTimeout(1000);

    const s = await estadoGuardado(page);
    const coche = s?.vehicles?.find((v) => v.plate === placa);
    ok('COMERCIAL · la fecha queda guardada en el coche', !!coche?.deliveryDate, coche?.deliveryDate ?? '');

    // Se queda un coche libre. Los coches llegan de Quiter sin comercial,
    // así que esto es lo que hace todos los días al vender uno.
    const libre = (s?.vehicles ?? []).find((v) => !v.salesRep && !v.archivedAt);
    await page.goto(`${BASE}/vehiculo/${encodeURIComponent(libre?.id ?? '')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    ok(
      'COMERCIAL · puede asignarse un coche sin comercial',
      await page.getByText('Asignármelo', { exact: true }).first().isVisible(),
      libre?.plate ?? ''
    );
    await pulsar(page, 'Asignármelo', { exact: true });
    await page.waitForTimeout(1000);
    const tras = await estadoGuardado(page);
    ok(
      'COMERCIAL · queda guardado a su nombre',
      tras?.vehicles?.find((v) => v.id === libre?.id)?.salesRep === 'Juan Bilbao',
      String(tras?.vehicles?.find((v) => v.id === libre?.id)?.salesRep)
    );
    // Y con su apunte en la trazabilidad: quién lo cogió y cuándo.
    ok(
      'COMERCIAL · con el apunte en la trazabilidad',
      (tras?.events ?? []).some((e) => e.vehicleId === libre?.id && e.title === 'Comercial asignado')
    );

    // Lo suelta: el coche vuelve a quedar libre para otro.
    await pulsar(page, 'Soltarlo', { exact: true });
    await page.waitForTimeout(1000);
    ok(
      'COMERCIAL · y puede soltarlo',
      !(await estadoGuardado(page))?.vehicles?.find((v) => v.id === libre?.id)?.salesRep
    );

    // Pero un coche de otro comercial no se lo puede quitar él solo.
    const deOtro = (tras?.vehicles ?? []).find(
      (v) => v.salesRep && !'juan bilbao'.startsWith(v.salesRep.trim().toLowerCase())
    );
    await page.goto(`${BASE}/vehiculo/${encodeURIComponent(deOtro?.id ?? '')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const fichaOtro = await page.evaluate(() => document.body.innerText);
    ok(
      'COMERCIAL · no le quita un coche a otro comercial',
      fichaOtro.includes('Lo lleva otro comercial') && !fichaOtro.includes('Asignármelo'),
      deOtro?.salesRep ?? ''
    );

    // Y no puede tocar la configuración ni abrir preparaciones.
    await page.goto(`${BASE}/administracion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    ok(
      'COMERCIAL · no entra en Administración',
      /no tiene (acceso|permiso)/.test(await page.evaluate(() => document.body.innerText))
    );
    await page.goto(`${BASE}/preparacion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    ok(
      'COMERCIAL · ni en el panel de preparación',
      /no tiene (acceso|permiso)/.test(await page.evaluate(() => document.body.innerText))
    );

    ok('COMERCIAL · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ═════════════════════════ TRANSPORTISTA (EXTERNO) ═══════════════════ */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.transportista, 420);

    await page.goto(`${BASE}/mis-traslados`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const suyos = await page.evaluate(() => document.body.innerText);
    ok('TRANSPORTISTA · ve sus traslados', suyos.includes('traslado') || suyos.includes('Traslados'));
    ok('TRANSPORTISTA · sin menú lateral ni pestañas', !suyos.includes('Administración') && !suyos.includes('Recuentos'));

    // Ni la flota, ni la campa, ni las incidencias de los demás.
    for (const ruta of ['/flota', '/campa', '/incidencias', '/administracion', '/']) {
      await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      const t = await page.evaluate(() => document.body.innerText);
      const dentro = t.includes('Flota') && t.includes('VIN-8');
      ok(`TRANSPORTISTA · ${ruta} no le abre la flota`, !dentro, page.url());
    }

    ok('TRANSPORTISTA · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  return resumen();
}
