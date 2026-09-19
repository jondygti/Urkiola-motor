import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Detail, Divider, EmptyState, Grid, H1, Muted, Notice, Panel, Pill, Screen, Spacer, StateFlow, Timeline, Toolbar, space, tipografia, useTheme } from '@/ui';
import { useAppState, useStore } from '@/data/store';
import {
  deliveryStatus,
  incidentsFor,
  movementsFor,
  preparationFor,
  puedeGestionarEntrega,
  requestsFor,
  vehicleById,
  vehicleByRef,
  vehicleTimeline,
  esGestorComercial,
  vehiculoEnAmbitoComercial,
} from '@/data/selectors';
import {
  formatDate,
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
import { CustomFields } from '@/features/common/CustomFields';
import { CancelarSolicitud } from '@/features/actions/CancelarSolicitud';
import { UbicacionLlaves } from '@/features/actions/UbicacionLlaves';
import { DateField } from '@/features/common/DateField';
import { IfCan, ScreenGuard, usePerms } from '@/features/common/Guard';
import { ComercialVehiculo } from '@/features/actions/ComercialVehiculo';
import { ClasificacionComercial } from '@/features/actions/ClasificacionComercial';
import { EntregarVehiculo } from '@/features/actions/EntregarVehiculo';
import { IncidentStatusPill, SituationPill, TypePill, RequestStatusPill } from '@/features/common/bits';

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useAppState();
  const { run, user } = useStore();
  const router = useRouter();
  const { c } = useTheme();
  const { can, canAny } = usePerms();
  const [toast, setToast] = useState<string | null>(null);

  // Por id interno o por lo que la gente tiene a mano: la matrícula o los
  // ocho últimos del bastidor. Así un enlace pegado en un mensaje
  // (/vehiculo/1234ABC) abre la ficha en vez de decir que no existe.
  const encontrado = vehicleById(state, id) ?? vehicleByRef(state, id ?? '');
  const vehicle =
    encontrado && (!esGestorComercial(user) || vehiculoEnAmbitoComercial(state, user, encontrado))
      ? encontrado
      : undefined;

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
    <ScreenGuard anyOf={['flota.ver']} title="Ficha de vehículo">
    <Screen>
      <H1>
        Ficha 360º · {vehicleName(vehicle)} · {vehicleRef(vehicle)}
      </H1>
      <Muted>Una única ficha con toda la trazabilidad del vehículo.</Muted>

      {toast ? <Notice tone="info">{toast}</Notice> : null}

      <Toolbar>
        <Btn onPress={() => router.push('/flota')}>← Flota</Btn>
        {canAny('recuentos.ejecutar', 'movimientos.registrar') ? (
          <Btn
            onPress={() => {
              run({ type: 'vehicle.check', vehicleId: vehicle.id });
              setToast('Comprobación física registrada.');
            }}
          >
            ✅ Comprobar ahora
          </Btn>
        ) : null}
      </Toolbar>

      <VehicleActions vehicle={vehicle} onDone={setToast} />

      <StateFlow steps={VEHICLE_FLOW.map((s) => VEHICLE_STATUS_LABEL[s])} activeIndex={flowIndex} />

      <Spacer h={space.lg} />

      <Grid cols={2} minWidth={380}>
        <Panel title="🚗 Identificación">
          <Detail label="Tipo" value={<TypePill type={vehicle.type} />} />
          <Detail label="Situación" value={<SituationPill situation={vehicle.situation} />} />
          <ClasificacionComercial vehicle={vehicle} onDone={setToast} />
          <ComercialVehiculo vehicle={vehicle} onDone={setToast} />
          <UbicacionLlaves vehicle={vehicle} />
          <Detail label="Estado logístico" value={vehicle.logisticActive ? 'Activo' : 'Solo parque Quiter'} />
          <Detail label="VIN-8" value={vehicle.vin8} />
          <Detail label="Bastidor" value={vehicle.vin} />
          <Detail label="Matrícula" value={vehicle.plate ?? '—'} />
          <Detail label="Origen" value={`${vehicle.origin} · ${formatDateTime(vehicle.receivedAt)}`} />
        </Panel>

        <Panel title="📍 Ubicación">
          <Detail
            label="Ubicación actual"
            value={locationLabel(state, vehicle.location)}
            hint="Dónde está el coche ahora mismo."
          />
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
              disabled={!can('preparacion.gestionar')}
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
                    <Text style={{ fontSize: tipografia.small, color: c.text, flex: 1 }}>
                      {NOTIFY_CONDITION_LABEL[rule.condition]} → {rule.recipient}
                    </Text>
                    <Pill tone={rule.active ? 'ok' : 'neutral'}>{rule.active ? 'Activa' : 'Pausada'}</Pill>
                  </View>
                </Notice>
              ))
            )}
          </Panel>

          <Panel title="📅 Entrega al cliente">
            {puedeGestionarEntrega(state, user, vehicle) ? (
              <>
                <DateField
                  value={vehicle.deliveryDate ?? null}
                  onChange={(iso) => {
                    run({ type: 'vehicle.setDelivery', vehicleId: vehicle.id, deliveryDate: iso });
                    setToast(iso ? 'Fecha de entrega guardada.' : 'Fecha de entrega retirada.');
                  }}
                />
                <Spacer h={space.sm} />
              </>
            ) : (
              <Detail
                label="Fecha comprometida"
                value={vehicle.deliveryDate ? formatDate(vehicle.deliveryDate) : 'Sin fecha'}
              />
            )}

            {vehicle.deliveryDate ? <DeliveryState vehicle={vehicle} /> : (
              <Muted>
                Sin fecha comprometida, la preparación se mide contra el plazo de{' '}
                {state.config.prepDeadlineHours} h desde que se pide.
              </Muted>
            )}

            {/* El final del recorrido: aquí, junto a la fecha comprometida,
                que es donde se mira si el coche se ha entregado o no. */}
            <Spacer h={space.sm} />
            <EntregarVehiculo vehicle={vehicle} onDone={setToast} />
          </Panel>

          <Panel title="🏷️ Campos propios">
            <CustomFields vehicle={vehicle} />
          </Panel>

          <Panel title="⚠️ Incidencias y documentos">
            {incidents.length === 0 ? (
              <Notice>Recepción sin daños · sin incidencias abiertas.</Notice>
            ) : (
              incidents.map((inc) => (
                <Notice key={inc.id} tone={inc.status === 'abierta' ? 'danger' : 'warn'}>
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ fontSize: tipografia.small, color: c.text, flex: 1 }}>{inc.description}</Text>
                      <IncidentStatusPill status={inc.status} />
                    </View>
                    <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                      {formatDateTime(inc.createdAt)} · {inc.photos.length} fotos
                    </Text>
                    {inc.status !== 'cerrada' ? (
                      <IfCan permission="incidencias.cerrar">
                        <Btn small onPress={() => run({ type: 'incident.close', incidentId: inc.id })}>
                          Cerrar incidencia
                        </Btn>
                      </IfCan>
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
                    <Text style={{ fontSize: tipografia.small, color: c.text, fontWeight: '700' }}>
                      {r.type === 'traslado' ? 'Traslado' : 'Preparación'} · {siteName(state, r.siteId)}
                    </Text>
                    <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>{formatDateTime(r.createdAt)}</Text>
                  </View>
                  <RequestStatusPill status={r.status} urgent={r.urgent} />
                  <CancelarSolicitud request={r} />
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
                  <Text style={{ fontSize: tipografia.small, color: c.text }}>
                    {locationLabel(state, m.from, true)} → {locationLabel(state, m.to, true)}
                  </Text>
                  <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>{formatDateTime(m.at)}</Text>
                </View>
              ))
            )}
          </Panel>
        </View>
      </Grid>
    </Screen>
    </ScreenGuard>
  );
}


/** Qué falta para poder entregar y si llega a tiempo. */
function DeliveryState({ vehicle }: { vehicle: import('@/data/types').Vehicle }) {
  const state = useAppState();
  const estado = deliveryStatus(state, vehicle);
  const dias = Math.ceil(estado.inMs / 86_400_000);

  return (
    <>
      <Detail
        label="Fecha comprometida"
        value={`${formatDate(vehicle.deliveryDate)} · ${
          estado.inMs < 0 ? 'ya pasó' : dias <= 1 ? 'mañana o antes' : `en ${dias} días`
        }`}
      />
      {estado.ready ? (
        <Notice tone="info">✅ Listo para entregar.</Notice>
      ) : (
        <Notice tone={estado.atRisk ? 'danger' : 'warn'}>
          {estado.atRisk ? '⚠️ En riesgo · ' : 'Pendiente · '}
          {estado.missing.join(' · ')}
        </Notice>
      )}
    </>
  );
}
