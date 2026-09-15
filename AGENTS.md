# Instrucciones de trabajo · Urkiola Car Service

Antes de modificar el proyecto, leer:

1. `docs/ESTADO-ACTUAL.md`
2. `docs/ARCHITECTURE.md`
3. `docs/ROADMAP.md`
4. `docs/SEGURIDAD.md`
5. `CLAUDE.md` para las reglas de negocio históricas que siguen vigentes.

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

## Comprobaciones mínimas

```sh
npm run typecheck
npm run server:test
npm run test:sync
npm run verify
npm run verify:api
```

GitHub Actions debe quedar verde antes de considerar estable un cambio. En `main`, la demo se publica únicamente después de que servidor y navegador pasen.
