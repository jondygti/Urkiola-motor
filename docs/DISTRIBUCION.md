# Distribuir la app de Android

**Decisión tomada:** la app se publica en **Google Play** (25 US$, pago
único) y solo para **Android**.

Se descarta iOS: Apple exige el programa de desarrollador (99 US$/año) para
instalar en un iPhone y no hay alternativa legítima. Quien use iPhone entra
al panel web desde el navegador. La configuración de iOS está escrita en
`app.config.ts` por si algún día cambia el criterio.

## Qué cuesta

| Concepto | Coste |
|---|---|
| Cuenta de Google Play Console | **25 US$, una sola vez** |
| Compilar con EAS Build | 0 € (el plan gratuito basta para este ritmo) |
| Actualizaciones de JavaScript (EAS Update) | 0 € |
| **Total** | **≈ 23 €, una vez** |

## 0 · Preparación, una sola vez

```bash
npm install -g eas-cli
eas login
eas init                 # crea el proyecto y devuelve un projectId
eas update:configure     # activa las actualizaciones por aire (OTA)
```

Copia el `projectId` a la variable `EAS_PROJECT_ID` o a `app.config.ts`
(`extra.eas.projectId`).

En paralelo, dar de alta la cuenta de **Google Play Console**
(play.google.com/console). La verificación de identidad tarda entre uno y
varios días, así que conviene empezar por ahí. Si se registra como empresa
hará falta documentación de la sociedad.

### Antes de la primera subida

- **`android.package`** en `app.config.ts`: ahora
  `com.urkiolamotor.carservice`. Al publicar en Play **queda fijado para
  siempre**: cambiarlo después obliga a crear otra aplicación distinta,
  perdiendo instalaciones. Es el momento de decidirlo.
- **`EXPO_PUBLIC_API_URL`** en `eas.json` debe apuntar al servidor real.

> **Cuidado con la caché.** Las variables `EXPO_PUBLIC_*` se incrustan al
> compilar y Metro las cachea. Si cambias la dirección del servidor,
> compila con `--clear` o el paquete seguirá llevando la anterior dentro.

## 1 · Elegir el canal de publicación

Play tiene varios canales y esto conviene decidirlo antes, porque cambia
mucho la fricción:

| Canal | Quién la ve | Revisión | Recomendado para |
|---|---|---|---|
| **Prueba interna** | Hasta 100 correos que tú añades | Casi inmediata | **Empezar aquí** |
| Prueba cerrada | Lista de correos o grupo de Google | Ligera | Ampliar al equipo |
| Producción | Cualquiera, aparece en las búsquedas | Completa | Solo si la queréis pública |

Para una herramienta interna, **prueba interna es lo natural**: las
actualizaciones están disponibles en minutos, no hay revisión completa, y
la app no aparece en las búsquedas de Play. El equipo la instala desde un
enlace y a partir de ahí se actualiza sola como cualquier otra app.

Si en algún momento queréis que sea pública, se promociona a producción sin
volver a compilar.

`eas.json` ya viene configurado con `track: internal`.

## 2 · Compilar

```bash
# Versión de pruebas: APK que se instala por enlace, sin pasar por Play
eas build --profile preview --platform android

# Versión para Play: genera el .aab que exige la tienda
eas build --profile production --platform android
```

El perfil `preview` sigue existiendo a propósito: sirve para que una o dos
personas prueben un cambio en su móvil antes de subirlo a Play.

`autoIncrement` sube solo el `versionCode` en cada compilación de
producción, que es lo que Play exige para aceptar una versión nueva.

## 3 · Subir a Play

```bash
eas submit --profile production --platform android
```

Necesita una **cuenta de servicio de Google Cloud** con permiso sobre la
app. Se crea una vez desde Play Console (Configuración → Acceso a la API),
se descarga el JSON y se guarda en
`secrets/google-play-service-account.json`.

> Esa carpeta está en `.gitignore`. **No subas nunca ese fichero al
> repositorio**: da acceso de publicación a vuestra cuenta de Play.

**La primerísima versión hay que subirla a mano** desde Play Console: Google
no permite crear la app por API. A partir de la segunda, el comando de
arriba lo hace todo.

## 4 · Lo que pide Play para la ficha

Aunque sea prueba interna, hay que rellenar la ficha:

- **Nombre, descripción corta (80 caracteres) y descripción larga**, en
  castellano. Se puede añadir euskera después.
- **Icono de 512×512** y **gráfico destacado de 1024×500**. El icono ya está
  generado en `assets/` (`npm run icons`); el gráfico destacado hay que
  hacerlo.
- **Capturas**: mínimo 2 de teléfono. Se sacan del emulador o de un móvil
  real.
- **Política de privacidad accesible por URL pública.** Es obligatoria
  porque la app pide cámara. Basta una página en la web corporativa.
- **Formulario de seguridad de los datos**: hay que declarar qué se recoge.
  En esta app: nombre y correo del empleado, fotos de vehículos y ubicación
  *dentro de las instalaciones*. No se pide GPS: el permiso de localización
  está bloqueado a propósito en `app.config.ts`.
- **Clasificación de contenido**: un cuestionario corto. Sale «para todos
  los públicos».

## 5 · Actualizar

Dos vías, según qué cambie:

**Cambios de JavaScript** (pantallas, filtros, correcciones):

```bash
eas update --branch production --message "Nuevo filtro en Solicitudes"
```

Llega a los móviles la próxima vez que abren la app, **sin pasar por Play**
ni esperar revisión. Es la vía habitual.

**Cambios nativos** (módulos, versión del SDK, permisos, icono):

```bash
eas build --profile production --platform android
eas submit --profile production --platform android
```

En prueba interna está disponible en minutos; en producción, horas. Ocurre
pocas veces al año.

## 6 · La clave de firma

Al publicar en Play conviene activar **Play App Signing** (viene activado
por defecto en las apps nuevas): Google guarda la clave de firma final y tú
solo manejas una clave de subida.

Esto reduce bastante el riesgo: si se pierde la clave de subida, Google
puede reiniciarla. Sin Play App Signing, perder la clave significa no poder
volver a actualizar nunca esa app.

Aun así, descarga y guarda las credenciales fuera del equipo de quien
compila:

```bash
eas credentials
```

## 7 · Plazos

| Paso | Tiempo |
|---|---|
| Verificación de la cuenta de Play | 1-5 días |
| Primera compilación con EAS | 15-30 min |
| Primera subida y revisión (prueba interna) | Minutos a unas horas |
| Publicación en producción, si la hacéis pública | 1-7 días la primera vez |
| Actualizaciones siguientes | Minutos (OTA) u horas (nativas) |

Desde cero hasta tener la app instalándose desde Play: **una semana**,
casi toda esperando la verificación de la cuenta.

## 8 · Hoja de instrucciones para el equipo

1. Acepta la invitación que te llega por correo (prueba interna de Play).
2. Ábrela desde el móvil y pulsa en el enlace de descarga.
3. Instala la app desde Google Play como cualquier otra.
4. Entra con tu correo de Urkiola y tu contraseña.
5. **La app funciona sin cobertura.** En sótanos o zonas sin señal puedes
   seguir trabajando: lo que registres se guarda en el móvil y se sube solo
   en cuanto vuelva la conexión. Arriba verás cuántos cambios quedan
   pendientes.

Las actualizaciones llegan solas: no hay que reinstalar nada.
