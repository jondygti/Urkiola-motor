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
      URKIOLA_SEMILLA: 'demo',
      JWT_SECRET: 'secreto-de-comprobacion',
      CORS_ORIGEN: WEB,
      EXPO_PUSH: '0',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout.on('data', () => {});
  api.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`));

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
  ok('3 · encuentra el coche que le manda el servidor', await page.getByText('Ahora en', { exact: false }).first().isVisible(), coche.plate);

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

  /* ----------------------------------------- 5 · reintento sin duplicar */
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
  ok('7 · un reintento no duplica el trabajo', repetido.repetido === true);

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
  ok('8 · sin errores de JavaScript', graves.length === 0, graves[0] ?? 'ninguno');

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
