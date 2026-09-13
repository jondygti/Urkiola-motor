# Pruebas en GitHub Actions

El flujo `.github/workflows/comprobaciones.yml` ejecuta las pruebas en Linux
con Chromium instalado mediante Playwright 1.62.1. Usa datos de demostración
y servidores locales del runner; no necesita claves de Render o Supabase.

En la pestaña Actions del repositorio, abrir **Comprobaciones de Urkiola**.
Cada grupo tiene resultado propio:

- **Chromium · roles**: recorridos por perfil (suite descrita originalmente
  como 79 comprobaciones; el registro indica el total realmente ejecutado).
- **Chromium · rutas**: cargas de pantallas por perfil y tamaño.
- **Chromium · funciones**: operaciones y datos guardados.
- **Chromium · api**: navegador contra backend real local, con persistencia en
  archivos de pruebas; no acredita PostgreSQL ni Android nativo.
- **Servidor, tipos y sincronización**: suites sin navegador.

Se dispara en propuestas de cambios y al subir a main o ramas codex. Se
puede iniciar manualmente cuando el flujo esté disponible en la rama principal.
No fusionar solo para probarlo: la subida a la rama de trabajo también tiene
disparador. Push y pull_request pueden generar dos ejecuciones para una misma
subida; cada una muestra su evento y commit.

Las suites del navegador no se cancelan entre sí si una falla. En cada trabajo
se conservan los registros durante 14 días cuando alcanza el paso de pruebas.
Errores de instalación aparecen en los pasos de Actions. No hay pasos que
desplieguen ni permisos de escritura del token del runner.

Una configuración subida no equivale a pruebas superadas: comprobar el commit,
la conclusión de todos los trabajos y los totales en los registros. Si aparece
una solicitud de aprobación de Actions, debe atenderla quien administra el
repositorio. No se rebajan aserciones para obtener un resultado verde.

Referencia de instalación: https://playwright.dev/docs/ci
