# Easo Logistics

Plataforma web + Android para controlar la logística, ubicación, traslado, preparación, recepción, incidencias y recuentos de vehículos del Grupo Easo.

## Estado actual · 24/10/2026

`main` es la **única rama permanente y la fuente de verdad** del proyecto. Cada cambio entra por una rama temporal y un PR con todas las comprobaciones de GitHub Actions en verde.

Hay un **servidor de prueba** en los planes gratuitos de Render y Supabase y un **APK de prueba** para Android ([`deploy/PRUEBA-GRATIS.md`](deploy/PRUEBA-GRATIS.md)). No es staging ni producción, y la app no está publicada en Google Play.

Arquitectura objetivo de producción:

- **GitHub**: código y CI.
- **Render**: API/backend Node + TypeScript.
- **Supabase**: PostgreSQL, Auth y Storage.
- **Expo / React Native**: una base de código para web y Android.
- **Google Play**: distribución Android.
- **Quiter AutoWeb + QBI Premium**: fuente comercial/DMS; la empresa ya ha contratado QBI Premium, pero la integración aún no está implementada.

Importante: el backend actual ya funciona con PostgreSQL y Storage, pero todavía usa autenticación propia con scrypt + JWT. **Supabase Auth es el objetivo de producción y requiere una migración específica**; no se considera hecho por estar documentado.

## Documentación que manda

1. [`docs/ESTADO-ACTUAL.md`](docs/ESTADO-ACTUAL.md) — qué está hecho y qué falta hoy.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitectura actual y objetivo de producción.
3. [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) — Render + Supabase, staging y producción.
4. [`docs/QBI-PREMIUM.md`](docs/QBI-PREMIUM.md) — integración prevista Quiter/QBI.
5. [`docs/ROADMAP.md`](docs/ROADMAP.md) — orden recomendado desde aquí.
6. [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) — controles actuales y pendientes antes de producción.
7. [`docs/MOBILE_ANDROID.md`](docs/MOBILE_ANDROID.md) — Android y Google Play.
8. [`docs/PRUEBAS-GITHUB.md`](docs/PRUEBAS-GITHUB.md) — CI y demo automática.
9. [`docs/STAGING-CHECKLIST.md`](docs/STAGING-CHECKLIST.md) — pasos verificables para abrir staging sin saltarse seguridad/recuperación.
10. [`deploy/PRUEBA-GRATIS.md`](deploy/PRUEBA-GRATIS.md) — el servidor de prueba gratuito y el APK.
11. [`docs/PANTALLAS.md`](docs/PANTALLAS.md) — qué hace cada pantalla y por qué.

Los documentos fechados como `REVISION-2026-09-13.md` se conservan como histórico. Si contradicen los documentos anteriores, prevalece el estado actual.

## Política de ramas

- `main` es la única rama permanente.
- Todo cambio va por una rama temporal + PR, con la CI en verde, y se fusiona con squash.
- La rama se borra al fusionar. Conviene activar en GitHub «Automatically delete head branches» para que se borre sola.
- No se mantienen ramas como archivo: Git conserva commits y PRs.

## Verlo funcionando

La demo se genera desde el código actual con:

```bash
npm run build:demo
```

Además, cada `push` a `main` ejecuta primero todas las comprobaciones. Solo si quedan verdes, GitHub Actions publica un artefacto `easo-logistics-demo-<sha>` con `easo-logistics-demo.html` durante 30 días.

La demo es offline y de ejemplo. No sustituye la prueba contra Render/Supabase ni Android real.

## Arranque local

```bash
npm install
npm start
npm run web
npm run android
```

Backend local:

```bash
npm run server
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080 npm run web
```

Sin `EXPO_PUBLIC_API_URL`, la app usa el parque de demostración y guarda localmente.

## Comprobaciones

```bash
npm run typecheck
npm run server:test
npm run test:sync
npm run verify
npm run verify:api
npm run build:web
npm run build:demo
```

No se documentan aquí cantidades fijas de asserts porque cambian con las regresiones. La referencia correcta es siempre el log del commit concreto en GitHub Actions.

## Reglas operativas principales

- Sondika es almacén; no prepara.
- Leioa, Galdakao, Ford/Mazda Galdakao, Anoeta e Irun preparan.
- VN se identifica principalmente por bastidor; VO por matrícula, conservando VIN cuando exista.
- La plaza individual es opcional: una zona puede existir sin plazas numeradas.
- Un traslado solo se completa al llegar al destino real de esa solicitud.
- Traslados cancelados no se reabren por reintentos ni generan avisos de recogida.
- `carrierId` determina qué empresa de transporte ve un traslado; sin empresa asignada, ningún transportista externo lo ve.
- Preparación completa y repaso son servicios distintos y no se duplican de forma incompatible.
- La cancelación conserva histórico, autor, fecha y motivo; no mueve físicamente el vehículo.
- La ubicación de llave principal y segunda llave es opcional, independiente y auditada; no se expone a transportistas externos.
- El servidor valida permisos, recorta el estado por usuario y es idempotente por `command.id`.
- Las evidencias (fotos/albaranes) solo se sirven si están referenciadas por datos que ese usuario está autorizado a recibir; la subida exige un rol operativo con trabajo fotográfico.
- La app conserva trabajo offline y reintenta sin duplicar operaciones.

## Siguiente paso

Si no se añaden más funciones, el orden recomendado es:

**gobierno GitHub + staging Render/Supabase → prueba conectada y restauración → QBI Premium → piloto con pocos usuarios/coches → Android interno → producción → integración completa Quiter → multiempresa solo cuando Urkiola esté estable.**

El detalle está en [`docs/ROADMAP.md`](docs/ROADMAP.md).
