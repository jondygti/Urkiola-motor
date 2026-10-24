import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Muted, Notice, Panel, Pill, Segmented, radius, space, tipografia, useTheme, type Tone } from '@/ui';
import { diaEnEspana } from '@/data/delivery-date';
import {
  OCUPACION_ALTA,
  OCUPACION_BAJA,
  mesAnterior,
  nombreDelMes,
  ocupacionDelMes,
  sedesConOcupacionAlta,
  type EstadoOcupacion,
} from '@/data/ocupacion';
import type { AppState } from '@/data/types';

const TONO: Record<EstadoOcupacion, Tone> = { verde: 'ok', ambar: 'amber', gris: 'neutral', sin_datos: 'neutral' };

const horas = (ms: number) => `${String(Math.round(ms / 360_000) / 10).replace('.', ',')} h`;

/**
 * Ocupación de los preparadores por sede, para el panel de dirección.
 *
 * Verde del 70 al 80 %, ámbar por encima del 80 % (falta gente o sobra
 * trabajo) y gris por debajo del 70 %. Se mira el mes pasado, que ya está
 * cerrado, o lo que va del mes en curso. Tocando una sede salen sus
 * preparadores.
 */
export function OcupacionPanel({ state, now }: { state: AppState; now: number }) {
  const { c } = useTheme();
  const hoy = diaEnEspana(new Date(now).toISOString());
  const actual = hoy.slice(0, 7);
  const [cual, setCual] = useState<'pasado' | 'actual'>('pasado');
  const [abierta, setAbierta] = useState<string | null>(null);
  const mes = cual === 'pasado' ? mesAnterior(actual) : actual;
  const filas = ocupacionDelMes(state, mes, cual === 'actual' ? hoy : undefined);
  const altas = sedesConOcupacionAlta(state, actual);

  return (
    <Panel icon="ocupacion" title="Ocupación de preparadores">
      <Segmented
        value={cual}
        onChange={setCual}
        options={[
          { value: 'pasado', label: nombreDelMes(mesAnterior(actual)) },
          { value: 'actual', label: `${nombreDelMes(actual)} (hasta hoy)` },
        ]}
      />
      <View style={{ height: space.sm }} />
      {altas.map(({ site, pcts }) => (
        <Notice key={site.id} tone="warn" icon="aviso">
          {`${site.name} lleva dos meses por encima del ${OCUPACION_ALTA} %: ${pcts[0]} % y ${pcts[1]} %.`}
        </Notice>
      ))}
      {filas.map((o) => (
        <View key={o.site.id} testID="ocupacion-sede">
          <Pressable
            onPress={() => setAbierta(abierta === o.site.id ? null : o.site.id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 9,
              borderBottomWidth: 1,
              borderBottomColor: c.borderSoft,
              backgroundColor: pressed ? c.surfaceAlt : 'transparent',
            })}
          >
            <Text style={{ flex: 1.3, fontSize: tipografia.small, color: c.text, fontWeight: '600' }}>{o.site.name}</Text>
            <View style={{ flex: 2 }}>
              <Barra pct={o.pct} tono={TONO[o.estado]} />
            </View>
            <View style={{ minWidth: 64, alignItems: 'flex-end' }}>
              <Pill tone={TONO[o.estado]}>{o.pct === null ? '—' : `${o.pct} %`}</Pill>
            </View>
          </Pressable>
          {abierta === o.site.id ? (
            <View style={{ paddingVertical: space.sm, paddingLeft: space.md, gap: 4 }}>
              <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                {o.pct === null
                  ? 'Sin preparadores con presencia en esta sede.'
                  : `${horas(o.trabajadoMs)} de preparación de ${horas(o.presenciaMs)} de presencia · ${o.trabajos} trabajos`}
                {o.conEstandar ? ` · ${o.conEstandar} sin cronómetro (cuentan el tiempo estándar)` : ''}
              </Text>
              {o.revisar ? (
                <Text style={{ fontSize: tipografia.micro, color: c.amberFg }}>
                  {o.revisar === 1 ? '1 trabajo marca' : `${o.revisar} trabajos marcan`} más de tres veces su tiempo
                  estándar: revisar si alguien se olvidó de pulsar «Terminar».
                </Text>
              ) : null}
              {o.preparadores.map((p) => (
                <View key={p.userId} testID="ocupacion-preparador" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: tipografia.small, color: c.text }}>
                    {p.nombre}
                    {p.sinFicha ? ' (sin ficha)' : ''}
                  </Text>
                  <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                    {horas(p.trabajadoMs)} / {horas(p.presenciaMs)}
                  </Text>
                  <Text style={{ minWidth: 44, textAlign: 'right', fontSize: tipografia.small, fontWeight: '800', color: c.text }}>
                    {p.pct === null ? '—' : `${p.pct} %`}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      <View style={{ height: space.sm }} />
      <Muted>
        {`Horas de preparación ÷ horas de presencia. Verde del ${OCUPACION_BAJA} al ${OCUPACION_ALTA} %, ámbar por encima y gris por debajo. Jornada, sedes, ausencias y festivos en Administración → Calendario.`}
      </Muted>
    </Panel>
  );
}

function Barra({ pct, tono }: { pct: number | null; tono: Tone }) {
  const { c } = useTheme();
  const color = tono === 'ok' ? c.okFg : tono === 'amber' ? c.amberFg : c.textFaint;
  return (
    <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.surfaceSunken, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, pct ?? 0)}%`, height: 8, borderRadius: radius.pill, backgroundColor: color }} />
    </View>
  );
}
