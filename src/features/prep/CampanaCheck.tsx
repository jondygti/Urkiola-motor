import React from 'react';
import { Text, View } from 'react-native';
import { Btn, campo, radius, space, useTheme } from '@/ui';
import type { CheckState } from '@/data/types';

/** Tener campaña y haberla realizado son decisiones distintas del preparador. */
export function CampanaCheck({ estado, disabled, onChange }: {
  estado: CheckState;
  disabled: boolean;
  onChange: (estado: CheckState) => void;
}) {
  const { c } = useTheme();
  const tiene = estado !== 'no_requerido';
  return (
    <View style={{ padding: space.md, gap: space.sm, borderWidth: 1,
      borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface, marginBottom: 6 }}>
      <Text style={{ fontSize: campo.strong, fontWeight: '700', color: c.text }}>Campaña de marca</Text>
      <Text style={{ fontSize: campo.body, color: c.text }}>¿Este vehículo tiene campaña?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Btn disabled={disabled} variant={tiene ? 'primary' : 'default'}
          onPress={() => onChange(estado === 'completado' ? 'completado' : 'pendiente')}>
          Sí, tiene campaña
        </Btn>
        <Btn disabled={disabled} variant={!tiene ? 'primary' : 'default'}
          onPress={() => onChange('no_requerido')}>No tiene campaña</Btn>
      </View>
      <Text style={{ fontSize: campo.micro, color: c.textMuted }}>
        {!tiene ? 'Sin campaña: no cuenta como trabajo pendiente.'
          : estado === 'completado' ? 'Campaña realizada.' : 'Campaña pendiente de realizar.'}
      </Text>
      {tiene ? <Btn disabled={disabled}
        onPress={() => onChange(estado === 'completado' ? 'pendiente' : 'completado')}>
        {estado === 'completado' ? 'Volver a dejar pendiente' : 'Marcar campaña realizada'}
      </Btn> : null}
    </View>
  );
}
