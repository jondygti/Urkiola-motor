import test from 'node:test';
import assert from 'node:assert/strict';
import { AlmacenPostgres } from '../src/almacen/postgres';

const url = process.env.URKIOLA_TEST_DATABASE_URL;

test('una instancia nueva releva a la anterior sin dos líderes a la vez', { skip: !url }, async () => {
  const anterior = new AlmacenPostgres(url!, 5_000);
  const nueva = new AlmacenPostgres(url!, 5_000);

  try {
    await anterior.iniciar();

    let drenada = false;
    anterior.alPedirRelevo(async () => {
      drenada = true;
    });

    await nueva.iniciar();

    assert.equal(drenada, true, 'la instancia anterior recibió y atendió el relevo');
    await assert.rejects(
      () => anterior.salud(),
      /liderazgo/i,
      'la instancia anterior ya no puede anunciarse como saludable'
    );
    await nueva.salud();
  } finally {
    await Promise.allSettled([anterior.cerrar(), nueva.cerrar()]);
  }
});
