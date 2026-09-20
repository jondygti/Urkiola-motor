# Integración Quiter AutoWeb · QBI Premium

Estado: **QBI Premium ya contratado por la empresa; integración todavía no implementada**.

Actualizado: 20/09/2026.

## Objetivo

Evitar copiar manualmente toda la base de Quiter y evitar acceso de escritura al DMS durante la primera implantación.

Diseño:

`Quiter AutoWeb → QBI Premium → sincronizador en Render → staging en Supabase → validación/mapeo → Urkiola Car Service`

No se asume aún si Quiter entregará PostgreSQL, otro motor relacional, exportaciones o un mecanismo específico. Esa decisión se toma con la documentación y credenciales que entregue Quiter.

## Fuente de verdad

**Quiter/QBI manda en:**

- VIN/bastidor;
- matrícula;
- VN/VO;
- marca/modelo/versión cuando exista;
- estado comercial/DMS;
- comercial asignado cuando exista;
- datos de stock que acordemos importar.

**Urkiola manda en:**

- ubicación física detallada;
- zona/plaza;
- movimientos;
- solicitudes de traslado;
- empresa de transporte y ciclo de recogida/entrega;
- preparación/repaso;
- recuentos;
- incidencias/fotos;
- llaves;
- histórico logístico.

Una sincronización QBI nunca debe borrar ni sobrescribir datos logísticos porque Quiter cambie un dato comercial.

## Identidad del vehículo

- usar VIN completo como identidad externa siempre que esté disponible;
- conservar VIN-8 para la operativa existente, pero no asumir que es una clave global válida para multiempresa;
- matrícula es especialmente útil para VO, pero puede cambiar y no debe ser la única clave técnica si existe VIN;
- registrar el identificador/origen QBI para trazabilidad.

## Staging

Crear tablas/esquema de staging separados de las tablas/estado operativo. Flujo recomendado:

1. leer QBI con credenciales de solo lectura;
2. guardar lote bruto o normalizado con `import_id` y fecha;
3. validar campos y duplicados;
4. mapear sedes/comerciales/estados;
5. calcular altas/cambios/bajas propuestas;
6. aplicar al dominio mediante un mecanismo idempotente;
7. registrar resultado y conflictos.

No insertar directamente datos QBI en las estructuras operativas sin validación.

## Primeros campos a solicitar a Quiter

- identificador de vehículo;
- VIN completo;
- matrícula;
- VN/VO;
- marca/modelo/versión;
- situación/estado de stock;
- código de ubicación/sucursal;
- comercial y su identificador estable;
- fecha de alta/entrada;
- vendido/entregado/baja cuando esté disponible;
- fecha de última modificación si QBI la ofrece.

## Frecuencia

No fijarla hasta conocer QBI. Como referencia operativa, el sincronizador debe poder ejecutarse de forma incremental y repetible. Si no hay mecanismo de cambios, se puede comparar un snapshot periódico sin duplicar vehículos.

## Seguridad

- credenciales QBI solo en Render;
- usuario de solo lectura;
- restringir red/IP si Quiter lo soporta;
- no incluir secretos en GitHub ni Android;
- registrar fallos sin volcar credenciales ni datos sensibles completos;
- aplicar límites y timeouts;
- no bloquear la operativa de Urkiola si QBI está temporalmente caído.

## Fases

1. Recibir documentación y acceso de Quiter.
2. Inventariar tablas/campos reales.
3. Crear mapeo de sedes/estados/comerciales.
4. Implementar staging y dry-run.
5. Probar 20–30 vehículos.
6. Activar sincronización de solo lectura.
7. Validar con el stock completo.
8. Solo después valorar escritura Urkiola → Quiter si existiera un caso de negocio y Quiter ofrece una interfaz soportada.

## Lo que no hay que hacer

- conectarse a tablas operativas de AutoWeb si Quiter no lo soporta;
- copiar indiscriminadamente clientes y datos personales que Urkiola no necesita;
- inventar el esquema de QBI;
- usar matrícula o VIN-8 sin estrategia de colisiones;
- hacer sincronización bidireccional desde el primer día.
