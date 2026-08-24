import React, { useState } from 'react';
import { View } from 'react-native';
import { Btn, Field, Input, Modal, Muted, Notice, Select, Spacer, space } from '@/ui';
import { useStore } from '@/data/store';
import { vehicleByRef } from '@/data/selectors';
import type { LocationRef, Situation, VehicleType } from '@/data/types';
import { vehicleName, vehicleRef } from '@/data/format';

/**
 * Alta manual de un vehículo.
 *
 * Lo único obligatorio son los 8 últimos del bastidor: es lo que se ve en
 * el parabrisas y lo que trae el albarán. Todo lo demás se puede rellenar
 * ahora o dejar para cuando llegue el volcado de Quiter, que completa los
 * datos comerciales sin tocar nada de lo logístico.
 *
 * Sirve para dos casos: un coche que no está en Quiter todavía, y uno que
 * baja de un camión sin estar registrado y hay que descargar igual.
 */
export function NuevoVehiculoModal({
  visible,
  onClose,
  onDone,
  /** Bastidor de partida, cuando se abre desde la descarga de un camión. */
  refInicial,
  /** Dónde queda al darlo de alta, si ya se sabe. */
  location,
}: {
  visible: boolean;
  onClose: () => void;
  onDone?: (mensaje: string, vehicleId: string) => void;
  refInicial?: string;
  location?: LocationRef | null;
}) {
  const { state, run } = useStore();
  const [vin8, setVin8] = useState(refInicial ?? '');
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [type, setType] = useState<VehicleType>('VN');
  const [situation, setSituation] = useState<Situation>('stock');
  const [salesRep, setSalesRep] = useState<string | null>(null);

  // Si se abre desde el camión, el bastidor viene puesto y no hay que
  // volver a teclearlo.
  React.useEffect(() => {
    if (visible) setVin8(refInicial ?? '');
  }, [visible, refInicial]);

  const limpio = vin8.trim().toUpperCase().replace(/\s+/g, '');
  const yaExiste = limpio.length > 3 ? vehicleByRef(state, limpio) : undefined;
  const comerciales = Array.from(
    new Set(state.vehicles.map((v) => v.salesRep).filter((r): r is string => !!r))
  ).sort();

  const alta = () => {
    if (limpio.length < 4) return;
    run({
      type: 'vehicle.create',
      vin8: limpio,
      plate: plate.trim() || null,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      vehicleType: type,
      situation,
      salesRep,
      location: location ?? null,
    });
    onDone?.(`${limpio} dado de alta.`, `v-${limpio}`);
    setVin8('');
    setPlate('');
    setBrand('');
    setModel('');
    setSalesRep(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="➕ Dar de alta un vehículo"
      footer={
        <Btn variant="primary" full onPress={alta} disabled={limpio.length < 4 || !!yaExiste}>
          {yaExiste ? 'Ese vehículo ya existe' : 'Dar de alta'}
        </Btn>
      }
    >
      <Muted>
        Con el bastidor basta. La marca, el modelo y el comercial los completará Quiter cuando llegue su
        volcado; lo que se haga aquí con el coche (ubicación, movimientos, preparación) no se pierde.
      </Muted>
      <Spacer h={space.md} />

      <Field label="VIN-8 (8 últimos del bastidor)" hint="Es lo que va en el albarán y en el parabrisas.">
        <Input
          value={vin8}
          onChangeText={setVin8}
          placeholder="Ej. 34567890"
          autoCapitalize="characters"
        />
      </Field>

      {yaExiste ? (
        <Notice tone="warn">
          Ya está en el parque: {vehicleName(yaExiste)} · {vehicleRef(yaExiste)}. No hace falta darlo de alta.
        </Notice>
      ) : null}

      <Field label="Matrícula (si la tiene)">
        <Input value={plate} onChangeText={setPlate} placeholder="1234 ABC" autoCapitalize="characters" />
      </Field>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Tipo">
            <Select
              full
              value={type}
              onChange={(v) => setType(v as VehicleType)}
              options={[
                { value: 'VN', label: 'VN · nuevo' },
                { value: 'VO', label: 'VO · ocasión' },
              ]}
              title="Tipo"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Situación">
            <Select
              full
              value={situation}
              onChange={(v) => setSituation(v as Situation)}
              options={[
                { value: 'stock', label: 'Stock' },
                { value: 'pedido', label: 'Pedido' },
              ]}
              title="Situación"
            />
          </Field>
        </View>
      </View>

      <Field label="Marca">
        <Input value={brand} onChangeText={setBrand} placeholder="Se completará con Quiter" />
      </Field>
      <Field label="Modelo">
        <Input value={model} onChangeText={setModel} placeholder="Se completará con Quiter" />
      </Field>

      <Field label="Comercial (opcional)">
        <Select
          full
          value={salesRep}
          onChange={setSalesRep}
          placeholder="Sin asignar"
          options={comerciales.map((r) => ({ value: r, label: r }))}
          title="Comercial"
          searchable
        />
      </Field>
    </Modal>
  );
}
