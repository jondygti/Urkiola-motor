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
      // Cuenta también los que van dentro de un condicional
      // (`fontSize: compacta ? 12 : 13`), que es como se coló uno.
      if (/fontSize:[^,}]*\b\d+\b/.test(linea)) sueltos.push(`${f}:${i + 1}`);
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
    'app/(shell)/recuentos.tsx',
  ];
  const mal = CAMPO.filter((f) => readFileSync(f, 'utf8').includes('fontSize: tipografia.'));
  ok('DISEÑO · las pantallas de campo usan la escala de campo', mal.length === 0, mal.join(' · '));

  // 4 · Sin emojis en las pantallas: los iconos salen de <Icon>. Los emojis
  //     los dibuja cada teléfono a su manera y se habían repetido hasta no
  //     distinguir una sección de otra. Las flechas (→ ← ↑ ↓) no cuentan:
  //     son texto, como en «Sondika → Leioa».
  const EMOJI =
    /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FA}\u{25A0}-\u{25FF}]/u;
  const conEmoji = [];
  for (const f of fuentes) {
    for (const [i, linea] of readFileSync(f, 'utf8').split('\n').entries()) {
      const codigo = linea.trim();
      if (codigo.startsWith('//') || codigo.startsWith('*') || codigo.startsWith('/*')) continue;
      if (EMOJI.test(linea)) conEmoji.push(`${f}:${i + 1}`);
    }
  }
  ok('DISEÑO · sin emojis en las pantallas (iconos con <Icon>)', conEmoji.length === 0, conEmoji.slice(0, 3).join(' · '));

  // 5 · Cada sección del menú con su propio icono.
  const menu = readFileSync('src/features/shell/nav.ts', 'utf8');
  const iconos = [...menu.matchAll(/icon: '(\w+)'/g)].map((m) => m[1]);
  const repetidos = iconos.filter((n, i) => iconos.indexOf(n) !== i);
  ok(
    'DISEÑO · ningún icono repetido en el menú',
    iconos.length > 10 && repetidos.length === 0,
    repetidos.length ? `repetidos: ${repetidos.join(', ')}` : `${iconos.length} iconos`
  );

  return resumen();
}
