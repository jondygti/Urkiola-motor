import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { radius, space, useTheme, tipografia, Select } from '@/ui';
import { parseDeliveryDate, deliveryTime } from '@/data/delivery-date';

/** "2026-08-25T00:00:00.000Z" → "25/08/2026" */
function toText(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const ATAJOS: { label: string; days: number }[] = [
  { label: 'Mañana', days: 1 },
  { label: 'En 2 días', days: 2 },
  { label: 'En 3 días', days: 3 },
  { label: 'En 1 semana', days: 7 },
];

/**
 * Campo de fecha sencillo: se escribe DD/MM/AAAA o se pulsa un atajo.
 * Sin selector nativo, para que se comporte igual en web y en Android.
 */
export function DateField({
  value,
  onChange,
  allowClear = true,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  allowClear?: boolean;
}) {
  const { c } = useTheme();
  const [text, setText] = useState(toText(value));
  const [error, setError] = useState(false);

  useEffect(() => setText(toText(value)), [value]);

  const commit = (raw: string) => {
    if (!raw.trim()) {
      setError(false);
      onChange(null);
      return;
    }
    const iso = parseDeliveryDate(raw, value);
    if (!iso) {
      setError(true);
      return;
    }
    setError(false);
    onChange(iso);
  };

  const enDias = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const previous = value ? new Date(value) : null;
    d.setHours(previous?.getHours() ?? 9, previous?.getMinutes() ?? 0, 0, 0);
    onChange(d.toISOString());
  };

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={() => commit(text)}
        onSubmitEditing={() => commit(text)}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={c.textFaint}
        keyboardType="numeric"
        style={{
          borderWidth: 1,
          borderColor: error ? c.redFg : c.border,
          backgroundColor: c.surface,
          borderRadius: radius.md,
          paddingVertical: 10,
          paddingHorizontal: 12,
          fontSize: tipografia.strong,
          color: c.text,
        }}
      />
      {error ? (
        <Text style={{ fontSize: tipografia.micro, color: c.redFg, marginTop: 4 }}>
          Escríbela como 25/08/2026.
        </Text>
      ) : null}

      {value ? (
        <View style={{ marginTop: space.sm }}>
          <Text style={{ color: c.textMuted, marginBottom: 4 }}>Hora de entrega</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Select title="Hora de entrega" value={String(new Date(value).getHours())}
              options={Array.from({ length: 24 }, (_, n) => ({ value: String(n), label: String(n).padStart(2, '0') }))}
              onChange={(hour) => onChange(deliveryTime(value, Number(hour), new Date(value).getMinutes()))} />
            <Text style={{ color: c.text }}>:</Text>
            <Select title="Minutos de entrega" value={String(new Date(value).getMinutes())}
              options={Array.from({ length: 60 }, (_, n) => ({ value: String(n), label: String(n).padStart(2, '0') }))}
              onChange={(minute) => onChange(deliveryTime(value, new Date(value).getHours(), Number(minute)))} />
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: space.sm }}>
        {ATAJOS.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => enDias(a.days)}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: pressed ? c.surfaceAlt : c.surface,
              borderRadius: radius.pill,
              paddingVertical: 6,
              paddingHorizontal: 11,
            })}
          >
            <Text style={{ fontSize: tipografia.small, color: c.text }}>{a.label}</Text>
          </Pressable>
        ))}
        {allowClear && value ? (
          <Pressable
            onPress={() => onChange(null)}
            style={{ paddingVertical: 6, paddingHorizontal: 11 }}
          >
            <Text style={{ fontSize: tipografia.small, color: c.textMuted }}>Quitar fecha</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
