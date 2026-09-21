/** Contraseñas y sesiones. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePruebas, CLAVE } from './ayuda';
import { ErrorHttp } from '../src/errores';
import {
  MAX_POR_ORIGEN,
  anotarFallo,
  bloqueado,
  cifrarPassword,
  comprobarPassword,
  emitirToken,
  emitirTokenFoto,
  leerToken,
  leerTokenFoto,
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

test('el token de evidencia solo vale para una foto y no sirve como sesión general', () => {
  const capacidad = emitirTokenFoto('u-pedro', 'abc.png', 'secreto', 5);
  const acceso = leerTokenFoto(capacidad, 'abc.png', 'secreto');
  assert.equal(acceso?.sub, 'u-pedro');
  assert.equal(acceso?.foto, 'abc.png');
  assert.equal(leerTokenFoto(capacidad, 'otra.png', 'secreto'), null);
  assert.equal(leerToken(capacidad, 'secreto'), null, 'una capacidad de foto no abre una sesión general');
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

/* --------------------------------- restablecer la contraseña por correo */

test('el enlace del correo permite poner una contraseña nueva', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  await p.servicio.pedirEnlace('pedro@urkiolacarservice.com');
  const correo = p.correo.enviados.at(-1);
  assert.equal(correo?.a, 'pedro@urkiolacarservice.com');
  assert.match(correo?.texto ?? '', /codigo=/);

  const codigo = p.correo.ultimoCodigo()!;
  await p.servicio.restablecer(codigo, 'la nueva de pedro');

  // La vieja ya no vale y la nueva sí.
  await assert.rejects(() => p.servicio.login('pedro@urkiolacarservice.com', CLAVE));
  const { user } = await p.servicio.login('pedro@urkiolacarservice.com', 'la nueva de pedro');
  assert.equal(user.id, 'u-pedro');
});

test('un enlace solo vale una vez', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  await p.servicio.pedirEnlace('pedro@urkiolacarservice.com');
  const codigo = p.correo.ultimoCodigo()!;
  await p.servicio.restablecer(codigo, 'la primera vez si vale');

  await assert.rejects(
    () => p.servicio.restablecer(codigo, 'la segunda ya no'),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 410
  );
});

test('pedir otro enlace invalida el anterior', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  await p.servicio.pedirEnlace('ane@urkiolacarservice.com');
  const primero = p.correo.ultimoCodigo()!;
  await p.servicio.pedirEnlace('ane@urkiolacarservice.com');
  const segundo = p.correo.ultimoCodigo()!;
  assert.notEqual(primero, segundo);

  await assert.rejects(
    () => p.servicio.restablecer(primero, 'con el viejo no'),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 410
  );
  await p.servicio.restablecer(segundo, 'con el nuevo si vale');
});

test('un enlace caducado no vale', async (t) => {
  const p = await servidorDePruebas({ minutosEnlace: -1 });
  t.after(() => p.limpiar());

  await p.servicio.pedirEnlace('ane@urkiolacarservice.com');
  await assert.rejects(
    () => p.servicio.restablecer(p.correo.ultimoCodigo()!, 'ya es tarde para esto'),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 410
  );
});

test('un código inventado no vale, y no dice por qué', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  await assert.rejects(
    () => p.servicio.restablecer('a'.repeat(43), 'una frase larga de acceso'),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 410
  );
});

test('pedir el enlace de un correo que no existe no cuenta nada', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  await p.servicio.pedirEnlace('nadie@urkiolacarservice.com');
  await p.servicio.pedirEnlace('no-es-un-correo');
  assert.equal(p.correo.enviados.length, 0, 'no se manda nada');
  // Y no lanza: desde fuera, indistinguible de un correo que sí existe.
});

test('la contraseña nueva tiene que ser decente', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  for (const mala of ['corta', 'urkiola2026', '123456789012', 'password1234']) {
    await p.servicio.pedirEnlace('ane@urkiolacarservice.com');
    await assert.rejects(
      () => p.servicio.restablecer(p.correo.ultimoCodigo()!, mala),
      (e: unknown) => e instanceof ErrorHttp && e.codigo === 400,
      `debería rechazar "${mala}"`
    );
  }
});

test('un usuario desactivado no puede restablecer su contraseña', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());
  const { user: admin } = await p.servicio.login('admin@urkiolacarservice.com', CLAVE);

  await p.servicio.pedirEnlace('ane@urkiolacarservice.com');
  const codigo = p.correo.ultimoCodigo()!;

  const ane = p.servicio.estado.users.find((u) => u.id === 'u-ane')!;
  await p.servicio.ejecutar(
    {
      type: 'user.upsert',
      id: 'cmd-baja-ane',
      at: new Date().toISOString(),
      userId: admin.id,
      user: { ...ane, active: false },
    },
    admin
  );

  await assert.rejects(
    () => p.servicio.restablecer(codigo, 'una frase larga y decente'),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 410
  );
});

/* ------------------------------------------------- sesiones y frenos */

test('cambiar la contraseña tira las sesiones abiertas en otros sitios', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  // Ane entra en su móvil.
  const { token } = await p.servicio.login('ane@urkiolacarservice.com', CLAVE);
  assert.equal(p.servicio.usuarioDeToken(`Bearer ${token}`).id, 'u-ane');

  // Se lo roban y cambia la contraseña desde otro sitio.
  await new Promise((r) => setTimeout(r, 1100));
  await p.servicio.pedirEnlace('ane@urkiolacarservice.com');
  await p.servicio.restablecer(p.correo.ultimoCodigo()!, 'me han robado el movil');

  // La sesión del móvil perdido deja de valer.
  assert.throws(
    () => p.servicio.usuarioDeToken(`Bearer ${token}`),
    (e: unknown) => e instanceof ErrorHttp && e.codigo === 401
  );

  // Y la nueva sesión sí vale.
  const nueva = await p.servicio.login('ane@urkiolacarservice.com', 'me han robado el movil');
  assert.equal(p.servicio.usuarioDeToken(`Bearer ${nueva.token}`).id, 'u-ane');
});

test('el freno por dirección aguanta una oficina entera entrando', () => {
  const clave = 'ip:192.168.1.1';
  limpiarFallos(clave);
  // Muchos accesos correctos no cuentan; solo los fallos, y con margen.
  for (let i = 0; i < 30; i++) anotarFallo(clave);
  assert.equal(bloqueado(clave, MAX_POR_ORIGEN), false, '30 fallos todavía no bloquean una oficina');
  for (let i = 0; i < 31; i++) anotarFallo(clave);
  assert.equal(bloqueado(clave, MAX_POR_ORIGEN), true, 'a los 60 sí');
  limpiarFallos(clave);
});

test('con un correo que no existe se tarda lo mismo que con uno que sí', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const medir = async (email: string) => {
    const t0 = process.hrtime.bigint();
    await p.servicio.login(email, 'una contraseña que no es').catch(() => undefined);
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };

  // Se mide varias veces y se compara la mediana, que aguanta mejor el ruido.
  const mediana = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const existe: number[] = [];
  const no: number[] = [];
  for (let i = 0; i < 5; i++) {
    limpiarFallos('admin@urkiolacarservice.com');
    limpiarFallos('nadie@urkiolacarservice.com');
    existe.push(await medir('admin@urkiolacarservice.com'));
    no.push(await medir('nadie@urkiolacarservice.com'));
  }

  const a = mediana(existe);
  const b = mediana(no);
  // Sin igualar el tiempo, el correo que no existe contesta casi al
  // instante y el otro tarda lo que cuesta comprobar una contraseña.
  assert.ok(
    Math.max(a, b) / Math.max(1, Math.min(a, b)) < 3,
    `los tiempos se parecen poco: ${a.toFixed(1)} ms frente a ${b.toFixed(1)} ms`
  );
});
