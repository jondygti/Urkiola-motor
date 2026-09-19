import React, { useState } from 'react';
import { Btn, Detail, Field, Modal, Select, Spacer, space } from '@/ui';
import { useStore } from '@/data/store';
import { usePerms } from '@/features/common/Guard';
import type { CommercialArea, CommercialCategory, Vehicle } from '@/data/types';

const CATEGORIAS: { value: CommercialCategory; label: string }[] = [
  { value: 'VN', label: 'VN' },
  { value: 'KM0', label: 'KM0' },
  { value: 'DEMO', label: 'Demo' },
  { value: 'VO', label: 'VO' },
];

const AREAS: { value: CommercialArea; label: string; hint: string }[] = [
  { value: 'vn', label: 'Stock VN', hint: 'Lo dirige el responsable de sus marcas.' },
  { value: 'vo', label: 'Stock VO', hint: 'Lo dirige el Responsable VO, sea cual sea el comercial.' },
];

export function ClasificacionComercial({
  vehicle,
  onDone,
}: {
  vehicle: Vehicle;
  onDone?: (message: string) => void;
}) {
  const { run } = useStore();
  const { can } = usePerms();
  const actualArea: CommercialArea = vehicle.commercialArea ?? (vehicle.type === 'VO' ? 'vo' : 'vn');
  const actualCategory: CommercialCategory =
    vehicle.commercialCategory ?? (vehicle.type === 'VO' ? 'VO' : 'VN');

  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<CommercialArea>(actualArea);
  const [category, setCategory] = useState<CommercialCategory>(actualCategory);

  const abrir = () => {
    setArea(actualArea);
    setCategory(actualCategory);
    setOpen(true);
  };

  const guardar = () => {
    run({
      type: 'vehicle.setCommercial',
      vehicleId: vehicle.id,
      commercialArea: area,
      commercialCategory: category,
    });
    onDone?.(`Clasificación comercial: ${category} · ${area === 'vo' ? 'stock VO' : 'stock VN'}.`);
    setOpen(false);
  };

  return (
    <>
      <Detail
        label="Clasificación comercial"
        value={`${actualCategory} · ${actualArea === 'vo' ? 'Stock VO' : 'Stock VN'}`}
        hint="La categoría y quién responde comercialmente del stock son datos distintos."
      />
      {can('flota.editar') ? (
        <>
          <Spacer h={space.xs} />
          <Btn small onPress={abrir}>Cambiar clasificación</Btn>
        </>
      ) : null}

      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title="Clasificación comercial"
        footer={
          <Btn variant="primary" full onPress={guardar}>
            Guardar clasificación
          </Btn>
        }
      >
        <Field
          label="Categoría"
          hint="Un KM0 o demo puede seguir perteneciendo al stock de VN aunque esté matriculado o tenga kilómetros."
        >
          <Select
            full
            value={category}
            onChange={(v) => setCategory(v as CommercialCategory)}
            options={CATEGORIAS}
            title="Categoría comercial"
          />
        </Field>

        <Field
          label="Responsable del stock"
          hint="Esto determina qué responsable/director comercial incluye el coche en su ámbito."
        >
          <Select
            full
            value={area}
            onChange={(v) => setArea(v as CommercialArea)}
            options={AREAS}
            title="Área comercial"
          />
        </Field>
      </Modal>
    </>
  );
}
