/**
 * Utilidades comunes de las comprobaciones.
 *
 * Cada prueba arranca un servidor limpio con su propio fichero de datos en
 * una carpeta temporal, así que no se pisan entre ellas ni dejan rastro.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AlmacenFichero } from '../src/almacen/fichero';
import { leerConfig, type Config } from '../src/config';
import { Servicio } from '../src/servicio';
import type { Command } from '../../src/data/commands';

export const CLAVE = 'urkiola';

export function carpetaTemporal(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'urkiola-'));
}

export function configPruebas(extra: Partial<Config> = {}): Config {
  const base = leerConfig({
    JWT_SECRET: 'secreto-de-pruebas',
    URKIOLA_SEMILLA: 'demo',
    EXPO_PUSH: '0',
  });
  return { ...base, ...extra };
}

export async function servidorDePruebas(extra: Partial<Config> = {}) {
  const dir = carpetaTemporal();
  const fichero = path.join(dir, 'estado.json');
  const config = configPruebas({ ficheroDatos: fichero, ...extra });
  const almacen = new AlmacenFichero(fichero);
  const servicio = await Servicio.crear(almacen, config);
  return {
    servicio,
    config,
    fichero,
    /** Vuelve a arrancar leyendo del mismo fichero: simula un reinicio. */
    reiniciar: async () => {
      await servicio.cerrar();
      return Servicio.crear(new AlmacenFichero(fichero), config);
    },
    limpiar: async () => {
      await servicio.cerrar();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

let n = 0;
/** Comando de prueba con id previsible. */
export function cmd<T extends Command['type']>(
  type: T,
  datos: Record<string, unknown> = {},
  meta: { id?: string; at?: string; userId?: string } = {}
): Command {
  n += 1;
  return {
    type,
    id: meta.id ?? `cmd-prueba-${n}`,
    at: meta.at ?? new Date().toISOString(),
    userId: meta.userId ?? 'u-log',
    ...datos,
  } as Command;
}
