import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Field,
  H1,
  Input,
  Modal,
  Muted,
  Notice,
  Panel,
  Pill,
  Screen,
  Spacer,
  radius,
  space,
  useTheme,
} from '@/ui';
import { useStore } from '@/data/store';
import { deadlineOf, myTransfers } from '@/data/selectors';
import { formatDateTime, locationLabel, timeAgo, vehicleName, vehicleRef } from '@/data/format';
import type { ServiceRequest, Vehicle } from '@/data/types';
import { ScreenGuard } from '@/features/common/Guard';
import { DeadlineChip } from '@/features/common/DeadlineChip';
import { capturePhoto } from '@/features/actions/photos';

/**
 * Pantalla del transportista externo.
 *
 * Deliberadamente mínima: solo sus traslados asignados y un botón por
 * traslado. Nada de flota, campas ni menús. El botón cambia según dónde
 * esté el viaje, así que siempre hay una sola cosa que pulsar.
 */
export default function MyTransfersScreen() {
  const { state, user } = useStore();
  const [toast, setToast] = useState<string | null>(null);

  const transfers = myTransfers(state, user?.id ?? '');

  return (
    <ScreenGuard href="/mis-traslados" title="Mis traslados">
      <Screen>
        {/* Flujo pensado para el móvil: en un monitor grande se acota para
            que las tarjetas y los botones no queden desproporcionados. */}
        <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        <H1>Mis traslados</H1>
        <Muted>
          {transfers.length === 0
            ? 'No tienes traslados asignados ahora mismo.'
            : `Tienes ${transfers.length} ${transfers.length === 1 ? 'traslado pendiente' : 'traslados pendientes'}, ordenados por recorrido.`}
        </Muted>

        {toast ? <Notice>{toast}</Notice> : null}

        <Spacer />

        {transfers.length === 0 ? (
          <Panel>
            <Muted>
              Cuando logística te asigne un traslado aparecerá aquí. Puedes cerrar la app: te llegará un
              aviso.
            </Muted>
          </Panel>
        ) : (
          transfers.map((r) => <TransferCard key={r.id} request={r} onDone={setToast} />)
        )}

        <Spacer h={space.lg} />
        <Muted>
          Si no tienes cobertura puedes trabajar igual: lo que marques se guarda en el móvil y se envía solo
          al recuperar la señal.
        </Muted>
        </View>
      </Screen>
    </ScreenGuard>
  );
}

function TransferCard({ request, onDone }: { request: ServiceRequest; onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const [problemOpen, setProblemOpen] = useState(false);

  const vehicle = state.vehicles.find((v) => v.id === request.vehicleId);
  const enRuta = request.status === 'en_ruta';
  const plazo = deadlineOf(state, request);

  const recoger = () => {
    run({ type: 'request.update', requestId: request.id, status: 'en_ruta' });
    onDone(`${vehicle ? vehicleRef(vehicle) : 'Vehículo'} marcado como recogido.`);
  };

  const entregar = () => {
    // El movimiento deja el vehículo en el destino y cierra la solicitud.
    run({
      type: 'movement.register',
      vehicleId: request.vehicleId,
      to: request.to ?? { siteId: request.siteId },
      completesTransfer: true,
      note: 'Entregado por el transportista',
    });
    onDone(`${vehicle ? vehicleRef(vehicle) : 'Vehículo'} entregado. ¡Gracias!`);
  };

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: enRuta ? c.primary : c.border,
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        padding: space.lg,
        marginBottom: space.md,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: c.text, flex: 1, minWidth: 140 }}>
          {vehicle ? vehicleRef(vehicle) : request.vehicleId}
        </Text>
        {enRuta ? <Pill tone="blue">En ruta</Pill> : <Pill tone="amber">Por recoger</Pill>}
        {request.urgent ? <Pill tone="red">Urgente</Pill> : null}
        <DeadlineChip deadline={plazo} compact />
      </View>
      <Text style={{ fontSize: 14, color: c.textMuted }}>{vehicle ? vehicleName(vehicle) : ''}</Text>

      <Spacer h={space.md} />

      <Leg label="RECOGER EN" value={locationLabel(state, request.from)} icon="📍" />
      <Leg label="ENTREGAR EN" value={locationLabel(state, request.to)} icon="🏁" />

      {request.note ? (
        <>
          <Spacer h={space.sm} />
          <Notice>{request.note}</Notice>
        </>
      ) : null}

      <Spacer h={space.md} />

      {/* Un solo botón: el que toca según dónde esté el viaje. */}
      <Btn variant="primary" full onPress={enRuta ? entregar : recoger}>
        {enRuta ? '✓ He entregado el vehículo' : '▶ He recogido el vehículo'}
      </Btn>
      {!enRuta ? (
        <>
          <Spacer h={space.xs} />
          <Muted>
            Al recoger las llaves empiezan a contar {state.config.transferDeadlineHours} h para entregarlo.
          </Muted>
        </>
      ) : null}

      <Spacer h={space.sm} />
      <Btn full onPress={() => setProblemOpen(true)}>
        ⚠ Tengo un problema
      </Btn>

      <Spacer h={space.sm} />
      <Text style={{ fontSize: 11, color: c.textFaint }}>
        Asignado {timeAgo(request.createdAt)} · {formatDateTime(request.createdAt)}
      </Text>

      {problemOpen && vehicle ? (
        <ProblemModal
          vehicle={vehicle}
          onClose={() => setProblemOpen(false)}
          onDone={(m) => {
            onDone(m);
            setProblemOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

function Leg({ label, value, icon }: { label: string; value: string; icon: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 }}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: c.textFaint }}>{label}</Text>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.text, marginTop: 2 }}>{value}</Text>
      </View>
    </View>
  );
}

/** Aviso rápido cuando el coche no está, no arranca o llega dañado. */
function ProblemModal({
  vehicle,
  onClose,
  onDone,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { run } = useStore();
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const enviar = () => {
    if (description.trim().length < 5) {
      setError('Cuéntanos brevemente qué pasa.');
      return;
    }
    run({
      type: 'incident.create',
      vehicleId: vehicle.id,
      incidentType: 'transporte',
      description: description.trim(),
      photos,
    });
    onDone('Aviso enviado a logística.');
  };

  return (
    <Modal
      visible
      onClose={onClose}
      title="⚠ Avisar de un problema"
      footer={
        <Btn variant="primary" full onPress={enviar}>
          Enviar aviso
        </Btn>
      }
    >
      <Muted>
        {vehicleName(vehicle)} · {vehicleRef(vehicle)}
      </Muted>
      <Spacer h={space.sm} />
      <Field label="¿Qué ha pasado?">
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Ej.: el coche no está en la plaza indicada"
          multiline
        />
      </Field>
      <Field label={`Fotos (${photos.length})`} hint="Opcional, pero ayuda mucho si hay un daño.">
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn
            small
            onPress={async () => {
              const uri = await capturePhoto('camera');
              if (uri) setPhotos((p) => [...p, uri]);
            }}
          >
            📷 Hacer foto
          </Btn>
        </View>
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Modal>
  );
}
