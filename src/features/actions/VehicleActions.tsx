import React, { useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import {
  Btn,
  Checkbox,
  Field,
  Input,
  Modal,
  Muted,
  Notice,
  Select,
  Toolbar,
  radius,
  space,
  useTheme,
} from '@/ui';
import { useStore } from '@/data/store';
import { locationLabel, vehicleTitle } from '@/data/format';
import {
  INCIDENT_TYPE_LABEL,
  NOTIFY_CONDITION_LABEL,
  type IncidentType,
  type NotifyCondition,
  type Vehicle,
} from '@/data/types';
import { capturePhoto } from './photos';

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
  const close = () => setOpen(null);

  return (
    <>
      <Toolbar>
        <Btn variant="primary" small={compact} onPress={() => setOpen('move')}>
          📍 Registrar movimiento
        </Btn>
        <Btn small={compact} onPress={() => setOpen('transfer')}>
          🚚 Solicitar traslado
        </Btn>
        <Btn small={compact} onPress={() => setOpen('prep')}>
          🧽 Solicitar preparación
        </Btn>
        <Btn small={compact} onPress={() => setOpen('incident')}>
          📸 Incidencia
        </Btn>
        <Btn small={compact} onPress={() => setOpen('notify')}>
          🔔 Crear notificación
        </Btn>
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
  const { state, run } = useStore();
  const prepSites = state.sites.filter((s) => s.prepares);
  const [siteId, setSiteId] = useState(vehicle.targetSiteId ?? prepSites[0].id);
  const [urgent, setUrgent] = useState(false);
  const [note, setNote] = useState('');

  const submit = () => {
    run({
      type: 'request.create',
      requestType: type,
      vehicleId: vehicle.id,
      siteId,
      to: { siteId },
      urgent,
      note: note || undefined,
    });
    onDone?.(type === 'traslado' ? 'Solicitud de traslado creada.' : 'Solicitud de preparación creada.');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={type === 'traslado' ? '🚚 Solicitar traslado' : '🧽 Solicitar preparación'}
      footer={
        <Btn variant="primary" full onPress={submit}>
          Crear solicitud
        </Btn>
      }
    >
      <Field label="Vehículo">
        <Muted>{vehicleTitle(vehicle)}</Muted>
      </Field>
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

  const addPhoto = async (source: 'camera' | 'library') => {
    const uri = await capturePhoto(source);
    if (uri) setPhotos((p) => [...p, uri]);
  };

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
      <Field label={`Fotos (${photos.length})`}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn small onPress={() => addPhoto('camera')}>
            📷 Hacer foto
          </Btn>
          <Btn small onPress={() => addPhoto('library')}>
            🖼️ Elegir de galería
          </Btn>
        </View>
        {photos.length ? (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: space.sm }}>
            {photos.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={{ width: 64, height: 64, borderRadius: radius.sm, backgroundColor: c.surfaceSunken }}
              />
            ))}
          </View>
        ) : null}
      </Field>
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
  const [recipient, setRecipient] = useState<string>('Logística');

  const recipients = useMemo(
    () => [
      ...(vehicle?.salesRep ? [`Comercial asignado · ${vehicle.salesRep}`] : []),
      'Logística',
      'Responsable de sede',
      ...state.users.map((u) => u.name),
    ],
    [state.users, vehicle]
  );

  const submit = () => {
    run({
      type: 'rule.create',
      rule: {
        scopeKind,
        scopeRef: scopeKind === 'fleet' ? null : scopeRef,
        condition,
        targetSiteId: condition === 'llegada_sede' ? targetSiteId : null,
        recipient,
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

      <Field label="Destinatario">
        <Select
          full
          value={recipient}
          onChange={setRecipient}
          options={recipients.map((r) => ({ value: r, label: r }))}
          title="Destinatario"
          searchable
        />
      </Field>

      <Notice>Canal: aviso push en la app + aviso en la web.</Notice>
    </Modal>
  );
}
