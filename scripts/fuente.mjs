import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * El CSS de la fuente, con los ficheros metidos dentro.
 *
 * Va incrustada y no traída de internet por dos motivos: la demostración
 * tiene que abrirse con doble clic sin conexión, y la app en una campa con
 * mala cobertura no puede quedarse esperando a que baje una letra.
 *
 * Tres grosores en vez de los cinco que usa la aplicación: el navegador
 * escoge el más cercano y la diferencia entre 800 y 900 no se ve, mientras
 * que cada fichero de más son 340 KB que alguien se descarga.
 */
const PESOS = [
  { fichero: 'Inter_400Regular.ttf', peso: 400 },
  { fichero: 'Inter_700Bold.ttf', peso: 700 },
  { fichero: 'Inter_900Black.ttf', peso: 900 },
];

export function cssDeLaFuente() {
  const caras = PESOS.map(({ fichero, peso }) => {
    const b64 = readFileSync(join(RAIZ, 'assets/fuentes', fichero)).toString('base64');
    return `@font-face{font-family:'Inter';font-style:normal;font-weight:${peso};font-display:swap;src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
  }).join('\n');

  // React Native Web no hereda la fuente de un contenedor: la pone en cada
  // texto. Pero tampoco la escribe nunca, así que basta con declararla en el
  // body y el navegador la hereda como en cualquier página.
  return `${caras}
html, body, #root, input, textarea, select, button {
  font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
/* Los números de matrícula y de plaza se leen mejor con todos los dígitos
   del mismo ancho: así una columna de matrículas queda alineada. */
body { font-variant-numeric: tabular-nums; }`;
}
