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
    produccion,
  };
}
