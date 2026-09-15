# Estado actual de Urkiola Car Service

Actualizado: **15 de septiembre de 2026**.

Este documento responde a una pregunta: **¿qué está realmente hecho hoy?** No mezcla planes futuros con implementación actual.

## Rama oficial

`main` es la única rama permanente y la fuente de verdad. Las ramas históricas de Claude/Codex/Astra no deben conservarse como archivo: commits y PRs mantienen el historial.

## Base funcional cerrada

La aplicación dispone de:

- web y Android sobre Expo / React Native;
- backend Node/TypeScript en `server/`;
- lógica de negocio compartida en `src/data/commands.ts`;
- persistencia local y cola offline;
- idempotencia por `command.id`;
- roles, permisos y recorte de estado en backend;
- sedes, zonas y plazas configurables, incluidas zonas sin plazas numeradas;
- flota VN/VO, comercial, ubicaciones, movimientos e histórico;
- traslados con empresa de transporte, recogida, entrega y rutas;
- flujo de llaves para traslados desde Sondika: Logística las prepara en Leioa, queda registrado quién y cuándo, y el transportista no puede recoger ni mover el coche hasta que estén listas;
- preparación completa y repaso;
- cancelaciones con histórico, motivo, autor y fecha;
- ubicación opcional e independiente de primera y segunda llave;
- recepción de camiones y albaranes;
- incidencias con fotos;
- recuentos;
- notificaciones y barridos programables desde el servidor;
- entrega al cliente y salida de flota activa.

## Flujo de llaves Sondika → transporte

Cuando se solicita un traslado de un vehículo cuyo origen es Sondika:

1. la solicitud entra en la cola **Llaves por preparar** de Logística;
2. Logística pulsa **Llaves preparadas** cuando las ha dejado listas en **Leioa · Logística**;
3. la solicitud guarda `keysReadyAt` y `keysReadyBy`, independientes de la ubicación física principal/secundaria de las llaves del vehículo;
4. el transportista ve el coche en **Por recoger**, pero no puede registrar la recogida mientras las llaves sigan pendientes;
5. al pulsar **He recogido las llaves** empieza el plazo de transporte configurado, actualmente basado en `pickedUpAt` y `dueAt`;
6. después recoge el coche en Sondika y lo entrega en el destino usando el flujo normal de traslado.

La restricción está tanto en la lógica compartida como en la autorización del backend: no se puede saltar llamando directamente a la API ni registrando el movimiento antes de la recogida. Una solicitud histórica con estado `asignada` pero sin `keysReadyAt` se considera **llaves pendientes**, para no dar por preparado algo que no tiene trazabilidad real.

Cancelar el traslado lo saca de la cola activa, pero no borra el histórico de que las llaves se hubieran preparado. Preparar, recoger, cancelar o completar un traslado no modifica por sí mismo `primaryKeyLocation` ni `secondaryKeyLocation`.

## Auditoría funcional más reciente

La revisión final incorporada a `main` añadió regresiones y corrigió, entre otros, estos bordes:

- no cerrar un traslado por llegar a otra sede o por un movimiento interno;
- no cerrar otro traslado abierto por error;
- conservar `carrierId` y aislamiento por empresa de transporte;
- excluir `carrierId=null` de transportistas externos;
- impedir duplicados incompatibles de traslado/preparación;
- preservar cancelaciones frente a entregas o reintentos posteriores;
- no generar avisos de recogida de traslados cancelados;
- impedir que ubicaciones de llaves viajen en el estado recortado del transportista;
- mantener independientes las dos llaves incluso con comandos offline que llegan fuera de orden;
- exigir preparación explícita de llaves en traslados desde Sondika y conservar fecha/autor;
- impedir que un transportista salte la recogida mediante un movimiento directo;
- mantener el flujo anterior para traslados cuyo origen no sea Sondika;
- coherencia de zonas sin plazas, recepción, recuentos y capacidad;
- evitar que Sondika se proponga como sede de preparación.

## Validación

Cada cambio funcional se valida en GitHub Actions con:

- TypeScript;
- pruebas del servidor;
- sincronización/offline;
- navegación demo;
- Chromium API;
- Chromium roles;
- Chromium funciones;
- Chromium rutas;
- generación y publicación de la demo.

Los totales de asserts no se fijan en documentación: deben consultarse en el log del commit correspondiente.

## Lo que NO está hecho todavía

- despliegue real en Render;
- proyectos definitivos de Supabase para staging/producción;
- migración de la autenticación propia a Supabase Auth;
- prueba real de PostgreSQL/Storage en el entorno elegido;
- copias y restauración completa probadas en producción;
- integración QBI Premium;
- importación automática del stock real de Quiter;
- piloto operativo con usuarios y coches reales;
- AAB final y publicación en Google Play;
- aislamiento multiempresa/SaaS.

## Decisiones vigentes

- Producción: **Render + Supabase**.
- Android: Google Play, empezando por prueba interna.
- Quiter: **QBI Premium ya contratado**; integración de solo lectura al principio.
- Multiempresa: preparar la arquitectura, pero no activar un segundo cliente hasta tener aislamiento probado.
- No añadir funciones nuevas por defecto: priorizar despliegue, datos reales y piloto.
