import { Platform } from 'react-native';

/**
 * Toma una foto con la cámara o la elige de la galería.
 * Se importa de forma perezosa para no romper la web ni el simulador.
 * Devuelve la URI local o null si el usuario cancela / no hay permisos.
 */
export async function capturePhoto(source: 'camera' | 'library' = 'camera'): Promise<string | null> {
  try {
    const ImagePicker = await import('expo-image-picker');

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
