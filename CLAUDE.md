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
14. **Aplicar un comando dos veces tiene que dar lo mismo que aplicarlo
    una.** No es teoría: si se pierde la respuesta del servidor, el comando
    se queda en la cola y se reaplica encima de un estado que ya lo traía.
    Por eso lo que crea un comando comprueba antes si ya está creado, y los
    apuntes del histórico también.
15. **Las fotos se suben al hacerlas, no al mandar el comando.** Si falla,
    el operario se entera con el coche todavía delante y puede repetirla, en
    vez de descubrirlo cuando alguien va a reclamar al transportista.
16. **Nunca `{ ...activate(state, id), vehicles: replace(state.vehicles, …) }`.**
    El `replace` parte del estado de antes y pisa la activación, que se
    pierde en silencio. Para eso está `tocarVehiculo(state, id, patch)`.
    Estaba mal en cinco comandos: pedir un traslado, abrir una preparación,
    poner la fecha de entrega, asignar comercial y rellenar un campo propio.
    El coche se quedaba fuera de la operativa con trabajo pedido encima, sin
    salir en ninguna pantalla.
17. **La ubicación se normaliza siempre con `normalizarUbicacion`**, nunca
    se guarda la que venga en el comando. Manda la plaza —es lo único que el
    operario lee escrito en el suelo—: de ella salen la zona y la sede. Sin
    esto salían ubicaciones que no existen («Sondika · zona de Anoeta») y
    plazas inventadas ocupando huecos libres.
18. **Una observación física manda sobre lo que dice la base de datos.** Al
    meter un coche en una plaza ocupada —moviéndolo, descargándolo o
    contándolo— el que estaba apuntado allí se queda **en la zona sin plaza
    confirmada**, con su apunte en el historial. Dos coches en el mismo
    hueco se paga abajo, en la campa, buscando uno que no está.

20. **Quien ejecuta ve lo suyo; quien reparte ve el panel.** Es la regla
    que ha salido sola cuatro veces —solicitudes, movimientos, preparación,
    traslados— y cada vez costó una pantalla de más. Cuando aparezca un
    trabajo nuevo se decide de entrada de qué lado está, en vez de dar las
    dos pantallas y que la persona elija entre una que dice lo suyo y otra
    que dice lo de todos. Y **el permiso que marca un oficio no se da de
    serie a quien no lo hace**: `flota.asignarse` (vende), `traslados.propios`
    (conduce) y `preparacion.ejecutar` (prepara) no los llevan ni el
    administrador ni logística, aunque lo demás sí.
21. **Un aviso que le llega a todos no se lo cree nadie.** Cada regla dice a
    quién va (`audience`) y la bandeja de cada uno es la suya. Antes el aviso
    «Juan, tu coche está listo» le salía también al de recepción, y en dos
    meses nadie mira la campana. Y **lo que dispara el reloj hay que
    dispararlo**: `sin_comprobar_72h` estaba en la configuración de ejemplo
    y no avisaba nunca porque no había nada que la evaluara; para eso está
    `alerts.sweep`, que lanza la app al abrirse y es idempotente por día.

22. **Los tamaños de letra salen de `tipografia` o de `campo`**
    (`src/ui/theme.tsx`), nunca escritos a mano. Había 222 sueltos, nueve
    valores distintos y el más usado un 11: letra pequeña para leer un móvil
    con guantes, y ningún sitio donde subirla toda a la vez. Las pantallas
    de campo —mi preparación, mover coche, mis traslados, descargar camión,
    mis coches— usan `campo`, que es la misma escala un punto por encima.
    **La tabla es la excepción**: `Cell` usa `micro` a propósito, porque su
    gracia es ver muchas filas de un vistazo y se mira sentado.
    Lo vigila `scripts/verify/estilo.mjs`.

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
| `scripts/verify/estilo.mjs` | 3 comprobaciones del sistema de diseño, leyendo el código: que nadie escriba un tamaño de letra a mano, que el mínimo no baje de 11 y que las pantallas de campo usen su escala |
| `scripts/verify/rutas.mjs` | 7 perfiles × 2 anchos × 19 pantallas = 266 cargas: que ninguna se rompe para ningún rol |
| `scripts/verify/funciones.mjs` | 85 comprobaciones de la operativa real, mirando los datos guardados y no la pantalla |
| `scripts/verify/roles.mjs` | 73 comprobaciones: la jornada entera de cada uno de los 6 roles, y que lo que no le toca no lo ve ni lo puede tocar |
| `server/pruebas/` | 116 comprobaciones: permisos, idempotencia, comandos que llegan tarde, estado recortado, reinicios, seguridad y las **invariantes** de los datos |
| `server/pruebas/aleatorio.test.ts` | 10.000 comandos al azar con semilla: dispara lo que a nadie se le ocurre y comprueba las 9 invariantes después de **cada uno**. Si falla, la semilla que sale por pantalla repite la secuencia exacta |
| `scripts/verify/backend.mjs` | 24 comprobaciones de la app compilada contra el servidor: entrar con contraseña, mover un coche y que **otro dispositivo lo vea**, subir una foto y recuperar la contraseña por correo |

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
`docs/BACKEND-API.md` (contrato del servidor), `docs/SEGURIDAD.md` (repaso
de seguridad propio), `docs/DESPLIEGUE.md`
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
- **El transportista trabaja en tres fases**, que son tres trabajos
  distintos y antes salían en una sola lista: **por recoger** (lo planifica),
  **los llevo yo** (lo tiene que cerrar hoy) y **entregados** (su registro,
  con selector de mes, que es la unidad en la que se habla con una empresa
  de transporte: «en agosto me hiciste 14»).
- **«Mis coches» es de quien vende.** Sale con `flota.asignarse`, que es la
  marca de «vende coches» y de serie solo lleva el comercial: al
  administrador y a logística les salía vacía. La oficina asigna comercial a
  cualquiera con `flota.editar`, que es su herramienta.
- **Un traslado que llega tarde dice por qué.** Se le pregunta al
  transportista en el momento, con el coche delante —preguntarlo al día
  siguiente es preguntarle a la memoria de alguien— y solo si se ha pasado
  del plazo. Doce retrasos son doce discusiones; doce motivos son un dato:
  «ocho de doce fue que no estaban las llaves» se puede arreglar.
- **Tres avisos puestos de serie**, que son los que más trabajo ahorran: al
  comercial cuando su coche queda listo, al preparador cuando le piden una
  preparación, y a logística cuando un traslado lleva 24 h sin que nadie
  recoja las llaves —que es donde se pierden los días, porque el plazo del
  transportista no empieza hasta la recogida y un traslado olvidado no
  llega tarde nunca.
- **Un traslado terminado deja registro**: cuándo se recogieron las llaves,
  cuándo se entregó y quién lo entregó (`deliveredAt`, `deliveredBy`). Antes
  un traslado terminado solo dejaba de estar pendiente, y sin fecha de
  entrega no hay nada que enseñarle al proveedor. Lo ven los dos lados y es
  **la misma lista**: el transportista en «Mis traslados → Hechos» y la
  oficina en «Traslados hechos» (`/traslados`). Si cada uno mirase una lista
  distinta, la conversación sería discutir cuál de las dos vale.
- Los traslados se encargan a una **empresa de transporte** según la zona
  (Bizkaia: Grúas Francis; fuera: Grúas Betigoiz), y cada transportista ve
  solo los de la suya.
- Sin QR: el vehículo se identifica por matrícula o por los 8 últimos del
  bastidor. También en la dirección: `/vehiculo/1234ABC` abre su ficha.
- **Lo que pide el comercial llega al preparador sin pasar por la oficina**:
  la solicitud sale en «Mi preparación» y al empezarla se abre la
  preparación y arranca el cronómetro.
- **El preparador ve dónde está cada coche** (sede · zona · plaza) en su
  cola y dentro de la preparación, con aviso si todavía está en otra sede o
  si la plaza no está confirmada. `UbicacionVehiculo`
  (`src/features/common/Ubicacion.tsx`).
- **El panel de control es de dirección** (`panel.ver`). De serie solo lo
  tiene el administrador; se puede dar a quien haga falta desde
  Administración. Quien no lo tiene entra directo a su trabajo.
- **Un coche se puede dar de alta a mano con solo el bastidor**, desde
  Flota o en la propia descarga del camión. El identificador sale del
  VIN-8 (`v-<vin8>`), así que darlo de alta dos veces no duplica nada y el
  importador de Quiter lo reconoce y lo completa después.
- **El comercial de un vehículo viene de Quiter como texto** («Juan»), no
  como usuario («Juan Bilbao»). El emparejamiento está en
  `esDelComercial` (`src/data/selectors.ts`), en un solo sitio.
- **Cada rol tiene una pantalla suya y entra por ella**, en el móvil y en
  la web: la primera sección que tenga marcada en Administración (quien
  lleva el panel de dirección entra por el panel). El comercial tiene
  **«Mis coches»** (`/mis-coches`): sus coches, qué ha pedido para cada uno,
  cómo va, dónde está y la fecha comprometida, todo junto. Antes eso estaba
  repartido en tres pantallas y ninguna enseñaba solo lo suyo.
- **Los permisos que marcan un oficio no se dan de serie a quien no lo
  hace.** `flota.asignarse` («vende coches») y `traslados.propios` («lleva
  traslados») hacen aparecer «Mis coches» y «Mis traslados»; al
  administrador y a logística les salían las dos vacías. Se marcan desde
  Administración si algún día hacen falta.
- **«Solicitudes», «Movimientos» y «Preparación» son de oficina.** Las tres
  enseñan el trabajo de toda la red para repartirlo. Quien lo ejecuta tiene
  su propia pantalla con lo suyo —«Mi preparación», «Mis coches», «Mis
  traslados»— y tener las dos le obligaba a elegir entre dos pantallas que
  decían lo mismo, una de ellas con el trabajo de los demás.
  Quien solo *pide* encargos no necesita el tablón de toda la red, y quien
  mueve coches usa «Mover coche»; el recorrido de un coche concreto está en
  su ficha. Se quitó **«Mi trabajo»**: repetía en peor la cola del
  preparador, los encargos del transportista y los recuentos, y al comercial
  le enseñaba el trabajo de los demás.
- **El comercial se asigna en cualquier momento, no solo al dar de alta.**
  Los coches llegan de Quiter sin comercial hasta que alguien los vende. En
  la ficha del vehículo: el que vende **se queda un coche libre** de un
  botón y suelta el suyo (`flota.asignarse`); la oficina (`flota.editar`)
  asigna y reasigna a cualquiera, y el cambio queda en la trazabilidad con
  quién y cuándo. Un comercial **no le quita un coche a otro**: eso se pide
  a la oficina, que es quien lleva la cuenta.
- **Lo que no es físico no depende de dónde esté el coche.** Quién lo
  vende, cuándo se entrega y pedir que lo traigan valen esté donde esté.
  Sondika guarda el stock de toda la red: mientras el servidor midió esos
  comandos por la ubicación del vehículo, un comercial de Leioa no podía
  pedir que le trajeran un coche de la campa —que es justo para lo que
  existe esa pantalla.
- **El estado «aparcado» no dice dónde.** Un coche puede estar aparcado en
  la campa de Sondika o en el parking de una concesión. Se llamaba «en
  campa» y decía una cosa que no era en cuanto salía de Sondika.
- **Un vehículo no «pertenece» a una sede.** Todos son de Urkiola Motor; las
  sedes son sitios donde el coche está o va, nada más. Hubo un campo
  «Concesión» heredado de Quiter que ponía un nombre de sede y parecía un
  fallo del traslado; se ha quitado. Lo que hay es **dónde está**
  (`location`) y **a dónde va** (`targetSiteId`).

## Estado y siguientes pasos

**Hecho:** las 19 pantallas, configuración completa desde Administración
(sedes, plazas, roles, permisos, columnas, campos propios, checklist),
funcionamiento sin cobertura con cola de subida, app de Android lista para
compilar, **el backend** (`server/`, con la app entrando con contraseña de
verdad contra él), **las fotos** (se suben y las ve todo el mundo),
**recuperar la contraseña por correo** y toda la documentación.

**Pendiente, por orden:**

1. **Alta de cuentas** de Railway y Supabase en región europea, y primer
   despliegue. El servidor ya está listo: `docs/DESPLIEGUE.md`. Falta
   además crear el bucket de fotos y, si se quiere el correo de
   restablecer, una cuenta de proveedor de correo (`EMAIL_API_KEY`).
2. **Integración con Quiter.** Jon tiene que conseguir un export real; sin
   verlo no se escribe el importador.
3. **Revisión de seguridad externa** antes de meter datos de clientes. El
   repaso propio ya está hecho: `docs/SEGURIDAD.md` dice qué se ha resuelto
   y qué queda justamente para quien venga de fuera.
4. **Publicación en Google Play** (`docs/DISTRIBUCION.md`).

Menor, apuntado para no olvidarlo: la pantalla de acceso da un aviso de
hidratación de React en la web compilada (React descarta el HTML
prerenderizado de esa pantalla y la vuelve a pintar). Se recupera solo y no
afecta al uso, pero está ahí; `scripts/verify/backend.mjs` lo tiene
filtrado a propósito y con el motivo escrito.

Rama de trabajo: `claude/frontend-mobile-app-multiplatform-pj09ly`.
