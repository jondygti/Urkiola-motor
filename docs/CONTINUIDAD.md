# Primera entrega con Codex · 12 de septiembre de 2026

## Actualización de la demo y servicios · 13 de septiembre

La rama ya está publicada en GitHub mediante la propuesta #1. Las decisiones
v2 están en `ARCHITECTURE.md`, `MOBILE_ANDROID.md` y `ROADMAP.md`.

La demo HTML usa navegación por fragmentos para abrirse desde un archivo
local sin confundir la ruta de Windows con una pantalla. El preparador puede
indicar si hay campaña y marcarla realizada. Preparación completa y repaso
tienen secciones de configuración, solicitudes y listas diferenciadas; el
panel de oficina separa sus métricas.

La revisión de servicios corrige apertura y cierre de solicitudes cruzadas:
se exige mismo vehículo, sede y tipo de servicio. Repetir el cierre de un
trabajo terminado no vuelve a cerrar solicitudes ni añadir eventos. Los
encargos antiguos sin tipo se consideran preparación de entrada. El permiso
para abrir un encargo también comprueba sede y tipo.

Se mantiene una ejecución activa por vehículo: el otro servicio espera a que
termine. Aún no existe una relación por ID entre solicitud y ejecución, por
lo que varias solicitudes abiertas del mismo tipo, coche y sede necesitan
una revisión adicional antes de habilitar ejecuciones paralelas. Tampoco se
declara terminada la validación en navegador, Android real o PostgreSQL.

Base revisada: `06ddbfc4773d9d8ff58049a4013952d39e511a4f` de `main`.
Rama de trabajo: `codex/fiabilidad-operativa`.

## Qué cambia

- Una pantalla abierta descarga los cambios de los demás cada 30 segundos,
  al recuperar conexión y al volver al primer plano, aunque no tenga nada
  pendiente de enviar. Conserva encima los cambios locales pendientes.
- Una sesión caducada pausa los envíos y pide entrar de nuevo. Los comandos
  pendientes no se convierten en rechazos ni se borran por recibir un 401.
- Cada servidor y cada cuenta guardan su propia caché, cola y rechazos.
  La actualización copia la cola antigua agrupada por autor antes de
  retirarla. Cambiar de usuario no envía trabajo con otra identidad.
- Los rechazos definitivos quedan guardados para revisarlos después de un
  reinicio y dejan de mostrarse como operaciones completadas.
- Una observación física antigua conserva su registro sin sustituir una
  ubicación comprobada después, incluso si afectaba a otro coche en la
  misma plaza. Incluye movimientos, comprobaciones, recuentos y descargas.
- Leer un aviso solo marca la lectura del destinatario que lo lee.
  «Leer todos» respeta su bandeja. Los avisos anteriores que ya estaban
  marcados globalmente se conservan leídos: no hay datos para reconstruir
  quién los había leído antes.
- Un comercial gestiona la entrega y la fecha de sus coches; la oficina
  mantiene la gestión de la red. La pantalla y el servidor usan la misma
  comprobación.
- Un usuario recién creado puede establecer su primera contraseña desde
  «Primer acceso o nueva contraseña». Requiere configurar el proveedor de
  correo y la URL pública del servidor, como la recuperación anterior.
  No se envía un correo automáticamente al dar de alta a alguien.
- El servidor evalúa los avisos y los repasos de entrega al arrancar y
  cada minuto, aunque nadie tenga abierta la app. Repetir el barrido no
  duplica el repaso del mismo vehículo y día.
- Reiniciar el servidor no sustituye la contraseña que el administrador
  haya cambiado después de crear su cuenta.

## Comprobación y entrega

Se han añadido pruebas para las sesiones caducadas, cambios de cuenta,
respuestas tardías, fallos de disco, recuperación tras reiniciar, avisos
individuales, movimientos antiguos, primeros accesos y reloj del servidor.
Los correos de las pruebas se capturan en memoria; no se contacta con
usuarios reales.

Comprobado: TypeScript, pruebas del servidor, pruebas del StoreProvider y
compilación web. La compilación de comprobación apunta a una API local;
para desplegar hay que compilar con la dirección real del servidor.

No se ha verificado esta entrega en un navegador ni en un dispositivo
Android: el entorno no pudo descargar Chromium. Las pruebas de persistencia
usan ficheros temporales; la transacción de PostgreSQL necesita además su
comprobación en el entorno de despliegue.

La rama se prepara para incorporar al repositorio. No se ha desplegado en
producción ni se ha cambiado `main`.

## Trabajo pendiente

- Conectar GitHub para publicar la rama y revisar su incorporación.
- Ejecutar los recorridos de navegador y probar dos dispositivos reales,
  incluyendo una actualización con trabajo pendiente y un corte de red.
- Configurar y probar despliegue, correo, copias y restauración. Las fotos
  de Supabase Storage necesitan una copia propia; el script actual no la
  realiza y una copia de la base de datos no contiene esos objetos.
- Recibir un export real de Quiter antes de escribir el importador.
- Completar la distribución y comprobación de Android.
