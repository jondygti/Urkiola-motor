# Urkiola Car Service · guía para Claude

Plataforma de gestión logística de flota de un grupo de concesionarios
(Sondika, Leioa, Galdakao, Anoeta, Irun). Un solo código en Expo / React
Native que sirve como panel web y como app de Android.

**Quién manda:** Jon (Urkiola) dirige el producto y no programa. Decide qué
tiene que hacer el sistema y lo valida usándolo. Yo escribo el código y lo
explico. Por eso:

- **Todo en castellano**: código, comentarios, mensajes de commit y
  respuestas. Nombres de dominio en castellano (`traslado`, `preparacion`,
  `recuento`), no en inglés.
- **Los comentarios explican el porqué**, no el qué. Si una decisión tiene
  una razón de negocio o un fallo detrás, se escribe.
- **Al terminar algo se explica en lenguaje llano**, sin jerga: qué cambia
  para quien usa la app, no qué fichero se ha tocado.

## Reglas que no se saltan

Cada una viene de un fallo real de este proyecto:

1. **Al cambiar el modelo de datos o los roles de serie, subir
   `STATE_SCHEMA_VERSION`** (`src/data/store.tsx`). Si no, los dispositivos
   arrastran la configuración vieja y el usuario ve la versión anterior sin
   entender por qué. Pasó con el rol de transportista.
2. **Los permisos de una pantalla salen de `src/features/shell/nav.ts`**
   (`permissionsForRoute`), nunca escritos a mano en la pantalla. Cuando se
   escribieron aparte, el menú y la pantalla acabaron diciendo cosas
   distintas.
3. **Toda la lógica de negocio vive en `src/data/commands.ts`**, en
   funciones puras sin React. Las pantallas solo llaman a `run(comando)`.
   El servidor podrá reutilizar ese fichero tal cual.
4. **Probar con un navegador limpio no basta.** Hay que probar también con
   datos ya guardados: los fallos de persistencia solo aparecen así.
5. **El servidor de pruebas tiene que devolver `index.html` cuando el
   fichero no existe.** Con un servidor estático normal, `/vehiculo/1234`
   da 404 y la prueba pasa sobre una pantalla que nunca cargó. Lo resuelve
   `scripts/verify/servidor.mjs`.
6. **La comprobación de permisos del cliente es comodidad de interfaz, no
   seguridad.** El servidor la repite en cada comando, porque cualquier
   cliente puede mentir.
7. **La plaza concreta siempre es opcional; la zona basta.** Una plaza
   inventada deja ocupado un hueco que está libre.
8. **`EXPO_PUBLIC_*` se incrusta al compilar y Metro lo cachea.** Por eso
   `build:web` lleva `--clear` siempre: sin él, compilar la demostración
   justo después de `verify:api` dejaba la dirección del servidor dentro de
   la demostración, que se pasaba el rato intentando conectarse a un
   servidor que ya no existía.
9. **Nunca subir `secrets/` ni `.env`** al repositorio.
10. **Las versiones de dependencias se leen de
    `node_modules/expo/bundledNativeModules.json`**; `npx expo install` no
    funciona detrás del proxy de estas sesiones.
11. **Lo que crea un comando lleva un id derivado del id del comando**
    (`prep.create` con id `cmd-a1b2` → preparación `prep-cmd-a1b2`). Si
    fuera aleatorio, el móvil y el servidor inventarían identificadores
    distintos y el comando siguiente («empezar *prep-…*») no encontraría
    nada en el servidor: el trabajo del operario se perdería en silencio.
12. **Los tiempos se miden con `cmd.at`, nunca con `Date.now()`.** Un
    comando registrado en un sótano puede aplicarse dos horas después, y
    esas dos horas no las trabajó ni las esperó nadie.
13. **El servidor no se cree el `userId` del comando**: lo sustituye por el
    del token. Y los colaboradores externos (transportista) se comprueban
    **antes** que los permisos de su rol, no con ellos: si no, marcar una
    casilla de más en Administración le abriría la flota a un proveedor.

## Comprobar antes de dar algo por bueno

```bash
npm run typecheck            # TypeScript estricto
npm run verify               # compila, sirve y recorre la app con un navegador
npm run verify -- --build    # forzando recompilación
npm run server:test          # el backend por dentro
npm run verify:api           # la app real contra el backend real
```

| Suite | Qué comprueba |
|---|---|
| `scripts/verify/rutas.mjs` | 7 perfiles × 2 anchos × 18 pantallas = 252 cargas: que ninguna se rompe para ningún rol |
| `scripts/verify/funciones.mjs` | 37 comprobaciones de la operativa real, mirando los datos guardados y no la pantalla |
| `server/pruebas/` | 42 comprobaciones: permisos, idempotencia, comandos que llegan tarde, estado recortado, reinicios |
| `scripts/verify/backend.mjs` | 14 comprobaciones de la app compilada contra el servidor: entrar con contraseña, mover un coche y que **otro dispositivo lo vea** |

`verify:api` va aparte de `verify` porque compila la web una segunda vez:
`EXPO_PUBLIC_API_URL` se incrusta al compilar, así que la versión de
demostración y la conectada son dos compilaciones distintas.

Necesita Playwright disponible (global vale) y usa el Chromium ya instalado
en la imagen. Si se añade una función nueva, **se añade su comprobación
aquí**, no se prueba a mano y se olvida.

La demostración navegable se genera con `npm run build:demo` (un único
fichero HTML) y se publica como artefacto en
`https://claude.ai/code/artifact/5440986e-ca76-42a4-8723-60b62a6f202a`.
Republicar siempre en esa misma dirección.

## Dónde está cada cosa

```
app/(shell)/        Una pantalla por fichero (expo-router)
src/data/           types · commands (reglas) · selectors (cálculos) · store · seed
src/features/       admin · shell (menú) · actions · prep · scan · common
src/ui/             Sistema de diseño (colores del mockup + modo oscuro)
server/             El backend. Reutiliza src/data/commands.ts tal cual
scripts/verify/     Comprobación automática
docs/               Documentación, toda en castellano
```

Documentación de referencia: `docs/PANTALLAS.md` (qué hace cada pantalla y
por qué), `server/README.md` (cómo arrancar y probar el servidor),
`docs/BACKEND-API.md` (contrato del servidor), `docs/DESPLIEGUE.md`
(Railway + Supabase), `docs/MANTENIMIENTO.md` (cómo se sigue cambiando esto
en marcha), `docs/APOYO-TECNICO.md` (qué apoyo externo hace falta),
`docs/DISTRIBUCION.md` (Google Play).

## Reglas de negocio vigentes

- Quiter aporta el parque maestro; Urkiola controla la logística.
- Sondika almacena; Leioa, Galdakao, Anoeta e Irun preparan.
- **Dos relojes distintos**: el objetivo de trabajo (VN 2 h, VO 2 h 30) y el
  plazo comprometido (48 h). No mezclarlos.
- El transportista tiene **48 h desde que recoge las llaves**; lo marca él
  o la oficina por él.
- El comercial debe dar **48 h mínimo** para preparar; con menos, la app
  avisa y obliga a confirmar.
- La **fecha de entrega al cliente manda** sobre el plazo por defecto.
- Los traslados se encargan a una **empresa de transporte** según la zona
  (Bizkaia: Grúas Francis; fuera: Grúas Betigoiz), y cada transportista ve
  solo los de la suya.
- Sin QR: el vehículo se identifica por matrícula o por los 8 últimos del
  bastidor.

## Estado y siguientes pasos

**Hecho:** las 18 pantallas, configuración completa desde Administración
(sedes, plazas, roles, permisos, columnas, campos propios, checklist),
funcionamiento sin cobertura con cola de subida, app de Android lista para
compilar, **el backend** (`server/`, con la app entrando con contraseña de
verdad contra él) y toda la documentación.

**Pendiente, por orden:**

1. **Alta de cuentas** de Railway y Supabase en región europea, y primer
   despliegue. El servidor ya está listo: `docs/DESPLIEGUE.md`.
2. **Las fotos.** Las de incidencias y albaranes se guardan como una
   dirección local del móvil, así que hoy no las ve nadie más. Hace falta
   subirlas a Supabase Storage antes de mandar el comando.
3. **Recuperación de contraseña por correo.** Hoy la restablece un
   administrador; hace falta el envío de correo para que no dependa de
   nadie.
4. **Integración con Quiter.** Jon tiene que conseguir un export real; sin
   verlo no se escribe el importador.
5. **Revisión de seguridad externa** antes de meter datos de clientes
   (`docs/APOYO-TECNICO.md`).
6. **Publicación en Google Play** (`docs/DISTRIBUCION.md`).

Menor, apuntado para no olvidarlo: la pantalla de acceso da un aviso de
hidratación de React en la web compilada (React descarta el HTML
prerenderizado de esa pantalla y la vuelve a pintar). Se recupera solo y no
afecta al uso, pero está ahí; `scripts/verify/backend.mjs` lo tiene
filtrado a propósito y con el motivo escrito.

Rama de trabajo: `claude/frontend-mobile-app-multiplatform-pj09ly`.
