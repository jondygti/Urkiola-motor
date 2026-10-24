import { comercialLabel } from '@/data/format';
import { AccionesSolicitudes } from '@/features/actions/Bloques';
import { CancelarSolicitud } from '@/features/actions/CancelarSolicitud';
import { OrdenesTrabajo } from '@/features/actions/OrdenesTrabajo';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { MiniaturaVehiculo } from '@/features/common/Miniatura';
import { Btn, Column, DataTable, Field, Grid, H1, Icon, Modal, Muted, Notice, Panel, Pill, Screen, Select, Spacer, Toolbar, space, tipografia, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { activeCarriers, carrierName, deadlineOf, requestsBySite } from '@/data/selectors';
import { formatDateTime, locationLabel, siteName, userName, vehicleName, vehicleRef } from '@/data/format';
import { REQUEST_STATUS_LABEL, type RequestStatus, type ServiceRequest } from '@/data/types';
import { Cell, RequestStatusPill, useOpenVehicle } from '@/features/common/bits';
import { DeadlineChip } from '@/features/common/DeadlineChip';
import { ScreenGuard, usePerms } from '@/features/common/Guard';

const ALL = '__all__';

const esTrasladoDesdeSondika = (r: ServiceRequest) =>
  r.type === 'traslado' && r.from?.siteId === 'sondika';

/**
 * Traslado que logística todavía no ha dado por listo para enviar. Mientras
 * tanto el transportista no lo ve: primero hay que localizar las llaves y el
 * coche.
 */
const porEnviar = (r: ServiceRequest) =>
  r.type === 'traslado' && r.status !== 'terminada' && r.status !== 'cancelada' && !r.keysReadyAt && !r.pickedUpAt;

/** Dónde están las llaves, para ir a por ellas antes de marcarlo como listo. */
const llavesDe = (r: ServiceRequest, primaria: string | null | undefined) =>
  esTrasladoDesdeSondika(r) ? 'Leioa · Logística' : primaria || 'sin apuntar';

export default function RequestsScreen() {
  const { state, run } = useStore();
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

  const trasladosPorEnviar = useMemo(
    () =>
      state.requests
        .filter(porEnviar)
        .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.createdAt.localeCompare(b.createdAt)),
    [state.requests]
  );

  const rows = useMemo(
    () =>
      state.requests
        .filter((r) => (site === ALL ? true : r.siteId === site))
        .filter((r) => (type === ALL ? true : r.type === type))
        .filter((r) => (status === ALL ? (r.status !== 'terminada' && r.status !== 'cancelada') : r.status === status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [state.requests, site, type, status]
  );

  const columns: Column<ServiceRequest>[] = [
    {
      key: 'foto',
      header: 'Foto',
      width: 68,
      leading: true,
      render: (r) => <MiniaturaVehiculo vehicle={state.vehicles.find((v) => v.id === r.vehicleId)} />,
    },
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
      render: (r) => (
        <Cell icon={r.type === 'traslado' ? 'camion' : 'preparacion'}>
          {r.type === 'traslado' ? 'Traslado' : r.prepTipo === 'repaso' ? 'Repaso entrega' : 'Preparación'}
        </Cell>
      ),
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
      key: 'salesRep',
      header: 'Comercial',
      width: 145,
      value: (r) => comercialLabel(state, state.vehicles.find((x) => x.id === r.vehicleId)),
      render: (r) => {
        const v = state.vehicles.find((x) => x.id === r.vehicleId);
        return <Cell muted={!v?.salesRep}>{comercialLabel(state, v)}</Cell>;
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
      value: (r) => (r.type === 'traslado' ? r.carrierId ? carrierName(state, r.carrierId) : 'Pendiente de asignación' : '—'),
      filter: {
        type: 'select',
        options: state.carriers.map((x) => ({ value: x.name, label: x.name })),
      },
      render: (r) =>
        r.type === 'traslado' ? (
          <Cell muted={!r.carrierId}>{r.carrierId ? carrierName(state, r.carrierId) : 'Pendiente de asignación'}</Cell>
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
          emptyLabel={
            porEnviar(r)
              ? 'Por enviar'
              : r.type === 'traslado'
                ? 'Llaves sin recoger'
                : undefined
          }
          emptyIcon={r.type === 'traslado' ? 'llaves' : undefined}
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
      render: (r) =>
        porEnviar(r) ? (
          <Cell icon="llaves">Por enviar</Cell>
        ) : r.type === 'traslado' && !!r.keysReadyAt && !r.pickedUpAt && r.status !== 'terminada' && r.status !== 'cancelada' ? (
          <Cell icon="llaves">Listo para enviar</Cell>
        ) : (
          <RequestStatusPill status={r.status} urgent={r.urgent} />
        ),
    },
    {
      key: 'actions',
      header: '',
      width: 110,
      render: (r) =>
        puedeGestionar && r.status !== 'terminada' && r.status !== 'cancelada' ? (
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

      {toast ? <Notice>{toast}</Notice> : null}

      {puedeGestionar ? (
        <>
          <Spacer />
          <Panel icon="llaves" title={`Traslados por enviar · ${trasladosPorEnviar.length}`}>
            {trasladosPorEnviar.length === 0 ? (
              <Muted>Ningún traslado esperando a logística.</Muted>
            ) : (
              trasladosPorEnviar.map((r, index) => {
                const v = state.vehicles.find((x) => x.id === r.vehicleId);
                return (
                  <View
                    key={r.id}
                    testID="traslado-por-enviar"
                    style={{
                      paddingVertical: space.sm,
                      borderBottomWidth: index === trasladosPorEnviar.length - 1 ? 0 : 1,
                      borderBottomColor: c.border,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                      <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: c.text }}>
                            {v ? vehicleRef(v) : r.vehicleId}
                          </Text>
                          {r.urgent ? <Pill tone="red">Urgente</Pill> : null}
                          {r.conPreparacion ? <Pill tone="blue" icon="preparacion">Pedido con la preparación</Pill> : null}
                        </View>
                        <Text style={{ fontSize: tipografia.small, color: c.textMuted }}>
                          {r.from ? locationLabel(state, r.from, true) : 'Origen sin apuntar'} → {locationLabel(state, r.to, true)}
                        </Text>
                        <Text style={{ fontSize: tipografia.micro, color: c.textFaint }}>
                          Llaves: {llavesDe(r, v?.primaryKeyLocation)} · Comercial: {comercialLabel(state, v)} ·{' '}
                          {r.carrierId ? carrierName(state, r.carrierId) : 'sin empresa de transporte'}
                        </Text>
                      </View>
                      <Btn small onPress={() => setEditing(r)}>Gestionar</Btn>
                      <Btn
                        icon="llaves"
                        small
                        variant="primary"
                        // Sin empresa no le llegaría a ningún transportista.
                        disabled={!r.carrierId}
                        onPress={() => {
                          run({ type: 'request.update', requestId: r.id, status: 'asignada' });
                          setToast(`${v ? vehicleRef(v) : 'Vehículo'} · listo para enviar: ya le sale a ${carrierName(state, r.carrierId)}.`);
                        }}
                      >
                        Listo para enviar
                      </Btn>
                    </View>
                    {!r.carrierId ? (
                      <Muted>Elige la empresa de transporte en «Gestionar» antes de enviarlo.</Muted>
                    ) : null}
                  </View>
                );
              })
            )}
          </Panel>
          <Spacer />
          <OrdenesTrabajo onDone={setToast} />
        </>
      ) : null}

      <Spacer />

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
          accionesEnBloque={(seleccionadas, limpiar) => (
            <AccionesSolicitudes requests={seleccionadas} limpiar={limpiar} onHecho={setToast} />
          )}
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
  const { c } = useTheme();
  const [status, setStatus] = useState<RequestStatus>(request.status);
  const [assignedTo, setAssignedTo] = useState<string | null>(request.assignedTo);
  const [carrierId, setCarrierId] = useState<string | null>(request.carrierId);
  const { can } = usePerms();
  const puedePreparar = can('preparacion.gestionar');
  // Todo traslado pasa por «listo para enviar» antes de que lo vea el
  // transportista; antes solo los de Sondika.
  const requiereLlaves = request.type === 'traslado';
  const llavesPreparadas = !!request.keysReadyAt || !!request.pickedUpAt;

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
          {requiereLlaves && !request.keysReadyAt && !request.pickedUpAt ? (
            <Btn
              full
              onPress={() => {
                run({ type: 'request.update', requestId: request.id, status: 'asignada', assignedTo, carrierId });
                onDone('Listo para enviar: el transportista ya lo ve y puede recoger las llaves.');
              }}
              icon="llaves"
              disabled={!carrierId}
            >
              Listo para enviar
            </Btn>
          ) : null}
          {request.type === 'traslado' && !request.pickedUpAt && (request.status !== 'terminada' && request.status !== 'cancelada') && llavesPreparadas ? (
            <Btn
              full
              onPress={() => {
                run({ type: 'request.update', requestId: request.id, status: 'en_ruta', assignedTo, carrierId });
                onDone(
                  `Llaves entregadas. Empiezan las ${state.config.transferDeadlineHours} h del transportista.`
                );
              }}
              icon="llaves"
            >
              Han recogido las llaves
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
                  tipo: request.prepTipo ?? 'entrada',
                });
                onDone(
                  request.prepTipo === 'repaso'
                    ? 'Repaso abierto y solicitud en curso.'
                    : 'Preparación abierta y solicitud en curso.'
                );
              }}
              icon="preparacion"
            >
              {request.prepTipo === 'repaso' ? 'Abrir repaso' : 'Abrir preparación'} en{' '}
              {siteName(state, request.siteId)}
            </Btn>
          ) : null}
        </>
      }
    >
      <Field label="Vehículo">
        <Muted>{vehicle ? `${vehicleName(vehicle)} · ${vehicleRef(vehicle)}` : request.vehicleId}</Muted>
      </Field>
      <Field label="Comercial">
        <Muted>{comercialLabel(state, vehicle)}</Muted>
      </Field>
      <Field label="Ruta">
        <Muted>
          {locationLabel(state, request.from)} → {locationLabel(state, request.to)}
        </Muted>
      </Field>
      <CancelarSolicitud request={state.requests.find(r => r.id === request.id) ?? request} onCancelled={() => onDone('Solicitud cancelada.')} />
      <Field label="Estado">
        <Select
          full
          value={status}
          onChange={(v) => setStatus(v as RequestStatus)}
          options={Object.entries(REQUEST_STATUS_LABEL)
            .filter(([key]) => {
              const permitido = request.type === 'traslado'
                ? ['solicitada', 'asignada', 'en_ruta'].includes(key)
                : ['solicitada', 'asignada', 'en_curso', 'bloqueada'].includes(key);
              if (!permitido) return false;
              if (request.type === 'traslado' && request.pickedUpAt && key !== 'en_ruta') return false;
              if (requiereLlaves && !llavesPreparadas && key === 'en_ruta') return false;
              return true;
            })
            .map(([value, label]) => ({
              value,
              label: requiereLlaves && request.keysReadyAt && value === 'asignada' ? 'Listo para enviar' : label,
            }))}
          title="Estado"
        />
      </Field>
      {request.type === 'traslado' ? (
        <Field label="Llaves">
          {request.pickedUpAt ? (
            <Muted>
              <Icon name="llaves" size={tipografia.small} color={c.textMuted} /> Recogidas {formatDateTime(request.pickedUpAt)} · entrega antes de{' '}
              {request.dueAt ? formatDateTime(request.dueAt) : '—'}
            </Muted>
          ) : request.keysReadyAt ? (
            <Notice>
              Listo para enviar desde {formatDateTime(request.keysReadyAt)}
              {request.keysReadyBy ? ` · ${userName(state, request.keysReadyBy)}` : ''}. Llaves en {llavesDe(request, vehicle?.primaryKeyLocation)}.
              Sin recoger: el plazo de {state.config.transferDeadlineHours} h todavía no ha empezado; si el transportista no
              usa la app, márcalo tú con el botón de abajo.
            </Notice>
          ) : (
            <Notice tone="warn">
              Por enviar: el transportista todavía no lo ve. Cuando tengas localizadas las llaves ({llavesDe(request, vehicle?.primaryKeyLocation)})
              y el coche, márcalo como listo para enviar.
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
