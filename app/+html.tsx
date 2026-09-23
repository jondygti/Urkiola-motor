import { ScrollViewStyleReset } from 'expo-router/html';
import React from 'react';

/**
 * Plantilla HTML de la versión web. Solo se usa en el build web estático.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#10262d" />
        <meta
          name="description"
          content="Easo Logistics · gestión logística de flota: campa, traslados, preparación, recuentos e incidencias."
        />
        <title>Easo Logistics</title>
        <ScrollViewStyleReset />
        {/* La fuente va incrustada en su propio fichero, generado al
            compilar: así se cachea aparte del programa y no hay que
            descargarla otra vez en cada versión nueva. */}
        <link rel="stylesheet" href="/fuente.css" />
        <style dangerouslySetInnerHTML={{ __html: bodyStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const bodyStyle = `
body { background-color: #f3f6f7; }
@media (prefers-color-scheme: dark) {
  body { background-color: #0b171b; }
}
`;
