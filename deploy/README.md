# Despliegue de staging · Render + Supabase

Este directorio describe el despliegue **vigente**. El antiguo stack Docker + MinIO + Caddy se retiró porque ya no corresponde a la arquitectura decidida.

## Qué se despliega

- **Render Web Service**: `server/Dockerfile`, con contexto de build en la raíz del repositorio.
- **Supabase staging**: PostgreSQL y Storage privados.
- **Autenticación**: temporalmente scrypt + JWT propios. Supabase Auth se migra después de validar staging.
- **Una sola instancia de backend**: el servidor mantiene el estado en memoria y sostiene un advisory lock de PostgreSQL.

## Conexión PostgreSQL

Usar una conexión que conserve **la misma sesión PostgreSQL** mientras viva el proceso, porque el backend mantiene un `pg_advisory_lock` durante toda la ejecución.

No usar un pooler en **transaction mode** para `DATABASE_URL`: podría cambiar de sesión entre consultas y romper la garantía de una única instancia. Una conexión directa o un pooler compatible con sesiones es la opción correcta.

## Render

Configuración mínima:

- Runtime: Docker.
- Dockerfile: `server/Dockerfile`.
- Build context: raíz del repositorio.
- Instancias: 1.
- Health check: `/health`.
- Variables: las de `render.env.example`, cargadas como secretos/variables de Render.
- Build arg `EXPO_PUBLIC_API_URL`: URL pública del mismo servicio si se quiere servir también el panel web desde la imagen.

No guardar valores reales en GitHub.

## Primer arranque de staging

1. Crear Supabase **staging** separado de producción.
2. Crear un bucket privado para evidencias.
3. Crear Render staging apuntando al `main` validado.
4. Configurar `URKIOLA_SEMILLA=vacia`.
5. Configurar un administrador inicial con contraseña fuerte.
6. Arrancar y comprobar `/health`.
7. Entrar con el administrador y crear únicamente usuarios/datos de prueba controlados.
8. Probar fotos, reinicio, dos dispositivos y trabajo offline.
9. Ejecutar una copia y una restauración completa en un entorno de staging vacío.

## Base de datos y cambios de esquema

El esquema actual se inicializa mediante `server/src/almacen/esquema.sql` con operaciones idempotentes. **Todavía no existe un sistema formal de migraciones versionadas.**

Esto no bloquea el primer staging sobre una base vacía. Antes de introducir cambios de esquema después de que staging contenga datos persistentes, hay que añadir un mecanismo de migraciones versionadas y probar avance/reversión o recuperación desde copia.

## Antes de datos reales

No pasar del piloto controlado hasta que estén comprobados:

- CORS/TLS/cabeceras en el dominio real;
- Storage privado y autorización de evidencias;
- backup SQL + Storage y restauración;
- 2FA y mínimo privilegio;
- repositorio y rama `main` gobernados correctamente;
- DPA/región/RGPD;
- documentación/acceso real de QBI Premium.

Ver también `docs/STAGING-CHECKLIST.md`.
