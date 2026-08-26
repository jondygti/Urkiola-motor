import { mkdirSync, writeFileSync } from 'node:fs';
import { cssDeLaFuente } from './fuente.mjs';

/**
 * Deja la fuente lista en `public/`, que Expo copia tal cual a la web
 * compilada. Se genera en cada compilación en vez de guardarla en el
 * repositorio: es un fichero de un mega y pico que sale de los `.ttf`, y
 * guardarlo sería tener lo mismo dos veces.
 */
mkdirSync('public', { recursive: true });
const css = cssDeLaFuente();
writeFileSync('public/fuente.css', css);
console.log(`· Fuente lista: public/fuente.css (${(css.length / 1024 / 1024).toFixed(2)} MB)`);
