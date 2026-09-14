# Urkiola Motor

Las instrucciones v2 de Jon están recogidas en `docs/ARCHITECTURE.md`,
`docs/MOBILE_ANDROID.md` y `docs/ROADMAP.md`. Prevalecen sobre las decisiones
anteriores de proveedores: objetivo Render + Supabase PostgreSQL/Auth/Storage,
Android en Google Play y preparación para multiempresa. Documentar primero;
no ejecutar migraciones, contratar ni desplegar por esta decisión documental.

Lee `CLAUDE.md` antes de modificar el proyecto. Contiene las decisiones de
Jon y las reglas de negocio de la aplicación; su nombre procede del
desarrollo anterior y no exige usar una herramienta concreta.

`docs/CONTINUIDAD.md` recoge la primera entrega de correcciones preparada
con Codex y sus límites de comprobación. Complementa la guía anterior.

Trabaja en una rama propia y conserva `main` como referencia estable.
Explica a Jon el efecto de los cambios en castellano y en lenguaje llano.

Comprobaciones de esta entrega, desde la raíz:

```sh
npm run typecheck
npm run server:test
npm run test:sync
npm run build:web
```

Las pruebas de sincronización ejecutan el `StoreProvider` real con red y
almacenamiento simulados. Para comprobar pantallas y navegación están
`npm run verify` y `npm run verify:api`, que necesitan Chromium/Playwright.
