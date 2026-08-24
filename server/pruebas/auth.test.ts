/** Contraseñas y sesiones. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anotarFallo,
  bloqueado,
  cifrarPassword,
  comprobarPassword,
  emitirToken,
  leerToken,
  limpiarFallos,
} from '../src/auth';

test('la contraseña no se guarda en claro y se puede comprobar', () => {
  const guardado = cifrarPassword('una-contraseña-larga');
  assert.ok(!guardado.includes('una-contraseña-larga'));
  assert.ok(guardado.startsWith('scrypt$'));
  assert.equal(comprobarPassword('una-contraseña-larga', guardado), true);
  assert.equal(comprobarPassword('otra-cosa', guardado), false);
});

test('dos veces la misma contraseña da hashes distintos (sal)', () => {
  assert.notEqual(cifrarPassword('igual'), cifrarPassword('igual'));
});

test('un hash con formato raro no cuela', () => {
  assert.equal(comprobarPassword('x', 'cualquier-cosa'), false);
  assert.equal(comprobarPassword('x', ''), false);
});

test('el token identifica al usuario y caduca', () => {
  const token = emitirToken('u-pedro', 'secreto', 30);
  const sesion = leerToken(token, 'secreto');
  assert.equal(sesion?.sub, 'u-pedro');

  const caducado = emitirToken('u-pedro', 'secreto', -1);
  assert.equal(leerToken(caducado, 'secreto'), null);
});

test('un token firmado con otro secreto no vale', () => {
  const token = emitirToken('u-pedro', 'secreto', 30);
  assert.equal(leerToken(token, 'otro-secreto'), null);
});

test('un token manipulado no vale', () => {
  const token = emitirToken('u-pedro', 'secreto', 30);
  const [cabecera, , sello] = token.split('.');
  const otroCuerpo = Buffer.from(
    JSON.stringify({ sub: 'u-admin', iat: 0, exp: 9_999_999_999 })
  ).toString('base64url');
  assert.equal(leerToken(`${cabecera}.${otroCuerpo}.${sello}`, 'secreto'), null);
});

test('el truco de alg: none no cuela', () => {
  const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const cuerpo = Buffer.from(JSON.stringify({ sub: 'u-admin', exp: 9_999_999_999 })).toString(
    'base64url'
  );
  assert.equal(leerToken(`${cabecera}.${cuerpo}.`, 'secreto'), null);
});

test('tras varios fallos seguidos se bloquea un rato', () => {
  const clave = 'prueba@urkiolacarservice.com';
  limpiarFallos(clave);
  for (let i = 0; i < 9; i++) anotarFallo(clave);
  assert.equal(bloqueado(clave), false);
  anotarFallo(clave);
  assert.equal(bloqueado(clave), true);
  limpiarFallos(clave);
  assert.equal(bloqueado(clave), false);
});
