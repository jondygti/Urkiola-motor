# Despliegue definitivo: Render + Supabase

Actualizado: **15/09/2026**. Sustituye las recomendaciones antiguas de Railway o VPS como destino principal.

## Objetivo

- **Render**: API/backend.
- **Supabase**: PostgreSQL, Auth y Storage.
- **GitHub**: fuente del despliegue y CI.
- **Google Play**: Android.

No hay despliegue de producción realizado todavía.

## Entornos

Mantener al menos dos entornos totalmente separados:

| Entorno | Render | Supabase | Uso |
| --- | --- | --- | --- |
| staging | servicio propio | proyecto propio | pruebas y piloto |
| production | servicio propio | proyecto propio | operativa real |

Nunca usar la base de producción para pruebas.

## Orden recomendado

1. Crear proyecto Supabase de **staging** en región europea adecuada.
2. Crear servicio Render de **staging** conectado a GitHub.
3. Configurar PostgreSQL y Storage; mantener autenticación actual mientras se valida la infraestructura.
4. Probar API, web, dos dispositivos, fotos, reinicios y restauración.
5. Ejecutar la migración a Supabase Auth en una tarea separada y reversible.
6. Conectar QBI Premium a staging cuando Quiter entregue documentación/acceso.
7. Hacer piloto con pocos usuarios/coches.
8. Repetir configuración limpia para production.

## Render

El backend se construye desde `server/`/Docker según la configuración del repositorio. Mientras el servidor mantenga el modelo de estado actual, usar **una instancia activa**.

Variables mínimas mientras siga la autenticación actual:

- `DATABASE_URL`
- `JWT_SECRET`
- `URKIOLA_SEMILLA=vacia`
- `URKIOLA_ADMIN_EMAIL`
- `URKIOLA_ADMIN_PASSWORD`
- `CORS_ORIGEN`
- `PUBLIC_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET`
- variables de correo y push cuando se activen.

`SUPABASE_SERVICE_ROLE_KEY` nunca entra en web/Android.

Cuando se migre a Supabase Auth, retirar las variables y endpoints propios solo después de confirmar compatibilidad con móviles instalados y autoría histórica.

## Supabase

### PostgreSQL

- esquema versionado;
- conexiones TLS verificadas;
- backups automáticos + copia externa;
- restauración periódica en staging;
- no aplicar cambios manuales en producción sin migración reproducible.

### Storage

- bucket privado;
- archivos servidos/autorizados por backend o mediante URLs firmadas de corta duración;
- backup de objetos separado del backup SQL.

### Auth

Es objetivo de producción, no estado actual. La migración debe probar login, renovación, cierre, recuperación, baja de usuario, cambio de cuenta y trabajo offline pendiente.

## Web

`npm run build:web` genera la web. `EXPO_PUBLIC_API_URL` se incrusta al compilar: staging y production requieren compilaciones con su URL real y `--clear`.

## Android

Primero `preview`/prueba interna; después AAB production. Ver `MOBILE_ANDROID.md`.

## Copias y restauración

Antes de datos reales:

- copia SQL fuera de Supabase;
- copia de Storage fuera del mismo proveedor;
- restauración completa probada en staging;
- procedimiento escrito de recuperación;
- responsables y accesos definidos.

Una copia no probada no cuenta como recuperación validada.

## Observabilidad

Configurar antes del piloto:

- `/health` monitorizado externamente;
- alertas de errores y reinicios de Render;
- alertas de uso/coste;
- fallo de backups;
- registro de ejecuciones del futuro sincronizador QBI.

## Seguridad operativa

- 2FA en GitHub, Render y Supabase;
- cuentas personales, no compartidas;
- secretos fuera del repositorio;
- mínimo privilegio;
- acceso temporal a producción;
- DPA/región/registro RGPD revisados antes de datos personales reales.
