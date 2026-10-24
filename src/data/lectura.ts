/**
 * De lo que la cámara lee en un parabrisas o una placa, la matrícula y el
 * bastidor.
 *
 * La cámara solo leía códigos de barras, y la mayoría de los coches no
 * llevan ninguno a mano: el bastidor está grabado en la placa del
 * parabrisas, con sus 17 caracteres, y la matrícula en la placa. Ahora el
 * móvil reconoce el texto de una foto (`expo-text-extractor`, ML Kit en el
 * propio teléfono) y esto se queda con lo que interesa del montón de texto
 * que sale: pegatinas, el logotipo, la ITV…
 *
 * Funciones puras, para poder probarlas sin cámara.
 */

/** Las letras de una matrícula actual: sin vocales, sin Ñ ni Q. */
const LETRAS_MATRICULA = 'BCDFGHJKLMNPRSTVWXYZ';

/**
 * Lo que el reconocimiento confunde en un bastidor. Un VIN no lleva nunca
 * I, O ni Q, precisamente para no confundirlas con 1 y 0: si salen, son eso.
 */
function limpiarVin(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[OQ]/g, '0').replace(/I/g, '1');
}

/**
 * Bastidores (17 caracteres) que aparecen en el texto.
 *
 * El texto se parte en trozos por espacios y signos, y vale un trozo de 17,
 * o varios seguidos que juntos sumen 17: el lector a veces parte el
 * bastidor («VF3 M45GZ…»). Exactamente 17 y no «17 dentro de algo más
 * largo», que si no «VIN:VF3…» daría tres bastidores corridos de una letra.
 * Si en ninguna línea sale, se prueba con todas seguidas, por si el lector
 * partió el bastidor en dos líneas.
 */
export function bastidoresEn(lineas: string[]): string[] {
  const vistos = new Set<string>();
  const buscar = (trozos: string[]) => {
    for (let i = 0; i < trozos.length; i++) {
      let junto = '';
      for (let j = i; j < trozos.length && junto.length < 17; j++) {
        junto += trozos[j];
        if (junto.length !== 17) continue;
        const vin = limpiarVin(junto);
        // Letras y números mezclados, y el número de serie al final: 17
        // cifras seguidas son un teléfono o un código de pegatina.
        if (/[A-Z]/.test(vin) && /\d{3}$/.test(vin)) vistos.add(vin);
      }
    }
  };
  const trozosDe = (texto: string) => texto.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (const l of lineas) buscar(trozosDe(l));
  if (vistos.size === 0) buscar(lineas.flatMap(trozosDe));
  return [...vistos];
}

/**
 * Matrículas españolas que aparecen en el texto, escritas como se guardan
 * («1234 BCD»).
 *
 * El formato actual (cuatro cifras y tres consonantes) se busca en cualquier
 * sitio, también pegado a la «E» de la franja azul. El antiguo provincial
 * («BI-1234-AB») solo si viene separado con guiones o espacios, que si no
 * casaría con medio texto de una pegatina.
 */
export function matriculasEn(lineas: string[]): string[] {
  const vistas = new Set<string>();
  const letras = `[${LETRAS_MATRICULA}]`;
  for (const l of lineas) {
    const texto = l.toUpperCase();
    const junto = texto.replace(/[\s.\-·]/g, '');
    for (const m of junto.matchAll(new RegExp(`(\\d{4})(${letras}{3})(?![A-Z0-9])`, 'g'))) {
      vistas.add(`${m[1]} ${m[2]}`);
    }
    for (const m of texto.matchAll(/(?:^|[^A-Z])([A-Z]{1,2})[\s-](\d{4})[\s-]([A-Z]{1,2})(?![A-Z0-9])/g)) {
      vistas.add(`${m[1]}-${m[2]}-${m[3]}`);
    }
  }
  return [...vistas];
}

export interface Lectura {
  bastidores: string[];
  matriculas: string[];
}

/** Lo que interesa de todo el texto leído. */
export function leerTexto(lineas: string[]): Lectura {
  return { bastidores: bastidoresEn(lineas), matriculas: matriculasEn(lineas) };
}
