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
  /** Registra el móvil para recibir avisos. */
  pushToken: (token: string) =>
    request<{ ok: boolean }>('/push/token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
};
