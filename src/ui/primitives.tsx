import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { radius, space, tipografia, useTheme } from './theme';
import { Icon, type IconName } from './Icon';

/* ---------------------------------------------------------------- textos */

export function H1({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Text style={{ fontSize: tipografia.display, fontWeight: '900', color: c.text, marginBottom: 4 }}>
      {children}
    </Text>
  );
}

export function H2({
  children,
  style,
  icon,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  /** Icono delante del título, del color de marca. */
  icon?: IconName;
}) {
  const { c } = useTheme();
  const titulo = (
    <Text style={[{ fontSize: tipografia.strong, fontWeight: '800', color: c.text, marginBottom: 10 }, style]}>
      {children}
    </Text>
  );
  if (!icon) return titulo;
  // El icono va fuera del texto y no dentro: si el título ocupa dos líneas,
  // la segunda empieza bajo la primera letra y no bajo el icono.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Icon name={icon} color={c.primary} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>{titulo}</View>
    </View>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: c.text }}>{children}</Text>;
}

export function Txt({
  children,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { c } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontSize: tipografia.body, color: c.text }, style]}>
      {children}
    </Text>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ fontSize: tipografia.small, color: c.textMuted, lineHeight: 17 }, style]}>{children}</Text>;
}

/** Etiqueta pequeña en mayúsculas, como los `<small>` de las tarjetas del mockup. */
export function Label({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Text style={{ fontSize: tipografia.label, fontWeight: '800', color: c.textFaint, letterSpacing: 0.4 }}>
      {String(children).toUpperCase()}
    </Text>
  );
}

/* --------------------------------------------------------------- layout */

export function Screen({ children }: { children: React.ReactNode }) {
  const { c, isDesktop } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        padding: isDesktop ? space.xl : space.md,
        paddingBottom: 96,
        maxWidth: 1500,
        width: '100%',
        alignSelf: 'center',
      }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Panel({
  children,
  style,
  title,
  icon,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  title?: React.ReactNode;
  /** Icono del título. Los títulos no llevan emojis: llevan esto. */
  icon?: IconName;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radius.lg,
          padding: space.lg,
        },
        style,
      ]}
    >
      {title ? <H2 icon={icon}>{title}</H2> : null}
      {children}
    </View>
  );
}

/**
 * Rejilla responsive. `cols` es el máximo de columnas y `minWidth` el ancho
 * mínimo que debe tener cada celda: se mide el contenedor real (no la
 * ventana) para que funcione igual con el menú lateral abierto o cerrado.
 */
export function Grid({
  children,
  cols = 2,
  minWidth,
  gap = space.md,
}: {
  children: React.ReactNode;
  cols?: number;
  minWidth?: number;
  gap?: number;
}) {
  const { isDesktop } = useTheme();
  const [available, setAvailable] = React.useState(0);
  const items = React.Children.toArray(children).filter(Boolean);

  let columns = cols;
  if (minWidth) {
    columns = available > 0 ? Math.max(1, Math.min(cols, Math.floor((available + gap) / (minWidth + gap)))) : 1;
  } else if (!isDesktop) {
    columns = 1;
  }

  // Se redondea a la baja para que 3 celdas + 2 huecos nunca superen el ancho
  // medido por un decimal y acaben saltando de línea.
  const cellWidth = columns === 1 ? '100%' : Math.floor((available - gap * (columns - 1)) / columns);

  return (
    <View
      onLayout={(e) => {
        const w = Math.floor(e.nativeEvent.layout.width);
        if (w !== available) setAvailable(w);
      }}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width: '100%' }}
    >
      {items.map((child, i) => (
        <View key={i} style={{ width: cellWidth, minWidth: 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Barra de acciones: se envuelve en escritorio y hace scroll horizontal en móvil. */
export function Toolbar({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useTheme();
  if (isDesktop) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.md }}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginVertical: space.md, flexGrow: 0 }}
      contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}
    >
      {children}
    </ScrollView>
  );
}

export function Row({
  children,
  gap = space.sm,
  style,
  wrap = true,
  align = 'center',
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
  align?: ViewStyle['alignItems'];
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', gap, alignItems: align },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Spacer({ h = space.md }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.borderSoft, marginVertical: space.sm }} />;
}

/* -------------------------------------------------------------- píldoras */

export type Tone = 'ok' | 'amber' | 'red' | 'blue' | 'neutral';

export function toneColors(c: ReturnType<typeof useTheme>['c'], tone: Tone) {
  switch (tone) {
    case 'amber':
      return { bg: c.amberBg, fg: c.amberFg };
    case 'red':
      return { bg: c.redBg, fg: c.redFg };
    case 'blue':
      return { bg: c.blueBg, fg: c.blueFg };
    case 'neutral':
      return { bg: c.surfaceSunken, fg: c.textMuted };
    default:
      return { bg: c.okBg, fg: c.okFg };
  }
}

export function Pill({ children, tone = 'ok', icon }: { children: React.ReactNode; tone?: Tone; icon?: IconName }) {
  const { c } = useTheme();
  const { bg, fg } = toneColors(c, tone);
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingVertical: 4,
        paddingHorizontal: 9,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {icon ? <Icon name={icon} size={tipografia.small} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: tipografia.label, fontWeight: '800' }}>{children}</Text>
    </View>
  );
}

/** Un chip con su icono delante. */
export type StatItem = React.ReactNode | { icon: IconName; text: React.ReactNode };

function esConIcono(it: StatItem): it is { icon: IconName; text: React.ReactNode } {
  return typeof it === 'object' && it !== null && 'icon' in it && 'text' in it;
}

/** Chips informativos (`.statline` del mockup). */
export function StatLine({ items }: { items: StatItem[] }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: space.sm }}>
      {items.map((it, i) => (
        <View
          key={i}
          style={{
            backgroundColor: c.surfaceSunken,
            borderRadius: radius.sm,
            paddingVertical: 6,
            paddingHorizontal: 9,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {esConIcono(it) ? <Icon name={it.icon} size={tipografia.small} color={c.textMuted} /> : null}
          <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>{esConIcono(it) ? it.text : it}</Text>
        </View>
      ))}
    </View>
  );
}

/* --------------------------------------------------------------- avisos */

export function Notice({
  children,
  tone = 'info',
  onPress,
  icon,
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warn' | 'danger';
  onPress?: () => void;
  icon?: IconName;
}) {
  const { c } = useTheme();
  const bg = tone === 'danger' ? c.noticeDangerBg : tone === 'warn' ? c.noticeWarnBg : c.noticeBg;
  const colorIcono = tone === 'danger' ? c.redFg : tone === 'warn' ? c.amberFg : c.okFg;
  const contenido =
    typeof children === 'string' ? (
      <Text style={{ fontSize: tipografia.small, color: c.text, lineHeight: 17 }}>{children}</Text>
    ) : (
      children
    );
  const body = (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.md,
        padding: 11,
        marginVertical: 4,
        ...(icon ? { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8 } : null),
      }}
    >
      {icon ? (
        <>
          <Icon name={icon} size={tipografia.strong} color={colorIcono} />
          <View style={{ flex: 1, minWidth: 0 }}>{contenido}</View>
        </>
      ) : (
        contenido
      )}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

/** Caja destacada de explicación (`.topnote`). */
export function TopNote({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.noteBg,
        borderWidth: 1,
        borderColor: c.noteBorder,
        borderRadius: radius.md,
        padding: 11,
        marginVertical: 6,
      }}
    >
      {typeof children === 'string' ? (
        <Text style={{ fontSize: tipografia.small, color: c.text, lineHeight: 17 }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

/* --------------------------------------------------------- kpis y fichas */

export function Kpi({
  label,
  value,
  hint,
  tone,
  onPress,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'red' | 'amber' | 'ok';
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const color = tone === 'red' ? c.redFg : tone === 'amber' ? c.amberFg : tone === 'ok' ? c.okFg : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.lg,
        padding: 13,
        opacity: pressed ? 0.75 : 1,
        minHeight: 84,
        justifyContent: 'center',
      })}
    >
      <Label>{label}</Label>
      <Text style={{ fontSize: tipografia.display, fontWeight: '900', color, marginVertical: 3 }}>{value}</Text>
      {hint ? <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>{hint}</Text> : null}
    </Pressable>
  );
}

/** Par etiqueta/valor de las fichas (`.detail`). */
export function Detail({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  /** Una línea para explicar el dato cuando el nombre no basta. */
  hint?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
      <Text style={{ fontSize: tipografia.label, fontWeight: '800', color: c.textFaint, marginBottom: 3 }}>
        {label.toUpperCase()}
      </Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={{ fontSize: tipografia.body, color: c.text }}>{value}</Text>
      ) : (
        value
      )}
      {hint ? (
        <Text style={{ fontSize: tipografia.micro, color: c.textMuted, marginTop: 3 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- progreso */

export function ProgressBar({ pct, tone }: { pct: number; tone?: Tone }) {
  const { c } = useTheme();
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const color = tone ? toneColors(c, tone).fg : c.accent;
  return (
    <View style={{ height: 9, backgroundColor: c.trackBg, borderRadius: radius.sm, overflow: 'hidden' }}>
      <View style={{ width: `${clamped}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

/** Flujo de estados (`.state-flow`). */
export function StateFlow({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <View
            style={{
              backgroundColor: i <= activeIndex ? c.okBg : c.surfaceSunken,
              borderRadius: radius.sm,
              paddingVertical: 7,
              paddingHorizontal: 9,
            }}
          >
            <Text
              style={{
                fontSize: tipografia.label,
                fontWeight: '800',
                color: i <= activeIndex ? c.okFg : c.textMuted,
              }}
            >
              {s}
            </Text>
          </View>
          {i < steps.length - 1 ? <Text style={{ color: c.textFaint }}>→</Text> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

/** Línea de tiempo (`.timeline`). */
export function Timeline({
  events,
}: {
  events: { title: string; detail?: string; onPress?: () => void }[];
}) {
  const { c } = useTheme();
  if (!events.length) return <Muted>Sin actividad registrada.</Muted>;
  return (
    <View style={{ borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 16 }}>
      {events.map((e, i) => (
        <Pressable
          key={i}
          onPress={e.onPress}
          disabled={!e.onPress}
          style={{ marginBottom: 14, position: 'relative' }}
        >
          <View
            style={{
              position: 'absolute',
              left: -21,
              top: 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: c.accent,
            }}
          />
          <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: c.text }}>{e.title}</Text>
          {e.detail ? (
            <Text style={{ fontSize: tipografia.micro, color: c.textMuted, marginTop: 3 }}>{e.detail}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------- botones */

export function Btn({
  children,
  onPress,
  variant = 'default',
  disabled,
  loading,
  full,
  small,
  icon,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  small?: boolean;
  /** Icono delante del texto, del mismo color que el texto. */
  icon?: IconName;
  /** Obligatorio si el botón es solo un icono: el icono no se lee en voz alta. */
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';

  const bg = isPrimary ? c.primary : isDanger ? c.redFg : isGhost ? 'transparent' : c.surface;
  const fg = isPrimary || isDanger ? '#fff' : isGhost ? c.textMuted : c.text;
  const border = isPrimary ? c.primary : isDanger ? c.redFg : isGhost ? 'transparent' : c.border;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        borderRadius: radius.md,
        paddingVertical: small ? 7 : 10,
        paddingHorizontal: small ? 10 : 14,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        width: full ? '100%' : undefined,
        alignSelf: full ? 'stretch' : 'flex-start',
        ...(Platform.OS === 'web' ? ({ cursor: disabled ? 'not-allowed' : 'pointer' } as object) : null),
      })}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      {icon && !loading ? <Icon name={icon} size={small ? tipografia.body : tipografia.strong} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? tipografia.small : tipografia.body }}>
        {children}
      </Text>
    </Pressable>
  );
}

/* --------------------------------------------------------------- varios */

export function EmptyState({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ padding: space.xl, alignItems: 'center' }}>
      <Text style={{ color: c.textMuted, fontSize: tipografia.body, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export function Code({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.codeBg, borderRadius: radius.md, padding: 12 }}>
      <Text
        style={{
          color: c.codeFg,
          fontSize: tipografia.micro,
          lineHeight: 17,
          fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
        }}
      >
        {children}
      </Text>
    </View>
  );
}
