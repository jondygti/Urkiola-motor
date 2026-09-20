import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Modal, Muted, Notice, Select, Spacer, space, useTheme, tipografia } from '@/ui';
import { useStore } from '@/data/store';
import { can, esDelComercial } from '@/data/selectors';
import type { Vehicle } from '@/data/types';

const SIN = '__sin__';

/**
 * Quién lleva este coche, y poder cambiarlo.
 *
 * Antes solo se podía poner al dar de alta el vehículo, y los coches vienen
 * de Quiter sin comercial hasta que alguien los vende. Ahora se asigna en
 * cualquier momento desde la ficha.
 *
 * Dos formas, según quién mire:
 *
 * - **La oficina** (`flota.editar`) asigna a cualquiera y reasigna.
 * - **El comercial** (`flota.asignarse`) se queda un coche libre y suelta el
 *   suyo, pero no le quita uno a otro: eso se pide a la oficina, que para
 *   eso lleva la cuenta.
 */
export function ComercialVehiculo({ vehicle, onDone }: { vehicle: Vehicle; onDone?: (m: string) => void }) {
  const { state, user, run } = useStore();
  const { c } = useTheme();
  const [abierto, setAbierto] = useState(false);

  const puedeTodo = can(state, user, 'flota.editar');
  const puedeSuyos = can(state, user, 'flota.asignarse');

  const esMio = esDelComercial(vehicle, user);
  const libre = !vehicle.salesRep && !vehicle.salesRepId;

  // Los nombres que ya usa Quiter en el parque, más los comerciales de la
  // aplicación: así la oficina puede seguir escribiéndolo como Quiter.
  const nombres = useMemo(() => {
    const delParque = state.vehicles.map((v) => v.salesRep).filter((r): r is string => !!r);
    const deLaApp = state.users
      .filter((u) => u.active && can(state, u, 'flota.asignarse'))
      .map((u) => u.name);
    return [...new Set([...deLaApp, ...delParque])].sort((a, b) => a.localeCompare(b, 'es'));
  }, [state.vehicles, state.users, state.config.roles]);

  const asignar = (nombre: string | null) => {
    const candidatos = nombre
      ? state.users.filter((u) => u.active && u.role === 'comercial' && u.name.trim().toLowerCase() === nombre.trim().toLowerCase())
      : [];
    const salesRepUserId =
      nombre && user?.name.trim().toLowerCase() === nombre.trim().toLowerCase()
        ? user.id
        : candidatos.length === 1
          ? candidatos[0].id
          : null;
    run({ type: 'vehicle.setSalesRep', vehicleId: vehicle.id, salesRep: nombre, salesRepUserId });
    onDone?.(nombre ? `Asignado a ${nombre}.` : 'Vehículo sin comercial asignado.');
    setAbierto(false);
  };

  return (
    <>
      <View style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
        <Text style={{ fontSize: tipografia.label, fontWeight: '800', color: c.textFaint, marginBottom: 3 }}>COMERCIAL</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: tipografia.body, color: vehicle.salesRep ? c.text : c.textMuted, flex: 1, minWidth: 120 }}>
            {vehicle.salesRep ? `${vehicle.salesRep}${esMio ? ' · tú' : ''}` : 'Sin asignar'}
          </Text>

          {/* El caso de todos los días: el comercial se queda un coche. */}
          {puedeSuyos && !puedeTodo && libre ? (
            <Btn small variant="primary" onPress={() => asignar(user?.name ?? null)}>
              Asignármelo
            </Btn>
          ) : null}
          {puedeSuyos && !puedeTodo && esMio ? (
            <Btn small onPress={() => asignar(null)}>
              Soltarlo
            </Btn>
          ) : null}
          {puedeTodo ? (
            <Btn small onPress={() => setAbierto(true)}>
              Cambiar
            </Btn>
          ) : null}
        </View>

        {puedeSuyos && !puedeTodo && !libre && !esMio ? (
          <Text style={{ fontSize: tipografia.micro, color: c.textMuted, marginTop: 3 }}>
            Lo lleva otro comercial. Si tiene que pasar a ti, pídeselo a la oficina.
          </Text>
        ) : null}
      </View>

      {abierto ? (
        <Modal
          visible
          onClose={() => setAbierto(false)}
          title="👤 Comercial del vehículo"
          footer={
            <Btn full onPress={() => setAbierto(false)}>
              Cerrar
            </Btn>
          }
        >
          <Muted>
            Quién lleva la venta de este coche. Los coches llegan de Quiter sin comercial hasta que alguien
            los vende.
          </Muted>
          <Spacer h={space.md} />
          <Select
            full
            value={vehicle.salesRep ?? SIN}
            onChange={(v) => asignar(v === SIN ? null : v)}
            title="Comercial"
            searchable
            options={[{ value: SIN, label: 'Sin asignar' }, ...nombres.map((n) => ({ value: n, label: n }))]}
          />
          {vehicle.salesRep ? (
            <>
              <Spacer h={space.sm} />
              <Notice>
                Ahora lo lleva {vehicle.salesRep}. Al cambiarlo queda el apunte en la trazabilidad del
                vehículo, con quién lo cambió y cuándo.
              </Notice>
            </>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
