# Hoja de ruta

Actualizado: **15/09/2026**.

La fase de añadir funciones está en pausa. La prioridad es convertir la base auditada en un sistema de producción controlado.

| Fase | Estado | Criterio de salida |
| --- | --- | --- |
| 0. Base funcional y auditoría | **Hecha** | `main` auditado; CI completa verde; demo generada |
| 1. Staging | Siguiente | Render + Supabase separados de producción; API/web/fotos funcionando |
| 2. Recuperación y seguridad de entorno | Pendiente | backup SQL + Storage y restauración probados; 2FA/DPA/CORS/TLS revisados |
| 3. Auth | Pendiente | migración controlada a Supabase Auth sin perder autoría ni colas |
| 4. QBI Premium | Pendiente | acceso/documentación real; staging; sincronización auditable de solo lectura |
| 5. Piloto operativo | Pendiente | 20–30 coches y pocos usuarios reales; incidencias bloqueantes resueltas |
| 6. Android interno | Pendiente | AAB firmado y probado por Google Play Internal testing |
| 7. Producción Urkiola | Pendiente | entorno limpio, datos reales, responsables, recuperación y soporte definidos |
| 8. Multiempresa/comercialización | Futuro | aislamiento completo entre dos empresas demostrado |

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
