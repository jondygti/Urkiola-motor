# Demo para Gerencia y Dirección Comercial

Actualizado: **20/09/2026**

Esta demo usa datos totalmente ficticios. Las sedes, roles y lógica operativa representan el funcionamiento previsto de Urkiola Car Service, pero las personas, matrículas, bastidores y vehículos concretos son datos de demostración.

## Objetivo

En 10–12 minutos hay que demostrar tres ideas:

1. Gerencia tiene una visión global y trazable.
2. Cada responsable comercial ve y puede actuar únicamente sobre su ámbito.
3. Una solicitud comercial se convierte en trabajo operativo para Logística/Preparación sin WhatsApp ni llamadas.

## Perfiles preparados

- **Gerencia Urkiola**: visión global.
- **Dirección Peugeot · Citroën**: VN/KM0/demo Peugeot-Citroën + VO vendido por su equipo.
- **Dirección Opel · Fiat · Jeep**: VN/KM0/demo de sus marcas + VO vendido por su equipo.
- **Responsable VO**: todo el stock VO, independientemente de quién lo venda.
- **Juan Bilbao**: comercial VN del equipo Peugeot-Citroën.
- **Mikel Santos**: comercial VN del equipo Opel-Fiat-Jeep.
- **Sara López**: comercial del equipo VO.
- **Pedro Larrea**: preparador de Leioa.

## Coches protagonistas

### Peugeot 3008 KM0
- Referencia: **6412 NPV / 12345678**
- Área: Stock VN.
- Categoría: KM0.
- Comercial: Juan Bilbao.
- Dirección: Peugeot-Citroën.
- Situación útil para explicar ubicación, traslado y preparación.

### Citroën C5 Aircross DEMO
- Referencia: **23456789**.
- Área: Stock VN.
- Categoría: DEMO.
- Comercial: Juan Bilbao.
- Tiene una incidencia de recepción en el histórico: sirve para enseñar trazabilidad.

### Opel Astra VN
- Referencia: **7251 KRX**.
- Área: Stock VN.
- Comercial: Mikel Santos.
- Solo debe pertenecer al ámbito de Dirección Opel-Fiat-Jeep.

### Jeep Avenger VN
- Referencia: **34567890**.
- Área: Stock VN.
- Comercial: Mikel Santos.

### BMW X3 VO vendido por VN
- Matrícula: **4821 LKM**.
- Área: Stock VO.
- Comercial: Juan Bilbao.
- Es el caso clave: debe aparecer tanto al Responsable VO como a Dirección Peugeot-Citroën.

### Volkswagen T-Roc VO
- Matrícula: **9032 MTR**.
- Área: Stock VO.
- Comercial: Sara López.
- Sirve para contrastar un VO propio del equipo VO con el BMW vendido por VN.

## Recorrido recomendado

### 1. Abrir como Gerencia Urkiola

Duración: 2 minutos.

Mostrar Flota, ubicaciones y una ficha de vehículo. Explicar:

> «La idea es que el coche tenga una única ficha operativa. Aquí sabemos dónde está, qué comercial lo lleva, qué se ha pedido, qué se ha hecho, si tiene incidencias y qué queda antes de la entrega.»

No entrar todavía en detalles técnicos.

### 2. Cambiar a Dirección Peugeot · Citroën

Duración: 3 minutos.

Buscar **6412 NPV**.

Mostrar:
- Peugeot 3008;
- KM0;
- Stock VN;
- comercial Juan Bilbao;
- ubicación;
- solicitudes disponibles.

Explicar:

> «El director no ve toda la red por ser director: ve su ámbito. Sus Peugeot y Citroën de VN/KM0/demo y, además, los VO que esté vendiendo su equipo.»

Abrir después **4821 LKM**.

Explicar:

> «Este BMW es VO, pero lo está vendiendo Juan. Por eso lo puede seguir su director de VN sin quitarle el control al responsable de VO.»

Si se desea demostrar flujo, pedir una preparación sobre un vehículo de su ámbito que no tenga ya una solicitud incompatible.

### 3. Cambiar a Responsable VO

Duración: 2 minutos.

Buscar **4821 LKM** y luego **9032 MTR**.

Explicar:

> «El responsable de VO mantiene todo su parque, independientemente de si lo vende un comercial propio de VO o uno de VN. El BMW sigue siendo responsabilidad VO aunque lo venda Juan.»

Esto demuestra que comercial asignado y responsabilidad de stock son conceptos distintos.

### 4. Dirección Opel · Fiat · Jeep

Duración: 1 minuto.

Buscar **7251 KRX** y comprobar que aparece el Opel Astra.

Después intentar localizar el Peugeot 3008 desde este perfil: no debe formar parte de su ámbito.

Explicar:

> «Los ámbitos se configuran por marcas y equipo, no creando una aplicación distinta para cada director.»

### 5. Preparación

Duración: 2 minutos.

Entrar como **Pedro Larrea**.

Mostrar la cola de preparación y destacar:

- vehículo;
- ubicación;
- sede;
- comercial asignado.

Explicar:

> «Cuando Comercial o Dirección pide una preparación, el preparador la recibe dentro de su flujo de trabajo y ya sabe para quién es el coche. No hace falta trasladar el contexto por WhatsApp.»

Si se abre una preparación, enseñar checklist, tiempos y reportaje final de cuatro fotos sin completar artificialmente el trabajo durante la reunión.

## Cierre

Terminar con:

> «Ahora mismo estamos enseñando datos demo. El siguiente salto no es rediseñar la operativa, sino conectar la infraestructura real, cargar datos controlados de Urkiola y hacer un piloto con pocos usuarios y vehículos antes del despliegue general.»

## Qué NO afirmar en la reunión

No presentar la demo como producción terminada.

Todavía quedan, entre otros, despliegue real Render/Supabase, piloto con datos controlados, validación en dispositivos Android, publicación/distribución y conexión real con QBI/Quiter.

La demo sí representa el flujo funcional y los permisos que se están construyendo.
