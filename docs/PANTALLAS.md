# Del mockup V18 a la aplicación

Tabla de comprobación: qué había en `Urkiola_Car_Service_V18_ABRIBLE.html`
y dónde está ahora.

| Pantalla del mockup | Ruta en la app | Fichero | Qué se ha añadido respecto al HTML |
|---|---|---|---|
| ▦ Dashboard | `/` | `app/(shell)/index.tsx` | Los KPI se calculan de los datos reales y son pulsables; la tabla de rendimiento por sede y los avisos de «Atención» se recalculan solos |
| 🚗 Flota | `/flota` | `app/(shell)/flota.tsx` | Buscador y 5 filtros superiores + filtro por columna, combinables; carga por páginas; alternar entre activos y parque Quiter completo |
| 🔎 Ficha vehículo | `/vehiculo/[id]` | `app/(shell)/vehiculo/[id].tsx` | Ficha 360º real de cualquier vehículo, con acciones que modifican los datos y trazabilidad viva |
| 🚚 Recepción | `/recepcion` | `app/(shell)/recepcion.tsx` | Varias recepciones, alta de camión, líneas de albarán, foto del albarán, daños con fotos y asignación de plaza |
| 📍 Campa Sondika | `/campa` | `app/(shell)/campa.tsx` | Sirve para cualquier sede y zona; ocupación por tejavana/parking; plaza a plaza |
| 📋 Solicitudes | `/solicitudes` | `app/(shell)/solicitudes.tsx` | Cambio de estado, asignación a persona y apertura de la preparación desde la propia solicitud |
| 🧽 Preparación | `/preparacion` | `app/(shell)/preparacion.tsx` | Cronómetros en marcha, SLA calculado, checklist de tres estados, motivos de espera y bloqueo |
| ↔ Movimientos | `/movimientos` | `app/(shell)/movimientos.tsx` | Alta de movimiento buscando por matrícula o VIN-8 |
| 📋 Recuentos | `/recuentos` | `app/(shell)/recuentos.tsx` | Recuento real: esperados/encontrados/faltan, escaneo con cámara en móvil, corrección de plaza, histórico |
| ⚠ Incidencias | `/incidencias` | `app/(shell)/incidencias.tsx` | Alta con fotos de cámara o galería, cierre de incidencia |
| 🔔 Notificaciones | `/notificaciones` | `app/(shell)/notificaciones.tsx` | Bandeja de avisos + reglas configurables; alta, pausa y borrado; alta de push en el dispositivo |
| ⚙ Administración | `/administracion` | `app/(shell)/administracion.tsx` | Objetivos, umbral de comprobación, motivos de espera, requisitos (alta/edición/borrado), alta de zonas y plazas, usuarios y roles, arquitectura |
| 📱 App móvil | `/mi-trabajo` | `app/(shell)/mi-trabajo.tsx` | En el mockup era una *simulación* dibujada; aquí es la pantalla de inicio real del operario, con sus tareas del día |
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
