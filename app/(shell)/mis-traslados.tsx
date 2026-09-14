import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { campo, Btn, Field, H1, Input, Modal, Muted, Notice, Panel, Pill, Screen, Segmented, Select, Spacer, radius, space, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import {
  carrierName,
  agruparTrasladosPorTrayecto,
  deadlineOf,
  mesesConEntregas,
  misTrasladosPorFase,
  nombreDeMes,
  resumenTransporte,
  trasladosHechos,
} from '@/data/selectors';
import { formatDateTime, siteName, locationLabel, timeAgo, vehicleName, vehicleRef } from '@/data/format';
import { DELAY_REASON_LABEL, type DelayReason, type ServiceRequest, type Vehicle } from '@/data/types';
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
type Fase = 'porRecoger' | 'recogidos' | 'entregados';

const TODOS_LOS_MESES = '__todos__';

export default function MyTransfersScreen() {
  const { state, user } = useStore();
  const [toast, setToast] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Fase>('porRecoger');

  // Las tres fases del viaje, que son tres trabajos distintos: ir a por las
  // llaves, llevar el coche y lo que ya está entregado.
  const { porRecoger, recogidos } = misTrasladosPorFase(state, user?.id ?? '');
  // Lo entregado: lo suyo y lo de su empresa. Un traslado terminado
  // desaparecía de aquí y no volvía a verse; es su registro de trabajo.
  const hechos = trasladosHechos(state, { carrierId: user?.carrierId ?? null });

  return (
    <ScreenGuard href="/mis-traslados" title="Mis traslados">
      <Screen>
        {/* Flujo pensado para el móvil: en un monitor grande se acota para
            que las tarjetas y los botones no queden desproporcionados. */}
        <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        <H1>Mis traslados</H1>
        <Muted>
          {porRecoger.length + recogidos.length === 0
            ? 'No tienes traslados pendientes ahora mismo.'
            : `Tienes ${recogidos.length} ${recogidos.length === 1 ? 'coche encima' : 'coches encima'} y ${porRecoger.length} por recoger.`}
        </Muted>

        {toast ? <Notice>{toast}</Notice> : null}

        <Spacer />

        <Segmented
          value={pestana}
          onChange={(v) => setPestana(v as Fase)}
          options={[
            { value: 'porRecoger', label: `🔑 Por recoger · ${porRecoger.length}` },
            { value: 'recogidos', label: `🚚 Los llevo yo · ${recogidos.length}` },
            { value: 'entregados', label: `✓ Entregados · ${hechos.length}` },
          ]}
        />

        <Spacer />

        {pestana === 'porRecoger' ? (
          porRecoger.length === 0 ? (
            <Panel>
              <Muted>
                Nada por recoger. Cuando logística te asigne un traslado aparecerá aquí; puedes cerrar la
                app, que te llegará un aviso.
              </Muted>
            </Panel>
          ) : (
            <Trayectos key="recoger" solicitudes={porRecoger} onDone={setToast} />
          )
        ) : pestana === 'recogidos' ? (
          recogidos.length === 0 ? (
            <Panel>
              <Muted>
                No llevas ningún coche encima ahora mismo. Los que recojas aparecerán aquí hasta que los
                entregues.
              </Muted>
            </Panel>
          ) : (
            <Trayectos key="recogidos" solicitudes={recogidos} onDone={setToast} />
          )
        ) : (
          <Entregados hechos={hechos} />
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

/** Los grupos parten de la lista autorizada y conservan su orden de urgencia. */
function Trayectos({ solicitudes, onDone }: { solicitudes: ServiceRequest[]; onDone: (m: string) => void }) {
  const { state } = useStore();
  const [ruta, setRuta] = useState('__todas__');
  const grupos = agruparTrasladosPorTrayecto(solicitudes);
  const elegida = grupos.some((g) => g.id === ruta) ? ruta : '__todas__';
  const nombre = (g: typeof grupos[number]) =>
    `${g.origen ? siteName(state, g.origen) : 'Origen sin indicar'} → ${g.destino ? siteName(state, g.destino) : 'Destino sin indicar'}`;
  return <>
    <Panel title="Organizar por trayecto">
      <Muted>Vehículos agrupados por recogida y entrega para organizar la carga del camión.</Muted>
      <Spacer h={space.sm} />
      <Select full title="Trayecto" value={elegida} onChange={setRuta} options={[
        { value: '__todas__', label: `Todos los trayectos · ${solicitudes.length} coches` },
        ...grupos.map((g) => ({ value: g.id, label: `${nombre(g)} · ${g.solicitudes.length} coches` })),
      ]} />
    </Panel>
    <Spacer />
    {grupos.filter((g) => elegida === '__todas__' || g.id === elegida).map((g) => (
      <View key={g.id} testID="grupo-trayecto">
        <Panel title={nombre(g)}>
          <Muted>{g.solicitudes.length} {g.solicitudes.length === 1 ? 'coche' : 'coches'} · {g.solicitudes.filter((r) => r.urgent).length} urgentes</Muted>
        </Panel>
        <Spacer h={space.sm} />
        {g.solicitudes.map((r) => <TransferCard key={r.id} request={r} onDone={onDone} />)}
      </View>
    ))}
  </>;
}

function TransferCard({ request, onDone }: { request: ServiceRequest; onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const [problemOpen, setProblemOpen] = useState(false);
  const [motivoOpen, setMotivoOpen] = useState(false);

  const vehicle = state.vehicles.find((v) => v.id === request.vehicleId);
  const enRuta = request.status === 'en_ruta';
  const plazo = deadlineOf(state, request);

  const recoger = () => {
    run({ type: 'request.update', requestId: request.id, status: 'en_ruta' });
    onDone(
      `${vehicle ? vehicleRef(vehicle) : 'Vehículo'} · llaves recogidas. Empiezan las ${state.config.transferDeadlineHours} h.`
    );
  };

  // Si se pasa del plazo se pregunta por qué, en el momento y con el coche
  // delante. Preguntarlo después es preguntarlo a la memoria de alguien.
  const tarde = !!request.dueAt && new Date(request.dueAt).getTime() < Date.now();

  const entregar = (delayReason?: DelayReason | null, delayNote?: string | null) => {
    // El movimiento deja el vehículo en el destino y cierra la solicitud.
    run({
      type: 'movement.register',
      vehicleId: request.vehicleId,
      to: request.to ?? { siteId: request.siteId },
      completesTransfer: true,
      note: 'Entregado por el transportista',
      delayReason: delayReason ?? null,
      delayNote: delayNote ?? null,
    });
    onDone(`${vehicle ? vehicleRef(vehicle) : 'Vehículo'} entregado. ¡Gracias!`);
    setMotivoOpen(false);
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
        <Text style={{ fontSize: campo.title, fontWeight: '900', color: c.text, flex: 1, minWidth: 140 }}>
          {vehicle ? vehicleRef(vehicle) : request.vehicleId}
        </Text>
        {enRuta ? <Pill tone="blue">En ruta</Pill> : <Pill tone="amber">Llaves sin recoger</Pill>}
        {request.urgent ? <Pill tone="red">Urgente</Pill> : null}
        <DeadlineChip deadline={plazo} compact />
      </View>
      <Text style={{ fontSize: campo.body, color: c.textMuted }}>{vehicle ? vehicleName(vehicle) : ''}</Text>

      <Spacer h={space.md} />

      <Leg label="RECOGER EN" value={locationLabel(state, request.from)} icon="📍" />
      <Leg label="ENTREGAR EN" value={locationLabel(state, request.to)} icon="🏁" />
      {request.carrierId ? (
        <Text style={{ fontSize: campo.micro, color: c.textFaint, marginTop: 4 }}>
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
      <Btn
        variant="primary"
        full
        onPress={enRuta ? (tarde ? () => setMotivoOpen(true) : () => entregar()) : recoger}
      >
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
      <Text style={{ fontSize: campo.micro, color: c.textFaint }}>
        Asignado {timeAgo(request.createdAt)} · {formatDateTime(request.createdAt)}
      </Text>

      {motivoOpen ? (
        <MotivoRetrasoModal
          onClose={() => setMotivoOpen(false)}
          onConfirm={(motivo, nota) => entregar(motivo, nota)}
        />
      ) : null}

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
      <Text style={{ fontSize: campo.strong }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: campo.label, fontWeight: '800', color: c.textFaint }}>{label}</Text>
        <Text style={{ fontSize: campo.strong, fontWeight: '600', color: c.text, marginTop: 2 }}>{value}</Text>
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
 * Lo que ya ha entregado este transportista, mes a mes.
 *
 * El mes es la unidad en la que se habla con una empresa de transporte: «en
 * agosto me hiciste 14». Por eso se elige el mes y no un rango de días, y
 * por eso el resumen se recalcula con lo que hay dentro del mes elegido.
 *
 * Urkiola ve exactamente lo mismo en «Traslados hechos». A propósito: si
 * cada uno mira una lista distinta, la conversación se convierte en
 * discutir cuál de las dos vale.
 */
function Entregados({ hechos }: { hechos: ReturnType<typeof trasladosHechos> }) {
  const { state } = useStore();
  const { c } = useTheme();
  const meses = mesesConEntregas(hechos);
  const [mes, setMes] = useState<string>(TODOS_LOS_MESES);

  const lista = mes === TODOS_LOS_MESES ? hechos : hechos.filter((h) => h.request.deliveredAt?.startsWith(mes));
  const resumen = resumenTransporte(lista);

  if (hechos.length === 0) {
    return (
      <Panel>
        <Muted>Todavía no has entregado ningún traslado.</Muted>
      </Panel>
    );
  }

  return (
    <>
      <Panel>
        <Select
          full
          value={mes}
          onChange={setMes}
          title="Mes"
          options={[
            { value: TODOS_LOS_MESES, label: `Todos los meses · ${hechos.length}` },
            ...meses.map((m) => ({
              value: m,
              label: `${nombreDeMes(m)} · ${hechos.filter((h) => h.request.deliveredAt?.startsWith(m)).length}`,
            })),
          ]}
        />
      </Panel>

      <Spacer h={space.md} />

      <Panel title={mes === TODOS_LOS_MESES ? 'Todo lo entregado' : nombreDeMes(mes)}>
        <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
          <Dato label="Entregados" valor={String(resumen.total)} />
          <Dato label="En plazo" valor={`${resumen.enPlazo} de ${resumen.total}`} />
          <Dato
            label="Tiempo medio"
            valor={resumen.horasMedia === null ? '—' : `${Math.round(resumen.horasMedia)} h`}
          />
        </View>
      </Panel>

      <Spacer h={space.md} />

      {lista.length === 0 ? (
        <Panel>
          <Muted>Ese mes no entregaste ningún coche.</Muted>
        </Panel>
      ) : (
        lista.map(({ request, vehicle, horas, fueraDePlazo }) => (
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
              <Text style={{ fontSize: campo.strong, fontWeight: '800', color: c.text, flex: 1, minWidth: 120 }}>
                {vehicle ? vehicleRef(vehicle) : request.vehicleId}
              </Text>
              {fueraDePlazo ? <Pill tone="red">Fuera de plazo</Pill> : <Pill tone="ok">En plazo</Pill>}
            </View>
            <Text style={{ fontSize: campo.small, color: c.textMuted }}>{vehicle ? vehicleName(vehicle) : ''}</Text>
            <Text style={{ fontSize: campo.small, color: c.text }}>
              {locationLabel(state, request.from, true)} → {locationLabel(state, request.to, true)}
            </Text>
            <Text style={{ fontSize: campo.micro, color: c.textFaint }}>
              🔑 {request.pickedUpAt ? formatDateTime(request.pickedUpAt) : 'Sin recogida apuntada'} · 🏁{' '}
              {request.deliveredAt ? formatDateTime(request.deliveredAt) : 'Sin entrega apuntada'}
              {horas === null ? '' : ` · ${Math.round(horas)} h`}
            </Text>
            {fueraDePlazo && request.delayReason ? (
              <Text style={{ fontSize: campo.micro, color: c.amberFg }}>
                ⏱ {DELAY_REASON_LABEL[request.delayReason]}
                {request.delayNote ? ` · ${request.delayNote}` : ''}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  const { c } = useTheme();
  return (
    <View style={{ minWidth: 90 }}>
      <Text style={{ fontSize: campo.label, fontWeight: '800', color: c.textFaint }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: campo.heading, fontWeight: '900', color: c.text, marginTop: 2 }}>{valor}</Text>
    </View>
  );
}

/**
 * Por qué llega tarde.
 *
 * Solo sale cuando el traslado se ha pasado del plazo, y con el coche
 * todavía delante: preguntarlo al día siguiente es preguntarle a la memoria
 * de alguien. No bloquea la entrega —el coche está entregado igual— pero
 * pide un toque más, que es lo justo para que el dato exista.
 */
function MotivoRetrasoModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (motivo: DelayReason, nota: string | null) => void;
}) {
  const [motivo, setMotivo] = useState<DelayReason | null>(null);
  const [nota, setNota] = useState('');
  const { c } = useTheme();

  return (
    <Modal
      visible
      onClose={onClose}
      title="⏱ Ha llegado fuera de plazo"
      footer={
        <>
          <Btn
            variant="primary"
            full
            disabled={!motivo}
            onPress={() => motivo && onConfirm(motivo, nota.trim() || null)}
          >
            ✓ Entregar
          </Btn>
          <Spacer h={space.xs} />
          <Btn full onPress={onClose}>
            Cancelar
          </Btn>
        </>
      }
    >
      <Muted>
        Este traslado se ha pasado de las horas comprometidas. Marca por qué: no es para señalar a nadie,
        es para que se vea dónde se pierde el tiempo de verdad.
      </Muted>
      <Spacer h={space.md} />
      {(Object.keys(DELAY_REASON_LABEL) as DelayReason[]).map((k) => (
        <Btn
          key={k}
          full
          variant={motivo === k ? 'primary' : undefined}
          onPress={() => setMotivo(k)}
        >
          {DELAY_REASON_LABEL[k]}
        </Btn>
      ))}
      {motivo === 'otro' ? (
        <>
          <Spacer h={space.sm} />
          <Field label="¿Qué pasó?">
            <Input value={nota} onChangeText={setNota} placeholder="En dos palabras" />
          </Field>
        </>
      ) : null}
    </Modal>
  );
}
