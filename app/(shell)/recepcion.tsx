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
  Screen,
  Select,
  Spacer,
  Toolbar,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useStore } from '@/data/store';
import { formatDateTime, locationLabel, vehicleName } from '@/data/format';
import type { Reception, ReceptionLine } from '@/data/types';
import { capturePhoto } from '@/features/actions/photos';
import { Cell, useOpenVehicle } from '@/features/common/bits';

export default function ReceptionScreen() {
  const state = useAppState();
  const { run } = useStore();
  const { c } = useTheme();
  const openVehicle = useOpenVehicle();

  const [selectedId, setSelectedId] = useState<string>(state.receptions[0]?.id ?? '');
  const reception: Reception | undefined =
    state.receptions.find((r) => r.id === selectedId) ?? state.receptions[0];

  const [newOpen, setNewOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState<ReceptionLine | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const stats = useMemo(() => {
    const lines = reception?.lines ?? [];
    return {
      expected: lines.length,
      unloaded: lines.filter((l) => l.unloaded).length,
      damaged: lines.filter((l) => l.damage).length,
    };
  }, [reception]);

  const columns: Column<ReceptionLine>[] = [
    {
      key: 'ref',
      header: 'VIN-8 / matrícula',
      width: 150,
      primary: true,
      value: (l) => l.ref,
      filter: { type: 'text' },
      render: (l) => {
        const v = state.vehicles.find((x) => x.id === l.vehicleId);
        return (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '800', color: c.text }}>{l.ref}</Text>
            {v ? <Text style={{ fontSize: 11, color: c.textMuted }}>{vehicleName(v)}</Text> : null}
          </View>
        );
      },
    },
    {
      key: 'unloaded',
      header: 'Descarga',
      width: 110,
      value: (l) => (l.unloaded ? 'Descargado' : 'Pendiente'),
      filter: {
        type: 'select',
        options: [
          { value: 'Descargado', label: 'Descargado' },
          { value: 'Pendiente', label: 'Pendiente' },
        ],
      },
      render: (l) => (l.unloaded ? <Pill>✅ Descargado</Pill> : <Pill tone="amber">⏳ Pendiente</Pill>),
    },
    {
      key: 'damage',
      header: 'Daños',
      width: 190,
      value: (l) => l.damage ?? 'Sin daños',
      render: (l) =>
        l.damage ? (
          <View>
            <Text style={{ fontSize: 12, color: c.redFg }}>⚠️ {l.damage}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>{l.photos.length} fotos</Text>
          </View>
        ) : (
          <Cell muted>Sin daños</Cell>
        ),
    },
    {
      key: 'position',
      header: 'Ubicación',
      width: 170,
      value: (l) => (l.positionId ? locationLabel(state, { siteId: reception!.siteId, positionId: l.positionId }, true) : '—'),
      render: (l) => {
        const pos = state.positions.find((p) => p.id === l.positionId);
        const zone = state.zones.find((z) => z.id === pos?.zoneId);
        return <Cell muted={!pos}>{pos ? `${zone?.name} · ${pos.code}` : '—'}</Cell>;
      },
    },
    {
      key: 'actions',
      header: '',
      width: 110,
      render: (l) => (
        <Btn small onPress={() => setLineOpen(l)}>
          Gestionar
        </Btn>
      ),
    },
  ];

  return (
    <Screen>
      <H1>Recepción de camiones</H1>
      <Muted>Descarga, albarán, daños, fotos y ubicación inicial en campa.</Muted>

      {toast ? <Notice>{toast}</Notice> : null}

      <Toolbar>
        <Btn variant="primary" onPress={() => setNewOpen(true)}>
          + Nueva recepción
        </Btn>
        <Select
          value={reception?.id}
          onChange={setSelectedId}
          options={state.receptions.map((r) => ({
            value: r.id,
            label: `${r.truckPlate} · ${r.carrier}`,
            hint: r.closedAt ? 'Cerrada' : 'Abierta',
          }))}
          title="Camión"
        />
      </Toolbar>

      {!reception ? (
        <Panel>
          <Muted>No hay ninguna recepción registrada. Crea una para empezar a descargar.</Muted>
        </Panel>
      ) : (
        <>
          <Grid cols={4} minWidth={170}>
            <Kpi label="Camión activo" value={reception.truckPlate} hint={reception.carrier} />
            <Kpi label="Previstos" value={stats.expected} hint="vehículos" />
            <Kpi label="Descargados" value={stats.unloaded} hint="vehículos" />
            <Kpi
              label="Incidencias"
              value={stats.damaged}
              hint="con fotos"
              tone={stats.damaged > 0 ? 'red' : undefined}
            />
          </Grid>

          <Spacer h={space.lg} />

          <Panel title="Albarán y descarga">
            <Toolbar>
              <Btn
                variant="primary"
                onPress={async () => {
                  const uri = await capturePhoto('camera');
                  if (uri) {
                    run({ type: 'reception.albaran', receptionId: reception.id, uri });
                    setToast('Albarán adjuntado.');
                  }
                }}
              >
                📷 Adjuntar albarán
              </Btn>
              <Btn onPress={() => setToast(reception.albaranUri ? `Albarán: ${reception.albaranUri}` : 'Todavía no hay albarán adjunto.')}>
                Ver albarán
              </Btn>
              {!reception.closedAt ? (
                <Btn
                  onPress={() => {
                    run({ type: 'reception.close', receptionId: reception.id });
                    setToast('Recepción cerrada.');
                  }}
                >
                  ✓ Cerrar recepción
                </Btn>
              ) : (
                <Pill tone="neutral">Cerrada {formatDateTime(reception.closedAt)}</Pill>
              )}
            </Toolbar>

            <DataTable
              columns={columns}
              rows={reception.lines}
              keyExtractor={(l) => l.ref}
              onRowPress={(l) => (l.vehicleId ? openVehicle(l.vehicleId) : setLineOpen(l))}
              emptyText="Este camión aún no tiene líneas. Añade los vehículos del albarán."
            />

            <Spacer h={space.sm} />
            <AddLine receptionId={reception.id} onDone={setToast} />
          </Panel>
        </>
      )}

      <NewReceptionModal visible={newOpen} onClose={() => setNewOpen(false)} onDone={setToast} />
      {reception && lineOpen ? (
        <LineModal
          reception={reception}
          line={lineOpen}
          onClose={() => setLineOpen(null)}
          onDone={(m) => {
            setToast(m);
            setLineOpen(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function AddLine({ receptionId, onDone }: { receptionId: string; onDone: (m: string) => void }) {
  const { run } = useStore();
  const [ref, setRef] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <View style={{ flex: 1, minWidth: 200 }}>
        <Field label="Añadir vehículo del albarán">
          <Input value={ref} onChangeText={setRef} placeholder="VIN-8 o matrícula" autoCapitalize="characters" />
        </Field>
      </View>
      <View style={{ marginBottom: space.md }}>
        <Btn
          onPress={() => {
            if (!ref.trim()) return;
            run({ type: 'reception.line', receptionId, ref: ref.trim().toUpperCase() });
            onDone(`${ref.trim().toUpperCase()} añadido al albarán.`);
            setRef('');
          }}
        >
          Añadir
        </Btn>
      </View>
    </View>
  );
}

function NewReceptionModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const [truckPlate, setTruckPlate] = useState('');
  const [carrier, setCarrier] = useState('');
  const [siteId, setSiteId] = useState('sondika');

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="🚚 Nueva recepción"
      footer={
        <Btn
          variant="primary"
          full
          onPress={() => {
            run({
              type: 'reception.create',
              truckPlate: truckPlate.trim().toUpperCase() || 'SIN MATRÍCULA',
              carrier: carrier.trim() || 'Transportista',
              siteId,
            });
            onDone('Recepción creada.');
            setTruckPlate('');
            setCarrier('');
            onClose();
          }}
        >
          Crear recepción
        </Btn>
      }
    >
      <Field label="Matrícula del camión">
        <Input value={truckPlate} onChangeText={setTruckPlate} placeholder="9876 JKL" autoCapitalize="characters" />
      </Field>
      <Field label="Transportista">
        <Input value={carrier} onChangeText={setCarrier} placeholder="Transportista Norte" />
      </Field>
      <Field label="Sede de descarga">
        <Select
          full
          value={siteId}
          onChange={setSiteId}
          options={state.sites.map((s) => ({ value: s.id, label: s.name }))}
          title="Sede"
        />
      </Field>
    </Modal>
  );
}

function LineModal({
  reception,
  line,
  onClose,
  onDone,
}: {
  reception: Reception;
  line: ReceptionLine;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const [damage, setDamage] = useState(line.damage ?? '');
  const [positionId, setPositionId] = useState<string | null>(line.positionId);
  const [photos, setPhotos] = useState<string[]>(line.photos);

  const zones = state.zones.filter((z) => z.siteId === reception.siteId);
  const [zoneId, setZoneId] = useState<string>(
    state.positions.find((p) => p.id === line.positionId)?.zoneId ?? zones[0]?.id
  );
  const positions = state.positions.filter((p) => p.zoneId === zoneId);
  const occupied = new Set(state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as string[]);

  const save = (unloaded: boolean) => {
    run({
      type: 'reception.line',
      receptionId: reception.id,
      ref: line.ref,
      unloaded,
      damage: damage.trim() || null,
      positionId,
      photos,
    });
    onDone(unloaded ? `${line.ref} descargado.` : `${line.ref} actualizado.`);
  };

  return (
    <Modal
      visible
      onClose={onClose}
      title={`Descarga · ${line.ref}`}
      footer={
        <>
          <Btn variant="primary" full onPress={() => save(true)}>
            ✅ Marcar descargado
          </Btn>
          <Btn full onPress={() => save(false)}>
            Guardar sin descargar
          </Btn>
        </>
      }
    >
      <Field label="Zona de descarga">
        <Select
          full
          value={zoneId}
          onChange={(v) => {
            setZoneId(v);
            setPositionId(null);
          }}
          options={zones.map((z) => ({ value: z.id, label: z.name }))}
          title="Zona"
          searchable
        />
      </Field>
      <Field label="Posición">
        <Select
          full
          value={positionId}
          onChange={setPositionId}
          placeholder="Elegir plaza"
          options={positions.map((p) => ({
            value: p.id,
            label: p.code,
            hint: occupied.has(p.id) ? 'Ocupada' : 'Libre',
          }))}
          title="Posición"
          searchable
        />
      </Field>
      <Field label="Daños detectados" hint="Déjalo vacío si el vehículo llega sin daños.">
        <Input value={damage} onChangeText={setDamage} placeholder="Ej.: golpe paragolpes trasero" multiline />
      </Field>
      <Field label={`Fotos (${photos.length})`}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn
            small
            onPress={async () => {
              const uri = await capturePhoto('camera');
              if (uri) setPhotos((p) => [...p, uri]);
            }}
          >
            📷 Hacer foto
          </Btn>
          <Btn
            small
            onPress={async () => {
              const uri = await capturePhoto('library');
              if (uri) setPhotos((p) => [...p, uri]);
            }}
          >
            🖼️ Galería
          </Btn>
        </View>
      </Field>
      <Notice>
        Al marcar el vehículo como descargado con una plaza asignada, entra en campa y queda comprobado
        físicamente con fecha, hora y usuario.
      </Notice>
    </Modal>
  );
}
