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
  Segmented,
  Spacer,
  radius,
  space,
  useTheme,
} from '@/ui';
import { useStore } from '@/data/store';
import {
  carrierName,
  deadlineOf,
  myTransfers,
  resumenTransporte,
  trasladosHechos,
} from '@/data/selectors';
import { formatDateTime, locationLabel, timeAgo, vehicleName, vehicleRef } from '@/data/format';
import type { ServiceRequest, Vehicle } from '@/data/types';
import { ScreenGuard } from '@/features/common/Guard';
import { DeadlineChip } from '@/features/common/DeadlineChip';
import { CampoFotos } from '@/features/actions/CampoFotos';

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
  const [pestana, setPestana] = useState<'pendientes' | 'hechos'>('pendientes');

  const transfers = myTransfers(state, user?.id ?? '');
  // Lo que ya ha hecho: los suyos y los de su empresa. Un traslado terminado
  // desaparecía de aquí y no volvía a verse; es su registro de trabajo.
  const hechos = trasladosHechos(state, { carrierId: user?.carrierId ?? null });
  const resumen = resumenTransporte(hechos);

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

        <Segmented
          value={pestana}
          onChange={(v) => setPestana(v as 'pendientes' | 'hechos')}
          options={[
            { value: 'pendientes', label: `Por hacer · ${transfers.length}` },
            { value: 'hechos', label: `Hechos · ${hechos.length}` },
          ]}
        />

        <Spacer />

        {pestana === 'pendientes' ? (
          transfers.length === 0 ? (
            <Panel>
              <Muted>
                Cuando logística te asigne un traslado aparecerá aquí. Puedes cerrar la app: te llegará un
                aviso.
              </Muted>
            </Panel>
          ) : (
            transfers.map((r) => <TransferCard key={r.id} request={r} onDone={setToast} />)
          )
        ) : (
          <Hechos hechos={hechos} resumen={resumen} />
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
    onDone(
      `${vehicle ? vehicleRef(vehicle) : 'Vehículo'} · llaves recogidas. Empiezan las ${state.config.transferDeadlineHours} h.`
    );
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
        {enRuta ? <Pill tone="blue">En ruta</Pill> : <Pill tone="amber">Llaves sin recoger</Pill>}
        {request.urgent ? <Pill tone="red">Urgente</Pill> : null}
        <DeadlineChip deadline={plazo} compact />
      </View>
      <Text style={{ fontSize: 14, color: c.textMuted }}>{vehicle ? vehicleName(vehicle) : ''}</Text>

      <Spacer h={space.md} />

      <Leg label="RECOGER EN" value={locationLabel(state, request.from)} icon="📍" />
      <Leg label="ENTREGAR EN" value={locationLabel(state, request.to)} icon="🏁" />
      {request.carrierId ? (
        <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
          Encargado a {carrierName(state, request.carrierId)}
        </Text>
      ) : null}

      {request.note ? (
        <>
          <Spacer h={space.sm} />
          <Notice>{request.note}</Notice>
        </>
      ) : null}

      <Spacer h={space.md} />

      {/* Un solo botón: el que toca según dónde esté el viaje. Se habla de
          llaves y no de vehículo porque es lo que arranca el plazo: el
          transportista pasa por la oficina, coge las llaves y desde ahí
          cuentan las horas, aunque cargue el coche más tarde. */}
      <Btn variant="primary" full onPress={enRuta ? entregar : recoger}>
        {enRuta ? '✓ He entregado el vehículo' : '🔑 He recogido las llaves'}
      </Btn>
      <Spacer h={space.xs} />
      {enRuta ? (
        <Muted>
          🔑 Llaves recogidas {request.pickedUpAt ? formatDateTime(request.pickedUpAt) : '—'}.
        </Muted>
      ) : (
        <Muted>
          Al recogerlas empiezan a contar {state.config.transferDeadlineHours} h para entregarlo.
        </Muted>
      )}

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
      <CampoFotos fotos={photos} onChange={setPhotos} hint="Opcional, pero ayuda mucho si hay un daño." />
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Modal>
  );
}

/**
 * Lo que ya ha hecho este transportista.
 *
 * Sirve para lo mismo a los dos lados: él tiene su parte de trabajo por
 * escrito y Urkiola ve lo mismo que ve él, sin versiones distintas de la
 * misma semana.
 */
function Hechos({
  hechos,
  resumen,
}: {
  hechos: ReturnType<typeof trasladosHechos>;
  resumen: ReturnType<typeof resumenTransporte>;
}) {
  const { state } = useStore();
  const { c } = useTheme();

  if (hechos.length === 0) {
    return (
      <Panel>
        <Muted>Todavía no hay traslados terminados a tu nombre.</Muted>
      </Panel>
    );
  }

  return (
    <>
      <Panel title="Resumen">
        <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
          <Dato label="Traslados" valor={String(resumen.total)} />
          <Dato label="En plazo" valor={`${resumen.enPlazo} de ${resumen.total}`} />
          <Dato
            label="Tiempo medio"
            valor={resumen.horasMedia === null ? '—' : `${Math.round(resumen.horasMedia)} h`}
          />
        </View>
      </Panel>

      <Spacer h={space.md} />

      {hechos.map(({ request, vehicle, horas, fueraDePlazo }) => (
        <View
          key={request.id}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: radius.md,
            padding: 12,
            marginBottom: space.sm,
            gap: 3,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: c.text, flex: 1, minWidth: 120 }}>
              {vehicle ? vehicleRef(vehicle) : request.vehicleId}
            </Text>
            {fueraDePlazo ? <Pill tone="red">Fuera de plazo</Pill> : <Pill tone="ok">En plazo</Pill>}
          </View>
          <Text style={{ fontSize: 12, color: c.textMuted }}>
            {vehicle ? vehicleName(vehicle) : ''}
          </Text>
          <Text style={{ fontSize: 12, color: c.text }}>
            {locationLabel(state, request.from, true)} → {locationLabel(state, request.to, true)}
          </Text>
          <Text style={{ fontSize: 11, color: c.textFaint }}>
            🔑 {request.pickedUpAt ? formatDateTime(request.pickedUpAt) : 'Sin recogida apuntada'} · 🏁{' '}
            {request.deliveredAt ? formatDateTime(request.deliveredAt) : 'Sin entrega apuntada'}
            {horas === null ? '' : ` · ${Math.round(horas)} h`}
          </Text>
        </View>
      ))}
    </>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  const { c } = useTheme();
  return (
    <View style={{ minWidth: 90 }}>
      <Text style={{ fontSize: 9, fontWeight: '800', color: c.textFaint }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 18, fontWeight: '900', color: c.text, marginTop: 2 }}>{valor}</Text>
    </View>
  );
}
