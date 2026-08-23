# Dónde alojar Urkiola Car Service

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
| **Identidad** | Supabase Auth | Contraseñas, recuperación y sesión. Los roles y permisos siguen siendo nuestros |
| **API** | Railway | El servicio que recibe los comandos y aplica las reglas de negocio |
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

Variables del servicio de la API (en Railway → Variables):

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Supabase. Para un proceso Node de larga vida, la conexión directa o el *session pooler*, no el de transacciones |
| `SUPABASE_URL` | Dirección del proyecto, para Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio. **Solo en el servidor**, nunca en la app |
| `SUPABASE_JWT_SECRET` | Para validar el token de sesión del usuario |
| `ALLOWED_ORIGIN` | El dominio del panel web |

Y en la app móvil, `EXPO_PUBLIC_API_URL` apuntando a la API (ver
`eas.json`). Ojo con lo de siempre: esa variable **se incrusta al compilar
y Metro la cachea**, así que al cambiarla hay que compilar con `--clear`.

> Ninguna de estas claves va al repositorio. `secrets/` y `.env` están en
> `.gitignore` y deben seguir estándolo.

## Copias de seguridad

Supabase Pro hace **copias diarias con 7 días de retención**, y el punto de
restauración continuo (PITR) es un extra de pago. Con eso no basta. Las dos
reglas de siempre:

1. **Una copia fuera de Supabase.** Un volcado semanal con `pg_dump` a otro
   sitio —el almacenamiento de otro proveedor o un disco de la oficina—.
   Si un día se pierde el acceso a la cuenta, las copias que viven dentro
   se pierden con ella.
2. **Restaurar una vez al mes** en el proyecto de pruebas. Una copia que
   nunca has restaurado no es una copia.

```bash
# volcado manual desde cualquier equipo con psql instalado
pg_dump "$DATABASE_URL" --no-owner --format=custom > urkiola-$(date +%F).dump

# restaurar en el proyecto de pruebas
pg_restore --clean --no-owner --dbname "$DATABASE_URL_PRE" urkiola-2026-08-23.dump
```

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

```bash
npm run build:web
scp -r dist deploy docker-compose.yml usuario@servidor:/opt/urkiola/
cd /opt/urkiola && cp deploy/.env.example .env && docker compose up -d
```

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

1. Crear el proyecto de Supabase **en región europea** y guardar las claves.
2. Crear el proyecto de Railway, conectarlo al repositorio y elegir Europa.
3. Escribir el backend contra [`BACKEND-API.md`](BACKEND-API.md) y las
   migraciones de las tablas.
4. Apuntar `EXPO_PUBLIC_API_URL` al dominio y compilar la app con `--clear`.
5. Entorno de pruebas con su propio proyecto de Supabase.
6. Volcado semanal fuera de Supabase y primera restauración de prueba.
7. Firmar los DPA y anotar los dos proveedores en el registro de
   tratamientos.

Los puntos 3 a 6 son trabajo nuestro y están pendientes; los otros son de
alta de cuenta.
