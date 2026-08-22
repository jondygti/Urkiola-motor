import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, space, useTheme } from '@/ui/theme';
import { useStore } from '@/data/store';
import { timeAgo } from '@/data/format';

/**
 * Barra de estado de sincronización.
 *
 * Solo aparece cuando hay algo que contar: sin cobertura, con cambios
 * pendientes de subir o con algo rechazado por el servidor. Si todo va
 * bien no molesta.
 */
export function SyncBar() {
  const { c } = useTheme();
  const { mode, sync, flushNow } = useStore();

  // En modo demostración no hay servidor al que subir nada.
  if (mode === 'demo') return null;

  const { online, pending, syncing, error, rejected, lastSyncAt } = sync;
  const quiet = online && pending === 0 && !error && rejected.length === 0;
  if (quiet) return null;

  const tone = rejected.length > 0 ? 'red' : !online || error ? 'amber' : 'blue';
  const bg = tone === 'red' ? c.redBg : tone === 'amber' ? c.amberBg : c.blueBg;
  const fg = tone === 'red' ? c.redFg : tone === 'amber' ? c.amberFg : c.blueFg;

  const cambios = (n: number) => `${n} ${n === 1 ? 'cambio' : 'cambios'}`;
  const guardados = (n: number) => (n === 1 ? 'guardado' : 'guardados');

  let icon: string;
  let title: string;
  let detail: string;

  if (rejected.length > 0) {
    icon = '⚠️';
    title = `${rejected.length} ${rejected.length === 1 ? 'acción rechazada' : 'acciones rechazadas'} por el servidor`;
    detail = 'Hay que revisarlas a mano: avisa a administración.';
  } else if (!online) {
    icon = '📴';
    title =
      pending > 0
        ? `Sin cobertura · ${cambios(pending)} ${guardados(pending)} en el móvil`
        : 'Sin cobertura · trabajando en local';
    detail =
      pending > 0
        ? 'Se subirán solos en cuanto vuelva la conexión. Puedes seguir trabajando.'
        : 'Puedes seguir trabajando: lo que hagas se guarda y se sube después.';
  } else if (syncing) {
    icon = '⬆️';
    title = `Subiendo ${cambios(pending)}…`;
    detail = 'No cierres la app hasta que termine.';
  } else if (pending > 0) {
    icon = '⏳';
    title = `${cambios(pending)} pendientes de subir`;
    detail = error ?? 'Se reintentará en unos segundos.';
  } else {
    icon = '⚠️';
    title = 'Problema al sincronizar';
    detail = error ?? 'Se reintentará automáticamente.';
  }

  return (
    <View
      style={{
        backgroundColor: bg,
        paddingVertical: 9,
        paddingHorizontal: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 15 }}>{icon}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: fg }}>{title}</Text>
        <Text style={{ fontSize: 11, color: fg, opacity: 0.85, marginTop: 1 }}>
          {detail}
          {lastSyncAt ? ` · última subida ${timeAgo(lastSyncAt)}` : ''}
        </Text>
      </View>
      {!syncing && (pending > 0 || error) ? (
        <Pressable
          onPress={flushNow}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: fg,
            borderRadius: radius.sm,
            paddingVertical: 5,
            paddingHorizontal: 10,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 11, fontWeight: '800', color: fg }}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
