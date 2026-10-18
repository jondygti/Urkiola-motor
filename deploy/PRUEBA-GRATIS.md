# Probar Easo Logistics gratis en internet

Un servidor de **prueba** con los **datos de ejemplo**, en los planes gratuitos de
Render (el servidor y la web) y Supabase (la base de datos y las fotos), y la app de
Android como **APK** instalado a mano, sin Google Play.

Sirve para enseñar la plataforma funcionando de verdad: varios móviles a la vez, el
trabajo de uno que aparece en el otro, fotos, la web de oficina. **No es el staging de la
empresa** (eso es `render.yaml` y `deploy/README.md`).

> **Solo datos de ejemplo.** Nada de matrículas de clientes, nombres de empleados ni
> datos de Quiter en estas cuentas personales: eso sí sería un problema de protección de
> datos. Los datos de ejemplo enseñan lo mismo.

## Lo que hace falta

- Cuenta en **Supabase** (https://supabase.com) y en **Render** (https://render.com).
- Acceso al repositorio de GitHub, para conectar Render y para compilar el APK.
- Media hora.

## 1 · Supabase: la base de datos y las fotos

1. **New project**. Nombre: `easo-prueba`. Región: **Frankfurt (eu-central-1)**.
   Apunta la **contraseña de la base de datos** que pongas: hace falta en el paso 4.
2. Espera a que termine de crearse (un par de minutos).
3. **Storage → New bucket**. Nombre: `urkiola-fotos`. **Public bucket: desactivado**
   (las fotos solo se ven a través de la app, con permiso).
4. Botón **Connect** (arriba). Pestaña de cadenas de conexión, opción **Session pooler**.
   Copia la cadena (empieza por `postgresql://postgres.…`) y cambia `[YOUR-PASSWORD]` por
   la contraseña del paso 1. Esto es `DATABASE_URL`.
   - Tiene que ser **Session pooler**, no «Transaction pooler»: el servidor mantiene una
     sesión abierta para asegurarse de que es el único.
5. **Project Settings → API**. Copia:
   - **Project URL** → es `SUPABASE_URL`.
   - La clave **`service_role`** (secreta; si sale una pestaña «Legacy API keys», está
     ahí) → es `SUPABASE_SERVICE_ROLE_KEY`. **No la compartas con nadie**: abre todas
     las fotos.

## 2 · Render: el servidor y la web

1. **New → Blueprint**. Conecta el repositorio de GitHub `Urkiola-motor`.
2. En **Blueprint path** escribe `render.prueba.yaml` (no el de por defecto).
3. Render pide los valores que faltan:

   | Variable | Qué poner |
   |---|---|
   | `URKIOLA_CLAVE_PRUEBAS` | La contraseña que usaréis todos para entrar. Una frase de 12 caracteres o más, por ejemplo `tres coches en la azotea`. Con una débil el servidor no arranca. |
   | `DATABASE_URL` | La cadena del paso 1.4 |
   | `SUPABASE_URL` | La del paso 1.5 |
   | `SUPABASE_SERVICE_ROLE_KEY` | La del paso 1.5 |
   | `PUBLIC_URL`, `CORS_ORIGEN`, `EXPO_PUBLIC_API_URL` | Las tres iguales: `https://easo-logistics-prueba.onrender.com` |

4. **Apply**. La primera vez tarda unos 10 minutos (compila el servidor y la web).
5. Cuando esté «Live», mira la dirección que Render le ha dado arriba del todo. Si **no**
   es `https://easo-logistics-prueba.onrender.com` (Render añade letras si el nombre
   estaba cogido), ve a **Environment**, pon la dirección buena en las tres variables
   del paso 3 y pulsa **Manual Deploy → Deploy latest commit**.
6. Comprueba que funciona: abre la dirección en el navegador. Sale la entrada de Easo
   Logistics. También `…/health` debe decir `{"ok":true}`.

## 3 · El APK para los móviles

1. En GitHub: **Actions → APK de prueba → Run workflow**.
2. En «Dirección del servidor» pon la de Render (`https://easo-logistics-prueba.onrender.com`
   o la que te haya dado) y pulsa **Run workflow**.
3. Tarda unos 15 minutos. Cuando salga en verde, el APK queda siempre en la misma
   dirección, que se abre directamente desde el navegador del móvil:
   https://github.com/jondygti/Urkiola-motor/releases/download/apk-prueba/easo-logistics.apk
   (también en la propia ejecución, abajo, en **Artifacts**).
4. Ábrelo en el móvil. Android pedirá permitir instalar apps de esta fuente: acéptalo
   solo para esto.

El APK solo funciona en móviles Android de los últimos años (procesador de 64 bits,
que es lo que llevan casi todos desde hace tiempo).

Cada vez que cambie la app, se repite el paso 3: el APK nuevo se instala encima del
anterior. Si cambia la dirección del servidor, también hay que sacar un APK nuevo: la
dirección va dentro.

## 4 · Quién entra

Todos con la contraseña de `URKIOLA_CLAVE_PRUEBAS`. Los mismos perfiles que la demo:

| Perfil | Correo |
|---|---|
| Gerencia (administración, panel) | `admin@urkiolacarservice.com` |
| Logística | `logistica@urkiolacarservice.com` |
| Preparador · Leioa | `pedro@urkiolacarservice.com` |
| Preparadora · Leioa y Galdakao | `ane@urkiolacarservice.com` |
| Preparador · Anoeta e Irun | `jon@urkiolacarservice.com` |
| Transportista · Grúas Francis | `transporte@urkiolacarservice.com` |
| Transportista · Grúas Betigoiz | `betigoiz@urkiolacarservice.com` |
| Recepción · Sondika | `recepcion@urkiolacarservice.com` |
| Comercial | `juan@urkiolacarservice.com` |
| Dirección Peugeot · Citroën | `direccion.vn@urkiolacarservice.com` |
| Responsable VO | `responsable.vo@urkiolacarservice.com` |

Cada uno puede cambiar su contraseña después. Para una prueba con más gente, el
administrador da de alta usuarios desde Administración.

## Lo que hay que saber del plan gratuito

- **Se duerme.** Tras unos 15 minutos sin uso, el primero que entra espera entre
  30 segundos y un minuto. Antes de enseñarlo, ábrelo un rato antes.
- **Supabase pausa el proyecto tras 7 días sin uso.** Los datos se quedan; se reactiva
  desde su panel con un botón.
- **Sin correo**: no funciona «he olvidado la contraseña». Si alguien la olvida, el
  administrador se la cambia.
- **Sin avisos al móvil** (`EXPO_PUSH=0`): los avisos se ven en la campana de la app.
- **Espacio**: unos 500 MB de datos y 0,5–1 GB de fotos. Sobra para una prueba.

Estos límites son los publicados por Render y Supabase en 2026; si cambian, mandan sus
páginas de precios.
