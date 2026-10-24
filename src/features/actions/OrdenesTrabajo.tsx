import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Checkbox, Input, Modal, Muted, Panel, Pill, space, tipografia, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { siteName, vehicleName, vehicleRef } from '@/data/format';
import { LINEA_FIJA, accesoriosDeSolicitud, accesoriosPara, lineasOrden, ordenesPorAbrir, textoOrden } from '@/data/ordenTrabajo';
import type { ServiceRequest } from '@/data/types';

/**
 * Las preparaciones pedidas que todavía no tienen su orden de trabajo en
 * Quiter.
 *
 * Quiter no deja que la app abra la orden, así que la abre Jon a mano: aquí
 * tiene cada una escrita (coche, bastidor, matrícula, sede y líneas) para
 * copiarla y pegarla, y un hueco para apuntar el número cuando la ha
 * abierto. Con el número puesto sale de la lista y se ve en la preparación.
 */
export function OrdenesTrabajo({ onDone }: { onDone: (m: string) => void }) {
  const { state } = useStore();
  const pendientes = ordenesPorAbrir(state);
  return (
    <Panel icon="documento" title={`Órdenes de trabajo por abrir en Quiter · ${pendientes.length}`}>
      {pendientes.length === 0 ? (
        <Muted>Todas las preparaciones pedidas tienen su orden abierta.</Muted>
      ) : (
        pendientes.map((r, i) => <FilaOrden key={r.id} request={r} ultima={i === pendientes.length - 1} onDone={onDone} />)
      )}
    </Panel>
  );
}

function FilaOrden({ request: r, ultima, onDone }: { request: ServiceRequest; ultima: boolean; onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const [numero, setNumero] = useState('');
  const [editar, setEditar] = useState(false);
  const v = state.vehicles.find((x) => x.id === r.vehicleId);
  const ref = v ? vehicleRef(v) : r.vehicleId;

  const copiar = async () => {
    try {
      await Clipboard.setStringAsync(textoOrden(state, r));
      onDone(`Orden de ${ref} copiada: pégala en Quiter.`);
    } catch {
      onDone('No se ha podido copiar. Selecciona el texto a mano.');
    }
  };

  return (
    <View
      testID="orden-por-abrir"
      style={{ paddingVertical: space.sm, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: c.border, gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: c.text, flex: 1, minWidth: 160 }}>
          {ref}
          {v ? ` · ${vehicleName(v)}` : ''}
        </Text>
        {r.urgent ? <Pill tone="red">Urgente</Pill> : null}
        <Pill tone="neutral">{siteName(state, r.siteId)}</Pill>
      </View>
      <Text style={{ fontSize: tipografia.small, color: c.textMuted }} selectable>
        {lineasOrden(state, r).join(' · ')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Btn small icon="copias" onPress={copiar}>Copiar orden</Btn>
        <Btn small variant="ghost" onPress={() => setEditar(true)}>Accesorios</Btn>
        <View style={{ width: 140 }}>
          <Input small value={numero} onChangeText={setNumero} placeholder="Nº de orden" autoCapitalize="characters" />
        </View>
        <Btn
          small
          variant="primary"
          disabled={!numero.trim()}
          onPress={() => {
            run({ type: 'request.setOrden', requestId: r.id, numero: numero.trim() });
            onDone(`Orden ${numero.trim()} apuntada en ${ref}.`);
          }}
        >
          Apuntar
        </Btn>
      </View>
      {editar ? <EditarAccesorios request={r} onClose={() => setEditar(false)} onDone={onDone} /> : null}
    </View>
  );
}

function EditarAccesorios({ request: r, onClose, onDone }: { request: ServiceRequest; onClose: () => void; onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const v = state.vehicles.find((x) => x.id === r.vehicleId);
  const posibles = accesoriosPara(state, v?.type ?? 'VN');
  const [marcados, setMarcados] = useState<string[]>(() => accesoriosDeSolicitud(state, r).map((x) => x.id));
  return (
    <Modal
      visible
      onClose={onClose}
      icon="documento"
      title={`Accesorios · ${v ? vehicleRef(v) : r.vehicleId}`}
      footer={
        <Btn
          variant="primary"
          full
          onPress={() => {
            run({ type: 'request.setAccesorios', requestId: r.id, accesorios: marcados });
            onDone('Accesorios cambiados.');
            onClose();
          }}
        >
          Guardar
        </Btn>
      }
    >
      <Muted>{LINEA_FIJA} van siempre. Si la preparación ya está empezada, al preparador le cambia la lista.</Muted>
      <View style={{ height: space.sm }} />
      {posibles.map((x) => (
        <Checkbox
          key={x.id}
          checked={marcados.includes(x.id)}
          onToggle={() => setMarcados((m) => (m.includes(x.id) ? m.filter((y) => y !== x.id) : [...m, x.id]))}
          label={x.label}
        />
      ))}
    </Modal>
  );
}
