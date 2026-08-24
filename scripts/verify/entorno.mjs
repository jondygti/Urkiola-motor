import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Localiza Playwright y el Chromium ya instalado en la máquina.
 *
 * Se busca en varios sitios a propósito: Playwright no es dependencia del
 * proyecto (arrastra navegadores de cientos de megas y no hace falta para
 * compilar), así que puede estar instalado globalmente o no estar.
 */
export async function abrirNavegador() {
  const chromium = await cargarPlaywright();
  return chromium.launch({ executablePath: buscarChromium() });
}

async function cargarPlaywright() {
  const candidatos = [
    'playwright',
    process.env.PLAYWRIGHT_PATH,
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/usr/lib/node_modules/playwright/index.js',
    '/usr/local/lib/node_modules/playwright/index.js',
  ].filter(Boolean);

  for (const ruta of candidatos) {
    try {
      const mod = ruta.startsWith('/')
        ? createRequire(import.meta.url)(ruta)
        : await import(ruta);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch {
      /* se prueba el siguiente */
    }
  }

  throw new Error(
    'No encuentro Playwright. Instálalo con «npm i -g playwright» o indica la ruta ' +
      'en la variable PLAYWRIGHT_PATH.'
  );
}

/** Chromium ya descargado en la imagen; si no aparece, que lo resuelva Playwright. */
function buscarChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith('chromium')) continue;
    for (const bin of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome']) {
      const ruta = join(base, dir, bin);
      if (existsSync(ruta)) return ruta;
    }
  }
  return undefined;
}

/** Perfiles de demostración, tal y como están en src/data/seed.ts. */
export const USUARIOS = {
  admin: { id: 'u-admin', name: 'Jon Aranburu', role: 'admin', siteIds: [], email: 'admin@urkiolacarservice.com', active: true },
  logistica: { id: 'u-log', name: 'Marta Ibarra', role: 'logistica', siteIds: [], email: 'logistica@urkiolacarservice.com', active: true },
  preparador: { id: 'u-pedro', name: 'Pedro Larrea', role: 'preparador', siteIds: ['leioa'], email: 'pedro@urkiolacarservice.com', active: true },
  transportista: { id: 'u-iker', name: 'Iker Solano', role: 'transportista', siteIds: [], email: 'transporte@urkiolacarservice.com', active: true, carrierId: 'gruas-francis' },
  transportista2: { id: 'u-aitor', name: 'Aitor Bengoa', role: 'transportista', siteIds: [], email: 'betigoiz@urkiolacarservice.com', active: true, carrierId: 'gruas-betigoiz' },
  recepcion: { id: 'u-nerea', name: 'Nerea Goiri', role: 'recepcion', siteIds: ['sondika'], email: 'recepcion@urkiolacarservice.com', active: true },
  comercial: { id: 'u-juan', name: 'Juan Bilbao', role: 'comercial', siteIds: ['leioa'], email: 'juan@urkiolacarservice.com', active: true },
};

/** Abre una pestaña ya con la sesión iniciada, sin pasar por el login. */
export async function entrarComo(browser, usuario, width = 420) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript((u) => {
    localStorage.setItem('urkiola.session.v1', JSON.stringify(u));
  }, usuario);
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e).slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text().slice(0, 200)));
  return { context, page, errores };
}

/**
 * Cambia de usuario en el MISMO dispositivo, sin perder los datos.
 *
 * Hay que hacerlo con otro `addInitScript`: el de `entrarComo` se ejecuta en
 * cada navegación y volvería a dejar al usuario anterior. El último que se
 * añade es el que manda.
 */
export async function cambiarDeUsuario(context, page, usuario, destino) {
  await context.addInitScript((u) => {
    localStorage.setItem('urkiola.session.v1', JSON.stringify(u));
  }, usuario);
  await page.goto(destino, { waitUntil: 'networkidle' });
}

/**
 * Pulsa un botón por su texto.
 *
 * No se pulsa el texto: se pulsa el contenedor pulsable que lo envuelve. El
 * texto queda por debajo del propio botón y, con un modal abierto, el clic
 * no llega. Es el mismo detalle que ya hacía falta en `elegirEnLista`.
 */
export async function pulsar(page, texto, { exact = false, primero = false } = {}) {
  // Se buscan solo elementos PULSABLES que contengan ese texto. Buscar el
  // texto a secas engañaba: el título del modal («⚠️ Registrar incidencia»)
  // coincide antes que el botón del pie, y pulsarlo no hace nada. Costó un
  // rato darse cuenta porque no da error: simplemente no pasa nada.
  const pulsables = page.locator('[tabindex="0"], button').filter({
    hasText: exact ? new RegExp(`^\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) : texto,
  });
  await (primero ? pulsables.first() : pulsables.last()).click({ force: true });
}

/** Lo que la app ha guardado en el dispositivo, para comprobar el resultado. */
export const estadoGuardado = (page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('urkiola.state.v1');
    return raw ? JSON.parse(raw).state : null;
  });

/**
 * Elige una opción de un desplegable propio.
 *
 * Dos detalles aprendidos a base de fallos: se pulsa el contenedor
 * pulsable y no el texto (que a veces queda cubierto por el propio botón),
 * y de la opción se coge la ÚLTIMA coincidencia, porque lo que hay detrás
 * del modal puede decir lo mismo.
 */
export async function elegirEnLista(page, etiquetaActual, opcion) {
  await page
    .getByText(etiquetaActual, { exact: typeof etiquetaActual === 'string' })
    .first()
    .locator('xpath=ancestor-or-self::*[@tabindex="0"][1]')
    .click({ force: true });
  await page.waitForTimeout(250);
  await page.getByText(opcion, { exact: true }).last().click();
  await page.waitForTimeout(250);
}

/** Marcador de comprobaciones, con salida legible. */
export function marcador() {
  const resultados = [];
  return {
    ok(nombre, condicion, extra = '') {
      resultados.push({ nombre, pasa: !!condicion, extra });
      console.log(`${condicion ? 'OK   ' : 'FALLA'} · ${nombre}${extra ? ` — ${extra}` : ''}`);
    },
    resumen() {
      const fallan = resultados.filter((r) => !r.pasa);
      console.log(`\n${resultados.length - fallan.length}/${resultados.length} comprobaciones correctas`);
      if (fallan.length) {
        console.log('FALLAN:\n' + fallan.map((f) => ` · ${f.nombre} ${f.extra}`).join('\n'));
      }
      return fallan.length === 0;
    },
  };
}
