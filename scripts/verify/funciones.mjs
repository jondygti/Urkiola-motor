import { USUARIOS, entrarComo, elegirEnLista, estadoGuardado, marcador } from './entorno.mjs';

/**
 * Comprobaciones de la operativa: no que las pantallas carguen, sino que
 * el trabajo del día se pueda hacer y quede bien registrado.
 *
 * Cada bloque abre una sesión limpia con un perfil distinto, hace lo que
 * haría esa persona, y comprueba el resultado en los datos guardados —no
 * en la pantalla—, que es donde se ve si el registro es correcto.
 */
export async function ejecutar(browser, BASE) {
  const { ok, resumen } = marcador();

  /* ---------------------------------------------- 1 · mover en dos pasos */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.preparador);
    await page.goto(`${BASE}/flota`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    // Primera matrícula visible en la lista de flota.
    const ref = await page.evaluate(() => {
      const txt = [...document.querySelectorAll('div')].map((d) => d.textContent ?? '');
      const m = txt.join('\n').match(/\b\d{4}\s?[A-Z]{3}\b/);
      return m ? m[0] : null;
    });

    await page.goto(`${BASE}/mover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    ok('1 · el preparador abre «Mover coche»', await page.getByText('Mover coche').first().isVisible());

    await page.getByPlaceholder('1234 ABC').fill(ref ?? '');
    await page.waitForTimeout(400);
    const ficha = await page.getByText('Ahora en', { exact: false }).first().textContent().catch(() => null);
    ok('1 · identifica el coche por matrícula', !!ficha, `${ref} · ${ficha ?? ''}`);

    // Zona de destino: se elige una tejavana/parking cualquiera de la sede.
    const zonaAntes = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/(Tejavana \d\d|Parking \d\d)/g);
      return m ? m[0] : null;
    });
    await elegirEnLista(page, zonaAntes ?? 'Elige zona', 'Parking 03');
    const boton = page.getByText('✓ Mover a', { exact: false }).first();
    ok('1 · el botón dice a dónde va', await boton.isVisible(), (await boton.textContent()) ?? '');

    await boton.click();
    await page.waitForTimeout(600);
    const despues = await estadoGuardado(page);
    const mov = despues?.movements?.[0];
    const veh = despues?.vehicles?.find((v) => v.id === mov?.vehicleId);
    ok(
      '2 · queda registrado el movimiento',
      !!mov && mov.to.zoneId?.includes('park-03'),
      mov ? `${mov.from?.zoneId ?? '—'} → ${mov.to.zoneId}` : 'sin movimiento'
    );
    ok('2 · el coche cambia de ubicación en su ficha', veh?.location?.zoneId === mov?.to.zoneId);
    ok(
      '2 · vale como comprobación física',
      !!veh?.lastCheckAt && veh.lastCheckAt === mov?.at,
      veh?.lastCheckBy ?? ''
    );
    ok('2 · lo firma quien lo mueve', mov?.userId === 'u-pedro' && Date.now() - new Date(mov.at).getTime() < 60_000);

    // Encadenar: el campo se vacía y el destino se queda puesto.
    const campoVacio = (await page.getByPlaceholder('1234 ABC').inputValue()) === '';
    const etiqueta = (await page.getByText('✓ Mover a', { exact: false }).first().textContent()) ?? '';
    ok('3 · el campo queda vacío para el siguiente', campoVacio);
    ok('3 · el destino se mantiene puesto', etiqueta.includes('P.03'), etiqueta);
    ok('3 · lleva la cuenta de lo movido', await page.getByText('Movidos ahora (1)').isVisible());

    ok('4 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ------------------------------- 2 · terminar preparación con ubicación */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.preparador);

    // El BMW X1 del mockup está en Sondika con la preparación abierta en
    // Leioa. Se mueve primero a Leioa para comprobar el atajo «se queda
    // donde está», que solo tiene sentido si el coche ya está en la sede.
    await page.goto(`${BASE}/mover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.getByPlaceholder('1234 ABC').fill('12345678');
    await page.waitForTimeout(400);
    await elegirEnLista(page, 'Sondika', 'Leioa');
    await elegirEnLista(page, /^(Tejavana|Parking) \d\d$/, 'Parking 03');
    await page.getByText('✓ Mover a', { exact: false }).first().click();
    await page.waitForTimeout(600);

    await page.goto(`${BASE}/mi-preparacion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const hayCola = await page.getByText('por preparar', { exact: false }).first().isVisible().catch(() => false);
    ok('5 · el preparador tiene cola de trabajo', hayCola);

    await page.getByText('12345678', { exact: true }).first().click();
    await page.waitForTimeout(500);
    await page.getByText('✓ Terminar', { exact: false }).first().click();
    await page.waitForTimeout(500);

    ok('5 · al terminar pregunta dónde lo deja', await page.getByText('¿Dónde dejas el coche?').isVisible());
    const atajo = await page
      .getByText('Se queda donde está', { exact: false })
      .first()
      .textContent()
      .catch(() => null);
    ok('5 · ofrece «se queda donde está»', !!atajo && atajo.includes('P.03'), atajo ?? 'no aparece');

    await elegirEnLista(page, 'Parking 03', 'Parking 02');
    const finalizar = page.getByText('✓ Terminar y dejarlo en', { exact: false }).first();
    ok('6 · el botón confirma el sitio', await finalizar.isVisible(), (await finalizar.textContent()) ?? '');

    await finalizar.click();
    await page.waitForTimeout(700);

    const s = await estadoGuardado(page);
    const prep = s?.preparations?.find((p) => p.runState === 'terminado' && p.finishedAt);
    const mov = s?.movements?.[0];
    const veh = s?.vehicles?.find((v) => v.id === prep?.vehicleId);
    ok('6 · la preparación queda terminada', !!prep, prep?.finishedAt ?? '');
    ok('6 · y genera el movimiento a la vez', mov?.note === 'Ubicación al terminar la preparación', mov?.to?.zoneId ?? '');
    ok('6 · el coche queda en el sitio indicado', veh?.location?.zoneId === mov?.to?.zoneId && veh?.location?.zoneId?.includes('park-02'));
    ok('6 · y sigue apto para entrega', veh?.status === 'apto_entrega', veh?.status ?? '');

    ok('7 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ----------------------------------------------------- 3 · permisos */
  {
    const { context, page } = await entrarComo(browser, USUARIOS.comercial);
    await page.goto(`${BASE}/mover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    ok('8 · el comercial también mueve coches', (await page.getByPlaceholder('1234 ABC').count()) === 1);

    await page.getByPlaceholder('1234 ABC').fill('4821 LKM');
    await page.waitForTimeout(400);
    await elegirEnLista(page, /^(Tejavana|Parking) \d\d$/, 'Parking 03');
    await page.getByText('✓ Mover a', { exact: false }).first().click();
    await page.waitForTimeout(600);
    const s = await estadoGuardado(page);
    ok('8 · y el movimiento queda a su nombre', s?.movements?.[0]?.userId === 'u-juan', s?.movements?.[0]?.to?.zoneId ?? '');

    // Lo que no le toca sigue cerrado.
    await page.goto(`${BASE}/recuentos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    ok(
      '8 · pero sigue sin entrar donde no le toca',
      await page.getByText('no tiene acceso a esta pantalla', { exact: false }).isVisible()
    );
    await context.close();
  }
  {
    const { context, page } = await entrarComo(browser, USUARIOS.transportista);
    await page.goto(`${BASE}/mover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const url = page.url();
    ok('8 · al transportista externo ni se le enseña', url.includes('mis-traslados'), url.replace(BASE, ''));
    await context.close();
  }
  {
    const { context, page } = await entrarComo(browser, USUARIOS.recepcion, 420);
    await page.goto(`${BASE}/mi-recepcion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const enBarra = await page.getByText('Mover coche', { exact: true }).first().isVisible().catch(() => false);
    ok('9 · recepción lo tiene en la barra del móvil', enBarra);
    await context.close();
  }
  {
    const { context, page } = await entrarComo(browser, USUARIOS.comercial, 420);
    await page.goto(`${BASE}/entregas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const enBarra = await page.getByText('Mover coche', { exact: true }).first().isVisible().catch(() => false);
    ok('9 · y el comercial también, en su móvil', enBarra);
    await context.close();
  }

  /* --------------------------------------------- 4 · recogida de llaves */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.transportista);
    await page.goto(`${BASE}/mis-traslados`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const antes = await page.evaluate(() => document.body.innerText);
    ok('10 · el transportista ve que faltan las llaves', antes.includes('Llaves sin recoger'));
    ok(
      '10 · y el botón habla de llaves, no de vehículo',
      await page.getByText('🔑 He recogido las llaves').first().isVisible()
    );

    await page.getByText('🔑 He recogido las llaves').first().click();
    await page.waitForTimeout(700);

    const s = await estadoGuardado(page);
    const req = s?.requests
      ?.filter((r) => r.type === 'traslado' && r.pickedUpAt)
      .sort((a, b) => new Date(b.pickedUpAt).getTime() - new Date(a.pickedUpAt).getTime())[0];
    const reciente = req && Date.now() - new Date(req.pickedUpAt).getTime() < 60_000;
    const horas = req ? (new Date(req.dueAt).getTime() - new Date(req.pickedUpAt).getTime()) / 3_600_000 : 0;
    ok('10 · al pulsarlo se guarda la hora de las llaves', !!reciente);
    ok('10 · y el plazo arranca ahí: 48 h justas', horas === 48, `${horas} h`);
    ok(
      '10 · la trazabilidad lo nombra por lo que es',
      (s?.events?.[0]?.title ?? '').startsWith('Llaves recogidas'),
      s?.events?.[0]?.title ?? ''
    );
    ok(
      '10 · y la tarjeta dice cuándo se recogieron',
      (await page.evaluate(() => document.body.innerText)).includes('Llaves recogidas')
    );
    ok('10 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.logistica, 1440);
    await page.goto(`${BASE}/solicitudes`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await elegirEnLista(page, 'Todos los tipos', 'Traslado');
    await elegirEnLista(page, 'Abiertas', 'Solicitada');
    await page.getByText('Gestionar', { exact: true }).first().click();
    await page.waitForTimeout(600);

    const modal = await page.evaluate(() => document.body.innerText);
    ok('11 · la oficina ve que el plazo no ha empezado', modal.includes('todavía no ha empezado'));
    ok(
      '11 · y tiene el botón para registrarlo ella',
      await page.getByText('🔑 Han recogido las llaves').first().isVisible()
    );

    await page.getByText('🔑 Han recogido las llaves').first().click();
    await page.waitForTimeout(700);
    const s = await estadoGuardado(page);
    const req = s?.requests
      ?.filter((r) => r.type === 'traslado' && r.pickedUpAt)
      .sort((a, b) => new Date(b.pickedUpAt).getTime() - new Date(a.pickedUpAt).getTime())[0];
    ok(
      '11 · queda registrado desde la oficina',
      !!req && Date.now() - new Date(req.pickedUpAt).getTime() < 60_000 && req.status === 'en_ruta',
      req?.status ?? ''
    );
    ok('11 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }
  return resumen();
}
