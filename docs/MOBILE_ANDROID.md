# Android y Google Play

Actualizado: **20/09/2026**.

Requisito obligatorio del PDF v2 de Jon: aplicación Android publicable en
Google Play. Conservar Expo / React Native y el backend compartido con web.
La demo HTML no acredita funcionamiento nativo ni preparación para la tienda.

## Base existente

- `app.config.ts`: package estable `com.urkiolamotor.carservice`, iconos,
  splash y permisos. No cambiar ese identificador tras publicar.
- `eas.json`: perfiles development, preview (APK) y production (AAB).
- Proyecto EAS aún con identificador de ejemplo si no se configura la variable
  real. Las direcciones de API de los perfiles requieren comprobación.
- Cola offline para comandos y **cola persistente de fotos pendientes**: la app conserva una copia privada, la sube cuando vuelve la red y no la elimina hasta que el comando queda confirmado.

## Criterios antes de distribuir

1. Configurar proyecto EAS, propietario, backend de pruebas y firma Android.
   Custodiar credenciales y claves fuera del repositorio, con acceso y
   recuperación documentados. Generar AAB de producción y probar primero
   la distribución interna de Google Play.
2. Gestionar `versionCode`, versión visible y compatibilidad entre API,
   esquema persistido y actualizaciones OTA. Migrar caché sin borrar trabajo.
3. Validar inicio, expiración, renovación y cierre de sesión; evaluar
   almacenamiento seguro de tokens nativos y migración desde persistencia
   actual. La adopción de Supabase Auth es un trabajo pendiente.
4. Probar cámara, selector de fotos, permisos denegados, subida fallida,
   notificaciones, reinicio y navegación desde avisos en Android real.
   Mantener solo permisos necesarios y manejar su revocación.
5. Probar corte de red, reintentos, duplicados, dos dispositivos, actualización
   con trabajo pendiente y cambios de cuenta. Cuando exista multiempresa,
   añadir cambio de tenant sin mezclar datos.
6. Preparar política de privacidad, información de datos tratados y ficha de
   tienda. Comprobar en documentación oficial los requisitos vigentes de Play,
   Android objetivo, acceso de revisión y eliminación de cuenta cuando aplique
   en el momento de publicar; no congelar aquí versiones o plazos no verificados.

Uso operativo: localización, movimientos, traslados, preparación, repaso,
incidencias, fotos, albaranes, inventarios, estados, consultas y notificaciones.
Los permisos del servidor se aplican igualmente a la app móvil.

`DISTRIBUCION.md` contiene el procedimiento vigente sin congelar precios/plazos de tienda. No se ha generado un AAB, registrado una cuenta de Play ni publicado una versión con este cambio.
