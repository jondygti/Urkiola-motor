/**
 * Arranque del servidor.
 *
 *   npm run dev     con datos de ejemplo, guardando en un fichero
 *   npm start       en producción (necesita DATABASE_URL y JWT_SECRET)
 *
 * Ver server/README.md.
 */
import { leerConfig } from './config';
import { AlmacenFichero } from './almacen/fichero';
import { AlmacenPostgres } from './almacen/postgres';
import type { Almacen } from './almacen/tipos';
import { FotosEnFichero, FotosEnSupabase, type AlmacenFotos } from './almacen/fotos';
import { CorreoEnRegistro, CorreoHttp, type Correo } from './correo';
import { Servicio } from './servicio';
import { crearServidor } from './http';

async function main() {
  const config = leerConfig();

  const almacen: Almacen = config.databaseUrl
    ? new AlmacenPostgres(config.databaseUrl)
    : new AlmacenFichero(config.ficheroDatos);

  if (!config.databaseUrl) {
    console.warn(
      `Sin DATABASE_URL: los datos se guardan en ${config.ficheroDatos}. ` +
        'Vale para probar, no para producción.'
    );
  }

  // Las fotos van aparte de los datos: son ficheros, no filas.
  const fotos: AlmacenFotos =
    config.supabaseUrl && config.supabaseClave
      ? new FotosEnSupabase(config.supabaseUrl, config.supabaseClave, config.supabaseBucket)
      : new FotosEnFichero(config.carpetaFotos);

  if (!config.supabaseUrl) {
    console.warn(
      `Sin SUPABASE_URL: las fotos se guardan en ${config.carpetaFotos}. ` +
        'Vale para probar, no para producción.'
    );
  }

  // El correo solo se usa para el enlace de restablecer la contraseña.
  const correo: Correo = config.correoClave
    ? new CorreoHttp(config.correoUrl, config.correoClave, config.correoRemitente)
    : new CorreoEnRegistro();

  if (!config.correoClave) {
    console.warn(
      'Sin EMAIL_API_KEY: los correos de restablecer contraseña salen por consola en vez de enviarse. ' +
        'Mientras tanto, la restablece un administrador desde Administración.'
    );
  }
  if (config.produccion && !config.urlPublica) {
    console.warn('Sin PUBLIC_URL: el enlace de restablecer no sabrá a qué dirección apuntar.');
  }

  const servicio = await Servicio.crear(almacen, config, fotos, correo);
  const servidor = crearServidor(servicio, config);

  const barrer = () => { void servicio.barrerAvisos().catch((e) => console.error('No se han podido revisar los avisos:', e)); };
  barrer();
  const reloj = setInterval(barrer, 60 * 60_000);
  reloj.unref();

  servidor.listen(config.puerto, () => {
    console.log(`Easo Logistics · API escuchando en el puerto ${config.puerto}`);
  });

  // Al desplegar, la plataforma manda SIGTERM: hay que terminar lo que se
  // esté aplicando y soltar el cerrojo de la base de datos antes de morir,
  // o la instancia nueva se queda esperando.
  const apagar = async (senal: string) => {
    console.log(`${senal}: cerrando…`);
    clearInterval(reloj);
    // Primero no entran peticiones nuevas; las que ya estaban dentro terminan
    // antes de cerrar la base de datos y Storage.
    await new Promise<void>((resolver) => servidor.close(() => resolver()));
    await servicio.cerrar();
    process.exit(0);
  };
  process.on('SIGTERM', () => void apagar('SIGTERM'));
  process.on('SIGINT', () => void apagar('SIGINT'));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
