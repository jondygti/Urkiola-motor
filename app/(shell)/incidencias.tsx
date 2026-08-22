import React, { useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import {
  Btn,
  Column,
  DataTable,
  Grid,
  H1,
  Input,
  Kpi,
  Modal,
  Muted,
  Notice,
  Panel,
  Screen,
  Select,
  Spacer,
  Toolbar,
  radius,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useStore } from '@/data/store';
import { vehicleByRef } from '@/data/selectors';
import { formatDateTime, userName, vehicleName, vehicleRef } from '@/data/format';
import { INCIDENT_TYPE_LABEL, type Incident } from '@/data/types';
import { Cell, IncidentStatusPill, useOpenVehicle } from '@/features/common/bits';
import { IncidentModal } from '@/features/actions/VehicleActions';

const ALL = '__all__';

export default function IncidentsScreen() {
  const state = useAppState();
  const { run } = useStore();
  const { c } = useTheme();
  const openVehicle = useOpenVehicle();

  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [detail, setDetail] = useState<Incident | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [ref, setRef] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      state.incidents
        .filter((i) => (type === ALL ? true : i.type === type))
        .filter((i) => (status === ALL ? true : i.status === status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [state.incidents, type, status]
  );

  const open = state.incidents.filter((i) => i.status !== 'cerrada');
  const target = vehicleByRef(state, ref);

  const columns: Column<Incident>[] = [
    {
      key: 'at',
      header: 'Fecha',
      width: 130,
      value: (i) => formatDateTime(i.createdAt),
      render: (i) => <Cell>{formatDateTime(i.createdAt)}</Cell>,
    },
    {
      key: 'vehicle',
      header: 'Vehículo',
      width: 170,
      primary: true,
      value: (i) => {
        const v = state.vehicles.find((x) => x.id === i.vehicleId);
        return v ? `${vehicleRef(v)} ${vehicleName(v)}` : i.vehicleId;
      },
      filter: { type: 'text' },
      render: (i) => {
        const v = state.vehicles.find((x) => x.id === i.vehicleId);
        return (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{v ? vehicleRef(v) : '—'}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>{v ? vehicleName(v) : ''}</Text>
          </View>
        );
      },
    },
    {
      key: 'type',
      header: 'Tipo',
      width: 120,
      value: (i) => INCIDENT_TYPE_LABEL[i.type],
      filter: {
        type: 'select',
        options: Object.values(INCIDENT_TYPE_LABEL).map((label) => ({ value: label, label })),
      },
      render: (i) => <Cell>{INCIDENT_TYPE_LABEL[i.type]}</Cell>,
    },
    {
      key: 'description',
      header: 'Descripción',
      width: 280,
      value: (i) => i.description,
      filter: { type: 'text' },
      render: (i) => <Cell>{i.description}</Cell>,
    },
    {
      key: 'photos',
      header: 'Fotos',
      width: 80,
      value: (i) => String(i.photos.length),
      render: (i) => <Cell muted>{i.photos.length}</Cell>,
    },
    {
      key: 'status',
      header: 'Estado',
      width: 110,
      value: (i) => i.status,
      filter: {
        type: 'select',
        options: [
          { value: 'abierta', label: 'Abierta' },
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'cerrada', label: 'Cerrada' },
        ],
      },
      render: (i) => <IncidentStatusPill status={i.status} />,
    },
    {
      key: 'actions',
      header: '',
      width: 100,
      render: (i) => (
        <Btn small onPress={() => setDetail(i)}>
          Ver
        </Btn>
      ),
    },
  ];

  return (
    <Screen>
      <H1>Incidencias</H1>
      <Muted>Daños, faltas y bloqueos detectados en recepción, transporte, campa o preparación.</Muted>

      {toast ? <Notice>{toast}</Notice> : null}

      <Toolbar>
        <Btn variant="primary" onPress={() => setNewOpen(true)}>
          + Nueva incidencia
        </Btn>
        <Select
          value={type}
          onChange={setType}
          title="Tipo"
          options={[
            { value: ALL, label: 'Todas' },
            ...Object.entries(INCIDENT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          value={status}
          onChange={setStatus}
          title="Estado"
          options={[
            { value: ALL, label: 'Todos los estados' },
            { value: 'abierta', label: 'Abiertas' },
            { value: 'pendiente', label: 'Pendientes' },
            { value: 'cerrada', label: 'Cerradas' },
          ]}
        />
      </Toolbar>

      <Grid cols={4} minWidth={170}>
        <Kpi label="Abiertas" value={open.length} tone={open.length > 0 ? 'red' : 'ok'} />
        <Kpi label="Recepción" value={open.filter((i) => i.type === 'recepcion').length} />
        <Kpi label="Preparación" value={open.filter((i) => i.type === 'preparacion').length} />
        <Kpi label="Cerradas" value={state.incidents.filter((i) => i.status === 'cerrada').length} />
      </Grid>

      <Spacer h={space.lg} />

      <Panel>
        <DataTable
          columns={columns}
          rows={rows}
          keyExtractor={(i) => i.id}
          onRowPress={(i) => setDetail(i)}
          emptyText="No hay incidencias con esos filtros."
        />
      </Panel>

      {/* alta: primero se identifica el vehículo por matrícula o VIN-8 */}
      <Modal visible={newOpen && !target} onClose={() => setNewOpen(false)} title="⚠️ Nueva incidencia">
        <Muted>Identifica el vehículo por matrícula o por los 8 últimos caracteres del bastidor.</Muted>
        <Spacer h={space.sm} />
        <Input value={ref} onChangeText={setRef} placeholder="Matrícula o VIN-8" autoCapitalize="characters" />
        <Spacer h={space.sm} />
        {ref.length > 2 && !target ? <Notice tone="warn">Sin coincidencias todavía.</Notice> : null}
      </Modal>

      {newOpen && target ? (
        <IncidentModal
          visible
          vehicle={target}
          defaultType="preparacion"
          onClose={() => {
            setNewOpen(false);
            setRef('');
          }}
          onDone={(m) => {
            setToast(m);
            setNewOpen(false);
            setRef('');
          }}
        />
      ) : null}

      {detail ? (
        <Modal
          visible
          onClose={() => setDetail(null)}
          title={`Incidencia · ${INCIDENT_TYPE_LABEL[detail.type]}`}
          footer={
            <>
              {detail.status !== 'cerrada' ? (
                <Btn
                  variant="primary"
                  full
                  onPress={() => {
                    run({ type: 'incident.close', incidentId: detail.id });
                    setToast('Incidencia cerrada.');
                    setDetail(null);
                  }}
                >
                  ✓ Cerrar incidencia
                </Btn>
              ) : null}
              <Btn
                full
                onPress={() => {
                  openVehicle(detail.vehicleId);
                  setDetail(null);
                }}
              >
                Ver ficha del vehículo
              </Btn>
            </>
          }
        >
          <Muted>{detail.description}</Muted>
          <Spacer h={space.sm} />
          <Muted>
            {formatDateTime(detail.createdAt)} · registrada por {userName(state, detail.createdBy)}
          </Muted>
          {detail.photos.length ? (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: space.md }}>
              {detail.photos.map((uri) =>
                uri.startsWith('demo://') ? (
                  <View
                    key={uri}
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: radius.sm,
                      backgroundColor: c.surfaceSunken,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>📷</Text>
                  </View>
                ) : (
                  <Image
                    key={uri}
                    source={{ uri }}
                    style={{ width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.surfaceSunken }}
                  />
                )
              )}
            </View>
          ) : null}
        </Modal>
      ) : null}
    </Screen>
  );
}
