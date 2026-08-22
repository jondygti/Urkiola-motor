import { Platform } from 'react-native';

/**
 * Registro de notificaciones push.
 *
 * Se carga de forma perezosa para que la web y el simulador no fallen si el
 * módulo nativo no está disponible. Devuelve el token de Expo o null.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');

    if (!Device.isDevice) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('urkiola-operativa', {
        name: 'Operativa',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2fb899',
      });
    }

    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

/** Aviso local inmediato (se usa en modo demo para ver el flujo completo). */
export async function notifyLocal(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    /* sin módulo nativo disponible: se ignora */
  }
}
