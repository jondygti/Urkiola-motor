import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirNavegador, elegirEnLista, estadoGuardado, marcador } from './entorno.mjs';
import { servirEstatico } from './servidor.mjs';

/**
 * Comprobación de la app **contra el servidor de verdad**.
 *
 *   npm run verify:api
 *
 * Va aparte de `npm run verify` porque hace falta compilar la web una
 * segunda vez: `EXPO_PUBLIC_API_URL` se incrusta al compilar, así que la
 * versión de demostración y la conectada son dos compilaciones distintas.
 *
 * Lo que comprueba es justo lo que no puede comprobar ninguna de las dos
 * por separado: que lo que hace una persona en el navegador llega al
 * servidor, y que otro dispositivo lo ve.
 */
const PUERTO_API = Number(process.env.VERIFY_API_PORT ?? 4320);
const PUERTO_WEB = Number(process.env.VERIFY_WEB_PORT ?? 4321);
const API = `http://127.0.0.1:${PUERTO_API}`;
const WEB = `http://127.0.0.1:${PUERTO_WEB}`;
const CLAVE = 'urkiola';

const datos = mkdtempSync(join(tmpdir(), 'urkiola-verify-'));
let api = null;
let registroApi = '';
let servidorWeb = null;
let browser = null;

/** Espera a que el servidor conteste, o se rinde. */
async function esperarApi(intentos = 40) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return true;
    } catch {
      /* todavía no ha levantado */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function entrar(email, password = CLAVE) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return r.json();
}

const estadoDe = async (token) =>
  (await fetch(`${API}/state`, { headers: { Authorization: `Bearer ${token}` } })).json();

try {
  console.log('▸ Compilando el servidor…');
  execSync('npm --prefix server run build', { stdio: 'inherit' });

  console.log('▸ Arrancando el servidor…');
  api = spawn(process.execPath, ['server/dist/server/src/index.js'], {
    env: {
      ...process.env,
      PORT: String(PUERTO_API),
      URKIOLA_DATOS: join(datos, 'estado.json'),
      // También las fotos: si no, se quedan en datos/fotos del repositorio.
      URKIOLA_FOTOS: join(datos, 'fotos'),
      URKIOLA_SEMILLA: 'demo',
      JWT_SECRET: 'secreto-de-comprobacion',
      CORS_ORIGEN: WEB,
      EXPO_PUSH: '0',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // El correo de restablecer sale por consola cuando no hay proveedor: se
  // guarda el registro para poder leer el enlace desde la prueba.
  api.stdout.on('data', (d) => {
    registroApi += String(d);
  });
  api.stderr.on('data', (d) => {
    registroApi += String(d);
    process.stderr.write(`[api] ${d}`);
  });

  if (!(await esperarApi())) throw new Error('El servidor no ha levantado.');

  console.log('▸ Compilando la web apuntando al servidor…');
  // --clear es obligatorio: Metro cachea el valor anterior de
  // EXPO_PUBLIC_API_URL y compilaría otra vez la versión de demostración.
  execSync('npx expo export --platform web --output-dir dist-api --clear', {
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_API_URL: API },
  });

  servidorWeb = await servirEstatico('dist-api', PUERTO_WEB);
  browser = await abrirNavegador();
  const { ok, resumen } = marcador();

  /* ------------------------------------------------------- 1 · entrar */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e).slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text().slice(0, 200)));

  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  ok('1 · pide contraseña, no un perfil de la lista', await page.getByText('Contraseña').first().isVisible());

  await page.getByPlaceholder('nombre@urkiolacarservice.com').fill('pedro@urkiolacarservice.com');
  await page.getByPlaceholder('••••••••').fill('esta-no-es');
  await page.getByText('Entrar', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  ok(
    '1 · con la contraseña mal no entra',
    await page.getByText('Correo o contraseña incorrectos.').first().isVisible()
  );

  await page.getByPlaceholder('••••••••').fill(CLAVE);
  await page.getByText('Entrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  ok('2 · con la contraseña buena entra', !page.url().includes('/login'), page.url());

  /* ------------------------------- 2 · lo que se hace llega al servidor */
  const { token: tokenPedro } = await entrar('pedro@urkiolacarservice.com');
  const antes = await estadoDe(tokenPedro);
  const coche = antes.vehicles.find((v) => v.location?.siteId === 'leioa' && v.plate);

  await page.goto(`${WEB}/mover`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByPlaceholder('1234 ABC').fill(coche.plate);
  await page.waitForTimeout(600);
  const fichaMover = await page.evaluate(() => document.body.innerText);
  ok(
    '3 · encuentra el coche que le manda el servidor',
    fichaMover.includes('DÓNDE ESTÁ AHORA'),
    coche.plate
  );
  // Acotado a la tarjeta del coche: en la web el menú lateral también tiene
  // una chincheta («Campa Sondika») y la primera que aparece es esa.
  const tarjeta = fichaMover.slice(fichaMover.indexOf('DÓNDE ESTÁ AHORA'));
  const linea = (tarjeta.match(/📍[^\n]*(\n[^\n]*)?/)?.[0] ?? '').replace(/\n/g, ' ').trim();
  ok('3 · y le dice dónde está para ir a por él', /[A-Za-zÁ-ú]{3}/.test(linea), linea);

  const zonaActual = await page.evaluate(() => {
    const m = document.body.innerText.match(/(Tejavana \d\d|Parking \d\d)/g);
    return m ? m[0] : null;
  });
  await elegirEnLista(page, zonaActual ?? 'Elige zona', 'Parking 03');
  await page.getByText('✓ Mover a', { exact: false }).first().click();
  await page.waitForTimeout(2000);

  const despues = await estadoDe(tokenPedro);
  const movimiento = despues.movements.find((m) => m.vehicleId === coche.id);
  ok(
    '4 · el movimiento ha llegado al servidor',
    !!movimiento && movimiento.to.zoneId?.includes('park-03'),
    movimiento ? `${movimiento.from?.zoneId ?? '—'} → ${movimiento.to.zoneId}` : 'no ha llegado'
  );
  ok('4 · y lo firma quien lo hizo', movimiento?.userId === 'u-pedro', movimiento?.userId ?? '');
  ok(
    '4 · el vehículo cambia de sitio en el servidor',
    despues.vehicles.find((v) => v.id === coche.id)?.location?.zoneId === movimiento?.to.zoneId
  );
  ok('4 · nada pendiente de subir', !(await page.getByText('sin subir', { exact: false }).first().isVisible().catch(() => false)));

  /* ------------------------------------- 3 · otro dispositivo lo ve */
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(800);
  await page2.getByPlaceholder('nombre@urkiolacarservice.com').fill('logistica@urkiolacarservice.com');
  await page2.getByPlaceholder('••••••••').fill(CLAVE);
  await page2.getByText('Entrar', { exact: true }).first().click();
  await page2.waitForTimeout(2500);

  // Se mira lo que el servidor le ha mandado a este segundo dispositivo, no
  // el texto de la pantalla: es donde se ve si el dato ha viajado de verdad.
  const enElOtroMovil = await estadoGuardado(page2);
  const cocheAlli = enElOtroMovil?.vehicles?.find((v) => v.id === coche.id);
  ok(
    '5 · otro usuario, en otro dispositivo, ve el cambio',
    cocheAlli?.location?.zoneId === movimiento?.to.zoneId,
    `${cocheAlli?.location?.zoneId ?? 'sin ubicación'} (esperado ${movimiento?.to.zoneId})`
  );

  /* --------------------------------- 4 · el externo sigue viendo poco */
  const { token: tokenIker } = await entrar('transporte@urkiolacarservice.com');
  const estadoIker = await estadoDe(tokenIker);
  ok(
    '6 · el transportista no recibe el parque entero',
    estadoIker.vehicles.length < despues.vehicles.length,
    `${estadoIker.vehicles.length} de ${despues.vehicles.length}`
  );
  ok(
    '6 · ni los traslados de la otra empresa',
    estadoIker.requests.every((r) => r.carrierId === 'gruas-francis' || r.assignedTo === 'u-iker')
  );
  ok('6 · ni los comerciales', estadoIker.vehicles.every((v) => v.salesRep === null));

  /* --------------------------- 5 · una foto la ve otro dispositivo */
  {
    // Un PNG de 1×1 de verdad: lo que subiría el móvil de recepción.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const { token: tokenNerea } = await entrar('recepcion@urkiolacarservice.com');
    const subida = await fetch(`${API}/fotos`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${tokenNerea}` },
      body: png,
    });
    const { id: idFoto } = await subida.json();
    ok('5 · recepción sube la foto de un daño', subida.status === 200 && !!idFoto, idFoto ?? 'no subió');

    // La subida no concede acceso por sí sola: queda asociada al trabajo.
    const incidencia = await fetch(`${API}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenNerea}`,
      },
      body: JSON.stringify({
        type: 'incident.create',
        id: 'verify-foto-incidencia',
        at: new Date().toISOString(),
        vehicleId: coche.id,
        incidentType: 'recepcion',
        description: 'Comprobación de evidencia compartida',
        photos: [`foto:${idFoto}`],
      }),
    });
    ok('5 · la foto queda asociada a una incidencia', incidencia.status === 200, String(incidencia.status));

    // Y la ve otra persona autorizada, desde otro dispositivo y otra sesión.
    const acceso = await fetch(`${API}/fotos/${encodeURIComponent(idFoto)}/acceso`, {
      headers: { Authorization: `Bearer ${tokenPedro}` },
    });
    const { url: urlFoto } = await acceso.json();
    ok(
      '5 · obtiene una URL breve sin meter su sesión completa',
      acceso.status === 200 && typeof urlFoto === 'string' && !urlFoto.includes(tokenPedro),
      urlFoto ?? 'sin URL'
    );
    const vista = await fetch(`${API}${urlFoto}`);
    const bytes = Buffer.from(await vista.arrayBuffer());
    ok('5 · y otra persona la ve, no se queda en el móvil', vista.status === 200 && bytes.equals(png));

    // Pero no cualquiera que dé con la dirección estable.
    const sinSesion = await fetch(`${API}/fotos/${encodeURIComponent(idFoto)}`);
    ok('5 · sin sesión no se ve', sinSesion.status === 401, String(sinSesion.status));
  }

  /* ------------------- 7 · recuperar la contraseña sin pedir permiso */
  {
    // Pestaña limpia: quien ha olvidado la contraseña no está dentro.
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const olvido = await ctx3.newPage();

    await olvido.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    await olvido.waitForTimeout(900);
    await olvido.getByPlaceholder('nombre@urkiolacarservice.com').fill('ane@urkiolacarservice.com');
    await olvido.waitForTimeout(200);
    ok(
      '7 · la pantalla de acceso ofrece recuperar la contraseña',
      await olvido.getByText('Primer acceso o nueva contraseña', { exact: false }).first().isVisible()
    );

    await olvido.getByText('Primer acceso o nueva contraseña', { exact: false }).first().click();
    await olvido.waitForTimeout(1500);
    ok(
      '7 · y no dice si ese correo existe o no',
      (await olvido.evaluate(() => document.body.innerText)).includes('Si ese correo está dado de alta')
    );

    // Sin proveedor de correo configurado, el enlace sale por la consola del
    // servidor: de ahí se saca el código, igual que lo sacaría la persona
    // de su bandeja de entrada.
    const codigo = registroApi.match(/codigo=([\w-]+)/g)?.at(-1)?.replace('codigo=', '');
    ok('7 · el enlace sale con su código', !!codigo, codigo ? `${codigo.slice(0, 8)}…` : 'no salió');

    if (codigo) {
      await olvido.goto(`${WEB}/restablecer?codigo=${encodeURIComponent(codigo)}`, {
        waitUntil: 'networkidle',
      });
      await olvido.waitForTimeout(1100);
      await olvido.getByPlaceholder('Al menos 12 caracteres').fill('cuatro ruedas y un motor');
      await olvido.getByPlaceholder('La misma otra vez').fill('cuatro ruedas y un motor');
      await olvido.waitForTimeout(300);
      await olvido.getByText('Guardar la contraseña', { exact: true }).first().click();
      await olvido.waitForTimeout(1800);
      ok(
        '7 · la contraseña queda cambiada',
        (await olvido.evaluate(() => document.body.innerText)).includes('Contraseña cambiada')
      );

      const intento = async (password) =>
        (
          await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'ane@urkiolacarservice.com', password }),
          })
        ).status;

      ok('7 · y con ella se entra', (await intento('cuatro ruedas y un motor')) === 200);
      ok('7 · la vieja deja de valer', (await intento(CLAVE)) === 401);

      // El mismo enlace, otra vez, ya no vale.
      const repetido = await fetch(`${API}/auth/restablecer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, nueva: 'otra frase larga distinta' }),
      });
      ok('7 · el enlace no se puede usar dos veces', repetido.status === 410, String(repetido.status));
    }
    await ctx3.close();
  }

  /* ----------------------------------------- 8 · reintento sin duplicar */
  const orden = {
    type: 'vehicle.check',
    id: 'cmd-verify-reintento',
    at: new Date().toISOString(),
    userId: 'u-pedro',
    vehicleId: coche.id,
  };
  const enviar = () =>
    fetch(`${API}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenPedro}` },
      body: JSON.stringify(orden),
    }).then((r) => r.json());
  await enviar();
  const repetido = await enviar();
  ok('8 · un reintento no duplica el trabajo', repetido.repetido === true);

  // La pantalla de acceso arrastra un aviso de hidratación de React que ya
  // estaba antes del backend: en la web compilada, React descarta el HTML
  // prerenderizado de esa pantalla y la vuelve a pintar en el navegador. Se
  // recupera solo y la pantalla funciona, así que no se da por fallo, pero
  // queda anotado como pendiente en CLAUDE.md para arreglarlo aparte.
  const HIDRATACION = /Minified React error #418|Hydration failed because/;
  // El 401 lo provocamos nosotros al probar la contraseña mal: el navegador
  // lo apunta en la consola, pero es la respuesta correcta, no un fallo.
  const ESPERADOS = /status of 401/;
  const graves = errores.filter((e) => !HIDRATACION.test(e) && !ESPERADOS.test(e));
  ok('9 · sin errores de JavaScript', graves.length === 0, graves[0] ?? 'ninguno');


  // Ámbito y clasificación a través de la API real, sin confiar en filtros UI.
  const adminScope = await entrar('admin@urkiolacarservice.com');
  const directorScope = await entrar('direccion.vn@urkiolacarservice.com');
  const voScope = await entrar('responsable.vo@urkiolacarservice.com');
  let scopeN = 0;
  const enviarScope = (token, datos) => fetch(`${API}/commands`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: `scope-api-${++scopeN}`, at: new Date().toISOString(), userId: 'u-admin', ...datos }),
  });
  for (const [vin8, brand, area] of [['SCOPEN01', 'Peugeot', 'vn'], ['SCOPEN02', 'Opel', 'vn'], ['SCOPEVO1', 'BMW', 'vo']]) {
    const r = await enviarScope(adminScope.token, { type: 'vehicle.create', vin8, brand, commercialArea: area, commercialCategory: area === 'vo' ? 'VO' : 'VN', location: { siteId: 'leioa' } });
    ok(`10 · alta comercial ${vin8}`, r.status === 200);
  }
  const scopeId = 'v-SCOPEN01';
  for (const category of ['KM0', 'DEMO', 'VO', 'VN']) {
    const r = await enviarScope(adminScope.token, { type: 'vehicle.setCommercial', vehicleId: scopeId, commercialArea: 'vn', commercialCategory: category });
    const estado = await estadoDe(adminScope.token);
    ok(`10 · API conserva clasificación ${category}`, r.status === 200 && estado.vehicles.find(v => v.id === scopeId)?.commercialCategory === category);
  }
  const asignar = await enviarScope(adminScope.token, { type: 'vehicle.setSalesRep', vehicleId: 'v-SCOPEVO1', salesRep: 'Juan Bilbao', salesRepUserId: 'u-juan' });
  ok('10 · VO vendido por equipo VN aparece a ambos responsables', asignar.status === 200 &&
    (await estadoDe(directorScope.token)).vehicles.some(v => v.id === 'v-SCOPEVO1') &&
    (await estadoDe(voScope.token)).vehicles.some(v => v.id === 'v-SCOPEVO1'));
  for (const [session, forbidden] of [[directorScope, 'v-SCOPEN02'], [voScope, scopeId]]) {
    ok('10 · /state excluye coches ajenos', !(await estadoDe(session.token)).vehicles.some(v => v.id === forbidden));
    for (const type of ['traslado', 'preparacion']) {
      const denied = await enviarScope(session.token, { type: 'request.create', requestType: type, vehicleId: forbidden, siteId: 'leioa', to: type === 'traslado' ? { siteId: 'leioa' } : null });
      ok(`10 · API rechaza ${type} ajeno`, denied.status === 403);
    }
    for (const datos of [{ type: 'vehicle.setDelivery', deliveryDate: '2026-12-30' }, { type: 'vehicle.deliver' }]) {
      const denied = await enviarScope(session.token, { ...datos, vehicleId: forbidden });
      ok(`10 · API rechaza ${datos.type} ajeno`, denied.status === 403);
    }
    const ctxScope = await browser.newContext();
    const pageScope = await ctxScope.newPage();
    await pageScope.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    await pageScope.getByPlaceholder('nombre@urkiolacarservice.com').fill(session.user.email);
    await pageScope.getByPlaceholder('••••••••').fill(CLAVE);
    await pageScope.getByText('Entrar', { exact: true }).first().click();
    // Esperar el destino final del login: / es una redirección intermedia.
    await pageScope.waitForURL(url => url.pathname === '/flota');
    await pageScope.getByText('SCOPEVO1', { exact: true }).first().waitFor({ state: 'visible' });
    await pageScope.goto(`${WEB}/vehiculo/${forbidden}`, { waitUntil: 'networkidle' });
    // La hidratación y la restauración de sesión continúan tras networkidle.
    await pageScope.getByText('Vehículo no encontrado', { exact: true }).waitFor({ state: 'visible', timeout: 10000 }).catch(async e => { console.error('Ficha ajena:', pageScope.url(), await pageScope.locator('body').innerText()); throw e; });
    ok('10 · URL directa no revela ficha ajena', await pageScope.getByText('Vehículo no encontrado', { exact: true }).isVisible());
    await ctxScope.close();
  }

  const bien = resumen();
  console.log(bien ? '\n✔ La app funciona contra el servidor.' : '\n✖ Hay comprobaciones que fallan.');
  process.exitCode = bien ? 0 : 1;
} catch (e) {
  console.error('\n✖', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  servidorWeb?.cerrar();
  api?.kill('SIGTERM');
  rmSync(datos, { recursive: true, force: true });
}
