/**
 * El servidor por dentro.
 *
 * Guarda el estado en memoria y lo cambia aplicando comandos, uno detrás de
 * otro, con `applyCommand`: **la misma función que usa la app**. Así no hay
 * dos versiones de las reglas de negocio que puedan discrepar, que es de
 * donde salen los fallos que nadie entiende.
 *
 * Con el tamaño de esto —cinco sedes, unos cientos de coches, unas decenas
 * de comandos al día— tener el estado entero en memoria es lo más simple
 * que funciona. Si algún día no cupiera, lo que hay que cambiar es esto, no
 * la app ni las reglas.
 */
import type { AppState, Id, User } from '../../src/data/types';
import { applyAll, applyCommand, type Command } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import type { Almacen } from './almacen/tipos';
import { COMANDOS_POR_FOTO } from './almacen/tipos';
import type { Config } from './config';
import {
  anotarFallo,
  bloqueado,
  cifrarPassword,
  comprobarPassword,
  emitirToken,
  leerToken,
  limpiarFallos,
} from './auth';
import { comprobarPermiso, esColaboradorExterno } from './permisos';
import { estadoPara } from './recorte';
import { avisosNuevos, enviarAvisos } from './push';
import { validarComando } from './validar';
import { demasiadosIntentos, malaPeticion, noAutenticado, noEncontrado, sinPermiso } from './errores';

/** Estado inicial vacío: sin coches, sin usuarios salvo el administrador. */
function estadoVacio(): AppState {
  const semilla = buildSeedState();
  return {
    ...semilla,
    users: [],
    vehicles: [],
    movements: [],
    requests: [],
    preparations: [],
    counts: [],
    incidents: [],
    rules: [],
    inbox: [],
    receptions: [],
    events: [],
  };
}

export class Servicio {
  private estadoActual: AppState;
  private desdeFoto: number;
  /** Los comandos se aplican en fila india: nunca dos a la vez. */
  private cola: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly almacen: Almacen,
    private readonly config: Config,
    estado: AppState,
    desdeFoto: number
  ) {
    this.estadoActual = estado;
    this.desdeFoto = desdeFoto;
  }

  static async crear(almacen: Almacen, config: Config): Promise<Servicio> {
    const { estado, comandosDesdeFoto } = await almacen.iniciar();

    let base = estado;
    if (!base) {
      base = config.semilla === 'demo' ? buildSeedState() : estadoVacio();
      await almacen.guardarFoto(base);
    }

    // Los comandos posteriores a la última foto se vuelven a aplicar. Como
    // los identificadores que genera `applyCommand` se derivan del id del
    // comando, rehacerlos da exactamente el mismo resultado.
    const alDia = comandosDesdeFoto.length ? applyAll(base, comandosDesdeFoto) : base;
    if (comandosDesdeFoto.length) {
      console.log(`Rehechos ${comandosDesdeFoto.length} comandos posteriores a la última foto.`);
    }

    const servicio = new Servicio(almacen, config, alDia, comandosDesdeFoto.length);
    await servicio.prepararAcceso();
    return servicio;
  }

  /* ------------------------------------------------------------- acceso */

  /**
   * Deja el sistema en condiciones de que alguien pueda entrar.
   *
   * Con datos de ejemplo, todos los usuarios comparten una contraseña de
   * pruebas y se avisa por consola. En producción se crea (o se actualiza)
   * el administrador que venga en las variables de entorno; sin eso y sin
   * usuarios, nadie podría entrar nunca.
   */
  private async prepararAcceso() {
    const { config } = this;

    if (config.adminEmail && config.adminPassword) {
      const existente = this.estadoActual.users.find(
        (u) => u.email.toLowerCase() === config.adminEmail.toLowerCase()
      );
      const admin: User = existente ?? {
        id: 'u-admin',
        name: 'Administrador',
        role: 'admin',
        siteIds: [],
        email: config.adminEmail,
        active: true,
      };
      if (!existente) {
        this.estadoActual = { ...this.estadoActual, users: [...this.estadoActual.users, admin] };
        await this.almacen.guardarFoto(this.estadoActual);
      }
      await this.almacen.guardarCredencial({
        userId: admin.id,
        email: admin.email,
        hash: cifrarPassword(config.adminPassword),
      });
      console.log(`Administrador listo: ${admin.email}`);
      return;
    }

    if (await this.almacen.hayCredenciales()) return;

    if (config.produccion) {
      console.warn(
        'ATENCIÓN: no hay ninguna contraseña dada de alta y no se ha configurado ' +
          'URKIOLA_ADMIN_EMAIL / URKIOLA_ADMIN_PASSWORD. Nadie va a poder entrar.'
      );
      return;
    }

    for (const u of this.estadoActual.users) {
      await this.almacen.guardarCredencial({
        userId: u.id,
        email: u.email,
        hash: cifrarPassword(config.clavePruebas),
      });
    }
    console.warn(
      `MODO PRUEBAS: los ${this.estadoActual.users.length} usuarios de ejemplo entran con la ` +
        `contraseña "${config.clavePruebas}". No usar así con datos reales.`
    );
  }

  async login(email: unknown, password: unknown): Promise<{ token: string; user: User }> {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw malaPeticion('Hacen falta correo y contraseña.');
    }
    const clave = email.trim().toLowerCase();
    if (bloqueado(clave)) {
      throw demasiadosIntentos('Demasiados intentos. Prueba dentro de un rato.');
    }

    const credencial = await this.almacen.credencialPorEmail(clave);
    const user = credencial
      ? this.estadoActual.users.find((u) => u.id === credencial.userId)
      : undefined;

    // Un solo mensaje para «no existe» y «contraseña mal»: decir cuál de
    // las dos es sirve para averiguar qué correos existen.
    if (!credencial || !user || !user.active || !comprobarPassword(password, credencial.hash)) {
      anotarFallo(clave);
      throw noAutenticado('Correo o contraseña incorrectos.');
    }

    limpiarFallos(clave);
    return { token: emitirToken(user.id, this.config.secreto, this.config.sesionDias), user };
  }

  /** Usuario del token, o error 401. */
  usuarioDeToken(cabecera: string | undefined): User {
    const token = (cabecera ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) throw noAutenticado('Falta la sesión.');
    const sesion = leerToken(token, this.config.secreto);
    if (!sesion) throw noAutenticado('La sesión no vale o ha caducado.');
    const user = this.estadoActual.users.find((u) => u.id === sesion.sub);
    if (!user || !user.active) throw noAutenticado('Tu usuario ya no está activo.');
    return user;
  }

  async cambiarPassword(quien: User, objetivo: Id, actual: unknown, nueva: unknown) {
    if (typeof nueva !== 'string' || nueva.length < 8) {
      throw malaPeticion('La contraseña nueva tiene que tener al menos 8 caracteres.');
    }
    const esOtro = objetivo !== quien.id;
    if (esOtro) {
      const permiso = comprobarPermiso(this.estadoActual, quien, {
        type: 'user.upsert',
        id: 'comprobacion',
        at: new Date().toISOString(),
        userId: quien.id,
        user: quien,
      });
      if (permiso) throw sinPermiso('Solo un administrador cambia la contraseña de otra persona.');
    } else {
      const mia = await this.almacen.credencialPorUsuario(quien.id);
      if (!mia || typeof actual !== 'string' || !comprobarPassword(actual, mia.hash)) {
        throw noAutenticado('La contraseña actual no es correcta.');
      }
    }

    const user = this.estadoActual.users.find((u) => u.id === objetivo);
    if (!user) throw noEncontrado('Ese usuario no existe.');
    await this.almacen.guardarCredencial({
      userId: user.id,
      email: user.email,
      hash: cifrarPassword(nueva),
    });
  }

  /* ------------------------------------------------------------- estado */

  /** Estado completo, tal cual. Solo para uso interno y comprobaciones. */
  get estado(): AppState {
    return this.estadoActual;
  }

  /** El estado que le corresponde ver a este usuario. */
  estadoDe(user: User): AppState {
    return estadoPara(this.estadoActual, user, esColaboradorExterno(this.estadoActual, user));
  }

  /* ----------------------------------------------------------- comandos */

  /**
   * Aplica un comando.
   *
   * Se hace en fila india porque los comandos se construyen unos sobre
   * otros: crear la preparación tiene que estar antes de marcar su primer
   * requisito. Procesar dos a la vez sobre el mismo estado perdería uno.
   */
  async ejecutar(cuerpo: unknown, user: User): Promise<{ repetido: boolean }> {
    const anterior = this.cola;
    let liberar: () => void = () => {};
    this.cola = new Promise<void>((r) => {
      liberar = r;
    });
    await anterior.catch(() => {});
    try {
      return await this.ejecutarEnSerie(cuerpo, user);
    } finally {
      liberar();
    }
  }

  private async ejecutarEnSerie(cuerpo: unknown, user: User): Promise<{ repetido: boolean }> {
    const cmd: Command = validarComando(cuerpo, user.id);

    // Idempotencia: el móvil reintenta lo que no sabe si llegó.
    if (await this.almacen.yaAplicado(cmd.id)) return { repetido: true };

    const motivo = comprobarPermiso(this.estadoActual, user, cmd);
    if (motivo) throw sinPermiso(motivo);

    const antes = this.estadoActual;
    const despues = applyCommand(antes, cmd);

    // Primero se guarda, después se da por bueno. Al revés, una caída entre
    // las dos cosas dejaría al operario creyendo que su trabajo está
    // registrado cuando no lo está.
    this.desdeFoto += 1;
    const tocaFoto = this.desdeFoto >= COMANDOS_POR_FOTO;
    await this.almacen.anotarComando(cmd, despues, tocaFoto);
    if (tocaFoto) this.desdeFoto = 0;

    this.estadoActual = despues;

    if (this.config.push) {
      const nuevos = avisosNuevos(antes, despues);
      // Sin await: el aviso es un extra, el comando ya está guardado.
      void enviarAvisos(this.almacen, despues, nuevos);
    }

    return { repetido: false };
  }

  async registrarTokenPush(user: User, token: unknown) {
    if (typeof token !== 'string' || !token.startsWith('ExponentPushToken')) {
      throw malaPeticion('Token de avisos no válido.');
    }
    await this.almacen.guardarTokenPush({ userId: user.id, token, at: new Date().toISOString() });
  }

  async cerrar() {
    await this.cola.catch(() => {});
    await this.almacen.cerrar();
  }
}
