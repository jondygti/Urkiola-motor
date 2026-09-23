# Checklist de staging

Actualizado: **20/09/2026**.

Objetivo: pasar de la base funcional auditada a un entorno real controlado **sin introducir todavía datos operativos completos**.

## 0. Gobierno del repositorio

Antes de cargar secretos o datos reales:

- [ ] decidir y aplicar repositorio privado para el proyecto interno;
- [ ] proteger `main` o crear un ruleset que exija la CI oficial antes de merge;
- [ ] activar borrado automático de ramas después de merge;
- [x] ramas temporales históricas eliminadas (comprobado el 22/09/2026); eliminar también las que se creen en futuras revisiones;
- [ ] revisar los PR de Dependabot uno a uno mediante CI, sin agrupar actualizaciones nativas a ciegas.

Estas operaciones son ajustes de GitHub y no se sustituyen con cambios de código.

## 1. Supabase staging

- [ ] proyecto independiente de producción;
- [ ] región europea adecuada;
- [ ] PostgreSQL accesible por una conexión compatible con sesiones/advisory locks;
- [ ] bucket `urkiola-fotos` privado;
- [ ] service-role únicamente en Render;
- [ ] políticas/accesos revisados;
- [ ] presupuesto/alertas configurados.

## 2. Render staging

- [ ] validar/revisar `render.yaml` en Render antes de crear recursos;
- [ ] servicio Docker desde `server/Dockerfile`, contexto raíz;
- [ ] una única instancia;
- [ ] variables según `deploy/render.env.example`; `EXPO_PUBLIC_API_URL`, `PUBLIC_URL` y `CORS_ORIGEN` deben apuntar al staging real;
- [ ] `URKIOLA_SEMILLA=vacia`;
- [ ] health check `/health`;
- [ ] dominio/URL de staging;
- [ ] CORS sin comodines;
- [ ] TLS y cabeceras verificadas.

## 3. Prueba funcional conectada

- [ ] login/cambio/recuperación de contraseña;
- [ ] alta de usuarios de prueba;
- [ ] lectura y escritura desde dos dispositivos;
- [ ] redeploy solapado de Render: una escritura ya iniciada termina, las nuevas reciben 503/reintento y la nueva instancia toma liderazgo sin pérdida ni duplicado;
- [ ] comandos offline pendientes durante caída/redeploy;
- [ ] subida y lectura de evidencias dentro del ámbito;
- [ ] intento negativo de leer evidencia de otro ámbito;
- [ ] transportista aislado de flota, comerciales, llaves y evidencias ajenas;
- [ ] Director Comercial y Responsable VO limitados a sus ámbitos;
- [ ] preparación, traslado, llaves Sondika y entrega completos.

## 4. Recuperación

- [ ] ejecutar `npm run copia` contra staging;
- [ ] guardar la copia fuera de Supabase/Render;
- [ ] restaurarla en una base/bucket vacíos;
- [ ] arrancar el backend restaurado;
- [ ] verificar `/health`, login, histórico y fotos.

Una copia sin restauración probada no cuenta como recuperación validada.

## 5. QBI Premium

Solo después de que staging sea estable:

- [ ] recibir documentación y método real de acceso de Quiter;
- [ ] crear credencial de solo lectura;
- [ ] inventariar campos reales;
- [ ] construir staging/dry-run de importación;
- [ ] probar con 20–30 vehículos;
- [ ] demostrar que una importación nunca sobrescribe logística Urkiola.

## 6. Criterio para comenzar el piloto

El piloto empieza únicamente cuando los puntos anteriores críticos están verdes. Usar pocos usuarios y pocos coches, y durante el piloto corregir solo errores, seguridad, bloqueos operativos e incompatibilidades con datos reales.
