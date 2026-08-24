import React from 'react';
import { Text, View } from 'react-native';
import { radius, useTheme } from '@/ui';
import type { Deadline } from '@/data/selectors';

/** "quedan 31 h" · "vencido hace 3 h". Nada de fechas que haya que interpretar. */
export function formatRemaining(ms: number): string {
  const abs = Math.abs(ms);
  const horas = Math.floor(abs / 3_600_000);
  const minutos = Math.floor((abs % 3_600_000) / 60_000);
  if (horas >= 48) return `${Math.floor(horas / 24)} días`;
  if (horas >= 1) return `${horas} h`;
  return `${minutos} min`;
}

/**
 * Cuenta atrás del plazo comprometido. El color dice lo único que
 * importa de un vistazo: si llegas o no.
 */
export function DeadlineChip({
  deadline,
  compact,
  emptyLabel,
}: {
  deadline: Deadline;
  compact?: boolean;
  /** Qué poner cuando el reloj no ha arrancado. Por defecto, «Sin plazo aún». */
  emptyLabel?: string;
}) {
  const { c } = useTheme();
  if (deadline.remainingMs === null) {
    if (compact) return null;
    return (
      <View style={{ backgroundColor: c.surfaceSunken, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: c.textMuted }}>
          {emptyLabel ?? 'Sin plazo aún'}
        </Text>
      </View>
    );
  }

  const { overdue, atRisk, remainingMs } = deadline;
  const bg = overdue ? c.redBg : atRisk ? c.amberBg : c.okBg;
  const fg = overdue ? c.redFg : atRisk ? c.amberFg : c.okFg;
  const texto = overdue
    ? `Vencido hace ${formatRemaining(remainingMs)}`
    : `Quedan ${formatRemaining(remainingMs)}`;

  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: fg }}>{overdue ? '⏰ ' : ''}{texto}</Text>
    </View>
  );
}
