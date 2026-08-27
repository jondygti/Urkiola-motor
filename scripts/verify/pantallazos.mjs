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
];

const servidor = await servirEstatico('dist', PUERTO);
const browser = await abrirNavegador();
const dir = `capturas/${etiqueta}`;
mkdirSync(dir, { recursive: true });

for (const p of PANTALLAS) {
  const { context, page } = await entrarComo(browser, USUARIOS[p.usuario], p.ancho);
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
console.log(`\nCapturas en ${dir}/`);
