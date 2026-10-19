import { CameraView, useCameraPermissions } from 'expo-camera';
import { extractTextFromImage, isSupported } from 'expo-text-extractor';
import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Btn, Notice, radius, useTheme, tipografia } from '@/ui';
import { leerTexto } from '@/data/lectura';

export interface BarcodeScannerProps {
  onScan: (value: string) => void;
  height?: number;
}

/**
 * Lector del coche con la cámara.
 *
 * Lee solo los códigos de barras (VIN en Code 39 / Code 128 / QR del
 * fabricante) en cuanto aparecen, y con el botón lee además el **texto**:
 * el bastidor grabado en la placa del parabrisas o la matrícula. Antes solo
 * leía códigos, y casi ningún coche lleva uno a mano: en el parabrisas lo que
 * hay son los 17 caracteres escritos.
 *
 * El texto se reconoce en el propio móvil (ML Kit de Google), sin mandar la
 * foto a ningún sitio y sin cobertura.
 */
export function BarcodeScanner({ onScan, height = 220 }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const { c } = useTheme();
  const camara = useRef<CameraView>(null);
  const lastScan = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [opciones, setOpciones] = useState<string[]>([]);

  if (!permission) {
    return <Notice>Comprobando permisos de cámara…</Notice>;
  }

  if (!permission.granted) {
    return (
      <View style={{ gap: 8 }}>
        <Notice tone="warn">
          Necesitamos la cámara para leer la matrícula o el bastidor. También puedes escribirlos.
        </Notice>
        <Btn variant="primary" onPress={requestPermission}>
          Permitir cámara
        </Btn>
      </View>
    );
  }

  const leer = async () => {
    if (!camara.current || leyendo) return;
    setLeyendo(true);
    setAviso(null);
    setOpciones([]);
    try {
      const foto = await camara.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (!foto?.uri) throw new Error('sin foto');
      // El lector quiere la ruta del fichero, sin el «file://» delante.
      const lineas = await extractTextFromImage(foto.uri.replace(/^file:\/\//, ''));
      const { bastidores, matriculas } = leerTexto(lineas);
      // El bastidor manda: identifica el coche sin dudas; la matrícula puede
      // ser la de otro coche que salga en la foto.
      const encontrados = [...bastidores, ...matriculas];
      if (encontrados.length === 1) onScan(encontrados[0]);
      else if (encontrados.length > 1) setOpciones(encontrados);
      else setAviso('No he leído ninguna matrícula ni bastidor. Acércate, que salgan rectos y sin reflejos, y vuelve a probar.');
    } catch {
      setAviso('No se ha podido leer la foto. Vuelve a probar o escríbelo.');
    } finally {
      setLeyendo(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
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
          ref={camara}
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
          <Text style={{ color: '#fff', fontSize: tipografia.micro, backgroundColor: '#0008', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
            Apunta a la matrícula o al bastidor del parabrisas
          </Text>
        </View>
      </View>
      {isSupported ? (
        <Btn variant="primary" icon="foto" loading={leyendo} onPress={leer}>
          Leer matrícula o bastidor
        </Btn>
      ) : null}
      {opciones.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: tipografia.small, color: c.textMuted }}>He leído varias. ¿Cuál es?</Text>
          {opciones.map((o) => (
            <Pressable
              key={o}
              onPress={() => {
                setOpciones([]);
                onScan(o);
              }}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: radius.md,
                padding: 10,
                backgroundColor: pressed ? c.surfaceAlt : c.surface,
              })}
            >
              <Text style={{ fontSize: tipografia.strong, fontWeight: '800', color: c.text, letterSpacing: 1 }}>{o}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {aviso ? <Notice tone="warn">{aviso}</Notice> : null}
    </View>
  );
}
