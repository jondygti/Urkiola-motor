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

export function bloqueado(clave: string, ahora = Date.now()): boolean {
  const f = fallos.get(clave);
  if (!f) return false;
  if (f.hasta < ahora) {
    fallos.delete(clave);
    return false;
  }
  return f.n >= MAX_INTENTOS;
}

export function anotarFallo(clave: string, ahora = Date.now()): void {
  const f = fallos.get(clave);
  if (!f || f.hasta < ahora) fallos.set(clave, { n: 1, hasta: ahora + VENTANA_MS });
  else f.n += 1;
}

export function limpiarFallos(clave: string): void {
  fallos.delete(clave);
}
