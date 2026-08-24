# Servidor de Urkiola Car Service

El backend de la aplicación. Implementa el contrato de
[`../docs/BACKEND-API.md`](../docs/BACKEND-API.md) **reutilizando la lógica
de negocio de la app**: importa `src/data/commands.ts` tal cual, así que las
reglas (plazos, preparaciones, permisos de movimiento, recuentos…) son las
mismas en el móvil, en la web y aquí. No hay dos versiones que puedan
discrepar.

## Probarlo en un portátil, sin contratar nada

```bash
npm install          # dentro de server/
npm run dev
```

Levanta en el puerto 8080 con el parque de ejemplo y guarda los datos en
`server/datos/estado.json`. Todos los usuarios de ejemplo entran con la
contraseña `urkiola` (lo avisa por consola al arrancar).

Para ver la app conectada a él, desde la raíz del proyecto:

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080 npx expo start --web --clear
```

## Comprobaciones

```bash
npm test                 # dentro de server/: 43 comprobaciones
npm run verify:api       # en la raíz: la app real contra este servidor
```

`npm test` cubre contraseñas y sesiones, permisos comando a comando,
idempotencia, comandos que llegan tarde, el estado recortado del
transportista y que un reinicio no pierda nada.

`npm run verify:api` compila la web apuntando a este servidor y la recorre
con un navegador: entra con contraseña, mueve un coche y comprueba que el
movimiento ha llegado al servidor y que **otro dispositivo lo ve**.

## Cómo está montado

```
src/
  index.ts        arranque
  config.ts       variables de entorno
  http.ts         las rutas (node:http, sin framework)
  servicio.ts     el núcleo: aplica comandos en fila y guarda
  auth.ts         contraseñas (scrypt) y sesiones (JWT), con node:crypto
  permisos.ts     qué puede hacer cada rol, comando a comando
  recorte.ts      qué parte del estado ve cada uno
  validar.ts      forma de los comandos que llegan
  push.ts         entrega de los avisos a Expo
  almacen/        fichero (local) · postgres (producción) · esquema.sql
pruebas/          comprobaciones automáticas
```

### La idea de fondo

El servidor guarda **el histórico de comandos**: todo lo que ha pasado, con
quién lo hizo y cuándo. El estado actual es el resultado de aplicarlos en
orden, y se guarda una foto cada 50 comandos para no tener que rehacerlos
todos al arrancar. Si la foto se pierde, se reconstruye sola.

Eso da tres cosas gratis: trazabilidad completa (lo que pide la operativa de
recuentos), poder rehacer el estado si algo se corrompe, y que el móvil
pueda trabajar sin cobertura y mandar después lo que hizo.

### Una sola instancia

El estado vive en memoria y los comandos se aplican de uno en uno, así que
**este servidor funciona con una sola instancia**. Con Postgres coge un
cerrojo en la base de datos: si arranca un segundo proceso, espera a que el
primero suelte (para que un despliegue nuevo releve al viejo sin cortar) y
si no lo suelta, falla con un mensaje claro en vez de corromper los datos.

Para el tamaño de esto —cinco sedes, unos cientos de coches, unas decenas de
comandos al día— sobra de largo. Si algún día no bastara, lo que hay que
cambiar es `servicio.ts`, no la app ni las reglas de negocio.

## Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `PORT` | Puerto | `8080` |
| `DATABASE_URL` | Postgres. Sin ella, guarda en fichero | *(vacío)* |
| `JWT_SECRET` | Firma de las sesiones. **Obligatorio en producción** | *(aleatorio en local)* |
| `URKIOLA_ADMIN_EMAIL` | Administrador inicial | *(vacío)* |
| `URKIOLA_ADMIN_PASSWORD` | Su contraseña | *(vacío)* |
| `URKIOLA_SEMILLA` | `demo` (parque de ejemplo) o `vacia` | `demo` |
| `CORS_ORIGEN` | Direcciones desde las que se permite el navegador | `*` |
| `SESION_DIAS` | Duración de la sesión | `30` |
| `URKIOLA_DATOS` | Fichero del almacén local | `datos/estado.json` |
| `URKIOLA_FOTO_CADA` | Comandos entre foto y foto | `50` |
| `EXPO_PUSH` | `0` para no mandar avisos | activado |
| `URKIOLA_CLAVE_PRUEBAS` | Contraseña única de los usuarios de ejemplo | `urkiola` |

Genera el secreto con `openssl rand -hex 32`. En producción, sin
`JWT_SECRET` el servidor **no arranca**: es a propósito.

## Rutas

| Método | Ruta | Quién |
|---|---|---|
| `GET` | `/health` | cualquiera |
| `POST` | `/auth/login` | cualquiera |
| `POST` | `/auth/password` | quien ha entrado (la suya) o un administrador (la de otro) |
| `GET` | `/state` | quien ha entrado |
| `POST` | `/commands` | quien ha entrado |
| `POST` | `/push/token` | quien ha entrado |

Los códigos de respuesta importan: la app **descarta** el trabajo del
operario ante un `4xx` y lo **reintenta** ante un `5xx`. Por eso cualquier
fallo interno sale como 500, y el 400 se reserva para comandos que nunca van
a poder aplicarse.

## Lo que todavía no hace

- **Fotos.** Las de incidencias y albaranes se guardan hoy como una
  dirección local del móvil, así que no las ve nadie más. Hace falta
  almacenamiento de objetos (Supabase Storage o S3) y subirlas antes de
  mandar el comando.
- **Importación de Quiter** (`POST /import/quiter`). Está pendiente de que
  Jon consiga un export real; sin verlo no se escribe el importador.
- **Consultas para informes.** Hoy la app pide el estado entero, que le
  basta. Para Power BI o similares habrá que volcar el histórico a las
  tablas relacionales descritas en `docs/BACKEND-API.md`.
