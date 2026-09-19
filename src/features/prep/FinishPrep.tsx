import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Btn, Input, Modal, Muted, Notice, Spacer, radius, space, tipografia, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { can } from '@/data/selectors';
import { locationLabel, vehicleRef } from '@/data/format';
import type { FinalPreparationPhotos, Preparation } from '@/data/types';
import { capturarYSubir, type FotoTomada } from '@/features/actions/photos';
import { descartarFotoPendiente } from '@/data/photoQueue';
import {
  DestinationFields,
  destinationLabel,
  firstFreeDestination,
  toLocationRef,
  type Destination,
  type DestinationShortcut,
} from '@/features/common/Destination';

type FotoKey = keyof FinalPreparationPhotos;

const TOMAS: { key: FotoKey; label: string; hint: string }[] = [
  { key: 'frontLeft', label: 'Delantera izquierda', hint: 'Frontal + lateral izquierdo' },
  { key: 'frontRight', label: 'Delantera derecha', hint: 'Frontal + lateral derecho' },
  { key: 'rearLeft', label: 'Trasera izquierda', hint: 'Trasera + lateral izquierdo' },
  { key: 'rearRight', label: 'Trasera derecha', hint: 'Trasera + lateral derecho' },
];

/**
 * Cierre de una preparación.
 *
 * El reportaje final forma parte del cierre, no es un check manual. Sirve
 * como evidencia del estado exterior y protege tanto a Urkiola como al
 * preparador. Si declara un daño, backend crea la incidencia en la misma
 * operación: no puede quedar la preparación terminada sin registrar el golpe.
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
  const { c } = useTheme();
  const puedeMover = can(state, user, 'movimientos.registrar');
  const vehicle = state.vehicles.find((v) => v.id === prep.vehicleId);
  const actual = vehicle?.location ?? null;
  const enLaSede = actual?.siteId === prep.siteId && !!actual?.zoneId;

  const [dest, setDest] = useState<Destination>(() =>
    enLaSede && actual
      ? { siteId: actual.siteId, zoneId: actual.zoneId ?? null, positionId: actual.positionId ?? null }
      : firstFreeDestination(state, prep.siteId)
  );
  const [fotos, setFotos] = useState<Partial<Record<FotoKey, FotoTomada>>>({});
  const [tomando, setTomando] = useState<FotoKey | null>(null);
  const [hayDano, setHayDano] = useState(false);
  const [dano, setDano] = useState('');

  const pendientes = prep.items.filter((i) => i.state === 'pendiente' && i.requirementId !== 'req-fotos').length;
  const faltanFotos = TOMAS.filter((t) => !fotos[t.key]).length;
  const sinSubir = Object.values(fotos).filter((f) => f && !f.subida).length;
  const bloqueado = faltanFotos > 0 || (hayDano && !dano.trim());

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

  const tomarFoto = async (key: FotoKey) => {
    setTomando(key);
    try {
      const foto = await capturarYSubir('camera');
      if (foto) {
        const anterior = fotos[key];
        if (anterior && !anterior.subida) void descartarFotoPendiente(anterior.ref);
        setFotos((actuales) => ({ ...actuales, [key]: foto }));
      }
    } finally {
      setTomando(null);
    }
  };

  const terminar = (conUbicacion: boolean) => {
    if (bloqueado) return;
    const finalPhotos: FinalPreparationPhotos = {
      frontLeft: fotos.frontLeft!.ref,
      frontRight: fotos.frontRight!.ref,
      rearLeft: fotos.rearLeft!.ref,
      rearRight: fotos.rearRight!.ref,
    };
    const mueve = conUbicacion && puedeMover && !!dest.zoneId;
    run({
      type: 'prep.finish',
      prepId: prep.id,
      to: mueve ? toLocationRef(dest) : undefined,
      finalPhotos,
      damageDescription: hayDano ? dano.trim() : null,
    });
    const ref = vehicle ? vehicleRef(vehicle) : 'Vehículo';
    onDone?.(
      hayDano
        ? `${ref} listo · incidencia de daño registrada.`
        : mueve
          ? `${ref} listo · en ${destinationLabel(state, dest)}`
          : `${ref} listo para entrega.`
    );
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
            <Btn variant="primary" full disabled={bloqueado || !dest.zoneId} onPress={() => terminar(true)}>
              {dest.zoneId ? `✓ Terminar y dejarlo en ${destinationLabel(state, dest)}` : '✓ Terminar'}
            </Btn>
            <Btn full disabled={bloqueado} onPress={() => terminar(false)}>
              Terminar sin indicar sitio
            </Btn>
          </>
        ) : (
          <Btn variant="primary" full disabled={bloqueado} onPress={() => terminar(false)}>
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

      <Text style={{ fontSize: tipografia.body, fontWeight: '900', color: c.text }}>
        📸 Reportaje final obligatorio
      </Text>
      <Muted>Cuatro diagonales dejan cubierta prácticamente toda la carrocería.</Muted>
      <Spacer h={space.sm} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TOMAS.map((t) => {
          const foto = fotos[t.key];
          return (
            <View
              key={t.key}
              style={{
                width: '48%',
                minWidth: 150,
                borderWidth: 1,
                borderColor: foto ? c.checkDoneBorder : c.border,
                backgroundColor: foto ? c.checkDoneBg : c.surfaceAlt,
                borderRadius: radius.md,
                padding: 8,
                gap: 6,
              }}
            >
              {foto ? (
                <Image
                  source={{ uri: foto.vistaPrevia }}
                  style={{ width: '100%', height: 100, borderRadius: radius.sm, backgroundColor: c.surfaceSunken }}
                  resizeMode="cover"
                />
              ) : null}
              <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: c.text }}>{t.label}</Text>
              <Muted>{t.hint}</Muted>
              <Btn small onPress={() => void tomarFoto(t.key)} disabled={tomando !== null}>
                {tomando === t.key ? 'Guardando…' : foto ? '📷 Repetir' : '📷 Hacer foto'}
              </Btn>
              {foto && !foto.subida ? <Text style={{ fontSize: tipografia.label, color: c.amberFg }}>Pendiente de subir</Text> : null}
            </View>
          );
        })}
      </View>

      {faltanFotos > 0 ? (
        <>
          <Spacer h={space.sm} />
          <Notice tone="warn">
            Faltan {faltanFotos} {faltanFotos === 1 ? 'foto' : 'fotos'}. No se puede terminar hasta hacer las cuatro.
          </Notice>
        </>
      ) : null}
      {sinSubir > 0 ? (
        <>
          <Spacer h={space.sm} />
          <Notice tone="warn">
            {sinSubir === 1 ? 'Una foto está pendiente de subir' : `${sinSubir} fotos están pendientes de subir`}.
            El trabajo queda guardado en el móvil y se enviará automáticamente al recuperar cobertura.
          </Notice>
        </>
      ) : null}

      <Spacer h={space.md} />
      <Pressable
        onPress={() => {
          setHayDano((v) => !v);
          if (hayDano) setDano('');
        }}
        style={{ paddingVertical: 8 }}
      >
        <Text style={{ fontSize: tipografia.body, color: c.text, fontWeight: '700' }}>
          {hayDano ? '☑' : '☐'} He detectado un daño
        </Text>
      </Pressable>
      {hayDano ? (
        <>
          <Input
            value={dano}
            onChangeText={setDano}
            placeholder="Describe el golpe, roce, llanta…"
            multiline
          />
          <Muted>Al terminar se abrirá automáticamente una incidencia de preparación con estas cuatro fotos.</Muted>
        </>
      ) : (
        <Muted>Al terminar quedará constancia de que el preparador no declaró daños visibles.</Muted>
      )}

      {puedeMover ? (
        <>
          <Spacer h={space.md} />
          <Muted>¿Dónde dejas el coche?</Muted>
          <Spacer h={space.sm} />
          <DestinationFields value={dest} onChange={setDest} sites={false} shortcuts={atajos} compact />
          <Muted>
            Queda registrado como movimiento, con origen, usuario y hora, igual que si lo apuntaras aparte.
          </Muted>
        </>
      ) : (
        <>
          <Spacer h={space.md} />
          <Muted>El vehículo quedará apto para entrega.</Muted>
        </>
      )}
    </Modal>
  );
}
