import React, { useMemo, useState } from 'react';
import {
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { radius, space, useTheme } from './theme';
import { Btn, H2, Label, Muted } from './primitives';

/* ---------------------------------------------------------------- modal */

export function Modal({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { c, isDesktop } = useTheme();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: c.overlay,
          justifyContent: isDesktop ? 'center' : 'flex-end',
          alignItems: 'center',
          padding: isDesktop ? space.xl : 0,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: c.surface,
            borderRadius: isDesktop ? radius.lg : 0,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            width: '100%',
            maxWidth: 640,
            maxHeight: '90%',
            padding: space.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: space.sm,
            }}
          >
            <H2 style={{ marginBottom: 0, flex: 1 }}>{title}</H2>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Cerrar"
              hitSlop={10}
              style={{ paddingHorizontal: 8 }}
            >
              <Text style={{ fontSize: 24, color: c.textMuted, lineHeight: 26 }}>×</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ marginTop: space.md, gap: space.sm }}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

/* --------------------------------------------------------------- campos */

export function Field({
  label,
  children,
  hint,
  style,
}: {
  label?: string;
  children: React.ReactNode;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      {label ? <Label>{label}</Label> : null}
      <View style={{ marginTop: label ? 5 : 0 }}>{children}</View>
      {hint ? <Muted style={{ marginTop: 4 }}>{hint}</Muted> : null}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  autoCapitalize = 'sentences',
  secureTextEntry,
  small,
  big,
  autoFocus,
  onSubmitEditing,
  returnKeyType,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  small?: boolean;
  /** Campo de matrícula: letra grande, para leerlo de un vistazo en campa. */
  big?: boolean;
  autoFocus?: boolean;
  /** Enter en el teclado: encadena sin levantar la mano de la pantalla. */
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
}) {
  const { c } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.textFaint}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      secureTextEntry={secureTextEntry}
      autoFocus={autoFocus}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType ?? (onSubmitEditing ? 'go' : undefined)}
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        borderRadius: radius.md,
        paddingVertical: small ? 6 : big ? 14 : 10,
        paddingHorizontal: small ? 8 : 12,
        fontSize: small ? 12 : big ? 22 : 13,
        fontWeight: big ? '800' : '400',
        letterSpacing: big ? 1 : undefined,
        color: c.text,
        minHeight: multiline ? 84 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
      }}
    />
  );
}

export type Option<T extends string = string> = { value: T; label: string; hint?: string };

/**
 * Desplegable propio (no usamos Picker nativo para que el aspecto sea
 * idéntico en web, iOS y Android).
 */
export function Select<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = 'Seleccionar',
  small,
  title,
  full,
  searchable,
}: {
  value: T | null | undefined;
  options: Option<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  small?: boolean;
  title?: string;
  full?: boolean;
  searchable?: boolean;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!searchable || !q.trim()) return options;
    const n = q.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(n));
  }, [options, q, searchable]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
          borderRadius: radius.md,
          paddingVertical: small ? 6 : 10,
          paddingHorizontal: small ? 8 : 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          opacity: pressed ? 0.75 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
          minWidth: small ? 90 : 140,
          ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
        })}
      >
        <Text
          numberOfLines={1}
          style={{ fontSize: small ? 12 : 13, color: current ? c.text : c.textMuted, flexShrink: 1 }}
        >
          {current?.label ?? placeholder}
        </Text>
        <Text style={{ fontSize: 10, color: c.textFaint }}>▼</Text>
      </Pressable>

      <Modal visible={open} onClose={() => setOpen(false)} title={title ?? placeholder}>
        {searchable ? (
          <View style={{ marginBottom: space.sm }}>
            <Input value={q} onChangeText={setQ} placeholder="Buscar…" autoCapitalize="none" />
          </View>
        ) : null}
        {filtered.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                onChange(o.value);
                setQ('');
                setOpen(false);
              }}
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: radius.md,
                backgroundColor: active ? c.okBg : pressed ? c.surfaceSunken : 'transparent',
                marginBottom: 2,
              })}
            >
              <Text style={{ fontSize: 14, color: active ? c.okFg : c.text, fontWeight: active ? '800' : '500' }}>
                {o.label}
              </Text>
              {o.hint ? <Muted style={{ marginTop: 2 }}>{o.hint}</Muted> : null}
            </Pressable>
          );
        })}
        {filtered.length === 0 ? <Muted>Sin resultados.</Muted> : null}
      </Modal>
    </>
  );
}

/** Casilla de verificación con etiqueta. */
export function Checkbox({
  checked,
  onToggle,
  label,
  hint,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        paddingVertical: 8,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: checked ? c.primary : c.border,
          backgroundColor: checked ? c.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: c.text }}>{label}</Text>
        {hint ? <Muted style={{ marginTop: 2 }}>{hint}</Muted> : null}
      </View>
    </Pressable>
  );
}

/** Selector segmentado horizontal. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.surfaceSunken,
        borderRadius: radius.md,
        padding: 3,
        alignSelf: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: radius.sm,
              backgroundColor: active ? c.surface : 'transparent',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: active ? '800' : '600', color: active ? c.text : c.textMuted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Diálogo de confirmación reutilizable (Alert no existe igual en web). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Btn variant={destructive ? 'danger' : 'primary'} full onPress={onConfirm}>
            {confirmLabel}
          </Btn>
          <Btn full onPress={onCancel}>
            Cancelar
          </Btn>
        </>
      }
    >
      <Muted>{message}</Muted>
    </Modal>
  );
}
