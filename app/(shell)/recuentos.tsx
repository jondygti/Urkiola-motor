import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Column,
  DataTable,
  Field,
  Grid,
  H1,
  Input,
  Kpi,
  Modal,
  Muted,
  Notice,
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
import { useAppState, useStore } from '@/data/store';
import { countSummary, openCount, staleVehicles, vehicleByRef } from '@/data/selectors';
import { formatDateTime, hoursSince, locationLabel, timeAgo, userName, vehicleName, vehicleRef } from '@/data/format';
import type { FleetCount } from '@/data/types';
import { Cell, useOpenVehicle } from '@/features/common/bits';
import { BarcodeScanner } from '@/features/scan/BarcodeScanner';

export default function CountsScreen() {
  const state = useAppState();
  const { run } = useStore();
  const { c } = useTheme();
  const openVehicle = useOpenVehicle();

  const [newOpen, setNewOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const current = openCount(state);
  const summary = current ? countSummary(state, current) : null;
  const stale = staleVehicles(state);

  const historyColumns: Column<FleetCount>[] = [
    {
      key: 'code',
      header: 'Recuento',
      width: 110,
      primary: true,
      value: (x) => x.code,
      filter: { type: 'text' },
      render: (x) => <Text style={{ fontSize: 13, fontWeight: '800', color: c.text }}>{x.code}</Text>,
    },
    {
      key: 'location',
      header: 'Ubicación',
      width: 200,
      value: (x) => locationLabel(state, { siteId: x.siteId, zoneId: x.zoneId ?? undefined }, true),
      filter: { type: 'text' },
      render: (x) => <Cell>{locationLabel(state, { siteId: x.siteId, zoneId: x.zoneId ?? undefined }, true)}</Cell>,
    },
    {
      key: 'at',
      header: 'Fecha/hora',
      width: 140,
      value: (x) => formatDateTime(x.startedAt),
      render: (x) => <Cell muted>{formatDateTime(x.startedAt)}</Cell>,
    },
    {
      key: 'expected',
      header: 'Esperados',
      width: 100,
      value: (x) => String(x.expected.length),
      render: (x) => <Cell>{x.expected.length}</Cell>,
    },
    {
      key: 'found',
      header: 'Encontrados',
      width: 110,
      value: (x) => String(x.found.length),
      render: (x) => <Cell>{x.found.length}</Cell>,
    },
    {
      key: 'diff',
      header: 'Diferencia',
      width: 110,
      value: (x) => String(x.found.length - x.expected.length),
      render: (x) => {
        const diff = x.found.length - x.expected.length;
        return <Pill tone={diff === 0 ? 'ok' : 'red'}>{diff === 0 ? '0' : diff}</Pill>;
      },
    },
    {
      key: 'responsible',
      header: 'Responsable',
      width: 150,
      value: (x) => userName(state, x.responsibleId),
      render: (x) => <Cell muted>{userName(state, x.responsibleId)}</Cell>,
    },
    {
      key: 'status',
      header: 'Estado',
      width: 110,
      value: (x) => (x.closedAt ? 'Cerrado' : 'Abierto'),
      render: (x) => <Pill tone={x.closedAt ? 'neutral' : 'ok'}>{x.closedAt ? 'Cerrado' : 'Abierto'}</Pill>,
    },
  ];

  return (
    <Screen>
      <H1>Recuentos de flota</H1>
      <Muted>
        Comprobación física desde la app: cada confirmación actualiza la última ubicación comprobada, con
        fecha, hora y usuario.
      </Muted>

      {toast ? <Notice>{toast}</Notice> : null}

      <Toolbar>
        <Btn variant="primary" onPress={() => setNewOpen(true)}>
          + Nuevo recuento
        </Btn>
        {current ? (
          <>
            <Btn onPress={() => setScanOpen(true)}>📷 Escanear vehículo</Btn>
            <Btn
              onPress={() => {
                run({ type: 'count.close', countId: current.id });
                setToast(`Recuento ${current.code} cerrado.`);
              }}
            >
              ✓ Cerrar recuento
            </Btn>
          </>
        ) : null}
      </Toolbar>

      <Grid cols={2} minWidth={420}>
        <Panel title={current ? `Recuento ${current.code} · ${locationLabel(state, { siteId: current.siteId, zoneId: current.zoneId ?? undefined })}` : 'Sin recuento abierto'}>
          {current && summary ? (
            <>
              <Grid cols={3} minWidth={120}>
                <Kpi label="Esperados" value={summary.expected} />
                <Kpi label="Encontrados" value={summary.found} tone="ok" />
                <Kpi label="Faltan" value={summary.missing} tone={summary.missing > 0 ? 'red' : 'ok'} />
              </Grid>
              <Spacer h={space.md} />
              <ProgressBar
                pct={summary.expected ? (summary.found / summary.expected) * 100 : 0}
                tone={summary.missing > 0 ? 'amber' : 'ok'}
              />
              <Spacer h={space.md} />
              <Btn variant="primary" full onPress={() => setScanOpen(true)}>
                📷 Escanear matrícula / VIN-8
              </Btn>
              <Spacer h={space.sm} />
              <Muted>
                La app registra automáticamente fecha, hora, usuario y ubicación comprobada. No hace falta QR:
                basta la matrícula o los 8 últimos del bastidor.
              </Muted>

              {summary.missing > 0 ? (
                <>
                  <Spacer h={space.md} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: c.text }}>
                    Pendientes de encontrar ({summary.missing})
                  </Text>
                  <Spacer h={space.sm} />
                  {summary.missingVehicles.slice(0, 12).map((v) => (
                    <Notice key={v.id} tone="warn" onPress={() => openVehicle(v.id)}>
                      {vehicleRef(v)} · {vehicleName(v)} · {locationLabel(state, v.location, true)}
                    </Notice>
                  ))}
                  {summary.missing > 12 ? <Muted>… y {summary.missing - 12} más.</Muted> : null}
                </>
              ) : null}
            </>
          ) : (
            <Muted>
              Crea un recuento para una tejavana o parking. Se generará la lista de vehículos esperados a
              partir de la ubicación registrada de cada uno.
            </Muted>
          )}
        </Panel>

        <Panel title={`Sin comprobación reciente (${stale.length})`}>
          {stale.length === 0 ? (
            <Notice>Todos los vehículos se han comprobado dentro del plazo.</Notice>
          ) : (
            stale.slice(0, 15).map((v) => {
              const days = Math.floor(hoursSince(v.lastCheckAt) / 24);
              return (
                <Notice key={v.id} tone={days >= 5 ? 'danger' : 'warn'} onPress={() => openVehicle(v.id)}>
                  <Text style={{ fontSize: 12, color: c.text }}>
                    <Text style={{ fontWeight: '800' }}>{vehicleRef(v)}</Text> · última comprobación{' '}
                    {formatDateTime(v.lastCheckAt)} · {timeAgo(v.lastCheckAt)} ·{' '}
                    {locationLabel(state, v.location, true)}
                  </Text>
                </Notice>
              );
            })
          )}
          {stale.length > 15 ? <Muted>… y {stale.length - 15} más.</Muted> : null}
        </Panel>
      </Grid>

      <Spacer h={space.lg} />

      <Panel title="Histórico de recuentos">
        <DataTable
          columns={historyColumns}
          rows={state.counts}
          keyExtractor={(x) => x.id}
          emptyText="Todavía no se ha hecho ningún recuento."
        />
      </Panel>

      <NewCountModal
        visible={newOpen}
        onClose={() => setNewOpen(false)}
        onDone={(m) => {
          setToast(m);
          setNewOpen(false);
        }}
      />

      {current && scanOpen ? (
        <ScanModal
          count={current}
          onClose={() => setScanOpen(false)}
          onDone={setToast}
        />
      ) : null}
    </Screen>
  );
}

function NewCountModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const [siteId, setSiteId] = useState('sondika');
  const [zoneId, setZoneId] = useState<string | null>('sondika-tej-01');

  const zones = state.zones.filter((z) => z.siteId === siteId);
  const expected = state.vehicles.filter((v) =>
    zoneId ? v.location?.zoneId === zoneId : v.location?.siteId === siteId
  ).length;

  const nextCode = `#${String(state.counts.length + 43).padStart(4, '0')}`;

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="📋 Nuevo recuento"
      footer={
        <Btn
          variant="primary"
          full
          onPress={() => {
            run({ type: 'count.create', siteId, zoneId, code: nextCode });
            onDone(`Recuento ${nextCode} creado con ${expected} vehículos esperados.`);
          }}
        >
          Crear recuento
        </Btn>
      }
    >
      <Field label="Sede">
        <Select
          full
          value={siteId}
          onChange={(v) => {
            setSiteId(v);
            setZoneId(state.zones.find((z) => z.siteId === v)?.id ?? null);
          }}
          options={state.sites.map((s) => ({ value: s.id, label: s.name }))}
          title="Sede"
        />
      </Field>
      <Field label="Zona" hint="Déjalo en «Toda la sede» para recontar todas las zonas a la vez.">
        <Select
          full
          value={zoneId}
          onChange={setZoneId}
          placeholder="Toda la sede"
          options={zones.map((z) => ({ value: z.id, label: z.name }))}
          title="Zona"
          searchable
        />
      </Field>
      <Notice>
        Se generará la lista de <Text style={{ fontWeight: '800' }}>{expected}</Text> vehículos esperados según
        la ubicación registrada.
      </Notice>
    </Modal>
  );
}

function ScanModal({
  count,
  onClose,
  onDone,
}: {
  count: FleetCount;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const [ref, setRef] = useState('');
  const [positionId, setPositionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const found = vehicleByRef(state, ref);
  const positions = useMemo(
    () => state.positions.filter((p) => (count.zoneId ? p.zoneId === count.zoneId : p.zoneId.startsWith(count.siteId))),
    [state.positions, count]
  );

  const confirm = (vehicleId: string) => {
    const already = count.found.some((f) => f.vehicleId === vehicleId);
    if (already) {
      setFeedback('Este vehículo ya estaba comprobado en este recuento.');
      return;
    }
    run({ type: 'count.finding', countId: count.id, vehicleId, positionId });
    const v = state.vehicles.find((x) => x.id === vehicleId);
    onDone(`${v ? vehicleRef(v) : vehicleId} comprobado.`);
    setRef('');
    setPositionId(null);
    setFeedback('✅ Comprobación registrada. Puedes escanear el siguiente.');
  };

  const handleScan = (value: string) => {
    const match = vehicleByRef(state, value) ?? vehicleByRef(state, value.slice(-8));
    if (match) confirm(match.id);
    else {
      setRef(value.slice(-8).toUpperCase());
      setFeedback('Código leído pero sin coincidencia. Revisa la matrícula.');
    }
  };

  return (
    <Modal
      visible
      onClose={onClose}
      title="📷 Escanear vehículo"
      footer={
        found ? (
          <Btn variant="primary" full onPress={() => confirm(found.id)}>
            Confirmar comprobación
          </Btn>
        ) : (
          <Btn full onPress={onClose}>
            Cerrar
          </Btn>
        )
      }
    >
      <BarcodeScanner onScan={handleScan} />
      <Spacer h={space.md} />
      <Field label="Matrícula o VIN-8">
        <Input value={ref} onChangeText={setRef} placeholder="Ej.: 4821 LKM o 12345678" autoCapitalize="characters" />
      </Field>

      {found ? (
        <>
          <Notice tone="info">
            <View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: c.text }}>
                {vehicleName(found)} · {vehicleRef(found)}
              </Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 3 }}>
                Ubicación registrada: {locationLabel(state, found.location)}
              </Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>
                Última comprobación: {formatDateTime(found.lastCheckAt)} · {timeAgo(found.lastCheckAt)}
              </Text>
            </View>
          </Notice>
          <Field label="Posición donde está realmente" hint="Si difiere de la registrada, se corrige sola.">
            <Select
              full
              value={positionId ?? found.location?.positionId ?? null}
              onChange={setPositionId}
              placeholder="Mantener la registrada"
              options={positions.map((p) => ({
                value: p.id,
                label: `${state.zones.find((z) => z.id === p.zoneId)?.name ?? ''} · ${p.code}`,
              }))}
              title="Posición"
              searchable
            />
          </Field>
        </>
      ) : ref.length > 2 ? (
        <Notice tone="warn">Sin coincidencias. Comprueba la matrícula o los 8 últimos del bastidor.</Notice>
      ) : null}

      {feedback ? <Notice>{feedback}</Notice> : null}

      <Muted>
        Se registra automáticamente: vehículo, ubicación comprobada, fecha, hora y usuario ({userName(state, count.responsibleId)}).
      </Muted>
    </Modal>
  );
}
