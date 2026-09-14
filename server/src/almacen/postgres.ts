/**
 * Almacén en Postgres (Supabase o Railway).
 *
 * El histórico de comandos es lo que no se puede perder, así que cada
 * comando se guarda antes de contestar «ok». La foto del estado se guarda
 * cada tantos comandos: si se pierde, se rehace aplicando el histórico.
 *
 * **Una sola instancia a la vez.** El estado vive en memoria y se aplica un
 * comando detrás de otro; dos procesos escribiendo a la vez se pisarían. En
 * vez de confiar en que nadie suba las réplicas a dos, se coge un cerrojo
 * en la propia base de datos: el segundo proceso espera a que el primero
 * termine (así un despliegue nuevo releva al viejo sin cortar nada).
 */
import { Client, Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import type { AppState, Id } from '../../../src/data/types';
import type { Command } from '../../../src/data/commands';
import type { Almacen, Credencial, EnlaceRestablecer, TokenPush } from './tipos';

/** Número fijo del cerrojo. Cualquiera vale mientras sea siempre el mismo. */
const CERROJO = 8_140_2025;

export class AlmacenPostgres implements Almacen {
  private pool: Pool;
  /** Conexión aparte que sostiene el cerrojo mientras el servidor viva. */
  private cerrojo: Client | null = null;

  constructor(private readonly url: string, private readonly esperaCerrojoMs = 60_000) {
    this.pool = new Pool({
      connectionString: url,
      // Supabase y Railway exigen TLS pero con certificado propio.
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }

  async iniciar() {
    const sql = fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8');
    await this.pool.query(sql);
    await this.cogerCerrojo();

    const foto = await this.pool.query<{ estado: AppState; hasta_comando: string }>(
      'select estado, hasta_comando from foto where id = 1'
    );
    const fila = foto.rows[0];
    const desde = fila ? Number(fila.hasta_comando) : 0;

    const pendientes = await this.pool.query<{ payload: Command }>(
      'select payload from comandos where seq > $1 order by seq',
      [desde]
    );

    return {
      estado: fila?.estado ?? null,
      comandosDesdeFoto: pendientes.rows.map((r) => r.payload),
    };
  }

  private async cogerCerrojo() {
    this.cerrojo = new Client({
      connectionString: this.url,
      ssl: /localhost|127\.0\.0\.1/.test(this.url) ? undefined : { rejectUnauthorized: false },
    });
    await this.cerrojo.connect();
    const limite = Date.now() + this.esperaCerrojoMs;
    for (;;) {
      const r = await this.cerrojo.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [
        CERROJO,
      ]);
      if (r.rows[0]?.ok) return;
      if (Date.now() > limite) {
        throw new Error(
          'Hay otra instancia del servidor usando esta base de datos. ' +
            'Este backend funciona con una sola: baja las réplicas a 1.'
        );
      }
      console.warn('Esperando a que la instancia anterior suelte la base de datos…');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async yaAplicado(id: Id) {
    const r = await this.pool.query('select 1 from comandos where id = $1', [id]);
    return r.rowCount ? r.rowCount > 0 : false;
  }

  async anotarComando(cmd: Command, estado: AppState, guardarFoto: boolean) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('begin');
      const r = await cliente.query<{ seq: string }>(
        `insert into comandos (id, tipo, usuario, at, payload)
         values ($1, $2, $3, $4, $5)
         on conflict (id) do nothing
         returning seq`,
        [cmd.id, cmd.type, cmd.userId, cmd.at, JSON.stringify(cmd)]
      );
      // Si no devuelve nada, otro lo insertó antes: no se toca la foto.
      const seq = r.rows[0]?.seq;
      if (seq && cmd.type === 'user.upsert') {
        // El cambio de correo y el comando quedan en la misma transacción.
        // Así el correo anterior queda disponible y sus enlaces no valen.
        await cliente.query('delete from enlaces_restablecer where usuario = $1', [cmd.user.id]);
        await cliente.query('update credenciales set email = $2 where usuario = $1', [cmd.user.id, cmd.user.email]);
      }
      if (seq && guardarFoto) {
        await cliente.query(
          `insert into foto (id, estado, hasta_comando, actualizado)
           values (1, $1, $2, now())
           on conflict (id) do update
             set estado = excluded.estado,
                 hasta_comando = excluded.hasta_comando,
                 actualizado = now()`,
          [JSON.stringify(estado), seq]
        );
      }
      await cliente.query('commit');
    } catch (e) {
      await cliente.query('rollback').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  }

  async guardarFoto(estado: AppState) {
    const r = await this.pool.query<{ seq: string }>(
      'select coalesce(max(seq), 0) as seq from comandos'
    );
    await this.pool.query(
      `insert into foto (id, estado, hasta_comando, actualizado)
       values (1, $1, $2, now())
       on conflict (id) do update
         set estado = excluded.estado,
             hasta_comando = excluded.hasta_comando,
             actualizado = now()`,
      [JSON.stringify(estado), r.rows[0]?.seq ?? 0]
    );
  }

  async credencialPorEmail(email: string) {
    const r = await this.pool.query<Credencial>(
      'select usuario as "userId", email, hash, actualizado as "cambiadaEn" from credenciales where lower(email) = lower($1)',
      [email.trim()]
    );
    return r.rows[0] ?? null;
  }

  async credencialPorUsuario(userId: Id) {
    const r = await this.pool.query<Credencial>(
      'select usuario as "userId", email, hash, actualizado as "cambiadaEn" from credenciales where usuario = $1',
      [userId]
    );
    return r.rows[0] ?? null;
  }

  async guardarCredencial(c: Credencial) {
    await this.pool.query(
      `insert into credenciales (usuario, email, hash, actualizado)
       values ($1, $2, $3, now())
       on conflict (usuario) do update
         set email = excluded.email, hash = excluded.hash, actualizado = now()`,
      [c.userId, c.email, c.hash]
    );
  }

  async hayCredenciales() {
    const r = await this.pool.query('select 1 from credenciales limit 1');
    return r.rowCount ? r.rowCount > 0 : false;
  }

  async guardarEnlace(e: EnlaceRestablecer) {
    // Solo uno por persona: pedir otro invalida el anterior.
    await this.pool.query('delete from enlaces_restablecer where usuario = $1', [e.userId]);
    await this.pool.query(
      'insert into enlaces_restablecer (hash, usuario, caduca) values ($1, $2, $3)',
      [e.hash, e.userId, e.caduca]
    );
  }

  async gastarEnlace(hash: string) {
    // Se borra al leerlo, en la misma consulta: así no hay forma de usarlo
    // dos veces aunque lleguen dos peticiones a la vez.
    const r = await this.pool.query<{ userId: Id; caduca: Date }>(
      'delete from enlaces_restablecer where hash = $1 returning usuario as "userId", caduca',
      [hash]
    );
    const fila = r.rows[0];
    if (!fila) return null;
    if (new Date(fila.caduca).getTime() < Date.now()) return null;
    return { hash, userId: fila.userId, caduca: new Date(fila.caduca).toISOString() };
  }

  async borrarEnlacesDe(userId: Id) {
    await this.pool.query('delete from enlaces_restablecer where usuario = $1', [userId]);
  }

  async guardarTokenPush(t: TokenPush) {
    await this.pool.query(
      `insert into tokens_push (token, usuario, at) values ($1, $2, $3)
       on conflict (token) do update set usuario = excluded.usuario, at = excluded.at`,
      [t.token, t.userId, t.at]
    );
  }

  async borrarTokenPush(token: string) {
    await this.pool.query('delete from tokens_push where token = $1', [token]);
  }

  async tokensPushDe(userIds: Id[]) {
    if (userIds.length === 0) return [];
    const r = await this.pool.query<{ userId: Id; token: string; at: Date }>(
      'select usuario as "userId", token, at from tokens_push where usuario = any($1)',
      [userIds]
    );
    return r.rows.map((x) => ({ userId: x.userId, token: x.token, at: new Date(x.at).toISOString() }));
  }

  async cerrar() {
    await this.cerrojo?.end().catch(() => {});
    await this.pool.end().catch(() => {});
  }
}
