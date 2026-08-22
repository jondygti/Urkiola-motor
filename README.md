# Urkiola Car Service

Aplicación de gestión logística de flota para Urkiola Car Service, hecha a
partir del mockup `Urkiola_Car_Service_V18_ABRIBLE.html`.

**Un solo código, dos destinos:**

| Destino | Para quién | Cómo se distribuye |
|---|---|---|
| Web | Gestión y control (oficina) | Página estática en cualquier hosting |
| Android | Campa, transporte y preparación | APK propio, sin pasar por Google Play |

El proyecto también compila para iOS y la configuración está escrita, pero
queda fuera de alcance: Apple exige 99 US$/año para instalar en un iPhone.
Quien use iPhone entra al panel web desde el navegador.

No son dos aplicaciones: es la misma, escrita con Expo y React Native, que
se adapta a la pantalla. En escritorio muestra el menú lateral y las tablas
del mockup; en el móvil, barra inferior, menú deslizante y fichas.

## Arrancar en local

```bash
npm install
npm start          # abre el menú de Expo
npm run web        # solo la web, en el navegador
npm run android    # Android (emulador o móvil con Expo Go)
npm run ios        # iOS (requiere macOS o usa Expo Go)
```

La primera vez entra con cualquiera de los perfiles de demostración que
aparecen en la pantalla de acceso. Cada rol ve un menú distinto.

## Modo demostración y modo conectado

Sin backend configurado, la app arranca con un parque de ejemplo (428
vehículos activos repartidos entre Sondika, Leioa, Galdakao, Anoeta e Irun)
y guarda los cambios en el propio dispositivo. Sirve para validar la
operativa con el equipo antes de montar el servidor.

Para conectarla a un backend real basta con:

```bash
EXPO_PUBLIC_API_URL=https://api.urkiolacarservice.com npm start
```

No hay que tocar ninguna pantalla. El contrato que debe cumplir el servidor
está en [`docs/BACKEND-API.md`](docs/BACKEND-API.md).

## Estructura

```
app/                      Rutas (expo-router). Un fichero = una pantalla
  (shell)/                Pantallas dentro del armazón con menú
  login.tsx               Acceso
src/
  data/
    types.ts              Modelo de dominio
    commands.ts           TODA la lógica de negocio, en funciones puras
    seed.ts               Parque de ejemplo
    selectors.ts          Cálculos derivados (KPI, SLA, ocupación…)
    store.tsx             Estado, persistencia y cola de subida sin cobertura
    api.ts                Cliente HTTP
    push.ts               Notificaciones push
    format.ts             Fechas, duraciones, nombres
  ui/                     Sistema de diseño (colores del mockup + modo oscuro)
  features/
    shell/                Menú lateral, pestañas y estado de sincronización
    actions/              Modales de movimiento, solicitud, incidencia, aviso
    prep/                 Panel de preparación con cronómetros y checklist
    scan/                 Lectura de códigos (cámara en Android)
    common/               Píldoras de estado y celdas reutilizables
deploy/                   Caddy y variables para el servidor
docs/                     Documentación
scripts/generate-icons.mjs  Genera los iconos de marca
```

La pieza clave es `src/data/commands.ts`: cada acción de la app es un
*comando* y `applyCommand(state, cmd)` es una función pura sin React. El
mismo fichero puede ejecutarse en el servidor, así que las reglas de
negocio se escriben una sola vez.

## Documentación

- [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) — **dónde alojarlo**: AWS
  frente a alternativas, con costes reales y recomendación.
- [`docs/DISTRIBUCION.md`](docs/DISTRIBUCION.md) — cómo se compila y se
  reparte el APK de Android sin usar tiendas, y qué se pierde por ello.
- [`docs/BACKEND-API.md`](docs/BACKEND-API.md) — contrato de la API,
  tablas de PostgreSQL e integración con Quiter.
- [`docs/MANTENIMIENTO.md`](docs/MANTENIMIENTO.md) — **cómo se sigue
  cambiando el sistema una vez está en marcha**: actualizaciones sin pasar
  por las tiendas, migraciones, entornos, copias de seguridad y qué no
  hacer nunca.
- [`docs/PANTALLAS.md`](docs/PANTALLAS.md) — qué había en el mockup V18 y
  dónde está ahora.

## Comprobaciones

```bash
npm run typecheck     # TypeScript en modo estricto
npm run build:web     # genera dist/ listo para publicar
npm run icons         # regenera los iconos de assets/
```

## Funciona sin cobertura

En campa y en sótanos no siempre hay señal, así que la app está pensada
para eso:

- guarda todos los datos en el dispositivo y arranca aunque no haya red;
- lo que se registra sin conexión se guarda en una cola que sobrevive a
  cerrar la app;
- se sube solo al recuperar cobertura, al volver a primer plano o cada
  30 segundos;
- una barra arriba dice cuántos cambios quedan por subir;
- no se fía de lo que diga el móvil sobre si hay red: lo comprueba contra
  el servidor, porque las sondas de conectividad fallan justo detrás de un
  proxy o un portal cautivo.

El servidor tiene que ser idempotente por `command.id` para que un
reintento no duplique un movimiento. Está detallado en
[`docs/BACKEND-API.md`](docs/BACKEND-API.md).

## Reglas de negocio implementadas

Salen del mockup y se han mantenido tal cual:

- **Quiter aporta el parque maestro; Urkiola controla la logística.** Un
  vehículo pasa a estar «activo logístico» en cuanto tiene ubicación,
  movimiento, solicitud, preparación, incidencia o recuento.
- **Sondika almacena; Leioa, Galdakao, Anoeta e Irun preparan.**
- **Cada requisito de preparación tiene tres estados**: completado,
  pendiente o no requerido. Los «no requerido» no cuentan en el porcentaje
  ni impiden la entrega.
- **«Preentrega cliente» es un simple check**, sin cronómetro propio.
- **Tiempo efectivo y tiempo en espera se miden por separado**: el SLA se
  compara solo contra el efectivo.
- **Sin QR**: el vehículo se identifica por matrícula o por los 8 últimos
  caracteres del bastidor.
- **Objetivos configurables**: VN 2 h, VO 2 h 30 min, aviso a las 72 h sin
  comprobación física. Todo editable en Administración.
