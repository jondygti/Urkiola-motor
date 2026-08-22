import React from 'react';
import { Notice } from '@/ui';

export interface BarcodeScannerProps {
  onScan: (value: string) => void;
  height?: number;
}

/**
 * Versión web: los navegadores no dan acceso fiable a la cámara trasera en
 * todos los equipos de campa, así que aquí se trabaja escribiendo la
 * matrícula o el VIN-8. En iOS y Android se usa `BarcodeScanner.native.tsx`.
 */
export function BarcodeScanner(_props: BarcodeScannerProps) {
  return (
    <Notice>
      Escaneo con cámara disponible en la app de Android y iOS. Desde el navegador, escribe la matrícula o el
      VIN-8.
    </Notice>
  );
}
