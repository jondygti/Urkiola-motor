import React, { useState } from 'react';
import { Btn, Modal, Muted, Notice, Spacer, space } from '@/ui';
import { useStore } from '@/data/store';
import { can } from '@/data/selectors';
import { locationLabel, vehicleRef } from '@/data/format';
import type { Preparation } from '@/data/types';
import {
  DestinationFields,
  destinationLabel,
  firstFreeDestination,
  toLocationRef,
  type Destination,
  type DestinationShortcut,
} from '@/features/common/Destination';

/**
 * Cierre de una preparación.
 *
 * Al terminar, el coche casi nunca se queda en el box: sale al parking de
 * entregas o a una tejavana. Preguntarlo aquí ahorra el segundo viaje a la
 * pantalla de movimientos, y sobre todo evita que la ficha diga que el
 * coche sigue donde ya no está.
 */
export function FinishPrepModal({
  prep,
  visible,
  onClose,
  onDone,
}: {
  prep: Preparation;
  visible: boolean;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const { state, user, run } = useStore();
  // Quien no puede registrar movimientos termina la preparación y ya: el
  // servidor rechazaría el destino, así que aquí ni se pregunta.
  const puedeMover = can(state, user, 'movimientos.registrar');
  const vehicle = state.vehicles.find((v) => v.id === prep.vehicleId);
  const actual = vehicle?.location ?? null;
  const enLaSede = actual?.siteId === prep.siteId && !!actual?.zoneId;

  const [dest, setDest] = useState<Destination>(() =>
    enLaSede && actual
      ? { siteId: actual.siteId, zoneId: actual.zoneId ?? null, positionId: actual.positionId ?? null }
      : firstFreeDestination(state, prep.siteId)
  );

  const pendientes = prep.items.filter((i) => i.state === 'pendiente').length;

  const atajos: DestinationShortcut[] =
    enLaSede && actual
      ? [
          {
            key: 'donde-esta',
            label: `Se queda donde está · ${locationLabel(state, actual, true)}`,
            destination: {
              siteId: actual.siteId,
              zoneId: actual.zoneId ?? null,
              positionId: actual.positionId ?? null,
            },
          },
        ]
      : [];

  const terminar = (conUbicacion: boolean) => {
    const mueve = conUbicacion && puedeMover && !!dest.zoneId;
    run({ type: 'prep.finish', prepId: prep.id, to: mueve ? toLocationRef(dest) : undefined });
    const ref = vehicle ? vehicleRef(vehicle) : 'Vehículo';
    onDone?.(mueve ? `${ref} listo · en ${destinationLabel(state, dest)}` : `${ref} listo para entrega.`);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="✓ Terminar preparación"
      footer={
        puedeMover ? (
          <>
            <Btn variant="primary" full disabled={!dest.zoneId} onPress={() => terminar(true)}>
              {dest.zoneId ? `✓ Terminar y dejarlo en ${destinationLabel(state, dest)}` : '✓ Terminar'}
            </Btn>
            <Btn full onPress={() => terminar(false)}>
              Terminar sin indicar sitio
            </Btn>
          </>
        ) : (
          <Btn variant="primary" full onPress={() => terminar(false)}>
            ✓ Terminar preparación
          </Btn>
        )
      }
    >
      {pendientes > 0 ? (
        <Notice tone="warn">
          Quedan {pendientes} {pendientes === 1 ? 'requisito' : 'requisitos'} sin marcar. Al terminar se
          dan por hechos.
        </Notice>
      ) : null}

      {puedeMover ? (
        <>
          <Muted>¿Dónde dejas el coche?</Muted>
          <Spacer h={space.sm} />

          <DestinationFields value={dest} onChange={setDest} sites={false} shortcuts={atajos} compact />

          <Muted>
            Queda registrado como movimiento, con origen, usuario y hora, igual que si lo apuntaras
            aparte.
          </Muted>
        </>
      ) : (
        <Muted>El vehículo quedará apto para entrega.</Muted>
      )}
    </Modal>
  );
}
