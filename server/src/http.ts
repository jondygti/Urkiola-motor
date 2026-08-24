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
import { hayWeb, servirWeb } from './web';

/** Tamaño máximo de una petición. Un comando son unos pocos kilobytes. */
const MAX_CUERPO = 1_000_000;

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

function responder(res: http.ServerResponse, codigo: number, cuerpo: unknown) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    // Cabeceras de andar por casa, pero gratis: la API no devuelve HTML.
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(texto);
}

/** Las rutas que son API. Todo lo demás, si hay web compilada, es la web. */
const API = ['/health', '/auth/login', '/auth/password', '/state', '/commands', '/push/token'];

export function crearServidor(servicio: Servicio, config: Config): http.Server {
  const conWeb = hayWeb(config.carpetaWeb);
  if (conWeb) console.log(`Sirviendo también el panel web desde ${config.carpetaWeb}`);

  return http.createServer(async (req, res) => {
    const inicio = Date.now();
    const url = new URL(req.url ?? '/', 'http://interno');
    const ruta = url.pathname.replace(/\/+$/, '') || '/';

    cabecerasCors(res, req.headers.origin, config.origenes);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // El panel web sale del mismo sitio que la API: un solo despliegue y
      // ningún problema de CORS entre los dos.
      if (conWeb && !API.includes(ruta) && (req.method === 'GET' || req.method === 'HEAD')) {
        await servirWeb(config.carpetaWeb, ruta, res);
        registrar(req, ruta, 200, inicio);
        return;
      }

      const salida = await enrutar(servicio, req, ruta);
      responder(res, salida.codigo, salida.cuerpo);
      registrar(req, ruta, salida.codigo, inicio);
    } catch (e) {
      if (e instanceof ErrorHttp) {
        responder(res, e.codigo, { ok: false, error: e.message });
        registrar(req, ruta, e.codigo, inicio);
        return;
      }
      // Un fallo nuestro se devuelve como 500 a propósito: así la app
      // mantiene el comando en la cola y lo reintenta en vez de tirarlo.
      console.error('Fallo no controlado:', e);
      responder(res, 500, { ok: false, error: 'Error interno. Vuelve a intentarlo.' });
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

async function enrutar(servicio: Servicio, req: http.IncomingMessage, ruta: string): Promise<Salida> {
  const metodo = req.method ?? 'GET';

  if (ruta === '/health' && metodo === 'GET') {
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
