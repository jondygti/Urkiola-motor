/**
 * Sesiones y contraseñas.
 *
 * Sin librerías: el token es un JWT HS256 firmado con `node:crypto` y la
 * contraseña se guarda con scrypt, que también viene en Node. Menos
 * dependencias que auditar en la revisión de seguridad y una cosa menos que
 * se quede sin actualizar.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/* ------------------------------------------------------------ contraseñas */

const SCRYPT = { N: 16384, r: 8, p: 1, largo: 32 };

/** Guarda la contraseña como `scrypt$N$r$p$sal$hash`, nunca en claro. */
export function cifrarPassword(password: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(password.normalize('NFKC'), sal, SCRYPT.largo, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64'), hash.toString('base64')].join('$');
}

export function comprobarPassword(password: string, guardado: string): boolean {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal64, hash64] = partes;
  try {
    const esperado = Buffer.from(hash64, 'base64');
    const hash = scryptSync(password.normalize('NFKC'), Buffer.from(sal64, 'base64'), esperado.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    // Comparación en tiempo constante: comparar con === filtra información
    // sobre cuántos bytes ha acertado quien lo intenta.
    return hash.length === esperado.length && timingSafeEqual(hash, esperado);
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- tokens */

const b64url = (b: Buffer) => b.toString('base64url');

function firma(datos: string, secreto: string): string {
  return b64url(createHmac('sha256', secreto).update(datos).digest());
}

export interface Sesion {
  /** Id del usuario. */
  sub: string;
  /** Emitido en (segundos). */
  iat: number;
  /** Caduca en (segundos). */
  exp: number;
}

export function emitirToken(userId: string, secreto: string, dias: number): string {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const cuerpo = b64url(
    Buffer.from(JSON.stringify({ sub: userId, iat: ahora, exp: ahora + dias * 86400 } satisfies Sesion))
  );
  const datos = `${cabecera}.${cuerpo}`;
  return `${datos}.${firma(datos, secreto)}`;
}

/** Devuelve la sesión si el token es válido y no ha caducado; si no, null. */
export function leerToken(token: string, secreto: string): Sesion | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cabecera, cuerpo, sello] = partes;

  // Se comprueba el algoritmo declarado: aceptar el que diga el token es el
  // fallo clásico de JWT (basta con mandar alg: "none").
  let alg: unknown;
  try {
    alg = (JSON.parse(Buffer.from(cabecera, 'base64url').toString()) as { alg?: unknown }).alg;
  } catch {
    return null;
  }
  if (alg !== 'HS256') return null;

  const esperado = Buffer.from(firma(`${cabecera}.${cuerpo}`, secreto));
  const recibido = Buffer.from(sello);
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;

  try {
    const sesion = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as Sesion;
    if (typeof sesion.sub !== 'string' || typeof sesion.exp !== 'number') return null;
    if (sesion.exp * 1000 < Date.now()) return null;
    return sesion;
  } catch {
    return null;
  }
}

export interface AccesoFoto extends Sesion {
  /** Identificador exacto de la evidencia que puede leerse. */
  foto: string;
}

function secretoFotos(secreto: string): string {
  return createHmac('sha256', secreto).update('urkiola:fotos:v1').digest('base64url');
}

/**
 * Capacidad de corta duración para que <Image>/<img> pueda pedir una única
 * evidencia sin meter el JWT general de la cuenta en la URL.
 */
export function emitirTokenFoto(userId: string, foto: string, secreto: string, minutos = 5): string {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const cuerpo = b64url(
    Buffer.from(JSON.stringify({
      sub: userId,
      foto,
      iat: ahora,
      exp: ahora + minutos * 60,
    } satisfies AccesoFoto))
  );
  const datos = `${cabecera}.${cuerpo}`;
  return `${datos}.${firma(datos, secretoFotos(secreto))}`;
}

export function leerTokenFoto(token: string, foto: string, secreto: string): AccesoFoto | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cabecera, cuerpo, sello] = partes;

  try {
    const head = JSON.parse(Buffer.from(cabecera, 'base64url').toString()) as { alg?: unknown };
    if (head.alg !== 'HS256') return null;
  } catch {
    return null;
  }

  const esperado = Buffer.from(firma(`${cabecera}.${cuerpo}`, secretoFotos(secreto)));
  const recibido = Buffer.from(sello);
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;

  try {
    const acceso = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as AccesoFoto;
    if (
      typeof acceso.sub !== 'string' ||
      typeof acceso.foto !== 'string' ||
      typeof acceso.iat !== 'number' ||
      typeof acceso.exp !== 'number' ||
      acceso.foto !== foto ||
      acceso.exp * 1000 < Date.now()
    ) return null;
    return acceso;
  } catch {
    return null;
  }
}

/* -------------------------------------------- intentos fallidos de acceso */

/**
 * Freno a la prueba de contraseñas: tras varios fallos seguidos, ese correo
 * deja de admitir intentos un rato. En memoria a propósito; con varias
 * instancias cada una lleva su cuenta y sigue siendo suficiente para lo que
 * es (que nadie pruebe diccionarios contra la API).
 */
const VENTANA_MS = 15 * 60_000;
const MAX_INTENTOS = 10;
const fallos = new Map<string, { n: number; hasta: number }>();

/**
 * ¿Se ha pasado de intentos?
 *
 * El límite se pasa aparte porque no es el mismo para todo: diez fallos
 * seguidos con un correo concreto es alguien probando contraseñas, pero
 * diez peticiones desde la misma dirección son las cinco personas de una
 * oficina entrando por la mañana. Confundirlos deja fuera a todo el mundo.
 */
export function bloqueado(clave: string, max = MAX_INTENTOS, ahora = Date.now()): boolean {
  const f = fallos.get(clave);
  if (!f) return false;
  if (f.hasta < ahora) {
    fallos.delete(clave);
    return false;
  }
  return f.n >= max;
}

/** Límite por dirección de origen: mucho más alto, y solo cuenta fallos. */
export const MAX_POR_ORIGEN = 60;

export function anotarFallo(clave: string, ahora = Date.now()): void {
  const f = fallos.get(clave);
  if (!f || f.hasta < ahora) fallos.set(clave, { n: 1, hasta: ahora + VENTANA_MS });
  else f.n += 1;
}

export function limpiarFallos(clave: string): void {
  fallos.delete(clave);
}
