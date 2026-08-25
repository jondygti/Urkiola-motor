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

/**
 * Dirección para pintar una foto.
 *
 * Lo que se guarda en el comando es `foto:<id>`, una referencia estable que
 * no caduca. La dirección con la que se pinta se arma aquí, con la sesión
 * de quien mira: una foto de un daño no debería poder verla cualquiera que
 * dé con el enlace.
 *
 * Las fotos de antes del backend (y las del modo demostración) son rutas
 * del propio móvil y se devuelven tal cual.
 */
export function urlDeFoto(ref: string): string {
  if (!ref.startsWith('foto:')) return ref;
  const id = ref.slice('foto:'.length);
  if (!apiEnabled) return ref;
  const sesion = authToken ? `?t=${encodeURIComponent(authToken)}` : '';
  return `${API_URL}/fotos/${encodeURIComponent(id)}${sesion}`;
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
    const origen = await fetch(uri);
    const blob = await origen.blob();
    const res = await fetch(`${API_URL}/fotos`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: blob,
    });
    if (!res.ok) {
      throw new ApiError(res.status, `${res.status} ${res.statusText}`);
    }
    const { id } = (await res.json()) as { id: string };
    return `foto:${id}`;
  },
  /** Registra el móvil para recibir avisos. */
  pushToken: (token: string) =>
    request<{ ok: boolean }>('/push/token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
};
