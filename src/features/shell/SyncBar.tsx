import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, space, tipografia, useTheme } from '@/ui/theme';
import { Btn, Muted } from '@/ui/primitives';
import { Modal } from '@/ui/controls';
import { useStore, type RejectedCommand } from '@/data/store';
import { formatDateTime, timeAgo, vehicleRef } from '@/data/format';
import { Icon, type IconName } from '@/ui/Icon';
import type { Command } from '@/data/commands';

/** Qué era la acción, dicho como lo diría quien la hizo. */
const QUE_ERA: Partial<Record<Command['type'], string>> = {
  'incident.create': 'Incidencia',
  'incident.close': 'Cerrar incidencia',
  'movement.register': 'Movimiento',
  'vehicle.check': 'Comprobación',
  'request.create': 'Solicitud',
  'request.update': 'Cambio de una solicitud',
  'prep.create': 'Abrir preparación',
  'prep.start': 'Empezar preparación',
  'prep.pause': 'Pausar preparación',
  'prep.item': 'Requisito de preparación',
  'prep.finish': 'Terminar preparación',
  'count.finding': 'Coche contado',
  'reception.line': 'Coche descargado',
  'vehicle.setKeys': 'Llaves',
  'vehicle.deliver': 'Entrega al cliente',
  'suelto.empezar': 'Carrocería',
  'suelto.terminar': 'Terminar carrocería',
};

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
  const [revisar, setRevisar] = useState(false);
  const hayRechazadas = sync.rejected.length > 0;
  // Cuando ya no queda ninguna, la ventana se cierra; si no, se abriría sola
  // la próxima vez que se rechazara algo.
  useEffect(() => {
    if (!hayRechazadas) setRevisar(false);
  }, [hayRechazadas]);

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

  let icon: IconName;
  let title: string;
  let detail: string;

  if (rejected.length > 0) {
    icon = 'aviso';
    title = `${rejected.length} ${rejected.length === 1 ? 'acción rechazada' : 'acciones rechazadas'} por el servidor`;
    detail = 'Pulsa «Revisar» para ver cuál y volver a intentarlo o descartarla.';
  } else if (!online) {
    icon = 'sinCobertura';
    title =
      pending > 0
        ? `Sin cobertura · ${cambios(pending)} ${guardados(pending)} en el móvil`
        : 'Sin cobertura · trabajando en local';
    detail =
      pending > 0
        ? 'Se subirán solos en cuanto vuelva la conexión. Puedes seguir trabajando.'
        : 'Puedes seguir trabajando: lo que hagas se guarda y se sube después.';
  } else if (syncing) {
    icon = 'subiendo';
    title = `Subiendo ${cambios(pending)}…`;
    detail = 'No cierres la app hasta que termine.';
  } else if (pending > 0) {
    icon = 'esperando';
    title = `${cambios(pending)} pendientes de subir`;
    detail = error ?? 'Se reintentará en unos segundos.';
  } else {
    icon = 'aviso';
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
      <Icon name={icon} size={tipografia.heading} color={fg} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: fg }}>{title}</Text>
        <Text style={{ fontSize: tipografia.micro, color: fg, opacity: 0.85, marginTop: 1 }}>
          {detail}
          {lastSyncAt ? ` · última subida ${timeAgo(lastSyncAt)}` : ''}
        </Text>
      </View>
      {rejected.length > 0 ? (
        <Pressable
          onPress={() => setRevisar(true)}
          accessibilityLabel="Revisar acciones rechazadas"
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: fg,
            borderRadius: radius.sm,
            paddingVertical: 5,
            paddingHorizontal: 10,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: tipografia.micro, fontWeight: '800', color: fg }}>Revisar</Text>
        </Pressable>
      ) : !syncing && (pending > 0 || error) ? (
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
          <Text style={{ fontSize: tipografia.micro, fontWeight: '800', color: fg }}>Reintentar</Text>
        </Pressable>
      ) : null}
      {revisar && hayRechazadas ? <RevisarRechazadas onClose={() => setRevisar(false)} /> : null}
    </View>
  );
}

/**
 * Las acciones que el servidor no aceptó, una a una, con el motivo.
 *
 * Antes solo había un aviso rojo que no se podía quitar, ni aunque el fallo
 * ya estuviera arreglado. Ahora se puede reintentar (si era un fallo de la
 * app o de la red, entra) o descartar (si de verdad no procede).
 */
function RevisarRechazadas({ onClose }: { onClose: () => void }) {
  const { state, sync, reintentarRechazada, descartarRechazada } = useStore();
  const { c } = useTheme();
  const lista = sync.rejected;
  const coche = (r: RejectedCommand) => {
    const id = 'vehicleId' in r.command ? r.command.vehicleId : undefined;
    const v = id ? state.vehicles.find((x) => x.id === id) : undefined;
    return v ? vehicleRef(v) : null;
  };
  return (
    <Modal visible onClose={onClose} icon="aviso" title="Acciones rechazadas">
      {lista.map((r) => (
        <View
          key={r.command.id}
          testID="accion-rechazada"
          style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, gap: 6 }}
        >
          <Text style={{ fontSize: tipografia.strong, fontWeight: '800', color: c.text }}>
            {QUE_ERA[r.command.type] ?? r.command.type}
            {coche(r) ? ` · ${coche(r)}` : ''}
          </Text>
          <Muted>Hecha el {formatDateTime(r.command.at)} · rechazada {timeAgo(r.at)}</Muted>
          <Text style={{ fontSize: tipografia.small, color: c.redFg }}>Motivo: {r.reason}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn small variant="primary" icon="sincronizar" onPress={() => reintentarRechazada(r.command.id)}>
              Reintentar
            </Btn>
            <Btn small variant="ghost" onPress={() => descartarRechazada(r.command.id)}>
              Descartar
            </Btn>
          </View>
        </View>
      ))}
      <Muted>
        Reintentar la vuelve a mandar tal cual, con sus fotos: si el problema ya está arreglado, entra. Descartar la
        quita de este móvil para siempre.
      </Muted>
    </Modal>
  );
}
