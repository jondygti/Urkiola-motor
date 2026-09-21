import test from 'node:test';
import assert from 'node:assert/strict';
import { CorreoHttp } from '../src/correo';

test('el proveedor de correo no puede bloquear el servidor indefinidamente', async () => {
  const colgado = ((_: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const e = new Error('abortado');
        e.name = 'AbortError';
        reject(e);
      });
    })) as typeof fetch;

  const correo = new CorreoHttp(
    'https://correo.example.invalid',
    'clave',
    'Urkiola <no-responder@example.invalid>',
    colgado,
    10
  );

  await assert.rejects(
    () => correo.enviar('persona@example.invalid', 'Prueba', 'Texto'),
    /no ha respondido a tiempo/i
  );
});
