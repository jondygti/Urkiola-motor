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
import { conflictoSolicitud, applyAll, applyCommand, type Command } from '../../src/data/commands';
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
import { TIPOS_FOTO, type AlmacenFotos, type Foto } from './almacen/fotos';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Correo } from './correo';
import {
  ErrorHttp,
  demasiadosIntentos,
  malaPeticion,
  noAutenticado,
  noEncontrado,
  sinPermiso,
} from './errores';

/**
 * Un hash de mentira, para gastar el mismo tiempo cuando el correo no
 * existe que cuando sí. Se calcula una vez al arrancar.
 */
const HASH_DE_RELLENO = cifrarPassword('relleno-para-igualar-el-tiempo');

/** El código del correo se guarda hasheado, nunca tal cual. */
const hashDeCodigo = (codigo: string) => createHash('sha256').update(codigo).digest('hex');

/**
 * Lo mínimo que se le pide a una contraseña.
 *
 * Doce caracteres y que no sea de las cuatro de siempre. No se piden
 * mayúsculas ni símbolos a propósito: eso lleva a «Urkiola1!» apuntado en
 * un pósit, que es peor que una frase larga.
 */
const PEORES = ['urkiola', 'contrasena', 'contraseña', '123456', 'password', 'qwerty', 'abc123'];

function comprobarFortaleza(nueva: unknown): asserts nueva is string {
  if (typeof nueva !== 'string' || nueva.trim().length < 12) {
    throw malaPeticion('La contraseña tiene que tener al menos 12 caracteres. Una frase corta vale.');
  }
  const limpia = nueva.trim().toLowerCase();
  if (PEORES.some((p) => limpia.includes(p))) {
    throw malaPeticion('Esa contraseña es demasiado fácil de adivinar. Prueba con otra cosa.');
  }
}

/** Estado inicial vacío: sin coches, sin usuarios salvo el administrador. */
export function estadoVacio(): AppState {
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
  /**
   * Cuándo cambió cada uno su contraseña, en segundos.
   *
   * Se lleva en memoria para poder comprobarlo sin ir a la base de datos en
   * cada petición: es lo que permite que una sesión abierta en un móvil
   * perdido deje de valer en cuanto se cambia la contraseña.
   */
  private cambiadaEn = new Map<Id, number>();

  private constructor(
    private readonly almacen: Almacen,
    private readonly config: Config,
    estado: AppState,
    desdeFoto: number,
    private readonly fotos: AlmacenFotos,
    private readonly correo: Correo
  ) {
    this.estadoActual = estado;
    this.desdeFoto = desdeFoto;
  }

  static async crear(
    almacen: Almacen,
    config: Config,
    fotos: AlmacenFotos,
    correo: Correo
  ): Promise<Servicio> {
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

    const servicio = new Servicio(almacen, config, alDia, comandosDesdeFoto.length, fotos, correo);
    await servicio.prepararAcceso();
    await servicio.cargarCambiosDeContrasena();
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
      // La variable crea el primer acceso; un reinicio no debe deshacer
      // una contraseña que el administrador haya cambiado después.
      if (!(await this.almacen.credencialPorUsuario(admin.id))) {
        await this.guardarCredencial(admin.id, admin.email, config.adminPassword);
      }
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
      await this.guardarCredencial(u.id, u.email, config.clavePruebas);
    }
    console.warn(
      `MODO PRUEBAS: los ${this.estadoActual.users.length} usuarios de ejemplo entran con la ` +
        `contraseña "${config.clavePruebas}". No usar así con datos reales.`
    );
  }

  /** Guarda la contraseña y tira las sesiones abiertas de esa persona. */
  private async guardarCredencial(userId: Id, email: string, password: string) {
    const cambiadaEn = new Date().toISOString();
    await this.almacen.guardarCredencial({
      userId,
      email,
      hash: cifrarPassword(password),
      cambiadaEn,
    });
    this.cambiadaEn.set(userId, Math.floor(new Date(cambiadaEn).getTime() / 1000));
  }

  /** Al arrancar, cuándo cambió cada uno su contraseña. */
  private async cargarCambiosDeContrasena() {
    for (const u of this.estadoActual.users) {
      const c = await this.almacen.credencialPorUsuario(u.id);
      if (c?.cambiadaEn) {
        this.cambiadaEn.set(u.id, Math.floor(new Date(c.cambiadaEn).getTime() / 1000));
      }
    }
  }

  async login(email: unknown, password: unknown): Promise<{ token: string; user: User }> {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw malaPeticion('Hacen falta correo y contraseña.');
    }
    const clave = email.trim().toLowerCase();
    if (bloqueado(clave)) {
      throw demasiadosIntentos('Demasiados intentos. Prueba dentro de un rato.');
    }

    const user = this.estadoActual.users.find((u) => u.email.trim().toLowerCase() === clave);
    const credencial = user ? await this.almacen.credencialPorUsuario(user.id) : undefined;

    // La comprobación se hace SIEMPRE, exista el correo o no. Si solo se
    // hiciera cuando existe, contestar antes o después diría cuáles existen:
    // comprobar una contraseña cuesta un tiempo que se nota.
    const correcta = comprobarPassword(password, credencial?.hash ?? HASH_DE_RELLENO);

    // Un solo mensaje para «no existe» y «contraseña mal»: decir cuál de
    // las dos es sirve para averiguar qué correos existen.
    if (!credencial || !user || !user.active || !correcta) {
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

    // Si la contraseña se cambió después de emitir esta sesión, la sesión ya
    // no vale: es lo que se espera al cambiarla porque te han robado el
    // móvil o crees que alguien la ha visto.
    const cambiada = this.cambiadaEn.get(user.id);
    if (cambiada !== undefined && sesion.iat < cambiada) {
      throw noAutenticado('Se ha cambiado la contraseña de esta cuenta. Vuelve a entrar.');
    }
    return user;
  }

  async cambiarPassword(quien: User, objetivo: Id, actual: unknown, nueva: unknown) {
    comprobarFortaleza(nueva);
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
    await this.guardarCredencial(user.id, user.email, nueva);
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

  /** El reloj del servidor funciona aunque todos los móviles estén cerrados. */
  async barrerAvisos(at = new Date().toISOString()): Promise<void> {
    const persona = this.estadoActual.users.find((u) => u.active &&
      !esColaboradorExterno(this.estadoActual, u));
    if (!persona) return;
    // Un barrido por hora es suficiente para umbrales de 24/72 h y evita
    // llenar el histórico con 60 comandos idénticos cada hora.
    await this.ejecutar({ type: 'alerts.sweep', id: `reloj-${at.slice(0, 13)}`, at, userId: persona.id }, persona);
  }

  private async ejecutarEnSerie(cuerpo: unknown, user: User): Promise<{ repetido: boolean }> {
    const cmd: Command = validarComando(cuerpo, user.id);

    // Idempotencia: el móvil reintenta lo que no sabe si llegó.
    if (await this.almacen.yaAplicado(cmd.id)) return { repetido: true };

    const motivo = comprobarPermiso(this.estadoActual, user, cmd);
    if (motivo) throw sinPermiso(motivo);

    if (cmd.type === 'user.upsert') {
      const correo = cmd.user.email?.trim().toLowerCase();
      if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw malaPeticion('Revisa el correo del usuario.');
      if (this.estadoActual.users.some((u) => u.id !== cmd.user.id && u.email.trim().toLowerCase() === correo)) {
        throw malaPeticion('Ya hay un usuario con ese correo.');
      }
      if (!this.estadoActual.config.roles.some((r) => r.id === cmd.user.role)) throw malaPeticion('Ese rol no existe.');
    }

    if (cmd.type === 'request.update' && cmd.status !== 'terminada') {
      const r = this.estadoActual.requests.find(r => r.id === cmd.requestId);
      if (r?.status === 'terminada') {
        const conflicto = conflictoSolicitud(this.estadoActual, { requestType: r.type, vehicleId: r.vehicleId, siteId: r.siteId, prepTipo: r.prepTipo });
        if (conflicto) throw malaPeticion(conflicto);
      }
    }
    if (cmd.type === 'request.create') {
      const conflicto = conflictoSolicitud(this.estadoActual, cmd);
      if (conflicto) throw malaPeticion(conflicto);
      if (cmd.carrierId && !this.estadoActual.carriers.some(c => c.id === cmd.carrierId && c.active)) throw malaPeticion('Empresa de transporte no válida.');
    }
    const comprobarFotosSubidas = async (refs: string[]) => {
      for (const ref of refs) {
        if (!ref.startsWith('foto:')) {
          throw malaPeticion('La evidencia fotográfica tiene que estar subida al servidor.');
        }
        const id = ref.slice('foto:'.length);
        if (!id || !(await this.fotos.leer(id))) {
          throw malaPeticion('Falta una foto en el almacenamiento. Vuelve a subirla antes de continuar.');
        }
      }
    };

    if (cmd.type === 'prep.finish') {
      const p = this.estadoActual.preparations.find((x) => x.id === cmd.prepId);
      if (!p) throw malaPeticion('Preparación inexistente.');
      const fotos = cmd.finalPhotos;
      const refs = fotos ? [fotos.frontLeft, fotos.frontRight, fotos.rearLeft, fotos.rearRight] : [];
      if (refs.length !== 4) throw malaPeticion('Para terminar hacen falta las cuatro fotos finales.');
      await comprobarFotosSubidas(refs);
    }
    if (cmd.type === 'incident.create') await comprobarFotosSubidas(cmd.photos);
    if (cmd.type === 'reception.line' && cmd.photos?.length) await comprobarFotosSubidas(cmd.photos);
    if (cmd.type === 'reception.albaran') await comprobarFotosSubidas([cmd.uri]);
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

  /** Render usa esto para no enviar tráfico a una instancia sin base de datos. */
  async salud(): Promise<void> {
    await this.almacen.salud();
  }

  /* ------------------------------------------- restablecer contraseña */

  /**
   * Manda el enlace para poner una contraseña nueva.
   *
   * Contesta lo mismo exista el correo o no. Decir «ese correo no está» le
   * regala a cualquiera la lista de quién trabaja aquí, y con eso se empieza
   * a probar contraseñas.
   */
  async pedirEnlace(email: unknown): Promise<void> {
    if (typeof email !== 'string' || !email.includes('@')) return;
    const clave = email.trim().toLowerCase();

    // El mismo freno que en el acceso: que nadie use esto para tantear
    // correos ni para llenar de mensajes el buzón de alguien.
    if (bloqueado(`enlace:${clave}`)) return;
    anotarFallo(`enlace:${clave}`);

    // También sirve para el primer acceso: el alta del usuario no guarda
    // contraseñas en el histórico de comandos ni exige una ya existente.
    const user = this.estadoActual.users.find((u) => u.email.trim().toLowerCase() === clave);
    if (!user || !user.active) return;

    const codigo = randomBytes(32).toString('base64url');
    await this.almacen.guardarEnlace({
      hash: hashDeCodigo(codigo),
      userId: user.id,
      caduca: new Date(Date.now() + this.config.minutosEnlace * 60_000).toISOString(),
    });

    const enlace = `${this.config.urlPublica}/restablecer?codigo=${encodeURIComponent(codigo)}`;
    const minutos = this.config.minutosEnlace;
    await this.correo
      .enviar(
        user.email,
        'Cambiar tu contraseña de Urkiola Car Service',
        `Hola ${user.name.split(' ')[0]}:\n\n` +
          `Alguien ha pedido cambiar la contraseña de tu cuenta. Si has sido tú, abre este enlace:\n\n` +
          `${enlace}\n\n` +
          `Vale durante ${minutos} minutos y una sola vez.\n\n` +
          `Si no has sido tú, no hace falta que hagas nada: tu contraseña sigue como estaba.\n`
      )
      .catch((e) => {
        // Que falle el correo no puede tumbar la petición ni contar nada a
        // quien la hizo; queda en el registro para mirarlo.
        console.error('No se ha podido mandar el correo de restablecer:', e);
      });
  }

  /** Cambia la contraseña con el código del correo. */
  async restablecer(codigo: unknown, nueva: unknown): Promise<void> {
    if (typeof codigo !== 'string' || codigo.length < 20) {
      throw malaPeticion('Ese enlace no vale.');
    }
    comprobarFortaleza(nueva);

    const enlace = await this.almacen.gastarEnlace(hashDeCodigo(codigo));
    if (!enlace) {
      throw new ErrorHttp(410, 'Ese enlace ya se ha usado o ha caducado. Pide otro.');
    }
    const user = this.estadoActual.users.find((u) => u.id === enlace.userId);
    if (!user || !user.active) throw new ErrorHttp(410, 'Ese enlace ya no vale.');

    await this.guardarCredencial(user.id, user.email, nueva as string);
    // Y se tira cualquier otro enlace pendiente de esa cuenta.
    await this.almacen.borrarEnlacesDe(user.id);
    limpiarFallos(user.email.toLowerCase());
    console.log(`Contraseña restablecida por enlace: ${user.id}`);
  }

  /* -------------------------------------------------------------- fotos */

  /**
   * Guarda una foto y devuelve su referencia.
   *
   * El identificador es aleatorio y largo a propósito: aunque la lectura
   * exige sesión, una dirección adivinable sería una puerta de más.
   */
  async guardarFoto(cuerpo: Buffer, tipo: string): Promise<string> {
    const limpio = (tipo ?? '').split(';')[0].trim().toLowerCase();
    if (!TIPOS_FOTO[limpio]) {
      throw malaPeticion(`Ese tipo de fichero no se acepta (${limpio || 'sin tipo'}).`);
    }
    if (cuerpo.length === 0) throw malaPeticion('La foto está vacía.');
    if (cuerpo.length > this.config.maxFotoBytes) {
      throw malaPeticion(
        `La foto pesa demasiado (máximo ${Math.round(this.config.maxFotoBytes / 1024 / 1024)} MB).`
      );
    }

    const id = `${randomBytes(24).toString('base64url')}.${TIPOS_FOTO[limpio]}`;
    await this.fotos.guardar(id, { cuerpo, tipo: limpio });
    return id;
  }

  /** Lee una foto. Quien la pide ya ha demostrado tener sesión. */
  async leerFoto(id: string): Promise<Foto> {
    const foto = await this.fotos.leer(id);
    if (!foto) throw noEncontrado('Esa foto ya no está.');
    return foto;
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
