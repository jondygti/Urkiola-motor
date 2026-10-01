import { USUARIOS, entrarComo } from './entorno.mjs';

const RUTAS = [
  '/', '/flota', '/entregas', '/recepcion', '/mi-recepcion', '/campa', '/solicitudes',
  '/preparacion', '/traslados', '/movimientos', '/mover', '/recuentos', '/incidencias', '/notificaciones',
  '/administracion', '/mis-coches', '/mis-traslados', '/mi-preparacion', '/vehiculo/v-12345678',
];

/**
 * Barrido: cada perfil entra en cada pantalla, en móvil y en escritorio.
 *
 * No comprueba que la pantalla haga lo correcto —de eso va funciones.mjs—
 * sino que ninguna se rompe para nadie. Un cambio de permisos o de menú
 * puede dejar a un rol delante de una pantalla en blanco, y eso solo se ve
 * probándolos todos.
 */
export async function ejecutar(browser, BASE) {
  const problemas = [];
  const errores = [];
  let cargas = 0;

  // La entrada, sin sesión: tiene que llevar la marca —el símbolo EM y
  // «Easo Logistics»— y ningún resto del nombre antiguo.
  for (const width of [420, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const marca = await page.evaluate(() => {
      const cab = document.querySelector('[aria-label="Easo Logistics"]');
      const img = cab?.querySelector('img');
      return {
        texto: cab?.textContent ?? '',
        imagen: !!img && img.complete && img.naturalWidth > 0,
        cuerpo: document.body.innerText,
      };
    });
    if (!/EASO\s*LOGISTICS/.test(marca.texto)) problemas.push(`login · ${width}px: sin «Easo Logistics»`);
    if (!marca.imagen) problemas.push(`login · ${width}px: el símbolo de la marca no carga`);
    if (/car service/i.test(marca.cuerpo)) problemas.push(`login · ${width}px: sigue saliendo «Car Service»`);
    await context.close();
  }

  for (const usuario of Object.values(USUARIOS)) {
    for (const width of [420, 1440]) {
      const { context, page } = await entrarComo(browser, usuario, width);
      page.on('pageerror', (e) => errores.push(`${usuario.role} ${width} · ${String(e).slice(0, 160)}`));

      for (const ruta of RUTAS) {
        await page.goto(BASE + ruta, { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
        cargas++;

        const txt = await page.evaluate(() => document.body.innerText);
        const donde = `${usuario.role} · ${width}px · ${ruta}`;
        if (txt.includes('Unmatched Route')) problemas.push(`${donde}: ruta sin pantalla`);
        else if (txt.trim().length < 40) problemas.push(`${donde}: pantalla vacía`);
        else if (!/EASO/.test(txt) && !page.url().includes('login'))
          problemas.push(`${donde}: sin armazón`);
      }
      await context.close();
    }
  }

  console.log(`CARGAS: ${cargas}`);
  console.log(`PROBLEMAS: ${problemas.length ? '\n · ' + problemas.join('\n · ') : 'ninguno'}`);
  const unicos = [...new Set(errores)];
  console.log(`ERRORES DE JS: ${unicos.length ? '\n · ' + unicos.join('\n · ') : 'ninguno'}`);

  return problemas.length === 0 && unicos.length === 0;
}
