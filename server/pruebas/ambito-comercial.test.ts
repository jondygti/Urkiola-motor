import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import {
  esDelComercial,
  vehiculoEnAmbitoComercial,
} from '../../src/data/selectors';
import type { AppState, Vehicle } from '../../src/data/types';
import type { Command } from '../../src/data/commands';
import { comprobarPermiso } from '../src/permisos';
import { estadoPara } from '../src/recorte';

function escenario() {
  const base = buildSeedState();
  const director = base.users.find((u) => u.id === 'u-dir-vn')!;
  const responsableVo = base.users.find((u) => u.id === 'u-resp-vo')!;
  const juan = base.users.find((u) => u.id === 'u-juan')!;
  const plantilla = base.vehicles.find((v) => v.location?.siteId === 'leioa') ?? base.vehicles[0];

  const fabricar = (id: string, patch: Partial<Vehicle>): Vehicle => ({
    ...plantilla,
    id,
    vin8: id.slice(-8).toUpperCase(),
    vin: `WTEST${id.slice(-8).toUpperCase()}`,
    plate: null,
    logisticActive: true,
    deliveredAt: null,
    deliveredBy: null,
    ...patch,
  });

  const vnMarca = fabricar('v-scope-vn-bmw', {
    brand: 'BMW',
    type: 'VN',
    commercialArea: 'vn',
    commercialCategory: 'KM0',
    salesRep: null,
    salesRepId: null,
  });
  const vnAjeno = fabricar('v-scope-vn-ajeno', {
    brand: 'Toyota',
    type: 'VN',
    commercialArea: 'vn',
    commercialCategory: 'VN',
    salesRep: null,
    salesRepId: null,
  });
  const voEquipo = fabricar('v-scope-vo-equipo', {
    brand: 'Toyota',
    type: 'VO',
    commercialArea: 'vo',
    commercialCategory: 'VO',
    salesRep: juan.name,
    salesRepId: juan.id,
  });
  const voAjeno = fabricar('v-scope-vo-ajeno', {
    brand: 'Mercedes-Benz',
    type: 'VO',
    commercialArea: 'vo',
    commercialCategory: 'VO',
    salesRep: null,
    salesRepId: null,
  });

  const estado: AppState = {
    ...base,
    vehicles: [...base.vehicles, vnMarca, vnAjeno, voEquipo, voAjeno],
  };
  return { estado, director, responsableVo, juan, vnMarca, vnAjeno, voEquipo, voAjeno };
}

let n = 0;
function pedir(userId: string, vehicleId: string, requestType: 'traslado' | 'preparacion'): Command {
  return {
    type: 'request.create',
    id: `scope-${++n}`,
    at: new Date().toISOString(),
    userId,
    requestType,
    vehicleId,
    siteId: 'leioa',
    to: requestType === 'traslado' ? { siteId: 'leioa' } : null,
  };
}

test('el director ve VN/KM0/demo de sus marcas y VO de sus comerciales', () => {
  const { estado, director, vnMarca, vnAjeno, voEquipo, voAjeno } = escenario();

  assert.equal(vehiculoEnAmbitoComercial(estado, director, vnMarca), true);
  assert.equal(vehiculoEnAmbitoComercial(estado, director, voEquipo), true);
  assert.equal(vehiculoEnAmbitoComercial(estado, director, vnAjeno), false);
  assert.equal(vehiculoEnAmbitoComercial(estado, director, voAjeno), false);

  const visible = estadoPara(estado, director, false).vehicles.map((v) => v.id);
  assert.ok(visible.includes(vnMarca.id));
  assert.ok(visible.includes(voEquipo.id));
  assert.equal(visible.includes(vnAjeno.id), false);
  assert.equal(visible.includes(voAjeno.id), false);
});

test('el responsable VO ve todo VO y no recibe el stock VN', () => {
  const { estado, responsableVo, vnMarca, vnAjeno, voEquipo, voAjeno } = escenario();

  assert.equal(vehiculoEnAmbitoComercial(estado, responsableVo, voEquipo), true);
  assert.equal(vehiculoEnAmbitoComercial(estado, responsableVo, voAjeno), true);
  assert.equal(vehiculoEnAmbitoComercial(estado, responsableVo, vnMarca), false);
  assert.equal(vehiculoEnAmbitoComercial(estado, responsableVo, vnAjeno), false);

  const visible = estadoPara(estado, responsableVo, false).vehicles.map((v) => v.id);
  assert.ok(visible.includes(voEquipo.id));
  assert.ok(visible.includes(voAjeno.id));
  assert.equal(visible.includes(vnMarca.id), false);
});

test('director y responsable VO solo pueden pedir servicios dentro de su ámbito', () => {
  const { estado, director, responsableVo, vnMarca, vnAjeno, voEquipo, voAjeno } = escenario();

  for (const tipo of ['traslado', 'preparacion'] as const) {
    assert.equal(comprobarPermiso(estado, director, pedir(director.id, vnMarca.id, tipo)), null);
    assert.equal(comprobarPermiso(estado, director, pedir(director.id, voEquipo.id, tipo)), null);
    assert.match(
      comprobarPermiso(estado, director, pedir(director.id, vnAjeno.id, tipo)) ?? '',
      /ámbito comercial/i
    );
    assert.match(
      comprobarPermiso(estado, director, pedir(director.id, voAjeno.id, tipo)) ?? '',
      /ámbito comercial/i
    );

    assert.equal(comprobarPermiso(estado, responsableVo, pedir(responsableVo.id, voEquipo.id, tipo)), null);
    assert.equal(comprobarPermiso(estado, responsableVo, pedir(responsableVo.id, voAjeno.id, tipo)), null);
    assert.match(
      comprobarPermiso(estado, responsableVo, pedir(responsableVo.id, vnMarca.id, tipo)) ?? '',
      /ámbito comercial/i
    );
  }
});

test('salesRepId es la relación autoritativa cuando existe', () => {
  const { juan, voEquipo } = escenario();
  assert.equal(esDelComercial({ ...voEquipo, salesRep: 'Texto antiguo distinto' }, juan), true);
  assert.equal(esDelComercial({ ...voEquipo, salesRepId: 'u-otro' }, juan), false);
});

test('el transportista sigue sin recibir datos comerciales', () => {
  const { estado, voEquipo } = escenario();
  const iker = estado.users.find((u) => u.id === 'u-iker')!;
  const request = {
    ...estado.requests.find((r) => r.type === 'traslado')!,
    id: 'req-scope-external',
    vehicleId: voEquipo.id,
    carrierId: iker.carrierId ?? 'gruas-francis',
    assignedTo: iker.id,
    status: 'asignada' as const,
  };
  const conTraslado = { ...estado, requests: [...estado.requests, request] };
  const externo = estadoPara(conTraslado, iker, true);
  const recibido = externo.vehicles.find((v) => v.id === voEquipo.id)!;

  assert.ok(recibido);
  assert.equal(recibido.salesRep, null);
  assert.equal(recibido.salesRepId, null);
  assert.equal(recibido.commercialArea, undefined);
  assert.equal(recibido.commercialCategory, undefined);
});
