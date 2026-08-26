import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { radius, space, useTheme, tipografia } from '@/ui';

/** "2026-08-25T00:00:00.000Z" → "25/08/2026" */
function toText(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "25/08/2026" → ISO a las 9:00, que es cuando se entrega. */
function parse(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const d = new Date(year, Number(mm) - 1, Number(dd), 9, 0, 0, 0);
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(mm) - 1) return null;
  return d.toISOString();
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
    const iso = parse(raw);
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
    d.setHours(9, 0, 0, 0);
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
