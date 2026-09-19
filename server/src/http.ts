/**
 * Capa HTTP.
 *
 * Con `node:http` y nada más. Son cuatro rutas: meter un framework aquí
 * sería añadir dependencias que auditar y actualizar a cambio de nada.
 */
import http from 'node:http';
import type { Servicio } from './servicio';
import type { Config } from './config';
import { ErrorHttp } from './errores';
import { MAX_POR_ORIGEN, anotarFallo, bloqueado } from './auth';
import { hayWeb, servirWeb } from './web';

/** Tamaño máximo de una petición. Un comando son unos pocos kilobytes. */
const MAX_CUERPO = 1_000_000;

/** Lee el cuerpo tal cual, sin interpretarlo. Para las fotos. */
async function leerBinario(req: http.IncomingMessage, maximo: number): Promise<Buffer> {
  // Si ya viene dicho el tamaño, se corta antes de gastar la conexión: en un
  // móvil con cobertura de campa, subir ocho megas para que luego se
  // rechacen es tiempo del operario tirado.
  const anunciado = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(anunciado) && anunciado > maximo) {
    throw new ErrorHttp(413, 'La foto pesa demasiado.');
  }

  const trozos: Buffer[] = [];
  let total = 0;
  for await (const t of req) {
    total += (t as Buffer).length;
    if (total > maximo) throw new ErrorHttp(413, 'La foto pesa demasiado.');
    trozos.push(t as Buffer);
  }
  return Buffer.concat(trozos);
}

async function leerCuerpo(req: http.IncomingMessage): Promise<unknown> {
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const t of req) {
    total += (t as Buffer).length;
    if (total > MAX_CUERPO) throw new ErrorHttp(413, 'Petición demasiado grande.');
    trozos.push(t as Buffer);
  }
  if (total === 0) return null;
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    throw new ErrorHttp(400, 'El cuerpo no es JSON válido.');
  }
}

function cabecerasCors(res: http.ServerResponse, origen: string | undefined, permitidos: string[]) {
  const abierto = permitidos.includes('*');
  const vale = abierto || (origen !== undefined && permitidos.includes(origen));
  if (!vale) return;
  res.setHeader('Access-Control-Allow-Origin', abierto ? (origen ?? '*') : origen!);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Cierra la petición cuando se ha respondido sin haberla leído entera.
 *
 * Pasa al rechazar una foto por tamaño: el móvil sigue mandando bytes y, si
 * no se corta, se queda esperando una respuesta que ya se ha enviado. Se
 * quedaba colgado hasta el tiempo de espera.
 */
/** Puertas que se pueden empujar sin sesión, y por eso hay que vigilar. */
const SIN_SESION = ['/auth/login', '/auth/olvidada', '/auth/restablecer'];

/**
 * De dónde viene la petición.
 *
 * Detrás de Railway o de Caddy, la dirección del socket es la del proxy: la
 * de verdad viene en `X-Forwarded-For`. Solo se usa para contar intentos.
 */
function origenDe(req: http.IncomingMessage): string {
  const reenviada = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return reenviada || req.socket.remoteAddress || 'desconocido';
}

function cortarSiQuedaCuerpo(req: http.IncomingMessage) {
  if (!req.readableEnded) req.destroy();
}

/**
 * Cabeceras de seguridad que van en todas las respuestas.
 *
 * Ninguna cuesta nada y cada una cierra una puerta conocida: que no metan
 * la aplicación dentro de un marco para engañar a quien la usa, que el
 * navegador no adivine tipos de fichero, y que la dirección de nuestras
 * pantallas no se filtre al navegar fuera.
 */
function cabecerasDeSeguridad(res: http.ServerResponse, produccion: boolean) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (produccion) {
    // Solo en producción: en local se trabaja sin HTTPS y esto dejaría el
    // navegador negándose a entrar durante un año.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function responder(res: http.ServerResponse, codigo: number, cuerpo: unknown) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'no-store',
  });
  res.end(texto);
}

/** Las rutas que son API. Todo lo demás, si hay web compilada, es la web. */
const API = [
  '/health',
  '/auth/login',
  '/auth/password',
  '/auth/olvidada',
  '/auth/restablecer',
  '/state',
  '/commands',
  '/push/token',
];
/** Rutas de la API con algo detrás de la barra. */
const API_PREFIJOS = ['/fotos'];

export function crearServidor(servicio: Servicio, config: Config): http.Server {
  const conWeb = hayWeb(config.carpetaWeb);
  if (conWeb) console.log(`Sirviendo también el panel web desde ${config.carpetaWeb}`);

  return http.createServer(async (req, res) => {
    const inicio = Date.now();
    const url = new URL(req.url ?? '/', 'http://interno');
    const ruta = url.pathname.replace(/\/+$/, '') || '/';

    cabecerasDeSeguridad(res, config.produccion);
    cabecerasCors(res, req.headers.origin, config.origenes);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // El panel web sale del mismo sitio que la API: un solo despliegue y
      // ningún problema de CORS entre los dos.
      const esApi = API.includes(ruta) || API_PREFIJOS.some((p) => ruta === p || ruta.startsWith(`${p}/`));
      if (conWeb && !esApi && (req.method === 'GET' || req.method === 'HEAD')) {
        await servirWeb(config.carpetaWeb, ruta, res);
        registrar(req, ruta, 200, inicio);
        return;
      }

      const salida = await enrutar(servicio, config, req, ruta, res);
      if (!salida) return; // ya ha respondido por su cuenta (una foto)
      responder(res, salida.codigo, salida.cuerpo);
      registrar(req, ruta, salida.codigo, inicio);
    } catch (e) {
      if (e instanceof ErrorHttp) {
        // Un intento fallido de entrar o de restablecer sí cuenta contra la
        // dirección de origen; uno correcto, no.
        if (SIN_SESION.includes(ruta) && (e.codigo === 401 || e.codigo === 410)) {
          anotarFallo(`ip:${origenDe(req)}`);
        }
        responder(res, e.codigo, { ok: false, error: e.message });
        cortarSiQuedaCuerpo(req);
        registrar(req, ruta, e.codigo, inicio);
        return;
      }
      // Un fallo nuestro se devuelve como 500 a propósito: así la app
      // mantiene el comando en la cola y lo reintenta en vez de tirarlo.
      console.error('Fallo no controlado:', e);
      responder(res, 500, { ok: false, error: 'Error interno. Vuelve a intentarlo.' });
      cortarSiQuedaCuerpo(req);
      registrar(req, ruta, 500, inicio);
    }
  });
}

function registrar(req: http.IncomingMessage, ruta: string, codigo: number, inicio: number) {
  // Sin cuerpos ni cabeceras: en los logs no debe acabar ni una contraseña
  // ni un token.
  console.log(`${req.method} ${ruta} → ${codigo} (${Date.now() - inicio} ms)`);
}

interface Salida {
  codigo: number;
  cuerpo: unknown;
}

async function enrutar(
  servicio: Servicio,
  config: Config,
  req: http.IncomingMessage,
  ruta: string,
  res: http.ServerResponse
): Promise<Salida | null> {
  const metodo = req.method ?? 'GET';

  // Freno por dirección de origen: el freno por correo no sirve contra quien
  // prueba un correo distinto cada vez. El límite es alto y solo cuentan los
  // fallos (ver `crearServidor`): una oficina entera entrando por la mañana
  // no puede quedarse fuera por culpa de esto.
  if (SIN_SESION.includes(ruta) && bloqueado(`ip:${origenDe(req)}`, MAX_POR_ORIGEN)) {
    throw new ErrorHttp(429, 'Demasiados intentos desde este sitio. Prueba dentro de un rato.');
  }

  // Pedir el enlace de contraseña manda un correo, así que cuenta siempre:
  // si no, se puede usar para llenarle el buzón a alguien.
  if (ruta === '/auth/olvidada') anotarFallo(`ip:${origenDe(req)}`);

  /* ------------------------------------------------------------ fotos */
  if (ruta === '/fotos' && metodo === 'POST') {
    const user = servicio.usuarioDeToken(req.headers.authorization);
    const cuerpo = await leerBinario(req, config.maxFotoBytes);
    const id = await servicio.guardarFoto(cuerpo, req.headers['content-type'] ?? '');
    console.log(`foto guardada por ${user.id} (${cuerpo.length} bytes)`);
    return { codigo: 200, cuerpo: { ok: true, id } };
  }

  if (ruta.startsWith('/fotos/') && (metodo === 'GET' || metodo === 'HEAD')) {
    // La sesión puede venir en la cabecera o, para poder pintarlas con una
    // etiqueta <img>, en la dirección. Los identificadores son aleatorios y
    // largos, así que la dirección por sí sola tampoco se adivina.
    const enLaUrl = new URL(req.url ?? '/', 'http://interno').searchParams.get('t');
    servicio.usuarioDeToken(req.headers.authorization ?? (enLaUrl ? `Bearer ${enLaUrl}` : undefined));

    const id = decodeURIComponent(ruta.slice('/fotos/'.length));
    const foto = await servicio.leerFoto(id);
    res.writeHead(200, {
      'Content-Type': foto.tipo,
      'Content-Length': foto.cuerpo.length,
      // El contenido de una foto no cambia nunca: su id es único.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(metodo === 'HEAD' ? undefined : foto.cuerpo);
    return null;
  }


  if (ruta === '/health' && metodo === 'GET') {
    await servicio.salud();
    return { codigo: 200, cuerpo: { ok: true } };
  }

  if (ruta === '/auth/login' && metodo === 'POST') {
    const cuerpo = (await leerCuerpo(req)) as { email?: unknown; password?: unknown } | null;
    const { token, user } = await servicio.login(cuerpo?.email, cuerpo?.password);
    return { codigo: 200, cuerpo: { token, user } };
  }

  if (ruta === '/auth/password' && metodo === 'POST') {
    const user = servicio.usuarioDeToken(req.headers.authorization);
    const cuerpo = (await leerCuerpo(req)) as
      | { userId?: unknown; actual?: unknown; nueva?: unknown }
      | null;
    const objetivo = typeof cuerpo?.userId === 'string' ? cuerpo.userId : user.id;
    await servicio.cambiarPassword(user, objetivo, cuerpo?.actual, cuerpo?.nueva);
    return { codigo: 200, cuerpo: { ok: true } };
  }

  if (ruta === '/auth/olvidada' && metodo === 'POST') {
    const cuerpo = (await leerCuerpo(req)) as { email?: unknown } | null;
    await servicio.pedirEnlace(cuerpo?.email);
    // Siempre lo mismo: decir si el correo existe sería regalar la lista de
    // quién trabaja aquí.
    return {
      codigo: 200,
      cuerpo: { ok: true, mensaje: 'Si ese correo está dado de alta, ya va camino el enlace.' },
    };
  }

  if (ruta === '/auth/restablecer' && metodo === 'POST') {
    const cuerpo = (await leerCuerpo(req)) as { codigo?: unknown; nueva?: unknown } | null;
    await servicio.restablecer(cuerpo?.codigo, cuerpo?.nueva);
    return { codigo: 200, cuerpo: { ok: true } };
  }

  if (ruta === '/state' && metodo === 'GET') {
    const user = servicio.usuarioDeToken(req.headers.authorization);
    return { codigo: 200, cuerpo: servicio.estadoDe(user) };
  }

  if (ruta === '/commands' && metodo === 'POST') {
    const user = servicio.usuarioDeToken(req.headers.authorization);
    const cuerpo = await leerCuerpo(req);
    const { repetido } = await servicio.ejecutar(cuerpo, user);
    return { codigo: 200, cuerpo: { ok: true, repetido } };
  }

  if (ruta === '/push/token' && metodo === 'POST') {
    const user = servicio.usuarioDeToken(req.headers.authorization);
    const cuerpo = (await leerCuerpo(req)) as { token?: unknown } | null;
    await servicio.registrarTokenPush(user, cuerpo?.token);
    return { codigo: 200, cuerpo: { ok: true } };
  }

  return { codigo: 404, cuerpo: { ok: false, error: 'Ruta desconocida.' } };
}
