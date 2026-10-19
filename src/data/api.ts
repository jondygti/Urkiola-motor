import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { AppState } from './types';
import type { Command } from './commands';

/**
 * Cliente del backend.
 *
 * Si `EXPO_PUBLIC_API_URL` está vacío la app funciona en MODO DEMO: usa el
 * parque de ejemplo y guarda los cambios en el propio dispositivo. En cuanto
 * apuntas a un servidor real, la misma app pasa a trabajar contra la API.
 *
 * Contrato mínimo que debe implementar el backend (ver docs/BACKEND-API.md):
 *   POST /auth/login      { email, password }        -> { token, user }
 *   GET  /state                                      -> AppState
 *   GET  /historial/:vehicleId                       -> { events }
 *   POST /commands        Command                    -> { ok: true }
 *   GET  /health                                     -> { ok: true }
 *   POST /push/token      { token }                  -> { ok: true }
 *
 * Está implementado en `server/`, con las mismas reglas de negocio que la
 * app (reutiliza `src/data/commands.ts`).
 */

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const apiEnabled = API_URL.length > 0;

/** Cuánto esperamos a la red antes de darla por perdida (campa, sótanos…). */
const TIMEOUT_MS = 15_000;

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export const haySesion = () => authToken !== null;

/**
 * Error de la API con el código HTTP, para poder distinguir entre
 * «no hay red, reintenta» y «el servidor ha rechazado esto, no insistas».
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** true si reintentar más tarde tiene sentido. */
  get retriable(): boolean {
    // 0 = no hubo respuesta (sin cobertura, DNS, timeout).
    if (this.status === 0) return true;
    if (this.status === 408 || this.status === 429) return true;
    return this.status >= 500;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    // Sin respuesta del servidor: sin cobertura, servidor caído o timeout.
    throw new ApiError(0, err instanceof Error ? err.message : 'Sin conexión');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, `${res.status} ${res.statusText}${text ? ` · ${text}` : ''}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),
  login: (email: string, password: string) =>
    request<{ token: string; user: AppState['users'][number] }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  /** Pide el enlace para poner una contraseña nueva. */
  olvidada: (email: string) =>
    request<{ ok: boolean; mensaje: string }>('/auth/olvidada', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  /** Cambia la contraseña con el código que llegó por correo. */
  restablecer: (codigo: string, nueva: string) =>
    request<{ ok: boolean }>('/auth/restablecer', {
      method: 'POST',
      body: JSON.stringify({ codigo, nueva }),
    }),
  state: () => request<AppState>('/state'),
  /**
   * Historial completo de un coche. `/state` trae solo lo reciente para no
   * llenar el móvil; la ficha lo pide entero cuando se abre.
   */
  historial: (vehicleId: string) =>
    request<{ events: AppState['events'] }>(`/historial/${encodeURIComponent(vehicleId)}`),
  /**
   * URL temporal para una evidencia concreta.
   *
   * El JWT general nunca entra en la URL. El servidor devuelve una
   * capacidad breve, ligada a ese archivo y al ámbito actual del usuario.
   */
  urlFoto: async (ref: string): Promise<string> => {
    if (!ref.startsWith('foto:') || !apiEnabled) return ref;
    const id = ref.slice('foto:'.length);
    const { url } = await request<{ url: string }>(`/fotos/${encodeURIComponent(id)}/acceso`);
    return url.startsWith('http') ? url : `${API_URL}${url}`;
  },
  /**
   * Envía un comando. El servidor debe ser idempotente por `command.id`:
   * un reintento tras un corte de red no puede duplicar el movimiento.
   */
  send: (command: Command) =>
    request<{ ok: boolean }>('/commands', {
      method: 'POST',
      body: JSON.stringify(command),
    }),
  /**
   * Sube una foto y devuelve su identificador.
   *
   * Se sube en cuanto se hace, no al mandar el comando: así el operario se
   * entera en el momento si no ha subido, con el coche todavía delante, en
   * vez de descubrirlo cuando alguien va a reclamar al transportista.
   */
  subirFoto: async (uri: string): Promise<string> => {
    const { status, body } = await subirFichero(`${API_URL}/fotos`, uri);
    if (status < 200 || status >= 300) throw new ApiError(status, mensajeDe(body, status));
    const { id } = JSON.parse(body) as { id: string };
    return `foto:${id}`;
  },
  /**
   * Sube la miniatura de una foto que ya está en el servidor. La hace el
   * móvil al sacar la foto (`src/data/miniaturas.ts`).
   */
  subirMiniatura: async (ref: string, uri: string): Promise<void> => {
    if (!ref.startsWith('foto:')) return;
    const url = `${API_URL}/fotos/${encodeURIComponent(ref.slice('foto:'.length))}/miniatura`;
    const { status, body } = await subirFichero(url, uri);
    if (status < 200 || status >= 300) throw new ApiError(status, mensajeDe(body, status));
  },
  /**
   * Direcciones temporales de las miniaturas de una lista entera, en una
   * sola petición. Las que no le tocan a este usuario no vienen.
   */
  accesosMiniatura: async (refs: string[]): Promise<Record<string, string>> => {
    const ids = refs.filter((r) => r.startsWith('foto:')).map((r) => r.slice('foto:'.length));
    if (!ids.length || !apiEnabled) return {};
    const { urls } = await request<{ urls: Record<string, string> }>('/fotos/miniaturas/acceso', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    return Object.fromEntries(
      Object.entries(urls).map(([id, url]) => [`foto:${id}`, url.startsWith('http') ? url : `${API_URL}${url}`])
    );
  },
  /** Registra el móvil para recibir avisos. */
  pushToken: (token: string) =>
    request<{ ok: boolean }>('/push/token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
};

/** Tipo de imagen por la extensión del fichero; la cámara de Android saca JPEG. */
function tipoDe(uri: string, deBlob?: string): string {
  if (deBlob) return deBlob;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'heic' ? 'image/heic'
    : ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
}

/** El mensaje del servidor si lo hay («La foto está vacía.»), o el código. */
function mensajeDe(body: string, status: number): string {
  try {
    const m = (JSON.parse(body) as { error?: string; mensaje?: string }).error ?? (JSON.parse(body) as { mensaje?: string }).mensaje;
    if (m) return m;
  } catch {
    /* no era JSON */
  }
  return `Error ${status} al subir la foto`;
}

/**
 * Sube un fichero del dispositivo tal cual, como cuerpo de la petición.
 *
 * En el móvil va por la subida nativa de `expo-file-system` (la misma
 * librería que ya usa la cola de fotos sin cobertura). Antes se hacía
 * igual que en la web —leer el fichero como Blob y mandarlo con `fetch`—, y
 * en Android eso envía el cuerpo VACÍO: el servidor contestaba «la foto está
 * vacía» y ninguna foto llegaba nunca. En el navegador funcionaba, por eso
 * las pruebas automáticas, que van en navegador, no lo vieron.
 */
async function subirFichero(url: string, uri: string): Promise<{ status: number; body: string }> {
  const cabeceras: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  if (Platform.OS !== 'web') {
    // La miniatura llega como `data:` (base64 en memoria) y la subida nativa
    // solo sabe mandar ficheros: se escribe antes en un fichero temporal.
    // Sin esto las miniaturas no subían nunca desde Android y las listas
    // enseñaban siempre la marca en vez de la foto.
    const datos = uri.match(/^data:([^;,]+);base64,(.*)$/s);
    let fichero = uri;
    if (datos) {
      fichero = `${FileSystem.cacheDirectory}subida-${Date.now()}-${Math.random().toString(36).slice(2)}.${datos[1] === 'image/png' ? 'png' : 'jpg'}`;
      await FileSystem.writeAsStringAsync(fichero, datos[2], { encoding: FileSystem.EncodingType.Base64 });
    }
    try {
      const tipo = datos ? datos[1] : tipoDe(uri);
      const r = await FileSystem.uploadAsync(url, fichero, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        mimeType: tipo,
        headers: { ...cabeceras, 'Content-Type': tipo },
      });
      return { status: r.status, body: r.body };
    } finally {
      if (datos) await FileSystem.deleteAsync(fichero, { idempotent: true }).catch(() => undefined);
    }
  }
  const blob = await (await fetch(uri)).blob();
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...cabeceras, 'Content-Type': tipoDe(uri, blob.type) },
    body: blob,
  });
  return { status: res.status, body: await res.text() };
}
