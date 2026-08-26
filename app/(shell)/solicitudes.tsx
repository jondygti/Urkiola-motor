import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Column, DataTable, Field, Grid, H1, Modal, Muted, Notice, Panel, Screen, Select, Spacer, Toolbar, space, tipografia, useTheme } from '@/ui';
import { useAppState, useStore } from '@/data/store';
import { activeCarriers, carrierName, deadlineOf, requestsBySite } from '@/data/selectors';
import { formatDateTime, locationLabel, siteName, userName, vehicleName, vehicleRef } from '@/data/format';
import { REQUEST_STATUS_LABEL, type RequestStatus, type ServiceRequest } from '@/data/types';
import { Cell, RequestStatusPill, useOpenVehicle } from '@/features/common/bits';
import { DeadlineChip } from '@/features/common/DeadlineChip';
import { ScreenGuard, usePerms } from '@/features/common/Guard';

const ALL = '__all__';

export default function RequestsScreen() {
  const state = useAppState();
  const { c } = useTheme();
  const openVehicle = useOpenVehicle();
  const { can } = usePerms();
  const puedeGestionar = can('solicitudes.gestionar');

  const [site, setSite] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [editing, setEditing] = useState<ServiceRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const bySite = requestsBySite(state);

  const rows = useMemo(
    () =>
      state.requests
        .filter((r) => (site === ALL ? true : r.siteId === site))
        .filter((r) => (type === ALL ? true : r.type === type))
        .filter((r) => (status === ALL ? r.status !== 'terminada' : r.status === status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [state.requests, site, type, status]
  );

  const columns: Column<ServiceRequest>[] = [
    {
      key: 'type',
      header: 'Tipo',
      width: 120,
      value: (r) => (r.type === 'traslado' ? 'Traslado' : 'Preparación'),
      filter: {
        type: 'select',
        options: [
          { value: 'Traslado', label: 'Traslado' },
          { value: 'Preparación', label: 'Preparación' },
        ],
      },
      render: (r) => <Cell>{r.type === 'traslado' ? '🚚 Traslado' : '🧽 Preparación'}</Cell>,
    },
    {
      key: 'vehicle',
      header: 'Vehículo',
      width: 170,
      primary: true,
      value: (r) => {
        const v = state.vehicles.find((x) => x.id === r.vehicleId);
        return v ? `${vehicleRef(v)} ${vehicleName(v)}` : r.vehicleId;
      },
      filter: { type: 'text' },
      render: (r) => {
        const v = state.vehicles.find((x) => x.id === r.vehicleId);
        return (
          <View>
            <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: c.text }}>{v ? vehicleRef(v) : '—'}</Text>
            <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>{v ? vehicleName(v) : ''}</Text>
          </View>
        );
      },
    },
    {
      key: 'site',
      header: 'Sede',
      width: 110,
      value: (r) => siteName(state, r.siteId),
      filter: {
        type: 'select',
        options: state.sites.map((s) => ({ value: s.name, label: s.name })),
      },
      render: (r) => <Cell>{siteName(state, r.siteId)}</Cell>,
    },
    {
      key: 'from',
      header: 'Origen',
      width: 170,
      value: (r) => locationLabel(state, r.from, true),
      render: (r) => <Cell muted>{locationLabel(state, r.from, true)}</Cell>,
    },
    {
      key: 'to',
      header: 'Destino',
      width: 170,
      value: (r) => locationLabel(state, r.to, true),
      render: (r) => <Cell muted>{locationLabel(state, r.to, true)}</Cell>,
    },
    {
      key: 'carrier',
      header: 'Transportista',
      width: 150,
      value: (r) => (r.type === 'traslado' ? carrierName(state, r.carrierId) : '—'),
      filter: {
        type: 'select',
        options: state.carriers.map((x) => ({ value: x.name, label: x.name })),
      },
      render: (r) =>
        r.type === 'traslado' ? (
          <Cell muted={!r.carrierId}>{carrierName(state, r.carrierId)}</Cell>
        ) : (
          <Cell muted>—</Cell>
        ),
    },
    {
      key: 'due',
      header: 'Plazo',
      width: 160,
      value: (r) => (r.dueAt ? new Date(r.dueAt).toISOString() : ''),
      render: (r) => (
        <DeadlineChip
          deadline={deadlineOf(state, r)}
          emptyLabel={r.type === 'traslado' ? '🔑 Llaves sin recoger' : undefined}
        />
      ),
    },
    {
      key: 'assigned',
      header: 'Asignada a',
      width: 140,
      value: (r) => (r.assignedTo ? userName(state, r.assignedTo) : 'Sin asignar'),
      render: (r) => <Cell muted={!r.assignedTo}>{r.assignedTo ? userName(state, r.assignedTo) : 'Sin asignar'}</Cell>,
    },
    {
      key: 'created',
      header: 'Creada',
      width: 130,
      secondary: true,
      value: (r) => formatDateTime(r.createdAt),
      render: (r) => <Cell muted>{formatDateTime(r.createdAt)}</Cell>,
    },
    {
      key: 'status',
      header: 'Estado',
      width: 130,
      value: (r) => REQUEST_STATUS_LABEL[r.status],
      filter: {
        type: 'select',
        options: Object.entries(REQUEST_STATUS_LABEL).map(([, label]) => ({ value: label, label })),
      },
      render: (r) => <RequestStatusPill status={r.status} urgent={r.urgent} />,
    },
    {
      key: 'actions',
      header: '',
      width: 110,
      render: (r) =>
        puedeGestionar ? (
          <Btn small onPress={() => setEditing(r)}>
            Gestionar
          </Btn>
        ) : null,
    },
  ];

  return (
    <ScreenGuard href="/solicitudes" title="Solicitudes">
    <Screen>
      <H1>Solicitudes</H1>
      <Muted>Traslados y preparaciones, filtrados por sede y estado del flujo de trabajo.</Muted>

      {toast ? <Notice>{toast}</Notice> : null}

      <Toolbar>
        <Select
          value={site}
          onChange={setSite}
          title="Sede"
          options={[{ value: ALL, label: 'Todas las sedes' }, ...state.sites.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <Select
          value={type}
          onChange={setType}
          title="Tipo"
          options={[
            { value: ALL, label: 'Todos los tipos' },
            { value: 'traslado', label: 'Traslado' },
            { value: 'preparacion', label: 'Preparación' },
          ]}
        />
        <Select
          value={status}
          onChange={setStatus}
          title="Estado"
          options={[
            { value: ALL, label: 'Abiertas' },
            ...Object.entries(REQUEST_STATUS_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
      </Toolbar>

      <Grid cols={4} minWidth={180}>
        {bySite.map((row) => (
          <View
            key={row.site.id}
            style={{
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 11,
              padding: 13,
            }}
          >
            <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: c.text }}>{row.site.name}</Text>
            <Text style={{ fontSize: tipografia.display, fontWeight: '900', color: c.text, marginVertical: 4 }}>{row.total}</Text>
            <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
              {row.prep} prep. · {row.transfers} traslados
            </Text>
          </View>
        ))}
      </Grid>

      <Spacer h={space.lg} />

      <Panel>
        <DataTable
          columns={columns}
          rows={rows}
          keyExtractor={(r) => r.id}
          onRowPress={(r) => openVehicle(r.vehicleId)}
          emptyText="No hay solicitudes con esos filtros."
        />
      </Panel>

      {editing && puedeGestionar ? (
        <ManageModal
          request={editing}
          onClose={() => setEditing(null)}
          onDone={(m) => {
            setToast(m);
            setEditing(null);
          }}
        />
      ) : null}
    </Screen>
    </ScreenGuard>
  );
}

function ManageModal({
  request,
  onClose,
  onDone,
}: {
  request: ServiceRequest;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const [status, setStatus] = useState<RequestStatus>(request.status);
  const [assignedTo, setAssignedTo] = useState<string | null>(request.assignedTo);
  const [carrierId, setCarrierId] = useState<string | null>(request.carrierId);
  const { can } = usePerms();
  const puedePreparar = can('preparacion.gestionar');

  const candidates = state.users.filter((u) =>
    request.type === 'traslado' ? u.role === 'transportista' || u.role === 'logistica' : u.role === 'preparador'
  );

  const vehicle = state.vehicles.find((v) => v.id === request.vehicleId);

  return (
    <Modal
      visible
      onClose={onClose}
      title={`Gestionar ${request.type === 'traslado' ? 'traslado' : 'preparación'}`}
      footer={
        <>
          <Btn
            variant="primary"
            full
            onPress={() => {
              run({ type: 'request.update', requestId: request.id, status, assignedTo, carrierId });
              onDone('Solicitud actualizada.');
            }}
          >
            Guardar cambios
          </Btn>
          {request.type === 'traslado' && !request.pickedUpAt && request.status !== 'terminada' ? (
            <Btn
              full
              onPress={() => {
                run({ type: 'request.update', requestId: request.id, status: 'en_ruta', assignedTo, carrierId });
                onDone(
                  `Llaves entregadas. Empiezan las ${state.config.transferDeadlineHours} h del transportista.`
                );
              }}
            >
              🔑 Han recogido las llaves
            </Btn>
          ) : null}
          {request.type === 'preparacion' && status !== 'terminada' && puedePreparar ? (
            <Btn
              full
              onPress={() => {
                // Abrir la preparación ya deja la solicitud en curso y a
                // nombre de quien la prepara: lo hace `prep.create`.
                run({
                  type: 'prep.create',
                  vehicleId: request.vehicleId,
                  siteId: request.siteId,
                  preparerId: assignedTo,
                });
                onDone('Preparación abierta y solicitud en curso.');
              }}
            >
              🧽 Abrir preparación en {siteName(state, request.siteId)}
            </Btn>
          ) : null}
        </>
      }
    >
      <Field label="Vehículo">
        <Muted>{vehicle ? `${vehicleName(vehicle)} · ${vehicleRef(vehicle)}` : request.vehicleId}</Muted>
      </Field>
      <Field label="Ruta">
        <Muted>
          {locationLabel(state, request.from)} → {locationLabel(state, request.to)}
        </Muted>
      </Field>
      <Field label="Estado">
        <Select
          full
          value={status}
          onChange={(v) => setStatus(v as RequestStatus)}
          options={Object.entries(REQUEST_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          title="Estado"
        />
      </Field>
      {request.type === 'traslado' ? (
        <Field label="Llaves">
          {request.pickedUpAt ? (
            <Muted>
              🔑 Recogidas {formatDateTime(request.pickedUpAt)} · entrega antes de{' '}
              {request.dueAt ? formatDateTime(request.dueAt) : '—'}
            </Muted>
          ) : (
            <Notice tone="warn">
              Sin recoger: el plazo de {state.config.transferDeadlineHours} h todavía no ha empezado. El
              transportista lo marca desde su móvil; si no usa la app, márcalo tú con el botón de abajo.
            </Notice>
          )}
        </Field>
      ) : null}
      {request.type === 'traslado' ? (
        <Field label="Empresa de transporte">
          <Select
            full
            value={carrierId}
            onChange={setCarrierId}
            placeholder="Sin asignar"
            options={activeCarriers(state).map((x) => ({ value: x.id, label: x.name }))}
            title="Empresa de transporte"
          />
        </Field>
      ) : null}

      <Field label="Asignar a">
        <Select
          full
          value={assignedTo}
          onChange={setAssignedTo}
          placeholder="Sin asignar"
          options={candidates.map((u) => ({ value: u.id, label: u.name, hint: u.email }))}
          title="Responsable"
        />
      </Field>
      {request.note ? (
        <Field label="Nota">
          <Muted>{request.note}</Muted>
        </Field>
      ) : null}
    </Modal>
  );
}
