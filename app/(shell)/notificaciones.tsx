import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Column,
  DataTable,
  Grid,
  H1,
  Kpi,
  Muted,
  Notice,
  Panel,
  Pill,
  Screen,
  Segmented,
  Spacer,
  Toolbar,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useStore } from '@/data/store';
import { bandejaDe, unreadCount } from '@/data/selectors';
import { formatDateTime, siteName, timeAgo, vehicleTitle } from '@/data/format';
import { NOTIFY_CONDITION_LABEL, type NotificationRule } from '@/data/types';
import { Cell, useOpenVehicle } from '@/features/common/bits';
import { NotificationRuleModal } from '@/features/actions/VehicleActions';
import { registerForPush } from '@/data/push';
import { IfCan, usePerms } from '@/features/common/Guard';

export default function NotificationsScreen() {
  const state = useAppState();
  const { run, user } = useStore();
  const { c } = useTheme();
  const openVehicle = useOpenVehicle();
  const { can } = usePerms();
  const puedeGestionar = can('notificaciones.gestionar');

  const [tab, setTab] = useState<'avisos' | 'reglas'>('avisos');
  const [newOpen, setNewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // La bandeja es la suya: un aviso dirigido al comercial de un coche no
  // le sirve de nada al preparador, y de tanto llegarle deja de mirarla.
  const bandeja = bandejaDe(state, user);
  const unread = unreadCount(state, user);

  const ruleColumns: Column<NotificationRule>[] = [
    {
      key: 'scope',
      header: 'Vehículo / ámbito',
      width: 200,
      primary: true,
      value: (r) => {
        if (r.scopeKind === 'fleet') return 'Toda la flota';
        if (r.scopeKind === 'site') return siteName(state, r.scopeRef);
        const v = state.vehicles.find((x) => x.id === r.scopeRef);
        return v ? vehicleTitle(v) : r.scopeRef ?? '—';
      },
      filter: { type: 'text' },
      render: (r) => {
        const label =
          r.scopeKind === 'fleet'
            ? 'Toda la flota'
            : r.scopeKind === 'site'
              ? `Sede ${siteName(state, r.scopeRef)}`
              : (() => {
                  const v = state.vehicles.find((x) => x.id === r.scopeRef);
                  return v ? vehicleTitle(v) : r.scopeRef ?? '—';
                })();
        return <Cell>{label}</Cell>;
      },
    },
    {
      key: 'condition',
      header: 'Condición',
      width: 250,
      value: (r) => NOTIFY_CONDITION_LABEL[r.condition],
      filter: {
        type: 'select',
        options: Object.values(NOTIFY_CONDITION_LABEL).map((label) => ({ value: label, label })),
      },
      render: (r) => (
        <Cell>
          {NOTIFY_CONDITION_LABEL[r.condition]}
          {r.condition === 'llegada_sede' && r.targetSiteId ? ` · ${siteName(state, r.targetSiteId)}` : ''}
        </Cell>
      ),
    },
    {
      key: 'recipient',
      header: 'Destinatario',
      width: 160,
      value: (r) => r.recipient,
      filter: { type: 'text' },
      render: (r) => <Cell>{r.recipient}</Cell>,
    },
    {
      key: 'channels',
      header: 'Canal',
      width: 120,
      value: (r) => r.channels.join(' + '),
      render: (r) => <Cell muted>{r.channels.map((ch) => (ch === 'push' ? 'Push' : ch === 'web' ? 'Web' : 'Email')).join(' + ')}</Cell>,
    },
    {
      key: 'active',
      header: 'Estado',
      width: 110,
      value: (r) => (r.active ? 'Activa' : 'Pausada'),
      render: (r) => <Pill tone={r.active ? 'ok' : 'neutral'}>{r.active ? 'Activa' : 'Pausada'}</Pill>,
    },
    {
      key: 'actions',
      header: '',
      width: 170,
      render: (r) =>
        puedeGestionar ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Btn small onPress={() => run({ type: 'rule.toggle', ruleId: r.id })}>
              {r.active ? 'Pausar' : 'Activar'}
            </Btn>
            <Btn small variant="ghost" onPress={() => run({ type: 'rule.delete', ruleId: r.id })}>
              Borrar
            </Btn>
          </View>
        ) : null,
    },
  ];

  return (
    <Screen>
      <H1>Notificaciones</H1>
      <Muted>Reglas automáticas por vehículo, sede, estado o tiempo. Aviso push en la app y en la web.</Muted>

      {toast ? <Notice>{toast}</Notice> : null}

      <Toolbar>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'avisos', label: `Avisos${unread ? ` · ${unread}` : ''}` },
            { value: 'reglas', label: `Reglas · ${state.rules.length}` },
          ]}
        />
        <IfCan permission="notificaciones.gestionar">
          <Btn variant="primary" onPress={() => setNewOpen(true)}>
            + Nueva regla
          </Btn>
        </IfCan>
        {tab === 'avisos' && unread > 0 ? (
          <Btn onPress={() => run({ type: 'inbox.readAll' })}>Marcar todo como leído</Btn>
        ) : null}
        <Btn
          onPress={async () => {
            const token = await registerForPush();
            setToast(
              token
                ? 'Este dispositivo ya recibe avisos push.'
                : 'Las notificaciones push necesitan un dispositivo real con la app instalada.'
            );
          }}
        >
          🔔 Activar push en este dispositivo
        </Btn>
      </Toolbar>

      {tab === 'avisos' ? (
        <>
          <Grid cols={3} minWidth={200}>
            <Kpi label="Sin leer" value={unread} tone={unread > 0 ? 'amber' : 'ok'} />
            <Kpi label="Total avisos" value={bandeja.length} />
            <Kpi label="Reglas activas" value={state.rules.filter((r) => r.active).length} />
          </Grid>

          <Spacer h={space.lg} />

          <Panel title="Bandeja de avisos">
            {bandeja.length === 0 ? (
              <Muted>No tienes avisos.</Muted>
            ) : (
              bandeja.map((n) => (
                <Notice
                  key={n.id}
                  tone={n.tone}
                  onPress={() => {
                    run({ type: 'inbox.read', eventId: n.id });
                    if (n.vehicleId) openVehicle(n.vehicleId);
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: n.read ? '600' : '900', color: c.text }}>
                        {n.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: c.text, marginTop: 2 }}>{n.body}</Text>
                      <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>
                        {formatDateTime(n.at)} · {timeAgo(n.at)}
                      </Text>
                    </View>
                    {!n.read ? <Pill tone="amber">Nuevo</Pill> : null}
                  </View>
                </Notice>
              ))
            )}
          </Panel>
        </>
      ) : (
        <Panel>
          <DataTable
            columns={ruleColumns}
            rows={state.rules}
            keyExtractor={(r) => r.id}
            emptyText="Todavía no hay reglas configuradas."
          />
        </Panel>
      )}

      <NotificationRuleModal
        visible={newOpen && puedeGestionar}
        onClose={() => setNewOpen(false)}
        onDone={setToast}
      />
    </Screen>
  );
}
