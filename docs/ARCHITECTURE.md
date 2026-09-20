# Arquitectura de Urkiola Car Service

Actualizado: **20/09/2026**.

## Principio

Separar siempre **lo que existe hoy** de **lo que se usará en producción**.

| Área | Implementación actual | Objetivo de producción |
| --- | --- | --- |
| Código | GitHub, `main` | Igual; `main` única rama permanente |
| Cliente | Expo / React Native web + Android | Igual |
| API | Node/TypeScript en `server/` | Render |
| Base de datos | fichero local o PostgreSQL mediante adaptador | Supabase PostgreSQL |
| Identidad | scrypt + JWT propios | Supabase Auth, con migración controlada |
| Archivos | disco local o adaptador Supabase | Supabase Storage privado |
| Notificaciones | Expo push desde backend | Igual, desacoplado del dominio |
| DMS | sin integración real | Quiter AutoWeb → QBI Premium → sincronizador → Supabase/Urkiola |

La lógica de negocio se mantiene en `src/data/commands.ts` y se ejecuta tanto en cliente como en servidor. La autorización del servidor nunca depende de que el cliente haya ocultado un botón.

## Backend

La API conserva como contrato estable:

- lectura de estado autorizado;
- envío de comandos idempotentes;
- fotos/documentos protegidos;
- sesión/identidad;
- push.

El servidor procesa comandos en orden y actualmente está diseñado para **una instancia activa** con coordinación mediante PostgreSQL. Mantiene un advisory lock de sesión durante toda la vida del proceso: `DATABASE_URL` debe usar una conexión directa o un pooler compatible con sesiones, no transaction pooling. No escalar horizontalmente sin rediseñar `servicio.ts` y las garantías de orden.

## Offline e idempotencia

La aplicación puede aplicar un comando localmente sin cobertura y enviarlo después. Por eso:

- el ID del comando es estable;
- repetirlo no puede duplicar efectos;
- las entidades derivadas usan IDs deterministas;
- `cmd.at` representa cuándo ocurrió la acción;
- un comando antiguo no debe deshacer un estado posterior;
- caché, cola y rechazos se separan por servidor/cuenta.

## Ubicaciones

Sede → zona → plaza. La plaza es opcional. Una zona con cero plazas numeradas es válida y representa un parking donde se conoce la zona, no el hueco exacto.

Sondika es almacén y no prepara. Leioa, Galdakao, Anoeta e Irun son sedes de preparación según configuración.

## Ámbito comercial

El ámbito comercial es una dimensión de autorización distinta de las sedes físicas:

- `commercialArea`: responsabilidad del stock (VN o VO);
- `commercialCategory`: VN, KM0, demo o VO;
- `salesRepId`: relación estable con el usuario comercial;
- `managerId`: responsable del comercial;
- `managedBrands`: marcas dirigidas por un Director comercial.

El recorte de estado del backend aplica este ámbito antes de entregar datos al cliente. Un usuario con todas las sedes no obtiene por ello todos los vehículos si su rol es Director comercial o Responsable VO.

La clasificación comercial y la categoría se mantienen separadas deliberadamente: matrícula o kilómetros no determinan por sí solos quién responde del stock.

## Seguridad

El backend valida actor, permiso y ámbito. El transportista externo recibe estado recortado y no debe recibir datos internos como comerciales, configuración completa o ubicación de llaves.

Las evidencias no se autorizan por ser difíciles de adivinar: una foto/albarán solo se descarga si su referencia aparece en el estado que el backend está autorizado a entregar a ese usuario. La subida exige un rol operativo que realmente pueda generar evidencia.

En producción:

- secretos solo en Render/Supabase;
- service role de Supabase solo en backend;
- Storage privado;
- CORS explícito;
- TLS validado;
- 2FA en cuentas de proveedores;
- restauración probada, no solo backups existentes.

## Esquema y migraciones

El backend actual inicializa PostgreSQL mediante `server/src/almacen/esquema.sql` con operaciones idempotentes (`CREATE TABLE IF NOT EXISTS`). **Todavía no existe un sistema formal de migraciones versionadas.**

Esto es suficiente para crear el primer staging sobre una base vacía. Antes del primer cambio de esquema con datos persistentes hay que introducir migraciones versionadas, probarlas en staging y mantener recuperación mediante copia/restauración. No describir el estado actual como si ese mecanismo ya existiera.

## Supabase Auth

La autenticación propia actual funciona y está probada, pero no es el destino final decidido. La migración a Supabase Auth debe conservar:

- identidad estable del usuario de dominio;
- autoría histórica;
- permisos y membresías;
- sesiones/renovación;
- colas offline existentes;
- baja inmediata de acceso.

No migrar hashes suponiendo compatibilidad. Crear una correspondencia explícita entre identidad Supabase y usuario de Urkiola.

## QBI Premium

La empresa ha contratado **QBI Premium**. No se supone todavía qué protocolo, tablas, credenciales o frecuencia proporciona Quiter: se espera la documentación real.

Diseño objetivo:

`Quiter AutoWeb → QBI Premium → sincronizador de solo lectura en Render → staging en Supabase → mapeo/validación → dominio Urkiola`

Quiter manda en datos comerciales/DMS. Urkiola manda en logística física. Detalle en [`QBI-PREMIUM.md`](QBI-PREMIUM.md).

## Multiempresa

No está implementado. Antes de vender a un segundo concesionario:

- introducir `tenant/company` de forma consistente;
- aislar datos, archivos, cachés, comandos, notificaciones y configuración;
- probar accesos cruzados negativos;
- migrar Urkiola al primer tenant con reversión posible.

No basta con añadir una columna `companyId` a una tabla si el estado sigue siendo global.
