import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { campo, Btn, Field, H1, Input, Modal, Muted, Notice, Panel, Pill, ProgressBar, Screen, Select, Spacer, space, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { ReceptionDetails } from '@/features/reception/ReceptionDetails';
import { vehicleByRef } from '@/data/selectors';
import { formatDateTime, siteName, vehicleName, vehicleRef } from '@/data/format';
import type { Reception } from '@/data/types';
import { ScreenGuard } from '@/features/common/Guard';
import { BarcodeScanner } from '@/features/scan/BarcodeScanner';
import { CampoFotos } from '@/features/actions/CampoFotos';
import { NuevoVehiculoModal } from '@/features/actions/NuevoVehiculo';

/**
 * Descarga rápida de un camión.
 *
 * El objetivo es bajar 14 coches sin pelearse con la pantalla: identificar,
 * elegir plaza y siguiente. Nada de tablas ni de un modal por fila. La
 * gestión del albarán y el histórico se reúnen aquí también.
 */
export default function QuickReceptionScreen() {
  const { state, user } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const recepciones = state.receptions.filter((r) => !user?.siteIds.length || user.siteIds.includes(r.siteId));
  const abiertas = recepciones.filter((r) => !r.closedAt);
  const reception = recepciones.find((r) => r.id === selectedId) ?? abiertas[0] ?? recepciones[0];

  return (
    <ScreenGuard href="/mi-recepcion" title="Descargar camión">
      <Screen>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <H1>Descargar camión</H1>

          {toast ? <Notice>{toast}</Notice> : null}

          <Muted>Descarga, albarán, vehículos y daños del camión en un mismo sitio.</Muted>
          <Spacer />
          {recepciones.length > 0 ? <Field label="Camión e histórico">
            <Select full title="Camión e histórico" value={reception?.id} onChange={setSelectedId}
              options={recepciones.map((r) => ({ value: r.id,
                label: `${r.truckPlate} · ${siteName(state, r.siteId)}`,
                hint: `${r.closedAt ? 'Cerrado' : 'En descarga'} · ${r.carrier} · ${formatDateTime(r.arrivedAt)}` }))} />
          </Field> : null}
          {!reception ? (
            <>
              <Muted>No hay ningún camión en descarga.</Muted>
              <Spacer />
              <Btn variant="primary" full onPress={() => setNewOpen(true)}>
                🚚 Empezar un camión
              </Btn>
            </>
          ) : reception.closedAt ? (
            <>
              <Notice>Camión cerrado el {formatDateTime(reception.closedAt)}.</Notice>
              <Btn full onPress={() => setNewOpen(true)}>🚚 Empezar un camión</Btn>
            </>
          ) : (
            <UnloadFlow
              key={reception.id}
              reception={reception}
              onDone={setToast}
              onSwitch={setSelectedId}
              onNew={() => setNewOpen(true)}
            />
          )}
          {reception ? <><Spacer /><ReceptionDetails key={reception.id} reception={reception} onDone={setToast} /></> : null}
        </View>

        <NewTruckModal
          visible={newOpen}
          onClose={() => setNewOpen(false)}
          onDone={(m, id) => {
            setToast(m);
            setSelectedId(id);
            setNewOpen(false);
          }}
        />
      </Screen>
    </ScreenGuard>
  );
}

/* ------------------------------------------------------ bucle de descarga */

function UnloadFlow({
  reception,
  onDone,
  onSwitch,
  onNew,
}: {
  reception: Reception;
  onDone: (m: string) => void;
  onSwitch?: (id: string) => void;
  onNew: () => void;
}) {
  const { state, run } = useStore();
  const { c } = useTheme();

  const [ref, setRef] = useState('');
  const [altaOpen, setAltaOpen] = useState(false);
  // Se propone la primera zona QUE TENGA HUECO, no la primera a secas: si
  // no, en una campa con la primera tejavana llena no se puede ni empezar.
  const [zoneId, setZoneId] = useState<string>(() => {
    const ocupadasIni = new Set(
      state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as string[]
    );
    const delSitio = state.zones.filter((z) => z.siteId === reception.siteId);
    const conHueco = delSitio.find((z) => {
      const plazas = state.positions.filter((pos) => pos.zoneId === z.id);
      return plazas.length === 0 || plazas.some((pos) => !ocupadasIni.has(pos.id));
    });
    return (conHueco ?? delSitio[0])?.id ?? '';
  });
  const [positionId, setPositionId] = useState<string | null>(null);
  const [damageOpen, setDamageOpen] = useState(false);

  const descargados = reception.lines.filter((l) => l.unloaded).length;
  const total = reception.lines.length;

  const zones = state.zones.filter((z) => z.siteId === reception.siteId);
  const ocupadas = useMemo(
    () => new Set(state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as string[]),
    [state.vehicles]
  );
  const libres = useMemo(
    () => state.positions.filter((p) => p.zoneId === zoneId && !ocupadas.has(p.id)),
    [state.positions, zoneId, ocupadas]
  );

  // La siguiente plaza libre se propone sola: es lo que se hace el 90 % de las veces.
  const propuesta = positionId === '__sin_plaza__' ? null : positionId ?? libres[0]?.id ?? null;

  const plazasDe = (id: string) => state.positions.filter((pos) => pos.zoneId === id);
  const librasDe = (id: string) => plazasDe(id).filter((pos) => !ocupadas.has(pos.id)).length;
  const sinPlazas = (id: string) => plazasDe(id).length === 0;
  const siguienteConHueco = zones.find((z) => z.id !== zoneId && (sinPlazas(z.id) || librasDe(z.id) > 0));
  const encontrado = vehicleByRef(state, ref);

  const descargar = (damage: string | null, photos: string[] = []) => {
    const clean = ref.trim().toUpperCase();
    if (!clean || !zoneId) return;
    run({
      type: 'reception.line',
      receptionId: reception.id,
      ref: clean,
      unloaded: true,
      positionId: propuesta,
      zoneId,
      damage,
      photos,
    });
    const plaza = state.positions.find((p) => p.id === propuesta);
    onDone(`${clean} → ${plaza?.code ?? zones.find(z => z.id === zoneId)?.name ?? ''}${damage ? ' · con daños' : ''}`);
    setRef('');
    setPositionId(null);
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: campo.heading, fontWeight: '900', color: c.text, flex: 1 }}>
          🚚 {reception.truckPlate}
        </Text>
        <Pill tone={descargados === total && total > 0 ? 'ok' : 'amber'}>
          {descargados}/{total || '—'} descargados
        </Pill>
      </View>
      <Text style={{ fontSize: campo.small, color: c.textMuted }}>{reception.carrier}</Text>

      <Spacer h={space.sm} />
      <ProgressBar pct={total ? (descargados / total) * 100 : 0} />

      <Spacer h={space.lg} />

      <Panel title="Siguiente vehículo">
        <BarcodeScanner onScan={(v) => setRef(v.slice(-8).toUpperCase())} height={170} />
        <Spacer h={space.sm} />

        <Field label="Matrícula o VIN-8">
          <Input
            value={ref}
            onChangeText={setRef}
            placeholder="Escribe o escanea"
            autoCapitalize="characters"
          />
        </Field>

        {ref.length > 2 ? (
          encontrado ? (
            <Notice>
              {vehicleName(encontrado)} · {vehicleRef(encontrado)}
            </Notice>
          ) : (
            <>
              <Notice tone="warn">
                No está en el parque todavía. Puedes darlo de alta ahora con el bastidor —Quiter completará
                marca, modelo y comercial después— o descargarlo igual y que logística lo cuadre.
              </Notice>
              <Spacer h={space.sm} />
              <Btn full onPress={() => setAltaOpen(true)}>
                ➕ Dar de alta {ref.trim().toUpperCase()}
              </Btn>
            </>
          )
        ) : null}

        <Spacer h={space.sm} />

        <Field label="Zona">
          <Select
            full
            value={zoneId}
            onChange={(v) => {
              setZoneId(v);
              setPositionId(null);
            }}
            options={zones.map((z) => ({
              value: z.id,
              label: z.name,
              hint: state.positions.some((p) => p.zoneId === z.id) ? `${state.positions.filter((p) => p.zoneId === z.id && !ocupadas.has(p.id)).length} libres` : 'Sin plazas individuales',
            }))}
            title="Zona de descarga"
            searchable
          />
        </Field>

        <Field label="Plaza" hint="Opcional. Elige solo zona si no hay plazas individuales.">
          <Select
            full
            value={positionId === '__sin_plaza__' ? '__sin_plaza__' : propuesta}
            onChange={setPositionId}
            placeholder="Solo zona · sin plaza"
            options={[{ value: '__sin_plaza__', label: 'Solo zona · sin plaza' }, ...libres.map((p) => ({ value: p.id, label: p.code }))]}
            title="Plaza"
            searchable
          />
        </Field>

        {libres.length === 0 && state.positions.some(p => p.zoneId === zoneId) ? (
          <>
            <Notice tone="danger">Esta zona está llena.</Notice>
            {siguienteConHueco ? (
              <Btn full onPress={() => setZoneId(siguienteConHueco.id)}>
                Ir a {siguienteConHueco.name} · {sinPlazas(siguienteConHueco.id) ? 'sin plazas individuales' : `${librasDe(siguienteConHueco.id)} libres`}
              </Btn>
            ) : (
              <Notice tone="danger">No queda ni una plaza libre en esta sede.</Notice>
            )}
          </>
        ) : null}

        <Spacer h={space.sm} />

        <Btn
          variant="primary"
          full
          disabled={!ref.trim() || !zoneId}
          onPress={() => descargar(null)}
        >
          ✓ Descargado · siguiente
        </Btn>
        <Spacer h={space.sm} />
        <Btn full disabled={!ref.trim() || !zoneId} onPress={() => setDamageOpen(true)}>
          ⚠ Llega con daños
        </Btn>
      </Panel>

      <Spacer h={space.md} />

      {descargados > 0 ? (
        <Panel title={`Ya descargados (${descargados})`}>
          {reception.lines
            .filter((l) => l.unloaded)
            .slice(-6)
            .reverse()
            .map((l) => {
              const pos = state.positions.find((p) => p.id === l.positionId);
              const zone = state.zones.find((z) => z.id === l.zoneId || z.id === pos?.zoneId);
              return (
                <View
                  key={l.ref}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: c.borderSoft,
                  }}
                >
                  <Text style={{ fontSize: campo.body, fontWeight: '700', color: c.text, flex: 1 }}>{l.ref}</Text>
                  {l.damage ? <Pill tone="red">Daños</Pill> : null}
                  <Text style={{ fontSize: campo.small, color: c.textMuted }}>{pos?.code ?? zone?.name ?? '—'}</Text>
                </View>
              );
            })}
          {descargados > 6 ? <Muted>… y {descargados - 6} más.</Muted> : null}
        </Panel>
      ) : null}

      <Spacer h={space.md} />

      <Btn
        full
        onPress={() => {
          run({ type: 'reception.close', receptionId: reception.id });
          onSwitch?.('');
          onDone(`Camión ${reception.truckPlate} cerrado.`);
        }}
      >
        Cerrar este camión
      </Btn>
      <Spacer h={space.sm} />
      <Btn full variant="ghost" onPress={onNew}>
        🚚 Empezar otro camión
      </Btn>

      <DamageModal
        visible={damageOpen}
        refText={ref}
        onClose={() => setDamageOpen(false)}
        onConfirm={(damage, photos) => {
          descargar(damage, photos);
          setDamageOpen(false);
        }}
      />

      {/* Alta al vuelo: el coche baja del camión y no está en el parque.
          Se registra el bastidor y se sigue descargando; la línea del
          albarán queda enlazada al vehículo nuevo sin hacer nada más. */}
      <NuevoVehiculoModal
        visible={altaOpen}
        refInicial={ref.trim().toUpperCase()}
        onClose={() => setAltaOpen(false)}
        onDone={(m) => onDone(m)}
      />
    </>
  );
}

/* ------------------------------------------------------------- daños */

function DamageModal({
  visible,
  refText,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  refText: string;
  onClose: () => void;
  onConfirm: (damage: string, photos: string[]) => void;
}) {
  const [damage, setDamage] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={`⚠ Daños en ${refText.toUpperCase()}`}
      footer={
        <Btn
          variant="primary"
          full
          disabled={damage.trim().length < 4}
          onPress={() => {
            onConfirm(damage.trim(), photos);
            setDamage('');
            setPhotos([]);
          }}
        >
          Registrar y descargar
        </Btn>
      }
    >
      <Field label="Qué le pasa">
        <Input value={damage} onChangeText={setDamage} placeholder="Ej.: golpe en paragolpes trasero" multiline />
      </Field>
      <CampoFotos
        fotos={photos}
        onChange={setPhotos}
        hint="Importante: es la prueba para reclamar al transportista."
      />
    </Modal>
  );
}

/* ------------------------------------------------------------ camión */

function NewTruckModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (m: string, id: string) => void;
}) {
  const { state, run, user } = useStore();
  const sedes = state.sites.filter((s) => !user?.siteIds.length || user.siteIds.includes(s.id));
  const [truckPlate, setTruckPlate] = useState('');
  const [carrier, setCarrier] = useState('');
  const [siteId, setSiteId] = useState(sedes[0]?.id ?? '');

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="🚚 Empezar un camión"
      footer={
        <Btn
          variant="primary"
          full
          onPress={() => {
            const cmd = run({
              type: 'reception.create',
              truckPlate: truckPlate.trim().toUpperCase() || 'SIN MATRÍCULA',
              carrier: carrier.trim() || 'Transportista',
              siteId,
            });
            onDone('Camión abierto. Ya puedes descargar.', `rec-${cmd.id}`);
            setTruckPlate('');
            setCarrier('');
          }}
        >
          Empezar descarga
        </Btn>
      }
    >
      <Field label="Matrícula del camión">
        <Input value={truckPlate} onChangeText={setTruckPlate} placeholder="9876 JKL" autoCapitalize="characters" />
      </Field>
      <Field label="Transportista">
        <Input value={carrier} onChangeText={setCarrier} placeholder="Transportista Norte" />
      </Field>
      <Field label="Sede">
        <Select
          full
          value={siteId}
          onChange={setSiteId}
          options={sedes.map((s) => ({ value: s.id, label: s.name }))}
          title="Sede de descarga"
        />
      </Field>
    </Modal>
  );
}
