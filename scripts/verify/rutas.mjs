import { USUARIOS, entrarComo } from './entorno.mjs';

const RUTAS = [
  '/', '/flota', '/entregas', '/recepcion', '/mi-recepcion', '/campa', '/solicitudes',
  '/preparacion', '/movimientos', '/mover', '/recuentos', '/incidencias', '/notificaciones',
  '/administracion', '/mi-trabajo', '/mis-traslados', '/mi-preparacion', '/vehiculo/v-12345678',
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
        else if (!/URKIOLA/.test(txt) && !page.url().includes('login'))
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
