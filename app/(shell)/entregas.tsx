import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Grid, H1, Kpi, Muted, Notice, Panel, Pill, Screen, Segmented, Select, Spacer, radius, space, tipografia, useTheme } from '@/ui';
import { useAppState, useStore, useTicker } from '@/data/store';
import { deliveryStatus, sedeDeEntrega, upcomingDeliveries, vehiculosVisiblesPara } from '@/data/selectors';
import { formatDate, siteName, vehicleName, vehicleRef } from '@/data/format';
import type { Vehicle } from '@/data/types';
import { ScreenGuard } from '@/features/common/Guard';
import { useOpenVehicle } from '@/features/common/bits';

const DIA = 86_400_000;
const TODAS = 'todas';

/**
 * Entregas comprometidas, agrupadas por día.
 *
 * Es la vista que responde a la pregunta de cada mañana: qué hay que
 * entregar y qué peligra. Todo lo demás del sistema mide el proceso; esta
 * mide el compromiso con el cliente.
 */
export default function DeliveriesScreen() {
  const state = useAppState();
  const { user } = useStore();
  const now = useTicker(30_000);
  const { c } = useTheme();
  const openVehicle = useOpenVehicle();
  const [rango, setRango] = useState<'7' | '14' | '30'>('7');
  const [sede, setSede] = useState<string>(TODAS);

  const visibles = useMemo(() => new Set(vehiculosVisiblesPara(state, user).map((v) => v.id)), [state, user]);
  const entregasVisibles = useMemo(
    () => upcomingDeliveries(state, Number(rango)).filter((v) => visibles.has(v.id)),
    [state, rango, visibles]
  );

  const vehiculos = useMemo(() => {
    return sede === TODAS ? entregasVisibles : entregasVisibles.filter((v) => sedeDeEntrega(v) === sede);
  }, [entregasVisibles, sede]);

  // Cuántas entregas tiene cada sede en este plazo, para verlo sin cambiar
  // el filtro una por una.
  const porSede = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const v of entregasVisibles) {
      const id = sedeDeEntrega(v);
      if (id) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    }
    return cuenta;
  }, [entregasVisibles]);

  const estados = useMemo(
    () => vehiculos.map((v) => deliveryStatus(state, v, now)),
    [vehiculos, state, now]
  );

  const vencidas = estados.filter((e) => e.inMs < 0 && !e.ready).length;
  const enRiesgo = estados.filter((e) => e.atRisk && e.inMs >= 0).length;
  const listas = estados.filter((e) => e.ready).length;

  // Agrupadas por día de entrega.
  const porDia = useMemo(() => {
    const mapa = new Map<string, Vehicle[]>();
    for (const v of vehiculos) {
      const clave = new Date(v.deliveryDate!).toDateString();
      mapa.set(clave, [...(mapa.get(clave) ?? []), v]);
    }
    return [...mapa.entries()];
  }, [vehiculos]);

  const etiquetaDia = (clave: string) => {
    const d = new Date(clave);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const dias = Math.round((d.getTime() - hoy.getTime()) / DIA);
    if (dias < 0) return `${formatDate(d.toISOString())} · atrasada`;
    if (dias === 0) return `Hoy · ${formatDate(d.toISOString())}`;
    if (dias === 1) return `Mañana · ${formatDate(d.toISOString())}`;
    return `${d.toLocaleDateString('es-ES', { weekday: 'long' })} · ${formatDate(d.toISOString())}`;
  };

  return (
    <ScreenGuard href="/entregas" title="Entregas">
      <Screen>
        <H1>Entregas</H1>
        <Muted>
          Vehículos con fecha comprometida con el cliente, y qué le falta a cada uno para poder
          entregarse.
        </Muted>

        <Spacer />

        <Segmented
          value={rango}
          onChange={setRango}
          options={[
            { value: '7', label: 'Esta semana' },
            { value: '14', label: '15 días' },
            { value: '30', label: '30 días' },
          ]}
        />

        <Spacer h={space.sm} />

        <View style={{ maxWidth: 320 }}>
          <Select
            full
            value={sede}
            onChange={setSede}
            title="Sede que entrega"
            options={[
              { value: TODAS, label: `Todas las sedes · ${entregasVisibles.length}` },
              ...state.sites.map((s) => ({
                value: s.id,
                label: `${s.name} · ${porSede.get(s.id) ?? 0}`,
              })),
            ]}
          />
        </View>

        <Spacer h={space.lg} />

        <Grid cols={4} minWidth={160}>
          <Kpi
            label="Comprometidas"
            value={vehiculos.length}
            hint={sede === TODAS ? `próximos ${rango} días` : `${siteName(state, sede)} · ${rango} días`}
          />
          <Kpi label="Listas" value={listas} tone="ok" hint="nada pendiente" />
          <Kpi label="En riesgo" value={enRiesgo} tone={enRiesgo > 0 ? 'amber' : undefined} hint="<48 h y falta algo" />
          <Kpi label="Atrasadas" value={vencidas} tone={vencidas > 0 ? 'red' : undefined} hint="fecha pasada" />
        </Grid>

        <Spacer h={space.lg} />

        {vehiculos.length === 0 ? (
          <Panel>
            <Muted>
              {sede === TODAS
                ? 'No hay entregas comprometidas en este plazo. Las fechas se ponen desde la ficha del vehículo o al solicitar la preparación.'
                : `No hay entregas comprometidas en ${siteName(state, sede)} en este plazo.`}
            </Muted>
          </Panel>
        ) : (
          porDia.map(([clave, lista]) => (
            <View key={clave} style={{ marginBottom: space.lg }}>
              <Text style={{ fontSize: tipografia.body, fontWeight: '900', color: c.textFaint, marginBottom: space.sm }}>
                {etiquetaDia(clave).toUpperCase()} · {lista.length}
              </Text>

              {lista.map((v) => {
                const e = deliveryStatus(state, v, now);
                const borde = e.ready ? c.okFg : e.atRisk || e.inMs < 0 ? c.redFg : c.border;
                return (
                  <View
                    key={v.id}
                    style={{
                      borderWidth: 1,
                      borderLeftWidth: 4,
                      borderColor: c.border,
                      borderLeftColor: borde,
                      backgroundColor: c.surface,
                      borderRadius: radius.md,
                      padding: 12,
                      marginBottom: space.sm,
                    }}
                  >
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: tipografia.strong, fontWeight: '800', color: c.text, flex: 1, minWidth: 130 }}>
                        {vehicleRef(v)}
                      </Text>
                      {e.ready ? (
                        <Pill tone="ok">Lista</Pill>
                      ) : e.inMs < 0 ? (
                        <Pill tone="red">Atrasada</Pill>
                      ) : e.atRisk ? (
                        <Pill tone="red">En riesgo</Pill>
                      ) : (
                        <Pill tone="amber">Pendiente</Pill>
                      )}
                    </View>

                    <Text style={{ fontSize: tipografia.small, color: c.textMuted, marginTop: 2 }}>
                      {vehicleName(v)} · {v.salesRep ?? 'sin comercial'} ·{' '}
                      {siteName(state, v.targetSiteId ?? v.location?.siteId)}
                    </Text>

                    {!e.ready ? (
                      <Notice tone={e.atRisk || e.inMs < 0 ? 'danger' : 'warn'}>
                        Falta: {e.missing.join(' · ')}
                      </Notice>
                    ) : null}

                    <Spacer h={space.sm} />
                    <Btn small onPress={() => openVehicle(v.id)}>
                      Abrir ficha
                    </Btn>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </Screen>
    </ScreenGuard>
  );
}
