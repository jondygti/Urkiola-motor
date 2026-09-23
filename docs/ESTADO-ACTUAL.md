# Estado actual de Easo Logistics

Actualizado: **20 de septiembre de 2026**.

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
- flota VN/VO, clasificación comercial (VN/KM0/demo/VO), comercial, ubicaciones, movimientos e histórico;
- ámbito comercial con Director comercial por marcas y Responsable VO;
- relación comercial → responsable, para que un Director VN incluya también los VO vendidos por su equipo;
- comercial visible para preparación y para la operativa interna de traslados;
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

## Ámbito comercial

La responsabilidad comercial se separa de la persona que vende el coche:

- **Responsable VO**: ve todo el stock cuyo área comercial es VO, aunque lo venda un comercial de VN.
- **Director comercial**: ve el stock VN/KM0/demo de las marcas que tenga asignadas y, además, los VO asignados a comerciales que dependan de él.
- **Comercial**: conserva su relación individual con cada vehículo mediante un identificador estable; el nombre de comercial se mantiene por compatibilidad con Quiter y datos históricos.
- Director comercial y Responsable VO pueden **solicitar traslados y preparaciones** dentro de su ámbito. El backend rechaza solicitudes sobre coches fuera de él.
- La categoría (VN, KM0, demo, VO) es independiente del responsable del stock (VN o VO). Esto permite que un demo matriculado siga bajo Dirección VN o que pase explícitamente a VO.
- Logística/administración pueden corregir esa clasificación desde la ficha del vehículo.
- El transportista externo no recibe comercial, jerarquía ni clasificación comercial en su estado recortado.

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

## Cierre de etapa antes de staging (20/09/2026)

La auditoría de cierre deja como siguiente trabajo real **infraestructura y piloto**, no más funciones de negocio.

Hallazgos ya corregidos en código/documentación:

- persistencia de demos entre versiones;
- autorización de lectura/subida de evidencias;
- retirada del despliegue Docker/MinIO legado;
- guía única para Render + Supabase y checklist de staging.

Pendientes que requieren configuración externa y no se resuelven con un commit:

- el repositorio GitHub está actualmente público;
- `main` no tiene ruleset/protección;
- no está activo el borrado automático de ramas fusionadas Las ramas temporales históricas se comprobaron eliminadas el 22/09/2026.

Antes de introducir secretos o datos reales, revisar estos tres puntos en GitHub.

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

## Revisión del ámbito comercial (20/09/2026)

- El ámbito se exige antes de los permisos particulares, también si se amplía un rol.
- Una asignación por ID no puede usarse para asignar a otra persona ni arrebatar un vehículo.
- Los nombres históricos ambiguos no amplían el ámbito del director; se resuelven mediante ID o coincidencia única.
- Los usuarios externos tampoco reciben jerarquía ni marcas gestionadas.
- Preparación y traslados internos muestran el usuario comercial enlazado; el texto histórico sirve de respaldo.
- La semilla de presentación usa VN Stellantis: Dirección Peugeot/Citroën y Dirección Opel/Fiat/Jeep, con ejemplos KM0 y DEMO deterministas; VO sigue siendo multimarca.
- Chromium comprueba ambos responsables, URLs ajenas, edición persistente de clasificación y operaciones comerciales por API real.

- La restauración de sesión sin caché espera a recuperar la cuenta antes de habilitar rutas, conservando los enlaces directos. Con caché se mantiene el arranque offline inmediato.
- La demo solo acepta un estado persistido de su versión exacta (v25 actualmente) y re-vincula la sesión con el usuario canónico actual; una demo antigua ya no puede ocultar una semilla nueva.
- Las evidencias fotográficas/albaranes se sirven únicamente si la referencia aparece en el estado autorizado del usuario; conocer un ID no da acceso fuera de su ámbito.


## Evidencias y reintentos (22/09/2026)

- Adjuntar una evidencia exige que sea una subida del propio usuario o una referencia ya incluida en su estado autorizado. Conocer un identificador ajeno no permite incorporarlo a una incidencia propia.
- Las nuevas subidas llevan autoría autenticada en su identificador opaco; no depende de memoria del proceso ni cambia el contrato `foto:<id>`. Las fotos históricas ya referenciadas siguen funcionando dentro de su ámbito.
- Las subidas pendientes anteriores a esta corrección, sin autoría verificable ni referencia autorizada, deben subirse de nuevo. Una rotación de `JWT_SECRET` invalida también la autorización de subidas todavía pendientes; las evidencias confirmadas conservan acceso por ámbito.
- Solo un 404 de Storage representa ausencia. Otros errores de lectura producen un fallo reintentable; no apartan el comando offline como inválido. Los errores de disco distintos de archivo ausente tampoco se ocultan.
- Se prueban acceso cruzado, autoría, reinicio, compatibilidad histórica, error temporal HTTP y reintento sin duplicación.

## Nombre comercial (23/09/2026)

La aplicación se llama **Easo Logistics**, para el Grupo Easo. Se actualizan el nombre visible web/Android, acceso, navegación, demo y comunicaciones. Los identificadores de aplicación, repositorio, enlaces, correos configurados y claves de almacenamiento se conservan para mantener compatibilidad con instalaciones y datos existentes.

## Pruebas de orden temporal de traslados

Un movimiento recibido tarde solo completa una solicitud si ocurrió después de su creación y no antes de la recogida de llaves. La ubicación física observada se conserva, pero no se atribuye una llegada antigua a un encargo posterior. Se comprueba en la lógica compartida y el servicio backend, incluyendo reintento idempotente de la llegada válida.

La prueba aleatoria ampliada detectó también roles eliminados con reglas de avisos todavía vinculadas. Ahora se impide su borrado en la lógica compartida, backend y administración hasta retirar o cambiar esas reglas, incluidas las inactivas.
