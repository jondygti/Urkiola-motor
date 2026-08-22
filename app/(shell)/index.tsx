import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Grid,
  H1,
  Kpi,
  Muted,
  Notice,
  Panel,
  Pill,
  Screen,
  Spacer,
  Timeline,
  TopNote,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useStore, useTicker } from '@/data/store';
import { dashboardKpis, attentionItems, recentActivity, sitePerformance } from '@/data/selectors';
import { formatDateTime, formatShortDuration, vehicleTitle } from '@/data/format';

export default function DashboardScreen() {
  const state = useAppState();
  const { user, mode, state: s } = useStore();
  const router = useRouter();
  const now = useTicker(15_000);
  const { c } = useTheme();

  const kpis = dashboardKpis(state);
  const perf = sitePerformance(state, now);
  const attention = attentionItems(state);
  const activity = recentActivity(state, 8);

  return (
    <Screen>
      <H1>Centro de control</H1>
      <Muted>
        Vista global de flota, logística y preparación. Sondika almacena; Leioa, Galdakao, Anoeta e Irun
        preparan.
      </Muted>

      <Spacer />

      <Grid cols={6} minWidth={150}>
        <Kpi label="Flota total" value={kpis.fleetTotal} hint="vehículos activos" onPress={() => router.push('/flota')} />
        <Kpi label="Sondika" value={kpis.sondika} hint="en campa" onPress={() => router.push('/campa')} />
        <Kpi
          label="Preparación"
          value={kpis.prepPending}
          hint="pendientes"
          onPress={() => router.push('/preparacion')}
        />
        <Kpi
          label="Traslados"
          value={kpis.transfersPending}
          hint="pendientes"
          onPress={() => router.push('/solicitudes')}
        />
        <Kpi
          label="Incidencias"
          value={kpis.incidentsOpen}
          hint="abiertas"
          onPress={() => router.push('/incidencias')}
        />
        <Kpi
          label={`Sin comprobar >${state.config.staleCheckHours}h`}
          value={kpis.stale}
          hint="vehículos"
          tone={kpis.stale > 0 ? 'red' : undefined}
          onPress={() => router.push('/recuentos')}
        />
      </Grid>

      <Spacer h={space.lg} />

      <Grid cols={2} minWidth={420}>
        <Panel title="⏱️ Rendimiento de preparación">
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ flex: 1.4, fontSize: 11, fontWeight: '800', color: c.textFaint }}>SEDE</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: c.textFaint }}>EN CURSO</Text>
              <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '800', color: c.textFaint }}>MEDIA</Text>
              <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '800', color: c.textFaint }}>OBJETIVO</Text>
              <View style={{ flex: 1.3 }} />
            </View>
            {perf.map((row) => (
              <View
                key={row.site.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 9,
                  borderBottomWidth: 1,
                  borderBottomColor: c.borderSoft,
                }}
              >
                <Text style={{ flex: 1.4, fontSize: 12, color: c.text, fontWeight: '600' }}>{row.site.name}</Text>
                <Text style={{ flex: 1, fontSize: 12, color: c.text }}>{row.inProgress}</Text>
                <Text style={{ flex: 1.2, fontSize: 12, color: c.text }}>
                  {row.inProgress ? formatShortDuration(row.avgMs) : '—'}
                </Text>
                <Text style={{ flex: 1.2, fontSize: 12, color: c.textMuted }}>
                  {formatShortDuration(row.targetMs)}
                </Text>
                <View style={{ flex: 1.3, alignItems: 'flex-start' }}>
                  {row.outOfSla > 0 ? (
                    <Pill tone="red">{row.outOfSla} fuera</Pill>
                  ) : row.atRisk > 0 ? (
                    <Pill tone="amber">{row.atRisk} riesgo</Pill>
                  ) : (
                    <Pill>OK</Pill>
                  )}
                </View>
              </View>
            ))}
          </View>
          <Spacer h={space.sm} />
          <Btn small onPress={() => router.push('/preparacion')}>
            Ver preparación
          </Btn>
        </Panel>

        <Panel title="⚠️ Atención">
          {attention.length === 0 ? (
            <Notice>Todo en orden: sin vehículos pendientes de revisión.</Notice>
          ) : (
            attention.map((item, i) => (
              <Notice key={i} tone={item.tone} onPress={item.href ? () => router.push(item.href as never) : undefined}>
                {item.text}
              </Notice>
            ))
          )}
        </Panel>
      </Grid>

      <Spacer h={space.lg} />

      <TopNote>
        <Text style={{ fontSize: 12, color: c.text, lineHeight: 18 }}>
          <Text style={{ fontWeight: '800' }}>Web + App: </Text>
          la web es para gestión y control; la app móvil es para ejecución en campa, transporte y
          preparación. Ambas usan el mismo backend y comparten este mismo código.
        </Text>
      </TopNote>
      <TopNote>
        <Text style={{ fontSize: 12, color: c.text, lineHeight: 18 }}>
          <Text style={{ fontWeight: '800' }}>Modelo de datos: </Text>
          Quiter aporta el parque maestro ({state.vehicles.length} vehículos). Urkiola controla la actividad
          logística. Un vehículo se activa automáticamente al registrar ubicación, movimiento, solicitud,
          preparación, incidencia o recuento.
        </Text>
      </TopNote>

      <Spacer h={space.lg} />

      <Panel title="🕘 Actividad reciente">
        <Timeline
          events={activity.map((e) => {
            const v = state.vehicles.find((x) => x.id === e.vehicleId);
            return {
              title: `${formatDateTime(e.at)} · ${e.title}`,
              detail: [v ? vehicleTitle(v) : null, e.detail].filter(Boolean).join(' · '),
              onPress: v ? () => router.push(`/vehiculo/${v.id}` as never) : undefined,
            };
          })}
        />
      </Panel>

      <Spacer h={space.lg} />
      <Muted>
        Sesión iniciada como {user?.name} · Modo {mode === 'demo' ? 'demostración (datos locales)' : 'conectado al servidor'} ·{' '}
        {s.vehicles.length} vehículos en base de datos
      </Muted>
    </Screen>
  );
}
