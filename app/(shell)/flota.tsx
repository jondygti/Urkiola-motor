import React, { useCallback, useMemo, useState } from 'react';
import { Text } from 'react-native';
import {
  Btn,
  Column,
  DataTable,
  Grid,
  H1,
  Input,
  Muted,
  Notice,
  Panel,
  Screen,
  Select,
  Spacer,
  StatLine,
  Toolbar,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useStore } from '@/data/store';
import { customValue, esDelComercial, fleetColumns } from '@/data/selectors';
import { formatDateTime, locationLabel, matchesSearch, siteName, timeAgo, vehicleName } from '@/data/format';
import { Cell, SituationPill, StatusPill, TypePill, useOpenVehicle } from '@/features/common/bits';
import { ScreenGuard, usePerms } from '@/features/common/Guard';
import { NuevoVehiculoModal } from '@/features/actions/NuevoVehiculo';
import type { Vehicle } from '@/data/types';
import { VEHICLE_STATUS_LABEL } from '@/data/types';

const ALL = '__all__';
/** «Los míos»: los coches del comercial que ha entrado. */
const MIOS = '__mios__';

export default function FleetScreen() {
  const state = useAppState();
  const { user } = useStore();
  const openVehicle = useOpenVehicle();
  const { c } = useTheme();
  const { can } = usePerms();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'activos' | 'quiter'>('activos');
  const [type, setType] = useState<string>(ALL);
  const [rep, setRep] = useState<string>(ALL);
  const [situation, setSituation] = useState<string>(ALL);
  const [site, setSite] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [misPreparaciones, setMisPreparaciones] = useState(false);
  const [altaOpen, setAltaOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reps = useMemo(() => {
    const set = new Set(state.vehicles.map((v) => v.salesRep).filter((r): r is string => !!r));
    return Array.from(set).sort();
  }, [state.vehicles]);

  /**
   * «Se está preparando» para un comercial no es solo que el preparador
   * haya empezado: cuenta desde que él la pide. Es lo que quiere saber —en
   * qué punto está su coche— y no el estado interno del vehículo.
   */
  const preparandose = useCallback(
    (v: Vehicle) =>
      state.preparations.some((p) => p.vehicleId === v.id && p.runState !== 'terminado') ||
      state.requests.some(
        (r) => r.type === 'preparacion' && r.vehicleId === v.id && r.status !== 'terminada'
      ),
    [state.preparations, state.requests]
  );

  const rows = useMemo(() => {
    return state.vehicles.filter((v) => {
      if (scope === 'activos' && !v.logisticActive) return false;
      if (type !== ALL && v.type !== type) return false;
      if (rep !== ALL) {
        if (rep === MIOS) {
          if (!esDelComercial(v, user)) return false;
        } else if (rep === '__none__' ? v.salesRep !== null : v.salesRep !== rep) return false;
      }
      if (situation !== ALL && v.situation !== situation) return false;
      if (site !== ALL && v.location?.siteId !== site) return false;
      if (status !== ALL && v.status !== status) return false;
      if (misPreparaciones && !(esDelComercial(v, user) && preparandose(v))) return false;
      return matchesSearch(v, query);
    });
  }, [state.vehicles, scope, type, rep, situation, site, status, query, user, misPreparaciones, preparandose]);

  // El comercial se ve a sí mismo en la lista de comerciales: entonces
  // tiene sentido ofrecerle el atajo a lo suyo.
  const esComercial = useMemo(
    () => !!user && state.vehicles.some((v) => esDelComercial(v, user)),
    [state.vehicles, user]
  );
  const enPreparacion = useMemo(
    () =>
      esComercial ? state.vehicles.filter((v) => esDelComercial(v, user) && preparandose(v)).length : 0,
    [state.vehicles, esComercial, user, preparandose]
  );

  // En qué punto está cada uno, que es la pregunta de verdad.
  const resumenMio = useMemo(() => {
    const mios = state.vehicles.filter((v) => esDelComercial(v, user));
    const abierta = (v: Vehicle) =>
      state.preparations.find((p) => p.vehicleId === v.id && p.runState !== 'terminado');
    return {
      pedidas: mios.filter((v) => preparandose(v) && !abierta(v)).length,
      enCurso: mios.filter((v) => !!abierta(v)).length,
      listas: mios.filter((v) => v.status === 'apto_entrega').length,
    };
  }, [state.vehicles, state.preparations, user, preparandose]);

  const configured = fleetColumns(state);

  /** Definición de cada columna base; se monta solo la que esté activada. */
  const BASE: Record<string, Column<Vehicle>> = {
    vin8: {
      key: 'vin8',
      header: 'VIN-8',
      width: 120,
      value: (v) => v.vin8,
      filter: { type: 'text' },
      render: (v) => (
        <Text style={{ fontSize: 13, fontWeight: '800', color: c.text }}>{v.vin8}</Text>
      ),
    },
    plate: {
      key: 'plate',
      header: 'Matrícula',
      width: 110,
      value: (v) => v.plate ?? '',
      filter: { type: 'text' },
      render: (v) => <Cell muted={!v.plate}>{v.plate ?? '—'}</Cell>,
    },
    model: {
      key: 'model',
      header: 'Vehículo',
      width: 150,
      value: (v) => vehicleName(v),
      filter: { type: 'text' },
      render: (v) => <Cell>{vehicleName(v)}</Cell>,
    },
    type: {
      key: 'type',
      header: 'Tipo',
      width: 90,
      value: (v) => v.type,
      filter: { type: 'select', options: [{ value: 'VN', label: 'VN' }, { value: 'VO', label: 'VO' }] },
      render: (v) => <TypePill type={v.type} />,
    },
    rep: {
      key: 'rep',
      header: 'Comercial',
      width: 140,
      value: (v) => v.salesRep ?? '—',
      filter: {
        type: 'select',
        options: [...reps.map((r) => ({ value: r, label: r })), { value: '—', label: 'Sin asignar' }],
      },
      render: (v) => <Cell muted={!v.salesRep}>{v.salesRep ? `${v.salesRep} · Asignado` : '—'}</Cell>,
    },
    situation: {
      key: 'situation',
      header: 'Situación',
      width: 110,
      value: (v) => v.situation,
      filter: {
        type: 'select',
        options: [
          { value: 'stock', label: 'Stock' },
          { value: 'pedido', label: 'Pedido' },
        ],
      },
      render: (v) => <SituationPill situation={v.situation} />,
    },
    location: {
      key: 'location',
      header: 'Ubicación',
      width: 200,
      value: (v) => locationLabel(state, v.location, true),
      filter: {
        type: 'select',
        options: state.sites.map((s) => ({ value: s.name, label: s.name })),
      },
      render: (v) => <Cell muted={!v.location}>{locationLabel(state, v.location, true)}</Cell>,
    },
    status: {
      key: 'status',
      header: 'Estado',
      width: 150,
      value: (v) => v.status,
      render: (v) => <StatusPill status={v.status} />,
    },
    check: {
      key: 'check',
      header: 'Última comprobación',
      width: 160,
      secondary: false,
      value: (v) => formatDateTime(v.lastCheckAt),
      render: (v) => (
        <Cell muted={!v.lastCheckAt}>
          {v.lastCheckAt ? `${formatDateTime(v.lastCheckAt)} · ${timeAgo(v.lastCheckAt)}` : 'Sin comprobar'}
        </Cell>
      ),
    },
    dealership: {
      key: 'dealership',
      header: 'Concesión',
      width: 130,
      value: (v) => v.dealership,
      filter: { type: 'select', options: state.sites.map((x) => ({ value: x.name, label: x.name })) },
      render: (v) => <Cell>{v.dealership}</Cell>,
    },
    target: {
      key: 'target',
      header: 'Destino operativo',
      width: 160,
      value: (v) => siteName(state, v.targetSiteId),
      filter: { type: 'select', options: state.sites.map((x) => ({ value: x.name, label: x.name })) },
      render: (v) => <Cell muted={!v.targetSiteId}>{siteName(state, v.targetSiteId)}</Cell>,
    },
    received: {
      key: 'received',
      header: 'Fecha de recepción',
      width: 150,
      value: (v) => formatDateTime(v.receivedAt),
      render: (v) => <Cell muted>{formatDateTime(v.receivedAt)}</Cell>,
    },
  };

  const columns: Column<Vehicle>[] = configured
    .map((col): Column<Vehicle> | null => {
      if (col.field) {
        const field = col.field;
        return {
          key: col.key,
          header: field.label,
          width: 140,
          value: (v) => customValue(v, field),
          filter: field.filterable
            ? field.type === 'lista'
              ? { type: 'select', options: field.options.map((o) => ({ value: o, label: o })) }
              : { type: 'text' }
            : undefined,
          render: (v) => {
            const text = customValue(v, field);
            return <Cell muted={text === '—'}>{text}</Cell>;
          },
        };
      }
      return BASE[col.key] ?? null;
    })
    .filter((col): col is Column<Vehicle> => col !== null);

  // La primera columna hace de título en la vista de móvil.
  if (columns.length > 0) columns[0] = { ...columns[0], primary: true };

  return (
    <ScreenGuard href="/flota" title="Flota">
    <Screen>
      <H1>Flota</H1>
      <Muted>
        Por defecto se muestran los vehículos con actividad logística. El parque completo de Quiter puede
        consultarse cuando sea necesario.
      </Muted>

      <Toolbar>
        <Input value={query} onChangeText={setQuery} placeholder="🔎 Buscar VIN-8 / matrícula / modelo" autoCapitalize="characters" />
        <Select
          value={scope}
          onChange={(v) => setScope(v as 'activos' | 'quiter')}
          title="Ámbito"
          options={[
            { value: 'activos', label: 'Vehículos activos' },
            { value: 'quiter', label: 'Todo el parque Quiter' },
          ]}
        />
        <Select
          value={type}
          onChange={setType}
          title="Tipo"
          options={[
            { value: ALL, label: 'Todos los tipos' },
            { value: 'VN', label: 'VN' },
            { value: 'VO', label: 'VO' },
          ]}
        />
        <Select
          value={rep}
          onChange={setRep}
          title="Comercial"
          options={[
            { value: ALL, label: 'Todos los comerciales' },
            ...(esComercial ? [{ value: MIOS, label: `Solo los míos · ${user!.name}` }] : []),
            ...reps.map((r) => ({ value: r, label: r })),
            { value: '__none__', label: 'Sin asignar' },
          ]}
        />
        <Select
          value={situation}
          onChange={setSituation}
          title="Situación"
          options={[
            { value: ALL, label: 'Stock / Pedido' },
            { value: 'stock', label: 'Stock' },
            { value: 'pedido', label: 'Pedido' },
          ]}
        />
        <Select
          value={site}
          onChange={setSite}
          title="Ubicación"
          options={[
            { value: ALL, label: 'Todas las ubicaciones' },
            ...state.sites.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Select
          value={status}
          onChange={setStatus}
          title="Estado"
          options={[
            { value: ALL, label: 'Todos los estados' },
            ...Object.entries(VEHICLE_STATUS_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
      </Toolbar>

      <Toolbar>
        {esComercial ? (
          // El atajo que pide la operativa del comercial: sus coches y en
          // qué punto está la preparación, sin tocar cuatro filtros.
          <Btn
            variant={misPreparaciones ? 'primary' : undefined}
            onPress={() => {
              setScope('activos');
              setMisPreparaciones((v) => !v);
            }}
          >
            🧽 Mis coches en preparación ({enPreparacion})
          </Btn>
        ) : null}
        {can('flota.editar') ? (
          <Btn variant="primary" onPress={() => setAltaOpen(true)}>
            ➕ Dar de alta un vehículo
          </Btn>
        ) : null}
      </Toolbar>

      {toast ? (
        <>
          <Spacer h={space.sm} />
          <Notice>{toast}</Notice>
        </>
      ) : null}

      {misPreparaciones ? (
        <>
          <Spacer h={space.sm} />
          <Notice>
            <Text style={{ fontSize: 12, color: c.text }}>
              Tus coches con preparación pedida o en marcha:{' '}
              <Text style={{ fontWeight: '800' }}>{resumenMio.pedidas}</Text> sin empezar ·{' '}
              <Text style={{ fontWeight: '800' }}>{resumenMio.enCurso}</Text> en curso ·{' '}
              <Text style={{ fontWeight: '800' }}>{resumenMio.listas}</Text> listas para entregar.
            </Text>
          </Notice>
        </>
      ) : null}

      <Panel>
        <Notice>
          <Text style={{ fontSize: 12, color: c.text }}>
            <Text style={{ fontWeight: '800' }}>Filtros por columna: </Text>
            se combinan entre sí y con la búsqueda. Las columnas que se ven, su orden y los campos propios se
            configuran en Administración → Flota y columnas.
          </Text>
        </Notice>
        <Spacer h={space.sm} />
        <DataTable
          columns={columns}
          rows={rows}
          keyExtractor={(v) => v.id}
          onRowPress={(v) => openVehicle(v.id)}
          emptyText="Ningún vehículo coincide con la búsqueda y los filtros aplicados."
        />
      </Panel>

      <Spacer h={space.lg} />

      <Grid cols={1}>
        <Panel title="🧠 Activación logística">
          <Muted>
            Se puede importar todo el parque de Quiter, incluidos coches de clientes. Solo aparecen por defecto
            en la operativa los que tienen actividad logística: {state.vehicles.filter((v) => v.logisticActive).length}{' '}
            de {state.vehicles.length}.
          </Muted>
          <StatLine
            items={[
              '📍 Ubicación → Activo',
              '↔ Movimiento → Activo',
              '🧽 Preparación → Activo',
              '📋 Recuento → Activo',
              '⚠️ Incidencia → Activo',
              '📋 Solicitud → Activo',
            ]}
          />
        </Panel>
      </Grid>

      <NuevoVehiculoModal
        visible={altaOpen}
        onClose={() => setAltaOpen(false)}
        onDone={(m, id) => {
          setToast(m);
          openVehicle(id);
        }}
      />
    </Screen>
    </ScreenGuard>
  );
}
