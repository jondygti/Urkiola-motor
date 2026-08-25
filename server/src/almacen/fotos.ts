/**
 * Dónde se guardan las fotos.
 *
 * Las de daños son la prueba para reclamar al transportista, así que no
 * pueden vivir en el móvil de quien las hizo: se suben antes de mandar el
 * comando y el comando guarda solo la referencia.
 *
 * Dos implementaciones detrás de la misma interfaz:
 *
 * - **fichero**: un directorio en disco. Para trabajar en local y para las
 *   comprobaciones automáticas, sin contratar nada.
 * - **supabase**: Supabase Storage por su API HTTP, que es la que se va a
 *   usar en producción. Sin SDK: son dos llamadas.
 *
 * Las fotos NUNCA se sirven directamente desde el almacén: siempre pasan
 * por la API, que es donde se comprueba quién las pide. Cuesta un salto de
 * más y a este volumen no se nota.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export interface Foto {
  cuerpo: Buffer;
  tipo: string;
}

export interface AlmacenFotos {
  guardar(id: string, foto: Foto): Promise<void>;
  leer(id: string): Promise<Foto | null>;
  borrar(id: string): Promise<void>;
}

/** Tipos que se aceptan. Lo que no esté aquí no entra. */
export const TIPOS_FOTO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/* ----------------------------------------------------------- en disco */

export class FotosEnFichero implements AlmacenFotos {
  constructor(private readonly carpeta: string) {}

  private ruta(id: string) {
    // El id no viene de fuera (lo genera el servidor), pero por si acaso:
    // nada de subir por el árbol de directorios.
    return path.join(this.carpeta, path.basename(id));
  }

  async guardar(id: string, foto: Foto) {
    await fs.mkdir(this.carpeta, { recursive: true });
    await fs.writeFile(this.ruta(id), foto.cuerpo);
    await fs.writeFile(`${this.ruta(id)}.tipo`, foto.tipo, 'utf8');
  }

  async leer(id: string) {
    try {
      const cuerpo = await fs.readFile(this.ruta(id));
      const tipo = await fs.readFile(`${this.ruta(id)}.tipo`, 'utf8').catch(() => 'image/jpeg');
      return { cuerpo, tipo };
    } catch {
      return null;
    }
  }

  async borrar(id: string) {
    await fs.rm(this.ruta(id), { force: true });
    await fs.rm(`${this.ruta(id)}.tipo`, { force: true });
  }
}

/* --------------------------------------------------------- Supabase */

export class FotosEnSupabase implements AlmacenFotos {
  constructor(
    private readonly url: string,
    private readonly clave: string,
    private readonly bucket: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private endpoint(id: string) {
    return `${this.url.replace(/\/+$/, '')}/storage/v1/object/${this.bucket}/${encodeURIComponent(id)}`;
  }

  private get cabeceras() {
    // La clave de servicio, que solo vive en el servidor. Si esta clave
    // acabara en la app, cualquiera podría leer el bucket entero.
    return { Authorization: `Bearer ${this.clave}`, apikey: this.clave };
  }

  async guardar(id: string, foto: Foto) {
    const res = await this.fetchImpl(this.endpoint(id), {
      method: 'POST',
      headers: { ...this.cabeceras, 'Content-Type': foto.tipo, 'x-upsert': 'true' },
      body: new Uint8Array(foto.cuerpo),
    });
    if (!res.ok) {
      throw new Error(`Supabase Storage devolvió ${res.status} al guardar la foto: ${await res.text()}`);
    }
  }

  async leer(id: string) {
    const res = await this.fetchImpl(this.endpoint(id), { headers: this.cabeceras });
    if (!res.ok) return null;
    return {
      cuerpo: Buffer.from(await res.arrayBuffer()),
      tipo: res.headers.get('content-type') ?? 'image/jpeg',
    };
  }

  async borrar(id: string) {
    await this.fetchImpl(this.endpoint(id), { method: 'DELETE', headers: this.cabeceras }).catch(
      () => undefined
    );
  }
}
