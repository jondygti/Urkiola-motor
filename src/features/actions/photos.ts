import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

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
