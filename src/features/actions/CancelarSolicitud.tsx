import React, { useState } from 'react';
import { Btn, Field, Input, Modal, Muted, Notice, Spacer } from '@/ui';
import { useStore } from '@/data/store';
import { motivoCancelacion } from '@/data/commands';
import type { ServiceRequest } from '@/data/types';

export function CancelarSolicitud({ request }: { request: ServiceRequest }) {
  const { state, user, run } = useStore();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (request.status === 'cancelada') return <Muted>Cancelada · {request.cancelReason}</Muted>;
  if (request.status === 'terminada' || motivoCancelacion(state, user, request)) return null;
  return <>
    <Btn small onPress={() => setOpen(true)}>Cancelar solicitud</Btn>
    <Modal visible={open} onClose={() => setOpen(false)} title="Cancelar solicitud"
      footer={<Btn variant="danger" full disabled={!reason.trim()} onPress={() => {
        const actual = state.requests.find(r => r.id === request.id);
        const rechazo = actual && motivoCancelacion(state, user, actual);
        if (!actual || rechazo) { setError(rechazo ?? 'Solicitud no disponible.'); return; }
        run({ type: 'request.cancel', requestId: request.id, reason: reason.trim() });
        setOpen(false);
      }}>Confirmar cancelación</Btn>}>
      <Notice>Se retirará el encargo de las colas activas y quedará en el histórico. La ubicación del coche no cambia.</Notice>
      <Spacer />
      <Field label="Motivo de cancelación"><Input value={reason} onChangeText={(v) => setReason(v.slice(0, 1000))} placeholder="Indica por qué se cancela" multiline /></Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Modal>
  </>;
}
