# Apoyo técnico externo: qué hace falta y qué pedir

> Antes de encargar nada, léete [`SEGURIDAD.md`](SEGURIDAD.md): es el repaso
> propio que ya está hecho, con lo que se ha resuelto y lo que queda
> justamente para quien venga de fuera. Así no se paga por encontrar lo
> evidente.

Urkiola Car Service lo dirige Jon con mi ayuda: yo escribo el código y la
documentación, él decide qué tiene que hacer el sistema y comprueba que
sirve para el trabajo real. Ese reparto funciona. Este documento es sobre
lo que **ese reparto no cubre**, y qué contratar para taparlo.

No es un documento para contratar a un programador en plantilla ni una
cuota de mantenimiento. Es una red de seguridad, y sale barata comparada
con lo que evita.

## 1 · Qué cubro yo y qué no

Conviene decirlo claro antes de decidir nada:

| Necesidad | ¿Lo cubro? |
|---|---|
| Construir funciones nuevas, corregir fallos, revisar el código | **Sí**, en cada sesión que abras |
| Explicarte por qué algo funciona así, y dejarlo escrito | **Sí**. Por eso existe `docs/` |
| Estar disponible un martes a las 9:40 porque la app no carga | **No.** Trabajo cuando tú abres una sesión, no antes |
| Enterarme solo de que algo se ha caído | **No.** No vigilo nada mientras no estamos trabajando |
| Responder legalmente de una fuga de datos o una pérdida | **No.** No hay contrato, ni seguro, ni responsabilidad profesional detrás |
| Auditar mi propio trabajo | **Mal.** Puedo revisarlo, pero nadie revisa bien lo que ha escrito él mismo |
| Tener las claves de vuestras cuentas | **No**, y no debo tenerlas |

Las dos últimas líneas son las importantes. La primera de ellas es la razón
de la revisión de seguridad del punto 3; la de la disponibilidad es la
razón del punto 4.

## 2 · Las tres cosas que hay que comprar

| # | Qué | Cuándo | Cada cuánto |
|---|---|---|---|
| 1 | **Revisión de seguridad** antes de meter datos reales | Antes de arrancar en serio | Una vez, y repetir al año |
| 2 | **Un teléfono al que llamar** cuando algo se rompe | Desde el día que el equipo depende de la app | Bolsa de horas, se consume o no |
| 3 | **Continuidad**: que otra persona pueda coger esto | Desde el principio | Revisión anual |

No hace falta que las tres sean la misma persona, pero es lo cómodo.

## 3 · La revisión de seguridad: que no me crea a mí

Yo he escrito este código. Eso me descalifica para ser quien certifica que
es seguro, igual que un mecánico no se pasa la ITV a sí mismo. Lo que hay
que encargar es una revisión **de dos o tres días**, con un informe por
escrito, sobre estos puntos concretos:

- Que **el servidor comprueba los permisos en cada comando**, y no se fía de
  lo que diga la app. La app oculta botones por comodidad; eso no es
  seguridad, porque cualquier cliente puede mentir.
- Que las contraseñas y las sesiones están bien montadas: caducan, se
  pueden revocar, y no se guardan en claro en ningún sitio.
- Que **las claves de servicio no viajan dentro de la app ni están en el
  repositorio**. Una clave dentro de un `.apk` la puede sacar cualquiera.
- Que un usuario con la app no puede leer la base de datos entera saltándose
  la API.
- Que las fotos de albaranes e incidencias no son accesibles por una
  dirección que se pueda adivinar.
- Que las copias existen **y se restauran**. Que lo haga delante, no que lo
  diga.
- RGPD: región europea de verdad, DPA firmados, y quién puede ver datos de
  empleados y de clientes.
- Que queda traza de quién hizo qué, y que esa traza no se puede borrar
  desde la aplicación.

**Entregable:** un informe con los hallazgos ordenados por gravedad. Los
arreglos los podemos hacer nosotros: es más barato y así entiendes qué se
ha cambiado. Que revise después.

## 4 · El día que algo se rompe

Antes de dimensionar esto, un dato que quita presión: **la app funciona sin
conexión a propósito**. Si la API se cae, los operarios de campa siguen
registrando movimientos, preparaciones y recuentos en el móvil; todo queda
en una cola y sube solo cuando vuelve el servicio. Una caída de una mañana
es una molestia, no una parada.

Lo que sí es urgente de verdad:

| Situación | Urgencia |
|---|---|
| La API no responde | Media. La app aguanta; el panel web no muestra datos frescos |
| Los datos salen mal (coches donde no están, plazos raros) | **Alta.** Se toman decisiones con eso |
| Se ha perdido información | **Máxima** |
| Alguien ha entrado donde no debía | **Máxima**, y hay que notificarlo por ley |

Por eso lo que hay que pedir es **respuesta en horario laboral, el mismo día
hábil**. No compres guardia 24/7: cuesta varias veces más y aquí no lo
justifica nada, porque de madrugada no se mueven coches.

> Detalle a decidir cuando montemos el servidor: si el panel web se publica
> aparte (Cloudflare Pages, gratis) en vez de servirlo la propia API, una
> caída de la API deja la web abierta con los datos que ya tenía cada
> navegador. Es una hora de trabajo y quita el único punto donde una caída
> se nota de golpe.

## 5 · Cómo te enteras tú antes de que te llamen

Esto no hay que contratarlo: lo montamos nosotros en una tarde y vale para
que el aviso te llegue a ti, no al revés.

| Qué | Para qué |
|---|---|
| **Un vigilante externo** (UptimeRobot, Better Stack y similares tienen plan gratuito) | Comprueba la API cada pocos minutos y te manda un correo o un SMS si deja de responder |
| **Tope y alerta de gasto** en Railway y en Supabase | Que una factura no se dispare sin avisar. Es el susto más común de estas plataformas |
| **Aviso si falla el volcado semanal** | Una copia que dejó de hacerse hace tres meses es peor que no tener copias, porque crees que las tienes |

## 6 · El pliego, para copiar y enviar

> **Proyecto:** plataforma interna de gestión logística de flota para un
> grupo de concesionarios (5 sedes, ~450 vehículos activos, ~40 usuarios).
> Ya está construida y en funcionamiento. **No buscamos desarrollo de
> funcionalidad nueva.**
>
> **Tecnología:** React Native / Expo (web + Android, un solo código),
> API en Node sobre Railway, PostgreSQL y almacenamiento en Supabase
> (región europea). Código en GitHub, documentado en castellano.
>
> **Encargo 1 — Revisión de seguridad y de protección de datos.**
> Dos o tres días, presupuesto cerrado. Informe escrito con hallazgos
> ordenados por gravedad. Puntos mínimos a cubrir: validación de permisos
> en el servidor, gestión de sesiones y contraseñas, exposición de claves,
> acceso al almacenamiento de ficheros, copias de seguridad y su
> restauración, y cumplimiento RGPD (ubicación de los datos y encargados de
> tratamiento). Los arreglos los aplicamos nosotros; se pide una segunda
> pasada de comprobación.
>
> **Encargo 2 — Disponibilidad de respaldo.**
> Bolsa de horas mensual o trimestral, para incidencias que no podamos
> resolver nosotros. Respuesta comprometida en horario laboral, mismo día
> hábil. No se requiere guardia 24/7.
>
> **Encargo 3 — Revisión anual y continuidad.**
> Una jornada al año: repaso de seguridad, dependencias desactualizadas y
> estado de las copias. Y dejar constancia de que, si hiciera falta, podría
> hacerse cargo del proyecto.
>
> **Forma de trabajo:** acceso de solo lectura al repositorio y al entorno
> de pruebas para empezar. Producción solo cuando sea necesario y de forma
> acotada. Todo cambio pasa por el repositorio; no se trabaja directamente
> sobre el sistema en marcha.

## 7 · Cómo saber si el candidato vale, sin ser técnico

No hace falta entender el código para calar a alguien. Haz estas preguntas
y escucha la forma, no el vocabulario:

| Pregunta | Buena señal | Mala señal |
|---|---|---|
| «¿Por dónde empezarías?» | Pide leer la documentación y acceso de solo lectura | Dice que habría que rehacerlo antes de haberlo mirado |
| «¿Cómo compruebas que las copias sirven?» | Restaurando una en el entorno de pruebas, y se ofrece a hacerlo contigo delante | «Supabase ya hace copias» y se queda ahí |
| «¿Qué harías si un martes a las 9 la app no conecta?» | Primero pregunta si se están perdiendo datos o solo retrasando | Promete estar disponible siempre, para todo |
| «¿Me lo explicas sin tecnicismos?» | Te lo explica | Te hace sentir tonto, o se escuda en que es muy complejo |
| «¿Cómo lo presupuestas?» | Cerrado para la revisión, por horas para el resto | Cuota mensual alta y difusa, sin decir qué incluye |

Tres banderas rojas más, que valen por sí solas para descartar:

1. Pide la **clave de firma de la app** sin necesitarla para el encargo.
   Quien la tiene puede publicar en Google Play en vuestro nombre.
2. Quiere **tocar producción directamente** «para ir más rápido».
3. Le molesta que el sistema lo lleves tú con una IA. Es una señal de que
   quiere hacerse imprescindible, y eso es exactamente lo contrario de lo
   que estás comprando.

## 8 · Accesos: qué se da, cómo y cómo se quita

| Regla | Por qué |
|---|---|
| Cuenta **propia y a su nombre**, nunca compartir la tuya | Para saber quién hizo cada cosa, y poder quitarle el acceso sin cambiar el tuyo |
| Empieza en **solo lectura**: repositorio y entorno de pruebas | Casi todo el trabajo de revisión se hace mirando |
| Producción **solo cuando haga falta**, y se retira después | Lo normal es que no la necesite |
| Las claves, por **gestor de contraseñas** (Bitwarden, 1Password) | Nunca por WhatsApp ni por correo: quedan ahí para siempre |
| Al terminar: **revocar y rotar** lo que haya visto | Aunque la relación acabe bien |
| **La clave de firma de Play no se entrega** salvo que vaya a publicar él | Es la llave de vuestra ficha en la tienda. Está en `secrets/`, fuera del repositorio, y ahí se queda |

Y ten una lista, aunque sea un folio: **quién tiene acceso a qué y desde
cuándo**. El día que haya que cerrar accesos, se agradece.

## 9 · Cuánto cuesta, en órdenes de magnitud

Cifras orientativas para freelance senior en España. **Pide presupuesto**,
que esto varía mucho:

| Concepto | Aproximado |
|---|---|
| Revisión de seguridad (2-3 días, presupuesto cerrado) | 800 - 1.500 € |
| Bolsa de horas de respaldo (20 h, se consume o caduca al año) | 1.000 - 1.600 € |
| Revisión anual (1 jornada) | 400 - 600 € |
| **Primer año** | **≈ 2.000 - 3.500 €** |

Para comparar: un desarrollador en plantilla son 35.000-50.000 € al año, y
una empresa de mantenimiento con cuota fija suele salir por encima de esa
cifra sin darte más de lo que pone aquí. Contra el alojamiento
(~400 €/año), esto es lo caro del proyecto — y sigue siendo poco para lo
que cubre.

## 10 · Si de momento no vas a contratar a nadie

Es una decisión legítima, pero hay cuatro cosas que entonces **no se pueden
saltar**:

1. **No metas datos personales de clientes** hasta que haya revisión. Con
   matrículas, bastidores y ubicaciones el riesgo es bajo. Con nombres,
   teléfonos y DNI, ya no: ahí hay obligaciones legales de por medio.
2. **El volcado semanal fuera de Supabase**, y restaurarlo una vez para
   comprobar que sirve.
3. **El vigilante externo y los topes de gasto** del punto 5.
4. **Nunca trabajar directamente sobre producción.** Todo pasa por el
   entorno de pruebas primero.

Con esas cuatro, el peor caso realista pasa a ser «estamos parados unas
horas», que se aguanta. Sin ellas, el peor caso es perder información y no
saberlo hasta que alguien la busca.

## 11 · Dónde buscar

- **Freelance de la zona.** Un desarrollador de Bilbao o alrededores puede
  pasarse por Sondika y ver cómo se trabaja de verdad en campa. Vale más de
  lo que parece.
- **Referencias.** Pregunta a otros concesionarios o a vuestra gestoría
  quién les lleva la parte técnica. Una recomendación de alguien que ya ha
  pagado facturas vale más que un perfil bonito.
- **Consultoras pequeñas** (2-10 personas). Las grandes os van a cobrar por
  el tamaño de su estructura.

Y una advertencia: descarta a quien llegue proponiendo rehacer la
plataforma. Está construida, funciona, está documentada y está probada. Lo
que se busca es alguien que la revise y esté ahí si hace falta, no alguien
que empiece de cero con lo que ya está hecho.
