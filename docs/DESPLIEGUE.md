# Dónde alojar Urkiola Car Service

Resumen de la recomendación, con números, para decidir sin tener que ser
experto en infraestructura.

## Respuesta corta

**No empieces por AWS.** Para el tamaño real de Urkiola (5 sedes, ~450
vehículos activos, del orden de 30-60 usuarios) AWS es caro y complejo sin
aportar nada que no puedas tener por mucho menos.

La recomendación es:

| Fase | Cuándo | Dónde | Coste aprox. |
|---|---|---|---|
| **1 · Piloto y primer año** | Ahora | Un servidor (VPS) europeo con Docker | **20-35 €/mes** |
| **2 · Crecimiento** | Si hace falta alta disponibilidad o más sedes | Base de datos gestionada + contenedor gestionado (Scaleway, OVH, AWS) | 120-300 €/mes |

Lo importante: **el código no cambia entre fase 1 y fase 2.** Todo va en
contenedores con PostgreSQL y almacenamiento compatible con S3, así que
mudarse después es cambiar variables de entorno, no reescribir la
aplicación. Por eso no hay ninguna prisa en decidir hoy la fase 2.

## Comparativa

### A · VPS europeo con Docker — **recomendado para empezar**

Proveedores: Hetzner (Alemania/Finlandia), OVH (Francia/España), Scaleway
(Francia), Ionos (España).

- **Coste**: un servidor de 4 vCPU / 8 GB / 160 GB cuesta ~15-25 €/mes.
  Con copias de seguridad automáticas, ~20-30 €/mes en total.
- **Qué se instala**: PostgreSQL, la API, MinIO (almacenamiento de fotos
  compatible con S3) y Caddy (HTTPS automático). Todo con un
  `docker compose up -d`. Tienes un ejemplo listo en `deploy/`.
- **A favor**: barato, sencillo de entender, un único sitio que mirar,
  datos en la UE, portable a cualquier otro proveedor.
- **En contra**: si el servidor se cae, el servicio se cae (unos minutos de
  parada mientras se restaura). Las actualizaciones del sistema las tiene
  que hacer alguien.
- **Riesgo real**: bajo. Con copias de seguridad diarias y un `docker
  compose up` se restaura en menos de una hora.

### B · Plataforma gestionada (PaaS)

Railway, Render, Fly.io (tiene región Madrid), Scaleway Serverless.

- **Coste**: 30-80 €/mes según uso.
- **A favor**: no administras servidores; despliegas con un `git push`;
  copias de seguridad y certificados incluidos.
- **En contra**: menos control, costes que crecen rápido con el tráfico, y
  hay que comprobar la región para cumplir RGPD.
- **Cuándo elegirlo**: si prefieres no tocar nunca un servidor y no te
  importa pagar el doble que un VPS.

### C · AWS (lo previsto en el mockup, `eu-south-2` Zaragoza)

- **Coste realista** con RDS PostgreSQL (Multi-AZ), ECS Fargate, ALB, S3 y
  CloudFront: **200-400 €/mes**, antes de tráfico.
- **A favor**: región en España, alta disponibilidad real, escala sin
  límite, certificaciones de sobra para auditorías.
- **En contra**: hay que montar VPC, subredes, grupos de seguridad, IAM,
  ALB, tareas ECS, secretos... Es un proyecto en sí mismo, y luego hay que
  mantenerlo. Para 50 usuarios internos no lo justifica nada.
- **Cuándo elegirlo**: si Urkiola crece a muchas más sedes, si un cliente o
  auditoría lo exige por contrato, o si ya hay alguien en la empresa que
  gestione AWS.

### D · Supabase (PostgreSQL gestionado + autenticación + ficheros)

- **Coste**: ~25 €/mes el plan Pro, con región en la UE.
- **A favor**: te ahorra escribir buena parte del backend (autenticación,
  permisos por fila, almacenamiento de fotos, tiempo real).
- **En contra**: el modelo de datos queda algo acoplado a Supabase; salir
  después cuesta más que con un PostgreSQL propio.
- **Cuándo elegirlo**: si quieres el backend funcionando en semanas en vez
  de meses y aceptas esa dependencia.

## Lo que sí conviene decidir ya

1. **Los datos se quedan en la UE.** Cualquiera de las cuatro opciones lo
   cumple si eliges región europea. Es un requisito del RGPD porque se
   guardan datos de personas (usuarios, quién comprueba qué y cuándo).
2. **PostgreSQL**, no otra cosa. Es lo que espera el modelo de datos y lo
   que ofrecen todos los proveedores.
3. **Las fotos y albaranes van a almacenamiento de objetos** (S3, MinIO,
   Scaleway Object Storage), nunca dentro de la base de datos.
4. **Copias de seguridad diarias con retención de 30 días** y una prueba de
   restauración al mes. Esto es más importante que el proveedor que elijas.

## La parte web no necesita servidor propio

El panel web es un export estático (`npm run build:web` genera la carpeta
`dist/`). Se puede publicar gratis o casi gratis en:

- **Cloudflare Pages** o **Netlify** (gratis para este tamaño),
- el mismo VPS servido por Caddy (ya incluido en `deploy/`),
- S3 + CloudFront si acabáis en AWS.

Importante: al ser una aplicación de una sola página con rutas como
`/vehiculo/12345678`, el servidor tiene que devolver la página aunque el
fichero no exista. En `deploy/Caddyfile` ya está resuelto con `try_files`.
En Netlify/Cloudflare Pages se hace con una regla de reescritura a
`/index.html`.

## La app móvil no necesita alojamiento

Las apps de Android y iOS se distribuyen por Google Play y la App Store.
Lo único que necesitan del servidor es la API. Las actualizaciones de
JavaScript pueden publicarse sin pasar por revisión con **EAS Update**
(gratis hasta cierto volumen), lo que permite corregir un fallo el mismo
día.

## Coste total estimado del arranque

| Concepto | Coste |
|---|---|
| Servidor VPS con copias de seguridad | 20-30 €/mes |
| Dominio | ~12 €/año |
| Cuenta de desarrollador de Google Play | 25 US$ **una sola vez** |
| Programa de desarrollador de Apple | 99 US$/año |
| EAS Build (opcional, plan gratuito suficiente al principio) | 0 € |
| **Total primer año** | **≈ 400-500 €** |

Frente a los 2.400-4.800 €/año que costaría la misma aplicación sobre AWS
en alta disponibilidad.

## Cómo desplegar en la fase 1

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
(ver `eas.json`).
