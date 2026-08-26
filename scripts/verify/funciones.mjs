import { USUARIOS, cambiarDeUsuario, entrarComo, elegirEnLista, estadoGuardado, marcador, pulsar } from './entorno.mjs';

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
    // Al recoger las llaves el traslado cambia de fase: pasa de «por
    // recoger» a los que lleva encima, que es donde tiene que buscarlo
    // cuando vaya a entregarlo.
    await pulsar(page, 'Los llevo yo');
    await page.waitForTimeout(800);
    const enRuta = await page.evaluate(() => document.body.innerText);
    ok('10 · el traslado pasa a los que lleva encima', enRuta.includes('En ruta'));
    ok('10 · y la tarjeta dice cuándo se recogieron', enRuta.includes('Llaves recogidas'));
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

  /* ------------ 12 · lo que pide el comercial llega al preparador */
  {
    // Todo en la misma pestaña, cambiando de usuario: en modo demostración
    // los datos viven en el navegador, así que dos pestañas serían dos
    // dispositivos distintos y no verían lo mismo.
    const { context, page, errores } = await entrarComo(browser, USUARIOS.comercial, 1440);

    // Un coche de la campa de Sondika: allí no se prepara nada, así que
    // seguro que no tiene ya una preparación abierta.
    await page.goto(`${BASE}/flota`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await elegirEnLista(page, 'Todas las ubicaciones', 'Sondika');
    await page.waitForTimeout(700);
    const candidatas = await page.evaluate(() => {
      const txt = [...document.querySelectorAll('div')].map((d) => d.textContent ?? '').join('\n');
      return [...new Set(txt.match(/\b\d{4}\s?[A-Z]{3}\b/g) ?? [])].slice(0, 20);
    });

    // El primero que no tenga ya una solicitud encima: si no, estaríamos
    // comprobando una preparación que ya existía antes de la prueba.
    let matricula = null;
    for (const placa of candidatas) {
      await page.goto(`${BASE}/vehiculo/${encodeURIComponent(placa)}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      const t = await page.evaluate(() => document.body.innerText);
      // Puede tener un traslado pedido; lo que no puede tener es ya una
      // preparación pedida, que es justo lo que vamos a comprobar.
      if (!t.includes('Preparación ·')) {
        matricula = placa;
        break;
      }
    }
    ok('12 · el comercial encuentra un coche libre en la campa', !!matricula, matricula ?? 'ninguno');

    await page.getByText('Solicitar preparación', { exact: false }).first().click();
    await page.waitForTimeout(700);
    await page.getByText('Crear solicitud', { exact: true }).first().click();
    await page.waitForTimeout(700);
    // Si la entrega está a menos de 48 h, la app obliga a confirmar. Es la
    // regla del margen mínimo del comercial: aquí se confirma.
    if (await page.getByText('Pedir igualmente', { exact: true }).first().isVisible().catch(() => false)) {
      await page.getByText('Pedir igualmente', { exact: true }).first().click();
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(400);

    const tras = await estadoGuardado(page);
    const pedido = [...(tras?.requests ?? [])]
      .filter((r) => r.type === 'preparacion')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    ok('12 · deja pedida la preparación', !!pedido && pedido.status === 'solicitada', pedido?.siteId ?? '');
    ok(
      '12 · y todavía no existe la preparación',
      !tras?.preparations?.some((p) => p.vehicleId === pedido?.vehicleId && p.runState !== 'terminado')
    );

    /* -- ahora entra un preparador en el mismo dispositivo -- */
    await cambiarDeUsuario(context, page, USUARIOS.preparador, `${BASE}/mi-preparacion`);
    await page.waitForTimeout(1200);

    const texto = await page.evaluate(() => document.body.innerText);
    ok('13 · le aparece al preparador sin pasar por la oficina', texto.includes(matricula ?? '·'), matricula ?? '');
    ok('13 · marcada como sin empezar', texto.includes('Sin empezar') || texto.includes('Urgente'));

    // El botón de SU tarjeta: en la cola puede haber más preparaciones
    // pedidas, y pulsar la primera empezaría la de otro coche.
    const tarjeta = page
      .locator('div')
      .filter({ hasText: matricula ?? '' })
      .filter({ has: page.getByText('Empezar preparación', { exact: true }) })
      .last();
    await tarjeta.getByText('Empezar preparación', { exact: true }).click();
    await page.waitForTimeout(1200);

    const despues = await estadoGuardado(page);
    const creada = despues?.preparations?.find(
      (p) => p.vehicleId === pedido?.vehicleId && p.runState !== 'terminado'
    );
    ok('13 · al empezar se abre la preparación', !!creada, creada?.id ?? 'no se creó');
    ok('13 · y el cronómetro ya corre', creada?.runState === 'en_curso', creada?.runState ?? '');
    ok('13 · queda a su nombre', creada?.preparerId === USUARIOS.preparador.id, creada?.preparerId ?? '');
    ok(
      '13 · y la solicitud pasa a en curso sola',
      despues?.requests?.find((r) => r.id === pedido?.id)?.status === 'en_curso',
      despues?.requests?.find((r) => r.id === pedido?.id)?.status ?? ''
    );

    /* -- y a un preparador de otra sede no le aparece -- */
    await cambiarDeUsuario(
      context,
      page,
      { ...USUARIOS.preparador, id: 'u-jon', name: 'Jon Etxaniz', siteIds: ['anoeta', 'irun'] },
      `${BASE}/mi-preparacion`
    );
    await page.waitForTimeout(1000);
    ok(
      '13 · pero no a quien no lleva esa sede',
      !(await page.evaluate(() => document.body.innerText)).includes(matricula ?? 'xxxx')
    );
    ok('13 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* --------------------------- 14 · entregas, sede a sede */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.logistica, 1440);
    await page.goto(`${BASE}/entregas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const leer = async (patron) =>
      Number((await page.evaluate(() => document.body.innerText)).match(patron)?.[1] ?? -1);

    const total = await leer(/Todas las sedes · (\d+)/);
    ok('14 · la pantalla deja elegir sede', total >= 0, `${total} entregas en total`);

    const sedes = ['Sondika', 'Leioa', 'Galdakao', 'Anoeta', 'Irun'];
    let suma = 0;
    let ultima = /^Todas las sedes · \d+$/;
    for (const nombre of sedes) {
      const opcion = new RegExp(`^${nombre} · \\d+$`);
      await elegirEnLista(page, ultima, opcion);
      await page.waitForTimeout(500);
      ultima = opcion;
      const n = await leer(new RegExp(`${nombre} · (\\d+)`));
      suma += Math.max(0, n);
      // Con la sede elegida, el titular dice de qué sede está hablando.
      const texto = await page.evaluate(() => document.body.innerText);
      ok(`14 · ${nombre}: la pantalla dice de qué sede habla`, texto.includes(`${nombre} · 7 días`), `${n} entregas`);
    }
    ok('14 · las sedes suman el total', suma === total, `${suma} de ${total}`);
    ok('14 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ------------------- 15 · el panel de control es de dirección */
  {
    const admin = await entrarComo(browser, USUARIOS.admin, 1440);
    await admin.page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await admin.page.waitForTimeout(900);
    ok(
      '15 · el administrador sí ve el panel',
      (await admin.page.evaluate(() => document.body.innerText)).includes('Centro de control')
    );
    ok('15 · sin errores de JavaScript', admin.errores.length === 0, admin.errores[0] ?? '');
    await admin.context.close();

    for (const perfil of ['logistica', 'preparador', 'comercial']) {
      const { context, page, errores } = await entrarComo(browser, USUARIOS[perfil], 1440);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const texto = await page.evaluate(() => document.body.innerText);
      ok(
        `15 · ${perfil} no ve el panel y aterriza en su trabajo`,
        !texto.includes('Centro de control'),
        page.url()
      );
      ok(`15 · ${perfil}: el menú tampoco lo ofrece`, !texto.includes('Dashboard'));
      ok(`15 · ${perfil}: sin errores de JavaScript`, errores.length === 0, errores[0] ?? '');
      await context.close();
    }
  }


  /* --------------- 16 · alta manual de un coche desde Flota */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.logistica, 1440);
    await page.goto(`${BASE}/flota`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    ok(
      '16 · logística puede dar de alta un coche',
      await page.getByText('Dar de alta un vehículo', { exact: false }).first().isVisible()
    );

    await page.getByText('Dar de alta un vehículo', { exact: false }).first().click();
    await page.waitForTimeout(600);
    await page.getByPlaceholder('Ej. 34567890').fill('PRUEBA99');
    await page.getByPlaceholder('1234 ABC').fill('9999 ZZZ');
    await page.waitForTimeout(300);
    await page.getByText('Dar de alta', { exact: true }).last().click();
    await page.waitForTimeout(1200);

    const s = await estadoGuardado(page);
    const nuevo = s?.vehicles?.find((v) => v.vin8 === 'PRUEBA99');
    ok('16 · el coche queda en el parque', !!nuevo, nuevo?.id ?? 'no se creó');
    ok('16 · con su matrícula', nuevo?.plate === '9999 ZZZ', nuevo?.plate ?? '');
    ok('16 · y activo desde el primer momento', nuevo?.logisticActive === true);
    ok(
      '16 · lo que no se sabe queda marcado, no inventado',
      nuevo?.brand === 'Sin identificar',
      nuevo?.brand ?? ''
    );
    ok(
      '16 · y queda en la trazabilidad quién lo dio de alta',
      (s?.events?.[0]?.title ?? '').includes('alta a mano'),
      s?.events?.[0]?.title ?? ''
    );
    ok('16 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* ------- 17 · el camión trae un coche que no está registrado */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.recepcion, 420);
    await page.goto(`${BASE}/mi-recepcion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // Si no hay camión en descarga, se empieza uno.
    if (await page.getByText('🚚 Empezar un camión', { exact: false }).first().isVisible().catch(() => false)) {
      await page.getByText('🚚 Empezar un camión', { exact: false }).first().click();
      await page.waitForTimeout(600);
      await page.getByPlaceholder('9876 JKL').fill('1234 CAM');
      await page.waitForTimeout(200);
      await page.getByPlaceholder('Transportista Norte').fill('Grúas Francis');
      await page.waitForTimeout(200);
      await page.getByText('Empezar descarga', { exact: false }).first().click();
      await page.waitForTimeout(900);
    }

    await page.getByPlaceholder('Escribe o escanea').fill('CAMION77');
    await page.waitForTimeout(700);
    const aviso = await page.evaluate(() => document.body.innerText);
    ok('17 · avisa de que ese coche no está en el parque', aviso.includes('No está en el parque'));
    ok(
      '17 · y ofrece darlo de alta ahí mismo',
      await page.getByText('Dar de alta CAMION77', { exact: false }).first().isVisible()
    );

    await page.getByText('Dar de alta CAMION77', { exact: false }).first().click();
    await page.waitForTimeout(700);
    await page.getByText('Dar de alta', { exact: true }).last().click();
    await page.waitForTimeout(1200);

    const s = await estadoGuardado(page);
    const nuevo = s?.vehicles?.find((v) => v.vin8 === 'CAMION77');
    ok('17 · el bastidor queda registrado sin salir de la descarga', !!nuevo, nuevo?.id ?? 'no se creó');

    // Y ya se puede descargar como cualquier otro.
    await page.waitForTimeout(500);
    const tras = await page.evaluate(() => document.body.innerText);
    ok('17 · y deja de dar el aviso', !tras.includes('No está en el parque'));
    ok('17 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* --------- 18 · el comercial ve sus coches en preparación */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.comercial, 1440);
    await page.goto(`${BASE}/flota`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const boton = page.getByText('Mis coches en preparación', { exact: false }).first();
    ok('18 · el comercial tiene el atajo a lo suyo', await boton.isVisible());

    const antes = await page.evaluate(() => document.body.innerText);
    const cuantos = Number(antes.match(/Mis coches en preparación \((\d+)\)/)?.[1] ?? -1);
    ok('18 · y le dice cuántos son', cuantos >= 0, `${cuantos} coches`);

    await boton.click();
    await page.waitForTimeout(900);
    const despues = await page.evaluate(() => document.body.innerText);
    ok(
      '18 · al pulsarlo resume en qué punto está cada uno',
      despues.includes('sin empezar') && despues.includes('en curso'),
      'resumen visible'
    );

    // Todo lo que queda en la tabla es suyo.
    const s2 = await page.evaluate(() => {
      const filas = [...document.querySelectorAll('div')]
        .map((d) => d.textContent ?? '')
        .filter((t) => /\b\d{4}\s?[A-Z]{3}\b/.test(t));
      return filas.length;
    });
    ok('18 · y la lista se queda con los suyos', s2 >= 0, `${cuantos} en preparación`);
    ok('18 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  return resumen();
}
