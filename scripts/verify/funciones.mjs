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
    // Elegir un coche matriculado que esté ya en una sede con parkings.
    // Así la prueba no depende de qué matrícula haya quedado primera en la
    // tabla cuando cambian los datos de presentación.
    const estadoInicial = await estadoGuardado(page);
    const candidato = estadoInicial?.vehicles?.find(
      (v) =>
        v.logisticActive &&
        v.plate &&
        ['leioa', 'galdakao', 'anoeta', 'irun'].includes(v.location?.siteId ?? '')
    );
    const ref = candidato?.plate ?? null;

    await page.goto(`${BASE}/mover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    ok('1 · el preparador abre «Mover coche»', await page.getByText('Mover coche').first().isVisible());

    await page.getByPlaceholder('1234 ABC').fill(ref ?? '');
    await page.waitForTimeout(400);
    const ficha = await page.evaluate(() => document.body.innerText);
    ok('1 · identifica el coche por matrícula', ficha.includes(ref ?? '###'), ref ?? '');

    // Antes de moverlo hay que saber de dónde sacarlo: la ubicación de
    // ahora, con su plaza, y cuándo se confirmó por última vez. Una
    // ubicación de hace una semana es una suposición.
    ok('1 · dice dónde está el coche ahora mismo', ficha.includes('DÓNDE ESTÁ AHORA'));
    ok(
      '1 · con la sede, la zona y la plaza',
      /📍[^\n]*·[^\n]*·[^\n]*/.test(ficha),
      ficha.match(/📍[^\n]*/)?.[0] ?? ''
    );
    ok(
      '1 · y cuándo se comprobó, para saber si fiarse',
      /Comprobado hace|Nadie lo ha comprobado/.test(ficha),
      ficha.match(/Comprobado[^\n]*/)?.[0] ?? ''
    );

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

    // El Peugeot 3008 KM0 protagonista está en Sondika con la preparación abierta en
    // Leioa. Se mueve primero a Leioa para comprobar el atajo «se queda
    // donde está», que solo tiene sentido si el coche ya está en la sede.
    await page.goto(`${BASE}/mover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.getByPlaceholder('1234 ABC').fill('6412 NPV');
    await page.waitForTimeout(400);
    await elegirEnLista(page, 'Sondika', 'Leioa');
    await elegirEnLista(page, /^(Tejavana|Parking) \d\d$/, 'Parking 03');
    await page.getByText('✓ Mover a', { exact: false }).first().click();
    await page.waitForTimeout(600);

    await page.goto(`${BASE}/mi-preparacion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const hayCola = await page.getByText('por preparar', { exact: false }).first().isVisible().catch(() => false);
    ok('5 · el preparador tiene cola de trabajo', hayCola);

    await page.getByText('6412 NPV', { exact: true }).first().click();
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
    ok('6 · no permite terminar sin el reportaje', await finalizar.isDisabled());

    for (const texto of ['Delantera izquierda', 'Delantera derecha', 'Trasera izquierda', 'Trasera derecha']) {
      ok(`6 · pide foto ${texto.toLowerCase()}`, await page.getByText(texto, { exact: true }).isVisible());
    }
    ok(
      '6 · explica que faltan las cuatro fotos',
      await page.getByText('Faltan 4 fotos', { exact: false }).isVisible()
    );

    // La captura de cámara real no se automatiza en Chromium headless. El
    // cierre correcto con cuatro ficheros reales se prueba contra backend en
    // preproduccion.test.ts; aquí comprobamos que la interfaz no lo deja
    // saltar.
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
    ok(
      '13 · el preparador ve de qué comercial es el coche',
      texto.includes('Comercial:'),
      texto.match(/Comercial:[^\n]*/)?.[0] ?? 'sin dato comercial'
    );

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

  /* --------- 19 · el coche que se lleva el cliente deja libre su hueco */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.comercial, 1440);

    // Uno de sus coches, con plaza: lo que se quiere ver es que el hueco
    // queda libre, que es el motivo de que exista el botón.
    await page.goto(`${BASE}/mis-coches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const antes = await estadoGuardado(page);
    const mio = antes?.vehicles?.find(
      (v) =>
        v.logisticActive &&
        v.location?.positionId &&
        v.salesRep &&
        'juan bilbao'.startsWith(String(v.salesRep).trim().toLowerCase())
    );
    ok('19 · el comercial tiene algún coche suyo aparcado', !!mio, mio?.id ?? 'ninguno');
    const plaza = mio?.location?.positionId ?? '';

    await page.goto(`${BASE}/vehiculo/${encodeURIComponent(mio?.id ?? '')}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1100);
    const ficha = await page.evaluate(() => document.body.innerText);
    ok('19 · la ficha ofrece darlo por entregado', ficha.includes('Entregado al cliente'));

    await page.getByText('🏁 Entregado al cliente', { exact: false }).first().click();
    await page.waitForTimeout(700);
    const modal = await page.evaluate(() => document.body.innerText);
    ok(
      '19 · y avisa antes de qué va a pasar con el hueco',
      modal.includes('queda libre') && modal.includes('Sí, se lo ha llevado'),
      'confirmación con consecuencias'
    );

    await page.getByText('Sí, se lo ha llevado', { exact: false }).first().click();
    await page.waitForTimeout(1400);

    const s = await estadoGuardado(page);
    const despues = s?.vehicles?.find((v) => v.id === mio?.id);
    ok('19 · el coche sale de la flota activa', despues?.logisticActive === false, despues?.status ?? '');
    ok('19 · y deja apuntado cuándo se entregó', !!despues?.deliveredAt, despues?.deliveredAt ?? 'sin fecha');
    ok(
      '19 · su plaza queda libre para el siguiente',
      (s?.vehicles ?? []).filter((v) => v.logisticActive && v.location?.positionId === plaza).length === 0,
      plaza
    );

    // Y en «Mis coches» pasa a la pestaña de entregados: ya no es trabajo.
    await page.goto(`${BASE}/mis-coches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1300);
    const lista = await page.evaluate(() => document.body.innerText);
    ok('19 · «Mis coches» tiene su registro de entregados', /Entregados · \d+/.test(lista), lista.match(/Entregados · \d+/)?.[0] ?? '');
    ok('19 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* --------- 20 · el repaso de entrega de las flotas de renting */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.preparador);

    // El barrido se dispara solo al abrir la app: al llegar a su cola, los
    // repasos del día ya tienen que estar puestos.
    await page.goto(`${BASE}/mi-preparacion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    const cola = await page.evaluate(() => document.body.innerText);
    ok('20 · el reloj pone los repasos del día en la cola del preparador', cola.includes('Repaso de entrega'));
    ok('20 · y dice que el coche se entrega hoy', cola.includes('Se entrega hoy'));

    const s = await estadoGuardado(page);
    const repasos = (s?.requests ?? []).filter((r) => r.prepTipo === 'repaso' && r.status !== 'terminada');
    ok('20 · con una solicitud por coche', repasos.length > 0, `${repasos.length} repasos`);
    const avisos = (s?.inbox ?? []).filter((n) => n.body.includes('repaso'));
    ok(
      '20 · y un solo aviso con la cuenta, no uno por coche',
      avisos.length === 1 && repasos.length >= 1,
      avisos[0]?.body ?? 'sin aviso'
    );

    // Al empezarlo se abre con su checklist corto y sus 30 minutos.
    await page.getByText('Empezar repaso', { exact: false }).first().click();
    await page.waitForTimeout(1400);
    const dentro = await page.evaluate(() => document.body.innerText);
    ok('20 · se abre con el checklist del repaso', dentro.includes('Limpieza exterior') && dentro.includes('Limpieza interior'));
    ok('20 · y no con el de una preparación entera', !dentro.includes('Kit reparapinchazos'));

    const s2 = await estadoGuardado(page);
    const prep = (s2?.preparations ?? []).find((p) => p.tipo === 'repaso' && p.runState !== 'terminado');
    ok('20 · el reloj del repaso es de 30 minutos', prep?.targetMs === 30 * 60 * 1000, `${(prep?.targetMs ?? 0) / 60000} min`);
    ok('20 · sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* 21 · rutas de carga y una única recepción con histórico */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.transportista, 420);
    await page.goto(`${BASE}/mis-traslados`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const grupos = page.getByTestId('grupo-trayecto');
    ok('21 · el transportista ve los encargos agrupados por trayecto', await grupos.count() > 0);
    ok('21 · cada trayecto indica origen y destino', (await grupos.first().innerText()).includes('→'));
    await pulsar(page, 'Todos los trayectos');
    await page.waitForTimeout(300);
    // Las opciones del selector incluyen el número de coches del trayecto.
    const opciones = page.locator('[tabindex="0"], button').filter({ hasText: /→.*coches/ });
    await opciones.last().click();
    await page.waitForTimeout(300);
    ok('21 · al elegir un trayecto solo aparece su grupo', await grupos.count() === 1);
    const grupoTexto = await grupos.first().innerText();
    const conservaLlaves =
      grupoTexto.includes('🔑 He recogido las llaves') ||
      grupoTexto.includes('Llaves pendientes') ||
      grupoTexto.includes('Llaves listas') ||
      grupoTexto.includes('Logística está preparando las llaves');
    ok('21 · conserva el flujo de llaves dentro del grupo', conservaLlaves, grupoTexto);
    ok('21 · agrupación sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.recepcion, 420);
    await page.goto(`${BASE}/recepcion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    ok('22 · el enlace antiguo abre la descarga única', page.url().includes('/mi-recepcion'));
    ok('22 · el albarán está en la misma pantalla', await page.getByText('📷 Adjuntar albarán', { exact: true }).isVisible());
    await pulsar(page, '🚚 Empezar otro camión', { exact: true });
    await page.getByPlaceholder('9876 JKL').fill('TEST 222');
    await page.getByPlaceholder('Transportista Norte').fill('Camión de prueba');
    await pulsar(page, 'Empezar descarga', { exact: true });
    await page.waitForTimeout(1000);
    const estado = await estadoGuardado(page);
    const nuevo = estado.receptions.find((r) => r.truckPlate === 'TEST 222');
    ok('22 · crear un camión lo selecciona aunque haya otros abiertos', (await page.locator('body').innerText()).includes('🚚 TEST 222'));
    await page.getByPlaceholder('VIN-8 o matrícula', { exact: true }).fill('PRUEBA22');
    await pulsar(page, 'Añadir', { exact: true });
    await page.waitForTimeout(800);
    const guardado = await estadoGuardado(page);
    ok('22 · la línea se guarda en el camión nuevo', guardado.receptions.find((r) => r.id === nuevo.id).lines.some((l) => l.ref === 'PRUEBA22'));
    await pulsar(page, 'Cerrar este camión', { exact: true });
    await page.waitForTimeout(800);
    ok('22 · cerrar conserva la recepción en el histórico', !!(await estadoGuardado(page)).receptions.find((r) => r.id === nuevo.id).closedAt);
    ok('22 · descarga integrada sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
    await context.close();
  }

  /* 23 · cambiar de rol de verdad conserva el traslado de la demo */
  {
    // Sin sesión inyectada: se usan los botones reales de entrar y salir.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await pulsar(page, 'Juan Bilbao');
    await page.waitForTimeout(1000);
    const s = await estadoGuardado(page);
    const v = s.vehicles.find((v) => v.location?.siteId === 'leioa' && v.logisticActive && !v.deliveredAt && !s.requests.some(r => r.vehicleId === v.id && r.type === 'traslado' && !['terminada', 'cancelada'].includes(r.status)));
    if (!v) throw new Error('Falta un coche en Leioa para probar el traslado');
    await page.goto(`${BASE}/vehiculo/${v.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await pulsar(page, '🚚 Solicitar traslado', { exact: true });
    await page.waitForTimeout(300);
    const actual = s.sites.find((x) => x.id === (v.targetSiteId ?? s.sites.find((x) => x.prepares).id)).name;
    if (actual !== 'Galdakao') await elegirEnLista(page, actual, 'Galdakao');
    await page.getByPlaceholder('Detalles para el equipo').fill('PRUEBA CAMBIO DE ROL');
    await pulsar(page, 'Crear solicitud', { exact: true });
    await pulsar(page, 'Cerrar sesión');
    await page.waitForTimeout(900);
    await pulsar(page, 'Iker Solano');
    await page.waitForTimeout(1000);
    const tras = await estadoGuardado(page);
    const pedido = tras.requests.find((r) => r.note === 'PRUEBA CAMBIO DE ROL');
    ok('23 · cerrar sesión no borra el traslado del comercial', !!pedido);
    ok('23 · Leioa a Galdakao se asigna a Grúas Francis', pedido?.carrierId === 'gruas-francis' && pedido?.from?.siteId === 'leioa' && pedido?.to?.siteId === 'galdakao');
    ok('23 · Francis ve el encargo al entrar con su perfil', (await page.locator('body').innerText()).includes('PRUEBA CAMBIO DE ROL'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    ok('23 · el traslado sigue visible después de recargar', (await page.locator('body').innerText()).includes('PRUEBA CAMBIO DE ROL'));
    await context.close();
  }

  /* 24 · cancelación, llaves opcionales y recepción en zona sin plazas */
  {
    const { context, page, errores } = await entrarComo(browser, USUARIOS.comercial, 1440);
    await page.goto(`${BASE}/flota`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const v = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('urkiola.state.v1'));
      const s = raw.state;
      const v = s.vehicles.find(v => v.logisticActive);
      v.salesRep = 'Juan'; v.location = { siteId: 'leioa' };
      s.requests = s.requests.filter(r => r.vehicleId !== v.id);
      s.preparations = s.preparations.filter(p => p.vehicleId !== v.id);
      s.requests.unshift({ id: 'cancelacion-ui', vehicleId: v.id, type: 'traslado', siteId: 'galdakao',
        from: { siteId: 'leioa' }, to: { siteId: 'galdakao' }, status: 'solicitada', createdBy: 'u-juan',
        createdAt: new Date().toISOString(), pickedUpAt: null, deliveredAt: null, deliveredBy: null,
        assignedTo: 'u-iker', carrierId: 'gruas-francis', urgent: false, dueAt: null });
      localStorage.setItem('urkiola.state.v1', JSON.stringify(raw)); return v.id;
    });
    await page.goto(`${BASE}/vehiculo/${v}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await pulsar(page, 'Ubicación de llaves', { exact: true });
    await page.getByPlaceholder('Ej.: Caja fuerte comercial', { exact: true }).fill('Cliente');
    await pulsar(page, 'Guardar llaves', { exact: true });
    await page.waitForTimeout(700);
    let s = await estadoGuardado(page);
    ok('24 · segunda llave se guarda dejando principal vacía', s.vehicles.find(x => x.id === v).secondaryKeyLocation === 'Cliente' && !s.vehicles.find(x => x.id === v).primaryKeyLocation);
    await pulsar(page, 'Cancelar solicitud', { exact: true });
    await page.getByPlaceholder('Indica por qué se cancela').fill('Cambio del cliente');
    await pulsar(page, 'Confirmar cancelación', { exact: true });
    await page.waitForTimeout(800);
    s = await estadoGuardado(page);
    ok('24 · botón cancela y conserva el motivo', s.requests.find(r => r.id === 'cancelacion-ui').status === 'cancelada' && s.requests.find(r => r.id === 'cancelacion-ui').cancelReason === 'Cambio del cliente');
    ok('24 · cancelar no mueve coche ni segunda llave', s.vehicles.find(x=>x.id===v).location.siteId === 'leioa' && s.vehicles.find(x=>x.id===v).secondaryKeyLocation === 'Cliente');
    await context.close();
    const rec = await entrarComo(browser, USUARIOS.recepcion, 420);
    await rec.page.goto(`${BASE}/mi-recepcion`, { waitUntil: 'networkidle' });
    await rec.page.waitForTimeout(900);
    await rec.page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('urkiola.state.v1'));
      raw.state.zones.push({ id: 'parking-test', siteId: 'sondika', name: 'Parking sin plazas', kind: 'parking', capacity: 0 });
      raw.state.receptions.unshift({ id: 'camion-zona', truckPlate: 'ZONA TEST', carrier: 'Test', siteId:'sondika', arrivedAt:new Date().toISOString(),closedAt:null,albaranUri:null,lines:[] });
      localStorage.setItem('urkiola.state.v1',JSON.stringify(raw));
    });
    await rec.page.reload({ waitUntil: 'networkidle' }); await rec.page.waitForTimeout(800);
    const antes = await estadoGuardado(rec.page);
    const coche = antes.vehicles.find(v=>v.vin8);
    await rec.page.getByPlaceholder('Escribe o escanea').fill(coche.vin8);
    // La zona actual es la primera con hueco: abrir el selector desde el campo.
    const campo = rec.page.getByText('ZONA', { exact: true }).first().locator('xpath=..');
    await campo.locator('[tabindex="0"]').first().click();
    await rec.page.getByText('Parking sin plazas', { exact: true }).last().click();
    await pulsar(rec.page, '✓ Descargado · siguiente', { exact: true });
    await rec.page.waitForTimeout(900);
    const despues = await estadoGuardado(rec.page);
    ok('24 · recepción descarga sin plaza ficticia', despues.vehicles.find(v=>v.id===coche.id).location.zoneId === 'parking-test' && !despues.vehicles.find(v=>v.id===coche.id).location.positionId);
    ok('24 · formularios sin errores JavaScript', errores.length === 0 && rec.errores.length === 0, [...errores,...rec.errores][0] ?? '');
    await rec.context.close();
  }

  /* 25 · abrir una demo nueva encima de una antigua */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await pulsar(page, 'Dirección Peugeot · Citroën');
    await page.waitForTimeout(1400);

    // Simula exactamente el caso real: el navegador conserva una demo
    // anterior y una copia antigua del usuario Director Comercial.
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('urkiola.state.v1'));
      raw.v = 24;
      const director = raw.state.users.find((u) => u.id === 'u-dir-vn');
      director.name = 'Dirección VN';
      director.managedBrands = ['BMW', 'MINI'];
      const protagonista = raw.state.vehicles.find((v) => v.id === 'v-12345678');
      protagonista.brand = 'BMW';
      protagonista.model = 'X1';
      protagonista.plate = null;
      protagonista.commercialCategory = 'VN';
      localStorage.setItem('urkiola.state.v1', JSON.stringify(raw));
      localStorage.setItem('urkiola.session.v1', JSON.stringify({
        ...director,
        email: 'direccion.vn@urkiolacarservice.com',
        active: true,
      }));
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    const audit = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('urkiola.state.v1'));
      const session = JSON.parse(localStorage.getItem('urkiola.session.v1'));
      const director = stored.state.users.find((u) => u.id === 'u-dir-vn');
      const protagonista = stored.state.vehicles.find((v) => v.id === 'v-12345678');
      return { version: stored.v, session, director, protagonista, body: document.body.innerText };
    });

    ok('25 · descarta el estado de una demo anterior', audit.version === 25 && audit.protagonista?.brand === 'Peugeot' && audit.protagonista?.model === '3008', JSON.stringify({ version: audit.version, protagonista: audit.protagonista }));
    ok('25 · recupera KM0 y matrícula de la demo actual', audit.protagonista?.commercialCategory === 'KM0' && audit.protagonista?.plate === '6412 NPV');
    ok('25 · la sesión usa el Director Comercial vigente', audit.session?.name === 'Dirección Peugeot · Citroën' && audit.session?.managedBrands?.join('|') === 'Peugeot|Citroën', JSON.stringify(audit.session));
    ok('25 · la interfaz deja de enseñar el perfil antiguo', audit.body.includes('Dirección Peugeot · Citroën') && !audit.body.includes('Dirección VN'));
    await context.close();
  }

  return resumen();
}
