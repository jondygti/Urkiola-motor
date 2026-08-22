import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef } from 'react';
import { Text, View } from 'react-native';
import { Btn, Notice, radius, useTheme } from '@/ui';

export interface BarcodeScannerProps {
  onScan: (value: string) => void;
  height?: number;
}

/**
 * Lector de códigos del parabrisas (VIN en Code 39 / Code 128 / QR del
 * fabricante). Si el vehículo no lleva código, se escribe la matrícula.
 */
export function BarcodeScanner({ onScan, height = 220 }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const { c } = useTheme();
  const lastScan = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  if (!permission) {
    return <Notice>Comprobando permisos de cámara…</Notice>;
  }

  if (!permission.granted) {
    return (
      <View style={{ gap: 8 }}>
        <Notice tone="warn">
          Necesitamos la cámara para leer el código del parabrisas. También puedes escribir la matrícula.
        </Notice>
        <Btn variant="primary" onPress={requestPermission}>
          Permitir cámara
        </Btn>
      </View>
    );
  }

  return (
    <View
      style={{
        height,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'datamatrix', 'pdf417'] }}
        onBarcodeScanned={({ data }) => {
          const now = Date.now();
          // Evita repetir la misma lectura varias veces por segundo.
          if (lastScan.current.value === data && now - lastScan.current.at < 2500) return;
          lastScan.current = { value: data, at: now };
          onScan(data);
        }}
      />
      <View style={{ position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 11, backgroundColor: '#0008', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
          Apunta al código del parabrisas
        </Text>
      </View>
    </View>
  );
}
