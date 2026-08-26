import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Checkbox, Code, Field, Grid, H1, H3, Input, Modal, Muted, Notice, Panel, Pill, Screen, Segmented, Spacer, StatLine, Toolbar, radius, space, tipografia, useTheme } from '@/ui';
import { useAppState, useStore } from '@/data/store';
import { API_URL, apiEnabled } from '@/data/api';
import type { Requirement, VehicleType } from '@/data/types';
import { can, roleLabel } from '@/data/selectors';
import { LocationsAdmin } from '@/features/admin/LocationsAdmin';
import { UsersAdmin } from '@/features/admin/UsersAdmin';
import { FleetAdmin } from '@/features/admin/FleetAdmin';
import { CarriersAdmin } from '@/features/admin/CarriersAdmin';

export default function AdminScreen() {
  const state = useAppState();
  const { run, resetDemo, mode, user } = useStore();
  const { c } = useTheme();

  const [tab, setTab] = useState<
    'operativa' | 'ubicaciones' | 'flota' | 'usuarios' | 'transporte' | 'sistema'
  >('operativa');
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const setTarget = (type: VehicleType, minutes: number) =>
    run({
      type: 'config.update',
      patch: { prepTargetMinutes: { ...state.config.prepTargetMinutes, [type]: minutes } },
    });

  if (!can(state, user, 'admin.configurar')) {
    return (
      <Screen>
        <H1>Administración</H1>
        <Notice tone="warn">
          Tu rol ({roleLabel(state, user?.role)}) no tiene permiso para configurar el sistema. Habla con un
          administrador si necesitas acceso.
        </Notice>
      </Screen>
    );
  }

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
            { value: 'operativa', label: 'Preparación' },
            { value: 'ubicaciones', label: 'Ubicaciones' },
            { value: 'flota', label: 'Flota y columnas' },
            { value: 'usuarios', label: 'Usuarios y roles' },
            { value: 'transporte', label: 'Transporte' },
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
              <Field label="Horas de plazo del transportista" hint="Desde que recoge las llaves.">
                <Input
                  value={String(state.config.transferDeadlineHours)}
                  onChangeText={(v) =>
                    run({
                      type: 'config.update',
                      patch: { transferDeadlineHours: Number(v.replace(/\D/g, '')) || 48 },
                    })
                  }
                  keyboardType="numeric"
                />
              </Field>
              <Field
                label="Horas mínimas de preparación"
                hint="Lo que el comercial tiene que dar de margen al pedirla."
              >
                <Input
                  value={String(state.config.prepDeadlineHours)}
                  onChangeText={(v) =>
                    run({
                      type: 'config.update',
                      patch: { prepDeadlineHours: Number(v.replace(/\D/g, '')) || 48 },
                    })
                  }
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
                Ojo con la diferencia: el objetivo de 2 h es lo que debe durar el trabajo; las 48 h son el
                plazo comprometido para tenerlo listo. Los plazos se calculan al crear la solicitud, así que
                cambiarlos aquí no mueve lo ya comprometido.
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
                  <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: c.text }}>{r.label}</Text>
                  <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
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

      {tab === 'ubicaciones' ? <LocationsAdmin onDone={setToast} /> : null}

      {tab === 'flota' ? <FleetAdmin onDone={setToast} /> : null}

      {tab === 'usuarios' ? <UsersAdmin onDone={setToast} /> : null}

      {tab === 'transporte' ? <CarriersAdmin onDone={setToast} /> : null}

      {tab === 'sistema' ? (
        <>
          <Panel title="🔄 Regla de datos: Quiter → Urkiola">
            <Notice>
              <Text style={{ fontSize: tipografia.small, color: c.text, lineHeight: 18 }}>
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
                { t: 'API', s: 'Node en Railway (UE)' },
                { t: 'Base de datos', s: 'PostgreSQL en Supabase' },
                { t: 'Fotos y albaranes', s: 'Supabase Storage (S3)' },
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
                  <Text style={{ fontSize: tipografia.small, fontWeight: '800', color: c.text }}>{box.t}</Text>
                  <Text style={{ fontSize: tipografia.micro, color: c.textMuted, marginTop: 3, textAlign: 'center' }}>
                    {box.s}
                  </Text>
                </View>
              ))}
            </Grid>
            <StatLine
              items={[
                '🇪🇺 Datos alojados en la UE (RGPD)',
                '🔐 Permisos por rol, comprobados en el servidor',
                '🛡️ Claves de servicio solo en el servidor',
                '💾 Copias diarias + volcado semanal fuera',
                '📊 Registro de auditoría',
              ]}
            />
            <Spacer h={space.sm} />
            <Muted>
              Conexión actual: {apiEnabled ? API_URL : 'modo demostración (datos en el dispositivo)'}. La
              comparativa de alojamientos y los pasos de despliegue están en `docs/DESPLIEGUE.md`.
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
