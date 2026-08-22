import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Detail,
  Divider,
  EmptyState,
  Grid,
  H1,
  Muted,
  Notice,
  Panel,
  Pill,
  Screen,
  Spacer,
  StateFlow,
  Timeline,
  Toolbar,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useStore } from '@/data/store';
import {
  incidentsFor,
  movementsFor,
  preparationFor,
  requestsFor,
  vehicleById,
  vehicleTimeline,
} from '@/data/selectors';
import {
  formatDateTime,
  hoursSince,
  locationLabel,
  siteName,
  timeAgo,
  vehicleName,
  vehicleRef,
} from '@/data/format';
import { NOTIFY_CONDITION_LABEL, VEHICLE_FLOW, VEHICLE_STATUS_LABEL } from '@/data/types';
import { VehicleActions } from '@/features/actions/VehicleActions';
import { PrepPanel } from '@/features/prep/PrepPanel';
import { IncidentStatusPill, SituationPill, TypePill, RequestStatusPill } from '@/features/common/bits';

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useAppState();
  const { run } = useStore();
  const router = useRouter();
  const { c } = useTheme();
  const [toast, setToast] = useState<string | null>(null);

  const vehicle = vehicleById(state, id);

  if (!vehicle) {
    return (
      <Screen>
        <H1>Vehículo no encontrado</H1>
        <Muted>El vehículo {id} no existe o ha sido eliminado del parque.</Muted>
        <Spacer />
        <Btn onPress={() => router.push('/flota')}>← Volver a Flota</Btn>
      </Screen>
    );
  }

  const prep = preparationFor(state, vehicle.id);
  const incidents = incidentsFor(state, vehicle.id);
  const requests = requestsFor(state, vehicle.id);
  const movements = movementsFor(state, vehicle.id);
  const timeline = vehicleTimeline(state, vehicle.id);
  const rules = state.rules.filter(
    (r) => (r.scopeKind === 'vehicle' && r.scopeRef === vehicle.id) ||
      (r.scopeKind === 'site' && r.scopeRef === vehicle.location?.siteId) ||
      r.scopeKind === 'fleet'
  );

  const staleHours = hoursSince(vehicle.lastCheckAt);
  const isStale = staleHours > state.config.staleCheckHours;
  const flowIndex = Math.max(0, VEHICLE_FLOW.indexOf(vehicle.status));

  return (
    <Screen>
      <H1>
        Ficha 360º · {vehicleName(vehicle)} · {vehicleRef(vehicle)}
      </H1>
      <Muted>Una única ficha con toda la trazabilidad del vehículo.</Muted>

      {toast ? <Notice tone="info">{toast}</Notice> : null}

      <Toolbar>
        <Btn onPress={() => router.push('/flota')}>← Flota</Btn>
        <Btn
          onPress={() => {
            run({ type: 'vehicle.check', vehicleId: vehicle.id });
            setToast('Comprobación física registrada.');
          }}
        >
          ✅ Comprobar ahora
        </Btn>
      </Toolbar>

      <VehicleActions vehicle={vehicle} onDone={setToast} />

      <StateFlow steps={VEHICLE_FLOW.map((s) => VEHICLE_STATUS_LABEL[s])} activeIndex={flowIndex} />

      <Spacer h={space.lg} />

      <Grid cols={2} minWidth={380}>
        <Panel title="🚗 Identificación">
          <Detail label="Tipo" value={<TypePill type={vehicle.type} />} />
          <Detail label="Situación" value={<SituationPill situation={vehicle.situation} />} />
          <Detail label="Comercial" value={vehicle.salesRep ? `${vehicle.salesRep} · Asignado` : 'Sin asignar'} />
          <Detail label="Estado logístico" value={vehicle.logisticActive ? 'Activo' : 'Solo parque Quiter'} />
          <Detail label="VIN-8" value={vehicle.vin8} />
          <Detail label="Bastidor" value={vehicle.vin} />
          <Detail label="Matrícula" value={vehicle.plate ?? '—'} />
          <Detail label="Concesión" value={vehicle.dealership} />
          <Detail label="Origen" value={`${vehicle.origin} · ${formatDateTime(vehicle.receivedAt)}`} />
        </Panel>

        <Panel title="📍 Ubicación">
          <Detail label="Ubicación actual" value={locationLabel(state, vehicle.location)} />
          <Detail
            label="Destino operativo"
            value={vehicle.targetSiteId ? `${siteName(state, vehicle.targetSiteId)} · equipo de preparación` : '—'}
          />
          <Detail label="Último movimiento" value={formatDateTime(vehicle.lastMovementAt)} />
          <Detail
            label="Última comprobación física"
            value={`${formatDateTime(vehicle.lastCheckAt)} · ${vehicle.lastCheckBy ?? '—'}`}
          />
          <Spacer h={space.sm} />
          <Notice tone={isStale ? 'danger' : 'info'}>
            {isStale
              ? `⚠️ Sin comprobación física desde hace ${Math.floor(staleHours / 24)} días.`
              : `🟢 Comprobado ${timeAgo(vehicle.lastCheckAt)}.`}
          </Notice>
        </Panel>
      </Grid>

      <Spacer h={space.lg} />

      <Grid cols={2} minWidth={420}>
        {prep ? (
          <PrepPanel prep={prep} vehicle={vehicle} />
        ) : (
          <Panel title="🧽 Preparación">
            <Muted>Este vehículo no tiene ninguna preparación abierta.</Muted>
            <Spacer h={space.sm} />
            <Btn
              variant="primary"
              onPress={() => {
                run({
                  type: 'prep.create',
                  vehicleId: vehicle.id,
                  siteId: vehicle.targetSiteId ?? state.sites.find((s) => s.prepares)!.id,
                });
                setToast('Preparación creada.');
              }}
            >
              Abrir preparación
            </Btn>
          </Panel>
        )}

        <View style={{ gap: space.md }}>
          <Panel title="🔔 Notificaciones activas">
            {rules.length === 0 ? (
              <Muted>Sin reglas que afecten a este vehículo.</Muted>
            ) : (
              rules.map((rule) => (
                <Notice key={rule.id} tone={rule.condition === 'sin_comprobar_72h' ? 'warn' : 'info'}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: c.text, flex: 1 }}>
                      {NOTIFY_CONDITION_LABEL[rule.condition]} → {rule.recipient}
                    </Text>
                    <Pill tone={rule.active ? 'ok' : 'neutral'}>{rule.active ? 'Activa' : 'Pausada'}</Pill>
                  </View>
                </Notice>
              ))
            )}
          </Panel>

          <Panel title="⚠️ Incidencias y documentos">
            {incidents.length === 0 ? (
              <Notice>Recepción sin daños · sin incidencias abiertas.</Notice>
            ) : (
              incidents.map((inc) => (
                <Notice key={inc.id} tone={inc.status === 'abierta' ? 'danger' : 'warn'}>
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: c.text, flex: 1 }}>{inc.description}</Text>
                      <IncidentStatusPill status={inc.status} />
                    </View>
                    <Text style={{ fontSize: 11, color: c.textMuted }}>
                      {formatDateTime(inc.createdAt)} · {inc.photos.length} fotos
                    </Text>
                    {inc.status !== 'cerrada' ? (
                      <Btn small onPress={() => run({ type: 'incident.close', incidentId: inc.id })}>
                        Cerrar incidencia
                      </Btn>
                    ) : null}
                  </View>
                </Notice>
              ))
            )}
            <Divider />
            <Muted>Documentación: albarán de transporte adjunto en la recepción del camión.</Muted>
          </Panel>
        </View>
      </Grid>

      <Spacer h={space.lg} />

      <Grid cols={2} minWidth={420}>
        <Panel title="🕘 Trazabilidad">
          <Timeline
            events={timeline.map((e) => ({
              title: `${formatDateTime(e.at)} · ${e.title}`,
              detail: e.detail,
            }))}
          />
        </Panel>

        <View style={{ gap: space.md }}>
          <Panel title="📋 Solicitudes">
            {requests.length === 0 ? (
              <EmptyState text="Sin solicitudes registradas." />
            ) : (
              requests.map((r) => (
                <View
                  key={r.id}
                  style={{
                    paddingVertical: 9,
                    borderBottomWidth: 1,
                    borderBottomColor: c.borderSoft,
                    flexDirection: 'row',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: c.text, fontWeight: '700' }}>
                      {r.type === 'traslado' ? 'Traslado' : 'Preparación'} · {siteName(state, r.siteId)}
                    </Text>
                    <Text style={{ fontSize: 11, color: c.textMuted }}>{formatDateTime(r.createdAt)}</Text>
                  </View>
                  <RequestStatusPill status={r.status} urgent={r.urgent} />
                </View>
              ))
            )}
          </Panel>

          <Panel title="↔ Movimientos">
            {movements.length === 0 ? (
              <EmptyState text="Sin movimientos registrados." />
            ) : (
              movements.map((m) => (
                <View key={m.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
                  <Text style={{ fontSize: 12, color: c.text }}>
                    {locationLabel(state, m.from, true)} → {locationLabel(state, m.to, true)}
                  </Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>{formatDateTime(m.at)}</Text>
                </View>
              ))
            )}
          </Panel>
        </View>
      </Grid>
    </Screen>
  );
}
