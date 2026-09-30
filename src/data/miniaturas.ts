import AsyncStorage from '@react-native-async-storage/async-storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { api, apiEnabled } from './api';

/**
 * Miniaturas de las fotos de los coches.
 *
 * Las listas (flota, preparación, traslados…) enseñan la última foto de cada
 * coche en un cuadro de 48 puntos. Bajarse la foto original para eso son
 * dos o tres megas por fila con los datos del móvil en la campa, así que se
 * usa siempre una miniatura y **nunca la original**. Si no hay miniatura, la
 * lista pinta la marca del coche.
 *
 * La miniatura la hace el móvil al sacar la foto: el servidor no tiene con
 * qué hacerla (ver `guardarMiniatura` en el servidor). Se sube detrás de la
 * original; si esa subida falla no pasa nada grave —la foto, que es la
 * prueba, ya está a salvo— y el coche sale con su marca en la lista.
 */

/** 192 de ancho: a 48 puntos en una pantalla de densidad 3 hacen falta 144. */
const ANCHO = 192;

/** Hace la miniatura de una foto local. Devuelve un `data:` JPEG o null. */
export async function crearMiniatura(uri: string): Promise<string | null> {
  try {
    const r = await manipulateAsync(uri, [{ resize: { width: ANCHO } }], {
      compress: 0.6,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return r.base64 ? `data:image/jpeg;base64,${r.base64}` : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------- las que viven en el móvil */

/*
 * Sin servidor (demostración), o mientras una foto espera cobertura para
 * subir, la miniatura se guarda aquí, con la referencia de su foto. Son
 * unos 10 kB cada una.
 */
const CLAVE = 'urkiola.miniaturas.v1';
let locales: Record<string, string> = {};
let cargadas: Promise<void> | null = null;

function cargarLocales(): Promise<void> {
  cargadas ??= AsyncStorage.getItem(CLAVE)
    .then((raw) => {
      const datos = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      locales = { ...datos, ...locales };
    })
    .catch(() => undefined);
  return cargadas;
}

export async function guardarMiniaturaLocal(ref: string, miniatura: string): Promise<void> {
  await cargarLocales();
  locales = { ...locales, [ref]: miniatura };
  await AsyncStorage.setItem(CLAVE, JSON.stringify(locales)).catch(() => undefined);
}

/* ---------------------------------------- las que están en el servidor */

/**
 * Direcciones ya pedidas. Caducan antes que el permiso del servidor (cinco
 * minutos) para no pintar una dirección que ya no abre.
 */
const VIGENCIA_MS = 4 * 60 * 1000;
const enServidor = new Map<string, { url: string | null; hasta: number }>();
let pendientes = new Map<string, ((url: string | null) => void)[]>();
let programado = false;

/**
 * Pide las miniaturas en tandas: todas las filas que se pintan a la vez
 * salen en una sola petición, no una por coche.
 */
function pedirEnTanda(ref: string): Promise<string | null> {
  return new Promise((resolver) => {
    pendientes.set(ref, [...(pendientes.get(ref) ?? []), resolver]);
    if (programado) return;
    programado = true;
    setTimeout(() => {
      const tanda = pendientes;
      pendientes = new Map();
      programado = false;
      const refs = [...tanda.keys()];
      const trozos: string[][] = [];
      for (let i = 0; i < refs.length; i += 200) trozos.push(refs.slice(i, i + 200));
      for (const trozo of trozos) {
        api
          .accesosMiniatura(trozo)
          .catch(() => ({}) as Record<string, string>)
          .then((urls) => {
            for (const r of trozo) {
              const url = urls[r] ?? null;
              enServidor.set(r, { url, hasta: Date.now() + VIGENCIA_MS });
              for (const f of tanda.get(r) ?? []) f(url);
            }
          });
      }
    }, 30);
  });
}

/**
 * La dirección de la miniatura de una foto, o null si no la tiene (y la
 * lista pinta la marca). Las del parque de ejemplo (`demo://`) no existen.
 */
export async function urlMiniatura(ref: string | null): Promise<string | null> {
  if (!ref || ref.startsWith('demo://')) return null;
  await cargarLocales();
  if (locales[ref]) return locales[ref];
  if (!apiEnabled || !ref.startsWith('foto:')) return null;
  const ya = enServidor.get(ref);
  if (ya && ya.hasta > Date.now()) return ya.url;
  return pedirEnTanda(ref);
}

/**
 * Cuando una foto que esperaba cobertura sube por fin, su miniatura pasa a
 * ser la del servidor: se sube y se olvida la copia del móvil.
 */
export async function subirMiniaturaPendiente(refLocal: string, refServidor: string): Promise<void> {
  await cargarLocales();
  const mini = locales[refLocal];
  if (!mini) return;
  const { [refLocal]: _, ...resto } = locales;
  try {
    await api.subirMiniatura(refServidor, mini);
    locales = resto;
  } catch {
    // No ha subido: al menos en este móvil se sigue viendo, ya con la
    // referencia del servidor que es la que queda en el trabajo.
    locales = { ...resto, [refServidor]: mini };
  }
  await AsyncStorage.setItem(CLAVE, JSON.stringify(locales)).catch(() => undefined);
}
