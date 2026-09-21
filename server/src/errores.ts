/**
 * Errores con código HTTP.
 *
 * La app conserva los rechazos definitivos para revisarlos, pausa con 401
 * hasta recuperar la sesión y reintenta los fallos temporales. Devolver
 * 400 por un fallo nuestro detiene un movimiento que sí se hizo.
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
export const temporalmenteNoDisponible = (m: string) => new ErrorHttp(503, m);
