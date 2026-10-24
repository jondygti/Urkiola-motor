import test from 'node:test';
import assert from 'node:assert/strict';
import { bastidoresEn, leerTexto, matriculasEn } from '../../src/data/lectura';

test('el bastidor del parabrisas, aunque venga partido o con O e I', () => {
  assert.deepEqual(bastidoresEn(['VF3MCYHZRKS123456']), ['VF3MCYHZRKS123456']);
  assert.deepEqual(bastidoresEn(['VIN: VF3 MCYHZ RKS123456']), ['VF3MCYHZRKS123456']);
  // Partido en dos líneas.
  assert.deepEqual(bastidoresEn(['VF3MCYHZR', 'KS123456']), ['VF3MCYHZRKS123456']);
  // Un VIN no lleva O, I ni Q: el lector las confunde con 0 y 1.
  assert.deepEqual(bastidoresEn(['WVWZZZ1KZAW1O2345']), ['WVWZZZ1KZAW102345']);
  assert.deepEqual(bastidoresEn(['VF1RFBOOX6I234567']), ['VF1RFB00X61234567']);
});

test('lo que no es un bastidor no lo parece', () => {
  // 17 cifras: un teléfono o un código de pegatina.
  assert.deepEqual(bastidoresEn(['12345678901234567']), []);
  // Texto de una pegatina de la ITV.
  assert.deepEqual(bastidoresEn(['INSPECCION TECNICA DE VEHICULOS', 'PROXIMA 05/2027']), []);
  // Uno más largo no se trocea en varios.
  assert.deepEqual(bastidoresEn(['XVF3MCYHZRKS123456']), []);
});

test('matrículas actuales y antiguas', () => {
  assert.deepEqual(matriculasEn(['6412 NPV']), ['6412 NPV']);
  // Pegada a la E de la franja azul, o con guion.
  assert.deepEqual(matriculasEn(['E 6412NPV']), ['6412 NPV']);
  assert.deepEqual(matriculasEn(['E6412-NPV']), ['6412 NPV']);
  assert.deepEqual(matriculasEn(['bi-1234-ab']), ['BI-1234-AB']);
  // Con vocales no es una matrícula actual.
  assert.deepEqual(matriculasEn(['1234 ABC']), []);
  // Un número de serie no tiene por qué ser una matrícula.
  assert.deepEqual(matriculasEn(['REF 12345678']), []);
});

test('de todo el texto del parabrisas, lo que interesa', () => {
  const r = leerTexto(['PEUGEOT', 'VF3MCYHZRKS123456', 'ITV 05/2027', 'E 6412 NPV']);
  assert.deepEqual(r.bastidores, ['VF3MCYHZRKS123456']);
  assert.deepEqual(r.matriculas, ['6412 NPV']);
});
