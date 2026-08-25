/** Lo que ve cada uno cuando pide el estado. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { servidorDePruebas, CLAVE } from './ayuda';
import { CAMPOS_DEL_VEHICULO } from '../src/recorte';
import type { Vehicle } from '../../src/data/types';

test('el transportista solo ve sus traslados y sin datos comerciales', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const { user: iker } = await p.servicio.login('transporte@urkiolacarservice.com', CLAVE);
  const visto = p.servicio.estadoDe(iker);
  const completo = p.servicio.estado;

  // Ni el parque, ni las preparaciones, ni las incidencias, ni la campa.
  assert.ok(visto.vehicles.length < completo.vehicles.length);
  assert.equal(visto.preparations.length, 0);
  assert.equal(visto.incidents.length, 0);
  assert.equal(visto.receptions.length, 0);
  assert.equal(visto.counts.length, 0);

  // Ni un solo traslado que no sea de su empresa o suyo.
  for (const r of visto.requests) {
    assert.equal(r.type, 'traslado');
    assert.ok(r.carrierId === 'gruas-francis' || r.assignedTo === iker.id);
  }

  // Ni el comercial de cada coche.
  for (const v of visto.vehicles) assert.equal(v.salesRep, null);

  // Ni los compañeros, ni la competencia.
  assert.deepEqual(
    visto.users.map((u) => u.id),
    [iker.id]
  );
  assert.deepEqual(
    visto.carriers.map((c) => c.id),
    ['gruas-francis']
  );

  // Ni la ocupación de las campas: solo las plazas de su trabajo.
  assert.ok(visto.positions.length < completo.positions.length);
});

test('las dos empresas de transporte no se ven entre ellas', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const { user: iker } = await p.servicio.login('transporte@urkiolacarservice.com', CLAVE);
  const { user: aitor } = await p.servicio.login('betigoiz@urkiolacarservice.com', CLAVE);

  const deIker = new Set(p.servicio.estadoDe(iker).requests.map((r) => r.id));
  const deAitor = new Set(p.servicio.estadoDe(aitor).requests.map((r) => r.id));

  for (const id of deIker) assert.ok(!deAitor.has(id), `el traslado ${id} lo ven las dos`);
});

test('quien tiene sedes asignadas recibe lo suyo, no el parque entero', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const { user: pedro } = await p.servicio.login('pedro@urkiolacarservice.com', CLAVE);
  const visto = p.servicio.estadoDe(pedro);

  assert.ok(visto.vehicles.length < p.servicio.estado.vehicles.length);
  for (const prep of visto.preparations) assert.equal(prep.siteId, 'leioa');
});

test('el administrador lo ve todo', async (t) => {
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const { user: admin } = await p.servicio.login('admin@urkiolacarservice.com', CLAVE);
  const visto = p.servicio.estadoDe(admin);
  assert.equal(visto.vehicles.length, p.servicio.estado.vehicles.length);
  assert.equal(visto.users.length, p.servicio.estado.users.length);
});

test('ningún campo marcado como comercial sale hacia el transportista', async (t) => {
  // El mapa de `recorte.ts` obliga a clasificar cada campo del vehículo al
  // compilar. Esto comprueba lo otro: que lo marcado como «se-borra» sale de
  // verdad vacío por la API, y no solo en la intención de quien lo escribió.
  const p = await servidorDePruebas();
  t.after(() => p.limpiar());

  const { user: iker } = await p.servicio.login('transporte@urkiolacarservice.com', CLAVE);
  const visto = p.servicio.estadoDe(iker);
  assert.ok(visto.vehicles.length > 0, 'tiene que ver algún coche para que esto pruebe algo');

  const aBorrar = (Object.keys(CAMPOS_DEL_VEHICULO) as (keyof Vehicle)[]).filter(
    (k) => CAMPOS_DEL_VEHICULO[k] === 'se-borra'
  );
  // Y que alguno de esos campos venga relleno en el parque completo: si no,
  // la prueba pasaría por no haber datos, no por estar bien recortados.
  const completo = p.servicio.estado;
  assert.ok(
    completo.vehicles.some((v) => v.salesRep),
    'el parque de ejemplo tiene que traer comerciales puestos'
  );

  for (const v of visto.vehicles) {
    for (const campo of aBorrar) {
      const valor = v[campo];
      const vacio = valor === null || valor === undefined || valor === 'stock';
      assert.ok(vacio, `el transportista ve ${campo} = ${JSON.stringify(valor)} del coche ${v.id}`);
    }
  }
});
