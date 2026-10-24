import React from 'react';
import { Text, View } from 'react-native';
import { Field, Grid, Input, Muted, Panel, radius, space, tipografia, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { TAREA_LABEL, type TareaPreparacion } from '@/data/types';
import { minutosEstandar, tablaDeTiempos } from '@/data/tiempos';

const TAREAS = Object.keys(TAREA_LABEL) as TareaPreparacion[];

/**
 * Tiempo estándar de cada tarea, general y por sede.
 *
 * Es el objetivo del cronómetro y lo que se le cuenta al preparador cuando
 * termina sin haberlo usado. Lo que se cambie vale para las preparaciones
 * que se abran desde ahora: las abiertas y las terminadas guardan el suyo,
 * para que cambiar la tabla no reescriba meses ya cerrados.
 */
export function TiemposAdmin() {
  const { state, run } = useStore();
  const { c } = useTheme();
  const tabla = tablaDeTiempos(state.config);
  const sedes = state.sites.filter((s) => s.prepares);
  const propio = (tarea: TareaPreparacion, siteId: string) =>
    tabla.find((t) => t.tarea === tarea && t.siteId === siteId)?.minutos;

  const leer = (v: string) => {
    const n = Number(v.replace(/\D/g, ''));
    return Number.isInteger(n) && n > 0 && n <= 1440 ? n : null;
  };

  return (
    <Panel icon="tiempo" title="Tiempos estándar">
      <Muted>
        En minutos. Es el objetivo del cronómetro y lo que cuenta para la ocupación cuando el preparador termina sin
        haber usado el cronómetro. Una sede vacía usa el tiempo de «Todas las sedes». Vale para lo que se abra desde
        ahora: lo ya abierto o terminado conserva el suyo.
      </Muted>
      <View style={{ height: space.md }} />
      {TAREAS.map((tarea) => {
        const general = minutosEstandar(tabla, tarea, null);
        return (
          <View
            key={tarea}
            testID={`tiempo-${tarea}`}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: radius.md,
              padding: 12,
              marginBottom: space.sm,
            }}
          >
            <Text style={{ fontSize: tipografia.strong, fontWeight: '800', color: c.text, marginBottom: space.sm }}>
              {TAREA_LABEL[tarea]}
            </Text>
            <Grid cols={7} minWidth={120}>
              <Field label="Todas las sedes">
                <Input
                  small
                  keyboardType="numeric"
                  value={String(general)}
                  onChangeText={(v) => {
                    const minutos = leer(v);
                    // El general no se queda vacío: sin él, una sede sin
                    // tiempo propio no tendría contra qué medir.
                    if (minutos !== null) run({ type: 'tiempo.set', tarea, siteId: null, minutos });
                  }}
                />
              </Field>
              {sedes.map((sede) => (
                <Field key={sede.id} label={sede.name}>
                  <Input
                    small
                    keyboardType="numeric"
                    placeholder={String(general)}
                    value={propio(tarea, sede.id) !== undefined ? String(propio(tarea, sede.id)) : ''}
                    onChangeText={(v) => run({ type: 'tiempo.set', tarea, siteId: sede.id, minutos: leer(v) })}
                  />
                </Field>
              ))}
            </Grid>
          </View>
        );
      })}
    </Panel>
  );
}
