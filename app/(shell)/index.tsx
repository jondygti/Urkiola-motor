import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Btn, Grid, H1, Kpi, Muted, Notice, Panel, Pill, Screen, Spacer, Timeline, TopNote, space, tipografia, useTheme } from '@/ui';
import { useAppState, useStore, useTicker } from '@/data/store';
import {
  dashboardKpis,
  attentionItems,
  diasMediosPorSede,
  limitesDias,
  recentActivity,
  requiereAtencionHoy,
  sitePerformance,
} from '@/data/selectors';
import { FASE_DIAS_LABEL, type FaseDias } from '@/data/types';
import { MiniaturaVehiculo } from '@/features/common/Miniatura';
import { homeFor, mobileHome } from '@/features/shell/nav';
import { usePerms } from '@/features/common/Guard';
import { formatDateTime, formatShortDuration, vehicleRef, vehicleTitle } from '@/data/format';

export default function DashboardScreen() {
  const state = useAppState();
  const { user, mode, state: s } = useStore();
  const router = useRouter();
  const now = useTicker(15_000);
  const { c, isDesktop } = useTheme();
  const { can } = usePerms();

  // El panel de control es de dirección: se ve solo con permiso. Quien no
  // lo tenga entra directamente a la primera pantalla que sí puede usar, no
  // a un aviso de «no tienes acceso» nada más abrir la aplicación.
  if (!can('panel.ver')) return <Redirect href={homeFor(state, user, isDesktop) as never} />;

  // En el teléfono, además, la app es más corta: si el rol no tiene el
  // panel entre sus secciones, se abre en su trabajo del día.
  const enElMovil = mobileHome(state, user);
  if (!isDesktop && enElMovil !== '/') return <Redirect href={enElMovil as never} />;

  const kpis = dashboardKpis(state);
  const perf = sitePerformance(state, now);
  const attention = attentionItems(state);
  const activity = recentActivity(state, 8);
  const hoy = requiereAtencionHoy(state, now);
  const porSede = diasMediosPorSede(state, now).filter((f) => f.campa.coches || f.preparacion.coches);
  const limites = limitesDias(state);

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

      {/* Lo primero que se mira al llegar: qué se ha quedado parado más de
          la cuenta y qué incidencias siguen abiertas. Los límites de días
          se cambian en Administración → Operativa. */}
      <Grid cols={2} minWidth={420}>
        <Panel icon="alarma" title="Requiere atención hoy">
          {hoy.incidencias.length > 0 ? (
            <Notice tone="danger" icon="incidencias" onPress={() => router.push('/incidencias')}>
              {hoy.incidencias.length === 1
                ? '1 incidencia abierta'
                : `${hoy.incidencias.length} incidencias abiertas`}
            </Notice>
          ) : null}
          {hoy.coches.length === 0 ? (
            <Notice icon="comprobado">Ningún coche lleva más días de la cuenta.</Notice>
          ) : (
            <View testID="requiere-atencion">
              <Text style={{ fontSize: tipografia.small, color: c.textMuted, marginBottom: space.sm }}>
                {(Object.keys(hoy.porFase) as FaseDias[])
                  .filter((f) => hoy.porFase[f] > 0)
                  .map((f) => `${FASE_DIAS_LABEL[f]}: ${hoy.porFase[f]} de más de ${limites[f]} días`)
                  .join(' · ')}
              </Text>
              {hoy.coches.slice(0, 6).map(({ vehicle: v, dias }) => (
                <Pressable
                  key={v.id}
                  onPress={() => router.push(`/vehiculo/${v.id}` as never)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: c.borderSoft,
                    backgroundColor: pressed ? c.surfaceAlt : 'transparent',
                  })}
                >
                  <MiniaturaVehiculo vehicle={v} lado={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: c.text }}>
                      {vehicleRef(v)} · {v.brand} {v.model}
                    </Text>
                    <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                      {FASE_DIAS_LABEL[dias.fase]} · límite {dias.limite} días
                    </Text>
                  </View>
                  <Pill tone="red">{dias.dias} días</Pill>
                </Pressable>
              ))}
              {hoy.coches.length > 6 ? (
                <>
                  <Spacer h={space.sm} />
                  <Btn small onPress={() => router.push('/flota')}>
                    {`Ver los ${hoy.coches.length} en Flota`}
                  </Btn>
                </>
              ) : null}
            </View>
          )}
        </Panel>

        <Panel icon="sede" title="Días medios por sede">
          <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ flex: 1.2, fontSize: tipografia.micro, fontWeight: '800', color: c.textFaint }}>SEDE</Text>
            <Text style={{ flex: 1, fontSize: tipografia.micro, fontWeight: '800', color: c.textFaint }}>EN CAMPA</Text>
            <Text style={{ flex: 1, fontSize: tipografia.micro, fontWeight: '800', color: c.textFaint }}>
              EN PREPARACIÓN
            </Text>
          </View>
          {porSede.map((fila) => (
            <View
              key={fila.site.id}
              testID="dias-por-sede"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 9,
                borderBottomWidth: 1,
                borderBottomColor: c.borderSoft,
              }}
            >
              <Text style={{ flex: 1.2, fontSize: tipografia.small, color: c.text, fontWeight: '600' }}>
                {fila.site.name}
              </Text>
              {(['campa', 'preparacion'] as const).map((fase) => {
                const x = fila[fase];
                const pasado = x.media !== null && x.media > limites[fase];
                return (
                  <Text
                    key={fase}
                    style={{
                      flex: 1,
                      fontSize: tipografia.small,
                      color: pasado ? c.redFg : x.media === null ? c.textFaint : c.text,
                      fontWeight: pasado ? '800' : '400',
                    }}
                  >
                    {x.media === null ? '—' : `${String(x.media).replace('.', ',')} d · ${x.coches}`}
                  </Text>
                );
              })}
            </View>
          ))}
          <Spacer h={space.sm} />
          <Muted>Media de días de los coches que están ahí ahora · número de coches.</Muted>
        </Panel>
      </Grid>

      <Spacer h={space.lg} />

      <Grid cols={2} minWidth={420}>
        <Panel icon="tiempo" title="Rendimiento de preparación">
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ flex: 1.4, fontSize: tipografia.micro, fontWeight: '800', color: c.textFaint }}>SEDE</Text>
              <Text style={{ flex: 1, fontSize: tipografia.micro, fontWeight: '800', color: c.textFaint }}>EN CURSO</Text>
              <Text style={{ flex: 1.2, fontSize: tipografia.micro, fontWeight: '800', color: c.textFaint }}>MEDIA</Text>
              <Text style={{ flex: 1.2, fontSize: tipografia.micro, fontWeight: '800', color: c.textFaint }}>OBJETIVO</Text>
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
                <Text style={{ flex: 1.4, fontSize: tipografia.small, color: c.text, fontWeight: '600' }}>{row.site.name}</Text>
                <Text style={{ flex: 1, fontSize: tipografia.small, color: c.text }}>{row.inProgress}</Text>
                <Text style={{ flex: 1.2, fontSize: tipografia.small, color: c.text }}>
                  {row.inProgress ? formatShortDuration(row.avgMs) : '—'}
                </Text>
                <Text style={{ flex: 1.2, fontSize: tipografia.small, color: c.textMuted }}>
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

        <Panel icon="aviso" title="Atención">
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
        <Text style={{ fontSize: tipografia.small, color: c.text, lineHeight: 18 }}>
          <Text style={{ fontWeight: '800' }}>Web + App: </Text>
          la web es para gestión y control; la app móvil es para ejecución en campa, transporte y
          preparación. Ambas usan el mismo backend y comparten este mismo código.
        </Text>
      </TopNote>
      <TopNote>
        <Text style={{ fontSize: tipografia.small, color: c.text, lineHeight: 18 }}>
          <Text style={{ fontWeight: '800' }}>Modelo de datos: </Text>
          Quiter aporta el parque maestro ({state.vehicles.length} vehículos). Easo Logistics controla la actividad
          logística. Un vehículo se activa automáticamente al registrar ubicación, movimiento, solicitud,
          preparación, incidencia o recuento.
        </Text>
      </TopNote>

      <Spacer h={space.lg} />

      <Panel icon="historial" title="Actividad reciente">
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
