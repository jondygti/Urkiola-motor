/**
 * Cómo se guardan las cosas.
 *
 * El servidor guarda dos cosas distintas:
 *
 *  - **El histórico de comandos**, que es la verdad. Todo lo que ha pasado
 *    está ahí, con quién lo hizo y cuándo, que es justo lo que pide la
 *    operativa de recuentos.
 *  - **Una foto del estado** cada cierto número de comandos, para no tener
 *    que rehacer diez mil comandos cada vez que arranca.
 *
 * Si la foto se pierde o se queda vieja no pasa nada: se rehace aplicando
 * los comandos que vengan detrás. Lo que no se puede perder es el
 * histórico, y por eso el comando se guarda **antes** de contestar «ok».
 */
import type { AppState, Id } from '../../../src/data/types';
import type { Command } from '../../../src/data/commands';

/** Contraseña de un usuario. Nunca en claro: ver `auth.ts`. */
export interface Credencial {
  userId: Id;
  email: string;
  /** `scrypt$N$r$p$sal$hash`. */
  hash: string;
  /**
   * Cuándo se cambió por última vez.
   *
   * Sirve para tirar las sesiones antiguas: si alguien cambia la contraseña
   * porque cree que se la han visto, las sesiones abiertas en otros
   * dispositivos tienen que dejar de valer. Sin esto seguirían funcionando
   * treinta días.
   */
  cambiadaEn?: string;
}

/**
 * Enlace de un solo uso para restablecer la contraseña.
 *
 * Se guarda el **hash** del código, no el código: si alguien se llevara la
 * base de datos, no podría entrar en las cuentas que tuvieran un enlace a
 * medias.
 */
export interface EnlaceRestablecer {
  hash: string;
  userId: Id;
  caduca: string;
}

/** Token de avisos de un dispositivo. */
export interface TokenPush {
  userId: Id;
  token: string;
  at: string;
}

export interface Almacen {
  /** Prepara la base de datos y devuelve el estado guardado, si lo hay. */
  iniciar(): Promise<{ estado: AppState | null; comandosDesdeFoto: Command[] }>;

  /** Comprueba que el almacenamiento esencial responde. */
  salud(): Promise<void>;

  /** ¿Se aplicó ya este comando? Es lo que hace la API idempotente. */
  yaAplicado(id: Id): Promise<boolean>;

  /**
   * Guarda un comando aplicado y, si toca, la foto del estado.
   * Debe ser atómico: o queda el comando, o no queda nada.
   */
  anotarComando(cmd: Command, estado: AppState, guardarFoto: boolean): Promise<void>;

  /** Guarda la foto sin comando (arranque, importación). */
  guardarFoto(estado: AppState): Promise<void>;

  credencialPorEmail(email: string): Promise<Credencial | null>;
  credencialPorUsuario(userId: Id): Promise<Credencial | null>;
  guardarCredencial(c: Credencial): Promise<void>;
  hayCredenciales(): Promise<boolean>;

  guardarEnlace(e: EnlaceRestablecer): Promise<void>;
  /** Lo busca y lo borra a la vez: un enlace vale una sola vez. */
  gastarEnlace(hash: string): Promise<EnlaceRestablecer | null>;
  borrarEnlacesDe(userId: Id): Promise<void>;

  guardarTokenPush(t: TokenPush): Promise<void>;
  borrarTokenPush(token: string): Promise<void>;
  tokensPushDe(userIds: Id[]): Promise<TokenPush[]>;

  cerrar(): Promise<void>;
}

/** Cada cuántos comandos se vuelve a guardar la foto del estado. */
export const COMANDOS_POR_FOTO = Number(process.env.URKIOLA_FOTO_CADA ?? 50);
