/**
 * Copia de seguridad: la base de datos y las fotos en un solo fichero.
 *
 *   npm run copia                 deja la copia en ./copias
 *   npm run copia -- /ruta        la deja donde le digas
 *
 * Existe porque con todo en Railway las fotos viven en un disco del propio
 * servidor y **el volcado de la base de datos no se las lleva**. Y las fotos
 * de daños son la prueba para reclamarle a un transportista: perderlas
 * cuesta dinero de verdad.
 *
 * Se guarda lo que no se puede rehacer:
 *
 *  - `comandos`, que es la verdad: todo lo que ha pasado, con quién y cuándo.
 *  - `credenciales`, que son las contraseñas (su hash, nunca la contraseña).
 *  - Las fotos.
 *
 * Y no se guarda lo que se rehace solo: la foto del estado se reconstruye
 * aplicando los comandos, los tokens de aviso los vuelve a dar cada móvil al
 * abrir la app, y los enlaces de restablecer caducan en una hora.
 *
 * Al terminar, la copia **se comprueba**: se rehace el estado entero
 * aplicando los comandos guardados. Una copia que nunca se ha restaurado no
 * es una copia, es una esperanza.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { resumirCopia } from './copia-nucleo';
import { leerConfig } from './config';
import { FotosEnSupabase } from './almacen/fotos';
import type { Command } from '../../src/data/commands';

const config = leerConfig(process.env);

async function main() {
  const destino = process.argv[2] ?? path.join(process.cwd(), 'copias');
  if (!config.databaseUrl) {
    throw new Error('Sin DATABASE_URL no hay nada que copiar. ¿Está el servidor en modo fichero?');
  }

  const dia = new Date().toISOString().slice(0, 10);
  const nombre = `urkiola-${dia}`;
  const carpeta = path.join(destino, nombre);
  fs.mkdirSync(carpeta, { recursive: true });

  const cliente = new Client({
    connectionString: config.databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(config.databaseUrl) ? undefined : { rejectUnauthorized: true },
  });
  await cliente.connect();

  try {
    /* -------------------------------------------------- el histórico */
    // Una línea por comando, en orden. En un fichero de texto plano y no en
    // un formato de la base de datos: dentro de cinco años se sigue pudiendo
    // abrir con cualquier cosa, aunque ya no exista ni Postgres ni esto.
    const comandos = await cliente.query<{ payload: Command }>(
      'select payload from comandos order by seq asc'
    );
    const lineas = comandos.rows.map((r) => JSON.stringify(r.payload)).join('\n');
    fs.writeFileSync(path.join(carpeta, 'comandos.jsonl'), lineas + (lineas ? '\n' : ''));

    /* ------------------------------------------------ las contraseñas */
    const credenciales = await cliente.query(
      'select usuario, email, hash, actualizado from credenciales order by usuario'
    );
    fs.writeFileSync(
      path.join(carpeta, 'credenciales.json'),
      JSON.stringify(credenciales.rows, null, 2)
    );

    /* ------------------------------------------------------ las fotos */
    let fotos = 0;
    let bytesFotos = 0;
    if (config.supabaseUrl && config.supabaseClave) {
      const destinoFotos = path.join(carpeta, 'fotos');
      fs.mkdirSync(destinoFotos, { recursive: true });
      const remoto = new FotosEnSupabase(config.supabaseUrl, config.supabaseClave, config.supabaseBucket);
      const ids = await remoto.listarIds();
      for (const id of ids) {
        const foto = await remoto.leer(id);
        if (!foto) throw new Error(`La foto ${id} estaba listada en Storage pero no se pudo leer.`);
        fs.writeFileSync(path.join(destinoFotos, path.basename(id)), foto.cuerpo);
        fs.writeFileSync(path.join(destinoFotos, `${path.basename(id)}.tipo`), foto.tipo, 'utf8');
        fotos += 1;
        bytesFotos += foto.cuerpo.length;
      }
      console.log(`· Copiadas ${fotos} fotos desde Supabase Storage fuera del proveedor.`);
    } else if (fs.existsSync(config.carpetaFotos)) {
      const destinoFotos = path.join(carpeta, 'fotos');
      fs.mkdirSync(destinoFotos, { recursive: true });
      for (const f of fs.readdirSync(config.carpetaFotos)) {
        const origen = path.join(config.carpetaFotos, f);
        if (!fs.statSync(origen).isFile()) continue;
        fs.copyFileSync(origen, path.join(destinoFotos, f));
        if (!f.endsWith('.tipo')) {
          fotos += 1;
          bytesFotos += fs.statSync(origen).size;
        }
      }
    } else {
      console.log(`· No hay carpeta de fotos en ${config.carpetaFotos}: todavía no se ha subido ninguna.`);
    }

    /* ------------------------------- comprobar rehaciendo el estado */
    // Aplicar los comandos de la copia tiene que dar un estado con sentido.
    // Si esto revienta, la copia no sirve y hay que enterarse hoy, no el día
    // que haga falta restaurarla.
    const carpetaEnCopia = path.join(carpeta, 'fotos');
    const resumen = resumirCopia({
      comandos: comandos.rows.map((r) => r.payload),
      credenciales: credenciales.rows,
      ficherosDeFoto: fs.existsSync(carpetaEnCopia) ? fs.readdirSync(carpetaEnCopia) : [],
      bytesFotos,
      semilla: config.semilla,
      fotosEn: config.supabaseUrl ? 'copia-externa-supabase-storage' : config.carpetaFotos,
      fotosFuera: false,
    });
    const faltan = resumen.fotosQueFaltan;
    fs.writeFileSync(path.join(carpeta, 'copia.json'), JSON.stringify(resumen, null, 2));

    /* ------------------------------------------- un solo fichero */
    let fichero = carpeta;
    try {
      execFileSync('tar', ['-czf', `${nombre}.tar.gz`, nombre], { cwd: destino });
      fs.rmSync(carpeta, { recursive: true, force: true });
      fichero = path.join(destino, `${nombre}.tar.gz`);
    } catch {
      console.warn('· Sin `tar` a mano: la copia se queda como carpeta, que sirve igual.');
    }

    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    console.log(`\n✔ Copia hecha: ${fichero}`);
    console.log(
      `  ${resumen.comandos} comandos · ${resumen.credenciales} contraseñas · ` +
        `${resumen.fotos} fotos (${mb(resumen.bytesFotos)} MB)`
    );
    console.log(
      `  Comprobada rehaciendo el estado: ${resumen.vehiculos} vehículos, ` +
        `${resumen.movimientos} movimientos, ${resumen.solicitudes} solicitudes.`
    );
    if (faltan.length) {
      console.warn(`\n⚠ Faltan ${faltan.length} fotos que el histórico menciona: ${faltan.slice(0, 5).join(', ')}`);
      console.warn('  La copia vale igual, pero esas fotos ya no están. Míralo.');
    }
    console.log('\n  Guárdala FUERA del servidor. Una copia que vive en el mismo sitio');
    console.log('  que los datos no es una copia: es el mismo fichero dos veces.');
  } finally {
    await cliente.end();
  }
}

main().catch((e) => {
  console.error('\n✖ La copia ha fallado:', e instanceof Error ? e.message : e);
  process.exit(1);
});
