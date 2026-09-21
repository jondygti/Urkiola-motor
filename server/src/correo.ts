/**
 * Envío de correo.
 *
 * Solo se usa para una cosa: el enlace para restablecer la contraseña. Por
 * eso no hay plantillas ni cola de envío, y la interfaz es una función.
 *
 * Dos implementaciones:
 *
 * - **registro**: lo escribe en la consola. Es lo que se usa en local y en
 *   las comprobaciones; el enlace sale por pantalla y se puede copiar.
 * - **http**: lo manda por la API de un proveedor (Resend por defecto, que
 *   es un `POST` con una clave). Cambiar de proveedor es cambiar la
 *   dirección y el cuerpo, aquí, en un sitio.
 *
 * Si no hay proveedor configurado en producción, el servidor arranca igual
 * pero avisa: mejor que no arranque nada por no poder mandar un correo.
 */
export interface Correo {
  enviar(a: string, asunto: string, texto: string): Promise<void>;
}

export class CorreoEnRegistro implements Correo {
  async enviar(a: string, asunto: string, texto: string) {
    console.log(
      `\n─── CORREO (no se manda de verdad: no hay proveedor configurado) ───\n` +
        `Para: ${a}\nAsunto: ${asunto}\n\n${texto}\n───────────────────────────────────────────────\n`
    );
  }
}

export class CorreoHttp implements Correo {
  constructor(
    private readonly url: string,
    private readonly clave: string,
    private readonly remitente: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000
  ) {}

  async enviar(a: string, asunto: string, texto: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.clave}` },
        body: JSON.stringify({ from: this.remitente, to: [a], subject: asunto, text: texto }),
      });
      if (!res.ok) {
        throw new Error(`El proveedor de correo devolvió ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error('El proveedor de correo no ha respondido a tiempo.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
