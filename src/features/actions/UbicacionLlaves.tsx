import React, { useState } from 'react';
import { Btn, Field, Input, Modal, Muted } from '@/ui';
import { useStore } from '@/data/store';
import { can, isSimpleRole } from '@/data/selectors';
import type { Vehicle } from '@/data/types';

export function UbicacionLlaves({ vehicle }: { vehicle: Vehicle }) {
  const { state, user, run } = useStore();
  const [open, setOpen] = useState(false);
  const [principal, setPrincipal] = useState('');
  const [segunda, setSegunda] = useState('');
  const [original, setOriginal] = useState({ primary: '', secondary: '' });
  const editable = !isSimpleRole(state, user) && (can(state, user, 'flota.editar') || can(state, user, 'movimientos.registrar'));
  return <>
    {vehicle.primaryKeyLocation ? <Muted>Llave principal: {vehicle.primaryKeyLocation}</Muted> : null}
    {vehicle.secondaryKeyLocation ? <Muted>Segunda llave: {vehicle.secondaryKeyLocation}</Muted> : null}
    {editable ? <Btn small onPress={() => { setPrincipal(vehicle.primaryKeyLocation ?? ''); setSegunda(vehicle.secondaryKeyLocation ?? ''); setOriginal({ primary: vehicle.primaryKeyLocation ?? '', secondary: vehicle.secondaryKeyLocation ?? '' }); setOpen(true); }}>Ubicación de llaves</Btn> : null}
    <Modal visible={open} onClose={() => setOpen(false)} title="Ubicación de llaves"
      footer={<Btn full variant="primary" onPress={() => {
        if (principal !== original.primary || segunda !== original.secondary) run({ type: 'vehicle.setKeys', vehicleId: vehicle.id, ...(principal !== original.primary ? { primary: principal } : {}), ...(segunda !== original.secondary ? { secondary: segunda } : {}) }); setOpen(false);
      }}>Guardar llaves</Btn>}>
      <Field label="Llave principal (opcional)"><Input value={principal} onChangeText={(v) => setPrincipal(v.slice(0, 200))} placeholder="Ej.: Recepción Leioa" /></Field>
      <Field label="Segunda llave (opcional)"><Input value={segunda} onChangeText={(v) => setSegunda(v.slice(0, 200))} placeholder="Ej.: Caja fuerte comercial" /></Field>
      <Muted>Puedes dejar cualquiera vacía. Mover el vehículo no modifica estas ubicaciones.</Muted>
    </Modal>
  </>;
}
