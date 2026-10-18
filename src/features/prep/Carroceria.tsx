import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Field, Input, Muted, Panel, Pill, Select, campo, radius, space, useTheme } from '@/ui';
import { useStore, useTicker } from '@/data/store';
import { normalizarMatricula } from '@/data/commands';
import { formatDuration, formatShortDuration, siteName } from '@/data/format';
import type { TrabajoSuelto } from '@/data/types';

const corriendo = (t: TrabajoSuelto, now: number) =>
  t.effectiveMs + (t.runningSince ? Math.max(0, now - new Date(t.runningSince).getTime()) : 0);

/**
 * Carrocería: coches que no están en la flota.
 *
 * Vienen de taller o de un cliente y no tienen ficha, así que el preparador
 * escribe la matrícula y le da a «Empezar». No crea ningún vehículo —si lo
 * hiciera, saldría en la flota de todos—: solo cuenta su tiempo para la
 * ocupación. Si se le olvidó el cronómetro, «Ya está hecho» lo apunta con
 * su tiempo estándar.
 */
export function CarroceriaPanel({ onDone }: { onDone: (m: string) => void }) {
  const { state, user, run } = useStore();
  const { c } = useTheme();
  const now = useTicker(1000);
  const sedes = state.sites.filter((s) => s.prepares && (!user?.siteIds.length || user.siteIds.includes(s.id)));
  const [sede, setSede] = useState<string | null>(sedes.length === 1 ? sedes[0].id : null);
  const [matricula, setMatricula] = useState('');
  const abiertos = (state.trabajosSueltos ?? []).filter(
    (t) => t.preparerId === user?.id && (t.runState === 'en_curso' || t.runState === 'en_espera')
  );
  const lista = normalizarMatricula(matricula);
  const puede = !!lista && !!sede;

  const lanzar = (type: 'suelto.empezar' | 'suelto.apuntar') => {
    if (!puede || !sede) return;
    run({ type, siteId: sede, matricula: lista, tarea: 'carroceria' });
    setMatricula('');
    onDone(type === 'suelto.empezar' ? `Carrocería de ${lista} empezada.` : `Carrocería de ${lista} apuntada.`);
  };

  return (
    <Panel icon="carroceria" title="Carrocería">
      {abiertos.map((t) => (
        <View
          key={t.id}
          testID="carroceria-abierta"
          style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: campo.title, fontWeight: '900', color: c.text, flex: 1 }}>{t.matricula}</Text>
            {t.runState === 'en_espera' ? <Pill tone="amber">En pausa</Pill> : <Pill tone="blue">En curso</Pill>}
          </View>
          <Text style={{ fontSize: campo.small, color: c.textMuted }}>
            {siteName(state, t.siteId)} · objetivo {formatShortDuration(t.targetMs)}
          </Text>
          <Text style={{ fontSize: campo.display, fontWeight: '900', color: c.text, fontVariant: ['tabular-nums'] }}>
            {formatDuration(corriendo(t, now))}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {t.runState === 'en_curso' ? (
              <Btn icon="pausa" onPress={() => run({ type: 'suelto.pausar', sueltoId: t.id })}>Pausar</Btn>
            ) : (
              <Btn icon="empezar" onPress={() => run({ type: 'suelto.reanudar', sueltoId: t.id })}>Reanudar</Btn>
            )}
            <Btn
              variant="primary"
              icon="hecho"
              onPress={() => {
                run({ type: 'suelto.terminar', sueltoId: t.id });
                onDone(`Carrocería de ${t.matricula} terminada.`);
              }}
            >
              Terminar
            </Btn>
            <Btn
              variant="ghost"
              onPress={() => {
                run({ type: 'suelto.cancelar', sueltoId: t.id });
                onDone(`Carrocería de ${t.matricula} anulada.`);
              }}
            >
              Anular
            </Btn>
          </View>
        </View>
      ))}

      <Field label="Matrícula">
        <Input big autoCapitalize="characters" value={matricula} onChangeText={setMatricula} placeholder="1234 ABC" />
      </Field>
      {sedes.length > 1 ? (
        <Field label="Sede">
          <Select full value={sede} onChange={setSede} options={sedes.map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn variant="primary" icon="empezar" disabled={!puede} onPress={() => lanzar('suelto.empezar')}>
          Empezar
        </Btn>
        <Btn disabled={!puede} onPress={() => lanzar('suelto.apuntar')}>
          Ya está hecho
        </Btn>
      </View>
      <Muted>
        Para coches que no están en la flota. No los da de alta: solo cuenta tu tiempo. «Ya está hecho» lo apunta con
        el tiempo estándar.
      </Muted>
    </Panel>
  );
}
