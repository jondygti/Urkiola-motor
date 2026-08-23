# Dónde alojar Urkiola Car Service

**Decisión tomada: Arsys**, un VPS con centro de datos en España y soporte
24/7 en castellano. Este documento recoge el porqué, qué hay que contratar
y cómo se despliega.

## Por qué Arsys y no otra cosa

El requisito que decidió fue **tener soporte en español**. Con eso encima
de la mesa:

| Opción | Por qué se descartó |
|---|---|
| **AWS** (`eu-south-2`, lo previsto en el mockup) | 200-400 €/mes y un proyecto de infraestructura en sí mismo. Para 5 sedes y unas decenas de usuarios no lo justifica nada |
| **Hetzner** | Lo más barato del mercado (~20 €/mes), pero solo atiende en alemán e inglés |
| **PaaS** (Railway, Render, Fly.io) | Cómodo, pero soporte en inglés y el coste crece rápido |
| **Supabase** | Ahorra backend, pero ata el modelo de datos y el soporte es en inglés |
| **Dinahosting** | Igual de válido y con fama excelente de soporte, pero arranca bastante más caro |
| **Stackscale** | Muy bueno, pensado para infraestructuras mayores; se queda grande para empezar |

Arsys reúne las tres cosas que hacían falta: datos en España, alguien que
coge el teléfono en castellano y un precio razonable para el tamaño real
del proyecto.

## Qué cubre —y qué no— el soporte

Conviene tenerlo claro desde el principio para no llevarse un chasco en la
primera incidencia:

| Capa | Ejemplo | Quién responde |
|---|---|---|
| **La máquina** | El servidor no arranca, se cayó la red, falla un disco | Arsys, incluido |
| **El sistema** | Parches del sistema operativo, Docker, PostgreSQL, copias | Solo si se contrata **servidor gestionado** (aparte) |
| **La aplicación** | Un fallo dentro de Urkiola Car Service | Urkiola o quien mantenga el software |

Si en Urkiola no va a haber nadie que actualice un servidor, merece la pena
preguntar por el servicio de **administración de sistemas**. Sube el coste
mensual, pero evita el fallo clásico: un servidor que nadie parchea durante
un año.

## Qué contratar

Para el tamaño real —unos 450 vehículos activos, 5 sedes, del orden de
30-60 usuarios— basta con poco:

| Recurso | Recomendado | Por qué |
|---|---|---|
| vCPU | 2-4 | La carga es baja y muy irregular |
| RAM | 8 GB | PostgreSQL, la API, MinIO y Caddy caben de sobra |
| Disco SSD | 120-160 GB | La base de datos crece poco; lo que crece son las fotos |
| Sistema | Ubuntu LTS o Debian | Es lo que espera el `docker-compose.yml` |
| Copias | Las del proveedor **más las propias** | Ver abajo |

Sobre el disco: la base de datos se mantendrá por debajo de 1 GB durante
años, pero las fotos de incidencias y albaranes suman del orden de 2 GB al
año. Con 120 GB hay margen largo, contando que las copias de seguridad
también ocupan.

### Antes de firmar, pregunta esto

1. ¿El soporte cubre solo la máquina o también el sistema operativo?
2. ¿Horario y canal reales? Teléfono 24/7 no es lo mismo que ticket de 9 a 18.
3. ¿Tiempo de respuesta comprometido por escrito?
4. ¿Copias incluidas? ¿Con qué retención? ¿Se pueden restaurar solos?

## Entornos

Con un solo servidor se puede tener producción y pruebas sin pagar dos
máquinas: dos proyectos de Docker Compose separados, con **bases de datos
distintas** y dos subdominios.

| Entorno | Dirección | Base de datos |
|---|---|---|
| Producción | `urkiolacarservice.com` + `/api` | `urkiola` |
| Pruebas | `pre.urkiolacarservice.com` | `urkiola_pre`, con copia de datos reales |

Lo que **nunca** debe compartirse es la base de datos. Si el proyecto crece
y las pruebas empiezan a molestar, se separa en una segunda máquina sin
tocar nada del código.

## Cómo desplegar

```bash
# 1. En tu equipo: generar la web
npm run build:web          # deja el resultado en dist/

# 2. Copiar al servidor
scp -r dist deploy docker-compose.yml usuario@servidor:/opt/urkiola/

# 3. En el servidor
cd /opt/urkiola
cp deploy/.env.example .env     # y rellenar contraseñas
docker compose up -d
```

Caddy pide y renueva el certificado HTTPS solo. A partir de ahí:

- panel web: `https://urkiolacarservice.com`
- API: `https://urkiolacarservice.com/api`
- fotos: almacenadas en MinIO, servidas por la API

Y en la app móvil basta con apuntar `EXPO_PUBLIC_API_URL` a esa dirección
(ver `eas.json`). Ojo: esa variable se incrusta al compilar, así que hay
que compilar con `--clear` si se cambia.

### Lo primero, antes de instalar nada

- Cortafuegos: abrir **solo** 80, 443 y SSH.
- SSH **con clave, no con contraseña**, y root deshabilitado.
- Actualizaciones de seguridad automáticas del sistema.
- La base de datos y MinIO **no** se exponen a internet: solo los ve la red
  interna de Docker, y así está montado en `docker-compose.yml`.

## Copias de seguridad

El `docker-compose.yml` ya hace un volcado diario de PostgreSQL con 30 días
de retención. Dos reglas que no se pueden saltar:

1. **Una copia fuera del servidor.** Las que viven en la máquina se pierden
   con la máquina. Vale otro proveedor, un disco de la oficina o el
   almacenamiento de respaldo del propio Arsys.
2. **Restaurar una vez al mes** en el entorno de pruebas. Una copia que
   nunca has restaurado no es una copia.

```bash
gunzip -c backups/urkiola-20260822-0300.sql.gz | \
  docker compose exec -T db psql -U urkiola urkiola
```

## Coste estimado del primer año

| Concepto | Coste |
|---|---|
| VPS Arsys con copias | ~30-60 €/mes (confirmar en la contratación) |
| Dominio | ~12 €/año |
| Cuenta de Google Play | 25 US$ **una sola vez** |
| EAS Build | 0 € (el plan gratuito basta) |
| **Total primer año** | **≈ 500-800 €** |

Frente a los 2.400-4.800 €/año que costaría lo mismo sobre AWS en alta
disponibilidad. La diferencia con un Hetzner (~300 €/año) son unos 300-500 €
al año: eso es lo que cuesta que alguien te atienda en castellano, y para
una empresa sin sistemas propios está bien gastado.

Si se contrata además administración de sistemas, hay que sumarlo aparte.

## Nada de esto ata el proyecto

Todo va en contenedores, con PostgreSQL y almacenamiento compatible con S3.
Si algún día hay que cambiar de proveedor —o subir a AWS porque el negocio
lo pida—, es mover contenedores y restaurar una copia, no reescribir la
aplicación. Por eso se montó así desde el principio.

## La parte web no necesita servidor aparte

El panel es un export estático (`npm run build:web`). Se sirve desde el
mismo VPS con Caddy, que es lo que ya hace `deploy/Caddyfile`. Si algún día
interesa, también puede publicarse gratis en Cloudflare Pages o Netlify.

Importante: al ser una aplicación de una sola página con rutas como
`/vehiculo/12345678`, el servidor tiene que devolver la página aunque el
fichero no exista. En `deploy/Caddyfile` está resuelto con `try_files`.

## La app móvil no necesita alojamiento

Se distribuye por Google Play (ver `docs/DISTRIBUCION.md`). Lo único que
necesita del servidor es la API. Las correcciones de JavaScript se publican
con EAS Update sin pasar por la tienda.
