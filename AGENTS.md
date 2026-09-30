# Instrucciones de trabajo · Easo Logistics

Antes de modificar el proyecto, leer:

1. `docs/ESTADO-ACTUAL.md`
2. `docs/ARCHITECTURE.md`
3. `docs/ROADMAP.md`
4. `docs/SEGURIDAD.md`
5. `docs/STAGING-CHECKLIST.md` si el trabajo afecta al despliegue/piloto.
6. `CLAUDE.md` para las reglas de negocio históricas que siguen vigentes.

## Fuente de verdad

`main` es la única rama permanente. No mantener ramas por herramienta o sesión. Si un cambio complejo necesita una rama temporal, debe fusionarse y eliminarse al terminar.

Objetivo de producción: **Render + Supabase PostgreSQL/Auth/Storage + Expo/Android + Google Play**. QBI Premium está contratado, pero la sincronización con Quiter todavía no está implementada.

## Reglas de modificación

- Reproducir cada problema antes de corregirlo.
- Si algo ya funciona, no tocarlo.
- Mantener arquitectura, comandos compartidos, funcionamiento offline, idempotencia y seguridad backend.
- No hacer refactors generales ni cambios estéticos ajenos al encargo.
- Añadir regresiones para fallos corregidos.
- No borrar ni relajar pruebas para hacerlas pasar.
- Distinguir siempre entre **código actual** y **arquitectura objetivo**.
- No inventar APIs, tablas o campos de Quiter/QBI sin documentación real.
- No subir secretos, `.env`, credenciales de QBI, Render o Supabase.
- Una evidencia remota no se autoriza por su URL/ID: solo si está referenciada en el estado que ese usuario puede recibir.
- No introducir un segundo método de despliegue: la ruta vigente es `server/Dockerfile` + Render + Supabase.
- No modificar el código con workflows de GitHub que escriben en el repositorio: todo cambio va por rama temporal + PR con la CI en verde.
- Reasignar una preparación usa `cambiarDePreparador`; la productividad sale de `tiempoDePreparador` (ver regla 28 de `CLAUDE.md`).
- «Hoy» se cuenta con `diaEnEspana`, no cortando la fecha ISO (regla 29 de `CLAUDE.md`).
- Al subir `STATE_SCHEMA_VERSION`, no escribir el número exacto en las pruebas.

## Comprobaciones mínimas

```sh
npm run typecheck
npm run server:test
npm run test:sync
npm run verify
npm run verify:api
```

GitHub Actions debe quedar verde antes de considerar estable un cambio. En `main`, la demo se publica únicamente después de que servidor y navegador pasen.
