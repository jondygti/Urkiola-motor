# El backend

> **Estado: escrito y funcionando.** Está en [`server/`](../server), con sus
> comprobaciones (`npm --prefix server test`) y una prueba de la app real
> contra él (`npm run verify:api`). Cómo arrancarlo y desplegarlo, en
> [`server/README.md`](../server/README.md). Este documento es el contrato:
> qué tiene que cumplir cualquier servidor de esta app, y por qué.

La app también funciona en **modo demostración**, sin servidor: lleva dentro
un parque de ejemplo (428 vehículos activos, 5 sedes, 240 plazas en Sondika)
y guarda los cambios en el propio dispositivo. Es lo que se usa para validar
la operativa con el equipo.

Para conectarla al backend solo hay que definir `EXPO_PUBLIC_API_URL`. No
hay que tocar ninguna pantalla.

## Endpoints

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/health` | `{ "ok": true }` |
| `POST` | `/auth/login` | `{ "token": "...", "user": User }` |
| `POST` | `/auth/password` | `{ "ok": true }` |
| `GET` | `/state` | El `AppState` que le corresponde ver a ese usuario |
| `POST` | `/commands` | `{ "ok": true, "repetido": false }` |
| `POST` | `/push/token` | `{ "ok": true }` |

La autenticación va en `Authorization: Bearer <token>`.

Las contraseñas las guarda el propio servidor con scrypt y la sesión es un
JWT firmado con `node:crypto`. Se descartó apoyarse en Supabase Auth: los
usuarios, los roles y los permisos ya viven en el estado de la aplicación y
se editan desde Administración, así que tener un segundo censo de personas
en otro sitio era más problema que ventaja. **A cambio no hay recuperación
de contraseña por correo**: hoy la restablece un administrador desde
`/auth/password`. Está anotado como pendiente.

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

### Los identificadores se derivan del comando

Todo lo que nace de un comando —la preparación, el traslado, el recuento, la
incidencia, el apunte del histórico— recibe un identificador **derivado del
id del comando**: `prep.create` con id `cmd-a1b2` crea la preparación
`prep-cmd-a1b2`, siempre.

No es un detalle de estilo, es lo que hace posible trabajar sin cobertura.
El móvil aplica el comando en local y enseña la preparación en pantalla; el
servidor aplica el mismo comando por su cuenta cuando le llega. Si cada uno
inventase un identificador aleatorio, el comando siguiente («empezar la
preparación *prep-…*») no encontraría nada en el servidor y el trabajo del
operario se perdería sin que nadie se enterase. Con el id derivado, los dos
llegan al mismo sitio.

De paso, rehacer el histórico da exactamente el mismo estado, que es lo que
permite reconstruirlo si hace falta.

Un comando puede generar otro por dentro. `prep.finish` con destino
(`to`) registra además el movimiento del vehículo, y ese movimiento lleva
el id del comando con el sufijo `-mov`. Si el backend ejecuta
`applyCommand` no hay nada que hacer: sale solo, y con el mismo id, así que
un reintento sigue sin duplicar nada. Si se reimplementa la lógica en otro
lenguaje, hay que respetar esa composición.

## Trabajo sin cobertura: lo que el servidor tiene que cumplir

La app ya está construida para funcionar en sótanos y zonas sin señal, así
que esto **no es opcional**, es parte del contrato:

1. **Idempotencia por `command.id`.** Si llega dos veces el mismo `id`, la
   segunda se responde `200` sin volver a aplicar nada. La app reintenta
   cuando vuelve la cobertura y puede repetir un envío del que nunca supo
   si llegó. Sin esto se duplican movimientos y comprobaciones.

2. **Los comandos llegan en orden, uno a uno.** La app no envía el
   siguiente hasta que el anterior se ha confirmado, porque se construyen
   unos sobre otros (crear la preparación antes de marcar un requisito).
   El servidor no debe procesarlos en paralelo para un mismo vehículo.

3. **Pueden llegar tarde.** Un comando registrado a las 9:05 en un sótano
   puede llegar a las 11:30. Por eso cada comando lleva su propio `at`:
   **usa esa fecha, no la de recepción**, para el histórico y la
   trazabilidad. También para medir: si una preparación se pausó a las 9:05,
   el tiempo efectivo se corta a las 9:05, no a las 11:30. Con la fecha de
   llegada, dos horas de cola se contarían como dos horas de taller.

   La excepción es una fecha en el **futuro**: un móvil con el reloj mal
   puesto dispararía los plazos y el histórico, así que el servidor la
   sustituye por la de llegada.

4. **Los códigos de error significan cosas distintas para la app:**

   | Respuesta | Qué hace la app |
   |---|---|
   | `2xx` | Lo da por subido y sigue con el siguiente |
   | `5xx`, `408`, `429` | Lo mantiene en cola y reintenta más tarde |
   | Resto de `4xx` | Lo aparta, avisa por pantalla y sigue con el siguiente |
   | Sin respuesta (timeout, sin red) | Lo mantiene en cola y reintenta |

   Es decir: **devolver `4xx` descarta el trabajo del operario**. Úsalo
   solo cuando el comando es realmente inválido y reintentarlo nunca va a
   funcionar. Ante la duda, `5xx`.

5. **`GET /state` debe poder llamarse en cualquier momento.** La app lo usa
   al arrancar y, si tiene cosas pendientes, las vuelve a aplicar encima de
   lo que devuelve el servidor para que no desaparezcan de la pantalla.

### Cómo lo hace la app

- Guarda el estado completo en el dispositivo, así que arranca y es usable
  sin conexión con los últimos datos conocidos.
- Guarda la cola de comandos pendientes, que sobrevive a cerrar la app.
- Reintenta al recuperar cobertura, al volver a primer plano y cada 30 s.
- Nunca da por bueno que hay conexión porque lo diga el sistema operativo:
  lo comprueba intentando llegar al servidor. Las sondas de conectividad
  del móvil fallan tras un proxy o con portales cautivos, que es justo
  donde tiene que funcionar.

## Catálogo de comandos

| Tipo | Qué hace |
|---|---|
| `vehicle.check` | Comprobación física suelta (actualiza última comprobación) |
| `movement.register` | Registra un movimiento y actualiza la ubicación |
| `request.create` / `request.update` | Solicitudes de traslado y preparación |
| `prep.create` / `prep.start` / `prep.pause` / `prep.resume` | Ciclo de vida de una preparación |
| `prep.finish` | Cierra la preparación. Con `to` opcional: deja el vehículo en esa ubicación y genera el movimiento |
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

## Permisos: el servidor tiene la última palabra

La app comprueba permisos en tres niveles —el menú oculta lo que el rol no
puede usar, cada pantalla vuelve a comprobarlo por si se llega por un
enlace, y cada botón se esconde si no corresponde—, pero **eso es comodidad
de interfaz, no seguridad**.

Cualquiera puede modificar el cliente o llamar a la API a mano. Así que el
servidor debe comprobar, en cada comando, que el usuario del token tiene el
permiso correspondiente:

| Comando | Permiso exigido |
|---|---|
| `movement.register`, `vehicle.check` | `movimientos.registrar` o `recuentos.ejecutar`. Con solo `traslados.propios`, únicamente sobre vehículos de un traslado asignado a esa persona |
| `request.create` | `solicitudes.crear` |
| `request.update` | `solicitudes.gestionar`, **o** `traslados.propios` si el traslado es de su empresa (o suyo) y el nuevo estado es `en_ruta` o `terminada` |
| `vehicle.setDelivery` | `entregas.gestionar` |
| `carrier.upsert`, `carrier.delete` | `admin.configurar` |
| `prep.create` | `preparacion.gestionar` |
| `prep.start` / `pause` / `resume` / `item` | `preparacion.ejecutar` |
| `prep.finish` | `preparacion.ejecutar`; si trae `to`, también `movimientos.registrar` |
| `count.*` | `recuentos.ejecutar` |
| `incident.create` | `incidencias.crear` |
| `incident.close` | `incidencias.cerrar` |
| `reception.*` | `recepcion.ejecutar` |
| `rule.*` | `notificaciones.gestionar` |
| `vehicle.setCustom` | `flota.editar` |
| `site.*`, `zone.*`, `position.*`, `user.*`, `role.*`, `customField.*`, `config.update` | `admin.configurar` |

Además, si el usuario tiene sedes asignadas (`user.siteIds` no vacío), el
servidor debe rechazar comandos sobre vehículos de otras sedes.

### Colaboradores externos

Los roles marcados como `simple` (hoy, el transportista) son proveedores
externos y merecen una regla aparte, **que se comprueba antes que los
permisos del rol y no depende de ellos**: solo pueden tocar los traslados de
su empresa (`user.carrierId === request.carrierId`) o los asignados a ellos
en concreto. Si se hiciera al revés —dejando pasar lo que permita el rol—
bastaría con marcar una casilla de más en Administración para abrirle a un
proveedor la flota entera. Urkiola trabaja con varias empresas de transporte según
la zona, y ninguna debe ver los encargos de otra. En concreto, `GET /state` debería devolverles un estado
recortado —sus traslados y los vehículos implicados— y no el parque
completo. No es solo cuestión de permisos: es no exponer a un proveedor la
flota, los comerciales ni la ocupación de las campas.

El `userId` del comando **no se cree**: se sustituye por el del token. Si no,
cualquiera podría registrar movimientos a nombre de otra persona.

Un comando sin permiso se responde **`403`**. La app lo trata como
«rechazado»: lo aparta de la cola y lo avisa por pantalla, en vez de
reintentarlo eternamente.

Los permisos y los roles viven en `config.roles` y se editan desde la
aplicación, así que el servidor los lee de la base de datos, no de una
lista fija en el código.

## Modelo de datos

Está en `src/data/types.ts`. Traducido a tablas de PostgreSQL:

```
sites            (id, name, kind, prepares)
carriers         (id, name, site_ids[], phone, active, note)
zones            (id, site_id, name, kind, capacity)
positions        (id, zone_id, code)
users            (id, name, email, role, site_ids[])
vehicles         (id, vin8, vin, plate, brand, model, type, situation,
                  sales_rep, dealership, origin, logistic_active,
                  site_id, zone_id, position_id, target_site_id, status,
                  last_check_at, last_check_by, last_movement_at, received_at)
movements        (id, vehicle_id, from_*, to_*, user_id, at, status, note)
requests         (id, type, vehicle_id, site_id, from_*, to_*, status,
                  urgent, created_at, created_by, assigned_to, note,
                  carrier_id, due_at, picked_up_at)
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
- **Los plazos se guardan calculados, no se recalculan.** Un traslado
  recibe `due_at` al pasar a `en_ruta` (recogida + 48 h); una preparación,
  al crearse (solicitud + 48 h, o la fecha de entrega si la hay). Cambiar
  el plazo en la configuración no puede mover lo ya comprometido.
- **La fecha de entrega manda sobre el plazo por defecto.** Al fijarla con
  `vehicle.setDelivery`, la preparación abierta de ese vehículo pasa a
  vencer ese día.

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
