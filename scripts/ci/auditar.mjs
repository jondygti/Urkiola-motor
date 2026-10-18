// Auditoría de dependencias de producción con excepciones que caducan.
//
// `npm audit --audit-level=high` a secas no deja distinguir: un aviso sin
// arreglo publicado en una pieza que solo se usa al compilar bloqueaba
// todos los cambios, y la única salida era bajar el nivel para todo (y
// dejar de ver los avisos que sí importan). Aquí cada excepción dice por
// qué no afecta a la app ni al servidor y hasta cuándo vale: al caducar la
// comprobación vuelve a fallar y obliga a mirarlo otra vez.
//
// Uso: node scripts/ci/auditar.mjs [carpeta]   (por defecto, la raíz)
import { execFileSync } from 'node:child_process';

const EXCEPCIONES = {
  // braces ≤3.0.3: solo lo usa el empaquetador de Expo (@expo/cli →
  // @expo/metro-file-map → micromatch) para buscar ficheros al compilar.
  // No va en la web ni en el APK, y el servidor no lo tiene.
  'GHSA-vfj7-8cjw-p6xm': { caduca: '2026-12-31', paquete: 'braces' },
  // node-forge ≤1.4.0: lo usan las herramientas de Expo para firmar
  // actualizaciones (expo-updates/cli, @expo/cli) en el ordenador que
  // compila. La app no lo lleva y el servidor no lo tiene.
  'GHSA-86w9-cpqp-85rv': { caduca: '2026-12-31', paquete: 'node-forge' },
};

const carpeta = process.argv[2] ?? '.';
let salida;
try {
  salida = execFileSync('npm', ['--prefix', carpeta, 'audit', '--omit=dev', '--json'], { encoding: 'utf8' });
} catch (e) {
  // npm audit sale con código 1 cuando encuentra algo; el JSON viene igual.
  salida = e.stdout;
}
const informe = JSON.parse(salida);
const hoy = new Date().toISOString().slice(0, 10);

const avisos = new Map();
for (const v of Object.values(informe.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== 'object') continue;
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    const id = via.url.split('/').pop();
    avisos.set(id, via);
  }
}

let fallos = 0;
for (const [id, via] of avisos) {
  const exc = EXCEPCIONES[id];
  if (exc && exc.paquete === via.name && hoy <= exc.caduca) {
    console.log(`Aceptado hasta ${exc.caduca}: ${id} ${via.name} (${via.severity}) · ${via.title}`);
    continue;
  }
  const motivo = exc ? `la excepción caducó el ${exc.caduca}` : 'sin excepción';
  console.error(`FALLA ${id} ${via.name} (${via.severity}, ${motivo}) · ${via.title} · ${via.url}`);
  fallos++;
}
console.log(`${carpeta}: ${avisos.size} avisos altos o críticos, ${fallos} sin aceptar.`);
process.exit(fallos ? 1 : 0);
