# Publicar en Google Play y en la App Store

La app está preparada para compilarse y subirse a las dos tiendas desde el
mismo código. Se usa **EAS Build** (el servicio de compilación de Expo),
que compila también para iOS sin necesidad de tener un Mac.

## 0 · Lo que hay que tener antes

| Requisito | Dónde | Coste | Plazo |
|---|---|---|---|
| Cuenta de Expo | expo.dev | Gratis | minutos |
| Cuenta de Google Play Console | play.google.com/console | 25 US$ una vez | 1-2 días de verificación |
| Apple Developer Program | developer.apple.com | 99 US$/año | 1-3 días (empresa: puede tardar más, hace falta el número D-U-N-S) |

Para publicar como **empresa** (recomendado, para que aparezca «Urkiola
Car Service» y no un nombre personal) Apple pide el número D-U-N-S de la
sociedad. Conviene solicitarlo pronto porque es lo que más tarda.

## 1 · Preparar el proyecto

```bash
npm install -g eas-cli
eas login
eas init            # crea el proyecto y devuelve un projectId
```

Copia ese `projectId` a la variable de entorno `EAS_PROJECT_ID` o
directamente a `app.config.ts` (`extra.eas.projectId`).

Revisa en `app.config.ts`:

- `ios.bundleIdentifier` y `android.package`: ahora mismo
  `com.urkiolamotor.carservice`. **Se pueden cambiar antes de la primera
  subida, después no.** Lo habitual es usar el dominio de la empresa al
  revés.
- `version`: la que ve el usuario (1.0.0).
- Los textos de permisos (`infoPlist`): Apple rechaza la app si no
  explican para qué se usa la cámara. Ya están escritos.

## 2 · Compilar

```bash
# Prueba interna, se instala por enlace sin pasar por las tiendas
eas build --profile preview --platform all

# Versión de tiendas
eas build --profile production --platform all
```

- Android genera un `.aab` (formato obligatorio en Google Play).
- iOS genera un `.ipa`. EAS gestiona los certificados y perfiles: la
  primera vez pide las credenciales de Apple y lo deja todo montado.
- `autoIncrement` sube solo el `versionCode` y el `buildNumber` en cada
  compilación de producción, que es lo que exigen ambas tiendas.

## 3 · Subir

### Google Play

```bash
eas submit --profile production --platform android
```

Necesita una **cuenta de servicio de Google Cloud** con permiso sobre la
app. Se crea una vez, se descarga el JSON y se guarda en
`secrets/google-play-service-account.json` (esa carpeta está en
`.gitignore`: **no subas nunca ese fichero al repositorio**).

La primera versión hay que crearla a mano en Play Console: nombre de la
app, descripción, categoría, capturas y política de privacidad. Después ya
todo se automatiza.

### App Store

```bash
eas submit --profile production --platform ios
```

Rellena antes en `eas.json` → `submit.production.ios`: `appleId`,
`ascAppId` y `appleTeamId`. La ficha (capturas, descripción, categoría) se
completa en App Store Connect.

## 4 · Lo que piden las tiendas y hay que preparar

- **Capturas**: mínimo 2 por dispositivo. Android: teléfono y tablet de
  7"/10". iOS: iPhone 6,7" y iPad 12,9". Se pueden hacer con el simulador.
- **Icono**: ya generado en `assets/` (`npm run icons` lo regenera). Cuando
  Urkiola facilite su logotipo oficial, se sustituyen esos PNG.
- **Descripción corta y larga en castellano** (y en euskera si queréis).
- **Política de privacidad accesible por URL pública.** Es obligatoria en
  las dos tiendas porque la app pide cámara y notificaciones. Basta con una
  página en la web corporativa.
- **Cuestionario de privacidad**: hay que declarar qué datos se recogen.
  En esta app: nombre y correo del empleado, fotos de vehículos y
  ubicación *dentro de las instalaciones* (no GPS: la app no pide permiso
  de localización, está bloqueado a propósito en `app.config.ts`).
- **Cuenta de prueba para el revisor**: Apple la exige siempre que haya
  login. Dale un usuario de solo lectura.

## 5 · App interna, no pública

Si Urkiola no quiere que cualquiera se descargue la app, hay dos caminos:

- **Google Play**: publicación en **canal interno** o «aplicación privada»
  para el dominio de la empresa (Managed Google Play). No aparece en la
  búsqueda pública.
- **Apple**: la vía limpia es el **Apple Business Manager** con
  distribución personalizada («Custom App»). También sirve TestFlight
  (hasta 10.000 probadores) si os vale con eso y no os importa renovar cada
  90 días.

Esta suele ser la mejor opción para una herramienta interna: menos
requisitos de revisión y nada de usuarios ajenos.

## 6 · Actualizaciones sin revisión

```bash
eas update --branch production --message "Corrección en el checklist"
```

Publica los cambios de JavaScript directamente en las apps ya instaladas,
sin pasar por la revisión de las tiendas. Solo hace falta una compilación
nueva cuando cambian dependencias nativas (cámara, notificaciones, versión
del SDK).

## 7 · Plazos reales

| Paso | Tiempo |
|---|---|
| Alta de cuentas | 1-5 días (Apple empresa puede ser más) |
| Primera compilación con EAS | 15-30 min por plataforma |
| Revisión de Google Play (primera vez) | 1-7 días |
| Revisión de Apple (primera vez) | 1-3 días |
| Revisiones siguientes | horas |

Contando todo, desde cero hasta estar en las dos tiendas: **2-3 semanas**,
casi todas de espera administrativa.
