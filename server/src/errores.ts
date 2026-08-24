/**
 * Errores con código HTTP.
 *
 * El código importa mucho más de lo que parece: la app **descarta** el
 * trabajo del operario ante un 4xx y lo **reintenta** ante un 5xx. Devolver
 * 400 por un fallo nuestro le borra a alguien un movimiento que sí hizo.
 * Ante la duda, 500.
 */
export class ErrorHttp extends Error {
  constructor(readonly codigo: number, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorHttp';
  }
}

export const malaPeticion = (m: string) => new ErrorHttp(400, m);
export const noAutenticado = (m = 'Sesión no válida.') => new ErrorHttp(401, m);
export const sinPermiso = (m: string) => new ErrorHttp(403, m);
export const noEncontrado = (m = 'No existe.') => new ErrorHttp(404, m);
export const demasiadosIntentos = (m: string) => new ErrorHttp(429, m);
