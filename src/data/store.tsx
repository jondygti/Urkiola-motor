import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyCommand, newId, type Command, type CommandInput } from './commands';
import { api, apiEnabled, setAuthToken } from './api';
import { buildSeedState } from './seed';
import type { AppState, Id, User } from './types';

const STORAGE_KEY = 'urkiola.state.v1';
const SESSION_KEY = 'urkiola.session.v1';

type Mode = 'demo' | 'api';

interface StoreValue {
  state: AppState;
  ready: boolean;
  mode: Mode;
  /** Último error de sincronización con el backend, si lo hay. */
  syncError: string | null;
  user: User | null;
  /** Ejecuta un comando: actualiza la pantalla y lo envía al backend. */
  run: (cmd: CommandInput) => void;
  login: (userId: Id) => void;
  logout: () => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => buildSeedState());
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const mode: Mode = apiEnabled ? 'api' : 'demo';
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  /* ------------------------------------------------------------ arranque */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const savedSession = await AsyncStorage.getItem(SESSION_KEY);

        if (apiEnabled) {
          try {
            const remote = await api.state();
            if (!cancelled) setState(remote);
          } catch (err) {
            if (!cancelled) setSyncError(err instanceof Error ? err.message : 'Sin conexión con el servidor');
          }
        } else {
          const saved = await AsyncStorage.getItem(STORAGE_KEY);
          if (saved && !cancelled) {
            const parsed = JSON.parse(saved) as AppState;
            // Comprobación mínima por si cambia el formato entre versiones.
            if (parsed?.vehicles?.length) setState(parsed);
          }
        }

        if (savedSession && !cancelled) {
          const parsed = JSON.parse(savedSession) as User;
          setUser(parsed);
        }
      } catch {
        /* arranca con los datos de ejemplo */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------- persistencia */
  useEffect(() => {
    if (!ready || apiEnabled || !dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, ready]);

  /* ---------------------------------------------------------- comandos */
  const run = useCallback<StoreValue['run']>(
    (partial) => {
      const cmd = {
        id: newId('cmd'),
        at: new Date().toISOString(),
        userId: user?.id ?? 'u-log',
        ...partial,
      } as Command;

      dirty.current = true;
      setState((prev) => applyCommand(prev, cmd));

      if (apiEnabled) {
        api
          .send(cmd)
          .then((res) => {
            setSyncError(null);
            if (res.state) setState(res.state);
          })
          .catch((err: unknown) => {
            setSyncError(err instanceof Error ? err.message : 'Error de sincronización');
          });
      }
    },
    [user]
  );

  const login = useCallback(
    (userId: Id) => {
      const found = state.users.find((u) => u.id === userId) ?? null;
      setUser(found);
      if (found) AsyncStorage.setItem(SESSION_KEY, JSON.stringify(found)).catch(() => undefined);
    },
    [state.users]
  );

  const logout = useCallback(() => {
    setUser(null);
    setAuthToken(null);
    AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
  }, []);

  const resetDemo = useCallback(() => {
    dirty.current = true;
    setState(buildSeedState());
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({ state, ready, mode, syncError, user, run, login, logout, resetDemo }),
    [state, ready, mode, syncError, user, run, login, logout, resetDemo]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore debe usarse dentro de <StoreProvider>');
  return v;
}

/** Atajo: solo el estado. */
export function useAppState(): AppState {
  return useStore().state;
}

/** Reloj compartido para los cronómetros (se actualiza cada `ms`). */
export function useTicker(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
