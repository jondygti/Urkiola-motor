import React from 'react';
import { Text, View } from 'react-native';
import { useAppState } from '@/data/store';
import { locationLabel } from '@/data/format';
import { useTheme } from '@/ui';
import type { Id, Vehicle } from '@/data/types';

/**
 * Dónde está el coche, para ir a por él.
 *
 * Es el dato que le falta al preparador cuando mira su cola: sabe qué coche
 * le toca, pero no dónde está aparcado. Sin esto hay que abrir la ficha o
 * preguntar.
 *
 * Tres avisos que importan más que la ubicación en sí:
 *
 * - **No ha llegado todavía.** Si el coche está en otra sede, no se puede
 *   empezar: es mejor saberlo desde la lista que bajar a buscarlo.
 * - **Plaza sin confirmar.** Puede pasar cuando otro coche ha ocupado su
 *   hueco: se sabe la zona, pero hay que mirar. Decirlo es más honesto que
 *   dar una plaza que igual es mentira.
 * - **Sin ubicación.** Nadie lo ha registrado en ningún sitio.
 */
export function UbicacionVehiculo({
  vehicle,
  esperadoEn,
  compacta = false,
}: {
  vehicle: Vehicle | undefined;
  /** Sede donde toca hacer el trabajo. Si el coche no está ahí, se avisa. */
  esperadoEn?: Id | null;
  compacta?: boolean;
}) {
  const state = useAppState();
  const { c } = useTheme();

  const loc = vehicle?.location ?? null;
  const fuera = !!esperadoEn && !!loc?.siteId && loc.siteId !== esperadoEn;
  const sinPlaza = !!loc?.zoneId && !loc.positionId;
  const tono = !loc ? c.redFg : fuera ? c.amberFg : c.text;

  const texto = !loc
    ? 'Sin ubicación registrada'
    : `${locationLabel(state, loc, compacta)}${sinPlaza ? ' · plaza sin confirmar' : ''}`;

  return (
    <View style={{ marginTop: 4, gap: 2 }}>
      <Text style={{ fontSize: compacta ? 12 : 13, fontWeight: '700', color: tono }}>📍 {texto}</Text>
      {fuera ? (
        <Text style={{ fontSize: 11, color: c.amberFg }}>
          Todavía no está en {state.sites.find((s) => s.id === esperadoEn)?.name ?? 'la sede'}.
        </Text>
      ) : null}
    </View>
  );
}
