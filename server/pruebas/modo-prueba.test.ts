import test from 'node:test';
import assert from 'node:assert/strict';
import { leerConfig } from '../src/config';
import { servidorDePruebas } from './ayuda';

const BASE = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(64),
  CORS_ORIGEN: 'https://easo-prueba.onrender.com',
  DATABASE_URL: 'postgres://prueba',
  SUPABASE_URL: 'https://prueba.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio',
  PUBLIC_URL: 'https://easo-prueba.onrender.com',
};

test('sin modo prueba, producción sigue sin aceptar los datos de ejemplo', () => {
  assert.throws(() => leerConfig({ ...BASE, URKIOLA_SEMILLA: 'demo' }), /URKIOLA_SEMILLA=vacia/);
});

test('el modo prueba arranca con los datos de ejemplo y sin correo ni administrador', () => {
  const c = leerConfig({ ...BASE, URKIOLA_MODO: 'prueba', URKIOLA_SEMILLA: 'demo', URKIOLA_CLAVE_PRUEBAS: 'tres perros en la campa' });
  assert.equal(c.modoPrueba, true);
  assert.equal(c.semilla, 'demo');
  assert.equal(c.clavePruebas, 'tres perros en la campa');
});

test('el modo prueba no arranca con la contraseña de serie ni con una débil', () => {
  for (const clave of [undefined, '', 'urkiola', 'corta', 'Urkiola-2026-campa', 'password12345']) {
    assert.throws(
      () => leerConfig({ ...BASE, URKIOLA_MODO: 'prueba', URKIOLA_SEMILLA: 'demo', URKIOLA_CLAVE_PRUEBAS: clave }),
      /URKIOLA_CLAVE_PRUEBAS/,
      `aceptó «${clave}»`
    );
  }
});

test('en el servidor de prueba, los usuarios de ejemplo entran con la contraseña fuerte y no con la de serie', async () => {
  const p = await servidorDePruebas({ produccion: true, modoPrueba: true, clavePruebas: 'tres perros en la campa' });
  try {
    const { user } = await p.servicio.login('logistica@urkiolacarservice.com', 'tres perros en la campa');
    assert.equal(user.id, 'u-log');
    await assert.rejects(() => p.servicio.login('admin@urkiolacarservice.com', 'urkiola'));
  } finally {
    await p.limpiar();
  }
});
