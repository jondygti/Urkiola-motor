import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Checkbox, ConfirmDialog, Field, Input, Modal, Muted, Notice, Panel, Pill, Toolbar, radius, space, tipografia, useTheme } from '@/ui';
import { useStore } from '@/data/store';
import type { Carrier } from '@/data/types';

function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Empresas de transporte. Urkiola reparte los traslados por zona, así que
 * cada empresa lleva las sedes que cubre y con eso la app propone sola
 * quién debe hacer cada traslado.
 */
export function CarriersAdmin({ onDone }: { onDone: (m: string) => void }) {
  const { state } = useStore();
  const { c } = useTheme();
  const [editing, setEditing] = useState<Carrier | null>(null);

  const nueva = (): Carrier => ({ id: '', name: '', siteIds: [], phone: '', active: true });

  return (
    <>
      <Panel title="🚚 Empresas de transporte">
        <Muted>
          Marca qué sedes cubre cada una. Al pedir un traslado, la app propone la empresa que llega al
          destino, y los transportistas de esa empresa lo ven en su móvil.
        </Muted>
        <Toolbar>
          <Btn variant="primary" onPress={() => setEditing(nueva())}>
            + Nueva empresa
          </Btn>
        </Toolbar>

        {state.carriers.map((x) => {
          const abiertos = state.requests.filter(
            (r) => r.carrierId === x.id && r.status !== 'terminada'
          ).length;
          const conductores = state.users.filter((u) => u.active && u.carrierId === x.id);
          return (
            <View
              key={x.id}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: radius.md,
                padding: 12,
                marginBottom: space.sm,
                gap: 6,
                opacity: x.active ? 1 : 0.55,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: tipografia.strong, fontWeight: '800', color: c.text, flex: 1, minWidth: 140 }}>
                  {x.name}
                </Text>
                {!x.active ? <Pill tone="neutral">Inactiva</Pill> : null}
                {abiertos > 0 ? <Pill tone="blue">{abiertos} en curso</Pill> : null}
              </View>

              <Text style={{ fontSize: tipografia.small, color: c.textMuted }}>
                Cubre:{' '}
                {x.siteIds.length
                  ? x.siteIds.map((id) => state.sites.find((s) => s.id === id)?.name ?? id).join(', ')
                  : 'ninguna sede marcada'}
              </Text>
              <Text style={{ fontSize: tipografia.micro, color: c.textFaint }}>
                {conductores.length
                  ? `Conductores: ${conductores.map((u) => u.name).join(', ')}`
                  : 'Sin conductores dados de alta'}
                {x.phone ? ` · ${x.phone}` : ''}
              </Text>

              <Btn small onPress={() => setEditing(x)}>
                Editar
              </Btn>
            </View>
          );
        })}

        {state.carriers.length === 0 ? <Notice>Todavía no hay empresas de transporte.</Notice> : null}
      </Panel>

      {editing ? (
        <CarrierModal carrier={editing} onClose={() => setEditing(null)} onDone={onDone} />
      ) : null}
    </>
  );
}

function CarrierModal({
  carrier,
  onClose,
  onDone,
}: {
  carrier: Carrier;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const isNew = carrier.id === '';
  const [name, setName] = useState(carrier.name);
  const [phone, setPhone] = useState(carrier.phone);
  const [siteIds, setSiteIds] = useState<string[]>(carrier.siteIds);
  const [note, setNote] = useState(carrier.note ?? '');
  const [active, setActive] = useState(carrier.active);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abiertos = state.requests.filter(
    (r) => r.carrierId === carrier.id && r.status !== 'terminada'
  ).length;

  const toggleSite = (id: string) =>
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = () => {
    const clean = name.trim();
    if (!clean) return setError('Ponle nombre a la empresa.');
    const id = isNew ? slug(clean) : carrier.id;
    if (isNew && state.carriers.some((x) => x.id === id)) {
      return setError('Ya existe una empresa con ese nombre.');
    }
    run({
      type: 'carrier.upsert',
      carrier: { id, name: clean, phone: phone.trim(), siteIds, active, note: note.trim() || undefined },
    });
    onDone(isNew ? `«${clean}» dada de alta.` : `«${clean}» actualizada.`);
    onClose();
  };

  return (
    <>
      <Modal
        visible
        onClose={onClose}
        title={isNew ? '🚚 Nueva empresa de transporte' : `Empresa · ${carrier.name}`}
        footer={
          <>
            <Btn variant="primary" full onPress={save}>
              {isNew ? 'Dar de alta' : 'Guardar cambios'}
            </Btn>
            {!isNew ? (
              <Btn variant="danger" full onPress={() => setConfirm(true)}>
                {abiertos > 0 ? `Desactivar (${abiertos} traslados en curso)` : 'Borrar empresa'}
              </Btn>
            ) : null}
          </>
        }
      >
        <Field label="Nombre">
          <Input value={name} onChangeText={setName} placeholder="Ej.: Grúas Francis" />
        </Field>
        <Field label="Teléfono (opcional)">
          <Input value={phone} onChangeText={setPhone} placeholder="Para llamar si hace falta" keyboardType="numeric" />
        </Field>
        <Field
          label="Sedes que cubre"
          hint="Con esto la app propone sola quién hace cada traslado según la ruta."
        >
          {state.sites.map((s) => (
            <Checkbox
              key={s.id}
              checked={siteIds.includes(s.id)}
              onToggle={() => toggleSite(s.id)}
              label={s.name}
            />
          ))}
        </Field>
        <Field label="Nota (opcional)">
          <Input value={note} onChangeText={setNote} placeholder="Ej.: traslados dentro de Bizkaia" multiline />
        </Field>
        {!isNew ? (
          <Checkbox
            checked={active}
            onToggle={() => setActive((v) => !v)}
            label="Activa"
            hint="Si la desactivas deja de aparecer al asignar traslados nuevos."
          />
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Modal>

      <ConfirmDialog
        visible={confirm}
        title={abiertos > 0 ? 'Desactivar empresa' : 'Borrar empresa'}
        message={
          abiertos > 0
            ? `Tiene ${abiertos} traslados en curso, así que no se borra: se desactiva y deja de aparecer al asignar. El histórico conserva su nombre.`
            : 'No tiene traslados en curso.'
        }
        confirmLabel={abiertos > 0 ? 'Desactivar' : 'Borrar'}
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          run({ type: 'carrier.delete', carrierId: carrier.id });
          onDone(abiertos > 0 ? `«${carrier.name}» desactivada.` : `«${carrier.name}» borrada.`);
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}
