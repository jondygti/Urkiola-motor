# Pruebas en GitHub Actions

El workflow `.github/workflows/comprobaciones.yml` es la comprobación automática oficial.

## Cuándo se ejecuta

- en cada pull request;
- en cada push a `main`;
- manualmente con `workflow_dispatch`.

`main` es la única rama permanente. Una rama temporal queda cubierta por CI al abrir su PR.

## Trabajos

- **Chromium · roles**: recorridos y aislamiento por perfil.
- **Chromium · rutas**: carga de pantallas/rutas.
- **Chromium · funciones**: operaciones reales y persistencia.
- **Chromium · api**: cliente compilado contra backend local real.
- **Servidor, tipos y sincronización**: TypeScript, servidor, offline/sync y navegación demo.

No fijar números de asserts en documentación. El total válido es el que muestre el log del commit ejecutado.

## Demo automática

En un `push` a `main`, el job **Generar demo navegable** espera a que navegador y servidor terminen correctamente. Si algo falla, no publica demo.

Si todo queda verde:

- ejecuta `npm run build:demo`;
- publica `demo/urkiola-car-service-demo.html`;
- nombre del artefacto: `urkiola-demo-<sha>`;
- retención: 30 días.

Los logs de Chromium se conservan como artefactos durante 14 días.

## Regla de aceptación

No dar un cambio por bueno porque compile. Verificar que **todos** los trabajos del commit esperado tengan `success`. No eliminar, saltar ni relajar una regresión para conseguir verde.
