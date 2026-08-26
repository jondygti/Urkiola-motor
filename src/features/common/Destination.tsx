import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Field, Muted, Notice, Select, radius, useTheme, tipografia } from '@/ui';
import { useAppState } from '@/data/store';
import type { AppState, Id, LocationRef } from '@/data/types';
import { locationLabel } from '@/data/format';

/** Destino de un movimiento mientras se está eligiendo en pantalla. */
export interface Destination {
  siteId: Id;
  zoneId: Id | null;
  /** null = «lo dejo en la zona, sin plaza concreta». */
  positionId: Id | null;
}

export const NO_POSITION = '__sin_plaza__';

/** Plazas ocupadas ahora mismo. Se calcula una vez y se reutiliza. */
export function occupiedPositions(state: AppState): Set<Id> {
  return new Set(state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as Id[]);
}

export function freeCount(state: AppState, zoneId: Id, occupied = occupiedPositions(state)): number {
  return state.positions.filter((p) => p.zoneId === zoneId && !occupied.has(p.id)).length;
}

/**
 * Primer destino razonable de una sede: la primera zona QUE TENGA HUECO.
 * Proponer la primera a secas deja bloqueado a quien tiene la tejavana 01
 * llena, que es justo lo normal en Sondika.
 */
export function firstFreeDestination(state: AppState, siteId: Id): Destination {
  const occupied = occupiedPositions(state);
  const zones = state.zones.filter((z) => z.siteId === siteId);
  const conHueco = zones.find((z) => freeCount(state, z.id, occupied) > 0);
  return { siteId, zoneId: (conHueco ?? zones[0])?.id ?? null, positionId: null };
}

/** Lo que espera el comando `movement.register`. */
export function toLocationRef(d: Destination): LocationRef {
  return {
    siteId: d.siteId,
    zoneId: d.zoneId ?? undefined,
    positionId: d.positionId ?? undefined,
  };
}

export function destinationLabel(state: AppState, d: Destination, short = true): string {
  return locationLabel(state, toLocationRef(d), short);
}

/** Un destino ya elegido, para pintarlo como atajo de un toque. */
export interface DestinationShortcut {
  key: string;
  label: string;
  hint?: string;
  destination: Destination;
}

/**
 * Campos de destino: sede, zona y plaza.
 *
 * La plaza es opcional a propósito. Al mover un coche por la campa nadie
 * apunta el número de plaza salvo que la controle de verdad, y una plaza
 * inventada es peor que ninguna: deja ocupado un hueco que está libre. La
 * zona sí basta para que cuadre la ocupación.
 */
export function DestinationFields({
  value,
  onChange,
  sites = true,
  shortcuts = [],
  compact,
}: {
  value: Destination;
  onChange: (d: Destination) => void;
  /** false cuando el destino está limitado a una sede (fin de preparación). */
  sites?: boolean;
  shortcuts?: DestinationShortcut[];
  compact?: boolean;
}) {
  const { c } = useTheme();
  const state = useAppState();

  const occupied = useMemo(() => occupiedPositions(state), [state]);
  const zones = useMemo(() => state.zones.filter((z) => z.siteId === value.siteId), [state, value.siteId]);
  const positions = useMemo(
    () => state.positions.filter((p) => p.zoneId === value.zoneId),
    [state.positions, value.zoneId]
  );
  const libres = positions.filter((p) => !occupied.has(p.id));
  const siguienteConHueco = zones.find((z) => z.id !== value.zoneId && freeCount(state, z.id, occupied) > 0);

  return (
    <>
      {shortcuts.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {shortcuts.map((s) => {
            const activo =
              s.destination.zoneId === value.zoneId && s.destination.siteId === value.siteId;
            return (
              <Pressable
                key={s.key}
                onPress={() => onChange(s.destination)}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: activo ? c.primary : c.border,
                  backgroundColor: activo ? c.okBg : pressed ? c.surfaceAlt : c.surface,
                  borderRadius: radius.pill,
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                })}
              >
                <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: activo ? c.primary : c.text }}>
                  {s.label}
                </Text>
                {s.hint ? <Text style={{ fontSize: tipografia.label, color: c.textMuted }}>{s.hint}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {sites ? (
        <Field label="Sede">
          <Select
            full
            value={value.siteId}
            onChange={(siteId) => onChange(firstFreeDestination(state, siteId))}
            options={state.sites.map((s) => ({
              value: s.id,
              label: s.name,
              hint: s.prepares ? 'Prepara' : 'Solo almacena',
            }))}
            title="Sede de destino"
          />
        </Field>
      ) : null}

      <Field label="Zona">
        <Select
          full
          value={value.zoneId}
          onChange={(zoneId) => onChange({ ...value, zoneId, positionId: null })}
          placeholder="Elige zona"
          options={zones.map((z) => ({
            value: z.id,
            label: z.name,
            hint: `${freeCount(state, z.id, occupied)} libres`,
          }))}
          title="Zona"
          searchable
        />
      </Field>

      <Field label="Plaza (opcional)" hint={compact ? undefined : 'Solo si sabes en cuál lo dejas.'}>
        <Select
          full
          value={value.positionId ?? NO_POSITION}
          onChange={(v) => onChange({ ...value, positionId: v === NO_POSITION ? null : v })}
          options={[
            { value: NO_POSITION, label: 'Sin plaza concreta' },
            ...positions.map((p) => ({
              value: p.id,
              label: p.code,
              hint: occupied.has(p.id) ? 'Ocupada' : 'Libre',
            })),
          ]}
          title="Plaza"
          searchable
        />
      </Field>

      {value.zoneId && libres.length === 0 ? (
        <Notice tone="warn">
          {siguienteConHueco
            ? `Esta zona está llena. ${siguienteConHueco.name} tiene ${freeCount(state, siguienteConHueco.id, occupied)} libres.`
            : 'No queda ninguna plaza libre en esta sede.'}
        </Notice>
      ) : null}

      {!value.zoneId ? <Muted>Elige la zona donde lo dejas.</Muted> : null}
    </>
  );
}
