# Continuidad del proyecto

Actualizado: **20/09/2026**.

Este documento ya no describe una rama pendiente. La versión auditada está integrada en `main`.

## Punto de partida fiable

- rama oficial: `main`;
- backend y cliente comparten reglas de negocio;
- offline e idempotencia están cubiertos por regresiones;
- auditoría final de los cambios de Astra integrada;
- CI completa verde sobre el árbol funcional auditado;
- demo HTML generada automáticamente tras CI en `main`.

## Última auditoría incorporada

Se revisaron traslados, `carrierId`, duplicados, cancelaciones, parkings sin plazas, llaves opcionales, recepción, rutas y permisos. Además se corrigieron bordes no detectados inicialmente: cancelación seguida de entrega, avisos de traslados cancelados, privacidad de llaves frente a transportistas, orden offline independiente de ambas llaves, coherencia de capacidad y selección de sede de preparación.

Las pruebas de regresión permanecen en `server/pruebas/` y no deben relajarse.

## Qué continúa pendiente

1. staging Render + Supabase;
2. backup/restauración completa;
3. migración a Supabase Auth;
4. acceso real a QBI Premium e importador/sincronizador;
5. piloto con usuarios y coches reales;
6. Android/Google Play;
7. producción;
8. multiempresa antes de comercializar a terceros.

## Regla de continuidad

No usar ramas antiguas para saber cómo está el proyecto. Leer `README.md`, `docs/ESTADO-ACTUAL.md` y `docs/ARCHITECTURE.md`, y después el código de `main`.

Los PR y commits históricos se conservan en GitHub aunque se borren sus ramas.

La revisión comercial y sus casos de prueba se describen en `ESTADO-ACTUAL.md`. La demo válida es la generada por la CI del SHA final de `main`, no un archivo de una sesión anterior.
