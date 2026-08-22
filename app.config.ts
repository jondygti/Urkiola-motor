import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Configuración de la app Urkiola Car Service.
 *
 * Un único proyecto genera los tres destinos:
 *   - Web  (panel de gestión)            -> npm run build:web
 *   - iOS  (App Store)                   -> eas build -p ios
 *   - Android (Google Play)              -> eas build -p android
 *
 * Antes de la primera subida a las tiendas revisa `docs/PUBLICACION-TIENDAS.md`
 * y sustituye `extra.eas.projectId` por el que devuelva `eas init`.
 */

const BUNDLE_ID = 'com.urkiolamotor.carservice';
const BRAND_DARK = '#10262d';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Urkiola Car Service',
  slug: 'urkiola-car-service',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  scheme: 'urkiola',
  userInterfaceStyle: 'automatic',
  primaryColor: BRAND_DARK,
  assetBundlePatterns: ['**/*'],

  ios: {
    bundleIdentifier: BUNDLE_ID,
    buildNumber: '1',
    supportsTablet: true,
    // Textos que Apple muestra al pedir el permiso. Son obligatorios:
    // sin ellos App Store Connect rechaza la build.
    infoPlist: {
      NSCameraUsageDescription:
        'Urkiola Car Service usa la cámara para escanear matrículas y VIN-8 en los recuentos y para adjuntar fotos de incidencias y preparaciones.',
      NSPhotoLibraryUsageDescription:
        'Urkiola Car Service accede a tus fotos para adjuntar imágenes a incidencias, albaranes y preparaciones.',
      NSPhotoLibraryAddUsageDescription:
        'Urkiola Car Service guarda en tu carrete las fotos tomadas desde la app.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: BUNDLE_ID,
    versionCode: 1,
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
    ],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },

  web: {
    bundler: 'metro',
    // 'static' genera una página por ruta (lo normal para desplegar).
    // 'single' genera una sola página; lo usa `npm run build:demo` para
    // empaquetar la demostración en un único fichero HTML.
    output: process.env.EXPO_WEB_OUTPUT === 'single' ? 'single' : 'static',
    favicon: './assets/favicon.png',
    name: 'Urkiola Car Service',
    shortName: 'Urkiola',
    lang: 'es',
    themeColor: BRAND_DARK,
    backgroundColor: '#f3f6f7',
    display: 'standalone',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: BRAND_DARK,
        dark: { backgroundColor: '#0a1a1f' },
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'Permite escanear matrículas y VIN-8 y tomar fotos de incidencias.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Permite adjuntar fotos de incidencias, albaranes y preparaciones.',
      },
    ],
    [
      'expo-notifications',
      {
        color: BRAND_DARK,
        defaultChannel: 'urkiola-operativa',
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  updates: {
    // Rellenar tras `eas init`. Permite publicar correcciones sin pasar
    // otra vez por la revisión de las tiendas (OTA updates).
    fallbackToCacheTimeout: 0,
  },

  extra: {
    router: {},
    eas: {
      // Sustituir por el projectId real que genera `eas init`.
      projectId: process.env.EAS_PROJECT_ID ?? '00000000-0000-0000-0000-000000000000',
    },
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  },

  owner: process.env.EAS_OWNER ?? undefined,
});
