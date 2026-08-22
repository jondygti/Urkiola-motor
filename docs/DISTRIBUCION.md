# Distribuir la app de Android

**Decisión tomada:** la app se distribuye solo para **Android** y **sin
pasar por Google Play**, para no asumir costes de tiendas. Este documento
explica cómo se hace y qué implica.

Se descarta iOS: Apple no permite instalar una app en un iPhone sin el
programa de desarrollador (99 US$/año) y no existe alternativa legítima.
Quien use iPhone entra al panel web desde el navegador.

## Qué cuesta esto

| Concepto | Coste |
|---|---|
| Compilar con EAS Build | 0 € (el plan gratuito basta para este ritmo) |
| Distribuir el APK | 0 € (enlace, correo o intranet) |
| Actualizaciones de JavaScript (EAS Update) | 0 € |
| **Total** | **0 €** |

## 0 · Preparación, una sola vez

```bash
npm install -g eas-cli
eas login
eas init                 # crea el proyecto y devuelve un projectId
eas update:configure     # activa las actualizaciones por aire (OTA)
```

Copia el `projectId` a la variable `EAS_PROJECT_ID` o a `app.config.ts`
(`extra.eas.projectId`).

Revisa antes de la primera compilación:

- `android.package` en `app.config.ts`: ahora `com.urkiolamotor.carservice`.
  Al no publicar en Play se puede cambiar más adelante sin perder nada,
  pero cambiarlo obliga a desinstalar y reinstalar en todos los móviles.
  Mejor acertar ya.
- `EXPO_PUBLIC_API_URL` en `eas.json`: debe apuntar al servidor real.

> **Cuidado con la caché.** Las variables `EXPO_PUBLIC_*` se incrustan en
> el código al compilar y Metro las cachea. Si cambias la dirección del
> servidor, compila con `--clear` o seguirás llevando la anterior dentro.

## 1 · Compilar el APK

```bash
# Versión de pruebas, contra el servidor de preproducción
eas build --profile preview --platform android

# Versión real, contra el servidor de producción
eas build --profile production --platform android
```

EAS devuelve un enlace de descarga y un código QR. Ambos perfiles generan
un **APK** (no un `.aab`, que solo sirve para Play).

La primera vez EAS genera y guarda la clave de firma (*keystore*).
**Consérvala:** si se pierde, los móviles no aceptarán la actualización y
habrá que desinstalar y reinstalar en todos. Descárgala y guárdala fuera
del ordenador de quien compila:

```bash
eas credentials
```

## 2 · Instalarlo en los móviles

Tres formas, de menos a más cómoda:

1. **Enlace o QR de EAS.** El más rápido para empezar. El enlace caduca,
   así que sirve para pruebas, no como método permanente.
2. **El APK colgado en la intranet o en la web corporativa**, en una URL
   fija tipo `https://urkiolacarservice.com/app`. Es lo recomendable: cada
   móvil nuevo entra ahí y se lo baja.
3. **Un gestor de dispositivos (MDM)** si en algún momento los móviles son
   de empresa: la app se instala sola, sin que el usuario haga nada.

En cualquiera de las tres, la primera vez Android pide permiso para
**«instalar aplicaciones desconocidas»**. Es un permiso por aplicación
(normalmente para Chrome o para el gestor de archivos) y se concede una
sola vez. Conviene explicarlo en la hoja de instrucciones del equipo,
porque el aviso asusta si no se espera.

Google Play Protect puede mostrar además un aviso al instalar. Se acepta y
no vuelve a salir.

## 3 · Actualizar sin reinstalar

Aquí está lo bueno de no depender de la tienda: **las actualizaciones de
JavaScript llegan igual**, aunque el APK se haya instalado a mano.

```bash
eas update --branch production --message "Nuevo filtro en Solicitudes"
```

El operario lo tiene la próxima vez que abre la app. Sin descargar nada,
sin reinstalar.

Solo hace falta repartir un APK nuevo cuando cambia algo **nativo**:

- añadir o quitar un módulo (cámara, notificaciones…),
- subir la versión del SDK de Expo o de React Native,
- cambiar permisos, icono o nombre de la app.

Eso ocurre pocas veces al año. Todo lo demás va por aire.

## 4 · Lo que se pierde por no usar Play

Conviene tenerlo claro, aunque ninguna sea grave para uso interno:

| Se pierde | Alcance real |
|---|---|
| Instalación en un toque | Hay que permitir orígenes desconocidos una vez |
| Actualización automática del APK | Solo afecta a los cambios nativos, pocos al año |
| Aviso de nueva versión | Se suple con el control de versión mínima (ver `docs/MANTENIMIENTO.md`) |
| Estadísticas de instalación y errores | Habrá que mirarlas en el servidor |

Si algún día cambia de opinión, publicar en Play cuesta **25 US$ una sola
vez** y el proyecto ya está preparado: bastaría con cambiar
`buildType` a `app-bundle` en `eas.json` y añadir la sección `submit`.
Lo mismo con iOS y sus 99 US$/año: la configuración de `app.config.ts` ya
está escrita, incluidos los textos de permisos que exige Apple.

## 5 · Hoja de instrucciones para el equipo

Lo que hay que contarle a quien va a usar la app:

1. Abre este enlace desde el móvil: *(la URL del APK)*.
2. Descarga el fichero y ábrelo.
3. Android pedirá permiso para instalar desde esa aplicación: acéptalo.
4. Si aparece un aviso de Play Protect, pulsa «Instalar de todos modos».
5. Entra con tu correo de Urkiola y tu contraseña.
6. **La app funciona sin cobertura.** En sótanos o zonas sin señal puedes
   seguir trabajando: lo que registres se guarda en el móvil y se sube solo
   en cuanto vuelva la conexión. Arriba verás cuántos cambios quedan
   pendientes.
