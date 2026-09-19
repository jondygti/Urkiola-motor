import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL, api } from './api';

const COLA_FOTOS_KEY = `urkiola.photoqueue.${encodeURIComponent(API_URL || 'demo')}.v1`;

interface FotoPendiente {
  /** Referencia que quedó dentro del comando local. */
  ref: string;
  /** Copia duradera dentro del espacio privado de la app. */
  uri: string;
  /** Si ya subió pero el comando aún no fue confirmado, se reutiliza. */
  uploadedRef?: string;
}

async function cargar(): Promise<FotoPendiente[]> {
  const raw = await AsyncStorage.getItem(COLA_FOTOS_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as FotoPendiente[];
    return Array.isArray(data) ? data.filter((x) => x && typeof x.ref === 'string' && typeof x.uri === 'string') : [];
  } catch {
    return [];
  }
}

const guardar = (items: FotoPendiente[]) =>
  items.length
    ? AsyncStorage.setItem(COLA_FOTOS_KEY, JSON.stringify(items))
    : AsyncStorage.removeItem(COLA_FOTOS_KEY);

async function hacerDuradera(uri: string): Promise<string> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return uri;
  const dir = `${FileSystem.documentDirectory}urkiola-fotos-pendientes/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const extension = (uri.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/)?.[1] ?? 'jpg').toLowerCase();
  const nombre = `foto-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
  const destino = `${dir}${nombre}`;
  await FileSystem.copyAsync({ from: uri, to: destino });
  return destino;
}

/**
 * Conserva una foto que no pudo salir del móvil. El comando usa la URI
 * duradera como referencia provisional; antes de mandarlo se sustituye por
 * la referencia foto:<id> real del backend.
 */
export async function registrarFotoPendiente(uri: string): Promise<string> {
  const ref = await hacerDuradera(uri);
  const items = await cargar();
  if (!items.some((x) => x.ref === ref)) {
    items.push({ ref, uri: ref });
    await guardar(items);
  }
  return ref;
}

function referenciasEn(valor: unknown, salida = new Set<string>()): Set<string> {
  if (typeof valor === 'string') {
    salida.add(valor);
    return salida;
  }
  if (Array.isArray(valor)) {
    for (const x of valor) referenciasEn(x, salida);
    return salida;
  }
  if (valor && typeof valor === 'object') {
    for (const x of Object.values(valor as Record<string, unknown>)) referenciasEn(x, salida);
  }
  return salida;
}

function reemplazar(valor: unknown, mapa: Map<string, string>): unknown {
  if (typeof valor === 'string') return mapa.get(valor) ?? valor;
  if (Array.isArray(valor)) return valor.map((x) => reemplazar(x, mapa));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, reemplazar(v, mapa)])
    );
  }
  return valor;
}

/**
 * Sube las fotos locales que usa un comando y devuelve el mismo comando con
 * referencias del servidor. Si la red falla, lanza ApiError y el comando
 * permanece en la cola exactamente como estaba.
 */
export async function resolverFotosPendientes<T>(valor: T): Promise<{ value: T; refsLocales: string[] }> {
  const items = await cargar();
  if (!items.length) return { value: valor, refsLocales: [] };

  const usadas = referenciasEn(valor);
  const implicadas = items.filter((x) => usadas.has(x.ref));
  if (!implicadas.length) return { value: valor, refsLocales: [] };

  let actuales = items;
  const mapa = new Map<string, string>();
  for (const item of implicadas) {
    let subida = item.uploadedRef;
    if (!subida) {
      subida = await api.subirFoto(item.uri);
      actuales = actuales.map((x) => x.ref === item.ref ? { ...x, uploadedRef: subida } : x);
      // Persistir antes de mandar el comando evita volver a subir una foto si
      // se corta la red justo después de que Storage la haya aceptado.
      await guardar(actuales);
    }
    mapa.set(item.ref, subida);
  }

  return {
    value: reemplazar(valor, mapa) as T,
    refsLocales: implicadas.map((x) => x.ref),
  };
}

/**
 * Borra del almacenamiento local solo las fotos cuyo comando ya confirmó el
 * servidor y que no siguen referenciadas por otro trabajo pendiente/rechazado.
 */
export async function confirmarFotosPendientes(refs: string[], resto: unknown[]): Promise<void> {
  if (!refs.length) return;
  const usadas = referenciasEn(resto);
  const items = await cargar();
  const borrar = items.filter((x) => refs.includes(x.ref) && !usadas.has(x.ref));
  const quedan = items.filter((x) => !borrar.includes(x));
  await guardar(quedan);

  if (Platform.OS !== 'web') {
    for (const item of borrar) {
      if (FileSystem.documentDirectory && item.uri.startsWith(FileSystem.documentDirectory)) {
        await FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => undefined);
      }
    }
  }
}

export async function descartarFotoPendiente(ref: string): Promise<void> {
  const items = await cargar();
  const item = items.find((x) => x.ref === ref);
  if (!item) return;
  await guardar(items.filter((x) => x.ref !== ref));
  if (Platform.OS !== 'web' && FileSystem.documentDirectory && item.uri.startsWith(FileSystem.documentDirectory)) {
    await FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => undefined);
  }
}
