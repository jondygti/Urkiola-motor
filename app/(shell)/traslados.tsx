import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Grid,
  H1,
  Input,
  Kpi,
  Muted,
  Panel,
  Pill,
  Screen,
  Segmented,
  Select,
  Spacer,
  radius,
  space,
  useTheme,
} from '@/ui';
import { useAppState } from '@/data/store';
import { carrierName, motivosDeRetraso, resumenTransporte, trasladosHechos } from '@/data/selectors';
import { formatDateTime, locationLabel, matchesSearch, userName, vehicleName, vehicleRef } from '@/data/format';
import { DELAY_REASON_LABEL } from '@/data/types';
import { ScreenGuard } from '@/features/common/Guard';
import { useOpenVehicle } from '@/features/common/bits';

const TODAS = 'todas';
const DIA = 86_400_000;

/** Los periodos que se miran de verdad: la semana, el mes, el trimestre. */
const PERIODOS = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '0', label: 'Todo' },
] as const;

/**
 * Los traslados que han hecho las empresas de transporte.
 *
 * Un traslado terminado desaparecía de todas las pantallas: dejaba de estar
 * pendiente y ahí se acababa. Ni el transportista veía lo que había hecho ni
 * Urkiola lo que le habían hecho, y eso es justo lo que hace falta para
 * hablar con el proveedor con datos delante.
 *
 * El transportista ve exactamente lo mismo dentro de «Mis traslados», en la
 * pestaña «Hechos». A propósito: si cada uno mira una lista distinta, la
 * conversación se convierte en discutir cuál de las dos vale.
 */
export default function TransfersDoneScreen() {
  const state = useAppState();
  const { c } = useTheme();
  const openVehicle = useOpenVehicle();

  const [empresa, setEmpresa] = useState<string>(TODAS);
  const [dias, setDias] = useState<string>('30');
  const [query, setQuery] = useState('');

  const desde = useMemo(
    () => (dias === '0' ? undefined : new Date(Date.now() - Number(dias) * DIA).toISOString()),
    [dias]
  );

  const hechos = useMemo(
    () =>
      trasladosHechos(state, {
        carrierId: empresa === TODAS ? null : empresa,
        desde,
      }).filter((x) => (query.trim().length >= 2 ? !!x.vehicle && matchesSearch(x.vehicle, query) : true)),
    [state, empresa, desde, query]
  );

  const resumen = resumenTransporte(hechos);
  const motivos = motivosDeRetraso(hechos);

  // Cuántos ha hecho cada empresa en este periodo, para verlo sin ir
  // cambiando el filtro una por una.
  const porEmpresa = useMemo(() => {
    const todos = trasladosHechos(state, { desde });
    return state.carriers
      .map((emp) => ({
        empresa: emp,
        resumen: resumenTransporte(todos.filter((x) => x.request.carrierId === emp.id)),
      }))
      .filter((x) => x.resumen.total > 0)
      .sort((a, b) => b.resumen.total - a.resumen.total);
  }, [state, desde]);

  return (
    <ScreenGuard href="/traslados" title="Traslados hechos">
      <Screen>
        <H1>Traslados hechos</H1>
        <Muted>
          Lo que han hecho las empresas de transporte: qué coche, de dónde a dónde, cuándo se recogieron
          las llaves y cuándo se entregó. Cada transportista ve lo suyo en su propia app.
        </Muted>

        <Spacer />

        <Grid cols={4} minWidth={150}>
          <Kpi label="Traslados" value={resumen.total} hint="en el periodo" />
          <Kpi label="En plazo" value={resumen.enPlazo} tone="ok" hint={`de ${resumen.total}`} />
          <Kpi
            label="Fuera de plazo"
            value={resumen.fueraDePlazo}
            tone={resumen.fueraDePlazo > 0 ? 'amber' : 'ok'}
            hint="pasadas las 48 h"
          />
          <Kpi
            label="Tiempo medio"
            value={resumen.horasMedia === null ? '—' : `${Math.round(resumen.horasMedia)} h`}
            hint="de llaves a entrega"
          />
        </Grid>

        <Spacer h={space.lg} />

        <Panel>
          <Segmented value={dias} onChange={setDias} options={[...PERIODOS]} />
          <Spacer h={space.sm} />
          <Select
            full
            value={empresa}
            onChange={setEmpresa}
            title="Empresa de transporte"
            options={[
              { value: TODAS, label: 'Todas las empresas' },
              ...state.carriers.map((x) => ({ value: x.id, label: x.name })),
            ]}
          />
          <Spacer h={space.sm} />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por matrícula, bastidor, marca o modelo"
            autoCapitalize="characters"
          />
        </Panel>

        {motivos.length ? (
          <>
            <Spacer h={space.md} />
            <Panel title="Por qué llegaron tarde">
              {motivos.map(({ motivo, veces }) => (
                <View
                  key={motivo}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: c.borderSoft,
                  }}
                >
                  <Text style={{ fontSize: 13, color: c.text, flex: 1 }}>
                    {DELAY_REASON_LABEL[motivo]}
                  </Text>
                  <Pill tone={veces > 1 ? 'amber' : 'neutral'}>
                    {veces} {veces === 1 ? 'vez' : 'veces'}
                  </Pill>
                </View>
              ))}
              <Spacer h={space.sm} />
              <Muted>
                Doce retrasos son doce discusiones; doce motivos son un dato. Lo que se repite es lo que se
                puede arreglar.
              </Muted>
            </Panel>
          </>
        ) : null}

        {porEmpresa.length > 1 && empresa === TODAS ? (
          <>
            <Spacer h={space.md} />
            <Panel title="Por empresa">
              {porEmpresa.map(({ empresa: emp, resumen: r }) => (
                <View
                  key={emp.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: c.borderSoft,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: c.text, flex: 1, minWidth: 140 }}>
                    {emp.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>
                    {r.total} {r.total === 1 ? 'traslado' : 'traslados'} ·{' '}
                    {r.horasMedia === null ? '—' : `${Math.round(r.horasMedia)} h de media`}
                  </Text>
                  {r.fueraDePlazo > 0 ? (
                    <Pill tone="amber">{r.fueraDePlazo} fuera de plazo</Pill>
                  ) : (
                    <Pill tone="ok">Todos en plazo</Pill>
                  )}
                </View>
              ))}
            </Panel>
          </>
        ) : null}

        <Spacer h={space.md} />

        {hechos.length === 0 ? (
          <Panel>
            <Muted>
              No hay traslados terminados con esos filtros. Los traslados que se cerraron antes de que se
              empezara a guardar la fecha de entrega salen solo con el periodo en «Todo».
            </Muted>
          </Panel>
        ) : (
          <Panel title={`${hechos.length} ${hechos.length === 1 ? 'traslado' : 'traslados'}`}>
            {hechos.slice(0, 200).map(({ request, vehicle, horas, fueraDePlazo }) => (
              <View
                key={request.id}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: radius.md,
                  padding: 12,
                  marginBottom: space.sm,
                  gap: 3,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text
                    style={{ fontSize: 14, fontWeight: '800', color: c.text, flex: 1, minWidth: 130 }}
                    onPress={() => vehicle && openVehicle(vehicle.id)}
                  >
                    {vehicle ? `${vehicleRef(vehicle)} · ${vehicleName(vehicle)}` : request.vehicleId}
                  </Text>
                  {request.carrierId ? <Pill tone="blue">{carrierName(state, request.carrierId)}</Pill> : null}
                  {fueraDePlazo ? <Pill tone="red">Fuera de plazo</Pill> : <Pill tone="ok">En plazo</Pill>}
                </View>
                <Text style={{ fontSize: 12, color: c.text }}>
                  {locationLabel(state, request.from, true)} → {locationLabel(state, request.to, true)}
                </Text>
                <Text style={{ fontSize: 11, color: c.textFaint }}>
                  🔑 {request.pickedUpAt ? formatDateTime(request.pickedUpAt) : 'Sin recogida apuntada'} · 🏁{' '}
                  {request.deliveredAt ? formatDateTime(request.deliveredAt) : 'Sin entrega apuntada'}
                  {horas === null ? '' : ` · ${Math.round(horas)} h`}
                  {request.deliveredBy ? ` · ${userName(state, request.deliveredBy)}` : ''}
                </Text>
                {fueraDePlazo && request.delayReason ? (
                  <Text style={{ fontSize: 11, color: c.amberFg }}>
                    ⏱ {DELAY_REASON_LABEL[request.delayReason]}
                    {request.delayNote ? ` · ${request.delayNote}` : ''}
                  </Text>
                ) : null}
              </View>
            ))}
            {hechos.length > 200 ? (
              <Muted>Se enseñan los 200 últimos. Acota el periodo o la empresa para ver el resto.</Muted>
            ) : null}
          </Panel>
        )}
      </Screen>
    </ScreenGuard>
  );
}
