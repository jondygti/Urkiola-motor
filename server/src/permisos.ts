/**
 * Los permisos del servidor son los de `src/data/permisos.ts`: la misma
 * regla que usa la app para decir, antes de una acción en bloque, qué coches
 * no la admiten. Aquí solo se reexporta, para que el servidor siga
 * importándola de donde siempre.
 */
export * from '../../src/data/permisos';
