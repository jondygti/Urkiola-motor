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
- preparación completa y repaso;
- cancelaciones con histórico, motivo, autor y fecha;
- ubicación opcional e independiente de primera y segunda llave;
- recepción de camiones y albaranes;
- incidencias con fotos;
- recuentos;
- notificaciones y barridos programables desde el servidor;
- entrega al cliente y salida de flota activa.

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
- coherencia de zonas sin plazas, recepción, recuentos y capacidad;
- evitar que Sondika se proponga como sede de preparación.

## Validación

El último árbol funcional previo a esta actualización documental pasó en GitHub Actions:

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
