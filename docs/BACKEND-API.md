# Contrato del backend

Actualizado: **20/09/2026**.

El código actual está en `server/`. La especificación exacta de comandos vive en los tipos y reglas de `src/data/commands.ts`; este documento fija las garantías externas que deben mantenerse.

## Endpoints actuales

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/health` | salud |
| POST | `/auth/login` | login actual |
| POST | `/auth/password` | cambio de contraseña actual |
| POST | `/auth/olvidada` | recuperación actual |
| POST | `/auth/restablecer` | recuperación actual |
| GET | `/state` | estado autorizado del usuario |
| POST | `/commands` | aplicar un comando |
| POST | `/fotos` | subir imagen/PDF; exige rol operativo con evidencia |
| GET | `/fotos/:id` | recuperar archivo solo si la referencia forma parte del estado autorizado |
| POST | `/push/token` | asociar dispositivo |

La migración futura a Supabase Auth puede cambiar las rutas de autenticación, pero **no debe romper** las garantías de `/state`, `/commands`, permisos, offline o autoría histórica.

## Comandos

Cada acción operativa es un comando con:

- `id` único y estable;
- `type`;
- `at`;
- actor autenticado;
- payload tipado.

El servidor reemplaza cualquier `userId` del cliente por la identidad autenticada.

## Idempotencia y offline

Reglas obligatorias:

1. mismo `command.id` aplicado dos veces = mismo resultado que una vez;
2. entidades creadas desde un comando usan IDs deterministas;
3. los comandos se procesan en orden;
4. `cmd.at` conserva cuándo ocurrió una acción offline;
5. un comando antiguo no puede reabrir/deshacer un estado posterior;
6. `4xx` solo para comandos definitivamente inválidos; fallos recuperables deben permitir reintento;
7. `/state` puede pedirse en cualquier momento y el cliente reaplica encima su cola pendiente.

## Autorización

La UI no es seguridad. Backend comprueba permiso, sede/ámbito y restricciones especiales.

Transportistas:

- ven solo traslados de su empresa/asignación;
- no ven traslados con `carrierId=null`;
- no ven datos internos ajenos a su trabajo;
- no reciben ubicaciones de llaves ni metadatos del ámbito comercial;
- no pueden convertir permisos configurables en acceso administrativo.

Ámbito comercial:

- el Responsable VO recibe y puede operar comercialmente solo sobre vehículos del stock VO;
- el Director comercial recibe VN/KM0/demo de sus marcas y los VO asignados a comerciales que dependen de él;
- ambos pueden crear solicitudes de traslado o preparación únicamente sobre vehículos dentro de ese ámbito;
- `vehicle.setCommercial` permite a quien tenga `flota.editar` corregir categoría y responsable del stock;
- la autorización se comprueba en backend, independientemente de los botones que muestre el cliente.

## Reglas funcionales especialmente protegidas

- traslado solo termina al llegar al destino de esa solicitud;
- movimiento interno no cierra traslado;
- no cerrar otro traslado abierto;
- cancelación conserva histórico y no mueve el vehículo;
- solicitudes canceladas no vuelven a activarse por reintentos/entrega;
- preparaciones equivalentes no se duplican de forma incompatible;
- preparación completa y repaso son tipos distintos;
- Sondika no prepara;
- zona sin plazas numeradas es válida;
- primera/segunda llave son opcionales e independientes;
- movimientos/preparación/cancelación no infieren ni cambian llaves.

## Persistencia

El backend puede trabajar con fichero para desarrollo y PostgreSQL para entornos conectados. En producción el objetivo es Supabase PostgreSQL.

El histórico de comandos y la reconstrucción de estado son parte de la trazabilidad. El esquema actual se inicializa de forma idempotente con `server/src/almacen/esquema.sql`, pero todavía no hay un sistema formal de migraciones versionadas. Debe añadirse antes del primer cambio de esquema con datos persistentes.

El backend mantiene un advisory lock de PostgreSQL durante toda la sesión del proceso; `DATABASE_URL` debe preservar sesión y no usar transaction pooling.

## Archivos

Objetivo de producción: Supabase Storage privado. La service role solo vive en backend. Fotos/albaranes requieren autorización; no deben quedar como objetos públicos permanentes.

La autorización no se basa en conocer o no el ID: al leer una evidencia el servidor comprueba que `foto:<id>` esté referenciada por una incidencia, preparación o recepción incluida en el estado que ese usuario tiene derecho a recibir. Un objeto existente pero ajeno responde 404. La subida se limita a roles que realmente generan evidencia.

## Identidad

Actual: scrypt + JWT propios.

Objetivo: Supabase Auth. La migración debe conservar correspondencia con el usuario de dominio, autoría histórica, permisos y colas offline.

## Integración Quiter/QBI

QBI Premium ya está contratado. La integración antigua basada en imaginar un Excel o una API queda sustituida por [`QBI-PREMIUM.md`](QBI-PREMIUM.md).

Principios:

- lectura desde QBI al principio;
- staging separado;
- mapeo y validación antes de tocar el dominio;
- upsert idempotente;
- Quiter manda en datos comerciales;
- Urkiola manda en logística física;
- nunca sobrescribir ubicación, movimientos, preparación, recuentos, incidencias o llaves por una importación QBI;
- registrar cada importación y conflicto.

La forma exacta de conexión no se implementa hasta recibir la documentación real de Quiter.
