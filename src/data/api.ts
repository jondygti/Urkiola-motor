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
 *   POST /commands        Command                    -> { ok: true, state? }
 *   GET  /health                                     -> { ok: true }
 */

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const apiEnabled = API_URL.length > 0;

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` · ${text}` : ''}`);
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
  send: (command: Command) =>
    request<{ ok: boolean; state?: AppState }>('/commands', {
      method: 'POST',
      body: JSON.stringify(command),
    }),
};
