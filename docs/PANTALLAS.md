# Del mockup V18 a la aplicación

Tabla de comprobación: qué había en `Urkiola_Car_Service_V18_ABRIBLE.html`
y dónde está ahora.

| Pantalla del mockup | Ruta en la app | Fichero | Qué se ha añadido respecto al HTML |
|---|---|---|---|
| ▦ Dashboard | `/` | `app/(shell)/index.tsx` | Los KPI se calculan de los datos reales y son pulsables; la tabla de rendimiento por sede y los avisos de «Atención» se recalculan solos. **Necesita el permiso `panel.ver`**, que de serie solo tiene el administrador: quien no lo tenga entra directamente a su primera pantalla de trabajo |
| 🚗 Flota | `/flota` | `app/(shell)/flota.tsx` | Buscador y 6 filtros superiores (incluido el estado) + filtro por columna, combinables; carga por páginas; alternar entre activos y parque Quiter completo. Desde aquí se **da de alta un coche a mano** con solo el bastidor, y el comercial tiene el atajo **«Mis coches en preparación»**, que resume cuántos tiene pedidos sin empezar, en curso y listos |
| 🔎 Ficha vehículo | `/vehiculo/[id]` | `app/(shell)/vehiculo/[id].tsx` | Ficha 360º real de cualquier vehículo, con acciones que modifican los datos y trazabilidad viva. El **comercial se asigna aquí en cualquier momento**: el que vende se queda un coche libre de un botón, y la oficina reasigna cualquiera (`ComercialVehiculo`) |
| 🚚 Recepción | `/recepcion` | `app/(shell)/recepcion.tsx` | Varias recepciones, alta de camión, líneas de albarán, foto del albarán, daños con fotos y asignación de plaza |
| 📍 Campa Sondika | `/campa` | `app/(shell)/campa.tsx` | Sirve para cualquier sede y zona; ocupación por tejavana/parking; plaza a plaza |
| 📋 Solicitudes | `/solicitudes` | `app/(shell)/solicitudes.tsx` | Cambio de estado, asignación a persona y apertura de la preparación desde la propia solicitud. **Es la pantalla de la oficina** (`solicitudes.gestionar`): quien solo los pide ve los suyos en «Mis coches» |
| 🧽 Preparación | `/preparacion` | `app/(shell)/preparacion.tsx` | Cronómetros en marcha, SLA calculado, checklist de tres estados, motivos de espera y bloqueo |
| *(nuevo)* 🚚 Traslados hechos | `/traslados` | `app/(shell)/traslados.tsx` | El registro de lo que han hecho las empresas de transporte: por empresa y periodo, cuántos traslados, cuántos dentro de las 48 h y cuánto tardan de media, con la lista de cada uno. El transportista ve exactamente lo mismo de lo suyo en «Mis traslados → Hechos» |
| ↔ Movimientos | `/movimientos` | `app/(shell)/movimientos.tsx` | Histórico con filtros y alta de movimiento buscando por matrícula o VIN-8. **De oficina** (`solicitudes.gestionar`): quien mueve coches usa «Mover coche», y el recorrido de un coche concreto está en su ficha |
| *(nuevo)* 📍 Mover coche | `/mover` | `app/(shell)/mover.tsx` | Alta de movimientos en cadena, pensada para el móvil: matrícula y destino, sin tablas. Al identificar el coche dice **dónde está ahora** —sede, zona y plaza—, cuándo se comprobó y quién, y avisa si el destino está en otra sede |
| 📋 Recuentos | `/recuentos` | `app/(shell)/recuentos.tsx` | Recuento real: esperados/encontrados/faltan, escaneo con cámara en móvil, corrección de plaza, histórico. **Pensada para el móvil**: se cuenta en la campa, así que va en la barra de abajo del preparador y de recepción, el resumen cabe en una línea y el escáner se queda abierto para el siguiente coche |
| ⚠ Incidencias | `/incidencias` | `app/(shell)/incidencias.tsx` | Alta con fotos de cámara o galería, cierre de incidencia |
| 🔔 Notificaciones | `/notificaciones` | `app/(shell)/notificaciones.tsx` | **La bandeja de cada uno es la suya**: cada regla dice a quién le llega (al comercial de ese coche, a un equipo entero o a todo el mundo). Reglas configurables; alta, pausa y borrado; alta de push en el dispositivo. Tres reglas puestas de serie: coche listo → su comercial, preparación pedida → preparadores, traslado sin recoger 24 h → logística |
| ⚙ Administración | `/administracion` | `app/(shell)/administracion.tsx` + `src/features/admin/` | Cinco pestañas: preparación, ubicaciones, flota y columnas, usuarios y roles, sistema. Ver abajo |
| *(nuevo)* 🚗 Mis coches | `/mis-coches` | `app/(shell)/mis-coches.tsx` | La pantalla del comercial: sus coches y en qué punto está cada uno —lo pedido, cómo va, dónde está y la fecha comprometida— con lo que puede pedir desde ahí mismo. Sustituye a «Mi trabajo», que repetía en peor la cola del preparador, los encargos del transportista y los recuentos, y al comercial le enseñaba el trabajo de los demás |
| *(nuevo)* Acceso | `/login` | `app/login.tsx` | No estaba en el mockup: hace falta para saber quién registra cada acción |

## Los modales del mockup

| Modal | Dónde está ahora |
|---|---|
| 📍 Registrar movimiento | Ficha del vehículo, Movimientos y Mi trabajo (`VehicleActions`) |
| 📋 Nuevo recuento | Recuentos |
| 📷 Escanear vehículo | Recuentos (con cámara real en Android/iOS) |
| 🔔 Crear notificación | Ficha del vehículo y Notificaciones |
| 🚚 Solicitar traslado | `VehicleActions` |
| 🧽 Solicitar preparación | `VehicleActions` |
| 📸 Incidencia | `VehicleActions` e Incidencias |
| 👤 Comercial del vehículo | Ficha del vehículo (`ComercialVehiculo`); solo lo abre quien puede reasignar |

## Qué se configura sin tocar código

Todo esto se cambia desde Administración, sin programador y sin desplegar:

| Pestaña | Qué permite |
|---|---|
| **Preparación** | Objetivos de VN y VO, horas sin comprobación antes de avisar, motivos de espera, y alta/edición/borrado de requisitos del checklist (a qué tipo y sedes aplican, si llevan cronómetro, si son opcionales) |
| **Ubicaciones** | Crear sedes desde cero (campa o concesión, si prepara o no), crear tejavanas y parkings, fijar cuántas plazas tiene cada uno, y dar de alta o borrar plazas sueltas con el código que uséis en campa |
| **Flota y columnas** | Qué columnas se ven en la lista de vehículos y en qué orden, y crear campos propios (lista, texto, número, sí/no) para clasificar los coches de otras formas, con filtro incluido |
| **Usuarios y roles** | Alta, edición y baja de usuarios; crear roles nuevos; y para cada rol, qué permisos tiene y qué secciones ve en el teléfono |
| **Sistema** | Regla de datos de Quiter, infraestructura y restauración de los datos de ejemplo |

Protecciones: no se puede borrar una sede, zona o plaza con vehículos
dentro, ni un rol que alguien tenga asignado. Los usuarios no se borran, se
dan de baja: su nombre sigue en el histórico de movimientos y recuentos.

## La app es más corta que la web

En el teléfono no se enseña todo. Cada rol tiene configurada su lista de
secciones, y la app:

- abre directamente en la sección principal de ese rol, no en el panel de
  gestión;
- enseña como mucho cuatro pestañas abajo, con etiquetas cortas;
- oculta en el menú lo que ese rol no necesita en mano.

Por ejemplo, con la configuración de serie:

| Rol | Menú del móvil | Abre en |
|---|---|---|
| Preparador | Mi preparación · Mover coche · Flota | Su cola de trabajo |
| Recepción | Descargar camión · Mover coche · Flota | La descarga en curso |
| Transportista (externo) | Solo «Mis traslados», sin menú | Sus traslados |
| Comercial | Mis coches · Entregas · Mover coche · Flota | Sus coches |
| Logística | Solicitudes · Entregas · Mover coche · Flota | Los encargos del día |
| Administrador | Flota · Solicitudes · Mover coche · Recuentos · Incidencias | El panel de control |

**Cada uno entra por su pantalla, también en la web.** Quien tiene el panel
de dirección entra por el panel; el resto, por la primera sección que su rol
tenga marcada en Administración. Antes todos entraban por la primera del
menú —Flota para casi todos—, así que al comercial la app le abría el parque
entero en vez de sus coches.

### Pantallas rápidas de campo

Seis pantallas están hechas para el móvil y para ir deprisa, con la
versión completa siempre disponible en la web:

| Pantalla | Para quién | Cómo funciona |
|---|---|---|
| `/mis-traslados` | Transportista | Tres fases, que son tres trabajos distintos: **por recoger** (planificar), **los llevo yo** (cerrar hoy) y **entregados** (su registro, mes a mes). Una tarjeta por traslado y un solo botón, que cambia de «He recogido las llaves» a «He entregado el vehículo»; al recoger las llaves el traslado cambia de fase solo |
| `/entregas` | Comercial y logística | Entregas comprometidas agrupadas por día, con lo que le falta a cada una. Se puede ver todo junto o una sede concreta, con el número de entregas de cada una a la vista |
| `/recuentos` | Preparador y recepción | Se cuenta andando por la tejavana: resumen en una línea, escáner grande y el escáner se queda abierto para el coche siguiente |
| `/mi-preparacion` | Preparador | Cola ordenada por plazo, **incluidas las preparaciones que ha pedido el comercial y todavía no ha abierto nadie**: se empiezan de un botón, sin pasar por la oficina. Al abrir, cronómetro y checklist donde **cada línea se marca de un toque**. Cada coche dice **dónde está** (sede · zona · plaza), y avisa si todavía no ha llegado a la sede o si la plaza no está confirmada |
| `/mi-recepcion` | Recepción | Bucle de descarga: identificar, plaza propuesta automáticamente y «Descargado · siguiente». Si el coche que baja del camión no está en el parque, se da de alta con el bastidor sin salir de la descarga |
| `/mover` | Cualquiera que mueva coches | Matrícula o bastidor, dónde lo dejas, y a por el siguiente |

En la descarga, la zona que se propone es **la primera que tenga hueco**, no
la primera de la lista; y si se llena a media descarga, ofrece saltar a la
siguiente con plazas libres.

#### Mover un coche

Es la pantalla más corta de todas, porque es la acción que más se repite:

1. **Matrícula o bastidor** — escrito o escaneado. Debajo aparece el coche
   y dónde está ahora, para no equivocarse de vehículo.
2. **Dónde lo dejas** — los tres últimos sitios donde ha dejado coches esa
   persona salen como atajo de un toque; si no, sede y zona.
3. **Mover** — el botón dice a dónde va, y al pulsarlo el campo se vacía
   **manteniendo el destino**: se bajan seis coches seguidos a la misma
   tejavana sin volver a tocar nada. Abajo queda la cuenta de lo movido.

La plaza concreta es opcional a propósito. Al mover por la campa casi nadie
apunta el número de plaza, y una plaza inventada es peor que ninguna:
dejaría ocupado un hueco que está libre. Con la zona basta para que cuadre
la ocupación.

#### Terminar una preparación

Al dar por terminada una preparación, la app pregunta **dónde queda el
coche** y lo registra como movimiento en el mismo gesto. Si el coche ya
está en la sede, ofrece «se queda donde está» de un toque; y siempre se
puede terminar sin indicar sitio. Así la ficha no se queda diciendo que el
coche sigue en el box cuando ya está en el parking de entregas.

En la web, ese mismo preparador sí ve diez secciones. Es la misma app: lo
que cambia es cuánto enseña en cada sitio.

### Empresas de transporte

Urkiola reparte los traslados por zona: dentro de Bizkaia los hace una
empresa y fuera otra. El sistema lo recoge así:

- Cada **empresa de transporte** lleva las sedes que cubre, y se gestiona
  en Administración → Transporte.
- Al pedir un traslado, la app **propone la empresa que llega al destino**
  (y mejor si también cubre el origen). Se puede cambiar.
- Cada transportista pertenece a una empresa, y en su móvil ve **solo los
  traslados de la suya**. Nunca los de la competencia.

### Plazos y entregas

Dos relojes distintos, que conviene no mezclar:

| Reloj | Qué mide | Cuándo arranca |
|---|---|---|
| Objetivo de preparación (2 h / 2 h 30) | Cuánto debe durar el **trabajo** | Al empezar a preparar |
| Plazo comprometido (48 h) | Cuándo tiene que **estar hecho** | Traslado: al recoger las llaves. Preparación: al pedirla |

#### Quién marca que se han recogido las llaves

El reloj del traslado no corre hasta que alguien dice que las llaves ya
están en manos del transportista. Se puede registrar por los dos lados:

| Quién | Dónde |
|---|---|
| El transportista | «Mis traslados» → **🔑 He recogido las llaves** |
| La oficina | Solicitudes → Gestionar → **🔑 Han recogido las llaves** |

Lo segundo hace falta más de lo que parece: hay transportistas que llaman
por teléfono o pasan por el mostrador sin abrir la app, y alguien tiene que
poder arrancar el plazo igual.

Mientras nadie lo marque, la solicitud aparece como **«🔑 Llaves sin
recoger»** en vez de con una cuenta atrás, para que se vea de un vistazo
que ese traslado no tiene reloj todavía. Al marcarlo queda la hora, quién
lo hizo, y una línea en la trazabilidad del vehículo.

Si el vehículo tiene **fecha de entrega al cliente**, esa manda: el plazo
de la preparación pasa a ser el día de la entrega, y el coche sube o baja
en la cola del preparador según lo que quede.

Al pedir una preparación con una entrega a menos de 48 h, la app avisa y
obliga a confirmar («Pedir igualmente»), y la marca como urgente. Es la
regla de que el comercial debe dar 48 h de margen, aplicada donde se
incumple.

### Modo colaborador externo

Un rol puede marcarse como **externo** en Administración → Usuarios y
roles. Entonces la app cambia de forma: sin menú lateral, sin pestañas y
sin poder salir de su pantalla ni escribiendo la dirección. Es lo que usa
el transportista, que es un proveedor de fuera.

Su pantalla, `/mis-traslados`, enseña solo los traslados **asignados a él**
—ni los de otros ni los que están sin repartir—, ordenados por recorrido
para no cruzar la campa, y con un único botón por traslado que cambia según
el momento: «He recogido el vehículo» y después «He entregado el vehículo».
Un segundo botón, «Tengo un problema», abre un aviso con foto opcional que
llega a logística como incidencia de transporte.

Con eso, el transportista deja de tener acceso a la flota, a las campas y
al resto de la operativa.

## Diferencias intencionadas

1. **La «App móvil» ya no es una página.** En el mockup era un dibujo de un
   teléfono dentro de la web. Aquí la app *es* la aplicación: el mismo
   código se adapta y en móvil enseña barra inferior, menú deslizante y
   fichas en vez de tablas. La antigua página se ha convertido en
   **Mi trabajo**, la pantalla de inicio del operario.

2. **Los números ya no están escritos a mano.** «428 vehículos», «183 en
   Sondika», «21 preparaciones», «7 incidencias», «5 sin comprobar»: ahora
   salen de los datos. Si mueves un coche, el dashboard cambia.

3. **Hay control de acceso.** Cada acción queda registrada con el usuario
   que la hizo, que es lo que exige la trazabilidad de recuentos. El menú
   de Administración solo lo ven administrador y logística.

4. **Modo claro y oscuro.** Los mismos colores del mockup, más una
   variante oscura para trabajar de noche en campa.

5. **Sin QR, como pedía el mockup**: el vehículo se identifica por
   matrícula o por los 8 últimos caracteres del bastidor. En la app nativa,
   además, se puede leer el código de barras del parabrisas si el
   fabricante lo trae, pero nunca es obligatorio.
