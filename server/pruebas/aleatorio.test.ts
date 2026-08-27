/**
 * Disparo al azar: miles de comandos que nadie escribió a mano.
 *
 * `invariantes.test.ts` comprueba una jornada de trabajo real, escrita paso
 * a paso. Esto comprueba lo contrario: secuencias que a nadie se le habrían
 * ocurrido —borrar una sede con un traslado pedido hacia ella, contar un
 * coche en una plaza que otro acaba de ocupar, cerrar una preparación dos
 * veces— y que después de cada una los datos siguen teniendo sentido.
 *
 * Es el que encuentra lo que un guion escrito a mano no se imagina, porque
 * un guion solo prueba lo que ya sabíamos que podía pasar.
 *
 * Cada tanda lleva su **semilla**: si falla, el número que sale por pantalla
 * repite exactamente la misma secuencia, así que el fallo se puede mirar
 * tantas veces como haga falta en vez de perseguirlo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command, type CommandInput } from '../../src/data/commands';
import { buildSeedState } from '../../src/data/seed';
import { revisar } from './invariantes';
import type { AppState, Id } from '../../src/data/types';

/* --------------------------------------------------------------- el azar */

/** Generador con semilla: la misma semilla da siempre la misma tanda. */
function azar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Dado = () => number;
const entre = (r: Dado, n: number) => Math.floor(r() * n);
const uno = <T,>(r: Dado, xs: readonly T[]): T | null => (xs.length ? xs[entre(r, xs.length)] : null);
const aVeces = (r: Dado, p = 0.5) => r() < p;

/* -------------------------------------------------------- los generadores */

/**
 * Cada generador mira el estado de ahora y propone un comando plausible, o
 * `null` si en este momento no tiene sentido (no hay preparaciones abiertas,
 * por ejemplo). Se propone lo plausible, no lo válido: parte de la gracia
 * está en pedir cosas que no se pueden hacer y ver que no rompen nada.
 */
type Generador = (s: AppState, r: Dado) => CommandInput | null;

const ubicacion = (s: AppState, r: Dado) => {
  const sede = uno(r, s.sites);
  if (!sede) return null;
  const zonas = s.zones.filter((z) => z.siteId === sede.id);
  const zona = aVeces(r, 0.85) ? uno(r, zonas) : null;
  const plazas = zona ? s.positions.filter((p) => p.zoneId === zona.id) : [];
  const plaza = zona && aVeces(r, 0.7) ? uno(r, plazas) : null;

  // Una de cada seis viene mal a propósito: una plaza de otra campa, o una
  // que no existe. Un cliente puede mandar lo que le dé la gana —el móvil
  // de cualquiera se puede trastear— y el servidor no se lo puede creer.
  if (aVeces(r, 1 / 6)) {
    const mentira = aVeces(r) ? (uno(r, s.positions)?.id ?? null) : `plaza-inventada-${entre(r, 999)}`;
    return { siteId: sede.id, ...(zona ? { zoneId: zona.id } : {}), ...(mentira ? { positionId: mentira } : {}) };
  }

  return {
    siteId: sede.id,
    ...(zona ? { zoneId: zona.id } : {}),
    ...(plaza ? { positionId: plaza.id } : {}),
  };
};

const vehiculo = (s: AppState, r: Dado) => uno(r, s.vehicles);
const abiertas = (s: AppState) => s.preparations.filter((p) => p.runState !== 'terminado');

const GENERADORES: { peso: number; gen: Generador }[] = [
  /* ------------------------------------------------- el día a día, frecuente */
  {
    peso: 10,
    gen: (s, r) => {
      const v = vehiculo(s, r);
      const to = ubicacion(s, r);
      return v && to ? { type: 'movement.register', vehicleId: v.id, to } : null;
    },
  },
  {
    peso: 5,
    gen: (s, r) => {
      const v = vehiculo(s, r);
      const plaza = uno(r, s.positions);
      return v ? { type: 'vehicle.check', vehicleId: v.id, positionId: aVeces(r) ? plaza?.id : null } : null;
    },
  },
  {
    peso: 6,
    gen: (s, r) => {
      const v = vehiculo(s, r);
      const sede = uno(r, s.sites);
      if (!v || !sede) return null;
      const tipo = aVeces(r) ? 'traslado' : 'preparacion';
      return {
        type: 'request.create',
        requestType: tipo,
        vehicleId: v.id,
        siteId: sede.id,
        to: aVeces(r) ? ubicacion(s, r) : null,
        urgent: aVeces(r, 0.2),
        carrierId: aVeces(r) ? (uno(r, s.carriers)?.id ?? null) : null,
      } as CommandInput;
    },
  },
  {
    peso: 6,
    gen: (s, r) => {
      const req = uno(r, s.requests);
      const estado = uno(r, ['solicitada', 'asignada', 'en_ruta', 'en_curso', 'terminada', 'bloqueada'] as const);
      if (!req || !estado) return null;
      return {
        type: 'request.update',
        requestId: req.id,
        status: estado,
        assignedTo: aVeces(r) ? (uno(r, s.users)?.id ?? null) : null,
        // A veces con motivo de retraso, aunque el traslado no llegue tarde:
        // el servidor tiene que quedarse solo con los que de verdad lo son.
        delayReason: aVeces(r, 0.3)
          ? uno(r, ['llaves', 'averia', 'cliente', 'trafico', 'carga', 'otro'] as const)
          : null,
      };
    },
  },
  {
    peso: 5,
    gen: (s, r) => {
      const v = vehiculo(s, r);
      const sede = uno(r, s.sites);
      if (!v || !sede) return null;
      return { type: 'prep.create', vehicleId: v.id, siteId: sede.id, preparerId: uno(r, s.users)?.id ?? null };
    },
  },
  { peso: 5, gen: (s, r) => { const p = uno(r, abiertas(s)); return p ? { type: 'prep.start', prepId: p.id } : null; } },
  {
    peso: 4,
    gen: (s, r) => {
      const p = uno(r, abiertas(s));
      return p ? { type: 'prep.pause', prepId: p.id, reason: 'esperando pieza', blocked: aVeces(r, 0.3) } : null;
    },
  },
  { peso: 4, gen: (s, r) => { const p = uno(r, abiertas(s)); return p ? { type: 'prep.resume', prepId: p.id } : null; } },
  {
    peso: 4,
    gen: (s, r) => {
      const p = uno(r, abiertas(s));
      return p ? { type: 'prep.finish', prepId: p.id, to: aVeces(r) ? (ubicacion(s, r) ?? undefined) : undefined } : null;
    },
  },
  {
    peso: 6,
    gen: (s, r) => {
      const p = uno(r, s.preparations);
      const item = p ? uno(r, p.items) : null;
      const estado = uno(r, ['completado', 'pendiente', 'no_requerido'] as const);
      return p && item && estado
        ? { type: 'prep.item', prepId: p.id, requirementId: item.requirementId, state: estado }
        : null;
    },
  },
  {
    peso: 3,
    gen: (s, r) => {
      const sede = uno(r, s.sites);
      if (!sede) return null;
      const zonas = s.zones.filter((z) => z.siteId === sede.id);
      return {
        type: 'count.create',
        siteId: sede.id,
        zoneId: aVeces(r) ? (uno(r, zonas)?.id ?? null) : null,
        code: `R${entre(r, 9999)}`,
      };
    },
  },
  {
    peso: 5,
    gen: (s, r) => {
      const c = uno(r, s.counts);
      const v = vehiculo(s, r);
      if (!c || !v) return null;
      return { type: 'count.finding', countId: c.id, vehicleId: v.id, positionId: uno(r, s.positions)?.id ?? null };
    },
  },
  { peso: 2, gen: (s, r) => { const c = uno(r, s.counts); return c ? { type: 'count.close', countId: c.id } : null; } },
  {
    peso: 3,
    gen: (s, r) => {
      const v = vehiculo(s, r);
      const tipo = uno(r, ['recepcion', 'transporte', 'preparacion', 'campa', 'otro'] as const);
      return v && tipo
        ? { type: 'incident.create', vehicleId: v.id, incidentType: tipo, description: 'golpe', photos: [] }
        : null;
    },
  },
  { peso: 2, gen: (s, r) => { const i = uno(r, s.incidents); return i ? { type: 'incident.close', incidentId: i.id } : null; } },
  {
    peso: 3,
    gen: (s, r) => {
      const sede = uno(r, s.sites);
      return sede ? { type: 'reception.create', truckPlate: `${entre(r, 9999)}ABC`, carrier: 'Grúas', siteId: sede.id } : null;
    },
  },
  {
    peso: 5,
    gen: (s, r) => {
      const rec = uno(r, s.receptions);
      if (!rec) return null;
      // A veces un coche del parque y a veces un bastidor que no existe: el
      // camión trae lo que trae, esté dado de alta o no.
      const v = vehiculo(s, r);
      const ref = aVeces(r, 0.7) && v ? (v.plate ?? v.vin8) : `VIN${entre(r, 99999999)}`;
      return {
        type: 'reception.line',
        receptionId: rec.id,
        ref,
        unloaded: aVeces(r, 0.8),
        positionId: aVeces(r) ? (uno(r, s.positions)?.id ?? null) : null,
        damage: aVeces(r, 0.2) ? 'rayado' : null,
      };
    },
  },
  { peso: 2, gen: (s, r) => { const rec = uno(r, s.receptions); return rec ? { type: 'reception.close', receptionId: rec.id } : null; } },
  {
    peso: 3,
    gen: (s, r) => {
      const v = vehiculo(s, r);
      return v
        ? { type: 'vehicle.setSalesRep', vehicleId: v.id, salesRep: aVeces(r) ? (uno(r, s.users)?.name ?? null) : null }
        : null;
    },
  },
  {
    peso: 2,
    gen: (s, r) => {
      const v = vehiculo(s, r);
      return v ? { type: 'vehicle.setDelivery', vehicleId: v.id, deliveryDate: aVeces(r) ? new Date().toISOString() : null } : null;
    },
  },
  { peso: 2, gen: (s, r) => { const v = vehiculo(s, r); return v ? { type: 'vehicle.activate', vehicleId: v.id } : null; } },
  {
    peso: 3,
    gen: (s, r) => ({
      type: 'vehicle.create',
      vin8: `ZZ${entre(r, 999999)}`,
      plate: aVeces(r) ? `${entre(r, 9999)}ZZZ` : null,
      location: aVeces(r) ? ubicacion(s, r) : null,
    }),
  },

  /* -------------------------------------------- configuración, menos frecuente */
  {
    peso: 2,
    gen: (s, r) => {
      const sede = uno(r, s.sites);
      return sede ? { type: 'site.upsert', site: { ...sede, prepares: aVeces(r) } } : null;
    },
  },
  { peso: 2, gen: (s, r) => { const sede = uno(r, s.sites); return sede ? { type: 'site.delete', siteId: sede.id } : null; } },
  {
    peso: 2,
    gen: (s, r) => {
      const z = uno(r, s.zones);
      return z ? { type: 'zone.upsert', zone: z, positions: entre(r, 12) } : null;
    },
  },
  { peso: 2, gen: (s, r) => { const z = uno(r, s.zones); return z ? { type: 'zone.delete', zoneId: z.id } : null; } },
  { peso: 2, gen: (s, r) => { const z = uno(r, s.zones); return z ? { type: 'position.add', zoneId: z.id, code: `X${entre(r, 99)}` } : null; } },
  { peso: 2, gen: (s, r) => { const p = uno(r, s.positions); return p ? { type: 'position.delete', positionId: p.id } : null; } },
  {
    peso: 2,
    gen: (s, r) => {
      const u = uno(r, s.users);
      const rol = uno(r, s.config.roles);
      return u && rol ? { type: 'user.upsert', user: { ...u, role: rol.id, active: aVeces(r, 0.7) } } : null;
    },
  },
  { peso: 2, gen: (s, r) => { const u = uno(r, s.users); return u ? { type: 'user.delete', targetUserId: u.id } : null; } },
  {
    peso: 2,
    gen: (s, r) => {
      const rol = uno(r, s.config.roles);
      if (!rol) return null;
      // La mitad de las veces un rol nuevo: si siempre se tocan los de
      // serie, `role.delete` no llega a borrar nunca nada —los de serie no
      // se borran— y esa parte se quedaría sin probar.
      const id = aVeces(r) ? `rol-${entre(r, 20)}` : rol.id;
      return {
        type: 'role.upsert',
        role: { ...rol, id, name: id, builtin: false, permissions: rol.permissions.slice(0, entre(r, rol.permissions.length + 1)) },
      };
    },
  },
  { peso: 2, gen: (s, r) => { const rol = uno(r, s.config.roles); return rol ? { type: 'role.delete', roleId: rol.id } : null; } },
  {
    peso: 1,
    gen: (s, r) => {
      const req = uno(r, s.config.requirements);
      return req ? { type: 'requirement.upsert', requirement: { ...req, timed: aVeces(r), optional: aVeces(r) } } : null;
    },
  },
  { peso: 1, gen: (s, r) => { const req = uno(r, s.config.requirements); return req ? { type: 'requirement.delete', requirementId: req.id } : null; } },
  { peso: 1, gen: (s, r) => { const c = uno(r, s.carriers); return c ? { type: 'carrier.delete', carrierId: c.id } : null; } },
  { peso: 1, gen: (s, r) => ({ type: 'config.update', patch: { prepTargetMinutes: { VN: entre(r, 300), VO: entre(r, 300) } } }) },

  /* ------------------------------------------------ avisos y bandeja */
  // El repaso del reloj, que crea avisos por su cuenta. Es lo más nuevo del
  // sistema y hasta ahora no lo disparaba nadie aquí.
  { peso: 4, gen: () => ({ type: 'alerts.sweep' }) },
  {
    peso: 3,
    gen: (s, r) => {
      const cond = uno(r, [
        'llegada_sede', 'preparacion_pedida', 'preparacion_terminada', 'sin_comprobar_72h',
        'traslado_sin_recoger', 'incidencia_abierta', 'traslado_completado', 'preparacion_bloqueada',
      ] as const);
      const ambito = uno(r, ['vehicle', 'site', 'fleet'] as const);
      const rol = uno(r, s.config.roles);
      if (!cond || !ambito || !rol) return null;
      // Las tres audiencias, incluida la de un rol que puede haberse quedado
      // sin gente: un aviso sin destinatarios no se debe crear.
      const audience = aVeces(r, 0.4)
        ? ({ kind: 'comercial' } as const)
        : aVeces(r)
          ? ({ kind: 'rol', roleId: rol.id } as const)
          : ({ kind: 'todos' } as const);
      return {
        type: 'rule.create',
        rule: {
          scopeKind: ambito,
          scopeRef:
            ambito === 'vehicle'
              ? (vehiculo(s, r)?.id ?? null)
              : ambito === 'site'
                ? (uno(r, s.sites)?.id ?? null)
                : null,
          condition: cond,
          targetSiteId: uno(r, s.sites)?.id ?? null,
          audience,
          recipient: 'Quien sea',
          channels: ['web'],
          active: true,
        },
      };
    },
  },
  { peso: 2, gen: (s, r) => { const x = uno(r, s.rules); return x ? { type: 'rule.setActive', ruleId: x.id, active: aVeces(r) } : null; } },
  { peso: 1, gen: (s, r) => { const x = uno(r, s.rules); return x ? { type: 'rule.delete', ruleId: x.id } : null; } },
  { peso: 2, gen: (s, r) => { const n = uno(r, s.inbox); return n ? { type: 'inbox.read', eventId: n.id } : null; } },
  { peso: 1, gen: () => ({ type: 'inbox.readAll' }) },

  /* ------------------------------------------- campos propios y demás */
  {
    peso: 2,
    gen: (s, r) => {
      const v = vehiculo(s, r);
      const propio = uno(r, s.config.customFields);
      return v && propio
        ? { type: 'vehicle.setCustom', vehicleId: v.id, fieldId: propio.id, value: `x${entre(r, 99)}` }
        : null;
    },
  },
  {
    peso: 1,
    gen: (s, r) => {
      const propio = uno(r, s.config.customFields);
      return propio ? { type: 'customField.upsert', field: { ...propio, showInTable: aVeces(r) } } : null;
    },
  },
  { peso: 1, gen: (s, r) => { const x = uno(r, s.config.customFields); return x ? { type: 'customField.delete', fieldId: x.id } : null; } },
  { peso: 1, gen: (s, r) => { const x = uno(r, s.carriers); return x ? { type: 'carrier.upsert', carrier: { ...x, active: aVeces(r, 0.8) } } : null; } },
  { peso: 2, gen: (s, r) => { const rec = uno(r, s.receptions); return rec ? { type: 'reception.albaran', receptionId: rec.id, uri: `albaran-${entre(r, 999)}` } : null; } },
];

/** La ruleta con pesos, montada una sola vez. */
const RULETA: Generador[] = GENERADORES.flatMap(({ peso, gen }) => Array<Generador>(peso).fill(gen));

/* ------------------------------------------------------------- la tanda */

interface Fallo {
  paso: number;
  cmd: Command;
  motivo: string;
}

function tanda(semilla: number, pasos: number): Fallo | null {
  const r = azar(semilla);
  let s = buildSeedState();
  let n = 0;
  const arranque = Date.now();

  for (let paso = 0; paso < pasos; paso++) {
    const gen = RULETA[entre(r, RULETA.length)];
    const input = gen(s, r);
    if (!input) continue;

    n += 1;
    const cmd = {
      id: `azar-${semilla}-${n}`,
      // El reloj avanza desde ahora: si todos los comandos llegaran a la
      // vez, los cronómetros nunca contarían nada y la mitad de las
      // invariantes de tiempo no se pondrían a prueba. Y desde *ahora* y no
      // desde una fecha fija porque el parque de ejemplo se genera con
      // fechas relativas al día de hoy: empezar en el pasado daría
      // preparaciones que terminan antes de empezar por culpa de la prueba,
      // no del código.
      at: new Date(arranque + paso * 137_000).toISOString(),
      userId: 'u-log',
      ...input,
    } as Command;

    const antes = s;
    let despues: AppState;
    try {
      despues = applyCommand(antes, cmd);
    } catch (e) {
      return { paso, cmd, motivo: `revienta: ${String(e).slice(0, 160)}` };
    }

    const problemas = revisar(despues);
    if (problemas.length) {
      return { paso, cmd, motivo: problemas.map((p) => `${p.invariante} → ${p.detalle}`).join(' · ') };
    }

    // Y aplicarlo dos veces tiene que dar lo mismo que aplicarlo una: la
    // respuesta del servidor se pierde, el comando se queda en la cola y se
    // reaplica encima de un estado que ya lo traía.
    const otraVez = applyCommand(despues, cmd);
    if (JSON.stringify(otraVez) !== JSON.stringify(despues)) {
      return { paso, cmd, motivo: 'aplicarlo dos veces no da lo mismo que aplicarlo una' };
    }

    s = despues;
  }
  return null;
}

/* ------------------------------------------------------------ las pruebas */

const SEMILLAS = 40;
const PASOS = 250;

test('miles de comandos al azar no rompen ninguna invariante', () => {
  const fallos: string[] = [];
  for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
    const fallo = tanda(semilla, PASOS);
    if (fallo) {
      fallos.push(
        `semilla ${semilla}, paso ${fallo.paso}, ${fallo.cmd.type} → ${fallo.motivo}\n` +
          `    repetirlo: tanda(${semilla}, ${PASOS})\n` +
          `    comando: ${JSON.stringify(fallo.cmd).slice(0, 300)}`
      );
    }
  }
  assert.equal(
    fallos.length,
    0,
    `${fallos.length} de ${SEMILLAS} tandas dejaron los datos mal:\n  ${fallos.join('\n  ')}`
  );
});

test('la misma semilla da siempre la misma tanda', () => {
  // Sin esto, un fallo que sale hoy no se puede volver a mirar mañana.
  const a = tanda(7, 60);
  const b = tanda(7, 60);
  assert.deepEqual(a, b);
});
