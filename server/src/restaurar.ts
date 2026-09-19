/**
 * Restaurar una copia de seguridad.
 *
 *   npm run restaurar -- ./copias/urkiola-2026-08-26
 *   npm run restaurar -- ./copias/urkiola-2026-08-26 --de-verdad
 *
 * Sin `--de-verdad` no escribe nada: lee la copia, la comprueba y cuenta lo
 * que haría. Es el modo que hay que usar **cada mes** para saber que la
 * copia sirve, sin tocar nada.
 *
 * Restaurar es meter otra vez los comandos en orden. El estado se rehace
 * solo aplicándolos, que es como funciona el servidor al arrancar: no hay
 * que restaurar «la base de datos», hay que restaurar lo que pasó.
 *
 * Se niega a escribir encima de una base de datos que ya tenga comandos: si
 * hay que restaurar sobre algo, se vacía antes a mano y a conciencia.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { problemasDeLaCopia, rehacerEstado, resumirCopia } from './copia-nucleo';
import { leerConfig } from './config';
import { FotosEnSupabase } from './almacen/fotos';
import type { Command } from '../../src/data/commands';

const config = leerConfig(process.env);

async function main() {
  const origen = process.argv[2];
  const deVerdad = process.argv.includes('--de-verdad');
  if (!origen) throw new Error('Falta la carpeta de la copia. Descomprime el .tar.gz primero.');
  if (!fs.existsSync(path.join(origen, 'comandos.jsonl'))) {
    throw new Error(`En ${origen} no hay un comandos.jsonl. ¿Es una copia descomprimida?`);
  }

  /* ------------------------------------------ leer y comprobar */
  const crudo = fs.readFileSync(path.join(origen, 'comandos.jsonl'), 'utf8');
  const comandos: Command[] = crudo
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Command);

  const credenciales: { usuario: string; email: string; hash: string }[] = JSON.parse(
    fs.readFileSync(path.join(origen, 'credenciales.json'), 'utf8')
  );

  const resumen = fs.existsSync(path.join(origen, 'copia.json'))
    ? JSON.parse(fs.readFileSync(path.join(origen, 'copia.json'), 'utf8'))
    : null;

  // Lo mismo que hace el servidor al arrancar: si esto no revienta, la copia
  // sirve. Es la comprobación de verdad, y por eso se hace siempre, también
  // en el modo que no escribe nada.
  const estado = rehacerEstado(comandos, config.semilla);
  const rehecho = resumirCopia({
    comandos,
    credenciales,
    ficherosDeFoto: fs.existsSync(path.join(origen, 'fotos'))
      ? fs.readdirSync(path.join(origen, 'fotos'))
      : [],
    bytesFotos: 0,
    semilla: config.semilla,
    fotosEn: config.carpetaFotos,
    // Compatibilidad con copias antiguas, que confiaban en Storage y no
    // incluían los objetos. Las nuevas siempre llevan la carpeta fotos/.
    fotosFuera: resumen?.fotosEn === 'supabase' && !fs.existsSync(path.join(origen, 'fotos')),
  });

  console.log(`\nCopia de ${resumen?.fecha ?? 'fecha desconocida'}`);
  console.log(`  ${comandos.length} comandos · ${credenciales.length} contraseñas`);
  console.log(
    `  Rehecho el estado: ${estado.vehicles.length} vehículos, ${estado.movements.length} movimientos, ` +
      `${estado.requests.length} solicitudes, ${estado.preparations.length} preparaciones.`
  );

  const problemas = resumen ? problemasDeLaCopia(resumen, rehecho) : [];
  if (problemas.length) throw new Error(problemas.join('\n  '));

  if (!deVerdad) {
    console.log('\n✔ La copia está entera y se puede rehacer.');
    console.log('  No se ha escrito nada. Para restaurar de verdad: --de-verdad');
    return;
  }

  /* ------------------------------------------------ restaurar */
  if (!config.databaseUrl) throw new Error('Sin DATABASE_URL no hay dónde restaurar.');
  const cliente = new Client({
    connectionString: config.databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(config.databaseUrl) ? undefined : { rejectUnauthorized: true },
  });
  await cliente.connect();

  try {
    // El mismo esquema que crea el servidor al arrancar: si la base de
    // datos está recién hecha, aquí nacen las tablas.
    const esquema = fs.readFileSync(
      path.join(__dirname, 'almacen', 'esquema.sql'),
      'utf8'
    );
    await cliente.query(esquema);
    const hay = await cliente.query<{ n: string }>('select count(*) as n from comandos');
    if (Number(hay.rows[0]?.n ?? 0) > 0) {
      throw new Error(
        `Esa base de datos ya tiene ${hay.rows[0].n} comandos. Restaurar encima mezclaría dos historias ` +
          'distintas. Vacíala a conciencia antes, o restaura en una base de datos nueva.'
      );
    }

    // En una transacción: o entra todo o no entra nada. Una restauración a
    // medias es peor que no haber empezado.
    await cliente.query('begin');
    for (const cmd of comandos) {
      await cliente.query(
        'insert into comandos (id, tipo, usuario, at, payload) values ($1,$2,$3,$4,$5)',
        [cmd.id, cmd.type, cmd.userId, cmd.at, JSON.stringify(cmd)]
      );
    }
    for (const c of credenciales) {
      await cliente.query(
        'insert into credenciales (usuario, email, hash) values ($1,$2,$3)',
        [c.usuario, c.email, c.hash]
      );
    }
    await cliente.query('commit');

    /* --------------------------------------------- las fotos */
    const carpetaFotos = path.join(origen, 'fotos');
    let fotos = 0;
    if (fs.existsSync(carpetaFotos)) {
      const nombres = fs.readdirSync(carpetaFotos).filter((f) => !f.endsWith('.tipo'));
      if (config.supabaseUrl && config.supabaseClave) {
        const remoto = new FotosEnSupabase(config.supabaseUrl, config.supabaseClave, config.supabaseBucket);
        for (const f of nombres) {
          const tipo = fs.existsSync(path.join(carpetaFotos, `${f}.tipo`))
            ? fs.readFileSync(path.join(carpetaFotos, `${f}.tipo`), 'utf8')
            : 'image/jpeg';
          await remoto.guardar(f, { cuerpo: fs.readFileSync(path.join(carpetaFotos, f)), tipo });
          fotos += 1;
        }
      } else {
        fs.mkdirSync(config.carpetaFotos, { recursive: true });
        for (const f of fs.readdirSync(carpetaFotos)) {
          fs.copyFileSync(path.join(carpetaFotos, f), path.join(config.carpetaFotos, f));
        }
        fotos = nombres.length;
      }
    }

    console.log(`\n✔ Restaurado: ${comandos.length} comandos, ${credenciales.length} contraseñas, ${fotos} fotos.`);
    console.log('  La foto del estado la rehace el servidor al arrancar. Arráncalo y comprueba /health.');
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    throw e;
  } finally {
    await cliente.end();
  }
}

main().catch((e) => {
  console.error('\n✖ La restauración ha fallado:', e instanceof Error ? e.message : e);
  process.exit(1);
});
