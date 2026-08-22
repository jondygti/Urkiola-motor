import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Checkbox,
  Code,
  Field,
  Grid,
  H1,
  H3,
  Input,
  Modal,
  Muted,
  Notice,
  Panel,
  Pill,
  Screen,
  Segmented,
  Select,
  Spacer,
  StatLine,
  Toolbar,
  radius,
  space,
  useTheme,
} from '@/ui';
import { useAppState, useStore } from '@/data/store';
import { API_URL, apiEnabled } from '@/data/api';
import { ROLE_LABEL, type Requirement, type VehicleType } from '@/data/types';
import { siteOccupancy } from '@/data/selectors';

export default function AdminScreen() {
  const state = useAppState();
  const { run, resetDemo, mode } = useStore();
  const { c } = useTheme();

  const [tab, setTab] = useState<'operativa' | 'ubicaciones' | 'usuarios' | 'sistema'>('operativa');
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const setTarget = (type: VehicleType, minutes: number) =>
    run({
      type: 'config.update',
      patch: { prepTargetMinutes: { ...state.config.prepTargetMinutes, [type]: minutes } },
    });

  return (
    <Screen>
      <H1>Administración</H1>
      <Muted>Todo configurable sin tocar el código: sedes, plazas, checklists, objetivos y avisos.</Muted>

      {toast ? <Notice>{toast}</Notice> : null}

      <Toolbar>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'operativa', label: 'Operativa' },
            { value: 'ubicaciones', label: 'Ubicaciones' },
            { value: 'usuarios', label: 'Usuarios y roles' },
            { value: 'sistema', label: 'Sistema' },
          ]}
        />
      </Toolbar>

      {tab === 'operativa' ? (
        <>
          <Grid cols={2} minWidth={380}>
            <Panel title="⏱️ Objetivos de preparación">
              <Field label="Vehículo nuevo (VN) · minutos">
                <Input
                  value={String(state.config.prepTargetMinutes.VN)}
                  onChangeText={(v) => setTarget('VN', Number(v.replace(/\D/g, '')) || 0)}
                  keyboardType="numeric"
                />
              </Field>
              <Field label="Vehículo de ocasión (VO) · minutos">
                <Input
                  value={String(state.config.prepTargetMinutes.VO)}
                  onChangeText={(v) => setTarget('VO', Number(v.replace(/\D/g, '')) || 0)}
                  keyboardType="numeric"
                />
              </Field>
              <Field label="Horas sin comprobación antes de avisar">
                <Input
                  value={String(state.config.staleCheckHours)}
                  onChangeText={(v) =>
                    run({ type: 'config.update', patch: { staleCheckHours: Number(v.replace(/\D/g, '')) || 72 } })
                  }
                  keyboardType="numeric"
                />
              </Field>
              <Muted>
                «Preentrega cliente» no tiene tiempo propio: es un simple check. Los objetivos se aplican a las
                preparaciones nuevas.
              </Muted>
            </Panel>

            <Panel title="☑️ Estados de los requisitos">
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: space.sm }}>
                <Pill tone="ok">✓ Completado</Pill>
                <Pill tone="amber">⬜ Pendiente</Pill>
                <Pill tone="blue">— No requerido</Pill>
              </View>
              <Muted>
                Los requisitos no aplicables no penalizan el porcentaje ni bloquean la entrega. Un vehículo es
                «apto para entrega» cuando todos los requisitos aplicables están completados.
              </Muted>
              <Spacer h={space.md} />
              <H3>Motivos de espera</H3>
              <StatLine items={state.config.waitReasons} />
              <WaitReasonEditor onDone={setToast} />
            </Panel>
          </Grid>

          <Spacer h={space.lg} />

          <Panel title="✅ Requisitos de preparación configurables">
            <Toolbar>
              <Btn
                variant="primary"
                onPress={() =>
                  setEditing({
                    id: `req-${Date.now().toString(36)}`,
                    label: '',
                    vehicleTypes: [],
                    siteIds: [],
                    timed: true,
                    optional: false,
                    order: state.config.requirements.length + 1,
                  })
                }
              >
                + Nuevo requisito
              </Btn>
            </Toolbar>
            {state.config.requirements.map((r) => (
              <View
                key={r.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: c.borderSoft,
                  flexWrap: 'wrap',
                }}
              >
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{r.label}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>
                    {r.vehicleTypes.length ? r.vehicleTypes.join(' / ') : 'VN y VO'} ·{' '}
                    {r.siteIds.length ? r.siteIds.join(', ') : 'todas las sedes'}
                  </Text>
                </View>
                {!r.timed ? <Pill tone="blue">Sin cronómetro</Pill> : null}
                {r.optional ? <Pill tone="amber">Opcional</Pill> : null}
                <Btn small onPress={() => setEditing(r)}>
                  Editar
                </Btn>
                <Btn
                  small
                  variant="ghost"
                  onPress={() => {
                    run({ type: 'requirement.delete', requirementId: r.id });
                    setToast(`Requisito «${r.label}» eliminado.`);
                  }}
                >
                  Borrar
                </Btn>
              </View>
            ))}
          </Panel>
        </>
      ) : null}

      {tab === 'ubicaciones' ? (
        <>
          <Grid cols={3} minWidth={260}>
            {state.sites.map((s) => {
              const occ = siteOccupancy(state, s.id);
              return (
                <Panel key={s.id} title={s.name}>
                  <Muted>
                    {s.kind === 'campa' ? 'Campa · solo almacena' : 'Concesión · prepara vehículos'}
                  </Muted>
                  <Spacer h={space.sm} />
                  <Text style={{ fontSize: 24, fontWeight: '900', color: c.text }}>
                    {occ.occupied}/{occ.capacity}
                  </Text>
                  <Muted>
                    {occ.zones} zonas · {occ.pct}% de ocupación
                  </Muted>
                </Panel>
              );
            })}
          </Grid>
          <Spacer h={space.lg} />
          <ZoneEditor onDone={setToast} />
        </>
      ) : null}

      {tab === 'usuarios' ? (
        <Panel title="👥 Usuarios y permisos">
          <Muted>
            Cada rol ve solo lo que necesita. Los preparadores y transportistas trabajan desde la app móvil;
            logística y administración, desde la web.
          </Muted>
          <Spacer h={space.md} />
          {state.users.map((u) => (
            <View
              key={u.id}
              style={{
                flexDirection: 'row',
                gap: 8,
                alignItems: 'center',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: c.borderSoft,
                flexWrap: 'wrap',
              }}
            >
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{u.name}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>{u.email}</Text>
              </View>
              <Pill tone="blue">{ROLE_LABEL[u.role]}</Pill>
              <Text style={{ fontSize: 11, color: c.textMuted }}>
                {u.siteIds.length ? u.siteIds.join(', ') : 'Todas las sedes'}
              </Text>
            </View>
          ))}
        </Panel>
      ) : null}

      {tab === 'sistema' ? (
        <>
          <Panel title="🔄 Regla de datos: Quiter → Urkiola">
            <Notice>
              <Text style={{ fontSize: 12, color: c.text, lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>Quiter </Text>
                aporta los datos comerciales y de vehículo.{' '}
                <Text style={{ fontWeight: '800' }}>Urkiola Car Service </Text>
                controla ubicación, movimientos, recuentos, incidencias y preparación.
              </Text>
            </Notice>
            <Spacer h={space.sm} />
            <Code>{`PARQUE QUITER
  ↓ Excel inicial / integración por API
TODOS LOS VEHÍCULOS EN BASE DE DATOS  (${state.vehicles.length})
  ↓
Sin actividad logística → no aparece por defecto  (${state.vehicles.filter((v) => !v.logisticActive).length})
Con actividad logística → ACTIVO LOGÍSTICO        (${state.vehicles.filter((v) => v.logisticActive).length})
  ↓
Ubicación · Movimiento · Solicitud · Preparación · Incidencia · Recuento`}</Code>
          </Panel>

          <Spacer h={space.lg} />

          <Panel title="☁️ Infraestructura">
            <Grid cols={4} minWidth={150}>
              {[
                { t: 'Web + App', s: 'HTTPS · mismo código' },
                { t: 'API', s: 'Node/PostgreSQL' },
                { t: 'Base de datos', s: 'PostgreSQL gestionado' },
                { t: 'Fotos y albaranes', s: 'Almacenamiento S3' },
              ].map((box) => (
                <View
                  key={box.t}
                  style={{
                    backgroundColor: c.surfaceAlt,
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: radius.md,
                    padding: 12,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: c.text }}>{box.t}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 3, textAlign: 'center' }}>
                    {box.s}
                  </Text>
                </View>
              ))}
            </Grid>
            <StatLine
              items={[
                '🇪🇺 Datos alojados en la UE (RGPD)',
                '🔐 Acceso por rol + doble factor en admin',
                '🛡️ Base de datos en red privada',
                '💾 Copias de seguridad diarias',
                '📊 Registro de auditoría',
              ]}
            />
            <Spacer h={space.sm} />
            <Muted>
              Conexión actual: {apiEnabled ? API_URL : 'modo demostración (datos en el dispositivo)'}. La
              comparativa de servidores y los pasos de despliegue están en `docs/DESPLIEGUE.md`.
            </Muted>
          </Panel>

          <Spacer h={space.lg} />

          <Panel title="🧪 Datos de demostración">
            <Muted>
              En modo demostración los cambios se guardan solo en este dispositivo. Puedes volver al parque de
              ejemplo original cuando quieras.
            </Muted>
            <Spacer h={space.sm} />
            <Btn
              variant="danger"
              onPress={() => {
                resetDemo();
                setToast('Datos de demostración restaurados.');
              }}
              disabled={mode === 'api'}
            >
              Restaurar datos de ejemplo
            </Btn>
          </Panel>
        </>
      ) : null}

      {editing ? (
        <RequirementModal
          requirement={editing}
          onClose={() => setEditing(null)}
          onDone={(m) => {
            setToast(m);
            setEditing(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function WaitReasonEditor({ onDone }: { onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const [value, setValue] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: space.sm }}>
      <View style={{ flex: 1 }}>
        <Input value={value} onChangeText={setValue} placeholder="Añadir motivo de espera" small />
      </View>
      <Btn
        small
        onPress={() => {
          const v = value.trim();
          if (!v || state.config.waitReasons.includes(v)) return;
          run({ type: 'config.update', patch: { waitReasons: [...state.config.waitReasons, v] } });
          onDone(`Motivo «${v}» añadido.`);
          setValue('');
        }}
      >
        Añadir
      </Btn>
    </View>
  );
}

function ZoneEditor({ onDone }: { onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const [siteId, setSiteId] = useState('sondika');
  const [name, setName] = useState('');
  const [positions, setPositions] = useState('20');

  const site = state.sites.find((s) => s.id === siteId)!;

  return (
    <Panel title="➕ Nueva zona (tejavana o parking)">
      <Grid cols={3} minWidth={200}>
        <Field label="Sede">
          <Select
            full
            value={siteId}
            onChange={setSiteId}
            options={state.sites.map((s) => ({ value: s.id, label: s.name }))}
            title="Sede"
          />
        </Field>
        <Field label="Nombre">
          <Input value={name} onChangeText={setName} placeholder={site.kind === 'campa' ? 'Tejavana 13' : 'Parking 04'} />
        </Field>
        <Field label="Nº de plazas">
          <Input value={positions} onChangeText={setPositions} keyboardType="numeric" />
        </Field>
      </Grid>
      <Btn
        variant="primary"
        onPress={() => {
          const n = Number(positions.replace(/\D/g, '')) || 0;
          if (!name.trim() || n <= 0) return;
          const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
          run({
            type: 'zone.upsert',
            zone: {
              id: `${siteId}-${slug}`,
              siteId,
              name: name.trim(),
              kind: site.kind === 'campa' ? 'tejavana' : 'parking',
              capacity: n,
            },
            positions: n,
          });
          onDone(`Zona «${name.trim()}» creada con ${n} plazas.`);
          setName('');
        }}
      >
        Crear zona y plazas
      </Btn>
    </Panel>
  );
}

function RequirementModal({
  requirement,
  onClose,
  onDone,
}: {
  requirement: Requirement;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const [label, setLabel] = useState(requirement.label);
  const [types, setTypes] = useState<VehicleType[]>(requirement.vehicleTypes);
  const [siteIds, setSiteIds] = useState<string[]>(requirement.siteIds);
  const [timed, setTimed] = useState(requirement.timed);
  const [optional, setOptional] = useState(requirement.optional);

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Modal
      visible
      onClose={onClose}
      title={requirement.label ? `Requisito · ${requirement.label}` : 'Nuevo requisito'}
      footer={
        <Btn
          variant="primary"
          full
          onPress={() => {
            if (!label.trim()) return;
            run({
              type: 'requirement.upsert',
              requirement: { ...requirement, label: label.trim(), vehicleTypes: types, siteIds, timed, optional },
            });
            onDone(`Requisito «${label.trim()}» guardado.`);
          }}
        >
          Guardar requisito
        </Btn>
      }
    >
      <Field label="Nombre">
        <Input value={label} onChangeText={setLabel} placeholder="Ej.: Alfombrillas" />
      </Field>
      <Field label="Aplica a" hint="Sin marcar nada, aplica a VN y VO.">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['VN', 'VO'] as VehicleType[]).map((t) => (
            <Checkbox key={t} checked={types.includes(t)} onToggle={() => setTypes(toggle(types, t))} label={t} />
          ))}
        </View>
      </Field>
      <Field label="Sedes" hint="Sin marcar ninguna, aplica a todas.">
        {state.sites
          .filter((s) => s.prepares)
          .map((s) => (
            <Checkbox
              key={s.id}
              checked={siteIds.includes(s.id)}
              onToggle={() => setSiteIds(toggle(siteIds, s.id))}
              label={s.name}
            />
          ))}
      </Field>
      <Checkbox
        checked={timed}
        onToggle={() => setTimed((t) => !t)}
        label="Cuenta tiempo"
        hint="Desactívalo para requisitos que son un simple check, como la preentrega del cliente."
      />
      <Checkbox
        checked={optional}
        onToggle={() => setOptional((o) => !o)}
        label="Opcional"
        hint="Empieza como «no requerido» y solo cuenta si el equipo lo activa (p. ej. campaña de marca)."
      />
    </Modal>
  );
}
