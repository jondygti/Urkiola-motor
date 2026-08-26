import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { marcador } from './entorno.mjs';

/**
 * Que el sistema de diseño siga siendo el sistema.
 *
 * Esto no se prueba con un navegador: se lee el código. Existe porque la
 * letra se había quedado fuera del sistema —222 tamaños escritos a mano por
 * las pantallas, nueve valores distintos y el más usado un 11— y sin una
 * comprobación vuelve a pasar en tres semanas sin que nadie lo note.
 */
function ficheros(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ficheros(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

export function ejecutar() {
  const { ok, resumen } = marcador();
  const fuentes = [...ficheros('app'), ...ficheros('src')];

  // 1 · Ningún tamaño de letra escrito a mano fuera del sistema.
  const sueltos = [];
  for (const f of fuentes) {
    if (f.includes('ui/theme')) continue;
    const texto = readFileSync(f, 'utf8');
    for (const [i, linea] of texto.split('\n').entries()) {
      if (/fontSize: \d/.test(linea)) sueltos.push(`${f}:${i + 1}`);
    }
  }
  ok(
    'DISEÑO · ningún tamaño de letra escrito a mano',
    sueltos.length === 0,
    sueltos.slice(0, 3).join(' · ')
  );

  // 2 · El suelo de la escala no baja de 11: por debajo no se lee un móvil
  //     con guantes y con sol de cara.
  const tema = readFileSync('src/ui/theme.tsx', 'utf8');
  const tamanos = [...tema.matchAll(/^\s+\w+: (\d+),$/gm)].map((m) => Number(m[1]));
  const minimo = Math.min(...tamanos.filter((n) => n >= 4 && n <= 60));
  ok('DISEÑO · el tamaño más pequeño de la escala es 11', minimo >= 11, `mínimo ${minimo}`);

  // 3 · Las pantallas de campo usan la escala de campo, no la de oficina.
  const CAMPO = [
    'app/(shell)/mi-preparacion.tsx',
    'app/(shell)/mover.tsx',
    'app/(shell)/mis-traslados.tsx',
    'app/(shell)/mi-recepcion.tsx',
    'app/(shell)/mis-coches.tsx',
  ];
  const mal = CAMPO.filter((f) => readFileSync(f, 'utf8').includes('fontSize: tipografia.'));
  ok('DISEÑO · las pantallas de campo usan la escala de campo', mal.length === 0, mal.join(' · '));

  return resumen();
}
