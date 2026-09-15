# Mantenimiento y evolución

Actualizado: **15/09/2026**.

## Regla principal

`main` es la única rama permanente. No se guardan ramas por herramienta o sesión.

Para un cambio pequeño y seguro puede trabajarse directamente sobre `main` tras comprobar el estado. Para un cambio de riesgo alto se admite una rama temporal + PR, que debe eliminarse tras el merge.

## Flujo recomendado de un cambio

1. Reproducir el problema.
2. Cambiar solo lo necesario.
3. Añadir regresión si corresponde.
4. Ejecutar TypeScript, servidor, sync y las suites de navegador relevantes.
5. Validar en staging si afecta a backend, datos, auth, fotos, QBI o Android.
6. Llevar a `main`.
7. Comprobar GitHub Actions.
8. Si fue una rama temporal, eliminarla.

No relajar pruebas para conseguir verde.

## Web y backend

Objetivo de producción: **Render**.

Un push aprobado a `main` será la fuente del despliegue. No modificar producción por SSH ni a mano salvo recuperación documentada.

Mientras el backend mantenga su modelo de estado actual, usar una instancia activa. Si algún día se necesita escalado horizontal, rediseñar primero el procesamiento ordenado de comandos.

## Supabase

Objetivo:

- PostgreSQL para datos;
- Auth para identidad;
- Storage para fotos/albaranes.

Base de datos y Storage necesitan copias independientes. Restaurar periódicamente en staging.

## Android

Los cambios JavaScript compatibles pueden usar EAS Update cuando esté configurado. Cambios nativos, SDK, permisos, iconos o identificador requieren nueva build y prueba interna de Google Play.

Antes de publicar:

- proyecto EAS definitivo;
- firma Android custodiada;
- package definitivo sin cambios posteriores;
- AAB probado en Internal testing;
- política de privacidad y ficha revisadas.

## Compatibilidad hacia atrás

Los móviles no se actualizan todos a la vez. El backend debe preferir cambios aditivos:

- añadir campos y comandos;
- aceptar durante un tiempo formatos antiguos;
- no renombrar/quitar de golpe algo que una app instalada necesita.

## Offline

Nunca borrar una cola pendiente por cambiar versión, cuenta o esquema. Los comandos pendientes son trabajo del usuario, no caché.

Cuando cambie el modelo local/configuración de serie, revisar `STATE_SCHEMA_VERSION` y su migración.

## QBI Premium

El sincronizador deberá tener:

- ejecución repetible/idempotente;
- logs de cada importación;
- métricas de altas/cambios/conflictos;
- alertas si deja de sincronizar;
- credenciales de solo lectura;
- staging antes de producción.

Los cambios de mapeo QBI se prueban con una muestra antes del stock completo.

## Calendario operativo recomendado

- **semanal**: revisar errores, salud de Render y sincronizaciones QBI;
- **mensual**: restaurar una copia en staging;
- **trimestral**: dependencias, costes, tamaño de base/Storage y accesos;
- **semestral**: revisar Expo/Android y publicar build nativa si corresponde;
- **anual**: auditoría de seguridad, RGPD, accesos y continuidad.
