import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { abrirNavegador, entrarComo, USUARIOS } from './entorno.mjs';
import { servirEstatico } from './servidor.mjs';

/**
 * Capturas de las pantallas que más se usan, para poder mirar un cambio de
 * diseño en vez de suponerlo.
 *
 *   node scripts/verify/pantallazos.mjs antes
 *   node scripts/verify/pantallazos.mjs despues
 *
 * No es una comprobación automática: es una herramienta para ver.
 */
const etiqueta = process.argv[2] ?? 'ahora';
const PUERTO = Number(process.env.VERIFY_PORT ?? 4399);

// Siempre recompila: una captura de una compilación vieja es peor que no
// tener captura, porque parece que el cambio no se ve.
if (!process.argv.includes('--rapido') || !existsSync('dist/index.html')) {
  execSync('npm run build:web', { stdio: 'inherit' });
}

const PANTALLAS = [
  // La entrada, sin sesión: es lo primero que ve todo el mundo.
  { usuario: null, ruta: '/login', ancho: 420, nombre: 'movil-login' },
  { usuario: null, ruta: '/login', ancho: 1440, nombre: 'web-login' },
  // Las de campo, en un móvil.
  { usuario: 'preparador', ruta: '/mi-preparacion', ancho: 420, nombre: 'movil-preparador' },
  { usuario: 'preparador', ruta: '/mover', ancho: 420, nombre: 'movil-mover', escribir: '4821 LKM' },
  { usuario: 'preparador', ruta: '/recuentos', ancho: 420, nombre: 'movil-recuentos' },
  { usuario: 'recepcion', ruta: '/mi-recepcion', ancho: 420, nombre: 'movil-recepcion' },
  { usuario: 'transportista', ruta: '/mis-traslados', ancho: 420, nombre: 'movil-transportista' },
  { usuario: 'comercial', ruta: '/mis-coches', ancho: 420, nombre: 'movil-comercial' },
  { usuario: 'comercial', ruta: '/notificaciones', ancho: 420, nombre: 'movil-avisos' },
  // Las de oficina, en un monitor.
  { usuario: 'admin', ruta: '/', ancho: 1440, nombre: 'web-panel' },
  { usuario: 'admin', ruta: '/flota', ancho: 1440, nombre: 'web-flota' },
  { usuario: 'logistica', ruta: '/traslados', ancho: 1440, nombre: 'web-traslados' },
  { usuario: 'logistica', ruta: '/solicitudes', ancho: 1440, nombre: 'web-solicitudes' },
  { usuario: 'logistica', ruta: '/entregas', ancho: 1440, nombre: 'web-entregas' },
  { usuario: 'admin', ruta: '/administracion', ancho: 1440, nombre: 'web-admin' },
  { usuario: 'logistica', ruta: '/preparacion', ancho: 1440, nombre: 'web-preparacion' },
  { usuario: 'logistica', ruta: '/campa', ancho: 1440, nombre: 'web-campa' },
];

// `--solo=web-flota,movil-login` para no repetir las trece cada vez.
const solo = process.argv.find((a) => a.startsWith('--solo='))?.slice(7).split(',');

const servidor = await servirEstatico('dist', PUERTO);
const browser = await abrirNavegador();
const dir = `capturas/${etiqueta}`;
mkdirSync(dir, { recursive: true });

for (const p of PANTALLAS.filter((x) => !solo || solo.includes(x.nombre))) {
  const { context, page } = p.usuario
    ? await entrarComo(browser, USUARIOS[p.usuario], p.ancho)
    : await sinSesion(browser, p.ancho);
  await page.goto(`${servidor.url}${p.ruta}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  if (p.escribir) {
    await page.locator('input').first().fill(p.escribir);
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${dir}/${p.nombre}.png` });
  await context.close();
  console.log(`  ✓ ${dir}/${p.nombre}.png`);
}

await browser.close();
servidor.cerrar();

async function sinSesion(b, width) {
  const context = await b.newContext({ viewport: { width, height: 900 } });
  return { context, page: await context.newPage() };
}
console.log(`\nCapturas en ${dir}/`);
