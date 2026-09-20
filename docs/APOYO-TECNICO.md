# Apoyo técnico externo

Actualizado: **20/09/2026**.

Urkiola Car Service puede seguir desarrollándose y manteniéndose desde el repositorio, pero antes de depender del sistema en producción conviene cubrir tres necesidades externas.

## 1. Revisión de seguridad

Antes de introducir datos personales sensibles, encargar una revisión independiente de:

- autenticación y sesiones;
- permisos backend y aislamiento de transportistas;
- secretos y cuentas de GitHub/Render/Supabase;
- Storage/fotos;
- backups y restauración;
- configuración TLS/CORS;
- integración QBI Premium;
- RGPD/región/DPA;
- cadena de dependencias y build.

Entregable: hallazgos por gravedad, reproducción y recomendación. Los cambios pueden aplicarse después en el repositorio y volver a revisarse.

## 2. Respaldo operativo

No hace falta guardia 24/7 para la operativa prevista. Sí es útil tener un profesional/empresa con acceso documentado y respuesta en horario laboral para:

- caída prolongada de Render/Supabase;
- corrupción o pérdida de datos;
- recuperación desde backup;
- incidente de seguridad;
- fallo de publicación Android.

El modo offline reduce el impacto de una caída de API, pero no sustituye un procedimiento de recuperación.

## 3. Continuidad

Otra persona debe poder hacerse cargo leyendo:

1. `README.md`;
2. `docs/ESTADO-ACTUAL.md`;
3. `docs/ARCHITECTURE.md`;
4. `docs/DESPLIEGUE.md`;
5. `docs/SEGURIDAD.md`;
6. `docs/QBI-PREMIUM.md`.

`main` es la única rama permanente; no hace falta rescatar información desde ramas antiguas.

## Accesos

- cuentas personales;
- mínimo privilegio;
- staging primero;
- producción solo cuando sea necesario;
- secretos en gestor de contraseñas, no WhatsApp/correo;
- 2FA;
- revocar accesos al terminar;
- no entregar la firma de Google Play salvo necesidad real.

## Monitorización mínima

- monitor externo a `/health`;
- avisos de errores/reinicios de Render;
- alertas de coste de Render/Supabase;
- alerta de backup fallido;
- alerta de sincronizador QBI detenido o con conflictos repetidos.

## Pliego corto para pedir presupuesto

> Plataforma interna de logística de vehículos para cinco sedes. React Native/Expo web + Android, API Node/TypeScript en Render y PostgreSQL/Auth/Storage en Supabase. Integración futura con Quiter mediante QBI Premium. Código en GitHub y `main` como única rama permanente. Se solicita auditoría de seguridad/infraestructura, prueba de restauración y disponibilidad de respaldo en horario laboral. No se busca reescribir la aplicación.

Los precios y condiciones deben solicitarse en el momento de contratar; no se mantienen cifras fijas en este documento.
