# Repaso de seguridad

Revisión propia del sistema, hecha antes de encargar la auditoría externa.
La idea es sencilla: que no haya que pagarle a nadie por encontrar lo
evidente, y que quien venga sepa dónde mirar.

**No sustituye a la revisión externa** (`APOYO-TECNICO.md`). La escribe
quien ha escrito el código, y eso tiene el límite que tiene.

## Lo que se ha revisado y está resuelto

### Contraseñas

- Se guardan con **scrypt** (sal aleatoria por contraseña, N=16384). Nunca
  en claro, ni en la base de datos ni en los registros.
- La comparación es en **tiempo constante**: comparar con `===` filtra
  cuántos bytes ha acertado quien lo intenta.
- **Mínimo 12 caracteres** y se rechazan las cuatro de siempre. No se piden
  mayúsculas ni símbolos a propósito: esa regla lleva a «Urkiola1!» apuntado
  en un pósit, que es peor que una frase larga.
- **Cambiar la contraseña tira las sesiones abiertas.** Es lo que se espera
  al cambiarla porque te han robado el móvil; sin esto, la sesión del móvil
  perdido seguiría valiendo treinta días.

### Entrar

- **El mismo mensaje** tanto si el correo no existe como si la contraseña
  está mal. Decir cuál de las dos es sirve para averiguar qué correos
  existen, y con eso se empieza a probar contraseñas.
- **Y el mismo tiempo**: la contraseña se comprueba siempre, exista el
  correo o no. Si solo se comprobara cuando existe, contestar antes o
  después diría cuáles existen.
- **Dos frenos** a la prueba de contraseñas: por correo (10 fallos en 15
  minutos) y por dirección de origen (60 fallos, y solo cuentan los fallos:
  una oficina entera entrando por la mañana no puede quedarse fuera).

### Sesiones

- Token JWT firmado con HMAC-SHA256 y `node:crypto`. Se comprueba **el
  algoritmo declarado**: aceptar el que diga el token es el fallo clásico de
  JWT (basta con mandar `alg: "none"`).
- Firma comparada en tiempo constante, caducidad comprobada.
- **Sin secreto fijo el servidor no arranca en producción.** Es a propósito:
  con un secreto aleatorio por arranque, cada despliegue tira las sesiones y,
  con varias instancias, cada una firmaría con el suyo.
- Revocación: desactivar a una persona desde Administración invalida sus
  sesiones al instante, igual que cambiar su contraseña.

### Restablecer la contraseña

- Enlace de **un solo uso**, con caducidad (una hora por defecto), y pedir
  otro invalida el anterior.
- Se guarda el **hash** del código, no el código: con la base de datos
  delante no se puede entrar en una cuenta que tenga un enlace a medias.
- La respuesta es la misma exista el correo o no.
- La comprobación de la contraseña nueva se hace **antes** de gastar el
  enlace: equivocarse al escribirla no obliga a pedir otro.

### Permisos

- **El servidor comprueba cada comando**, con los roles tal y como están
  guardados. Lo que hace la app es comodidad de interfaz: cualquiera puede
  llamar a la API a mano.
- **El `userId` del comando no se cree**: se sustituye por el del token.
- Los **colaboradores externos** (transportista) se comprueban **antes** que
  los permisos de su rol y sin depender de ellos: marcar una casilla de más
  en Administración no puede abrirle la flota a un proveedor.
- Quien tiene sedes asignadas no toca vehículos de otras.
- Hay una **matriz escrita a mano** (`server/pruebas/matriz-permisos.test.ts`)
  con los 44 comandos contra los 6 roles: si alguien añade un comando y se
  olvida del permiso, salta.

### Qué ve cada uno

- Al transportista, `GET /state` le devuelve **solo sus traslados**: ni el
  parque, ni los comerciales, ni la ocupación de las campas, ni los encargos
  de la otra empresa de transporte.
- Quien tiene sedes asignadas recibe lo de sus sedes.

### Fotos

- Se suben al servidor y **no se sirven nunca directamente desde el
  almacén**: pasan por la API, que es donde se comprueba quién las pide.
- Identificador aleatorio de 24 bytes: la dirección no se adivina.
- **Solo se aceptan imágenes y PDF.** En particular NO se acepta SVG, que
  puede llevar código dentro.
- Se responden con `nosniff`, así que el navegador no ejecuta lo que llegue
  aunque el contenido no sea lo que dice la cabecera.
- Tamaño limitado (8 MB), rechazado antes de leer el cuerpo cuando el móvil
  anuncia el tamaño.

### La API

- Cabeceras en todas las respuestas: `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`
  (que no metan la aplicación en un marco para engañar a quien la usa),
  `Referrer-Policy` y, en producción, `Strict-Transport-Security`.
- **CORS con `*` no arranca en producción.** En pruebas es cómodo; en
  producción significa que cualquier página puede llamar a la API desde el
  navegador de quien la visite.
- Tamaño máximo de petición, y se corta la conexión al rechazar por tamaño
  (si no, el móvil se queda esperando una respuesta que ya se mandó).
- La configuración que llega por la API se valida: un objetivo de
  preparación que no sea un número rompería los cronómetros y las barras de
  progreso de todo el mundo a la vez.
- **En los registros no entra ni una contraseña ni un token**: se anota el
  método, la ruta (sin la parte de after de la `?`) y el código.

### Secretos

- `secrets/`, `.env` y las claves están en `.gitignore` y **no hay ninguno en
  el repositorio** (comprobado).
- La clave de servicio de Supabase vive **solo en el servidor**. Si acabara
  en la app, cualquiera podría leer el almacén entero.

## Decisiones conscientes, con su motivo

Cosas que un auditor va a preguntar. No son descuidos:

1. **La sesión viaja en la dirección para poder pintar las fotos.** Una
   etiqueta `<img>` no puede mandar cabeceras. Se acepta la sesión en el
   parámetro `t` **solo** para leer una foto. Atenuantes: los registros no
   guardan la parte de la dirección posterior a la `?`, las fotos salen del
   mismo dominio (no hay a quién filtrarla) y el identificador de la foto ya
   es aleatorio. Alternativa si la auditoría lo pide: direcciones firmadas
   con caducidad corta.

2. **Un solo servidor, y a propósito.** El estado vive en memoria y los
   comandos se aplican de uno en uno. Con Postgres se coge un cerrojo: la
   segunda instancia espera y, si no puede, falla con un mensaje claro en vez
   de corromper los datos.

3. **Identidad propia en vez de Supabase Auth.** Los usuarios, los roles y
   los permisos ya viven en el estado de la aplicación y se editan desde
   Administración; un segundo censo de personas en otro sitio era más
   problema que ventaja. La contrapartida (recuperación por correo) está
   ahora resuelta.

4. **El freno a la prueba de contraseñas es en memoria.** Con varias
   instancias cada una llevaría su cuenta. Con una sola instancia —que es el
   caso— sobra.

## Lo que queda para la revisión externa

Esto **no** lo puedo firmar yo:

1. **Prueba de intrusión real** contra el despliegue, no contra el código.
2. **Repaso de la configuración de Railway y Supabase**: reglas de acceso a
   la base de datos, quién puede entrar al panel de cada proveedor, doble
   factor en esas cuentas. Es donde suelen estar los problemas de verdad, no
   en el código.
3. **Copias de seguridad**: que existan, que estén fuera del proveedor y
   que alguien haya restaurado una alguna vez.
4. **Protección de datos**: los DPA firmados, el registro de actividades de
   tratamiento y qué se hace cuando alguien pide que le borren.
5. **Revisión de dependencias** y de la cadena de compilación. Hoy el
   servidor tiene una sola dependencia (`pg`) a propósito, pero la app móvil
   arrastra el ecosistema de Expo.
6. **Qué pasa si se pierde un móvil.** Hoy: desactivar a esa persona desde
   Administración corta el acceso al instante. Falta acordar quién lo hace y
   en cuánto tiempo.

## Cómo se comprueba

Las comprobaciones de seguridad están dentro de las del servidor:

```bash
npm run server:test
```

Cubren, entre otras cosas: que un token manipulado no cuela, que `alg: none`
no cuela, que cambiar la contraseña tira las sesiones, que un enlace de
restablecer no vale dos veces, que sin sesión no se ven las fotos, que no se
puede colar un fichero que no sea una imagen, y la matriz entera de permisos.
