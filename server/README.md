# Servidor de Urkiola Car Service

Backend Node/TypeScript de la aplicación. Reutiliza `src/data/commands.ts`, por lo que web, Android y servidor comparten reglas de negocio.

## Estado

- implementado y probado localmente/CI;
- soporta fichero local y PostgreSQL;
- soporta disco local o Supabase Storage para fotos;
- autenticación actual: scrypt + JWT propios;
- objetivo de producción: Render + Supabase PostgreSQL/Auth/Storage;
- QBI Premium contratado, pero sincronizador aún no implementado.

## Local

```bash
npm install
npm run dev
```

Desde la raíz:

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080 npm run web
```

## Comprobaciones

```bash
npm test
# desde la raíz
npm run typecheck
npm run test:sync
npm run verify:api
```

## Componentes

```text
src/
  index.ts
  config.ts
  http.ts
  servicio.ts
  auth.ts
  permisos.ts
  recorte.ts
  validar.ts
  push.ts
  almacen/
pruebas/
```

## Garantías que no deben romperse

- autorización de cada comando en backend;
- `userId` tomado de la identidad autenticada, no del cliente;
- idempotencia por `command.id`;
- aplicación ordenada de comandos;
- `cmd.at` para acciones offline;
- estado recortado por usuario/transportista;
- evidencias solo legibles si están referenciadas dentro del estado autorizado del usuario;
- las URLs de imagen usan capacidades breves por archivo, nunca el JWT general de la cuenta;
- una empresa de transporte no ve a otra;
- ubicaciones de llaves no salen a transportistas;
- cancelaciones no se reabren por reintentos;
- destinos de traslado se respetan al completar;
- zonas sin plazas numeradas son válidas.

## Instancias

El diseño actual mantiene estado en memoria y un único líder escritor. Configurar **una instancia** en Render. El proceso sostiene un `pg_advisory_lock` durante su sesión PostgreSQL, por lo que `DATABASE_URL` debe usar conexión directa o pooler en modo sesión; transaction pooling no es compatible. En un redeploy, la nueva instancia pide el relevo mediante `LISTEN/NOTIFY`; la vieja drena escrituras, suelta el lock y deja de pasar `/health`, evitando dos escritores simultáneos sin bloquear el despliegue solapado de Render.

## Variables principales

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET` (mientras exista auth propia)
- `URKIOLA_ADMIN_EMAIL`
- `URKIOLA_ADMIN_PASSWORD`
- `URKIOLA_SEMILLA`
- `CORS_ORIGEN`
- `PUBLIC_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET`
- variables de correo/push.

Nunca poner secrets en `EXPO_PUBLIC_*`.

## Producción

Ver [`../docs/DESPLIEGUE.md`](../docs/DESPLIEGUE.md). Primero staging. La migración a Supabase Auth es una tarea separada y debe ser reversible.

## QBI Premium

No existe todavía `/import/quiter` de producción ni un sincronizador real. La empresa ha contratado QBI Premium y el diseño está en [`../docs/QBI-PREMIUM.md`](../docs/QBI-PREMIUM.md).

No implementar contra tablas o endpoints imaginados. Cuando Quiter entregue documentación/acceso:

1. descubrir campos reales;
2. crear staging;
3. dry-run;
4. upsert idempotente;
5. no sobrescribir logística Urkiola;
6. registrar conflictos y última sincronización.
