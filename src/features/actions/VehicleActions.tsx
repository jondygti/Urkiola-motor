import React, { useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { Btn, Checkbox, Field, Input, Modal, Muted, Notice, Select, Toolbar, radius, space, useTheme } from '@/ui';
import { conflictoSolicitud } from '@/data/commands';
import { useStore } from '@/data/store';
import { activeCarriers, can, suggestCarrier, puedeGestionarEntrega } from '@/data/selectors';
import { DateField } from '@/features/common/DateField';
import { CampoFotos } from './CampoFotos';
import { locationLabel, vehicleTitle } from '@/data/format';
import {
  INCIDENT_TYPE_LABEL,
  NOTIFY_CONDITION_LABEL,
  type IncidentType,
  type NotifyAudience,
  type NotifyCondition,
  type Vehicle,
} from '@/data/types';

type Which = 'move' | 'transfer' | 'prep' | 'incident' | 'notify' | null;

/**
 * Barra de acciones de un vehículo con todos sus formularios.
 * Se usa igual en la ficha web y en la operativa móvil.
 */
export function VehicleActions({
  vehicle,
  compact,
  onDone,
}: {
  vehicle: Vehicle;
  compact?: boolean;
  onDone?: (message: string) => void;
}) {
  const [open, setOpen] = useState<Which>(null);
  const { state, user } = useStore();
  const close = () => setOpen(null);

  // Cada rol ve solo las acciones que tiene permitidas.
  const puedeMover = can(state, user, 'movimientos.registrar');
  const puedeSolicitar = can(state, user, 'solicitudes.crear');
  const puedeIncidencia = can(state, user, 'incidencias.crear');
  const puedeAvisar = can(state, user, 'notificaciones.gestionar');

  if (!puedeMover && !puedeSolicitar && !puedeIncidencia && !puedeAvisar) return null;

  return (
    <>
      <Toolbar>
        {puedeMover ? (
          <Btn variant="primary" small={compact} onPress={() => setOpen('move')}>
            📍 Registrar movimiento
          </Btn>
        ) : null}
        {puedeSolicitar ? (
          <>
            <Btn small={compact} onPress={() => setOpen('transfer')}>
              🚚 Solicitar traslado
            </Btn>
            <Btn small={compact} onPress={() => setOpen('prep')}>
              🧽 Solicitar preparación
            </Btn>
          </>
        ) : null}
        {puedeIncidencia ? (
          <Btn small={compact} onPress={() => setOpen('incident')}>
            📸 Incidencia
          </Btn>
        ) : null}
        {puedeAvisar ? (
          <Btn small={compact} onPress={() => setOpen('notify')}>
            🔔 Crear notificación
          </Btn>
        ) : null}
      </Toolbar>

      <MovementModal visible={open === 'move'} vehicle={vehicle} onClose={close} onDone={onDone} />
      <RequestModal
        visible={open === 'transfer'}
        type="traslado"
        vehicle={vehicle}
        onClose={close}
        onDone={onDone}
      />
      <RequestModal
        visible={open === 'prep'}
        type="preparacion"
        vehicle={vehicle}
        onClose={close}
        onDone={onDone}
      />
      <IncidentModal visible={open === 'incident'} vehicle={vehicle} onClose={close} onDone={onDone} />
      <NotificationRuleModal visible={open === 'notify'} vehicle={vehicle} onClose={close} onDone={onDone} />
    </>
  );
}

/* ------------------------------------------------------------ movimiento */

export function MovementModal({
  visible,
  vehicle,
  onClose,
  onDone,
}: {
  visible: boolean;
  vehicle: Vehicle;
  onClose: () => void;
  onDone?: (m: string) => void;
}) {
  const { state, run } = useStore();
  const [siteId, setSiteId] = useState(vehicle.targetSiteId ?? vehicle.location?.siteId ?? state.sites[0].id);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [positionId, setPositionId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const zones = useMemo(() => state.zones.filter((z) => z.siteId === siteId), [state.zones, siteId]);
  const positions = useMemo(
    () => state.positions.filter((p) => p.zoneId === (zoneId ?? zones[0]?.id)),
    [state.positions, zoneId, zones]
  );
  const occupied = useMemo(
    () => new Set(state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as string[]),
    [state.vehicles]
  );

  const submit = () => {
    run({
      type: 'movement.register',
      vehicleId: vehicle.id,
      to: { siteId, zoneId: zoneId ?? zones[0]?.id, positionId: positionId ?? undefined },
      note: note || undefined,
    });
    onDone?.('Movimiento registrado.');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="📍 Registrar movimiento"
      footer={
        <Btn variant="primary" full onPress={submit}>
          Registrar movimiento
        </Btn>
      }
    >
      <Field label="Vehículo">
        <Muted>{vehicleTitle(vehicle)}</Muted>
      </Field>
      <Field label="Origen">
        <Muted>{locationLabel(state, vehicle.location)}</Muted>
      </Field>
      <Field label="Sede de destino">
        <Select
          full
          value={siteId}
          onChange={(v) => {
            setSiteId(v);
            setZoneId(null);
            setPositionId(null);
          }}
          options={state.sites.map((s) => ({ value: s.id, label: s.name, hint: s.prepares ? 'Prepara' : 'Solo almacena' }))}
          title="Sede"
        />
      </Field>
      <Field label="Zona">
        <Select
          full
          value={zoneId ?? zones[0]?.id}
          onChange={(v) => {
            setZoneId(v);
            setPositionId(null);
          }}
          options={zones.map((z) => ({ value: z.id, label: z.name }))}
          title="Zona"
          searchable
        />
      </Field>
      <Field label="Posición" hint="Las posiciones ocupadas aparecen marcadas.">
        <Select
          full
          value={positionId}
          onChange={setPositionId}
          placeholder="Sin posición concreta"
          options={positions.map((p) => ({
            value: p.id,
            label: p.code,
            hint: occupied.has(p.id) ? 'Ocupada' : 'Libre',
          }))}
          title="Posición"
          searchable
        />
      </Field>
      <Field label="Nota (opcional)">
        <Input value={note} onChangeText={setNote} placeholder="Observaciones del movimiento" multiline />
      </Field>
      <Notice>
        Se guarda automáticamente vehículo, origen, destino, usuario, fecha y hora. El movimiento cuenta
        también como comprobación física.
      </Notice>
    </Modal>
  );
}

/* ------------------------------------------------------------ solicitud */

export function RequestModal({
  visible,
  vehicle,
  type,
  onClose,
  onDone,
}: {
  visible: boolean;
  vehicle: Vehicle;
  type: 'traslado' | 'preparacion';
  onClose: () => void;
  onDone?: (m: string) => void;
}) {
  const { state, user, run } = useStore();
  const puedeFijarEntrega = puedeGestionarEntrega(state, user, vehicle);
  const [prepTipo, setPrepTipo] = useState<'entrada' | 'repaso'>('entrada');
  const prepSites = state.sites.filter((s) => s.prepares);
  const destinoInicial = type === 'preparacion'
    ? (prepSites.some((s) => s.id === vehicle.targetSiteId) ? vehicle.targetSiteId! : (prepSites[0]?.id ?? ''))
    : (vehicle.targetSiteId ?? state.sites[0]?.id ?? '');
  const [siteId, setSiteId] = useState(destinoInicial);
  const [urgent, setUrgent] = useState(false);
  const [note, setNote] = useState('');

  // La empresa se propone sola según la ruta; se puede cambiar.
  const sugerida = suggestCarrier(state, vehicle.location?.siteId, siteId);
  const [carrierId, setCarrierId] = useState<string | null>(sugerida?.id ?? null);
  const [carrierTocado, setCarrierTocado] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(vehicle.deliveryDate ?? null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Regla de Urkiola: el comercial tiene que dar un mínimo de margen.
  const minimoMs = state.config.prepDeadlineHours * 3_600_000;
  const margenCorto =
    type === 'preparacion' &&
    deliveryDate !== null &&
    new Date(deliveryDate).getTime() - Date.now() < minimoMs;

  // Si cambian el destino y nadie ha tocado la empresa, se recalcula.
  const carrierElegido = carrierTocado ? carrierId : (sugerida?.id ?? null);

  const submit = () => {
    if (!siteId) {
      setAviso(type === 'preparacion' ? 'No hay ninguna sede de preparación configurada.' : 'No hay ninguna sede configurada.');
      return;
    }
    const conflicto = conflictoSolicitud(state, { requestType: type, vehicleId: vehicle.id, siteId, prepTipo });
    if (conflicto) { setAviso(conflicto); return; }
    // Si la entrega es antes del plazo mínimo, se avisa y hay que confirmar.
    if (margenCorto && !aviso) {
      setAviso(
        `La entrega es en menos de ${state.config.prepDeadlineHours} h. Se puede pedir igual, pero quedará marcada como urgente y puede no llegar.`
      );
      return;
    }

    if (type === 'preparacion' && puedeFijarEntrega && deliveryDate !== (vehicle.deliveryDate ?? null)) {
      run({ type: 'vehicle.setDelivery', vehicleId: vehicle.id, deliveryDate });
    }

    run({
      type: 'request.create',
      requestType: type,
      prepTipo: type === 'preparacion' ? prepTipo : undefined,
      vehicleId: vehicle.id,
      siteId,
      to: { siteId },
      urgent: urgent || margenCorto,
      note: note || undefined,
      carrierId: type === 'traslado' ? carrierElegido : undefined,
    });
    onDone?.(type === 'traslado' ? 'Solicitud de traslado creada.' : prepTipo === 'repaso'
      ? 'Solicitud de repaso de entrega creada.' : 'Solicitud de preparación creada.');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={type === 'traslado' ? '🚚 Solicitar traslado' : '🧽 Solicitar servicio'}
      footer={
        <Btn variant="primary" full disabled={!siteId} onPress={submit}>
          {aviso ? 'Pedir igualmente' : 'Crear solicitud'}
        </Btn>
      }
    >
      <Field label="Vehículo">
        <Muted>{vehicleTitle(vehicle)}</Muted>
      </Field>
      {type === 'preparacion' ? <Field label="Servicio">
        <Select full value={prepTipo} onChange={setPrepTipo} title="Servicio"
          options={[{ value: 'entrada', label: 'Preparación completa' },
            { value: 'repaso', label: 'Repaso de entrega' }]} />
        <Muted>{prepTipo === 'repaso' ? 'Limpieza interior y exterior, con checklist y tiempo propios.'
          : 'Preparación completa del vehículo con todos sus requisitos.'}</Muted>
      </Field> : null}
      <Field label="Origen">
        <Muted>{locationLabel(state, vehicle.location)}</Muted>
      </Field>
      <Field
        label={type === 'traslado' ? 'Sede de destino' : 'Sede que prepara'}
        hint={type === 'preparacion' ? 'Sondika solo almacena: no aparece como sede de preparación.' : undefined}
      >
        <Select
          full
          value={siteId}
          onChange={setSiteId}
          options={(type === 'preparacion' ? prepSites : state.sites).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          title="Sede"
        />
      </Field>
      {type === 'traslado' ? (
        <Field
          label="Empresa de transporte"
          hint={
            sugerida && !carrierTocado
              ? `Propuesta por la ruta: ${sugerida.name}.`
              : 'Quién hace el traslado.'
          }
        >
          <Select
            full
            value={carrierElegido}
            onChange={(v) => {
              setCarrierTocado(true);
              setCarrierId(v);
            }}
            placeholder="Sin asignar"
            options={activeCarriers(state).map((c) => ({
              value: c.id,
              label: c.name,
              hint: c.siteIds.map((id) => state.sites.find((s) => s.id === id)?.name ?? id).join(', '),
            }))}
            title="Empresa de transporte"
          />
        </Field>
      ) : null}

      {type === 'preparacion' && puedeFijarEntrega ? (
        <Field
          label="Fecha de entrega al cliente"
          hint={`Si la sabes, ponla: el plazo pasa a ser esa fecha. Easo Logistics pide ${state.config.prepDeadlineHours} h de margen como mínimo.`}
        >
          <DateField value={deliveryDate} onChange={setDeliveryDate} />
        </Field>
      ) : null}

      {margenCorto ? (
        <Notice tone={aviso ? 'danger' : 'warn'}>
          {aviso ??
            `Ojo: quedan menos de ${state.config.prepDeadlineHours} h hasta la entrega.`}
        </Notice>
      ) : null}

      {aviso && !margenCorto ? <Notice tone="warn">{aviso}</Notice> : null}
      <Checkbox checked={urgent} onToggle={() => setUrgent((u) => !u)} label="Marcar como urgente" />
      <Field label="Nota (opcional)">
        <Input value={note} onChangeText={setNote} placeholder="Detalles para el equipo" multiline />
      </Field>
    </Modal>
  );
}

/* ----------------------------------------------------------- incidencia */

export function IncidentModal({
  visible,
  vehicle,
  onClose,
  onDone,
  defaultType = 'preparacion',
}: {
  visible: boolean;
  vehicle: Vehicle;
  onClose: () => void;
  onDone?: (m: string) => void;
  defaultType?: IncidentType;
}) {
  const { run } = useStore();
  const { c } = useTheme();
  const [type, setType] = useState<IncidentType>(defaultType);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (description.trim().length < 5) {
      setError('Describe brevemente la incidencia.');
      return;
    }
    run({
      type: 'incident.create',
      vehicleId: vehicle.id,
      incidentType: type,
      description: description.trim(),
      photos,
    });
    setDescription('');
    setPhotos([]);
    setError(null);
    onDone?.('Incidencia registrada.');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="⚠️ Registrar incidencia"
      footer={
        <Btn variant="primary" full onPress={submit}>
          Registrar incidencia
        </Btn>
      }
    >
      <Field label="Vehículo">
        <Muted>{vehicleTitle(vehicle)}</Muted>
      </Field>
      <Field label="Tipo">
        <Select
          full
          value={type}
          onChange={(v) => setType(v as IncidentType)}
          options={Object.entries(INCIDENT_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          title="Tipo de incidencia"
        />
      </Field>
      <Field label="Descripción">
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Ej.: golpe en paragolpes trasero"
          multiline
        />
      </Field>
      <CampoFotos fotos={photos} onChange={setPhotos} hint="Se suben al hacerlas: así las ve todo el mundo." />
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Modal>
  );
}

/* --------------------------------------------------------- notificación */

export function NotificationRuleModal({
  visible,
  vehicle,
  onClose,
  onDone,
}: {
  visible: boolean;
  vehicle?: Vehicle;
  onClose: () => void;
  onDone?: (m: string) => void;
}) {
  const { state, run } = useStore();
  const [scopeKind, setScopeKind] = useState<'vehicle' | 'site' | 'fleet'>(vehicle ? 'vehicle' : 'fleet');
  const [scopeRef, setScopeRef] = useState<string | null>(vehicle?.id ?? null);
  const [condition, setCondition] = useState<NotifyCondition>('llegada_sede');
  const [targetSiteId, setTargetSiteId] = useState<string>(state.sites[0].id);
  // A quién le llega. Antes esto era un nombre escrito y el aviso lo veía
  // todo el mundo igual; ahora decide de verdad quién lo recibe.
  const [destino, setDestino] = useState<string>('rol:logistica');

  const destinos = useMemo(
    () => [
      { value: 'comercial', label: 'Al comercial de ese coche' },
      ...state.config.roles
        .filter((r) => !r.simple)
        .map((r) => ({ value: `rol:${r.id}`, label: `A todo el equipo de ${r.label}` })),
      { value: 'todos', label: 'A todo el mundo' },
    ],
    [state.config.roles]
  );

  const submit = () => {
    const audience: NotifyAudience =
      destino === 'todos'
        ? { kind: 'todos' }
        : destino === 'comercial'
          ? { kind: 'comercial' }
          : { kind: 'rol', roleId: destino.slice(4) };

    run({
      type: 'rule.create',
      rule: {
        scopeKind,
        scopeRef: scopeKind === 'fleet' ? null : scopeRef,
        condition,
        targetSiteId: condition === 'llegada_sede' ? targetSiteId : null,
        audience,
        // El nombre que se lee en la lista de reglas y en el propio aviso.
        recipient: destinos.find((d) => d.value === destino)?.label ?? 'Todo el mundo',
        channels: ['push', 'web'],
        active: true,
      },
    });
    onDone?.('Notificación creada.');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="🔔 Crear notificación"
      footer={
        <Btn variant="primary" full onPress={submit}>
          Crear notificación
        </Btn>
      }
    >
      <Field label="Ámbito">
        <Select
          full
          value={scopeKind}
          onChange={(v) => {
            const kind = v as 'vehicle' | 'site' | 'fleet';
            setScopeKind(kind);
            setScopeRef(kind === 'vehicle' ? vehicle?.id ?? null : kind === 'site' ? state.sites[0].id : null);
          }}
          options={[
            ...(vehicle ? [{ value: 'vehicle', label: `Este vehículo · ${vehicleTitle(vehicle)}` }] : []),
            { value: 'site', label: 'Una sede completa' },
            { value: 'fleet', label: 'Toda la flota' },
          ]}
          title="Ámbito"
        />
      </Field>

      {scopeKind === 'site' ? (
        <Field label="Sede">
          <Select
            full
            value={scopeRef ?? state.sites[0].id}
            onChange={setScopeRef}
            options={state.sites.map((s) => ({ value: s.id, label: s.name }))}
            title="Sede"
          />
        </Field>
      ) : null}

      <Field label="Condición">
        <Select
          full
          value={condition}
          onChange={(v) => setCondition(v as NotifyCondition)}
          options={Object.entries(NOTIFY_CONDITION_LABEL).map(([value, label]) => ({ value, label }))}
          title="Condición"
        />
      </Field>

      {condition === 'llegada_sede' ? (
        <Field label="Sede de llegada">
          <Select
            full
            value={targetSiteId}
            onChange={setTargetSiteId}
            options={state.sites.map((s) => ({ value: s.id, label: s.name }))}
            title="Sede de llegada"
          />
        </Field>
      ) : null}

      <Field
        label="¿A quién le llega?"
        hint="Solo lo verá quien esté aquí. Un aviso que le llega a todos deja de mirarlo todo el mundo."
      >
        <Select
          full
          value={destino}
          onChange={setDestino}
          options={destinos}
          title="¿A quién le llega?"
        />
      </Field>

      <Notice>Canal: aviso push en la app + aviso en la web.</Notice>
    </Modal>
  );
}
