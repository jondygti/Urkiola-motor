# Hoja de ruta

Actualizado: **20/09/2026**.

La fase de añadir funciones está en pausa. La prioridad es convertir la base auditada en un sistema de producción controlado.

| Fase | Estado | Criterio de salida |
| --- | --- | --- |
| 0. Base funcional y auditoría | **Hecha** | `main` auditado; persistencia demo corregida; ámbitos/evidencias protegidos; CI completa verde; demo generada |
| 1. Staging | **Siguiente** | Gobierno GitHub revisado; Render + Supabase separados de producción; API/web/fotos funcionando; reinicio y dos dispositivos probados |
| 2. Recuperación y seguridad de entorno | Pendiente | copia completa (PostgreSQL + Storage) y restauración probadas; 2FA/DPA/CORS/TLS revisados |
| 3. Auth | Pendiente | migración controlada a Supabase Auth sin perder autoría ni colas |
| 4. QBI Premium | Pendiente | acceso/documentación real; staging; sincronización auditable de solo lectura |
| 5. Piloto operativo | Pendiente | 20–30 coches y pocos usuarios reales; incidencias bloqueantes resueltas |
| 6. Android interno | Pendiente | AAB firmado y probado por Google Play Internal testing |
| 7. Producción Urkiola | Pendiente | entorno limpio, datos reales, responsables, recuperación y soporte definidos |
| 8. Multiempresa/comercialización | Futuro | aislamiento completo entre dos empresas demostrado |

## Puerta de entrada a staging

Seguir [`STAGING-CHECKLIST.md`](STAGING-CHECKLIST.md). Antes de secretos o datos reales hay tres ajustes de GitHub que no dependen del código: decidir visibilidad privada del repositorio, proteger `main` mediante ruleset/CI y limpiar ramas temporales fusionadas.

El primer staging parte de base vacía. El esquema actual se inicializa de forma idempotente, pero todavía no existe un sistema formal de migraciones versionadas; debe añadirse antes del primer cambio de esquema con datos persistentes.
## QBI

QBI Premium ya está contratado. No programar contra una estructura inventada: primero obtener de Quiter la documentación, método de conexión/exportación y campos disponibles. Ver `QBI-PREMIUM.md`.

## Criterio para no volver a desarrollar de más

Durante staging y piloto solo se corrigen:

- errores;
- problemas de seguridad;
- bloqueos operativos;
- incompatibilidades con datos reales.

Las mejoras de comodidad se anotan y se priorizan después del piloto.

## Antes de un segundo cliente

Multiempresa sigue siendo obligatoria antes de vender el sistema a otro concesionario. No añadir facturación, suscripciones o panel SaaS antes de demostrar aislamiento real.
