import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Checkbox, ConfirmDialog, Field, Grid, Input, Modal, Muted, Notice, Panel, Pill, ProgressBar, Segmented, Select, Spacer, Toolbar, radius, space, tipografia, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import { siteOccupancy, vehiclesInZone, zoneOccupancy } from '@/data/selectors';
import type { Position, Site, Zone, ZoneKind } from '@/data/types';

/** Convierte «Tejavana 13» en «tejavana-13» para usarlo como identificador. */
function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function LocationsAdmin({ onDone }: { onDone: (m: string) => void }) {
  const { state } = useStore();
  const { c } = useTheme();
  const [siteId, setSiteId] = useState<string>(state.sites[0]?.id ?? '');
  const [siteModal, setSiteModal] = useState<Site | null>(null);
  const [zoneModal, setZoneModal] = useState<Zone | null>(null);
  const [positionsOf, setPositionsOf] = useState<Zone | null>(null);

  const site = state.sites.find((s) => s.id === siteId) ?? state.sites[0];
  const zones = useMemo(
    () => state.zones.filter((z) => z.siteId === site?.id),
    [state.zones, site?.id]
  );

  const newSite = (): Site => ({ id: '', name: '', kind: 'concesion', prepares: true });
  const newZone = (): Zone => ({
    id: '',
    siteId: site?.id ?? '',
    name: '',
    kind: site?.kind === 'campa' ? 'tejavana' : 'parking',
    capacity: 20,
  });

  return (
    <>
      <Panel title="🏢 Sedes">
        <Muted>
          Crea las sedes que necesites y dentro de cada una sus tejavanas o parkings, con las plazas que
          quepan de verdad. Nada de esto está fijado en el código.
        </Muted>
        <Toolbar>
          <Btn variant="primary" onPress={() => setSiteModal(newSite())}>
            + Nueva sede
          </Btn>
        </Toolbar>

        <Grid cols={3} minWidth={230}>
          {state.sites.map((s) => {
            const occ = siteOccupancy(state, s.id);
            const active = s.id === site?.id;
            return (
              <View
                key={s.id}
                style={{
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? c.primary : c.border,
                  backgroundColor: c.surface,
                  borderRadius: radius.md,
                  padding: 12,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: c.text, flex: 1 }}>{s.name}</Text>
                  <Pill tone={s.kind === 'campa' ? 'blue' : 'ok'}>
                    {s.kind === 'campa' ? 'Campa' : 'Concesión'}
                  </Pill>
                </View>
                <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                  {s.prepares ? 'Prepara vehículos' : 'Solo almacena'} · {occ.zones} zonas
                </Text>
                <Text style={{ fontSize: tipografia.title, fontWeight: '900', color: c.text }}>
                  {occ.occupied}/{occ.capacity}
                </Text>
                <ProgressBar pct={occ.pct} tone={occ.pct > 90 ? 'red' : occ.pct > 75 ? 'amber' : 'ok'} />
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <Btn small onPress={() => setSiteId(s.id)}>
                    {active ? 'Viendo' : 'Ver zonas'}
                  </Btn>
                  <Btn small onPress={() => setSiteModal(s)}>
                    Editar
                  </Btn>
                </View>
              </View>
            );
          })}
        </Grid>
      </Panel>

      <Spacer h={space.lg} />

      {site ? (
        <Panel title={`📍 Zonas de ${site.name}`}>
          <Toolbar>
            <Btn variant="primary" onPress={() => setZoneModal(newZone())}>
              {site.kind === 'campa' ? '+ Nueva tejavana' : '+ Nuevo parking'}
            </Btn>
          </Toolbar>

          {zones.length === 0 ? (
            <Notice tone="warn">
              Esta sede aún no tiene zonas. Crea la primera para poder ubicar vehículos.
            </Notice>
          ) : (
            zones.map((z) => {
              const occ = zoneOccupancy(state, z.id);
              const plazas = state.positions.filter((p) => p.zoneId === z.id).length;
              return (
                <View
                  key={z.id}
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
                    <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: c.text, flex: 1, minWidth: 120 }}>
                      {z.name}
                    </Text>
                    <Pill tone="neutral">{z.kind}</Pill>
                    <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: c.text }}>
                      {occ.occupied}/{plazas} plazas
                    </Text>
                  </View>
                  <ProgressBar pct={occ.pct} tone={occ.pct > 90 ? 'red' : 'ok'} />
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <Btn small onPress={() => setZoneModal(z)}>
                      Editar y nº de plazas
                    </Btn>
                    <Btn small onPress={() => setPositionsOf(z)}>
                      Plazas una a una
                    </Btn>
                  </View>
                </View>
              );
            })
          )}
        </Panel>
      ) : null}

      {siteModal ? (
        <SiteModal site={siteModal} onClose={() => setSiteModal(null)} onDone={onDone} onCreated={setSiteId} />
      ) : null}
      {zoneModal ? <ZoneModal zone={zoneModal} onClose={() => setZoneModal(null)} onDone={onDone} /> : null}
      {positionsOf ? (
        <PositionsModal zone={positionsOf} onClose={() => setPositionsOf(null)} onDone={onDone} />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ sede */

function SiteModal({
  site,
  onClose,
  onDone,
  onCreated,
}: {
  site: Site;
  onClose: () => void;
  onDone: (m: string) => void;
  onCreated: (id: string) => void;
}) {
  const { state, run } = useStore();
  const isNew = site.id === '';
  const [name, setName] = useState(site.name);
  const [kind, setKind] = useState(site.kind);
  const [prepares, setPrepares] = useState(site.prepares);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicles = state.vehicles.filter((v) => v.location?.siteId === site.id).length;

  const save = () => {
    const clean = name.trim();
    if (!clean) return setError('Ponle un nombre a la sede.');
    const id = isNew ? slug(clean) : site.id;
    if (isNew && state.sites.some((s) => s.id === id)) {
      return setError('Ya existe una sede con ese nombre.');
    }
    run({ type: 'site.upsert', site: { id, name: clean, kind, prepares } });
    onDone(isNew ? `Sede «${clean}» creada.` : `Sede «${clean}» actualizada.`);
    if (isNew) onCreated(id);
    onClose();
  };

  return (
    <>
      <Modal
        visible
        onClose={onClose}
        title={isNew ? '🏢 Nueva sede' : `Sede · ${site.name}`}
        footer={
          <>
            <Btn variant="primary" full onPress={save}>
              {isNew ? 'Crear sede' : 'Guardar cambios'}
            </Btn>
            {!isNew ? (
              <Btn variant="danger" full onPress={() => setConfirm(true)} disabled={vehicles > 0}>
                {vehicles > 0 ? `No se puede borrar: ${vehicles} vehículos dentro` : 'Borrar sede'}
              </Btn>
            ) : null}
          </>
        }
      >
        <Field label="Nombre">
          <Input value={name} onChangeText={setName} placeholder="Ej.: Amorebieta" />
        </Field>
        <Field label="Tipo" hint="Una campa solo almacena; una concesión también entrega y prepara.">
          <Segmented
            value={kind}
            onChange={(v) => setKind(v as Site['kind'])}
            options={[
              { value: 'campa', label: 'Campa' },
              { value: 'concesion', label: 'Concesión' },
            ]}
          />
        </Field>
        <Checkbox
          checked={prepares}
          onToggle={() => setPrepares((p) => !p)}
          label="Aquí se preparan vehículos"
          hint="Si lo desactivas, esta sede no aparecerá al solicitar una preparación."
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Modal>

      <ConfirmDialog
        visible={confirm}
        title="Borrar sede"
        message={`Se borrarán también sus zonas y plazas. Esta sede no tiene vehículos, así que no se pierde ningún historial.`}
        confirmLabel="Borrar"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          run({ type: 'site.delete', siteId: site.id });
          onDone(`Sede «${site.name}» borrada.`);
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ zona */

function ZoneModal({ zone, onClose, onDone }: { zone: Zone; onClose: () => void; onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const isNew = zone.id === '';
  const [name, setName] = useState(zone.name);
  const [kind, setKind] = useState<ZoneKind>(zone.kind);
  const [capacity, setCapacity] = useState(String(zone.capacity));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occupied = vehiclesInZone(state, zone.id).length;
  const current = state.positions.filter((p) => p.zoneId === zone.id).length;
  const wanted = Number(capacity.replace(/\D/g, '')) || 0;

  const save = () => {
    const clean = name.trim();
    if (!clean) return setError('Ponle un nombre a la zona.');
    if (wanted <= 0) return setError('Indica cuántas plazas tiene.');
    const id = isNew ? `${zone.siteId}-${slug(clean)}` : zone.id;
    if (isNew && state.zones.some((z) => z.id === id)) {
      return setError('Ya existe una zona con ese nombre en esta sede.');
    }
    if (!isNew && wanted < occupied) {
      return setError(`No puedes bajar de ${occupied} plazas: hay coches ocupándolas.`);
    }
    run({
      type: 'zone.upsert',
      zone: { id, siteId: zone.siteId, name: clean, kind, capacity: wanted },
      positions: wanted,
    });
    onDone(isNew ? `«${clean}» creada con ${wanted} plazas.` : `«${clean}» actualizada.`);
    onClose();
  };

  return (
    <>
      <Modal
        visible
        onClose={onClose}
        title={isNew ? '📍 Nueva zona' : `Zona · ${zone.name}`}
        footer={
          <>
            <Btn variant="primary" full onPress={save}>
              {isNew ? 'Crear zona y plazas' : 'Guardar cambios'}
            </Btn>
            {!isNew ? (
              <Btn variant="danger" full onPress={() => setConfirm(true)} disabled={occupied > 0}>
                {occupied > 0 ? `No se puede borrar: ${occupied} coches dentro` : 'Borrar zona'}
              </Btn>
            ) : null}
          </>
        }
      >
        <Field label="Nombre">
          <Input value={name} onChangeText={setName} placeholder="Ej.: Tejavana 13" />
        </Field>
        <Field label="Tipo">
          <Select
            full
            value={kind}
            onChange={(v) => setKind(v as ZoneKind)}
            options={[
              { value: 'tejavana', label: 'Tejavana' },
              { value: 'parking', label: 'Parking' },
              { value: 'taller', label: 'Taller' },
            ]}
            title="Tipo de zona"
          />
        </Field>
        <Field
          label="Número de plazas"
          hint={
            isNew
              ? 'Se crearán numeradas P01, P02, P03…'
              : `Ahora hay ${current}. Si subes el número se añaden al final; si lo bajas, solo se quitan plazas vacías.`
          }
        >
          <Input value={capacity} onChangeText={setCapacity} keyboardType="numeric" />
        </Field>
        {!isNew && occupied > 0 ? (
          <Notice>
            {occupied} de las {current} plazas están ocupadas ahora mismo.
          </Notice>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Modal>

      <ConfirmDialog
        visible={confirm}
        title="Borrar zona"
        message="Se borrarán sus plazas. La zona está vacía, así que no se pierde nada."
        confirmLabel="Borrar"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          run({ type: 'zone.delete', zoneId: zone.id });
          onDone(`Zona «${zone.name}» borrada.`);
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}

/* ---------------------------------------------------------------- plazas */

function PositionsModal({
  zone,
  onClose,
  onDone,
}: {
  zone: Zone;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const [code, setCode] = useState('');

  const positions = state.positions.filter((p) => p.zoneId === zone.id);
  const occupiedBy = (p: Position) =>
    state.vehicles.find((v) => v.location?.positionId === p.id && v.logisticActive);

  return (
    <Modal visible onClose={onClose} title={`Plazas de ${zone.name}`}>
      <Muted>
        Aquí puedes dar de alta plazas con el código que uses en la campa (A1, B12, Rampa-3…) y quitar las
        que ya no existan. Solo se pueden borrar plazas vacías.
      </Muted>
      <Spacer h={space.sm} />

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label="Código de la plaza">
            <Input value={code} onChangeText={setCode} placeholder="Ej.: A12" autoCapitalize="characters" small />
          </Field>
        </View>
        <View style={{ marginBottom: space.md }}>
          <Btn
            small
            onPress={() => {
              if (!code.trim()) return;
              run({ type: 'position.add', zoneId: zone.id, code: code.trim() });
              onDone(`Plaza ${code.trim().toUpperCase()} añadida.`);
              setCode('');
            }}
          >
            Añadir
          </Btn>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {positions.map((p) => {
          const v = occupiedBy(p);
          return (
            <View
              key={p.id}
              style={{
                borderWidth: 1,
                borderColor: v ? c.amberFg : c.border,
                backgroundColor: v ? c.amberBg : c.surface,
                borderRadius: radius.sm,
                paddingVertical: 6,
                paddingHorizontal: 9,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: tipografia.small, fontWeight: '700', color: v ? c.amberFg : c.text }}>{p.code}</Text>
              {v ? (
                <Text style={{ fontSize: tipografia.label, color: c.amberFg }}>ocupada</Text>
              ) : (
                <Text
                  onPress={() => {
                    run({ type: 'position.delete', positionId: p.id });
                    onDone(`Plaza ${p.code} borrada.`);
                  }}
                  style={{ fontSize: tipografia.body, color: c.textMuted }}
                >
                  ×
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <Spacer h={space.sm} />
      <Muted>
        {positions.length} plazas · {positions.filter((p) => occupiedBy(p)).length} ocupadas
      </Muted>
    </Modal>
  );
}
