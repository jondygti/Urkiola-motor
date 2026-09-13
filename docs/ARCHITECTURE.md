# Arquitectura objetivo

Decisión de Jon, 13 de septiembre de 2026. Fuente: documento
`Urkiola_Car_Service_Instrucciones_Codex_v2.pdf`. Este documento prevalece
sobre recomendaciones anteriores de proveedores. Describe un objetivo,
no una migración realizada ni un despliegue aprobado.

## Componentes y responsabilidades

| Componente | Objetivo | Situación revisada |
| --- | --- | --- |
| Código | GitHub como fuente de verdad | Repositorio existente; trabajar en ramas |
| Web y Android | Mantener Expo / React Native | Código compartido existente |
| Backend | API independiente en Render | Backend Node/TypeScript existente; sin despliegue verificado |
| Datos | Supabase PostgreSQL | Adaptador PostgreSQL existente; estado global y diario de comandos |
| Identidad | Supabase Auth | Actualmente JWT HS256 y contraseñas scrypt propios |
| Archivos | Supabase Storage | Adaptador existente; acceso a fotos autorizado por la API |
| Notificaciones | Backend decide destinatarios; envío push desacoplado | Implementación Expo existente |
| DMS | Adaptador Quiter opcional a través de la API | Sin export real ni integración implementada |

Web y Android llaman a la misma API. El backend valida identidad, permisos,
reglas, entradas y destinatarios. La lógica pura de `src/data/commands.ts`
se conserva: compartirla con el cliente permite el modo offline, pero la
autorización del cliente no sustituye a la del servidor. Separar adaptadores
de identidad, persistencia, archivos, push y DMS para evitar que las reglas
dependan de un proveedor.

## API, procesos y trazabilidad

El contrato actual está en `BACKEND-API.md`: `/state`, `/commands` y rutas
de autenticación, archivos y push. Las futuras rutas `/api/v1/vehicles`,
`/transfers`, `/preparations`, `/delivery-checks`, `/incidents` e `/inventory`
son una orientación; no se crean ahora ni se rompe el cliente existente.
Versionar cambios de contrato con un periodo de compatibilidad para móviles
que aún no se hayan actualizado.

Traslado, preparación completa y repaso de entrega son servicios distintos.
Cada ejecución necesita solicitud, responsable, estado, inicio, finalización,
observaciones, histórico y métricas propios. El repaso ya se representa por
`tipo: repaso` / `prepTipo: repaso`, con checklist y objetivo separados,
pero comparte las estructuras de preparación. No confundir esta distinción
con una separación completa del ciclo de vida: revisar búsquedas y cierres
por vehículo que no distinguen tipo antes de admitir servicios simultáneos.
«Preentrega cliente», requisito simple del checklist actual, no equivale
automáticamente a un servicio de repaso completo.

Conservar comandos deterministas e idempotentes, actor validado, fecha de
observación y fecha de recepción. El objetivo de auditoría incluye entidad,
estado anterior y nuevo, ubicaciones y correlación con el comando. No afirmar
que todos esos campos ya existen en todos los eventos; auditar cobertura.
Los snapshots aceleran la reconstrucción, no sustituyen al histórico.

## Multi-tenancy / SaaS readiness

Modelo conceptual: empresa (tenant), sedes y ubicaciones; miembros y permisos;
vehículos, servicios, archivos, eventos y configuración asociados a la empresa.
Un usuario de Supabase Auth puede tener varias membresías. El rol pertenece
a la membresía, no a un identificador global de usuario.

1. Resolver la identidad desde el token verificado y comprobar la membresía
   activa para el tenant seleccionado en cada petición. Nunca confiar en un
   `tenant_id` o rol aportado por el cliente sin esta comprobación.
2. Cada dato empresarial debe llevar `tenant_id` o una relación inequívoca,
   con claves foráneas y restricciones que impidan referencias entre empresas.
   La unicidad de VIN, matrículas e idempotencia se define por empresa cuando
   proceda; no reutilizar identificadores de vehículos globalmente por VIN-8.
3. Consultas, comandos, exportaciones, búsquedas, auditoría, tareas programadas
   y destinatarios push deben trabajar dentro de ese ámbito. También las
   cachés y colas offline: servidor + identidad + tenant. Las colas actuales
   separan servidor/cuenta, pero todavía no empresa.
4. Archivos en buckets privados con referencias y metadatos en PostgreSQL.
   Resolver pertenencia antes de descargar o firmar una URL. Un prefijo de
   ruta por empresa ayuda a organizar, pero no constituye autorización.
5. Valorar RLS como defensa adicional. El backend debe seguir autorizando;
   una clave de servicio puede eludir RLS y nunca debe estar en web/Android.
   Probar explícitamente accesos cruzados entre dos empresas, incluidos
   archivos, IDs conocidos, historial, comandos repetidos y trabajos offline.
6. Configuración por empresa: sedes, zonas, estados, tipos de servicio,
   requisitos, objetivos, roles, transportistas y reglas. Administradores de
   empresa sin acceso global implícito. No construir ahora facturación,
   suscripciones ni panel global de la plataforma.

La implementación actual NO ofrece aislamiento multiempresa. Antes de añadir
otro cliente: introducir el ámbito en repositorios y dominio, migrar los
datos de Urkiola a un tenant inicial con copia y reversión, verificar relaciones
y reconstrucción, y ejecutar pruebas negativas de separación. No basta con
añadir una columna a una tabla mientras sigue existiendo un estado global.

## Diferencias y acoplamientos concretos

| Código / documentación | Diferencia o acoplamiento | Tratamiento futuro |
| --- | --- | --- |
| `server/src/almacen/esquema.sql` | Snapshot `foto` con `id = 1`; diario y credenciales sin tenant | Particionar estado, diario e índices por empresa; migración verificable |
| `server/src/almacen/postgres.ts` | Estado en memoria, cerrojo global y una instancia escritora | Mantener una instancia hasta diseñar concurrencia; comprobar conexión compatible con cerrojos de sesión |
| Mismo adaptador | TLS remoto con `rejectUnauthorized: false` | Validar certificados y conexión real antes de producción |
| `server/src/auth.ts`, `servicio.ts` | Identidad propia y administrador inicial `u-admin` | Migrar a Auth con correspondencia estable de usuarios, historial y membresías |
| `src/data/seed.ts` | Sedes, personas, roles y empresas de ejemplo de Urkiola | Mantener como demo/plantilla de implantación, no datos globales de nuevos tenants |
| `src/data/selectors.ts` | Indicador ligado a `sondika`; comercial asociado mediante texto | Indicadores configurables y asignación por identidad estable |
| `src/data/commands.ts` | Fase especial ligada a `req-preentrega`; identificación por VIN-8 | Capacidades configurables de requisitos y ámbito empresarial de IDs |
| `app.config.ts`, `eas.json` | Marca, package y destinos de Urkiola | Decidir app compartida o variantes antes de vender; no cambiar el package publicado |
| Mejora local `CampanaCheck.tsx` | Control específico de `req-campana` | Generalizar como capacidad configurable cuando se aborde el catálogo de servicios |
| `docs/DESPLIEGUE.md` | Railway y rechazo de Supabase Auth | Referencia histórica; objetivo vigente Render + Supabase Auth |

Las mejoras de demo (campaña y separación visual de servicios) pueden estar
en el árbol de trabajo antes de su publicación. No equivalen a multi-tenancy
ni a cambios ya incorporados en `main`.

## Identidad, archivos e integración

Migrar Auth mediante una fase específica: asociar identidad externa al usuario
de dominio, validar emisor/audiencia/firma/expiración, gestionar renovación y
baja, y definir el primer acceso. No trasladar hashes existentes asumiendo
compatibilidad ni perder la autoría histórica o las colas al cambiar los IDs.
Permisos configurables bajo mínimo privilegio, incluyendo aislamiento de
transportistas; perfiles orientativos del PDF no son nuevos roles implantados.

Respaldar y restaurar tanto PostgreSQL como objetos de Storage. El script
actual no copia objetos de Supabase; disponer de una copia de la base de datos
no basta para recuperar fotografías y albaranes. Probar restauración completa.

Quiter -> adaptador del backend -> validación y mapeo -> persistencia.
Registrar cada importación, conflictos, origen y resultado; no sobrescribir
observaciones físicas posteriores. Esperar documentación/export real y no
inventar endpoints de Quiter. Permitir otros DMS sin alterar el núcleo.
