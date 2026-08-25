/**
 * Almacén en fichero, para trabajar en local.
 *
 * Arranca sin instalar ni contratar nada: guarda un JSON en disco. Sirve
 * para desarrollar, para las comprobaciones automáticas y para enseñar el
 * sistema funcionando de verdad antes de dar de alta ninguna cuenta.
 *
 * Para producción está `postgres.ts`. Este no vale: un solo proceso, sin
 * copias de seguridad y reescribiendo el fichero entero.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppState, Id } from '../../../src/data/types';
import type { Command } from '../../../src/data/commands';
import type { Almacen, Credencial, EnlaceRestablecer, TokenPush } from './tipos';

interface Contenido {
  version: number;
  estado: AppState | null;
  /** Comandos aplicados después de la foto. */
  comandos: Command[];
  /** Ids de todos los comandos aplicados, para no repetirlos. */
  aplicados: Id[];
  credenciales: Credencial[];
  tokensPush: TokenPush[];
  enlaces: EnlaceRestablecer[];
}

/**
 * Contenido de partida.
 *
 * Es una función, no una constante: con `{ ...VACIO }` las listas se
 * copiaban por referencia y todos los almacenes creados en el mismo proceso
 * acababan compartiendo las mismas credenciales. Con un solo servidor no se
 * notaba; en las comprobaciones, un servidor se llevaba las contraseñas del
 * anterior.
 */
function vacio(): Contenido {
  return {
    version: 1,
    estado: null,
    comandos: [],
    aplicados: [],
    credenciales: [],
    tokensPush: [],
    enlaces: [],
  };
}

/** Cuántos ids de comando se recuerdan para descartar repetidos. */
const MEMORIA_IDS = 20_000;

export class AlmacenFichero implements Almacen {
  private datos: Contenido = vacio();
  private aplicados = new Set<Id>();
  /** Escrituras en cola: nunca dos a la vez sobre el mismo fichero. */
  private escribiendo: Promise<void> = Promise.resolve();

  constructor(private readonly ruta: string) {}

  async iniciar() {
    try {
      const crudo = await fs.readFile(this.ruta, 'utf8');
      this.datos = { ...vacio(), ...(JSON.parse(crudo) as Contenido) };
    } catch {
      // Primer arranque: no hay fichero todavía.
      this.datos = vacio();
    }
    this.aplicados = new Set(this.datos.aplicados);
    return { estado: this.datos.estado, comandosDesdeFoto: this.datos.comandos };
  }

  async yaAplicado(id: Id) {
    return this.aplicados.has(id);
  }

  async anotarComando(cmd: Command, estado: AppState, guardarFoto: boolean) {
    this.aplicados.add(cmd.id);
    if (guardarFoto) {
      this.datos.estado = estado;
      this.datos.comandos = [];
    } else {
      this.datos.comandos.push(cmd);
    }
    // Los ids viejos se olvidan: un comando de hace meses no va a llegar
    // ya por segunda vez, y la lista no puede crecer sin fin.
    this.datos.aplicados = [...this.aplicados].slice(-MEMORIA_IDS);
    this.aplicados = new Set(this.datos.aplicados);
    await this.volcar();
  }

  async guardarFoto(estado: AppState) {
    this.datos.estado = estado;
    this.datos.comandos = [];
    await this.volcar();
  }

  async credencialPorEmail(email: string) {
    const e = email.trim().toLowerCase();
    return this.datos.credenciales.find((c) => c.email.toLowerCase() === e) ?? null;
  }

  async credencialPorUsuario(userId: Id) {
    return this.datos.credenciales.find((c) => c.userId === userId) ?? null;
  }

  async guardarCredencial(c: Credencial) {
    const i = this.datos.credenciales.findIndex((x) => x.userId === c.userId);
    if (i >= 0) this.datos.credenciales[i] = c;
    else this.datos.credenciales.push(c);
    await this.volcar();
  }

  async hayCredenciales() {
    return this.datos.credenciales.length > 0;
  }

  async guardarEnlace(e: EnlaceRestablecer) {
    // Solo uno por persona: pedir otro invalida el anterior.
    this.datos.enlaces = (this.datos.enlaces ?? []).filter((x) => x.userId !== e.userId);
    this.datos.enlaces.push(e);
    await this.volcar();
  }

  async gastarEnlace(hash: string) {
    const enlace = (this.datos.enlaces ?? []).find((x) => x.hash === hash) ?? null;
    if (!enlace) return null;
    this.datos.enlaces = this.datos.enlaces.filter((x) => x.hash !== hash);
    await this.volcar();
    return new Date(enlace.caduca).getTime() < Date.now() ? null : enlace;
  }

  async borrarEnlacesDe(userId: Id) {
    this.datos.enlaces = (this.datos.enlaces ?? []).filter((x) => x.userId !== userId);
    await this.volcar();
  }

  async guardarTokenPush(t: TokenPush) {
    this.datos.tokensPush = this.datos.tokensPush.filter((x) => x.token !== t.token);
    this.datos.tokensPush.push(t);
    await this.volcar();
  }

  async borrarTokenPush(token: string) {
    this.datos.tokensPush = this.datos.tokensPush.filter((x) => x.token !== token);
    await this.volcar();
  }

  async tokensPushDe(userIds: Id[]) {
    const set = new Set(userIds);
    return this.datos.tokensPush.filter((t) => set.has(t.userId));
  }

  async cerrar() {
    await this.escribiendo;
  }

  /** Escribe a un temporal y renombra: si se corta la luz, no queda a medias. */
  private volcar(): Promise<void> {
    this.escribiendo = this.escribiendo.then(async () => {
      await fs.mkdir(path.dirname(this.ruta), { recursive: true });
      const tmp = `${this.ruta}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.datos), 'utf8');
      await fs.rename(tmp, this.ruta);
    });
    return this.escribiendo;
  }
}
