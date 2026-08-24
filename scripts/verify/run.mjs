import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { abrirNavegador } from './entorno.mjs';
import { servirEstatico } from './servidor.mjs';
import { ejecutar as barrerRutas } from './rutas.mjs';
import { ejecutar as probarFunciones } from './funciones.mjs';
import { ejecutar as probarRoles } from './roles.mjs';

/**
 * Comprobación completa de la aplicación web: compila, la sirve y la
 * recorre con un navegador de verdad.
 *
 *   npm run verify              usa dist/ si ya existe
 *   npm run verify -- --build   fuerza a recompilar antes
 */
const forzarBuild = process.argv.includes('--build');
const PUERTO = Number(process.env.VERIFY_PORT ?? 4310);

if (forzarBuild || !existsSync('dist/index.html')) {
  console.log('▸ Compilando la web…');
  execSync('npm run build:web', { stdio: 'inherit' });
}

const servidor = await servirEstatico('dist', PUERTO);
console.log(`▸ Sirviendo dist/ en ${servidor.url}\n`);

const browser = await abrirNavegador();
let todoBien = true;

try {
  console.log('══ Barrido de pantallas ' + '═'.repeat(30));
  todoBien = (await barrerRutas(browser, servidor.url)) && todoBien;

  console.log('\n══ Operativa ' + '═'.repeat(41));
  todoBien = (await probarFunciones(browser, servidor.url)) && todoBien;

  console.log('\n══ La jornada de cada rol ' + '═'.repeat(28));
  todoBien = (await probarRoles(browser, servidor.url)) && todoBien;
} finally {
  await browser.close();
  servidor.cerrar();
}

console.log(todoBien ? '\n✔ Todo correcto.' : '\n✖ Hay comprobaciones que fallan.');
process.exit(todoBien ? 0 : 1);
