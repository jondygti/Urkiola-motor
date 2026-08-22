import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Column,
  DataTable,
  Grid,
  H1,
  Kpi,
  Muted,
  Panel,
  Pill,
  ProgressBar,
  Screen,
  Select,
  Spacer,
  Toolbar,
  space,
  useTheme,
} from '@/ui';
import { useAppState } from '@/data/store';
import { siteOccupancy, vehiclesAtSite, vehiclesInZone, zoneOccupancy } from '@/data/selectors';
import { formatDateTime, timeAgo, vehicleName, vehicleRef } from '@/data/format';
import type { Position } from '@/data/types';
import { Cell, StatusPill, useOpenVehicle } from '@/features/common/bits';

export default function CampScreen() {
  const state = useAppState();
  const openVehicle = useOpenVehicle();
  const { c } = useTheme();

  const [siteId, setSiteId] = useState('sondika');
  const zones = useMemo(() => state.zones.filter((z) => z.siteId === siteId), [state.zones, siteId]);
  const [zoneId, setZoneId] = useState<string>('sondika-tej-01');
  const activeZone = zones.find((z) => z.id === zoneId) ?? zones[0];

  const site = state.sites.find((s) => s.id === siteId)!;
  const occ = siteOccupancy(state, siteId);
  const zoneOcc = activeZone ? zoneOccupancy(state, activeZone.id) : null;

  const rows = useMemo(
    () => (activeZone ? state.positions.filter((p) => p.zoneId === activeZone.id) : []),
    [state.positions, activeZone]
  );

  const vehicleAt = (positionId: string) =>
    state.vehicles.find((v) => v.location?.positionId === positionId && v.logisticActive);

  const columns: Column<Position>[] = [
    {
      key: 'code',
      header: 'Posición',
      width: 100,
      primary: true,
      value: (p) => p.code,
      filter: { type: 'text' },
      render: (p) => <Text style={{ fontSize: 13, fontWeight: '800', color: c.text }}>{p.code}</Text>,
    },
    {
      key: 'vehicle',
      header: 'Vehículo',
      width: 220,
      value: (p) => {
        const v = vehicleAt(p.id);
        return v ? `${vehicleRef(v)} ${vehicleName(v)}` : 'Libre';
      },
      filter: { type: 'text' },
      render: (p) => {
        const v = vehicleAt(p.id);
        if (!v) return <Cell muted>Libre</Cell>;
        return (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{vehicleRef(v)}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>{vehicleName(v)}</Text>
          </View>
        );
      },
    },
    {
      key: 'status',
      header: 'Estado',
      width: 160,
      value: (p) => vehicleAt(p.id)?.status ?? 'libre',
      render: (p) => {
        const v = vehicleAt(p.id);
        return v ? <StatusPill status={v.status} /> : <Pill tone="neutral">Libre</Pill>;
      },
    },
    {
      key: 'check',
      header: 'Última comprobación',
      width: 180,
      value: (p) => formatDateTime(vehicleAt(p.id)?.lastCheckAt),
      render: (p) => {
        const v = vehicleAt(p.id);
        if (!v) return <Cell muted>—</Cell>;
        const stale = v.lastCheckAt
          ? (Date.now() - new Date(v.lastCheckAt).getTime()) / 3_600_000 > state.config.staleCheckHours
          : true;
        return (
          <Text style={{ fontSize: 12, color: stale ? c.redFg : c.text }}>
            {formatDateTime(v.lastCheckAt)} · {timeAgo(v.lastCheckAt)}
          </Text>
        );
      },
    },
  ];

  return (
    <Screen>
      <H1>{site.kind === 'campa' ? `Campa ${site.name}` : `Parkings de ${site.name}`}</H1>
      <Muted>
        {site.prepares
          ? 'Sede de preparación: almacena y prepara vehículos.'
          : 'Solo almacenamiento y logística. No es sede de preparación.'}
      </Muted>

      <Toolbar>
        <Select
          value={siteId}
          onChange={(v) => {
            setSiteId(v);
            const first = state.zones.find((z) => z.siteId === v);
            if (first) setZoneId(first.id);
          }}
          options={state.sites.map((s) => ({ value: s.id, label: s.name }))}
          title="Sede"
        />
        <Select
          value={activeZone?.id}
          onChange={setZoneId}
          options={zones.map((z) => ({
            value: z.id,
            label: z.name,
            hint: `${vehiclesInZone(state, z.id).length}/${z.capacity}`,
          }))}
          title="Zona"
          searchable
        />
      </Toolbar>

      <Grid cols={4} minWidth={170}>
        <Kpi label="Vehículos" value={vehiclesAtSite(state, siteId).length} hint="en la sede" />
        <Kpi label={site.kind === 'campa' ? 'Tejavanas' : 'Parkings'} value={occ.zones} hint="configuradas" />
        <Kpi label="Posiciones" value={occ.capacity} hint="capacidad" />
        <Kpi
          label="Ocupación"
          value={`${occ.pct}%`}
          hint="actual"
          tone={occ.pct > 90 ? 'red' : occ.pct > 75 ? 'amber' : 'ok'}
        />
      </Grid>

      <Spacer h={space.lg} />

      {activeZone && zoneOcc ? (
        <Panel title={`${activeZone.name} · ${zoneOcc.occupied}/${zoneOcc.capacity} plazas`}>
          <ProgressBar pct={zoneOcc.pct} tone={zoneOcc.pct > 90 ? 'red' : 'ok'} />
          <Spacer h={space.md} />
          <DataTable
            columns={columns}
            rows={rows}
            keyExtractor={(p) => p.id}
            onRowPress={(p) => {
              const v = vehicleAt(p.id);
              if (v) openVehicle(v.id);
            }}
            emptyText="Esta zona no tiene posiciones configuradas."
          />
        </Panel>
      ) : null}

      <Spacer h={space.lg} />

      <Panel title="Ocupación por zona">
        <Grid cols={4} minWidth={200}>
          {zones.map((z) => {
            const o = zoneOccupancy(state, z.id);
            return (
              <View
                key={z.id}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 11,
                  padding: 12,
                  backgroundColor: c.surface,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: c.text }}>{z.name}</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: c.text, marginVertical: 4 }}>
                  {o.occupied}
                </Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginBottom: 6 }}>de {o.capacity} plazas</Text>
                <ProgressBar pct={o.pct} tone={o.pct > 90 ? 'red' : o.pct > 75 ? 'amber' : 'ok'} />
              </View>
            );
          })}
        </Grid>
      </Panel>
    </Screen>
  );
}
