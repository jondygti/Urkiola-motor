# Hoja de ruta

Referencia: instrucciones v2 de Jon y `ARCHITECTURE.md`, 13/09/2026.
Esta entrega documenta el objetivo; no contrata, migra ni despliega servicios.

| Fase | Trabajo | Criterio de salida |
| --- | --- | --- |
| 1. Validar operativa | Demo, campañas, preparación y repaso; revisar cierres y solicitudes por tipo | Jon valida recorridos; pruebas con datos guardados y servicios distintos |
| 2. Entorno de pruebas | Render + Supabase PostgreSQL/Storage, secretos y TLS | API y dos dispositivos probados; restauración de datos y archivos verificada |
| 3. Identidad | Supabase Auth y membresías; migración de usuarios/sesiones | Autoría conservada, recuperación y permisos probados; colas preservadas |
| 4. Aislamiento empresarial | Tenant en entidades, consultas, almacenamiento, tareas y configuración | Pruebas con dos empresas sin acceso cruzado ni colisiones |
| 5. Android | EAS, AAB, firma, privacidad y canal interno | Pruebas reales y requisitos vigentes de Play comprobados |
| 6. Primera implantación | Validación operativa, seguridad, soporte y recuperación | Entorno aprobado para uso real; sin cuentas ni datos demo |
| 7. Quiter y evolución comercial | Export real, adaptador DMS, catálogo configurable | Importación auditable; segundo cliente sin bifurcar el núcleo |

La fase de aislamiento es obligatoria antes de admitir un segundo cliente.
No añadir ahora facturación, suscripciones ni administración global SaaS.
No cambiar frameworks ni crear todas las tablas/rutas por anticipación.

## Estado y límites conocidos

El backend dispone de pruebas de dominio y sincronización, pero en este
entorno siguen pendientes las pruebas visuales completas, Android real y
PostgreSQL. El intento de descargar Chromium falló. No confundir compilación
correcta con recorrido visual comprobado. Los límites de la primera entrega
están en `CONTINUIDAD.md`.

Prioridades técnicas: aislamiento del estado global, migración controlada de
Auth, certificados TLS, copias de Storage y diferenciación completa del ciclo
de vida de los servicios. Ninguna se considera resuelta solo por documentarla.
