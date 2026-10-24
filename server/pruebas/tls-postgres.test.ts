import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sslPostgres } from '../src/almacen/tls';

test('en local no hay TLS', () => {
  assert.equal(sslPostgres('postgres://u:p@localhost:5432/db'), undefined);
  assert.equal(sslPostgres('postgres://u:p@127.0.0.1:5432/db'), undefined);
});

test('en remoto se verifica siempre, con las autoridades de serie y la de Supabase', () => {
  const ssl = sslPostgres('postgresql://u.ref:p@aws-1-eu-central-1.pooler.supabase.com:5432/postgres');
  assert.ok(ssl);
  assert.equal(ssl.rejectUnauthorized, true);
  // Las de serie siguen ahí: un PostgreSQL con certificado público también conecta.
  assert.ok(ssl.ca.length > 100);
  const supabase = new crypto.X509Certificate(ssl.ca[ssl.ca.length - 1]);
  assert.match(supabase.subject, /CN=Supabase Root 2021 CA/);
  assert.equal(
    supabase.fingerprint256,
    '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'
  );
});
