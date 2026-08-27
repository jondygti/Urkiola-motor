import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { campo, Btn, Field, H1, Input, Muted, Notice, Panel, Pill, Screen, Spacer, radius, space, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { vehicleByRef } from '@/data/selectors';
import { locationLabel, matchesSearch, siteName, timeAgo, vehicleName, vehicleRef } from '@/data/format';
import type { Vehicle } from '@/data/types';
import { ScreenGuard } from '@/features/common/Guard';
import { UbicacionVehiculo } from '@/features/common/Ubicacion';
import { BarcodeScanner } from '@/features/scan/BarcodeScanner';
import {
  DestinationFields,
  destinationLabel,
  firstFreeDestination,
  toLocationRef,
  type Destination,
  type DestinationShortcut,
} from '@/features/common/Destination';

/**
 * Mover un coche, en dos pasos y sin salir de la pantalla.
 *
 * Matrícula (o VIN-8, o escanear) y dónde lo dejas. El destino se queda
 * puesto para el siguiente coche, que es como se trabaja de verdad: se
 * bajan seis del taller a la misma tejavana, uno detrás de otro.
 *
 * La pantalla de Movimientos sigue existiendo para consultar el histórico
 * con filtros; esta es solo para registrar.
 */
/**
 * Una ubicación de hace más de tres días es una suposición.
 *
 * No es un fallo: los coches de la campa pueden estar semanas sin que nadie
 * los toque. Pero quien va a bajar a por uno merece saber si lo que lee es
 * de esta mañana o de la semana pasada.
 */
const VIEJO_HORAS = 72;
const viejo = (v: Vehicle) =>
  !v.lastCheckAt || Date.now() - new Date(v.lastCheckAt).getTime() > VIEJO_HORAS * 3_600_000;

export default function QuickMoveScreen() {
  const { state, user, run } = useStore();
  const { c } = useTheme();

  const [ref, setRef] = useState('');
  const [dest, setDest] = useState<Destination>(() =>
    firstFreeDestination(state, user?.siteIds[0] ?? state.sites[0].id)
  );
  const [tocado, setTocado] = useState(false);
  const [hechos, setHechos] = useState<{ ref: string; label: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const exacto = vehicleByRef(state, ref);
  const parecidos = useMemo(
    () =>
      ref.trim().length >= 2 && !exacto
        ? state.vehicles.filter((v) => matchesSearch(v, ref)).slice(0, 6)
        : [],
    [state.vehicles, ref, exacto]
  );
  const vehiculo: Vehicle | null = exacto ?? (parecidos.length === 1 ? parecidos[0] : null);

  // Mientras no se toque el destino, se propone la sede donde está el coche:
  // la mayoría de los movimientos son dentro de la misma campa.
  useEffect(() => {
    if (!vehiculo || tocado) return;
    const siteId = vehiculo.location?.siteId;
    if (siteId && siteId !== dest.siteId) setDest(firstFreeDestination(state, siteId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculo?.id]);

  /** Los últimos sitios donde ha dejado coches este usuario, a un toque. */
  const atajos: DestinationShortcut[] = useMemo(() => {
    const vistos = new Set<string>();
    const out: DestinationShortcut[] = [];
    for (const m of state.movements) {
      if (user && m.userId !== user.id) continue;
      const zoneId = m.to.zoneId;
      if (!zoneId || vistos.has(zoneId)) continue;
      vistos.add(zoneId);
      out.push({
        key: zoneId,
        label: locationLabel(state, { siteId: m.to.siteId, zoneId }, true),
        destination: { siteId: m.to.siteId, zoneId, positionId: null },
      });
      if (out.length === 3) break;
    }
    return out;
  }, [state, user]);

  const listo = !!vehiculo && !!dest.zoneId;

  const mover = () => {
    if (!vehiculo || !dest.zoneId) return;
    run({
      type: 'movement.register',
      vehicleId: vehiculo.id,
      to: toLocationRef(dest),
    });
    const label = destinationLabel(state, dest);
    setHechos((h) => [{ ref: vehicleRef(vehiculo), label }, ...h].slice(0, 12));
    setToast(`${vehicleRef(vehiculo)} → ${label}`);
    setRef('');
  };

  return (
    <ScreenGuard href="/mover" title="Mover coche">
      <Screen>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <H1>Mover coche</H1>
          <Muted>Matrícula o bastidor, dónde lo dejas y listo. El destino se queda puesto.</Muted>

          {toast ? <Notice>✓ {toast}</Notice> : null}
          <Spacer />

          <Panel title="1 · ¿Qué coche?">
            <BarcodeScanner onScan={(v) => setRef(v.slice(-8).toUpperCase())} height={170} />
            <Spacer h={space.sm} />
            <Input
              big
              value={ref}
              onChangeText={setRef}
              placeholder="1234 ABC"
              autoCapitalize="characters"
              onSubmitEditing={() => listo && mover()}
            />
            <Spacer h={space.xs} />
            <Muted>Matrícula o los 8 últimos del bastidor. Sin QR.</Muted>

            {vehiculo ? (
              <View
                style={{
                  marginTop: space.sm,
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: radius.md,
                  backgroundColor: c.surfaceAlt,
                  padding: 12,
                }}
              >
                <Text style={{ fontSize: campo.strong, fontWeight: '900', color: c.text }}>
                  {vehicleName(vehiculo)} · {vehicleRef(vehiculo)}
                </Text>

                {/* De dónde hay que sacarlo. Es lo primero que necesita quien
                    va a moverlo: sabe la matrícula, pero no dónde está
                    aparcado. Antes salía en una línea pequeña y de pasada. */}
                <Text style={{ fontSize: campo.label, fontWeight: '800', color: c.textFaint, marginTop: 8 }}>
                  DÓNDE ESTÁ AHORA
                </Text>
                <UbicacionVehiculo vehicle={vehiculo} />

                {/* Cuándo se confirmó por última vez. Una ubicación que nadie
                    ha comprobado en una semana es una suposición, y quien
                    baja a la campa tiene derecho a saberlo antes de andar. */}
                <Text style={{ fontSize: campo.micro, color: viejo(vehiculo) ? c.amberFg : c.textMuted, marginTop: 4 }}>
                  {vehiculo.lastCheckAt
                    ? `Comprobado ${timeAgo(vehiculo.lastCheckAt)}${vehiculo.lastCheckBy ? ` por ${vehiculo.lastCheckBy}` : ''}${viejo(vehiculo) ? ' · puede haberse movido' : ''}`
                    : 'Nadie lo ha comprobado todavía: puede no estar ahí.'}
                </Text>

                {/* Si está en otra sede, moverlo dentro de esta no es lo que
                    toca: eso es un traslado, y lo lleva un transportista. */}
                {vehiculo.location?.siteId && dest.siteId && vehiculo.location.siteId !== dest.siteId ? (
                  <>
                    <Spacer h={space.sm} />
                    <Notice tone="warn">
                      Está en {siteName(state, vehiculo.location.siteId)} y lo vas a dejar en{' '}
                      {siteName(state, dest.siteId)}. Si el coche no viaja contigo, esto es un traslado y
                      lo pide la oficina.
                    </Notice>
                  </>
                ) : null}
              </View>
            ) : parecidos.length > 1 ? (
              <View style={{ marginTop: space.sm, gap: 6 }}>
                {parecidos.map((v) => (
                  <Notice key={v.id} onPress={() => setRef(v.plate ?? v.vin8)}>
                    {vehicleRef(v)} · {vehicleName(v)} · {locationLabel(state, v.location, true)}
                  </Notice>
                ))}
              </View>
            ) : ref.trim().length >= 2 ? (
              <Notice tone="warn">
                No encuentro ese coche. Comprueba la matrícula o prueba con los 8 últimos del bastidor.
              </Notice>
            ) : null}
          </Panel>

          <Spacer h={space.md} />

          <Panel title="2 · ¿Dónde lo dejas?">
            <DestinationFields
              value={dest}
              onChange={(d) => {
                setTocado(true);
                setDest(d);
              }}
              shortcuts={atajos}
            />
          </Panel>

          <Spacer h={space.md} />

          {/* El destino se ve siempre, también entre coche y coche: así se
              sabe de un vistazo que sigue puesto para el siguiente. */}
          <Btn variant="primary" full disabled={!listo} onPress={mover}>
            {dest.zoneId ? `✓ Mover a ${destinationLabel(state, dest)}` : '✓ Elige dónde lo dejas'}
          </Btn>
          <Spacer h={space.xs} />
          <Muted>
            Se guardan solos el origen, el usuario y la hora, y el movimiento vale como comprobación
            física. Sin cobertura se queda en la cola y sube al recuperar señal.
          </Muted>

          {hechos.length > 0 ? (
            <>
              <Spacer h={space.lg} />
              <Panel title={`Movidos ahora (${hechos.length})`}>
                {hechos.map((h, i) => (
                  <View
                    key={`${h.ref}-${i}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 8,
                      borderBottomWidth: i === hechos.length - 1 ? 0 : 1,
                      borderBottomColor: c.borderSoft,
                    }}
                  >
                    <Text style={{ fontSize: campo.body, fontWeight: '800', color: c.text, flex: 1 }}>{h.ref}</Text>
                    <Pill tone="ok">{h.label}</Pill>
                  </View>
                ))}
              </Panel>
            </>
          ) : null}
        </View>
      </Screen>
    </ScreenGuard>
  );
}
