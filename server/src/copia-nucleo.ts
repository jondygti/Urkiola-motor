/**
 * Lo que de verdad hace una copia de seguridad, sin base de datos delante.
 *
 * Está aparte para poder probarlo: una copia de seguridad que nunca se ha
 * comprobado no es una copia, es una esperanza, y eso vale igual para el
 * programa que la hace.
 *
 * Los scripts `copia.ts` y `restaurar.ts` son la cáscara: leen de Postgres o
 * de un fichero y llaman aquí.
 */
import path from 'node:path';
import { applyAll, type Command } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import type { AppState } from '../../src/data/types';

export interface ResumenCopia {
  fecha: string;
  comandos: number;
  credenciales: number;
  fotos: number;
  bytesFotos: number;
  vehiculos: number;
  movimientos: number;
  solicitudes: number;
  preparaciones: number;
  fotosReferenciadas: number;
  fotosQueFaltan: string[];
  semilla: 'demo' | 'vacia';
  fotosEn: string;
}

/** Estado inicial vacío: sin coches ni usuarios, solo la configuración. */
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

/**
 * Rehace el estado aplicando los comandos de la copia.
 *
 * Es la comprobación de verdad: si esto revienta o da números absurdos, la
 * copia no sirve y hay que enterarse hoy, no el día que haga falta.
 */
export function rehacerEstado(comandos: Command[], semilla: 'demo' | 'vacia'): AppState {
  return applyAll(semilla === 'demo' ? buildSeedState() : estadoVacio(), comandos);
}

/**
 * Todas las fotos que el histórico menciona: tienen que estar en la copia.
 *
 * Se dejan fuera las del parque de ejemplo (`demo://foto-1`), que nunca
 * fueron un fichero: si contaran, una copia de un servidor de pruebas
 * avisaría de fotos perdidas que no existieron nunca, y un aviso que se
 * repite sin motivo deja de leerse.
 */
export function fotosReferenciadas(estado: AppState): Set<string> {
  const refs = new Set<string>();
  const real = (f: string) => !!f && !f.includes('://');
  const id = (f: string) => f.startsWith('foto:') ? f.slice('foto:'.length) : f;
  for (const i of estado.incidents) for (const f of i.photos ?? []) if (real(f)) refs.add(id(f));
  for (const p of estado.preparations) {
    const fotos = p.finalPhotos ? Object.values(p.finalPhotos) : [];
    for (const f of fotos) if (real(f)) refs.add(id(f));
  }
  for (const r of estado.receptions) {
    if (r.albaranUri && real(r.albaranUri)) refs.add(id(r.albaranUri));
    for (const l of r.lines) for (const f of l.photos ?? []) if (real(f)) refs.add(id(f));
  }
  return refs;
}

export function resumirCopia(entrada: {
  comandos: Command[];
  credenciales: unknown[];
  ficherosDeFoto: string[];
  bytesFotos: number;
  semilla: 'demo' | 'vacia';
  fotosEn: string;
  /** Con las fotos en Supabase, de copiarlas se encarga el proveedor. */
  fotosFuera?: boolean;
  fecha?: string;
}): ResumenCopia {
  const estado = rehacerEstado(entrada.comandos, entrada.semilla);
  const refs = fotosReferenciadas(estado);
  const ficherosFoto = entrada.ficherosDeFoto.filter((f) => !f.endsWith('.tipo'));
  const enCopia = new Set(ficherosFoto.map((f) => path.basename(f)));
  const faltan = entrada.fotosFuera
    ? []
    : [...refs].filter((ref) => !enCopia.has(path.basename(ref)));

  return {
    fecha: entrada.fecha ?? new Date().toISOString(),
    comandos: entrada.comandos.length,
    credenciales: entrada.credenciales.length,
    fotos: ficherosFoto.length,
    bytesFotos: entrada.bytesFotos,
    vehiculos: estado.vehicles.length,
    movimientos: estado.movements.length,
    solicitudes: estado.requests.length,
    preparaciones: estado.preparations.length,
    fotosReferenciadas: refs.size,
    fotosQueFaltan: faltan,
    semilla: entrada.semilla,
    fotosEn: entrada.fotosEn,
  };
}

/**
 * ¿Se puede confiar en esta copia?
 *
 * Devuelve los motivos por los que no. Vacío quiere decir que sí.
 */
export function problemasDeLaCopia(guardado: ResumenCopia, rehecho: ResumenCopia): string[] {
  const malo: string[] = [];
  if (guardado.comandos !== rehecho.comandos) {
    malo.push(
      `La copia dice ${guardado.comandos} comandos y el fichero trae ${rehecho.comandos}: está incompleta.`
    );
  }
  if (guardado.credenciales !== rehecho.credenciales) {
    malo.push(
      `La copia dice ${guardado.credenciales} contraseñas y el fichero trae ${rehecho.credenciales}.`
    );
  }
  if (guardado.vehiculos !== rehecho.vehiculos) {
    malo.push(
      `Al rehacerla salen ${rehecho.vehiculos} vehículos y la copia decía ${guardado.vehiculos}: ` +
        'las reglas de negocio han cambiado desde que se hizo.'
    );
  }
  return malo;
}
