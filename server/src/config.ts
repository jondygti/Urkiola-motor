/**
 * Configuración del servidor, toda por variables de entorno.
 *
 * La idea es que arranque sin configurar nada para probarlo en un portátil,
 * y que en producción no arranque si falta algo importante (el secreto de
 * las sesiones, por ejemplo). Mejor un fallo al arrancar que un servidor
 * abierto que nadie revisa.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export type Semilla = 'demo' | 'vacia';

export interface Config {
  puerto: number;
  /** Cadena de conexión a Postgres. Si está vacía, se guarda en fichero. */
  databaseUrl: string;
  /** Fichero donde guarda los datos el almacén local. */
  ficheroDatos: string;
  /** Secreto con el que se firman las sesiones. */
  secreto: string;
  /** Días que dura la sesión. En campa no interesa que caduque a diario. */
  sesionDias: number;
  /** Parque inicial la primera vez que arranca. */
  semilla: Semilla;
  /** Orígenes permitidos para el navegador. `*` solo vale en pruebas. */
  origenes: string[];
  /** Administrador inicial. */
  adminEmail: string;
  adminPassword: string;
  /** Contraseña única de los usuarios de ejemplo (solo con semilla demo). */
  clavePruebas: string;
  /** Envío real de avisos push a Expo. */
  push: boolean;
  /** Carpeta con la web compilada, si la sirve este mismo servidor. */
  carpetaWeb: string;
  /** Carpeta de las fotos cuando se guardan en disco. */
  carpetaFotos: string;
  /** Supabase Storage, para producción. Vacío = se guardan en disco. */
  supabaseUrl: string;
  supabaseClave: string;
  supabaseBucket: string;
  /** Tamaño máximo de una foto. */
  maxFotoBytes: number;
  /** Proveedor de correo, para el enlace de restablecer contraseña. */
  correoUrl: string;
  correoClave: string;
  correoRemitente: string;
  /** Dirección pública de la app, para armar el enlace del correo. */
  urlPublica: string;
  /** Minutos que vale el enlace de restablecer. */
  minutosEnlace: number;
  produccion: boolean;
}

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : porDefecto;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const produccion = (env.NODE_ENV ?? '') === 'production';

  let secreto = env.JWT_SECRET ?? '';
  if (!secreto) {
    if (produccion) {
      // Sin secreto fijo, cada reinicio invalida las sesiones y, peor, en
      // varias instancias cada una firma con el suyo.
      throw new Error('Falta JWT_SECRET. Genera uno con: openssl rand -hex 32');
    }
    secreto = randomBytes(32).toString('hex');
  }

  const origenes = (env.CORS_ORIGEN ?? '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (produccion && origenes.includes('*')) {
    // Con `*` cualquier página de internet puede llamar a esta API desde el
    // navegador de quien la visite. En pruebas es cómodo; en producción, no.
    throw new Error(
      'CORS_ORIGEN no puede ser "*" en producción. Pon el dominio del panel, por ejemplo ' +
        'CORS_ORIGEN=https://urkiolacarservice.com'
    );
  }

  if (produccion) {
    const faltan: string[] = [];
    if (!env.DATABASE_URL) faltan.push('DATABASE_URL');
    if (env.URKIOLA_SEMILLA !== 'vacia') faltan.push('URKIOLA_SEMILLA=vacia');
    if (!env.SUPABASE_URL) faltan.push('SUPABASE_URL');
    if (!env.SUPABASE_SERVICE_ROLE_KEY) faltan.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!env.PUBLIC_URL) faltan.push('PUBLIC_URL');
    if (!env.URKIOLA_ADMIN_EMAIL) faltan.push('URKIOLA_ADMIN_EMAIL');
    if (!env.URKIOLA_ADMIN_PASSWORD) faltan.push('URKIOLA_ADMIN_PASSWORD');
    if (!env.EMAIL_API_KEY) faltan.push('EMAIL_API_KEY');
    if (faltan.length) {
      throw new Error(
        'Configuración de producción incompleta. El servidor no arrancará en modo degradado: ' +
          faltan.join(', ')
      );
    }
  }

  return {
    puerto: entero(env.PORT ?? env.PUERTO, 8080),
    databaseUrl: env.DATABASE_URL ?? '',
    ficheroDatos: env.URKIOLA_DATOS ?? path.join(process.cwd(), 'datos', 'estado.json'),
    secreto,
    sesionDias: entero(env.SESION_DIAS, 30),
    semilla: env.URKIOLA_SEMILLA === 'vacia' ? 'vacia' : 'demo',
    origenes,
    adminEmail: env.URKIOLA_ADMIN_EMAIL ?? '',
    adminPassword: env.URKIOLA_ADMIN_PASSWORD ?? '',
    clavePruebas: env.URKIOLA_CLAVE_PRUEBAS ?? 'urkiola',
    push: env.EXPO_PUSH !== '0' && env.EXPO_PUSH !== 'false',
    carpetaWeb: env.URKIOLA_WEB ?? path.join(process.cwd(), 'dist'),
    carpetaFotos: env.URKIOLA_FOTOS ?? path.join(process.cwd(), 'datos', 'fotos'),
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabaseClave: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    supabaseBucket: env.SUPABASE_BUCKET ?? 'urkiola-fotos',
    maxFotoBytes: entero(env.URKIOLA_MAX_FOTO_MB, 8) * 1024 * 1024,
    correoUrl: env.EMAIL_API_URL ?? 'https://api.resend.com/emails',
    correoClave: env.EMAIL_API_KEY ?? '',
    correoRemitente: env.EMAIL_FROM ?? 'Urkiola Car Service <no-responder@urkiolacarservice.com>',
    // `*` vale como origen permitido pero no como dirección para un enlace.
    urlPublica: (env.PUBLIC_URL ?? (origenes[0] === '*' ? '' : origenes[0]) ?? '').replace(/\/+$/, ''),
    minutosEnlace: entero(env.URKIOLA_MINUTOS_ENLACE, 60),
    produccion,
  };
}
