import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Grid,
  H1,
  Input,
  Kpi,
  Muted,
  Notice,
  Panel,
  Pill,
  ProgressBar,
  Screen,
  Spacer,
  StatLine,
  Toolbar,
  radius,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useStore, useTicker } from '@/data/store';
import { myWork, vehicleByRef, countSummary, roleLabel } from '@/data/selectors';
import { prepElapsedMs, prepIsOverSla, prepProgress } from '@/data/commands';
import {
  formatDateTime,
  formatShortDuration,
  locationLabel,
  matchesSearch,
  siteName,
  timeAgo,
  vehicleName,
  vehicleRef,
} from '@/data/format';

import { PrepStatePill, StatusPill, useOpenVehicle } from '@/features/common/bits';
import { VehicleActions } from '@/features/actions/VehicleActions';

export default function MyWorkScreen() {
  const state = useAppState();
  const { user } = useStore();
  const { c } = useTheme();
  const router = useRouter();
  const now = useTicker(1000);
  const openVehicle = useOpenVehicle();

  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const work = myWork(state, user?.id ?? '');
  const exact = vehicleByRef(state, query);
  const matches =
    query.trim().length >= 2
      ? state.vehicles.filter((v) => v.logisticActive && matchesSearch(v, query)).slice(0, 8)
      : [];

  const focus = exact ?? (matches.length === 1 ? matches[0] : null);

  return (
    <Screen>
      <H1>Hola, {user?.name.split(' ')[0] ?? 'equipo'}</H1>
      <Muted>
        {user ? roleLabel(state, user.role) : 'Operativa'} · tareas del día en campa, transporte y preparación.
      </Muted>

      {toast ? <Notice>{toast}</Notice> : null}

      <Spacer />

      <Grid cols={4} minWidth={160}>
        <Kpi
          label="Preparaciones"
          value={work.preparations.length}
          hint="pendientes"
          onPress={() => router.push('/preparacion')}
        />
        <Kpi
          label="Traslados"
          value={work.transfers.length}
          hint="pendientes"
          onPress={() => router.push('/solicitudes')}
        />
        <Kpi
          label="Recuentos"
          value={work.counts.length}
          hint="abiertos"
          onPress={() => router.push('/recuentos')}
        />
        <Kpi
          label="Incidencias"
          value={work.incidents}
          hint="abiertas"
          tone={work.incidents > 0 ? 'amber' : 'ok'}
          onPress={() => router.push('/incidencias')}
        />
      </Grid>

      <Spacer h={space.lg} />

      <Panel title="🚗 Buscar vehículo">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Matrícula o VIN-8"
          autoCapitalize="characters"
        />
        <Spacer h={space.sm} />
        <Notice>
          <Text style={{ fontSize: 12, color: c.text }}>
            <Text style={{ fontWeight: '800' }}>Sin QR. </Text>
            El vehículo se identifica por matrícula o por los 8 últimos caracteres del bastidor.
          </Text>
        </Notice>

        {matches.length > 1 ? (
          <View style={{ marginTop: space.sm, gap: 6 }}>
            {matches.map((v) => (
              <Notice key={v.id} onPress={() => openVehicle(v.id)}>
                {vehicleRef(v)} · {vehicleName(v)} · {locationLabel(state, v.location, true)}
              </Notice>
            ))}
          </View>
        ) : null}

        {focus ? (
          <View style={{ marginTop: space.md }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: radius.md,
                padding: 12,
                backgroundColor: c.surfaceAlt,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: c.text }}>
                  {vehicleName(focus)} · {vehicleRef(focus)}
                </Text>
                <StatusPill status={focus.status} />
              </View>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>
                {focus.type} · {focus.situation === 'pedido' ? 'Pedido' : 'Stock'} ·{' '}
                {focus.salesRep ? `Comercial ${focus.salesRep}` : 'Sin comercial'}
              </Text>
              <StatLine
                items={[
                  `📍 ${locationLabel(state, focus.location, true)}`,
                  `🕘 ${formatDateTime(focus.lastCheckAt)} · ${timeAgo(focus.lastCheckAt)}`,
                ]}
              />
              <VehicleActions vehicle={focus} compact onDone={setToast} />
              <Btn full onPress={() => openVehicle(focus.id)}>
                Abrir ficha completa
              </Btn>
            </View>
          </View>
        ) : null}
      </Panel>

      <Spacer h={space.lg} />

      <Grid cols={2} minWidth={400}>
        <Panel title={`🧽 Preparaciones pendientes (${work.preparations.length})`}>
          {work.preparations.length === 0 ? (
            <Muted>No tienes preparaciones asignadas ahora mismo.</Muted>
          ) : (
            work.preparations.slice(0, 6).map((p) => {
              const v = state.vehicles.find((x) => x.id === p.vehicleId);
              const { done, total, pct } = prepProgress(p);
              return (
                <View
                  key={p.id}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: radius.md,
                    padding: 12,
                    marginBottom: space.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: c.text, flex: 1 }}>
                      {v ? `${vehicleName(v)} · ${vehicleRef(v)}` : p.vehicleId}
                    </Text>
                    <PrepStatePill runState={p.runState} overSla={prepIsOverSla(p, now)} />
                  </View>
                  <Text style={{ fontSize: 11, color: c.textMuted, marginVertical: 5 }}>
                    {siteName(state, p.siteId)} · {done}/{total} requisitos ·{' '}
                    {formatShortDuration(prepElapsedMs(p, now))} de {formatShortDuration(p.targetMs)}
                  </Text>
                  <ProgressBar pct={pct} tone={prepIsOverSla(p, now) ? 'red' : 'ok'} />
                  <Spacer h={space.sm} />
                  <Btn
                    variant="primary"
                    full
                    onPress={() => v && openVehicle(v.id)}
                  >
                    Continuar preparación
                  </Btn>
                </View>
              );
            })
          )}
        </Panel>

        <View style={{ gap: space.md }}>
          <Panel title={`🚚 Traslados pendientes (${work.transfers.length})`}>
            {work.transfers.length === 0 ? (
              <Muted>Sin traslados asignados.</Muted>
            ) : (
              work.transfers.slice(0, 6).map((r) => {
                const v = state.vehicles.find((x) => x.id === r.vehicleId);
                return (
                  <Notice key={r.id} onPress={() => v && openVehicle(v.id)}>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                        {v ? `${vehicleName(v)} · ${vehicleRef(v)}` : r.vehicleId}
                      </Text>
                      <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>
                        {locationLabel(state, r.from, true)} → {locationLabel(state, r.to, true)}
                      </Text>
                    </View>
                  </Notice>
                );
              })
            )}
          </Panel>

          <Panel title={`📋 Recuentos abiertos (${work.counts.length})`}>
            {work.counts.length === 0 ? (
              <Muted>No hay recuentos en marcha.</Muted>
            ) : (
              work.counts.map((count) => {
                const s = countSummary(state, count);
                return (
                  <View key={count.id} style={{ marginBottom: space.sm }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: c.text, flex: 1 }}>
                        {count.code} · {locationLabel(state, { siteId: count.siteId, zoneId: count.zoneId ?? undefined }, true)}
                      </Text>
                      <Pill tone={s.missing > 0 ? 'amber' : 'ok'}>
                        {s.found}/{s.expected}
                      </Pill>
                    </View>
                    <Spacer h={space.xs} />
                    <ProgressBar pct={s.expected ? (s.found / s.expected) * 100 : 0} />
                    <Spacer h={space.sm} />
                    <Btn variant="primary" full onPress={() => router.push('/recuentos')}>
                      Continuar recuento
                    </Btn>
                  </View>
                );
              })
            )}
          </Panel>
        </View>
      </Grid>

      <Spacer h={space.lg} />

      <Panel title="Acciones disponibles desde el móvil">
        <StatLine
          items={[
            '🚗 Buscar matrícula / VIN-8',
            '📍 Registrar ubicación',
            '↔️ Mover vehículo',
            '🧽 Preparar',
            '☑️ Checklist',
            '📷 Fotos',
            '⚠️ Incidencia',
            '📋 Recuento',
            '🚚 Traslado',
          ]}
        />
        <Notice>
          <Text style={{ fontSize: 12, color: c.text }}>
            <Text style={{ fontWeight: '800' }}>Registro automático: </Text>
            cada ubicación o movimiento guarda vehículo, origen, destino, usuario, fecha y hora. La última
            ubicación comprobada queda visible en la ficha.
          </Text>
        </Notice>
      </Panel>

      <Spacer h={space.lg} />

      <Panel title="Accesos rápidos">
        <Toolbar>
          <Btn onPress={() => router.push('/recuentos')}>📋 Recuento</Btn>
          <Btn onPress={() => router.push('/recepcion')}>🚚 Recepción</Btn>
          <Btn onPress={() => router.push('/campa')}>📍 Campa</Btn>
          <Btn onPress={() => router.push('/incidencias')}>⚠️ Incidencias</Btn>
          <Btn onPress={() => router.push('/notificaciones')}>🔔 Avisos</Btn>
        </Toolbar>
      </Panel>
    </Screen>
  );
}
