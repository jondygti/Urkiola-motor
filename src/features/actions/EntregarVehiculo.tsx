import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Input, Modal, Muted, Notice, Spacer, space, tipografia, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { puedeGestionarEntrega } from '@/data/selectors';
import { formatDateTime, locationLabel, userName } from '@/data/format';
import type { Vehicle } from '@/data/types';

/**
 * Dar un coche por entregado al cliente.
 *
 * Es el final del recorrido y hasta ahora no existía: un coche vendido se
 * quedaba en la operativa y, sobre todo, **seguía ocupando su plaza**. En
 * una campa de cientos de huecos eso se come la campa en unos meses, y el
 * que baja a aparcar encuentra un hueco marcado como lleno que está vacío.
 *
 * Al entregarlo:
 *
 * - sale de la flota activa (deja de salir en Flota, Campa y Mis coches),
 * - su plaza queda libre para el siguiente,
 * - se cierra lo que tuviera pedido, porque nadie va a preparar ni
 *   trasladar un coche que ya no está.
 *
 * Se puede deshacer desde la propia ficha: quien se equivoca al marcarlo lo
 * descubre enseguida, y obligarle a llamar a la oficina para arreglarlo
 * hace que la siguiente vez no lo marque.
 */
export function EntregarVehiculo({
  vehicle,
  compact,
  onDone,
}: {
  vehicle: Vehicle;
  compact?: boolean;
  onDone?: (m: string) => void;
}) {
  const { state, user, run } = useStore();
  const { c } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState('');

  if (!puedeGestionarEntrega(state, user, vehicle)) return null;

  const entregado = vehicle.status === 'entregado';

  if (entregado) {
    return (
      <View style={{ gap: 6 }}>
        <Notice tone="info">
          <Text style={{ fontSize: tipografia.small, color: c.text }}>
            🏁 Entregado al cliente {vehicle.deliveredAt ? `el ${formatDateTime(vehicle.deliveredAt)}` : ''}
            {vehicle.deliveredBy ? ` · ${userName(state, vehicle.deliveredBy)}` : ''}. Ya no ocupa plaza ni
            sale en la flota.
          </Text>
        </Notice>
        <Btn
          small={compact}
          onPress={() => {
            run({ type: 'vehicle.activate', vehicleId: vehicle.id });
            onDone?.('El vehículo vuelve a la operativa. Comprueba dónde está.');
          }}
        >
          ↩ No estaba entregado
        </Btn>
      </View>
    );
  }

  const donde = locationLabel(state, vehicle.location, true);

  return (
    <>
      <Btn variant="primary" small={compact} onPress={() => setAbierto(true)}>
        🏁 Entregado al cliente
      </Btn>

      {abierto ? (
        <Modal
          visible
          onClose={() => setAbierto(false)}
          title="🏁 Entregar al cliente"
          footer={
            <>
              <Btn onPress={() => setAbierto(false)}>Cancelar</Btn>
              <Btn
                variant="primary"
                onPress={() => {
                  run({
                    type: 'vehicle.deliver',
                    vehicleId: vehicle.id,
                    note: nota.trim() || undefined,
                  });
                  setNota('');
                  setAbierto(false);
                  onDone?.('Entregado. El coche sale de la flota y su plaza queda libre.');
                }}
              >
                Sí, se lo ha llevado
              </Btn>
            </>
          }
        >
          <Muted>
            Marca esto cuando el cliente se lleva el coche. Es lo que libera el hueco de la campa para el
            siguiente.
          </Muted>
          <Spacer h={space.md} />
          <Notice tone="warn">
            <Text style={{ fontSize: tipografia.small, color: c.text }}>
              El coche deja de salir en Flota, en la campa y en Mis coches
              {vehicle.location ? `, y su sitio (${donde}) queda libre` : ''}. Lo que tuviera pedido —
              traslados y preparaciones— se cierra. Todo su historial se queda en la ficha.
            </Text>
          </Notice>
          {vehicle.status !== 'apto_entrega' ? (
            <>
              <Spacer h={space.sm} />
              <Notice tone="warn">
                <Text style={{ fontSize: tipografia.small, color: c.text }}>
                  Ojo: este coche todavía no está dado por listo para entregar. Si aún le queda trabajo,
                  no lo marques.
                </Text>
              </Notice>
            </>
          ) : null}
          <Spacer h={space.md} />
          <Input
            value={nota}
            onChangeText={setNota}
            placeholder="Nota (opcional): quién se lo lleva, matrícula definitiva…"
          />
        </Modal>
      ) : null}
    </>
  );
}
