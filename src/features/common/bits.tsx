import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Pill, type Tone, useTheme } from '@/ui';
import {
  INCIDENT_TYPE_LABEL,
  PREP_RUN_STATE_LABEL,
  REQUEST_STATUS_LABEL,
  VEHICLE_STATUS_LABEL,
  type Incident,
  type IncidentStatus,
  type PrepRunState,
  type RequestStatus,
  type Situation,
  type Vehicle,
  type VehicleStatus,
  type VehicleType,
} from '@/data/types';
import { vehicleName, vehicleRef } from '@/data/format';

const STATUS_TONE: Record<VehicleStatus, Tone> = {
  recepcionado: 'blue',
  aparcado: 'blue',
  traslado_solicitado: 'amber',
  en_traslado: 'amber',
  en_preparacion: 'ok',
  apto_entrega: 'ok',
  entregado: 'neutral',
};

export function StatusPill({ status }: { status: VehicleStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{VEHICLE_STATUS_LABEL[status]}</Pill>;
}

export function TypePill({ type }: { type: VehicleType }) {
  return <Pill tone={type === 'VN' ? 'blue' : 'ok'}>{type}</Pill>;
}

export function SituationPill({ situation }: { situation: Situation }) {
  return <Pill tone={situation === 'pedido' ? 'amber' : 'ok'}>{situation === 'pedido' ? 'Pedido' : 'Stock'}</Pill>;
}

const REQUEST_TONE: Record<RequestStatus, Tone> = {
  solicitada: 'amber',
  asignada: 'blue',
  en_ruta: 'blue',
  en_curso: 'ok',
  terminada: 'neutral',
  bloqueada: 'red',
};

export function RequestStatusPill({ status, urgent }: { status: RequestStatus; urgent?: boolean }) {
  if (urgent && status !== 'terminada') return <Pill tone="red">Urgente</Pill>;
  return <Pill tone={REQUEST_TONE[status]}>{REQUEST_STATUS_LABEL[status]}</Pill>;
}

const PREP_TONE: Record<PrepRunState, Tone> = {
  pendiente: 'amber',
  en_curso: 'ok',
  en_espera: 'amber',
  bloqueado: 'red',
  terminado: 'neutral',
};

export function PrepStatePill({ runState, overSla }: { runState: PrepRunState; overSla?: boolean }) {
  if (overSla && runState !== 'terminado') return <Pill tone="red">Fuera SLA</Pill>;
  return <Pill tone={PREP_TONE[runState]}>{PREP_RUN_STATE_LABEL[runState]}</Pill>;
}

const INCIDENT_TONE: Record<IncidentStatus, Tone> = {
  abierta: 'red',
  pendiente: 'amber',
  cerrada: 'neutral',
};

export function IncidentStatusPill({ status }: { status: IncidentStatus }) {
  return (
    <Pill tone={INCIDENT_TONE[status]}>
      {status === 'abierta' ? 'Abierta' : status === 'pendiente' ? 'Pendiente' : 'Cerrada'}
    </Pill>
  );
}

export function IncidentTypeLabel({ incident }: { incident: Incident }) {
  const { c } = useTheme();
  return <Text style={{ fontSize: 12, color: c.text }}>{INCIDENT_TYPE_LABEL[incident.type]}</Text>;
}

/** Celda de vehículo: nombre + referencia operativa. */
export function VehicleCell({ vehicle }: { vehicle: Vehicle | undefined }) {
  const { c } = useTheme();
  if (!vehicle) return <Text style={{ fontSize: 12, color: c.textMuted }}>—</Text>;
  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{vehicleRef(vehicle)}</Text>
      <Text style={{ fontSize: 11, color: c.textMuted }}>{vehicleName(vehicle)}</Text>
    </View>
  );
}

/** Texto sencillo con el estilo de tabla. */
export function Cell({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  const { c } = useTheme();
  return (
    <Text style={{ fontSize: 12, color: muted ? c.textMuted : c.text }} numberOfLines={2}>
      {children}
    </Text>
  );
}

/** Enlace a la ficha 360º de un vehículo. */
export function useOpenVehicle() {
  const router = useRouter();
  return (vehicleId: string) => router.push(`/vehiculo/${vehicleId}` as never);
}
