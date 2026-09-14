import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { campo, Btn, Field, H1, Modal, Muted, Notice, Panel, Pill, ProgressBar, Screen, Select, Spacer, radius, space, useTheme } from '@/ui';
import { useStore, useTicker } from '@/data/store';
import { activePreparations, deadlineOf, prepRequestsSinAbrir } from '@/data/selectors';
import { idCreadoPor, prepElapsedMs, prepIsOverSla, prepProgress } from '@/data/commands';
import { formatDate, formatDuration, formatShortDuration, siteName, userName, vehicleName, vehicleRef } from '@/data/format';
import type { CheckState, Preparation, ServiceRequest } from '@/data/types';
import { ScreenGuard, usePerms } from '@/features/common/Guard';
import { DeadlineChip } from '@/features/common/DeadlineChip';
import { FinishPrepModal } from '@/features/prep/FinishPrep';
import { CampanaCheck } from '@/features/prep/CampanaCheck';
import { UbicacionVehiculo } from '@/features/common/Ubicacion';

/**
 * Pantalla de trabajo del preparador.
 *
 * Pensada para hacerlo rápido y con una mano: la cola ordenada por plazo,
 * y al abrir una preparación, el checklist a un toque por línea. La versión
 * completa, con fases y tres estados por requisito, sigue estando en la web.
 */
export default function MyPrepScreen() {
  const { state, user } = useStore();
  const { c } = useTheme();
  const now = useTicker(1000);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const mias = useMemo(() => {
    const inScope = (siteId: string) =>
      !user || user.siteIds.length === 0 || user.siteIds.includes(siteId);
    const requestOf = (p: Preparation) =>
      state.requests.find((r) => r.type === 'preparacion' && r.vehicleId === p.vehicleId && (r.status !== 'terminada' && r.status !== 'cancelada')
        && r.siteId === p.siteId && (r.prepTipo ?? 'entrada') === (p.tipo ?? 'entrada'));

    return activePreparations(state)
      .filter((p) => (p.preparerId === user?.id || !p.preparerId) && inScope(p.siteId))
      .sort((a, b) => {
        // Primero lo vencido, luego lo que se sale del objetivo, luego lo demás.
        const plazo = (p: Preparation) => {
          const r = requestOf(p);
          return r && deadlineOf(state, r, now).overdue ? 0 : 1;
        };
        const sla = (p: Preparation) => (prepIsOverSla(p, now) ? 0 : 1);
        return plazo(a) - plazo(b) || sla(a) - sla(b) || b.effectiveMs - a.effectiveMs;
      });
  }, [state, user, now]);

  // Lo que ha pedido el comercial y todavía no ha abierto nadie. Sin esto,
  // la solicitud se queda en la oficina y el preparador no se entera.
  const pedidas = useMemo(
    () => prepRequestsSinAbrir(state, user?.id ?? '', now),
    [state, user, now]
  );

  const total = mias.length + pedidas.length;
  const abierta = openId ? state.preparations.find((p) => p.id === openId) ?? null : null;

  return (
    <ScreenGuard href="/mi-preparacion" title="Mi preparación">
      <Screen>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <H1>Mi preparación</H1>
          <Muted>
            {total === 0
              ? 'No tienes preparaciones pendientes.'
              : `${total} ${total === 1 ? 'vehículo' : 'vehículos'} por preparar, lo más urgente arriba.`}
          </Muted>

          {toast ? <Notice>{toast}</Notice> : null}
          <Spacer />

          {total === 0 ? (
            <Panel>
              <Muted>
                Cuando te asignen una preparación aparecerá aquí. Mientras tanto puedes buscar un vehículo
                por matrícula desde Flota.
              </Muted>
            </Panel>
          ) : (
            <>
              {(['entrada', 'repaso'] as const).map((tipo) => {
                const solicitudes = pedidas.filter((r) => (r.prepTipo ?? 'entrada') === tipo);
                const trabajos = mias.filter((p) => (p.tipo ?? 'entrada') === tipo);
                return <View key={tipo}>
                  <Text style={{ fontSize: campo.strong, fontWeight: '700', color: c.text, marginVertical: space.sm }}>
                    {tipo === 'repaso' ? 'Repasos de entrega' : 'Preparaciones completas'} · {solicitudes.length + trabajos.length}
                  </Text>
                  {solicitudes.map((r) => <PedidaCard key={r.id} request={r} onAbierta={setOpenId} />)}
                  {trabajos.map((p) => <PrepCard key={p.id} prep={p} onOpen={() => setOpenId(p.id)} />)}
                  {!solicitudes.length && !trabajos.length ? <Muted>Sin trabajos pendientes de este servicio.</Muted> : null}
                </View>;
              })}
            </>
          )}
        </View>

        {abierta ? (
          <WorkModal
            prep={abierta}
            onClose={() => setOpenId(null)}
            onDone={(m) => {
              setToast(m);
              setOpenId(null);
            }}
          />
        ) : null}
      </Screen>
    </ScreenGuard>
  );
}

/* --------------------------------------------------------------- cola */

/**
 * Preparación pedida por el comercial y aún sin abrir.
 *
 * Al empezarla se abre la preparación y arranca el cronómetro en el mismo
 * gesto: para el preparador es un botón, no dos pasos con una oficina en
 * medio.
 */
function PedidaCard({
  request,
  onAbierta,
}: {
  request: ServiceRequest;
  onAbierta: (prepId: string) => void;
}) {
  const { state, run, user } = useStore();
  const { c } = useTheme();
  const now = useTicker(1000);
  const { can } = usePerms();

  const vehicle = state.vehicles.find((v) => v.id === request.vehicleId);
  const plazo = deadlineOf(state, request, now);

  const esRepaso = request.prepTipo === 'repaso';

  const empezar = () => {
    const creada = run({
      type: 'prep.create',
      vehicleId: request.vehicleId,
      siteId: request.siteId,
      preparerId: user?.id ?? null,
      // Lo que se abre es lo que se pidió: un repaso abierto como
      // preparación de entrada se mediría contra dos horas y le pediría al
      // preparador el checklist entero.
      tipo: request.prepTipo ?? 'entrada',
    });
    // El id de la preparación se deriva del id del comando, así que se
    // puede encadenar sin esperar respuesta del servidor.
    const prepId = idCreadoPor('prep', creada);
    run({ type: 'prep.start', prepId });
    onAbierta(prepId);
  };

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        padding: space.lg,
        marginBottom: space.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: campo.title, fontWeight: '900', color: c.text, flex: 1, minWidth: 130 }}>
          {vehicle ? vehicleRef(vehicle) : request.vehicleId}
        </Text>
        <DeadlineChip deadline={plazo} />
        {esRepaso ? <Pill tone="blue">Repaso de entrega</Pill> : null}
        {request.urgent ? <Pill tone="red">Urgente</Pill> : <Pill tone="amber">Sin empezar</Pill>}
      </View>

      <Text style={{ fontSize: campo.body, color: c.textMuted, marginTop: 2 }}>
        {vehicle ? vehicleName(vehicle) : ''} · {siteName(state, request.siteId)}
      </Text>
      <UbicacionVehiculo vehicle={vehicle} esperadoEn={request.siteId} />
      <Text style={{ fontSize: campo.small, color: c.textMuted, marginTop: 4 }}>
        {esRepaso
          ? `Se entrega hoy${vehicle?.deliveryDate ? ` · ${formatDate(vehicle.deliveryDate)}` : ''}`
          : `Pedida por ${userName(state, request.createdBy)}`}
        {request.note ? ` · ${request.note}` : ''}
      </Text>

      <Spacer h={space.md} />
      <Btn variant="primary" full onPress={empezar} disabled={!can('preparacion.ejecutar')}>
        {esRepaso ? 'Empezar repaso' : 'Empezar preparación'}
      </Btn>
    </View>
  );
}

function PrepCard({ prep, onOpen }: { prep: Preparation; onOpen: () => void }) {
  const { state } = useStore();
  const { c } = useTheme();
  const now = useTicker(1000);

  const vehicle = state.vehicles.find((v) => v.id === prep.vehicleId);
  const { done, total, pct } = prepProgress(prep);
  const fuera = prepIsOverSla(prep, now);
  const request = state.requests.find(
    (r: ServiceRequest) => r.type === 'preparacion' && r.vehicleId === prep.vehicleId && (r.status !== 'terminada' && r.status !== 'cancelada')
  );
  const plazo = request ? deadlineOf(state, request, now) : null;
  const enCurso = prep.runState === 'en_curso';

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: enCurso ? c.primary : c.border,
        backgroundColor: pressed ? c.surfaceAlt : c.surface,
        borderRadius: radius.lg,
        padding: space.lg,
        marginBottom: space.md,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: campo.title, fontWeight: '900', color: c.text, flex: 1, minWidth: 130 }}>
          {vehicle ? vehicleRef(vehicle) : prep.vehicleId}
        </Text>
        {plazo ? <DeadlineChip deadline={plazo} /> : null}
        {prep.tipo === 'repaso' ? <Pill tone="blue">Repaso</Pill> : null}
        {prep.runState === 'bloqueado' ? <Pill tone="red">Bloqueado</Pill> : null}
        {enCurso ? <Pill tone="ok">En curso</Pill> : null}
      </View>

      <Text style={{ fontSize: campo.body, color: c.textMuted, marginTop: 2 }}>
        {vehicle ? vehicleName(vehicle) : ''} · {siteName(state, prep.siteId)}
      </Text>
      <UbicacionVehiculo vehicle={vehicle} esperadoEn={prep.siteId} />

      <Spacer h={space.sm} />
      <ProgressBar pct={pct} tone={fuera ? 'red' : 'ok'} />
      <Spacer h={space.xs} />
      <Text style={{ fontSize: campo.small, color: c.textMuted }}>
        {done}/{total} hechos ·{' '}
        <Text style={{ color: fuera ? c.redFg : c.textMuted, fontWeight: fuera ? '800' : '400' }}>
          {formatShortDuration(prepElapsedMs(prep, now))} de {formatShortDuration(prep.targetMs)}
        </Text>
      </Text>

      <Spacer h={space.md} />
      <Btn variant="primary" full onPress={onOpen}>
        {enCurso ? 'Seguir trabajando' : prep.startedAt ? 'Reanudar' : 'Empezar'}
      </Btn>
    </Pressable>
  );
}

/* -------------------------------------------------------- vista de trabajo */

function WorkModal({
  prep,
  onClose,
  onDone,
}: {
  prep: Preparation;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const now = useTicker(1000);
  const { can } = usePerms();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [reason, setReason] = useState(state.config.waitReasons[0]);

  const vehicle = state.vehicles.find((v) => v.id === prep.vehicleId);
  const { done, total, pct } = prepProgress(prep);
  const enCurso = prep.runState === 'en_curso';
  const fuera = prepIsOverSla(prep, now);
  const puede = can('preparacion.ejecutar');
  const pendientes = prep.items.filter((i) => i.state === 'pendiente').length;

  const toggle = (requirementId: string, current: CheckState) => {
    if (!puede) return;
    const next: CheckState = current === 'completado' ? 'pendiente' : 'completado';
    run({ type: 'prep.item', prepId: prep.id, requirementId, state: next });
  };

  return (
    <Modal
      visible
      onClose={onClose}
      title={vehicle ? `${vehicleName(vehicle)} · ${vehicleRef(vehicle)}` : 'Preparación'}
      footer={
        puede ? (
          <>
            {enCurso ? (
              <Btn full onPress={() => setPauseOpen(true)}>
                ⏸ Pausar
              </Btn>
            ) : (
              <Btn
                variant="primary"
                full
                onPress={() => run({ type: prep.startedAt ? 'prep.resume' : 'prep.start', prepId: prep.id })}
              >
                ▶ {prep.startedAt ? 'Reanudar' : 'Empezar'}
              </Btn>
            )}
            <Btn variant={pendientes === 0 ? 'primary' : 'default'} full onPress={() => setFinishOpen(true)}>
              {pendientes === 0 ? '✓ Terminar · todo hecho' : `✓ Terminar (quedan ${pendientes})`}
            </Btn>
          </>
        ) : (
          <Muted>Tu rol puede consultar esta preparación, pero no modificarla.</Muted>
        )
      }
    >
      {/* Dónde está el coche: mientras no se ha empezado hace falta para ir
          a por él, y después para saber de dónde salió. */}
      <UbicacionVehiculo vehicle={vehicle} esperadoEn={prep.siteId} />
      <Spacer h={space.sm} />

      {/* Cronómetro y avance, lo único que hay que mirar mientras se trabaja */}
      <View
        style={{
          backgroundColor: c.surfaceAlt,
          borderRadius: radius.md,
          padding: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: campo.label, fontWeight: '800', color: c.textFaint }}>TIEMPO EFECTIVO</Text>
          <Text
            style={{
              fontSize: campo.display,
              fontWeight: '900',
              color: fuera ? c.redFg : c.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatDuration(prepElapsedMs(prep, now))}
          </Text>
          <Text style={{ fontSize: campo.micro, color: c.textMuted }}>
            objetivo {formatShortDuration(prep.targetMs)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: campo.display, fontWeight: '900', color: c.text }}>{pct}%</Text>
          <Text style={{ fontSize: campo.micro, color: c.textMuted }}>
            {done}/{total}
          </Text>
        </View>
      </View>

      {prep.runState === 'bloqueado' || prep.runState === 'en_espera' ? (
        <Notice tone={prep.runState === 'bloqueado' ? 'danger' : 'warn'}>
          {prep.runState === 'bloqueado' ? 'Bloqueado' : 'En espera'} · {prep.waitReason ?? '—'}
        </Notice>
      ) : null}

      <Spacer h={space.md} />

      {/* Checklist: una línea, un toque */}
      {prep.items.map((item) => {
        if (item.requirementId === 'req-campana') return (
          <CampanaCheck key={item.requirementId} estado={item.state}
            disabled={!puede || (prep.runState === 'terminado' || prep.runState === 'cancelado')}
            onChange={(next) => run({ type: 'prep.item', prepId: prep.id,
              requirementId: item.requirementId, state: next })} />
        );
        const hecho = item.state === 'completado';
        const noAplica = item.state === 'no_requerido';
        return (
          <Pressable
            key={item.requirementId}
            onPress={() => !noAplica && toggle(item.requirementId, item.state)}
            disabled={noAplica || !puede}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 14,
              paddingHorizontal: 12,
              borderRadius: radius.md,
              marginBottom: 6,
              backgroundColor: pressed
                ? c.surfaceSunken
                : hecho
                  ? c.checkDoneBg
                  : noAplica
                    ? c.surfaceSunken
                    : c.surface,
              borderWidth: 1,
              borderColor: hecho ? c.checkDoneBorder : noAplica ? c.border : c.checkPendingBorder,
              opacity: noAplica ? 0.55 : 1,
            })}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: hecho ? c.primary : c.border,
                backgroundColor: hecho ? c.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {hecho ? <Text style={{ color: '#fff', fontSize: campo.strong, fontWeight: '900' }}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: campo.strong,
                  fontWeight: hecho ? '600' : '700',
                  color: c.text,
                  textDecorationLine: hecho ? 'line-through' : 'none',
                }}
              >
                {item.label}
              </Text>
              {noAplica ? (
                <Text style={{ fontSize: campo.micro, color: c.textMuted }}>No requerido en este vehículo</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      <Muted>
        Pulsa una línea para marcarla o desmarcarla. En «Campaña de marca» puedes indicar
        si el vehículo tiene campaña y, después, marcarla como realizada.
      </Muted>

      <FinishPrepModal
        prep={prep}
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        onDone={onDone}
      />

      <Modal
        visible={pauseOpen}
        onClose={() => setPauseOpen(false)}
        title="⏸ ¿Por qué paras?"
        footer={
          <>
            <Btn
              variant="primary"
              full
              onPress={() => {
                run({ type: 'prep.pause', prepId: prep.id, reason });
                setPauseOpen(false);
              }}
            >
              Pausar
            </Btn>
            <Btn
              variant="danger"
              full
              onPress={() => {
                run({ type: 'prep.pause', prepId: prep.id, reason, blocked: true });
                setPauseOpen(false);
                onDone('Bloqueo avisado a logística.');
              }}
            >
              No puedo seguir · avisar a logística
            </Btn>
          </>
        }
      >
        <Field label="Motivo">
          <Select
            full
            value={reason}
            onChange={setReason}
            options={state.config.waitReasons.map((r) => ({ value: r, label: r }))}
            title="Motivo de espera"
          />
        </Field>
        <Muted>
          El tiempo en espera se cuenta aparte, así que una parada por falta de material no penaliza tu
          tiempo de trabajo.
        </Muted>
      </Modal>
    </Modal>
  );
}
