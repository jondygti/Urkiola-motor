import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { api, apiEnabled } from '@/data/api';
import { registrarFotoPendiente } from '@/data/photoQueue';
import { crearMiniatura, guardarMiniaturaLocal } from '@/data/miniaturas';

/**
 * Toma una foto con la cámara o la elige de la galería.
 * Devuelve la URI local, o null si el usuario cancela o no da permisos.
 * En el navegador siempre abre el selector de ficheros.
 */
export async function capturePhoto(source: 'camera' | 'library' = 'camera'): Promise<string | null> {
  try {
    if (source === 'camera' && Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return null;
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
      return res.canceled ? null : res.assets[0].uri;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      mediaTypes: ['images'],
    });
    return res.canceled ? null : res.assets[0].uri;
  } catch {
    return null;
  }
}


/** Resultado de hacer una foto: dónde está y si ya está a salvo. */
export interface FotoTomada {
  /** Lo que se guarda en el comando: `foto:<id>` si subió, la ruta local si no. */
  ref: string;
  /** Para pintarla ya, sin esperar a nada. */
  vistaPrevia: string;
  /** false = se ha quedado en este móvil y no la ve nadie más. */
  subida: boolean;
}

/**
 * Hace la foto y la sube.
 *
 * Se sube aquí, nada más hacerla, y no al mandar el comando: si falla, el
 * operario se entera con el coche todavía delante y puede repetirla. Si no
 * hay servidor configurado (modo demostración) se queda en el móvil, que es
 * lo que había hasta ahora.
 */
export async function capturarYSubir(source: 'camera' | 'library' = 'camera'): Promise<FotoTomada | null> {
  const uri = await capturePhoto(source);
  if (!uri) return null;
  // La miniatura, para las listas, se hace ahora que la foto está en el
  // móvil: después solo se podría hacer bajándose la original.
  const miniatura = await crearMiniatura(uri);
  if (!apiEnabled) {
    if (miniatura) await guardarMiniaturaLocal(uri, miniatura);
    return { ref: uri, vistaPrevia: uri, subida: true };
  }

  try {
    const ref = await api.subirFoto(uri);
    if (miniatura) {
      // Sin esperarla: la foto, que es la prueba, ya está a salvo. Si la
      // miniatura no sube, este móvil la guarda y la lista la sigue viendo.
      void api.subirMiniatura(ref, miniatura).catch(() => guardarMiniaturaLocal(ref, miniatura));
    }
    return { ref, vistaPrevia: uri, subida: true };
  } catch {
    // En el navegador no hay dónde guardarla para después: la dirección de
    // la foto deja de valer al recargar la página y el trabajo se quedaría
    // apuntando a una imagen que ya no existe. Mejor decirlo ahora, con el
    // coche delante, que es cuando se puede repetir (regla 15).
    if (Platform.OS === 'web') {
      throw new Error('La foto no ha subido. En el navegador no se puede guardar para después: repítela cuando haya conexión.');
    }
    // Sin cobertura: se copia al espacio privado y duradero de la app. El
    // sincronizador la subirá antes de enviar el comando que la referencia.
    try {
      const ref = await registrarFotoPendiente(uri);
      if (miniatura) await guardarMiniaturaLocal(ref, miniatura);
      return { ref, vistaPrevia: ref, subida: false };
    } catch {
      // Si ni siquiera podemos conservarla de forma duradera (disco lleno,
      // permiso roto…), no fingimos que está guardada.
      return null;
    }
  }
}
