import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { applyAll, applyCommand, newId, type Command, type CommandInput } from './commands';
import { ApiError, api, apiEnabled, setAuthToken } from './api';
import { buildSeedState } from './seed';
import type { AppState, Id, User } from './types';

const STATE_KEY = 'urkiola.state.v1';
const QUEUE_KEY = 'urkiola.queue.v1';
const SESSION_KEY = 'urkiola.session.v1';

/**
 * Versión del modelo de datos guardado en el dispositivo.
 *
 * **Hay que subirla cada vez que cambie el modelo o la configuración de
 * serie** (roles, permisos, requisitos, campos…). Si no, quien ya tenga
 * datos guardados de una versión anterior seguirá viendo la configuración
 * vieja y las novedades no le llegarán nunca.
 *
 * Al detectar una versión distinta se descarta lo guardado: en modo
 * demostración se vuelve al parque de ejemplo, y con backend se recarga
 * del servidor, que es quien manda. Los comandos pendientes de subir NO se
 * tocan: son trabajo de la persona, no caché.
 */
const STATE_SCHEMA_VERSION = 6;

interface StoredState {
  v: number;
  state: AppState;
}

/** Cada cuánto se reintenta la subida mientras haya pendientes. */
const RETRY_MS = 30_000;

type Mode = 'demo' | 'api';

/** Comando que el servidor rechazó y que no tiene sentido reintentar. */
export interface RejectedCommand {
  command: Command;
  reason: string;
  at: string;
}

export interface SyncStatus {
  /** El dispositivo cree tener conexión. */
  online: boolean;
  /** Comandos hechos en el móvil que el servidor todavía no ha confirmado. */
  pending: number;
  /** Hay una subida en curso ahora mismo. */
  syncing: boolean;
  /** Última vez que el servidor confirmó algo. */
  lastSyncAt: string | null;
  /** Último problema de red o de servidor, si lo hay. */
  error: string | null;
  /** Comandos rechazados por el servidor: necesitan mirarse a mano. */
  rejected: RejectedCommand[];
}

interface StoreValue {
  state: AppState;
  ready: boolean;
  mode: Mode;
  user: User | null;
  sync: SyncStatus;
  /** Ejecuta un comando: actualiza la pantalla y lo pone en cola para subir. */
  run: (cmd: CommandInput) => void;
  /** Fuerza un intento de subida (botón «reintentar»). */
  flushNow: () => void;
  login: (userId: Id) => void;
  logout: () => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => buildSeedState());
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<Command[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedCommand[]>([]);

  const mode: Mode = apiEnabled ? 'api' : 'demo';

  /* Espejos en refs: los usan los temporizadores y los oyentes de red, que
     no deben recrearse cada vez que cambia el estado. */
  const queueRef = useRef<Command[]>([]);
  const flushing = useRef(false);
  const onlineRef = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const setQueueBoth = useCallback((next: Command[]) => {
    queueRef.current = next;
    setQueue(next);
    AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  /* --------------------------------------------------------- persistencia */

  // El estado se guarda SIEMPRE, también con backend: es lo que permite
  // abrir la app en un sótano y seguir viendo la flota.
  useEffect(() => {
    if (!ready || !dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload: StoredState = { v: STATE_SCHEMA_VERSION, state };
      AsyncStorage.setItem(STATE_KEY, JSON.stringify(payload)).catch(() => undefined);
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, ready]);

  /* ------------------------------------------------------------- subida */

  /**
   * Vacía la cola contra el servidor, en orden y de uno en uno.
   *
   * - Si falla la red, se para y se reintenta más tarde: nada se pierde.
   * - Si el servidor rechaza un comando (4xx), se aparta para que no
   *   bloquee a los siguientes y se avisa por pantalla.
   *
   * Siempre se intenta, aunque el sistema diga que no hay red: quien decide
   * si hay conexión es el propio servidor. La sonda de conectividad del
   * móvil da falsos negativos en redes corporativas, tras un proxy o con
   * portales cautivos, y son justo los sitios donde esto tiene que ir.
   */
  const flush = useCallback(async () => {
    if (!apiEnabled || flushing.current) return;
    if (queueRef.current.length === 0) return;

    flushing.current = true;
    setSyncing(true);

    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current[0];
        try {
          await api.send(next);
          setQueueBoth(queueRef.current.slice(1));
          setLastSyncAt(new Date().toISOString());
          setError(null);
          // Si el servidor responde, hay conexión, diga lo que diga el sistema.
          if (!onlineRef.current) {
            onlineRef.current = true;
            setOnline(true);
          }
        } catch (err) {
          const apiErr = err instanceof ApiError ? err : new ApiError(0, 'Error de red');

          if (apiErr.retriable) {
            // Sin cobertura o servidor caído: se deja en cola y se reintenta.
            setError(apiErr.status === 0 ? 'Sin conexión con el servidor' : apiErr.message);
            if (apiErr.status === 0) {
              onlineRef.current = false;
              setOnline(false);
            }
            break;
          }

          // Rechazado por el servidor: reintentarlo no lo va a arreglar.
          setQueueBoth(queueRef.current.slice(1));
          setRejected((r) => [
            { command: next, reason: apiErr.message, at: new Date().toISOString() },
            ...r,
          ].slice(0, 50));
          setError(`El servidor rechazó una acción: ${apiErr.message}`);
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [setQueueBoth]);

  /* ------------------------------------------------------------ arranque */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [savedSession, savedState, savedQueue] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEY),
          AsyncStorage.getItem(STATE_KEY),
          AsyncStorage.getItem(QUEUE_KEY),
        ]);

        // 1. Lo guardado en el dispositivo va primero: la app arranca y es
        //    usable aunque no haya cobertura en este momento.
        let local: AppState | null = null;
        if (savedState) {
          const parsed = JSON.parse(savedState) as StoredState | AppState;
          // Sin número de versión es de una versión anterior al versionado.
          const version = (parsed as StoredState)?.v ?? 0;
          const candidate = version ? (parsed as StoredState).state : (parsed as AppState);

          if (version !== STATE_SCHEMA_VERSION) {
            // Modelo antiguo: se descarta para no arrastrar configuración
            // caducada (roles, permisos, requisitos…).
            await AsyncStorage.removeItem(STATE_KEY).catch(() => undefined);
            dirty.current = true;
          } else if (candidate?.vehicles?.length) {
            local = candidate;
            if (!cancelled) setState(candidate);
          }
        }

        const pending: Command[] = savedQueue ? (JSON.parse(savedQueue) as Command[]) : [];
        if (pending.length && !cancelled) {
          queueRef.current = pending;
          setQueue(pending);
        }

        if (savedSession && !cancelled) setUser(JSON.parse(savedSession) as User);
        if (!cancelled) setReady(true);

        // 2. Después, si hay backend, se intenta refrescar desde el servidor.
        if (apiEnabled && !cancelled) {
          try {
            const remote = await api.state();
            if (cancelled) return;
            // Lo pendiente de subir se vuelve a aplicar encima de lo que
            // manda el servidor, para que no desaparezca de la pantalla.
            setState(pending.length ? applyAll(remote, pending) : remote);
            setLastSyncAt(new Date().toISOString());
            setError(null);
          } catch (err) {
            if (cancelled) return;
            const apiErr = err instanceof ApiError ? err : null;
            if (!apiErr || apiErr.status === 0) {
              // No hemos alcanzado el servidor: es el caso del sótano.
              onlineRef.current = false;
              setOnline(false);
              setError('Sin conexión con el servidor');
            } else {
              setError(apiErr.message);
            }
            // Sin datos locales ni servidor, se queda el parque de ejemplo.
            if (!local) dirty.current = true;
          }
          void flush();
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------- reintentos y conectividad */

  useEffect(() => {
    if (!apiEnabled) return;

    // NetInfo solo sirve para reaccionar rápido cuando vuelve la cobertura;
    // no decide si se intenta subir o no.
    const unsubscribe = NetInfo.addEventListener((netState) => {
      const connected = netState.isConnected ?? false;
      if (connected && queueRef.current.length > 0) void flush();
    });

    const onForeground = RNAppState.addEventListener('change', (status) => {
      if (status === 'active') void flush();
    });

    const timer = setInterval(() => {
      if (queueRef.current.length > 0) void flush();
    }, RETRY_MS);

    return () => {
      unsubscribe();
      onForeground.remove();
      clearInterval(timer);
    };
  }, [flush]);

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
        setQueueBoth([...queueRef.current, cmd]);
        void flush();
      }
    },
    [user, flush, setQueueBoth]
  );

  const flushNow = useCallback(() => {
    onlineRef.current = true;
    setOnline(true);
    void flush();
  }, [flush]);

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
    setQueueBoth([]);
    setRejected([]);
    AsyncStorage.removeItem(STATE_KEY).catch(() => undefined);
  }, [setQueueBoth]);

  const sync = useMemo<SyncStatus>(
    () => ({ online, pending: queue.length, syncing, lastSyncAt, error, rejected }),
    [online, queue.length, syncing, lastSyncAt, error, rejected]
  );

  const value = useMemo<StoreValue>(
    () => ({ state, ready, mode, user, sync, run, flushNow, login, logout, resetDemo }),
    [state, ready, mode, user, sync, run, flushNow, login, logout, resetDemo]
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
