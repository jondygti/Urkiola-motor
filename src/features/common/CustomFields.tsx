import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Field, Muted, Segmented, Select, radius, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import type { CustomField, Vehicle } from '@/data/types';

const SIN_VALOR = '__vacio__';

/**
 * Campos propios de un vehículo, los que se hayan definido en
 * Administración → Flota y columnas. Si no hay ninguno, no pinta nada.
 */
export function CustomFields({ vehicle }: { vehicle: Vehicle }) {
  const { state, run } = useStore();
  const fields = state.config.customFields;
  if (fields.length === 0) {
    return <Muted>No hay campos propios definidos. Se crean en Administración → Flota y columnas.</Muted>;
  }

  const set = (field: CustomField, value: string) =>
    run({ type: 'vehicle.setCustom', vehicleId: vehicle.id, fieldId: field.id, value });

  return (
    <View>
      {fields.map((field) => {
        const value = vehicle.custom?.[field.id] ?? '';
        return (
          <Field key={field.id} label={field.label}>
            {field.type === 'lista' ? (
              <Select
                full
                value={value || SIN_VALOR}
                onChange={(v) => set(field, v === SIN_VALOR ? '' : v)}
                options={[
                  { value: SIN_VALOR, label: 'Sin valor' },
                  ...field.options.map((o) => ({ value: o, label: o })),
                ]}
                title={field.label}
              />
            ) : field.type === 'si_no' ? (
              <Segmented
                value={value || SIN_VALOR}
                onChange={(v) => set(field, v === SIN_VALOR ? '' : v)}
                options={[
                  { value: 'si', label: 'Sí' },
                  { value: 'no', label: 'No' },
                  { value: SIN_VALOR, label: '—' },
                ]}
              />
            ) : (
              <CommitOnBlurInput
                value={value}
                numeric={field.type === 'numero'}
                onCommit={(v) => set(field, v)}
              />
            )}
          </Field>
        );
      })}
    </View>
  );
}

/** Campo de texto que solo guarda al salir, para no lanzar un comando por tecla. */
function CommitOnBlurInput({
  value,
  numeric,
  onCommit,
}: {
  value: string;
  numeric?: boolean;
  onCommit: (v: string) => void;
}) {
  const { c } = useTheme();
  const [draft, setDraft] = useState(value);

  // Si el valor cambia por otra vía (otro usuario, sincronización), se refleja.
  useEffect(() => setDraft(value), [value]);

  return (
    <TextInput
      value={draft}
      onChangeText={(t) => setDraft(numeric ? t.replace(/[^0-9.,-]/g, '') : t)}
      onBlur={() => {
        if (draft !== value) onCommit(draft.trim());
      }}
      keyboardType={numeric ? 'numeric' : 'default'}
      placeholder="Sin valor"
      placeholderTextColor={c.textFaint}
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        borderRadius: radius.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        fontSize: 13,
        color: c.text,
      }}
    />
  );
}
