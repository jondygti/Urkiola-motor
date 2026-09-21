# Distribuir la app de Android

Actualizado: **20/09/2026**.

Decisión de producto: Urkiola Car Service tendrá aplicación **Android** distribuida mediante Google Play. La demo HTML y el panel web no acreditan por sí solos que la versión nativa esté lista para tienda.

Los precios, plazos, límites de testers, requisitos de cuenta y políticas de Google Play/EAS cambian. **No se congelan aquí.** Cuando llegue esta fase hay que comprobar la documentación oficial vigente antes de pagar, configurar o publicar.

## Base ya preparada

- Expo / React Native.
- `android.package = com.urkiolamotor.carservice` en `app.config.ts`.
- perfiles EAS en `eas.json`;
- `preview` para instalación de prueba y `production` para AAB;
- almacenamiento seguro del token nativo;
- cola offline de comandos y fotos pendientes;
- `android.allowBackup=false`.

No cambiar el package después de que exista la aplicación publicada con ese identificador.

## Orden correcto

1. Estabilizar primero **staging Render + Supabase**.
2. Probar el flujo conectado en Android real: login, cámara, fotos, notificaciones, offline, reinicio, actualización y dos cuentas/dispositivos.
3. Configurar la cuenta/proyecto EAS y custodiar credenciales fuera del repositorio.
4. Crear la aplicación en Play Console siguiendo los requisitos vigentes.
5. Generar AAB firmado.
6. Empezar por el canal de pruebas interno/limitado que esté vigente en Google Play.
7. Ampliar distribución solo después del piloto.

## Configuración EAS

Antes de compilar:

- definir `EAS_PROJECT_ID` y propietario reales;
- fijar `EXPO_PUBLIC_API_URL` al staging o producción que corresponda;
- comprobar que ninguna compilación reutiliza una URL de demo/staging por caché;
- custodiar claves de firma y cualquier credencial de submit fuera de GitHub.

Comandos orientativos:

```bash
eas build --profile preview --platform android
eas build --profile production --platform android
```

Para el envío a Play, usar el mecanismo vigente de EAS/Play Console y verificar la documentación oficial en ese momento. No almacenar una cuenta de servicio o clave de publicación en el repositorio.

## Antes de cualquier publicación

Comprobar en Android real:

- acceso, cierre y recuperación de contraseña;
- expiración/cambio de cuenta;
- cámara y selector;
- cuatro fotos finales y evidencias de incidencia;
- permisos denegados/revocados;
- funcionamiento offline y reintento;
- actualización con trabajo pendiente;
- notificaciones;
- navegación desde avisos;
- compatibilidad API/app;
- que las evidencias ajenas no sean accesibles.

## Ficha, privacidad y datos

Preparar según los formularios vigentes de Google Play:

- nombre, textos e imágenes;
- política de privacidad pública;
- declaración de datos tratados;
- permisos realmente usados;
- acceso de revisión si Google lo exige;
- clasificación/contenido y público objetivo aplicables.

No declarar GPS si la app no lo usa. Las fotos de vehículos y los datos de empleados/operativa deben describirse conforme al tratamiento real del piloto/producción.

## Actualizaciones

Distinguir:

- cambios que puedan distribuirse por el mecanismo OTA compatible con la versión nativa instalada;
- cambios nativos/permisos/SDK, que exigen nueva compilación y distribución.

Antes de usar OTA en producción, definir una política de compatibilidad entre versión de app, API y estado persistido. Una actualización no puede borrar trabajo offline pendiente.

## Firma y recuperación

Usar el mecanismo de firma recomendado por Google/Expo en el momento de publicación y documentar:

- quién controla la cuenta;
- quién puede publicar;
- cómo se recupera acceso;
- dónde están las credenciales;
- procedimiento si se pierde un dispositivo/usuario con privilegios.

Ver también `MOBILE_ANDROID.md`.
