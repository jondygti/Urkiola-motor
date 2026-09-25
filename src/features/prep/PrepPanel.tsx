import { comercialLabel } from '@/data/format';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Btn, Field, Modal, Muted, Notice, Panel, Pill, ProgressBar, Select, Spacer, StateFlow, Toolbar, radius, space, tipografia, useTheme } from '@/ui';
import { useStore, useTicker } from '@/data/store';
import { prepElapsedMs, prepIsOverSla, prepProgress, prepWaitingMs } from '@/data/commands';
import { formatDuration, formatShortDuration, siteName, userName, vehicleTitle } from '@/data/format';
import {
  PREP_PHASES,
  PREP_PHASE_LABEL,
  type CheckState,
  type Preparation,
  type Vehicle,
} from '@/data/types';
import { PrepStatePill } from '@/features/common/bits';
import { usePerms } from '@/features/common/Guard';
import { FinishPrepModal } from './FinishPrep';
import { CampanaCheck } from './CampanaCheck';
import { Fotos } from '@/features/actions/CampoFotos';

const STATE_LABEL: Record<CheckState, string> = {
  completado: '✅ Completado',
  pendiente: '⬜ Pendiente',
  no_requerido: '— No requerido',
};

/** Panel completo de preparación: cronómetros, checklist y controles. */
export function PrepPanel({
  prep,
  vehicle,
  compact,
}: {
  prep: Preparation;
  vehicle: Vehicle | undefined;
  compact?: boolean;
}) {
  const { state, run, user } = useStore();
  const { c } = useTheme();
  const now = useTicker(1000);
  const { can } = usePerms();
  // Sin permiso para trabajar en preparaciones, el panel es de solo lectura.
  const puedeEjecutar = can('preparacion.ejecutar');
  const puedeGestionar = can('preparacion.gestionar');
  const [pauseOpen, setPauseOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [reason, setReason] = useState(state.config.waitReasons[0]);
  const [blocked, setBlocked] = useState(false);

  if (can('preparacion.ejecutar') && !can('preparacion.gestionar') && prep.preparerId && prep.preparerId !== user?.id) {
    return <Muted>Preparación asignada a otro preparador.</Muted>;
  }

  const elapsed = prepElapsedMs(prep, now);
  const waiting = prepWaitingMs(prep, now);
  const { done, total, pct } = prepProgress(prep);
  const overSla = prepIsOverSla(prep, now);
  const terminada = prep.runState === 'terminado';
  const cancelada = prep.runState === 'cancelado';
  const cerrada = terminada || cancelada;
  const puedeTrabajar = puedeEjecutar && (puedeGestionar || prep.preparerId === user?.id);
  const bloqueado = cerrada || !puedeTrabajar;
  const apt = !cancelada && (terminada || (pct === 100 && prep.phase === 'apto_entrega'));

  const cycle = (requirementId: string, current: CheckState) => {
    const next: CheckState = current === 'completado' ? 'pendiente' : 'completado';
    run({ type: 'prep.item', prepId: prep.id, requirementId, state: next });
  };

  const setItemState = (requirementId: string, next: CheckState) => {
    run({ type: 'prep.item', prepId: prep.id, requirementId, state: next });
  };

  return (
    <Panel title={prep.tipo === 'repaso' ? '🧽 Repaso de entrega' : '⏱️ Preparación y checklist'}>
      {vehicle ? (
        <Muted style={{ marginTop: -6, marginBottom: space.sm }}>
          {vehicleTitle(vehicle)} · {siteName(state, prep.siteId)} · preparador {userName(state, prep.preparerId)} · Comercial: {comercialLabel(state, vehicle)}
        </Muted>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: space.lg,
          backgroundColor: c.surfaceAlt,
          borderRadius: radius.md,
          padding: 12,
          marginBottom: space.md,
        }}
      >
        <Timer label="TIEMPO EFECTIVO" value={formatDuration(elapsed)} tone={overSla ? c.redFg : c.text} />
        <Timer label="TIEMPO EN ESPERA" value={formatDuration(waiting)} tone={c.text} />
        <Timer label="OBJETIVO" value={formatDuration(prep.targetMs)} tone={c.textMuted} />
      </View>

      <ProgressBar pct={pct} tone={overSla ? 'red' : 'ok'} />
      <Spacer h={space.sm} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Text style={{ fontSize: tipografia.body, fontWeight: '900', color: c.text }}>{pct}%</Text>
        <Muted>
          {done}/{total} requisitos · {PREP_PHASE_LABEL[prep.phase]}
        </Muted>
        <PrepStatePill runState={prep.runState} overSla={overSla} />
        {apt ? <Pill tone="ok">APTO PARA ENTREGA</Pill> : <Pill tone="red">NO APTO PARA ENTREGA</Pill>}
      </View>

      {!cerrada && puedeEjecutar && !puedeTrabajar ? (
        <Notice tone="warn">Empieza la preparación para asignártela antes de marcar el checklist o finalizar.</Notice>
      ) : null}

      {prep.runState === 'bloqueado' || prep.runState === 'en_espera' ? (
        <Notice tone={prep.runState === 'bloqueado' ? 'danger' : 'warn'}>
          {prep.runState === 'bloqueado' ? 'Bloqueado' : 'En espera'} · motivo: {prep.waitReason ?? '—'}
        </Notice>
      ) : null}

      <Spacer h={space.md} />
      <StateFlow
        steps={PREP_PHASES.map((p) => PREP_PHASE_LABEL[p])}
        activeIndex={PREP_PHASES.indexOf(prep.phase)}
      />

      <Spacer h={space.md} />
      <View style={{ gap: 7 }}>
        {prep.items.map((item) => {
          const bg =
            item.state === 'completado'
              ? c.checkDoneBg
              : item.state === 'pendiente'
                ? c.checkPendingBg
                : c.surfaceSunken;
          const border =
            item.state === 'completado'
              ? c.checkDoneBorder
              : item.state === 'pendiente'
                ? c.checkPendingBorder
                : c.border;
          if (item.requirementId === 'req-campana') return (
            <CampanaCheck key={item.requirementId} estado={item.state} disabled={bloqueado}
              onChange={(next) => setItemState(item.requirementId, next)} />
          );
          if (item.requirementId === 'req-fotos') return (
            <View
              key={item.requirementId}
              style={{
                backgroundColor: item.state === 'completado' ? c.checkDoneBg : c.checkPendingBg,
                borderWidth: 1,
                borderColor: item.state === 'completado' ? c.checkDoneBorder : c.checkPendingBorder,
                borderRadius: radius.md,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: tipografia.body, color: c.text, fontWeight: '600' }}>
                {item.state === 'completado' ? '✅' : '📷'} {item.label}
              </Text>
              <Text style={{ fontSize: tipografia.micro, color: c.textMuted, marginTop: 3 }}>
                {item.state === 'completado'
                  ? `${item.by ?? '—'}${item.at ? ` · ${new Date(item.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                  : 'Se completa al finalizar con las cuatro diagonales del vehículo.'}
              </Text>
            </View>
          );
          return (
            <View
              key={item.requirementId}
              style={{
                backgroundColor: bg,
                borderWidth: 1,
                borderColor: border,
                borderRadius: radius.md,
                padding: 10,
              }}
            >
              <Pressable
                onPress={() => !bloqueado && cycle(item.requirementId, item.state)}
                disabled={bloqueado || item.state === 'no_requerido'}
              >
                <Text style={{ fontSize: tipografia.body, color: c.text, fontWeight: '600' }}>
                  {STATE_LABEL[item.state].split(' ')[0]} {item.label}
                  {!item.timed ? '  ·  simple check' : ''}
                </Text>
                <Text style={{ fontSize: tipografia.micro, color: c.textMuted, marginTop: 3 }}>
                  {item.state === 'completado'
                    ? `${item.by ?? '—'}${item.at ? ` · ${new Date(item.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                    : item.state === 'no_requerido'
                      ? 'No requerido para este vehículo · no cuenta en el porcentaje'
                      : 'Pendiente'}
                </Text>
              </Pressable>
              {!bloqueado ? (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {(['completado', 'pendiente', 'no_requerido'] as CheckState[]).map((st) => (
                    <Pressable
                      key={st}
                      onPress={() => setItemState(item.requirementId, st)}
                      style={{
                        borderWidth: 1,
                        borderColor: item.state === st ? c.primary : c.border,
                        backgroundColor: item.state === st ? c.primary : c.surface,
                        borderRadius: radius.pill,
                        paddingVertical: 4,
                        paddingHorizontal: 9,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: tipografia.label,
                          fontWeight: '800',
                          color: item.state === st ? '#fff' : c.textMuted,
                        }}
                      >
                        {STATE_LABEL[st]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {prep.finalPhotos ? (
        <>
          <Spacer h={space.md} />
          <Muted>Reportaje final · 4 diagonales</Muted>
          <Fotos refs={[
            prep.finalPhotos.frontLeft,
            prep.finalPhotos.frontRight,
            prep.finalPhotos.rearLeft,
            prep.finalPhotos.rearRight,
          ]} />
        </>
      ) : null}

      <Toolbar>
        {!puedeEjecutar ? (
          <Muted>Tu rol puede consultar esta preparación, pero no modificarla.</Muted>
        ) : prep.runState === 'en_curso' ? (
          <Btn small={compact} onPress={() => setPauseOpen(true)}>
            ⏸ Pausar
          </Btn>
        ) : !cerrada ? (
          <Btn
            variant="primary"
            small={compact}
            onPress={() =>
              run({ type: prep.startedAt ? 'prep.resume' : 'prep.start', prepId: prep.id })
            }
          >
            ▶ {prep.startedAt ? 'Reanudar' : 'Iniciar'}
          </Btn>
        ) : null}
        {!cerrada && puedeTrabajar ? (
          <Btn variant="primary" small={compact} onPress={() => setFinishOpen(true)}>
            ✓ Finalizar preparación
          </Btn>
        ) : cerrada ? (
          <Muted>
            {cancelada ? 'Cancelada' : 'Terminada'} · {formatShortDuration(prep.effectiveMs)} efectivos · preparador{' '}
            {userName(state, prep.preparerId)}
          </Muted>
        ) : null}
      </Toolbar>

      <Muted>
        Los requisitos «no requerido» no cuentan en el porcentaje ni bloquean la entrega. «Preentrega cliente»
        es un simple check y no tiene cronómetro propio.
      </Muted>

      <FinishPrepModal prep={prep} visible={finishOpen} onClose={() => setFinishOpen(false)} />

      <Modal
        visible={pauseOpen}
        onClose={() => setPauseOpen(false)}
        title="⏸ Pausar preparación"
        footer={
          <Btn
            variant="primary"
            full
            onPress={() => {
              run({ type: 'prep.pause', prepId: prep.id, reason, blocked });
              setPauseOpen(false);
            }}
          >
            Pausar
          </Btn>
        }
      >
        <Field label="Motivo de espera">
          <Select
            full
            value={reason}
            onChange={setReason}
            options={state.config.waitReasons.map((r) => ({ value: r, label: r }))}
            title="Motivo"
          />
        </Field>
        <Pressable onPress={() => setBlocked((b) => !b)} style={{ paddingVertical: 8 }}>
          <Text style={{ fontSize: tipografia.body, color: c.text }}>
            {blocked ? '☑' : '☐'} Marcar como <Text style={{ fontWeight: '800' }}>bloqueado</Text> (avisa a
            logística)
          </Text>
        </Pressable>
        <Muted>
          El tiempo en espera se contabiliza aparte del tiempo efectivo, para que el SLA refleje solo el
          trabajo real.
        </Muted>
      </Modal>
    </Panel>
  );
}

function Timer({ label, value, tone }: { label: string; value: string; tone: string }) {
  const { c } = useTheme();
  return (
    <View>
      <Text style={{ fontSize: tipografia.label, fontWeight: '800', color: c.textFaint }}>{label}</Text>
      <Text style={{ fontSize: tipografia.title, fontWeight: '900', color: tone, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
