# Mantenimiento y evolución

Una vez el backend esté en el servidor y el equipo trabajando con la app,
**se pueden seguir haciendo cambios y mejoras sin problema**. Es lo normal:
un sistema así no se termina, se afina con el uso.

Lo que cambia respecto a hoy no es *si* se puede, sino **a qué velocidad
sale cada tipo de cambio**. Son tres velocidades, y conviene tenerlas
claras para marcar expectativas con el equipo.

| Tipo de cambio | Quién lo hace | Cuándo lo ve el usuario |
|---|---|---|
| Configuración (checklists, sedes, objetivos…) | Un administrador, desde la app | Al instante |
| Pantallas, filtros, correcciones | Programador | Web: al recargar · Móvil: al abrir la app |
| Dependencias nativas, versión del SDK, permisos | Programador | Minutos (prueba interna de Play) |
| Base de datos y API | Programador | Según despliegue, con cuidado |

---

## 1 · Cambios sin programador

Buena parte de lo que pedirá el equipo ya se hace desde **Administración**,
sin tocar código y sin desplegar nada:

- añadir, editar o borrar requisitos del checklist de preparación,
- decidir a qué tipo (VN/VO) y a qué sedes aplica cada requisito,
- marcar un requisito como «simple check» (sin cronómetro) u opcional,
- cambiar los objetivos de tiempo de VN y VO,
- cambiar el umbral de horas sin comprobación física,
- añadir motivos de espera,
- crear zonas nuevas (tejavanas o parkings) con sus plazas.

Esto es probablemente la mitad de las «mejoras» del primer año. Conviene
enseñar bien esta pantalla a quien vaya a administrar el sistema: cada cosa
que sepa hacer ahí es una petición que no llega al programador.

---

## 2 · Cambios en la app y la web

### La web

```bash
git push        # Railway construye y publica; la web va dentro del servicio
```

Los usuarios lo ven al recargar la página. Sin interrupción del servicio:
Railway solo cambia al despliegue nuevo cuando arranca bien.

Con la opción de servidor propio son dos órdenes en vez de una:

```bash
npm run build:web                       # genera dist/
scp -r dist usuario@servidor:/opt/urkiola/
```

### El móvil, sin pasar por las tiendas

Aquí está la ventaja de haber usado Expo. **EAS Update** publica los
cambios de JavaScript directamente en los móviles ya instalados:

```bash
eas update --branch production --message "Nuevo filtro en Solicitudes"
```

El operario lo tiene la próxima vez que abre la app. Sin revisión de Apple
ni de Google, sin que nadie tenga que actualizar nada a mano. Esto permite
corregir un fallo el mismo día que aparece.

Esto no pasa por Google Play: no hay revisión que esperar ni versión nueva
que subir.

> **Pendiente de activar.** `expo-updates` está instalado y los canales
> (`development`, `preview`, `production`) están definidos en `eas.json`,
> pero las actualizaciones OTA todavía no funcionan: falta ejecutar
> `eas init` y `eas update:configure`, que rellenan la URL de
> actualizaciones y la `runtimeVersion` en `app.config.ts`. Son dos
> comandos, pero hay que hacerlos antes de la primera compilación de
> producción.

### Lo que NO viaja por OTA

Una actualización OTA solo lleva JavaScript y recursos. **No** puede:

- añadir o quitar un módulo nativo (cámara, notificaciones, ficheros…),
- subir la versión del SDK de Expo o de React Native,
- cambiar permisos, iconos, nombre de la app o identificadores.

El mecanismo que lo controla es la **`runtimeVersion`**: una actualización
solo llega a las apps compiladas con la misma. Si cambias algo nativo,
cambia la `runtimeVersion` y hace falta compilación nueva; los móviles con
la versión anterior seguirán recibiendo las OTA de su propia rama hasta que
actualicen desde la tienda.

---

## 3 · Cambios nativos

```bash
eas build --profile production --platform android
eas submit --profile production --platform android
```

En el canal de **prueba interna** de Play la versión está disponible en
minutos, sin revisión completa. Si algún día la app pasa a producción
pública, la revisión son horas.

Los móviles se actualizan solos, como cualquier app de Play. Aun así
conviene agrupar los cambios nativos: cada uno consume una versión y obliga
a que todo el mundo descargue.

---

## 4 · El backend: la parte que exige cuidado

### Regla de oro: añadir, no romper

**Los móviles no se actualizan todos a la vez.** Habrá gente con la versión
de la semana pasada durante días. Si el servidor deja de enviar un campo
que la app antigua lee, esa app se rompe en el bolsillo de alguien que está
en la campa, sin cobertura y con 40 coches que recontar.

Por tanto:

- ✅ **Añadir** campos nuevos a las respuestas: las apps viejas los ignoran.
- ✅ **Añadir** tipos de comando nuevos: las apps viejas no los envían.
- ✅ Aceptar campos que ya no uses, y descartarlos en silencio.
- ❌ **Nunca** quitar ni renombrar un campo que alguna versión instalada lee.
- ❌ **Nunca** cambiar el significado de un valor existente (por ejemplo,
  que `pendiente` pase a querer decir otra cosa).

Cuando de verdad haya que romper algo, se hace en dos pasos: primero se
añade lo nuevo y conviven ambos durante unas semanas; después, cuando ya
nadie usa la versión antigua, se retira lo viejo.

### Migraciones de base de datos

Desde la primera tabla, los cambios de estructura van con **migraciones
versionadas** (Prisma Migrate, Drizzle o `node-pg-migrate`), nunca a mano
sobre el servidor.

Con migraciones, cambiar el modelo de datos con seis meses de operativa
dentro es rutina. Sin ellas, es un problema serio: nadie sabe en qué estado
está la base de datos real ni cómo volver atrás.

Antes de cada migración en producción: **copia de seguridad**. Siempre.

---

## 4 bis · Cuando cambia la configuración de serie

Hay un caso fácil de pasar por alto y que ya nos mordió una vez: la app
guarda una copia del estado en el dispositivo, y ahí dentro va la
**configuración** (roles, permisos, requisitos, campos propios). Si cambias
un rol de serie en el código y no haces nada más, quien ya tenga datos
guardados seguirá viendo la configuración vieja para siempre. En pruebas no
se nota, porque un navegador limpio siempre coge lo último.

Por eso existe `STATE_SCHEMA_VERSION` en `src/data/store.tsx`:

```ts
const STATE_SCHEMA_VERSION = 2;
```

**Súbela cada vez que cambies el modelo de datos o la configuración de
serie.** Al arrancar, la app compara la versión guardada con esa: si no
coinciden, descarta lo local y vuelve a partir de cero (en demostración,
del parque de ejemplo; con backend, de lo que diga el servidor). Los
comandos pendientes de subir no se tocan nunca: son trabajo de la persona,
no caché.

En producción esto no pierde nada, porque el servidor manda. En modo
demostración sí se pierden las pruebas que hubiera hecho el usuario, y es
lo correcto: vale más eso que arrastrar una configuración caducada.

## 5 · Entornos

Tres, y ya están previstos en `eas.json`:

| Entorno | API | Canal de la app | Para qué |
|---|---|---|---|
| Desarrollo | vacío (modo demostración) | `development` | Trabajo diario del programador |
| Pruebas | `api-pre.urkiolacarservice.com` | `preview` | Probar antes de tocar lo real |
| Producción | `api.urkiolacarservice.com` | `production` | El sistema que usa el equipo |

> La dirección del servidor se incrusta al compilar y **Metro la cachea**.
> Si la cambias, compila con `--clear` o la app seguirá apuntando a la
> anterior. Es un fallo silencioso y desconcertante: la app parece
> funcionar pero habla con el servidor equivocado.

El entorno de pruebas debe tener **su propia base de datos**, nunca la de
producción. Lo más práctico es cargarla con una copia reciente de los datos
reales, para probar contra volúmenes y casos de verdad.

La app de pruebas se instala por enlace (APK del perfil `preview`), sin
pasar por Play. Conviene que una o dos personas del equipo la tengan en el
móvil y prueben los cambios antes de subirlos.

---

## 6 · Flujo de un cambio

1. Rama nueva desde la principal.
2. `npm run typecheck` y probar en local.
3. Desplegar en **pruebas** y verificar con datos parecidos a los reales.
4. Que alguien del equipo lo pruebe de verdad en su móvil.
5. Fusionar a la rama principal.
6. Desplegar en producción: backend primero (que es compatible hacia
   atrás), después la web, después la OTA del móvil.
7. Mirar que no haya errores en las horas siguientes.

Ese orden importa: el backend nuevo tiene que aceptar tanto la app vieja
como la nueva, así que se despliega primero y no rompe a nadie.

---

## 7 · Copias de seguridad y vuelta atrás

### Copias

Supabase hace copias diarias con 7 días de retención en el plan Pro. Eso
cubre el «se ha borrado algo esta semana», no el «hemos perdido la cuenta».

**Una copia que nunca has restaurado no es una copia.** Una vez al mes,
restaura la última en el proyecto de pruebas y comprueba que la aplicación
arranca con esos datos:

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom > urkiola-$(date +%F).dump
pg_restore --clean --no-owner --dbname "$DATABASE_URL_PRE" urkiola-2026-08-23.dump
```

Guarda además una copia **fuera de Supabase** (otro proveedor, un disco de
la oficina), semanal. Si se pierde el acceso a la cuenta, las copias que
viven dentro se pierden con ella. Con servidor propio vale lo mismo
cambiando Supabase por la máquina.

### Volver atrás

| Qué falla | Cómo se vuelve |
|---|---|
| La web | Volver a copiar el `dist/` anterior |
| Una OTA del móvil | `eas update:republish` apuntando a la versión buena |
| Una versión nativa con fallo | Detener el despliegue en Play y volver a publicar la anterior |
| El backend | Volver al contenedor de la versión anterior |
| Los datos | Restaurar la copia (y avisar de lo que se pierda) |

El caso de los datos es el único irreversible de verdad, y por eso las
copias y las migraciones son lo primero que hay que montar.

---

## 8 · Versión mínima soportada

**Todavía no está implementado**, y conviene hacerlo antes de tener muchos
móviles en la calle.

La idea: la API devuelve cuál es la versión mínima de app que acepta, y la
app, si es más antigua, enseña una pantalla que pide actualizar en vez de
dejar trabajar. Sirve para dos cosas:

- retirar versiones muy viejas cuando de verdad haya que romper algo,
- evitar que alguien registre datos con una versión que tiene un fallo
  conocido.

Es poco trabajo: un campo en la respuesta de `/state` y una comprobación al
arrancar.

---

## 9 · Calendario recomendado

| Cada | Qué |
|---|---|
| Semana | Mirar los errores del backend y los avisos que no se están entregando |
| Mes | Restaurar una copia en pruebas y comprobar que arranca |
| Trimestre | Actualizar dependencias menores; revisar espacio en disco y tamaño de la base de datos |
| Semestre | Subir de versión el SDK de Expo (Expo saca dos al año) y publicar versión nueva |
| Año | Revisar los avisos de Play sobre versiones mínimas de Android y la política de privacidad |

Lo del SDK de Expo no es opcional a largo plazo: **Google exige cada año
compilar contra una versión reciente de Android** para poder seguir
publicando actualizaciones. Mantenerse al día en saltos pequeños es mucho
más barato que hacer tres saltos de golpe dentro de dos años.

Sobre la clave de firma: con **Play App Signing** activado (lo normal en
apps nuevas) es Google quien guarda la clave final, y una clave de subida
perdida se puede reiniciar. Aun así, guarda las credenciales con
`eas credentials` fuera del equipo de quien compila.

---

## 10 · Lo que no se debe hacer

- **Editar ficheros directamente en el servidor.** Todo cambio pasa por el
  repositorio y se vuelve a desplegar. Si no, nadie sabe qué hay corriendo
  de verdad, y el siguiente despliegue lo pisa.
- **Tocar la base de datos a mano** en producción. Solo migraciones.
- **Probar en producción.** Para eso está el entorno de pruebas.
- **Guardar secretos en el repositorio.** Las contraseñas y la cuenta de
  servicio de Google Play viven en `.env` y en `secrets/`, ambos ignorados
  por git.
- **Desplegar un viernes por la tarde.** Suena a broma; no lo es.

---

## 11 · Lo único irreversible

Casi todo se puede cambiar después. La excepción es el **identificador de
la app**: `com.urkiolamotor.carservice`, ya confirmado y fijado en
`app.config.ts`.

Una vez subida la primera versión a Google Play **no se puede cambiar**:
habría que crear otra aplicación distinta y perder las instalaciones. No lo
toquéis.

El nombre visible sí se puede cambiar cuando queráis.

---

## 12 · Por qué el código lo pone fácil

Tres decisiones del diseño actual abaratan los cambios futuros:

1. **Cada pantalla es un fichero** en `app/(shell)/`. Añadir una pantalla
   no toca ninguna de las demás.
2. **Cada acción es un comando** en `src/data/commands.ts`. Añadir una
   funcionalidad suele ser añadir un tipo de comando y su caso en
   `applyCommand`, sin tocar lo que ya funciona.
3. **La lógica de negocio no depende de React.** `applyCommand` es una
   función pura: el servidor puede usar el mismo fichero, así que una regla
   nueva se escribe una vez y vale para web, móvil y backend.

---

## Pendiente de montar antes de arrancar

Lista corta para no dejarse nada:

- [ ] `eas init` y `eas update:configure` (activar las actualizaciones OTA)
- [ ] Dar de alta la cuenta de Google Play Console (25 US$, tarda días)
- [x] Identificador de la app decidido: `com.urkiolamotor.carservice`
- [ ] Política de privacidad publicada en una URL pública
- [ ] Descargar y guardar las credenciales (`eas credentials`)
- [ ] Migraciones de base de datos desde la primera tabla
- [ ] Entorno de pruebas con su propia base de datos
- [ ] Copias de seguridad fuera del proveedor
- [ ] Primera prueba de restauración
- [ ] Versión mínima soportada en la API y en la app
- [ ] Registro de errores del backend en algún sitio que alguien mire
- [ ] Recordar subir `STATE_SCHEMA_VERSION` al cambiar el modelo o los roles
