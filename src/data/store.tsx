import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { applyAll, applyCommand, newId, type Command, type CommandInput } from './commands';
import { API_URL, ApiError, api, apiEnabled, haySesion, setAuthToken } from './api';
import { buildSeedState } from './seed';
import { registerForPush } from './push';
import { isSimpleRole } from './selectors';
import type { AppState, Id, User } from './types';

const STATE_KEY = 'urkiola.state.v1';
const QUEUE_KEY = 'urkiola.queue.v1';
const SESSION_KEY = 'urkiola.session.v1';
const TOKEN_KEY = 'urkiola.token.v1';

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
// 11: la revisión a fondo arregló ubicaciones que el código viejo podía
// dejar mal guardadas (dos coches en la misma plaza, una zona que no era de
// esa sede). El código nuevo ya no las produce, pero tampoco repara las que
// hubiera guardadas: por eso se descartan.
// 12: se quitó «Mi trabajo» y entró «Mis coches». Las secciones del móvil de
// cada rol están guardadas en la configuración, así que sin esto los
// dispositivos seguirían con un menú que apunta a una pantalla que ya no
// existe.
// 13: el traslado guarda ahora cuándo se entregó y quién lo entregó. Lo
// guardado antes no lo tiene, y sin eso el registro de traslados saldría
// medio vacío sin que se entienda por qué.
// 14: el administrador y logística dejan de llevar «vende coches» de serie,
// que es lo que hacía aparecerles «Mis coches». Los permisos de los roles
// están guardados en la configuración del dispositivo.
// 15: los avisos ahora saben a quién van (`userIds`) y las reglas llevan
// destinatario. Lo guardado antes no lo tiene y se le vería a todo el mundo,
// que es justo lo que se ha arreglado. Cambian también los permisos de
// serie de dos roles y hay un campo nuevo de configuración.
// 16: Recuentos entra en el menú del móvil del preparador y de recepción,
// que son quienes cuentan. Las secciones del móvil de cada rol están
// guardadas en la configuración del dispositivo.
// 17: las reglas de aviso de ejemplo ya dicen a quién van. Las guardadas
// antes no lo decían, así que le llegaban a todo el mundo: al comercial le
// salían ocho avisos de coches que no son suyos.
// 18: el vehículo guarda ahora cuándo se entregó al cliente y quién lo
// marcó. Los 154 coches ya entregados del parque guardado no lo tienen, y
// sin fecha no se pueden contar por meses; además el estado «Entregado»
// entra en el flujo de la ficha.
// 19: la preparación tiene ahora dos clases —la de entrada y el repaso de
// entrega de media hora—, cada una con su checklist. La configuración
// guardada no distingue: los diez requisitos de siempre saldrían también en
// el repaso, y no habría objetivo de tiempo para él.
// 20: lecturas por usuario y caché/cola separadas por servidor y cuenta.
const STATE_SCHEMA_VERSION = 20;

interface StoredState {
  v: number;
  state: AppState;
}

/** Cada cuánto se intercambian cambios, aunque no haya trabajo pendiente. */
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
  /**
   * Ejecuta un comando: actualiza la pantalla y lo pone en cola para subir.
   *
   * Devuelve el comando ya completo. Sirve para encadenar: lo que crea un
   * comando lleva un id derivado del suyo (`idCreadoPor`), así que la
   * pantalla puede lanzar el siguiente sin esperar al servidor.
   */
  run: (cmd: CommandInput) => Command;
  /** Fuerza un intento de subida (botón «reintentar»). */
  flushNow: () => void;
  /**
   * Entra en la aplicación.
   *
   * Con backend comprueba la contraseña contra el servidor y guarda la
   * sesión; en modo demostración basta con el correo. Devuelve null si
   * todo ha ido bien, o el mensaje que hay que enseñar si no.
   */
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Cada servidor y cada persona conservan su propio trabajo. */
const SERVIDOR_KEY = `urkiola.api.${encodeURIComponent(API_URL)}`;
const API_SESSION_KEY = `${SERVIDOR_KEY}.session`;
const API_TOKEN_KEY = `${SERVIDOR_KEY}.token`;
const clavesDe = (id: Id) => ({
  estado: `${SERVIDOR_KEY}.user.${encodeURIComponent(id)}.state`,
  trabajo: `${SERVIDOR_KEY}.user.${encodeURIComponent(id)}.work`,
});
interface TrabajoGuardado { queue: Command[]; rejected: RejectedCommand[] }

/** Con API no se enseña un parque inventado mientras llegan los datos. */
function estadoInicial(): AppState {
  const s = buildSeedState();
  return apiEnabled ? {
    ...s, users: [], vehicles: [], movements: [], requests: [], preparations: [],
    counts: [], incidents: [], rules: [], inbox: [], receptions: [], events: [],
  } : s;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(estadoInicial);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<Command[]>([]);
  const [rejected, setRejected] = useState<RejectedCommand[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queueRef = useRef<Command[]>([]);
  const rejectedRef = useRef<RejectedCommand[]>([]);
  // Si el disco falla, cambiar de cuenta no debe perder la única copia
  // que todavía queda en memoria. No sustituye a la escritura duradera.
  const trabajoEnMemoria = useRef(new Map<Id, TrabajoGuardado>());
  const userRef = useRef<User | null>(null);
  const keysRef = useRef<ReturnType<typeof clavesDe> | null>(null);
  const confirmado = useRef<AppState>(state);
  const datosCargados = useRef(!apiEnabled);
  // Las respuestas de una sesión anterior no pueden tocar la sesión nueva.
  const generacion = useRef(0);
  const ocupada = useRef<number | null>(null);
  const persistencia = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const guardar = useCallback((operacion: () => Promise<void>) => {
    const siguiente = persistencia.current.catch(() => undefined).then(operacion);
    persistencia.current = siguiente;
    void siguiente.catch(() => setError('No se ha podido guardar en este dispositivo. Mantén la app abierta y libera espacio.'));
    return siguiente;
  }, []);

  const persistirTrabajo = useCallback(() => {
    const key = keysRef.current?.trabajo;
    if (!key) return Promise.resolve();
    const payload = JSON.stringify({ queue: queueRef.current, rejected: rejectedRef.current });
    return guardar(() => AsyncStorage.setItem(key, payload));
  }, [guardar]);

  const cambiarTrabajo = useCallback((pendientes: Command[], rechazados = rejectedRef.current) => {
    queueRef.current = pendientes;
    rejectedRef.current = rechazados;
    if (userRef.current) trabajoEnMemoria.current.set(userRef.current.id, { queue: pendientes, rejected: rechazados });
    setQueue(pendientes);
    setRejected(rechazados);
    const key = keysRef.current?.trabajo;
    if (key) {
      // Cola y rechazos se escriben juntos: no existe un momento en el que
      // una acción desaparezca de los dos sitios.
      const payload = JSON.stringify({ queue: pendientes, rejected: rechazados });
      void guardar(() => AsyncStorage.setItem(key, payload));
    }
  }, [guardar]);

  useEffect(() => {
    if (!ready || !dirty.current) return;
    const key = apiEnabled ? keysRef.current?.estado : STATE_KEY;
    if (!key) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const payload = JSON.stringify({ v: STATE_SCHEMA_VERSION, state });
    saveTimer.current = setTimeout(() => { void guardar(() => AsyncStorage.setItem(key, payload)); }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state, ready, guardar]);

  const suspenderSesion = useCallback((mensaje: string | null) => {
    generacion.current += 1;
    userRef.current = null;
    keysRef.current = null;
    datosCargados.current = false;
    setAuthToken(null);
    setUser(null);
    setSyncing(false);
    // La demo comparte una operativa entre sus roles. Cerrar sesión no
    // debe reiniciarla ni cancelar su guardado pendiente. Con API sí se
    // retira la caché visible para no mostrar datos de otra cuenta.
    if (apiEnabled) {
      setState(estadoInicial());
      if (saveTimer.current) clearTimeout(saveTimer.current);
    }
    // No se borra ni se intenta enviar el trabajo pendiente de esa cuenta.
    void guardar(() => AsyncStorage.multiRemove(apiEnabled ? [API_SESSION_KEY, API_TOKEN_KEY] : [SESSION_KEY, TOKEN_KEY]));
    if (mensaje) setError(mensaje);
  }, [guardar]);

  const sincronizar = useCallback(async function sincronizar() {
    const persona = userRef.current;
    const turno = generacion.current;
    if (!apiEnabled || !persona || !haySesion() || ocupada.current === turno) return;
    ocupada.current = turno;
    setSyncing(true);
    const vigente = () => generacion.current === turno && userRef.current?.id === persona.id;

    const descargar = async () => {
      const remoto = await api.state();
      if (!vigente()) return;
      const actual = remoto.users.find((u) => u.id === persona.id && u.active);
      if (!actual) throw new ApiError(401, 'Tu usuario ya no está activo.');
      confirmado.current = remoto;
      datosCargados.current = true;
      dirty.current = true;
      userRef.current = actual;
      setUser(actual);
      setState(applyAll(remoto, queueRef.current));
      const texto = JSON.stringify(actual);
      void guardar(() => AsyncStorage.setItem(API_SESSION_KEY, texto));
      setLastSyncAt(new Date().toISOString());
      setOnline(true);
      setError(null);
    };

    let reintentar = false;
    try {
      // También permite recuperarse de un disco lleno: no basta con esperar
      // una escritura que falló, hay que volver a guardar el trabajo actual.
      await persistirTrabajo();
      if (!vigente()) return;
      // Descargar aunque no haya nada que subir: el trabajo de los demás
      // tiene que llegar también a una pantalla que sigue abierta.
      await descargar();
      if (!vigente()) return;
      let enviados = false;
      while (queueRef.current.length && vigente()) {
        const next = queueRef.current[0];
        if (next.userId !== persona.id) {
          throw new Error('Hay trabajo de otra cuenta. No se enviará con tu sesión.');
        }
        // Primero queda en disco; una caída después del envío se resuelve
        // repitiendo el mismo id, que el servidor ya sabe descartar.
        await persistirTrabajo();
        if (!vigente()) return;
        try {
          await api.send(next);
          if (!vigente()) return;
          confirmado.current = applyCommand(confirmado.current, next);
          cambiarTrabajo(queueRef.current.filter((c) => c.id !== next.id));
          enviados = true;
        } catch (err) {
          if (!vigente()) return;
          const e = err instanceof ApiError ? err : new ApiError(0, 'Sin conexión con el servidor');
          if (e.status === 401 || e.retriable) throw e;
          cambiarTrabajo(queueRef.current.filter((c) => c.id !== next.id), [
            { command: next, reason: e.message, at: new Date().toISOString() },
            ...rejectedRef.current.filter((r) => r.command.id !== next.id),
          ]);
        }
        // Si se rechaza algo, la pantalla deja de presentarlo como hecho.
        setState(applyAll(confirmado.current, queueRef.current));
        dirty.current = true;
      }
      if (enviados && vigente()) await descargar();
      if (vigente()) {
        await persistencia.current;
        reintentar = queueRef.current.length > 0;
      }
    } catch (err) {
      if (!vigente()) return;
      if (err instanceof ApiError && err.status === 401) {
        suspenderSesion('Tu sesión ha caducado. Vuelve a entrar con la misma cuenta: tus cambios siguen guardados.');
      } else {
        if (err instanceof ApiError && err.status === 0) setOnline(false);
        setError(err instanceof Error ? err.message : 'No se ha podido sincronizar.');
      }
    } finally {
      if (ocupada.current === turno) ocupada.current = null;
      if (vigente()) {
        setSyncing(false);
        if (reintentar) void sincronizar();
      }
    }
  }, [cambiarTrabajo, guardar, persistirTrabajo, suspenderSesion]);

  const cargarCuenta = useCallback(async (persona: User, turno: number) => {
    const keys = clavesDe(persona.id);
    const [rawState, rawWork] = await Promise.all([
      AsyncStorage.getItem(keys.estado), AsyncStorage.getItem(keys.trabajo),
    ]);
    if (generacion.current !== turno) return;
    const work: TrabajoGuardado = trabajoEnMemoria.current.get(persona.id) ?? (rawWork ? JSON.parse(rawWork) : { queue: [], rejected: [] });
    if (!Array.isArray(work.queue) || !Array.isArray(work.rejected) || work.queue.some((c) => c.userId !== persona.id)) {
      throw new Error('No se puede abrir la cola de esta cuenta. Se ha conservado para revisarla.');
    }
    keysRef.current = keys;
    queueRef.current = work.queue;
    rejectedRef.current = work.rejected;
    setQueue(work.queue);
    setRejected(work.rejected);
    const saved: StoredState | null = rawState ? JSON.parse(rawState) : null;
    const candidate = saved?.v === STATE_SCHEMA_VERSION && Array.isArray(saved.state?.vehicles) ? saved.state : null;
    datosCargados.current = !!candidate;
    confirmado.current = candidate ?? estadoInicial();
    setState(candidate ? applyAll(candidate, work.queue) : estadoInicial());
    userRef.current = persona;
    setUser(candidate ? persona : null);
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (!apiEnabled) {
          const [savedState, savedSession] = await Promise.all([AsyncStorage.getItem(STATE_KEY), AsyncStorage.getItem(SESSION_KEY)]);
          const saved: StoredState | null = savedState ? JSON.parse(savedState) : null;
          if (saved?.v === STATE_SCHEMA_VERSION && Array.isArray(saved.state?.vehicles)) setState(saved.state);
          else dirty.current = true;
          if (savedSession) { const p = JSON.parse(savedSession); userRef.current = p; setUser(p); }
          return;
        }

        // Migración única de la versión anterior. Se copia antes de borrar,
        // agrupando cada comando por su autor, y sin repetir ids ya copiados.
        const [legacyQueue, legacySession, legacyToken, legacyState] = await Promise.all([
          AsyncStorage.getItem(QUEUE_KEY), AsyncStorage.getItem(SESSION_KEY),
          AsyncStorage.getItem(TOKEN_KEY), AsyncStorage.getItem(STATE_KEY),
        ]);
        const antiguos: Command[] = legacyQueue ? JSON.parse(legacyQueue) : [];
        for (const id of new Set(antiguos.map((c) => c.userId))) {
          const key = clavesDe(id).trabajo;
          const raw = await AsyncStorage.getItem(key);
          const work: TrabajoGuardado = raw ? JSON.parse(raw) : { queue: [], rejected: [] };
          const conocidos = new Set([...work.queue.map((c) => c.id), ...work.rejected.map((r) => r.command.id)]);
          const queue = [...work.queue, ...antiguos.filter((c) => c.userId === id && !conocidos.has(c.id))];
          await AsyncStorage.setItem(key, JSON.stringify({ ...work, queue }));
        }
        if (legacyQueue) await AsyncStorage.removeItem(QUEUE_KEY);
        if (legacyToken && legacySession && !(await AsyncStorage.getItem(API_SESSION_KEY))) {
          const persona: User = JSON.parse(legacySession);
          if (legacyState) {
            const saved: StoredState = JSON.parse(legacyState);
            // El único cambio de forma desde v19 son campos opcionales.
            // Esta migración conserva una caché válida incluso sin cobertura.
            if (saved.v >= 19 && Array.isArray(saved.state?.vehicles)) {
              await AsyncStorage.setItem(clavesDe(persona.id).estado, JSON.stringify({ ...saved, v: STATE_SCHEMA_VERSION }));
            }
          }
          await AsyncStorage.multiSet([[API_SESSION_KEY, legacySession], [API_TOKEN_KEY, legacyToken]]);
          await AsyncStorage.multiRemove([SESSION_KEY, TOKEN_KEY, STATE_KEY]);
        }
        const [savedSession, savedToken] = await Promise.all([
          AsyncStorage.getItem(API_SESSION_KEY), AsyncStorage.getItem(API_TOKEN_KEY),
        ]);
        if (cancelado) return;
        if (savedSession && savedToken) {
          setAuthToken(savedToken);
          await cargarCuenta(JSON.parse(savedSession), generacion.current);
          if (!cancelado) void sincronizar();
        }
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se han podido abrir los datos guardados.');
      } finally {
        if (!cancelado) setReady(true);
      }
    })();
    return () => { cancelado = true; generacion.current += 1; };
  }, [cargarCuenta, sincronizar]);

  useEffect(() => {
    if (!apiEnabled || !ready) return;
    const unsubscribe = NetInfo.addEventListener((net) => { if (net.isConnected) void sincronizar(); });
    const listener = RNAppState.addEventListener('change', (s) => { if (s === 'active') void sincronizar(); });
    const timer = setInterval(() => { void sincronizar(); }, RETRY_MS);
    return () => { unsubscribe(); listener.remove(); clearInterval(timer); };
  }, [ready, sincronizar]);

  const run = useCallback<StoreValue['run']>((partial) => {
    const persona = userRef.current;
    if (apiEnabled && (!persona || !datosCargados.current)) {
      throw new Error('Espera a que se carguen los datos de tu cuenta antes de registrar trabajo.');
    }
    const cmd = { id: newId('cmd'), at: new Date().toISOString(), ...partial, userId: persona?.id ?? 'u-log' } as Command;
    dirty.current = true;
    setState((prev) => applyCommand(prev, cmd));
    if (apiEnabled) {
      cambiarTrabajo([...queueRef.current, cmd]);
      void sincronizar();
    }
    return cmd;
  }, [cambiarTrabajo, sincronizar]);

  // El backend evalúa el reloj aunque nadie tenga la app abierta. Solo la
  // demostración necesita hacerlo en el propio dispositivo.
  useEffect(() => {
    if (apiEnabled || !ready || !user || isSimpleRole(state, user)) return;
    const barrer = () => run({ type: 'alerts.sweep' });
    barrer();
    const timer = setInterval(barrer, 60_000);
    return () => clearInterval(timer);
  }, [ready, user?.id, run]);

  const login = useCallback<StoreValue['login']>(async (email, password) => {
    const correo = email.trim().toLowerCase();
    if (!apiEnabled) {
      const persona = state.users.find((u) => u.email.toLowerCase() === correo && u.active);
      if (!persona) return 'No encontramos ese usuario. Revisa el correo.';
      userRef.current = persona;
      setUser(persona);
      await guardar(() => AsyncStorage.setItem(SESSION_KEY, JSON.stringify(persona)));
      return null;
    }
    try {
      const { token, user: persona } = await api.login(correo, password);
      const turno = ++generacion.current;
      userRef.current = null;
      keysRef.current = null;
      setUser(null);
      setState(estadoInicial());
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await persistencia.current;
      setAuthToken(token);
      await cargarCuenta(persona, turno);
      if (generacion.current !== turno) return 'La sesión ha cambiado. Vuelve a entrar.';
      await guardar(() => AsyncStorage.multiSet([[API_TOKEN_KEY, token], [API_SESSION_KEY, JSON.stringify(persona)]]));
      await sincronizar();
      if (!userRef.current) return 'La sesión no está disponible. Vuelve a entrar.';
      if (!datosCargados.current) {
        suspenderSesion(null);
        return 'No se han podido cargar los datos de tu cuenta. Comprueba la conexión y vuelve a entrar.';
      }
      void registerForPush().then((expo) => {
        if (expo && generacion.current === turno) return api.pushToken(expo);
      }).catch(() => undefined);
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return 'Correo o contraseña incorrectos.';
      if (e instanceof ApiError && e.status === 429) return 'Demasiados intentos. Prueba dentro de un rato.';
      return e instanceof Error ? e.message : 'No se ha podido entrar.';
    }
  }, [state.users, cargarCuenta, guardar, sincronizar, suspenderSesion]);

  const logout = useCallback(() => suspenderSesion(null), [suspenderSesion]);
  const resetDemo = useCallback(() => {
    if (apiEnabled) return;
    dirty.current = true;
    setState(buildSeedState());
    void guardar(() => AsyncStorage.removeItem(STATE_KEY));
  }, [guardar]);
  const sync = useMemo<SyncStatus>(() => ({
    online, pending: queue.length, syncing, lastSyncAt, error, rejected,
  }), [online, queue.length, syncing, lastSyncAt, error, rejected]);
  const value = useMemo<StoreValue>(() => ({
    state, ready, mode: apiEnabled ? 'api' : 'demo', user, sync, run,
    flushNow: () => { void sincronizar(); }, login, logout, resetDemo,
  }), [state, ready, user, sync, run, sincronizar, login, logout, resetDemo]);
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
