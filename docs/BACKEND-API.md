# Contrato del backend

La app funciona hoy en **modo demostración**: lleva dentro un parque de
ejemplo (428 vehículos activos, 5 sedes, 240 plazas en Sondika) y guarda
los cambios en el propio dispositivo. Es suficiente para validar la
operativa con el equipo antes de escribir una sola línea de servidor.

Para conectarla a un backend real solo hay que definir
`EXPO_PUBLIC_API_URL`. No hay que tocar ninguna pantalla.

## Endpoints mínimos

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/health` | `{ "ok": true }` |
| `POST` | `/auth/login` | `{ "token": "...", "user": User }` |
| `GET` | `/state` | El `AppState` completo del usuario |
| `POST` | `/commands` | `{ "ok": true, "state"?: AppState }` |

La autenticación va en `Authorization: Bearer <token>`.

## Por qué un único endpoint de escritura

Todas las acciones de la app (mover un vehículo, marcar un requisito,
confirmar un recuento, crear una incidencia…) se expresan como un
**comando**: un objeto con tipo, identificador, fecha, usuario y datos.

```jsonc
{
  "type": "movement.register",
  "id": "cmd-lz9k3-4",
  "at": "2026-08-22T10:42:00.000Z",
  "userId": "u-pedro",
  "vehicleId": "v-12345678",
  "to": { "siteId": "leioa", "zoneId": "leioa-park-01", "positionId": "leioa-park-01-p02" }
}
```

Ventajas para este proyecto:

1. **El servidor puede reutilizar la lógica del cliente.** La función
   `applyCommand(state, cmd)` de `src/data/commands.ts` es pura y no
   depende de React: se puede ejecutar igual en Node. Una sola definición
   de las reglas de negocio para web, móvil y servidor.
2. **La app funciona sin cobertura.** En campa hay zonas sin señal: los
   comandos se aplican al instante en el dispositivo y se reenvían cuando
   vuelve la conexión.
3. **Auditoría gratis.** Guardando la tabla de comandos tienes la
   trazabilidad completa de quién hizo qué y cuándo, que es justo lo que
   pide la operativa de recuentos.

El campo `id` de cada comando es único: el servidor debe **ignorar
comandos repetidos** (idempotencia) para que un reintento tras un fallo de
red no duplique un movimiento.

## Catálogo de comandos

| Tipo | Qué hace |
|---|---|
| `vehicle.check` | Comprobación física suelta (actualiza última comprobación) |
| `movement.register` | Registra un movimiento y actualiza la ubicación |
| `request.create` / `request.update` | Solicitudes de traslado y preparación |
| `prep.create` / `prep.start` / `prep.pause` / `prep.resume` / `prep.finish` | Ciclo de vida de una preparación |
| `prep.item` | Cambia un requisito a completado / pendiente / no requerido |
| `count.create` / `count.finding` / `count.close` | Recuentos de flota |
| `incident.create` / `incident.close` | Incidencias |
| `rule.create` / `rule.toggle` / `rule.delete` | Reglas de notificación |
| `inbox.read` / `inbox.readAll` | Bandeja de avisos |
| `reception.create` / `reception.line` / `reception.albaran` / `reception.close` | Recepción de camiones |
| `config.update` / `requirement.upsert` / `requirement.delete` / `zone.upsert` | Administración |

Las definiciones exactas de cada uno están tipadas en
`src/data/commands.ts` (tipo `Command`). Ese fichero **es** la
especificación: si el backend se escribe en TypeScript, puede importarlo
tal cual.

## Modelo de datos

Está en `src/data/types.ts`. Traducido a tablas de PostgreSQL:

```
sites            (id, name, kind, prepares)
zones            (id, site_id, name, kind, capacity)
positions        (id, zone_id, code)
users            (id, name, email, role, site_ids[])
vehicles         (id, vin8, vin, plate, brand, model, type, situation,
                  sales_rep, dealership, origin, logistic_active,
                  site_id, zone_id, position_id, target_site_id, status,
                  last_check_at, last_check_by, last_movement_at, received_at)
movements        (id, vehicle_id, from_*, to_*, user_id, at, status, note)
requests         (id, type, vehicle_id, site_id, from_*, to_*, status,
                  urgent, created_at, created_by, assigned_to, note)
preparations     (id, vehicle_id, site_id, preparer_id, phase, run_state,
                  effective_ms, waiting_ms, target_ms, running_since,
                  waiting_since, wait_reason, started_at, finished_at)
prep_items       (preparation_id, requirement_id, state, by, at)
counts           (id, code, site_id, zone_id, started_at, closed_at, responsible_id)
count_expected   (count_id, vehicle_id)
count_findings   (count_id, vehicle_id, at, by, position_id, misplaced)
incidents        (id, vehicle_id, type, description, status, created_at, created_by, closed_at)
incident_photos  (incident_id, url)
rules            (id, scope_kind, scope_ref, condition, target_site_id,
                  recipient, channels[], active, created_at)
notifications    (id, rule_id, vehicle_id, title, body, at, read, tone)
receptions       (id, truck_plate, carrier, site_id, arrived_at, closed_at, albaran_url)
reception_lines  (reception_id, ref, vehicle_id, unloaded, damage, position_id)
events           (id, vehicle_id, kind, title, detail, at, user_id)   -- trazabilidad
commands         (id, type, payload jsonb, at, user_id)               -- auditoría
```

### Reglas que el servidor debe respetar

- **Activación logística**: cualquier comando que toque un vehículo pone
  `logistic_active = true`. Quiter puede volcar el parque entero; solo
  aparece en la operativa lo que tiene actividad.
- **Porcentaje de preparación**: los requisitos en estado `no_requerido`
  no cuentan ni en el numerador ni en el denominador.
- **Tiempo efectivo y tiempo en espera son distintos**: el SLA se mide
  contra el efectivo. `prep.pause` cierra el tramo efectivo y abre el de
  espera; `prep.resume` hace lo contrario.
- **«Preentrega cliente» no tiene cronómetro** (`timed: false`).
- **Sondika no prepara**: no puede ser sede de una solicitud de
  preparación.

## La integración con Quiter

Dos fases, como estaba previsto:

1. **Ahora**: importación de un Excel. Un endpoint `POST /import/quiter`
   que reciba el fichero y haga *upsert* por VIN. Los vehículos entran con
   `logistic_active = false` hasta que tengan actividad.
2. **Después**: sincronización periódica contra la API de Quiter, con la
   misma lógica de *upsert*. Quiter manda en los datos comerciales
   (vehículo, comercial, stock/pedido); Urkiola manda en los logísticos
   (ubicación, movimientos, preparación, recuentos, incidencias). El
   importador nunca debe sobrescribir un campo logístico.

## Notificaciones push

La app obtiene un token de Expo (`src/data/push.ts`). El backend debe:

1. Guardar el token asociado al usuario y dispositivo.
2. Cuando se dispare una regla, enviar el aviso a
   `https://exp.host/--/api/v2/push/send` con los tokens que correspondan.
3. Borrar los tokens que Expo marque como `DeviceNotRegistered`.

La evaluación de reglas ya está implementada en `applyCommand`
(función `fireRules`): el servidor solo tiene que hacer la entrega.
