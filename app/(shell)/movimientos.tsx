import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Column,
  DataTable,
  H1,
  Kpi,
  Grid,
  Muted,
  Notice,
  Panel,
  Screen,
  Select,
  Spacer,
  Toolbar,
  space,
  useTheme,
} from '@/ui';
import { useAppState } from '@/data/store';
import { formatDateTime, locationLabel, userName, vehicleName, vehicleRef } from '@/data/format';
import type { Movement } from '@/data/types';
import { Cell, useOpenVehicle } from '@/features/common/bits';
import { IfCan, ScreenGuard } from '@/features/common/Guard';
import { MovementModal } from '@/features/actions/VehicleActions';
import { vehicleByRef } from '@/data/selectors';
import { Input } from '@/ui';

const ALL = '__all__';

export default function MovementsScreen() {
  const state = useAppState();
  const { c } = useTheme();
  const openVehicle = useOpenVehicle();

  const [site, setSite] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ref, setRef] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      state.movements
        .filter((m) => (site === ALL ? true : m.to.siteId === site || m.from?.siteId === site))
        .filter((m) => {
          if (kind === ALL) return true;
          const internal = m.from?.siteId === m.to.siteId;
          return kind === 'interno' ? internal : !internal;
        })
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [state.movements, site, kind]
  );

  const today = state.movements.filter(
    (m) => new Date(m.at).toDateString() === new Date().toDateString()
  ).length;

  const columns: Column<Movement>[] = [
    {
      key: 'at',
      header: 'Fecha',
      width: 130,
      value: (m) => formatDateTime(m.at),
      filter: { type: 'text' },
      render: (m) => <Cell>{formatDateTime(m.at)}</Cell>,
    },
    {
      key: 'vehicle',
      header: 'Vehículo',
      width: 170,
      primary: true,
      value: (m) => {
        const v = state.vehicles.find((x) => x.id === m.vehicleId);
        return v ? `${vehicleRef(v)} ${vehicleName(v)}` : m.vehicleId;
      },
      filter: { type: 'text' },
      render: (m) => {
        const v = state.vehicles.find((x) => x.id === m.vehicleId);
        return (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{v ? vehicleRef(v) : '—'}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>{v ? vehicleName(v) : ''}</Text>
          </View>
        );
      },
    },
    {
      key: 'from',
      header: 'Origen',
      width: 190,
      value: (m) => locationLabel(state, m.from, true),
      render: (m) => <Cell muted>{locationLabel(state, m.from, true)}</Cell>,
    },
    {
      key: 'to',
      header: 'Destino',
      width: 190,
      value: (m) => locationLabel(state, m.to, true),
      render: (m) => <Cell>{locationLabel(state, m.to, true)}</Cell>,
    },
    {
      key: 'user',
      header: 'Usuario',
      width: 140,
      value: (m) => userName(state, m.userId),
      render: (m) => <Cell muted>{userName(state, m.userId)}</Cell>,
    },
    {
      key: 'kind',
      header: 'Tipo',
      width: 120,
      value: (m) => (m.from?.siteId === m.to.siteId ? 'Interno' : 'Entre sedes'),
      filter: {
        type: 'select',
        options: [
          { value: 'Interno', label: 'Interno' },
          { value: 'Entre sedes', label: 'Entre sedes' },
        ],
      },
      render: (m) => <Cell muted>{m.from?.siteId === m.to.siteId ? 'Interno' : 'Entre sedes'}</Cell>,
    },
  ];

  const targetVehicle = target ? state.vehicles.find((v) => v.id === target) : null;

  return (
    <ScreenGuard href="/movimientos" title="Movimientos">
    <Screen>
      <H1>Movimientos</H1>
      <Muted>Dentro de una misma concesión o entre cualquier ubicación de la red.</Muted>

      {toast ? <Notice>{toast}</Notice> : null}

      <Toolbar>
        <IfCan permission="movimientos.registrar">
          <Btn variant="primary" onPress={() => setPickerOpen(true)}>
            📍 Registrar movimiento
          </Btn>
        </IfCan>
        <Select
          value={site}
          onChange={setSite}
          title="Sede"
          options={[{ value: ALL, label: 'Todas las sedes' }, ...state.sites.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <Select
          value={kind}
          onChange={setKind}
          title="Tipo"
          options={[
            { value: ALL, label: 'Todos los movimientos' },
            { value: 'interno', label: 'Internos' },
            { value: 'entre', label: 'Entre sedes' },
          ]}
        />
      </Toolbar>

      <Grid cols={3} minWidth={200}>
        <Kpi label="Movimientos hoy" value={today} />
        <Kpi label="Histórico" value={state.movements.length} hint="registros" />
        <Kpi
          label="Entre sedes"
          value={state.movements.filter((m) => m.from?.siteId !== m.to.siteId).length}
          hint="traslados"
        />
      </Grid>

      <Spacer h={space.lg} />

      <Panel>
        <DataTable
          columns={columns}
          rows={rows}
          keyExtractor={(m) => m.id}
          onRowPress={(m) => openVehicle(m.vehicleId)}
          emptyText="Sin movimientos con esos filtros."
        />
      </Panel>

      {pickerOpen && !targetVehicle ? (
        <Panel style={{ marginTop: space.lg }} title="¿Qué vehículo mueves?">
          <Input
            value={ref}
            onChangeText={(v) => {
              setRef(v);
              const found = vehicleByRef(state, v);
              if (found) setTarget(found.id);
            }}
            placeholder="Matrícula o VIN-8"
            autoCapitalize="characters"
          />
          <Spacer h={space.sm} />
          <Muted>Escribe la matrícula o los 8 últimos caracteres del bastidor. Sin QR.</Muted>
          <Spacer h={space.sm} />
          <Btn onPress={() => setPickerOpen(false)}>Cancelar</Btn>
        </Panel>
      ) : null}

      {targetVehicle ? (
        <MovementModal
          visible
          vehicle={targetVehicle}
          onClose={() => {
            setTarget(null);
            setRef('');
            setPickerOpen(false);
          }}
          onDone={(m) => {
            setToast(m);
            setTarget(null);
            setRef('');
            setPickerOpen(false);
          }}
        />
      ) : null}
    </Screen>
    </ScreenGuard>
  );
}
