import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { campo, Btn, Grid, H1, Input, Kpi, Muted, Notice, Panel, Pill, ProgressBar, Screen, Segmented, Spacer, radius, space, useTheme } from '@/ui';
import { useAppState, useStore, useTicker } from '@/data/store';
import { deadlineOf, misCoches, type CocheMio } from '@/data/selectors';
import { prepElapsedMs, prepIsOverSla, prepProgress } from '@/data/commands';
import { formatDate, formatShortDuration, matchesSearch, vehicleName, vehicleRef } from '@/data/format';
import { ScreenGuard } from '@/features/common/Guard';
import { DeadlineChip } from '@/features/common/DeadlineChip';
import { UbicacionVehiculo } from '@/features/common/Ubicacion';
import { VehicleActions } from '@/features/actions/VehicleActions';
import { EntregarVehiculo } from '@/features/actions/EntregarVehiculo';
import { useOpenVehicle } from '@/features/common/bits';

const TODOS = 'todos';
const POR_TANDA = 20;

/**
 * Mis coches: en qué punto está cada uno de los que vende esta persona.
 *
 * El comercial no necesita la lista de solicitudes de toda la empresa —que
 * es lo que tenía—, sino saber cómo va **lo suyo**. Antes eso estaba
 * repartido en tres pantallas: Solicitudes decía qué se había pedido,
 * Flota dónde estaba el coche y Entregas qué había comprometido con el
 * cliente; y ninguna de las tres enseñaba solo sus coches.
 *
 * Aquí cada coche es una ficha con las tres cosas juntas y con lo que se
 * puede hacer con él, sin salir de la pantalla.
 */
export default function MyCarsScreen() {
  const state = useAppState();
  const { user } = useStore();
  const { c } = useTheme();
  const now = useTicker(30_000);
  const openVehicle = useOpenVehicle();

  const [filtro, setFiltro] = useState<string>(TODOS);
  const [query, setQuery] = useState('');
  // Cuántas fichas se pintan de golpe. Un comercial con el parque entero a
  // su nombre puede tener más de cien coches, y cien fichas con sus botones
  // en un móvil viejo se notan al abrir la pantalla.
  const [visibles, setVisibles] = useState(POR_TANDA);
  const [toast, setToast] = useState<string | null>(null);

  const conEntregados = useMemo(() => misCoches(state, user), [state, user]);

  // Lo entregado no es trabajo: no cuenta en las fases ni sale en «Todos».
  // Pero tiene su pestaña, porque quien marca una entrega necesita poder
  // comprobar después que la marcó —y cuántas lleva este mes.
  const todos = useMemo(() => conEntregados.filter((x) => x.fase !== 'entregado'), [conEntregados]);
  const entregados = useMemo(() => conEntregados.filter((x) => x.fase === 'entregado'), [conEntregados]);

  const esteMes = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    return entregados.filter((x) => (x.vehicle.deliveredAt ?? '').slice(0, 7) === mes).length;
  }, [entregados]);

  const cuenta = useMemo(
    () => ({
      listo: todos.filter((x) => x.fase === 'listo').length,
      preparando: todos.filter((x) => x.fase === 'preparando').length,
      trasladando: todos.filter((x) => x.fase === 'trasladando').length,
      parado: todos.filter((x) => x.fase === 'parado').length,
    }),
    [todos]
  );

  // Lo que de verdad quita el sueño: una entrega comprometida con algo sin
  // pedir todavía. Se cuenta aparte y se avisa arriba del todo.
  const enRiesgo = useMemo(
    () => todos.filter((x) => x.vehicle.deliveryDate && x.fase === 'parado'),
    [todos]
  );

  // Al cambiar de filtro o de búsqueda se vuelve a empezar por arriba: si
  // no, se quedaría enseñando cien fichas de la lista anterior.
  useEffect(() => setVisibles(POR_TANDA), [filtro, query]);

  const lista = useMemo(
    () =>
      (filtro === 'entregado' ? entregados : todos)
        .filter((x) => (filtro === TODOS || filtro === 'entregado' ? true : x.fase === filtro))
        .filter((x) => (query.trim().length >= 2 ? matchesSearch(x.vehicle, query) : true)),
    [todos, entregados, filtro, query]
  );

  return (
    <ScreenGuard href="/mis-coches" title="Mis coches">
      <Screen>
        <H1>Mis coches</H1>
        <Muted>
          Los que vendes tú y en qué punto está cada uno: lo que has pedido, cómo va y dónde está el coche.
        </Muted>

        {toast ? (
          <>
            <Spacer h={space.sm} />
            <Notice>✓ {toast}</Notice>
          </>
        ) : null}

        <Spacer />

        <Grid cols={4} minWidth={150}>
          <Kpi label="Listos" value={cuenta.listo} hint="para entregar" tone="ok" onPress={() => setFiltro('listo')} />
          <Kpi label="Preparándose" value={cuenta.preparando} hint="pedidas o en curso" onPress={() => setFiltro('preparando')} />
          <Kpi label="De camino" value={cuenta.trasladando} hint="traslado pedido" onPress={() => setFiltro('trasladando')} />
          <Kpi
            label="Sin pedir nada"
            value={cuenta.parado}
            hint="parados"
            tone={enRiesgo.length ? 'amber' : undefined}
            onPress={() => setFiltro('parado')}
          />
        </Grid>

        {enRiesgo.length ? (
          <>
            <Spacer h={space.md} />
            <Notice tone="warn">
              <Text style={{ fontSize: campo.small, color: c.text }}>
                <Text style={{ fontWeight: '800' }}>
                  {enRiesgo.length === 1
                    ? '1 coche con fecha de entrega y sin nada pedido: '
                    : `${enRiesgo.length} coches con fecha de entrega y sin nada pedido: `}
                </Text>
                {enRiesgo
                  .slice(0, 4)
                  .map((x) => `${vehicleRef(x.vehicle)} (${formatDate(x.vehicle.deliveryDate)})`)
                  .join(' · ')}
                {enRiesgo.length > 4 ? ` y ${enRiesgo.length - 4} más` : ''}. Pide la preparación desde la
                ficha del coche.
              </Text>
            </Notice>
          </>
        ) : null}

        <Spacer h={space.lg} />

        <Panel>
          <Segmented
            value={filtro}
            onChange={setFiltro}
            options={[
              { value: TODOS, label: `Todos · ${todos.length}` },
              { value: 'listo', label: `Listos · ${cuenta.listo}` },
              { value: 'preparando', label: `Preparándose · ${cuenta.preparando}` },
              { value: 'trasladando', label: `De camino · ${cuenta.trasladando}` },
              { value: 'parado', label: `Parados · ${cuenta.parado}` },
              { value: 'entregado', label: `Entregados · ${entregados.length}` },
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

        {filtro === 'entregado' && entregados.length ? (
          <>
            <Spacer h={space.sm} />
            <Notice>
              <Text style={{ fontSize: campo.small, color: c.text }}>
                {esteMes === 1 ? '1 coche entregado este mes' : `${esteMes} coches entregados este mes`} ·{' '}
                {entregados.length} en total.
              </Text>
            </Notice>
          </>
        ) : null}

        <Spacer h={space.md} />

        {todos.length === 0 && entregados.length === 0 ? (
          <Panel>
            <Muted>
              Todavía no llevas ningún coche. En la ficha de cualquier vehículo libre puedes quedártelo con
              el botón «Asignármelo», y a partir de ahí lo verás aquí.
            </Muted>
          </Panel>
        ) : lista.length === 0 ? (
          <Panel>
            <Muted>
              {filtro === 'entregado'
                ? 'Todavía no has dado ningún coche por entregado.'
                : 'Ninguno de tus coches está en ese punto ahora mismo.'}
            </Muted>
          </Panel>
        ) : (
          <Grid cols={2} minWidth={420}>
            {lista.slice(0, visibles).map((coche) => (
              <FichaCoche
                key={coche.vehicle.id}
                coche={coche}
                now={now}
                onAbrir={() => openVehicle(coche.vehicle.id)}
                onDone={setToast}
              />
            ))}
          </Grid>
        )}

        {lista.length > visibles ? (
          <>
            <Spacer h={space.sm} />
            <Btn full onPress={() => setVisibles((v) => v + POR_TANDA)}>
              Ver {Math.min(POR_TANDA, lista.length - visibles)} más de {lista.length - visibles}
            </Btn>
          </>
        ) : null}
      </Screen>
    </ScreenGuard>
  );
}

/** Un coche, con las tres respuestas juntas: qué se pidió, cómo va y dónde está. */
function FichaCoche({
  coche,
  now,
  onAbrir,
  onDone,
}: {
  coche: CocheMio;
  now: number;
  onAbrir: () => void;
  onDone: (m: string) => void;
}) {
  const state = useAppState();
  const { c } = useTheme();
  const { vehicle: v, traslado, prepPedida, preparacion, incidencias, fase } = coche;

  const tono =
    fase === 'listo' || fase === 'entregado'
      ? c.okFg
      : fase === 'parado' && v.deliveryDate
        ? c.amberFg
        : c.textMuted;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.md,
        padding: 12,
        marginBottom: space.sm,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: campo.body, fontWeight: '900', color: c.text, flex: 1, minWidth: 150 }}>
          {vehicleName(v)} · {vehicleRef(v)}
        </Text>
        <Text style={{ fontSize: campo.micro, fontWeight: '800', color: tono }}>
          {fase === 'entregado'
            ? '🏁 ENTREGADO'
            : fase === 'listo'
            ? '✓ LISTO PARA ENTREGAR'
            : fase === 'preparando'
              ? '🧽 PREPARÁNDOSE'
              : fase === 'trasladando'
                ? '🚚 DE CAMINO'
                : 'SIN PEDIR NADA'}
        </Text>
      </View>

      {/* Dónde está, que es lo primero que pregunta un cliente por teléfono.
          Uno entregado ya no está en ningún sitio nuestro: dice cuándo se
          fue, que es lo único que queda que mirar. */}
      {fase === 'entregado' ? (
        <Text style={{ fontSize: campo.micro, color: c.textMuted }}>
          Entregado el {formatDate(v.deliveredAt)}
        </Text>
      ) : (
        <UbicacionVehiculo vehicle={v} compacta />
      )}

      {/* La fecha comprometida manda sobre todo lo demás. */}
      {v.deliveryDate ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pill tone={fase === 'listo' ? 'ok' : 'blue'}>📅 Entrega {formatDate(v.deliveryDate)}</Pill>
        </View>
      ) : (
        <Muted>Sin fecha de entrega comprometida.</Muted>
      )}

      {/* Qué se pidió y cómo va. */}
      {preparacion ? (
        <View style={{ gap: 4 }}>
          {(() => {
            const { done, total, pct } = prepProgress(preparacion);
            const tarde = prepIsOverSla(preparacion, now);
            return (
              <>
                <Text style={{ fontSize: campo.micro, color: tarde ? c.redFg : c.textMuted }}>
                  Preparación en curso · {done}/{total} requisitos ·{' '}
                  {formatShortDuration(prepElapsedMs(preparacion, now))} de{' '}
                  {formatShortDuration(preparacion.targetMs)}
                  {preparacion.runState === 'bloqueado' ? ` · BLOQUEADA: ${preparacion.waitReason ?? ''}` : ''}
                </Text>
                <ProgressBar pct={pct} tone={tarde ? 'red' : 'ok'} />
              </>
            );
          })()}
        </View>
      ) : prepPedida ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: campo.micro, color: c.textMuted }}>
            Preparación pedida, todavía sin empezar
          </Text>
          <DeadlineChip deadline={deadlineOf(state, prepPedida, now)} />
        </View>
      ) : null}

      {traslado ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: campo.micro, color: c.textMuted }}>
            {traslado.status === 'en_ruta'
              ? 'Traslado en ruta'
              : traslado.status === 'asignada'
                ? 'Traslado asignado al transportista'
                : 'Traslado pedido, sin asignar'}
          </Text>
          <DeadlineChip
            deadline={deadlineOf(state, traslado, now)}
            emptyLabel="El plazo arranca al recoger"
          />
        </View>
      ) : null}

      {incidencias.length ? (
        <Text style={{ fontSize: campo.micro, fontWeight: '800', color: c.redFg }}>
          ⚠ {incidencias.length === 1 ? '1 incidencia abierta' : `${incidencias.length} incidencias abiertas`}
          : {incidencias[0].description}
        </Text>
      ) : null}

      {/* Pedir el traslado o la preparación desde aquí mismo, y cerrar el
          coche cuando el cliente se lo lleva: es el sitio donde el comercial
          mira sus coches, así que es donde tiene que poder darlo por
          entregado sin abrir la ficha. */}
      {fase === 'entregado' ? null : <VehicleActions vehicle={v} compact onDone={onDone} />}
      <EntregarVehiculo vehicle={v} compact onDone={onDone} />
      <Btn small full onPress={onAbrir}>
        Abrir ficha
      </Btn>
    </View>
  );
}
