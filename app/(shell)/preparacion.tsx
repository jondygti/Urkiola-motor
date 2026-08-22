import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Column,
  DataTable,
  Grid,
  H1,
  Kpi,
  Modal,
  Muted,
  Notice,
  Panel,
  Screen,
  Select,
  Spacer,
  StateFlow,
  StatLine,
  Toolbar,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useTicker } from '@/data/store';
import { prepElapsedMs, prepIsOverSla, prepProgress } from '@/data/commands';
import { prepKpis } from '@/data/selectors';
import { formatShortDuration, siteName, userName, vehicleName, vehicleRef } from '@/data/format';
import { PREP_PHASES, PREP_PHASE_LABEL, PREP_RUN_STATE_LABEL, type Preparation } from '@/data/types';
import { Cell, PrepStatePill, useOpenVehicle } from '@/features/common/bits';
import { PrepPanel } from '@/features/prep/PrepPanel';
import { ScreenGuard } from '@/features/common/Guard';

const ALL = '__all__';

export default function PreparationScreen() {
  const state = useAppState();
  const { c } = useTheme();
  const now = useTicker(1000);
  const openVehicle = useOpenVehicle();

  const [site, setSite] = useState(ALL);
  const [runState, setRunState] = useState(ALL);
  const [timing, setTiming] = useState(ALL);
  const [detail, setDetail] = useState<Preparation | null>(null);

  const kpis = prepKpis(state, now);

  const rows = useMemo(
    () =>
      state.preparations
        .filter((p) => (runState === ALL ? p.runState !== 'terminado' : p.runState === runState))
        .filter((p) => (site === ALL ? true : p.siteId === site))
        .filter((p) => {
          if (timing === ALL) return true;
          const over = prepIsOverSla(p, now);
          return timing === 'fuera' ? over : !over;
        })
        .sort((a, b) => prepElapsedMs(b, now) - prepElapsedMs(a, now)),
    [state.preparations, site, runState, timing, now]
  );

  const columns: Column<Preparation>[] = [
    {
      key: 'vehicle',
      header: 'Vehículo',
      width: 180,
      primary: true,
      value: (p) => {
        const v = state.vehicles.find((x) => x.id === p.vehicleId);
        return v ? `${vehicleRef(v)} ${vehicleName(v)}` : p.vehicleId;
      },
      filter: { type: 'text' },
      render: (p) => {
        const v = state.vehicles.find((x) => x.id === p.vehicleId);
        return (
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{v ? vehicleRef(v) : '—'}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>{v ? vehicleName(v) : ''}</Text>
          </View>
        );
      },
    },
    {
      key: 'site',
      header: 'Sede',
      width: 110,
      value: (p) => siteName(state, p.siteId),
      filter: {
        type: 'select',
        options: state.sites.filter((s) => s.prepares).map((s) => ({ value: s.name, label: s.name })),
      },
      render: (p) => <Cell>{siteName(state, p.siteId)}</Cell>,
    },
    {
      key: 'phase',
      header: 'Fase',
      width: 150,
      value: (p) => PREP_PHASE_LABEL[p.phase],
      render: (p) => <Cell>{PREP_PHASE_LABEL[p.phase]}</Cell>,
    },
    {
      key: 'checklist',
      header: 'Checklist',
      width: 110,
      value: (p) => `${prepProgress(p).done}/${prepProgress(p).total}`,
      render: (p) => {
        const { done, total, pct } = prepProgress(p);
        return (
          <View>
            <Text style={{ fontSize: 12, color: c.text }}>
              {done}/{total}
            </Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>{pct}%</Text>
          </View>
        );
      },
    },
    {
      key: 'time',
      header: 'Tiempo efectivo',
      width: 140,
      value: (p) => formatShortDuration(prepElapsedMs(p, now)),
      render: (p) => (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: prepIsOverSla(p, now) ? c.redFg : c.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatShortDuration(prepElapsedMs(p, now))}
        </Text>
      ),
    },
    {
      key: 'target',
      header: 'Objetivo',
      width: 100,
      value: (p) => formatShortDuration(p.targetMs),
      render: (p) => <Cell muted>{formatShortDuration(p.targetMs)}</Cell>,
    },
    {
      key: 'preparer',
      header: 'Preparador',
      width: 140,
      value: (p) => userName(state, p.preparerId),
      filter: {
        type: 'select',
        options: state.users
          .filter((u) => u.role === 'preparador')
          .map((u) => ({ value: u.name, label: u.name })),
      },
      render: (p) => <Cell muted={!p.preparerId}>{userName(state, p.preparerId)}</Cell>,
    },
    {
      key: 'state',
      header: 'Estado',
      width: 130,
      value: (p) => PREP_RUN_STATE_LABEL[p.runState],
      render: (p) => <PrepStatePill runState={p.runState} overSla={prepIsOverSla(p, now)} />,
    },
    {
      key: 'actions',
      header: '',
      width: 100,
      render: (p) => (
        <Btn small onPress={() => setDetail(p)}>
          Abrir
        </Btn>
      ),
    },
  ];

  const live = detail ? state.preparations.find((p) => p.id === detail.id) ?? null : null;

  return (
    <ScreenGuard href="/preparacion" title="Preparación">
    <Screen>
      <H1>Preparación</H1>
      <Muted>Leioa, Galdakao, Anoeta e Irun. Cada equipo tiene su propia cola de trabajo.</Muted>

      <Notice>
        <Text style={{ fontSize: 12, color: c.text, lineHeight: 18 }}>
          Cada requisito tiene tres estados: <Text style={{ fontWeight: '800' }}>Completado</Text>,{' '}
          <Text style={{ fontWeight: '800' }}>Pendiente</Text> o{' '}
          <Text style={{ fontWeight: '800' }}>No requerido</Text>. «Preentrega cliente» es un simple check sin
          cronómetro propio y «Campaña de marca» solo cuenta cuando aplica al vehículo. Los requisitos «no
          requerido» no cuentan en el porcentaje.
        </Text>
      </Notice>

      <Toolbar>
        <Select
          value={site}
          onChange={setSite}
          title="Sede"
          options={[
            { value: ALL, label: 'Todas las sedes' },
            ...state.sites.filter((s) => s.prepares).map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Select
          value={runState}
          onChange={setRunState}
          title="Estado"
          options={[
            { value: ALL, label: 'Abiertas' },
            ...Object.entries(PREP_RUN_STATE_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          value={timing}
          onChange={setTiming}
          title="Tiempos"
          options={[
            { value: ALL, label: 'Todos los tiempos' },
            { value: 'dentro', label: 'Dentro de objetivo' },
            { value: 'fuera', label: 'Fuera de SLA' },
          ]}
        />
      </Toolbar>

      <Grid cols={6} minWidth={150}>
        <Kpi label="En curso" value={kpis.inProgress} />
        <Kpi label="Tiempo medio" value={formatShortDuration(kpis.avgMs)} />
        <Kpi label="Fuera SLA" value={kpis.outOfSla} tone={kpis.outOfSla > 0 ? 'red' : undefined} />
        <Kpi label="Bloqueados" value={kpis.blocked} tone={kpis.blocked > 0 ? 'amber' : undefined} />
        <Kpi label="Terminadas hoy" value={kpis.finishedToday} />
        <Kpi label="Checklist" value={`${kpis.checklistPct}%`} />
      </Grid>

      <Spacer h={space.lg} />

      <Panel>
        <DataTable
          columns={columns}
          rows={rows}
          keyExtractor={(p) => p.id}
          onRowPress={(p) => setDetail(p)}
          emptyText="No hay preparaciones con esos filtros."
        />
      </Panel>

      <Spacer h={space.lg} />

      <Grid cols={2} minWidth={380}>
        <Panel title="Fases">
          <StateFlow steps={PREP_PHASES.map((p) => PREP_PHASE_LABEL[p])} activeIndex={-1} />
          <Spacer h={space.sm} />
          <Muted>
            La fase se calcula sola según el avance del checklist: no hay que mantenerla a mano.
          </Muted>
        </Panel>
        <Panel title="Motivos de espera">
          <StatLine items={state.config.waitReasons} />
          <Muted>
            El tiempo en espera se contabiliza aparte del tiempo efectivo, de forma que el SLA mide solo el
            trabajo real del equipo. Los motivos se configuran en Administración.
          </Muted>
        </Panel>
      </Grid>

      {live ? (
        <Modal visible onClose={() => setDetail(null)} title="Preparación">
          <PrepPanel prep={live} vehicle={state.vehicles.find((v) => v.id === live.vehicleId)} compact />
          <Spacer h={space.sm} />
          <Btn full onPress={() => openVehicle(live.vehicleId)}>
            Ver ficha completa del vehículo
          </Btn>
        </Modal>
      ) : null}
    </Screen>
    </ScreenGuard>
  );
}
