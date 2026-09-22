/** Pruebas del StoreProvider real: React y las reglas de negocio son los
 * de la app; solo se sustituyen red, disco y eventos nativos. No hay API
 * real ni se envían correos o avisos durante estas comprobaciones. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const commands = require('../../server/dist/src/data/commands.js');
const seed = require('../../server/dist/src/data/seed.js');
const selectors = require('../../server/dist/src/data/selectors.js');
const codigo = ts.transpileModule(readFileSync(new URL('../../src/data/store.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class ApiError extends Error {
  constructor(status, message = `Error ${status}`) { super(message); this.status = status; }
  get retriable() { return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500; }
}

const servidor = `urkiola.api.${encodeURIComponent('https://api.pruebas.invalid')}`;
const claves = (id) => ({ work: `${servidor}.user.${encodeURIComponent(id)}.work`, state: `${servidor}.user.${encodeURIComponent(id)}.state` });
const pendientes = (db, id) => JSON.parse(db.get(claves(id).work) ?? '{"queue":[],"rejected":[]}');
const diferida = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const siguiente = () => new Promise((r) => setImmediate(r));
const paso = async (fn = () => {}) => { await act(async () => { await fn(); await siguiente(); }); };

function sesion(db, user, estado) {
  db.set(`${servidor}.session`, JSON.stringify(user));
  db.set(`${servidor}.token`, `token:${user.id}`);
  if (estado) db.set(claves(user.id).state, JSON.stringify({ v: 20, state: estado }));
}

async function dispositivo(t, { db = new Map(), remoto = seed.buildSeedState(), estadoApi, enviar, estricto = false } = {}) {
  const enviados = [];
  const intervalos = new Map();
  let actual, token = null, appEvent, netEvent, fallaDisco = false;
  let leer = estadoApi;
  let mandar = enviar;
  const storage = {
    async getItem(k) { return db.get(k) ?? null; },
    async setItem(k, v) {
      if (fallaDisco && k.endsWith('.work')) throw new Error('Disco lleno');
      db.set(k, v);
    },
    async removeItem(k) { db.delete(k); },
    async multiRemove(keys) { for (const k of keys) db.delete(k); },
    async multiSet(entries) { for (const [k, v] of entries) await storage.setItem(k, v); },
  };
  const api = {
    async state() { return structuredClone(leer ? await leer() : remoto); },
    async send(cmd) {
      enviados.push({ command: structuredClone(cmd), token });
      if (mandar) await mandar(cmd);
      remoto = commands.applyCommand(remoto, cmd);
      return { ok: true };
    },
    async login(email) {
      const user = remoto.users.find((u) => u.email === email);
      if (!user) throw new ApiError(401);
      return { user, token: `token:${user.id}` };
    },
    async pushToken() {},
  };
  const deps = {
    react: React,
    '@react-native-async-storage/async-storage': storage,
    '@react-native-community/netinfo': { addEventListener(fn) { netEvent = fn; return () => {}; } },
    'react-native': { AppState: { addEventListener(_, fn) { appEvent = fn; return { remove() {} }; } } },
    './api': { API_URL: 'https://api.pruebas.invalid', apiEnabled: true, ApiError, api,
      haySesion: () => token !== null, setAuthToken: (v) => { token = v; } },
    './commands': commands, './seed': seed, './selectors': selectors,
    './push': { registerForPush: async () => null },
    './photoQueue': {
      resolverFotosPendientes: async (value) => ({ value, refsLocales: [] }),
      confirmarFotosPendientes: async () => {},
    },
    './secureSession': {
      leerTokenSeguro: async () => storage.getItem(`${servidor}.token`),
      guardarTokenSeguro: async (value) => storage.setItem(`${servidor}.token`, value),
      borrarTokenSeguro: async () => storage.removeItem(`${servidor}.token`),
    },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', codigo)(
    (name) => { assert.ok(name in deps, `Dependencia sin preparar: ${name}`); return deps[name]; }, mod, mod.exports,
    (fn, ms) => { intervalos.set(ms, fn); return ms; }, (ms) => intervalos.delete(ms),
  );
  function Observar() { actual = mod.exports.useStore(); return null; }
  let arbol;
  await paso(() => {
    const app = React.createElement(mod.exports.StoreProvider, null, React.createElement(Observar));
    arbol = create(estricto ? React.createElement(React.StrictMode, null, app) : app);
  });
  let cerrado = false;
  const cerrar = async () => { if (!cerrado) { cerrado = true; await paso(() => arbol.unmount()); } };
  t.after(cerrar);
  return {
    db, enviados, cerrar, get store() { return actual; }, get remoto() { return remoto; },
    set remoto(s) { remoto = s; }, set leer(fn) { leer = fn; }, set enviar(fn) { mandar = fn; },
    set fallaDisco(v) { fallaDisco = v; },
    async entrar(user) { let fallo; await paso(async () => { fallo = await actual.login(user.email, ''); }); return fallo; },
    async reloj() { await paso(() => intervalos.get(30_000)?.()); },
    async primerPlano() { await paso(() => appEvent?.('active')); },
    async conectar() { await paso(() => netEvent?.({ isConnected: true })); },
  };
}

test('una pantalla sin pendientes recibe cambios al pasar el tiempo y al volver al primer plano', async (t) => {
  const d = await dispositivo(t);
  assert.equal(await d.entrar(d.remoto.users[0]), null);
  const id = d.remoto.vehicles[0].id;
  const cambiar = (plate) => { d.remoto = { ...d.remoto, vehicles: d.remoto.vehicles.map((v) => v.id === id ? { ...v, plate } : v) }; };
  cambiar('1111 ABC');
  await d.reloj();
  assert.equal(d.store.state.vehicles.find((v) => v.id === id).plate, '1111 ABC');
  cambiar('2222 DEF');
  await d.primerPlano();
  assert.equal(d.store.state.vehicles.find((v) => v.id === id).plate, '2222 DEF');
  assert.equal(d.enviados.length, 0);
});

test('una sesión caducada migra y conserva los dos comandos hasta que vuelva su autor', async (t) => {
  const remoto = seed.buildSeedState();
  const user = remoto.users.find((u) => u.id === 'u-log');
  const queue = [1, 2].map((n) => ({ id: `sin-red-${n}`, type: 'vehicle.check', vehicleId: remoto.vehicles[n].id, userId: user.id, at: new Date().toISOString() }));
  const db = new Map([
    ['urkiola.session.v1', JSON.stringify(user)], ['urkiola.token.v1', 'caducado'],
    ['urkiola.state.v1', JSON.stringify({ v: 19, state: remoto })], ['urkiola.queue.v1', JSON.stringify(queue)],
  ]);
  const d = await dispositivo(t, { db, remoto, estadoApi: () => { throw new ApiError(401); } });
  assert.equal(d.store.user, null);
  assert.deepEqual(pendientes(db, user.id).queue, queue);
  assert.equal(pendientes(db, user.id).rejected.length, 0);
  assert.equal(d.enviados.length, 0);
  d.leer = undefined;
  assert.equal(await d.entrar(user), null);
  assert.deepEqual(d.enviados.map((x) => x.command.id), queue.map((c) => c.id));
  assert.equal(pendientes(db, user.id).queue.length, 0);
});

test('cambiar de cuenta no envía el trabajo de otra persona', async (t) => {
  const d = await dispositivo(t);
  const [a, b] = d.remoto.users;
  await d.entrar(a);
  d.leer = () => { throw new ApiError(0); };
  let cmd;
  await paso(() => { cmd = d.store.run({ type: 'vehicle.check', vehicleId: d.remoto.vehicles[0].id }); });
  await paso(() => d.store.logout());
  d.leer = undefined;
  await d.entrar(b);
  assert.equal(d.store.sync.pending, 0);
  assert.equal(d.enviados.length, 0);
  assert.equal(pendientes(d.db, a.id).queue[0].id, cmd.id);
  await paso(() => d.store.logout());
  await d.entrar(a);
  assert.equal(d.enviados.length, 1);
  assert.equal(d.enviados[0].token, `token:${a.id}`);
  assert.equal(d.enviados[0].command.userId, a.id);
});

test('caducar durante el envío conserva la acción para reintentar', async (t) => {
  const d = await dispositivo(t, { enviar: () => { throw new ApiError(401); } });
  const user = d.remoto.users[0];
  await d.entrar(user);
  await paso(() => d.store.run({ type: 'vehicle.check', vehicleId: d.remoto.vehicles[0].id }));
  assert.equal(d.store.user, null);
  assert.equal(pendientes(d.db, user.id).queue.length, 1);
  assert.equal(pendientes(d.db, user.id).rejected.length, 0);
});

test('un rechazo se retira de la pantalla y se puede revisar después de reiniciar', async (t) => {
  const d = await dispositivo(t, { enviar: () => { throw new ApiError(403, 'Sin permiso'); } });
  const user = d.remoto.users[0];
  await d.entrar(user);
  const vehicle = d.remoto.vehicles.find((v) => v.logisticActive && v.location);
  await paso(() => d.store.run({ type: 'vehicle.deliver', vehicleId: vehicle.id }));
  assert.deepEqual(d.store.state.vehicles.find((v) => v.id === vehicle.id), vehicle);
  assert.equal(d.store.sync.pending, 0);
  assert.equal(d.store.sync.rejected[0].reason, 'Sin permiso');
  await d.cerrar();
  const siguiente = await dispositivo(t, { db: d.db, remoto: d.remoto });
  assert.equal(siguiente.store.sync.rejected[0].reason, 'Sin permiso');
});

test('una respuesta antigua no sobrescribe una cuenta que acaba de entrar', async (t) => {
  const espera = diferida();
  const d = await dispositivo(t);
  const [a, b] = d.remoto.users;
  await d.entrar(a);
  d.leer = () => espera.promise;
  await paso(() => d.store.flushNow());
  await paso(() => d.store.logout());
  d.leer = undefined;
  await d.entrar(b);
  await paso(() => espera.resolve({ ...d.remoto, vehicles: [] }));
  assert.equal(d.store.user.id, b.id);
  assert.ok(d.store.state.vehicles.length > 0);
});

test('los cambios hechos mientras se descarga no desaparecen de la cola ni de la pantalla', async (t) => {
  const espera = diferida();
  const d = await dispositivo(t);
  const user = d.remoto.users[0];
  await d.entrar(user);
  const vehicle = d.remoto.vehicles.find((v) => v.logisticActive);
  d.leer = () => espera.promise;
  d.enviar = () => { throw new ApiError(0); };
  await paso(() => d.store.flushNow());
  await paso(() => d.store.run({ type: 'vehicle.deliver', vehicleId: vehicle.id }));
  await paso(() => espera.resolve(d.remoto));
  assert.equal(d.store.sync.pending, 1);
  assert.equal(d.store.state.vehicles.find((v) => v.id === vehicle.id).status, 'entregado');
  assert.equal(pendientes(d.db, user.id).queue.length, 1);
});

test('no se envía antes de guardar en disco y puede recuperarse al liberar espacio', async (t) => {
  const d = await dispositivo(t);
  const user = d.remoto.users[0];
  await d.entrar(user);
  d.fallaDisco = true;
  await paso(() => d.store.run({ type: 'vehicle.check', vehicleId: d.remoto.vehicles[0].id }));
  assert.equal(d.enviados.length, 0);
  assert.equal(d.store.sync.pending, 1);
  d.fallaDisco = false;
  await d.conectar();
  assert.equal(d.enviados.length, 1);
  assert.equal(pendientes(d.db, user.id).queue.length, 0);
});

test('sin caché ni descarga no entra en una pantalla vacía donde no se pueda trabajar', async (t) => {
  const d = await dispositivo(t, { estadoApi: () => { throw new ApiError(0); } });
  const fallo = await d.entrar(d.remoto.users[0]);
  assert.match(fallo, /cargar los datos/);
  assert.equal(d.store.user, null);
});

test('un fallo de disco tampoco pierde la copia en memoria al cambiar de cuenta', async (t) => {
  const d = await dispositivo(t);
  const [a, b] = d.remoto.users;
  await d.entrar(a);
  d.fallaDisco = true;
  let orden;
  await paso(() => { orden = d.store.run({ type: 'vehicle.check', vehicleId: d.remoto.vehicles[0].id }); });
  await paso(() => d.store.logout());
  d.fallaDisco = false;
  await d.entrar(b);
  assert.equal(d.enviados.length, 0);
  await paso(() => d.store.logout());
  await d.entrar(a);
  assert.equal(d.enviados[0].command.id, orden.id);
  assert.equal(d.enviados[0].token, `token:${a.id}`);
});

test('el reinicio sin red recupera la caché y la cola propias también en StrictMode', async (t) => {
  const remoto = seed.buildSeedState();
  const user = remoto.users[0];
  const db = new Map();
  sesion(db, user, remoto);
  const queue = [{ id: 'pendiente-propio', type: 'vehicle.check', vehicleId: remoto.vehicles[0].id, userId: user.id, at: new Date().toISOString() }];
  db.set(claves(user.id).work, JSON.stringify({ queue, rejected: [] }));
  const d = await dispositivo(t, { db, remoto, estricto: true, estadoApi: () => { throw new ApiError(0); } });
  assert.equal(d.store.user?.id, user.id);
  assert.equal(d.store.sync.pending, 1);
  assert.equal(d.store.state.vehicles.length, remoto.vehicles.length);
  assert.equal(d.enviados.length, 0);
});

test('al restaurar sesión sin caché espera al estado antes de habilitar las rutas', async (t) => {
  const remoto = seed.buildSeedState();
  const user = remoto.users.find((u) => u.role === 'director_comercial');
  const db = new Map();
  sesion(db, user);
  const descarga = diferida();
  const d = await dispositivo(t, { db, remoto, estadoApi: () => descarga.promise });
  assert.equal(d.store.ready, false, 'no debe redirigir al login mientras restaura la cuenta');
  await paso(() => descarga.resolve(remoto));
  assert.equal(d.store.ready, true);
  assert.equal(d.store.user?.id, user.id);
});


test('un 503 al confirmar una evidencia conserva su comando offline hasta recuperarse', async (t) => {
  const d = await dispositivo(t, { enviar: () => { throw new ApiError(503); } });
  const user = d.remoto.users.find(u => u.id === 'u-pedro');
  await d.entrar(user);
  let orden;
  await paso(() => { orden = d.store.run({ type: 'incident.create', vehicleId: d.remoto.vehicles[0].id, incidentType: 'recepcion', description: 'Evidencia pendiente', photos: ['foto:subida-propia.png'] }); });
  assert.equal(pendientes(d.db, user.id).queue[0].id, orden.id);
  assert.equal(pendientes(d.db, user.id).rejected.length, 0);
  assert.equal(d.remoto.incidents.some(i => i.id === `inc-${orden.id}`), false);
  d.enviar = undefined;
  await d.reloj();
  assert.equal(pendientes(d.db, user.id).queue.length, 0);
  assert.equal(pendientes(d.db, user.id).rejected.length, 0);
  assert.equal(d.remoto.incidents.filter(i => i.id === `inc-${orden.id}`).length, 1);
  assert.ok(d.enviados.every(e => e.command.id === orden.id));
});
