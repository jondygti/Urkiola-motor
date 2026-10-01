import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useAppState } from '@/data/store';
import { api } from '@/data/api';
import { alCambiarMiniaturas, urlMiniatura } from '@/data/miniaturas';
import { abreviaturaDeMarca, ultimaFotoDe } from '@/data/selectors';
import { Modal, radius, tipografia, useTheme } from '@/ui';
import type { Vehicle } from '@/data/types';

/**
 * La foto del coche en pequeño, para reconocerlo en una lista sin leer la
 * matrícula: un coche blanco y uno rojo no se confunden, dos matrículas que
 * empiezan igual sí.
 *
 * Enseña la miniatura de su última foto (`ultimaFotoDe`), nunca la foto
 * original: en una lista de cuarenta coches serían cuarenta fotos de varios
 * megas con los datos del móvil. Si no tiene foto, un cuadro con las tres
 * primeras letras de la marca (PEU, FOR, JEE…).
 *
 * Al pulsarla se abre la foto de verdad, en grande. Esa sí se baja, porque
 * alguien la ha pedido.
 */
export function MiniaturaVehiculo({ vehicle, lado = 48 }: { vehicle: Vehicle | undefined; lado?: number }) {
  const { c } = useTheme();
  const state = useAppState();
  const ref = vehicle ? ultimaFotoDe(state, vehicle.id) : null;
  const [url, setUrl] = useState<string | null>(null);
  const [rota, setRota] = useState(false);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    let viva = true;
    const resolver = () =>
      void urlMiniatura(ref).then((u) => {
        if (viva) setUrl(u);
      });
    setUrl(null);
    setRota(false);
    resolver();
    // La miniatura de una foto recién hecha llega un momento después que la
    // foto: cuando esté, se pinta sin tener que salir y volver a entrar.
    const dejar = alCambiarMiniaturas(resolver);
    return () => {
      viva = false;
      dejar();
    };
  }, [ref]);

  const caja = {
    width: lado,
    height: lado,
    borderRadius: radius.sm,
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.borderSoft,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  // `rota`: la dirección existe pero la imagen no carga. Pasa con las fotos
  // hechas antes de que hubiera miniaturas: el servidor da el permiso, pero
  // no hay cuadrito que enseñar. Mejor la marca que un hueco en blanco.
  if (!url || rota) {
    return (
      <View style={caja} testID="miniatura-marca" accessibilityLabel={`Sin foto · ${vehicle?.brand ?? ''}`}>
        <Text style={{ fontSize: tipografia.label, fontWeight: '900', color: c.textMuted, letterSpacing: 0.5 }}>
          {abreviaturaDeMarca(vehicle?.brand)}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setAbierta(true)}
        style={caja}
        testID="miniatura-foto"
        accessibilityRole="button"
        accessibilityLabel="Ver la foto en grande"
      >
        <Image
          source={{ uri: url }}
          style={{ width: lado, height: lado }}
          resizeMode="cover"
          onError={() => setRota(true)}
        />
      </Pressable>
      {abierta && ref ? (
        <FotoGrande fotoRef={ref} vehicle={vehicle} onClose={() => setAbierta(false)} />
      ) : null}
    </>
  );
}

function FotoGrande({
  fotoRef,
  vehicle,
  onClose,
}: {
  fotoRef: string;
  vehicle: Vehicle | undefined;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let viva = true;
    api
      .urlFoto(fotoRef)
      .then((u) => viva && setUrl(u))
      .catch(() => viva && setFallo(true));
    return () => {
      viva = false;
    };
  }, [fotoRef]);

  const titulo = vehicle ? `${vehicle.plate ?? vehicle.vin8} · ${vehicle.brand} ${vehicle.model}` : 'Foto';

  return (
    <Modal visible onClose={onClose} title={titulo} icon="foto">
      <View
        testID="foto-grande"
        style={{
          width: '100%',
          aspectRatio: 4 / 3,
          borderRadius: radius.md,
          backgroundColor: c.surfaceSunken,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
            onError={() => {
              setUrl(null);
              setFallo(true);
            }}
          />
        ) : (
          <Text style={{ fontSize: tipografia.small, color: c.textFaint }}>
            {fallo ? 'No se ha podido abrir la foto.' : 'Cargando la foto…'}
          </Text>
        )}
      </View>
    </Modal>
  );
}
