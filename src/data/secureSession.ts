import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_URL } from './api';

const SERVIDOR_KEY = `urkiola.api.${encodeURIComponent(API_URL)}`;

/** Clave antigua: se mantiene para migrar instalaciones ya existentes. */
export const LEGACY_API_TOKEN_KEY = `${SERVIDOR_KEY}.token`;
const safeServer = (API_URL || 'default').replace(/[^A-Za-z0-9._-]/g, '_').slice(-90);
const SECURE_TOKEN_KEY = `urkiola.api.token.${safeServer}`;

export async function leerTokenSeguro(): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(LEGACY_API_TOKEN_KEY);
  const SecureStore = await import('expo-secure-store');
  const seguro = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
  if (seguro) return seguro;
  // Migración automática desde la versión que guardaba el JWT en AsyncStorage.
  const antiguo = await AsyncStorage.getItem(LEGACY_API_TOKEN_KEY);
  if (!antiguo) return null;
  await SecureStore.setItemAsync(SECURE_TOKEN_KEY, antiguo);
  await AsyncStorage.removeItem(LEGACY_API_TOKEN_KEY);
  return antiguo;
}

export async function guardarTokenSeguro(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(LEGACY_API_TOKEN_KEY, token);
    return;
  }
  const SecureStore = await import('expo-secure-store');
  await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token);
  // Si venía de una versión antigua, no dejamos otra copia sin cifrar.
  await AsyncStorage.removeItem(LEGACY_API_TOKEN_KEY);
}

export async function borrarTokenSeguro(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_API_TOKEN_KEY);
  if (Platform.OS === 'web') return;
  const SecureStore = await import('expo-secure-store');
  await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
}
