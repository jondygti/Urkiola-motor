# Seguridad de Urkiola Car Service

Actualizado: **20/09/2026**.

Este documento separa los controles que ya existen en el código de los que faltan para un despliegue real.

## Controles ya implementados

### Backend y permisos

- cada comando se autoriza en servidor;
- el `userId` enviado por el cliente se sustituye por el usuario autenticado;
- colaboradores externos tienen restricciones adicionales que no dependen de darles o quitarles permisos en la UI;
- usuarios limitados por sede reciben/operan solo su ámbito;
- transportistas externos reciben un estado recortado;
- las ubicaciones de primera y segunda llave **no se incluyen** en el estado del transportista;
- permisos y reglas de negocio se cubren con pruebas automatizadas.

### Sesiones actuales

El backend actual usa:

- contraseñas con scrypt y sal;
- JWT HMAC firmado;
- caducidad;
- invalidación al cambiar contraseña/desactivar usuario;
- recuperación con token de un solo uso y caducidad;
- rate limiting de intentos de acceso.

Esto es el estado actual del código. El objetivo de producción es **Supabase Auth**, que debe migrarse de forma explícita y probada; no se considera implementado todavía.

### API

- CORS configurable; `*` no debe usarse en producción;
- límites de tamaño de petición/fotos;
- tipos de archivo restringidos;
- cabeceras de seguridad;
- validación de forma de comandos;
- errores `4xx` reservados para comandos realmente inválidos porque el cliente los aparta de la cola;
- idempotencia por `command.id`.

### Fotos y documentos

- no se confía en una URL pública predecible ni en que el identificador sea difícil de adivinar;
- una evidencia solo se descarga si su referencia aparece en el estado autorizado de ese usuario;
- adjuntar una referencia exige autoría autenticada de la subida o acceso previo a esa evidencia;
- la subida exige un rol operativo con permiso para crear evidencia (incidencias, preparación o recepción);
- una petición fuera de ámbito responde como no encontrada y no revela que el objeto existe;
- SVG no se acepta;
- `SUPABASE_SERVICE_ROLE_KEY` es solo backend.

### Secretos

`.env`, `secrets/` y credenciales no deben entrar en GitHub. QBI, Render y Supabase usan secretos del entorno del servidor.

## Controles de negocio relevantes

- cancelaciones conservan histórico y no mueven vehículos;
- un traslado no se cierra por llegar a una sede distinta;
- traslados cancelados no generan avisos de recogida ni se reabren por reintentos;
- una empresa de transporte no ve encargos de otra;
- llaves y otros datos internos no salen al proveedor externo;
- comandos antiguos/offline no deben deshacer estados posteriores;
- zonas sin plazas numeradas son válidas y no generan posiciones falsas.

## Pendiente antes de producción

0. Antes de cargar secretos/datos reales: revisar visibilidad privada del repositorio, proteger `main` con CI/ruleset y eliminar ramas temporales fusionadas.
1. Crear staging Render + Supabase siguiendo `STAGING-CHECKLIST.md`.
2. Verificar TLS real, CORS y cabeceras en el dominio final.
3. Activar 2FA y mínimo privilegio en GitHub, Render y Supabase.
4. Migrar identidad a Supabase Auth y probar sesión, renovación, recuperación, baja y offline.
5. Validar bucket privado, service-role solo en backend y repetir las pruebas negativas de evidencia entre ámbitos contra Storage real.
6. Probar backup **y restauración** de PostgreSQL y objetos.
7. Revisar secretos y red de QBI Premium; usuario de solo lectura.
8. Auditoría externa/pentest contra staging/producción antes de introducir datos personales sensibles.
9. Revisar RGPD: DPA, región, registro de actividades, conservación y borrado.

## QBI Premium

La integración inicial será de solo lectura. Credenciales QBI viven únicamente en Render. Un fallo de QBI no debe impedir que Urkiola siga trabajando con su último estado válido.

## Multiempresa

No está implementada. Antes de un segundo concesionario hay que demostrar aislamiento negativo entre dos empresas en datos, archivos, comandos, cachés, notificaciones y configuración.

## Comprobación

```bash
npm run server:test
npm run test:sync
npm run verify:api
```

Además, GitHub Actions ejecuta roles, rutas y funciones con Chromium. La seguridad de infraestructura no queda acreditada por esas pruebas: se valida en staging/producción.
