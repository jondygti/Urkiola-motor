# Dónde alojar Urkiola Car Service

> Documento histórico del montaje anterior. La decisión v2 vigente está en
> [ARCHITECTURE.md](ARCHITECTURE.md): Render + Supabase PostgreSQL/Auth/Storage.
> Los pasos de Railway y la decisión de no usar Auth que siguen no representan
> el objetivo vigente. No se ha ejecutado una migración ni verificado aquí sus
> precios, condiciones o afirmaciones de disponibilidad.

**Decisión: Railway + Supabase.** Sustituye a la decisión anterior (un VPS
en Arsys), que sigue documentada abajo como alternativa porque el proyecto
no depende de ninguna de las dos.

## Por qué ha cambiado

La razón para elegir Arsys fue el **soporte en castellano**: si nadie en
Urkiola iba a administrar un servidor, había que poder llamar a alguien.

Ahora la premisa es otra: el sistema lo lleváis vosotros conmigo. Eso
cambia la pregunta. Ya no se trata de a quién llamar cuando falle el
servidor, sino de **no tener servidor que falle**:

| Con un VPS (Arsys) | Con Railway + Supabase |
|---|---|
| Parches del sistema operativo, Docker, PostgreSQL | No existen: los pone el proveedor |
| Certificado HTTPS, cortafuegos, SSH por clave | Vienen hechos |
| Copias montadas y vigiladas por vosotros | Diarias, del proveedor, más la vuestra fuera |
| Desplegar = `scp` y `docker compose up` | Desplegar = `git push` |
| Soporte en español para la máquina | Soporte en inglés, por ticket |

Lo que se pierde es el teléfono en castellano. Lo que se gana es que la
mayor parte de las llamadas que lo harían falta ya no ocurren: no hay
máquina que parchear ni disco que se llene.

## Qué es cada pieza

| Pieza | Quién | Para qué |
|---|---|---|
| **Base de datos** | Supabase (PostgreSQL gestionado) | El parque, los movimientos, las preparaciones… y el registro de comandos |
| **Fotos** | Supabase Storage | Albaranes, daños e incidencias. Sustituye al MinIO del montaje anterior |
| **Identidad** | La propia API | Contraseñas (scrypt) y sesión (JWT). Se descartó Supabase Auth: los usuarios y sus permisos ya viven en el estado de la app y se editan desde Administración, así que un segundo censo de personas en otro sitio sobraba. Ver [`BACKEND-API.md`](BACKEND-API.md) |
| **API** | Railway | El servicio que recibe los comandos y aplica las reglas de negocio. Está en [`server/`](../server) |
| **Panel web** | Railway, servido por la propia API | Es un export estático; sale del mismo dominio y así no hay líos de CORS |
| **App Android** | Google Play | Ver [`DISTRIBUCION.md`](DISTRIBUCION.md). Solo necesita la dirección de la API |

Es a propósito que la lógica viva en la API y no en la base de datos: las
reglas están en `src/data/commands.ts`, en TypeScript puro, y el servidor
puede usar ese mismo fichero. Una regla escrita una vez, no dos.

## Dónde estarán los datos

Los dos son proveedores estadounidenses con centros de datos en Europa, así
que hay que **elegir región europea a mano al crear cada proyecto**; por
defecto suelen proponer Estados Unidos.

| Pieza | Región a elegir |
|---|---|
| Supabase | Frankfurt (`eu-central-1`), o Irlanda / París |
| Railway | Europa (Ámsterdam, `europe-west4`) |

Con datos de empleados y de clientes de por medio, además de elegir región:
firmar el **acuerdo de tratamiento de datos (DPA)** de cada uno —los dos lo
ofrecen— y anotarlos como encargados de tratamiento en el registro de
actividades. Es papeleo de una tarde, pero hay que hacerlo.

## Todo en Railway, o Railway + Supabase

Las dos valen y el código está preparado para las dos **sin tocar nada**:
el servidor mira si tiene las claves de Supabase y, si no las tiene, guarda
las fotos en una carpeta suya.

| | Todo en Railway | Railway + Supabase |
|---|---|---|
| Cuentas que crear | 1 | 2 |
| Base de datos | PostgreSQL de Railway | Supabase |
| Fotos | Un disco del propio servidor | Almacén de Supabase |
| Coste | Solo Railway | + ~25 US$/mes del plan Pro |
| Copias de las fotos | **Tuyas**: `npm run copia` | Las hace el proveedor |
| Si el disco se estropea | Se pierden las fotos que no estén en una copia | El almacén guarda varias copias |

**Para empezar, todo en Railway.** Una cuenta, una factura y más barato.
Con una condición que no es negociable: **la copia de seguridad desde el
primer día**, porque las fotos de daños son la prueba para reclamarle a un
transportista y ahí el disco es un disco.

Para pasar de una a otra, más adelante, se ponen `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` y se copian los ficheros de fotos al bucket. El
código es el mismo.

## Coste

Cifras orientativas: **confirmadlas al contratar**, que estas cosas cambian
cada pocos meses.

| Concepto | Coste aproximado |
|---|---|
| Supabase Pro | ~25 US$/mes |
| Railway (plan de pago, servicio pequeño) | ~5-20 US$/mes según uso |
| Dominio | ~12 €/año |
| Cuenta de Google Play | 25 US$ **una sola vez** |
| EAS Build | 0 € con el plan gratuito |
| **Total** | **≈ 30-45 US$/mes** |

Dos avisos sobre el plan gratuito de Supabase: **pausa el proyecto tras una
semana sin actividad** y no hace copias diarias. Vale para probar, no para
producción. Para el entorno de pruebas sí sirve.

Comparado con el VPS (~30-60 €/mes más el trabajo de administrarlo), sale
parecido o más barato, y sin horas de sistemas.

## Entornos

Dos entornos desde el primer día, y **nunca la misma base de datos**:

| Entorno | Railway | Supabase | Dirección |
|---|---|---|---|
| Producción | entorno `production` | proyecto `urkiola` (Pro) | `urkiolacarservice.com` |
| Pruebas | entorno `staging` | proyecto `urkiola-pre` (gratis) | `pre.urkiolacarservice.com` |

Railway tiene entornos separados con sus propias variables: el mismo
repositorio despliega en los dos, cada uno apuntando a su base de datos.

## Cómo se despliega

```
git push  →  Railway construye  →  migraciones  →  servicio nuevo en marcha
```

Sin `scp`, sin `docker compose`, sin entrar por SSH. Railway construye desde
la rama que se le diga y cambia al servicio nuevo cuando arranca bien; si
falla, se queda el anterior.

Railway construye con `server/Dockerfile` y la raíz del repositorio como
contexto. El panel web se compila **dentro** de la imagen, porque
`EXPO_PUBLIC_API_URL` se incrusta al compilar: pásalo como argumento de
construcción con el dominio público.

Variables del servicio de la API (en Railway → Variables). La lista completa
está en [`server/README.md`](../server/README.md):

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Supabase. Para un proceso Node de larga vida, la conexión directa o el *session pooler*, no el de transacciones |
| `JWT_SECRET` | Firma de las sesiones. `openssl rand -hex 32`. **Sin esto el servidor no arranca en producción**, a propósito |
| `URKIOLA_SEMILLA` | `vacia` en producción. `demo` carga el parque de ejemplo |
| `URKIOLA_ADMIN_EMAIL` / `URKIOLA_ADMIN_PASSWORD` | El primer administrador, que se crea al arrancar. Sin él nadie podría entrar en un sistema recién instalado |
| `CORS_ORIGEN` | El dominio del panel web |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Para las fotos de daños y albaranes. **Solo en el servidor**, nunca en la app: con esa clave se lee el almacén entero |
| `PUBLIC_URL` | Dirección del panel. Sale en el enlace del correo de restablecer contraseña |
| `EMAIL_API_KEY` | Proveedor de correo (Resend por defecto) para el enlace de restablecer. Sin esto, la contraseña la sigue restableciendo un administrador |

**Una sola instancia (réplicas = 1).** El servidor aplica los comandos en
fila y coge un cerrojo en la base de datos: un segundo proceso espera a que
el primero suelte —así un despliegue nuevo releva al viejo sin cortar— y si
no lo suelta, falla con un mensaje claro en vez de corromper los datos.

Y en la app móvil, `EXPO_PUBLIC_API_URL` apuntando a la API (ver
`eas.json`). Ojo con lo de siempre: esa variable **se incrusta al compilar
y Metro la cachea**, así que al cambiarla hay que compilar con `--clear`.

> Ninguna de estas claves va al repositorio. `secrets/` y `.env` están en
> `.gitignore` y deben seguir estándolo.

## Copias de seguridad

```bash
cd server
npm run copia                    # deja la copia en ./copias
npm run copia -- /ruta/donde     # o donde le digas
```

Deja **un solo fichero** `urkiola-2026-08-27.tar.gz` con lo único que no se
puede rehacer:

- **El histórico de comandos**, que es la verdad: todo lo que ha pasado, con
  quién y cuándo. Una línea de JSON por comando, en texto plano: dentro de
  diez años se abre con cualquier cosa, aunque ya no exista ni esto ni
  Postgres.
- **Las contraseñas** (su hash, nunca la contraseña).
- **Las fotos**, si están en el propio servidor.

No se guarda lo que se rehace solo: la foto del estado se reconstruye
aplicando los comandos, los avisos push los vuelve a dar cada móvil al abrir
la app y los enlaces de restablecer caducan en una hora.

**Al terminar, la copia se comprueba sola**: rehace el estado entero
aplicando los comandos guardados y compara los números. Si algo no cuadra,
lo dice y sale con error, que es lo que hace saltar el aviso de una tarea
programada. También avisa si el histórico menciona una foto que no está en
la copia.

### Restaurar

```bash
cd server
tar xzf urkiola-2026-08-27.tar.gz
npm run restaurar -- ./urkiola-2026-08-27                 # en seco: no escribe nada
npm run restaurar -- ./urkiola-2026-08-27 --de-verdad     # restaura
```

Restaurar es volver a meter los comandos en orden: el estado se rehace solo
al arrancar el servidor, igual que hace cada día. Todo va en una
transacción, así que o entra entero o no entra nada.

Se **niega a escribir encima** de una base de datos que ya tenga comandos:
mezclar dos historias distintas es peor que no haber restaurado. Si hay que
restaurar sobre algo, se vacía antes a conciencia.

### La parte que la gente se salta

**Una vez al mes, en seco**, sin `--de-verdad`. Tarda diez segundos y es lo
único que distingue una copia de una esperanza:

```bash
npm run restaurar -- ./la-ultima-copia
```

Y **guarda las copias fuera de Railway**. Una copia que vive en el mismo
sitio que los datos no es una copia: es el mismo fichero dos veces.

Con las fotos en Supabase, de copiarlas se encarga el proveedor y el script
lo dice por pantalla en vez de reclamarlas.

## Qué pasa si un día hay que irse

Poco, y es a propósito:

- **La base de datos es PostgreSQL a secas.** Un `pg_dump` y a otro sitio.
- **Las fotos** están en un almacenamiento compatible con S3; se copian con
  cualquier cliente de S3.
- **La lógica de negocio está en la aplicación**, no en la base de datos:
  no hay funciones ni disparadores que reescribir. Es la razón de haberlo
  montado con comandos desde el principio.
- **La app no se entera.** Habla con un contrato HTTP propio
  ([`BACKEND-API.md`](BACKEND-API.md)); cambiar de alojamiento es cambiar
  una dirección.

Lo único que ataría de verdad sería apoyarse en las funciones específicas
de Supabase (Edge Functions, seguridad por filas, PostgREST). No las
usamos: la API es nuestra. La excepción es Auth, que sí es suya —a cambio
de no escribir nosotros el guardado de contraseñas y la recuperación, que
es justo el código que no conviene improvisar—. Si algún día hay que
migrar, los usuarios están en una tabla de PostgreSQL como todo lo demás.

## Alternativa: servidor propio

El montaje anterior sigue en el repositorio y sigue siendo válido:
`docker-compose.yml` (PostgreSQL + MinIO + Caddy) y `deploy/Caddyfile`.
Tiene sentido si algún día pesa más tener los datos en una máquina
concreta, o si el coste mensual crece por encima de lo que cuesta
administrarla.

Lo que hay que asumir con esa opción: parches del sistema, cortafuegos
abierto solo en 80/443/SSH, SSH con clave y root deshabilitado, copias
montadas y vigiladas, y el certificado renovándose. Caddy hace lo último
solo; el resto es trabajo de alguien.

El `docker-compose.yml` ya trae el servicio `api` levantando el backend de
`server/`, con la base de datos, las copias diarias y Caddy delante:

```bash
npm run build:web       # el panel; en este montaje lo sirve Caddy
rsync -a --exclude node_modules . usuario@servidor:/opt/urkiola/
cd /opt/urkiola && cp deploy/.env.example .env   # y rellenarlo
docker compose up -d --build
```

Aquí Caddy expone la API bajo `/api`, así que la app se compila con
`EXPO_PUBLIC_API_URL=https://tu-dominio/api`.

## El panel web es una página estática

`npm run build:web` deja en `dist/` una aplicación de una sola página. La
sirve la propia API en Railway, y también podría publicarse gratis en
Cloudflare Pages o Netlify.

Importante en cualquiera de los casos: al tener rutas como
`/vehiculo/12345678`, el servidor **debe devolver `index.html` aunque el
fichero no exista**. Si no, esas direcciones dan 404 al recargar. En
`deploy/Caddyfile` está resuelto con `try_files`; en Railway lo tiene que
hacer la API, y en Cloudflare Pages o Netlify, su regla de reescritura.

## Qué hay que hacer, y en qué orden

1. ~~Escribir el backend~~. Hecho: está en [`server/`](../server), con sus
   comprobaciones. Se puede arrancar y probar en un portátil sin contratar
   nada (`npm run server`).
2. Crear el proyecto de Railway **en región europea**, conectarlo al
   repositorio y añadirle **PostgreSQL** y un **disco persistente** para las
   fotos (`URKIOLA_FOTOS` apuntando a él). El esquema lo crea el propio
   servidor al arrancar (`server/src/almacen/esquema.sql`): no hay
   migraciones que ejecutar a mano.
3. *(Solo si se prefiere separar las fotos)* crear el proyecto de Supabase,
   también en Europa, con un **bucket privado** (`urkiola-fotos`). Las fotos
   no se sirven nunca directamente desde ahí: siempre pasan por la API, que
   es donde se comprueba quién las pide.
4. Poner las variables de arriba y desplegar. Comprobar `GET /health`.
5. Apuntar `EXPO_PUBLIC_API_URL` al dominio y compilar la app con `--clear`.
6. Entorno de pruebas con su propio proyecto de Supabase.
7. **Copia semanal fuera de Railway** (`npm run copia`) y una primera
   restauración en seco para saber que sirve. Programarla, no confiar en
   acordarse.
8. Firmar los DPA y anotar los dos proveedores en el registro de
   tratamientos.
9. Dar de alta un proveedor de correo si se quiere que la gente pueda
   recuperar su contraseña sola. Sin él todo funciona igual, pero la
   restablece un administrador.

Antes de meter datos de clientes reales, leer
[`SEGURIDAD.md`](SEGURIDAD.md): dice qué está resuelto y qué hay que pedirle
a la auditoría externa.

Del 2 al 4 hace falta que las cuentas existan; el resto es trabajo nuestro.
