import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Btn,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Muted,
  Notice,
  Panel,
  Pill,
  Select,
  Spacer,
  Toolbar,
  space,
  useTheme,
} from '@/ui';
import { useStore } from '@/data/store';
import { allColumns } from '@/data/selectors';
import {
  CUSTOM_FIELD_TYPE_LABEL,
  type ColumnPref,
  type CustomField,
  type CustomFieldType,
} from '@/data/types';

/**
 * Configuración de la lista de flota: qué columnas se ven y qué campos
 * propios existen para clasificar los coches de otras maneras.
 */
export function FleetAdmin({ onDone }: { onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const { c } = useTheme();
  const [fieldModal, setFieldModal] = useState<CustomField | null>(null);

  const columns = allColumns(state);

  const setColumns = (next: ColumnPref[]) => run({ type: 'config.update', patch: { fleetColumns: next } });

  const toggleColumn = (key: string) => {
    const next = columns.map((col) =>
      col.key === key ? { ...col.pref, visible: !col.pref.visible } : col.pref
    );
    setColumns(next);
  };

  const move = (key: string, dir: -1 | 1) => {
    const list = [...columns];
    const i = list.findIndex((col) => col.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setColumns(list.map((col, idx) => ({ ...col.pref, order: idx + 1 })));
  };

  const newField = (): CustomField => ({
    id: '',
    label: '',
    type: 'lista',
    options: [],
    showInTable: true,
    filterable: true,
    order: state.config.customFields.length + 1,
  });

  return (
    <>
      <Panel title="📋 Columnas de la lista de flota">
        <Muted>
          Elige qué columnas quieres ver y en qué orden. Afecta a la pantalla de Flota en la web; en el móvil
          la lista se muestra como fichas y enseña las primeras.
        </Muted>
        <Spacer h={space.sm} />

        {columns.map((col, i) => (
          <View
            key={col.key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 7,
              borderBottomWidth: 1,
              borderBottomColor: c.borderSoft,
            }}
          >
            <View style={{ flex: 1 }}>
              <Checkbox
                checked={col.pref.visible}
                onToggle={() => toggleColumn(col.key)}
                label={col.label}
              />
            </View>
            <Btn small variant="ghost" onPress={() => move(col.key, -1)} disabled={i === 0}>
              ↑
            </Btn>
            <Btn small variant="ghost" onPress={() => move(col.key, 1)} disabled={i === columns.length - 1}>
              ↓
            </Btn>
          </View>
        ))}
      </Panel>

      <Spacer h={space.lg} />

      <Panel title="🏷️ Campos propios del vehículo">
        <Muted>
          Si necesitas separar los coches de otra forma —financiera, campaña, cliente, prioridad…— crea aquí
          un campo. Aparecerá en la ficha del vehículo y, si quieres, como columna y filtro en la lista.
        </Muted>
        <Toolbar>
          <Btn variant="primary" onPress={() => setFieldModal(newField())}>
            + Nuevo campo
          </Btn>
        </Toolbar>

        {state.config.customFields.length === 0 ? (
          <Notice>Todavía no hay campos propios.</Notice>
        ) : (
          state.config.customFields.map((f) => {
            const usados = state.vehicles.filter((v) => v.custom?.[f.id]).length;
            return (
              <View
                key={f.id}
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
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{f.label}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>
                    {CUSTOM_FIELD_TYPE_LABEL[f.type]}
                    {f.type === 'lista' ? ` · ${f.options.length} opciones` : ''} · relleno en {usados}{' '}
                    vehículos
                  </Text>
                </View>
                {f.showInTable ? <Pill tone="blue">Columna</Pill> : null}
                {f.filterable ? <Pill tone="neutral">Filtrable</Pill> : null}
                <Btn small onPress={() => setFieldModal(f)}>
                  Editar
                </Btn>
              </View>
            );
          })
        )}
      </Panel>

      {fieldModal ? (
        <FieldModal field={fieldModal} onClose={() => setFieldModal(null)} onDone={onDone} />
      ) : null}
    </>
  );
}

function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function FieldModal({
  field,
  onClose,
  onDone,
}: {
  field: CustomField;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const { state, run } = useStore();
  const isNew = field.id === '';
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState<CustomFieldType>(field.type);
  const [options, setOptions] = useState<string[]>(field.options);
  const [optionDraft, setOptionDraft] = useState('');
  const [showInTable, setShowInTable] = useState(field.showInTable);
  const [filterable, setFilterable] = useState(field.filterable);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usados = state.vehicles.filter((v) => v.custom?.[field.id]).length;

  const save = () => {
    const clean = label.trim();
    if (!clean) return setError('Ponle un nombre al campo.');
    if (type === 'lista' && options.length === 0) {
      return setError('Un campo de lista necesita al menos una opción.');
    }
    const id = isNew ? `cf-${slug(clean)}` : field.id;
    if (isNew && state.config.customFields.some((f) => f.id === id)) {
      return setError('Ya existe un campo con ese nombre.');
    }
    run({
      type: 'customField.upsert',
      field: { id, label: clean, type, options, showInTable, filterable, order: field.order },
    });
    onDone(isNew ? `Campo «${clean}» creado.` : `Campo «${clean}» actualizado.`);
    onClose();
  };

  return (
    <>
      <Modal
        visible
        onClose={onClose}
        title={isNew ? '🏷️ Nuevo campo' : `Campo · ${field.label}`}
        footer={
          <>
            <Btn variant="primary" full onPress={save}>
              {isNew ? 'Crear campo' : 'Guardar cambios'}
            </Btn>
            {!isNew ? (
              <Btn variant="danger" full onPress={() => setConfirm(true)}>
                Borrar campo
              </Btn>
            ) : null}
          </>
        }
      >
        <Field label="Nombre">
          <Input value={label} onChangeText={setLabel} placeholder="Ej.: Financiera" />
        </Field>
        <Field label="Tipo">
          <Select
            full
            value={type}
            onChange={(v) => setType(v as CustomFieldType)}
            options={Object.entries(CUSTOM_FIELD_TYPE_LABEL).map(([value, l]) => ({ value, label: l }))}
            title="Tipo de campo"
          />
        </Field>

        {type === 'lista' ? (
          <Field label="Opciones">
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Input value={optionDraft} onChangeText={setOptionDraft} placeholder="Añadir opción" small />
              </View>
              <Btn
                small
                onPress={() => {
                  const v = optionDraft.trim();
                  if (!v || options.includes(v)) return;
                  setOptions((o) => [...o, v]);
                  setOptionDraft('');
                }}
              >
                Añadir
              </Btn>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {options.map((o) => (
                <Pill key={o} tone="neutral">
                  {o}
                </Pill>
              ))}
            </View>
            {options.length ? (
              <Btn small variant="ghost" onPress={() => setOptions([])}>
                Vaciar opciones
              </Btn>
            ) : null}
          </Field>
        ) : null}

        <Checkbox
          checked={showInTable}
          onToggle={() => setShowInTable((v) => !v)}
          label="Mostrar como columna en la lista de flota"
        />
        <Checkbox
          checked={filterable}
          onToggle={() => setFilterable((v) => !v)}
          label="Permitir filtrar por este campo"
        />

        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Modal>

      <ConfirmDialog
        visible={confirm}
        title="Borrar campo"
        message={
          usados > 0
            ? `${usados} vehículos tienen un valor en este campo y se perderá. El resto de datos no se toca.`
            : 'Ningún vehículo lo está usando.'
        }
        confirmLabel="Borrar"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          run({ type: 'customField.delete', fieldId: field.id });
          onDone(`Campo «${field.label}» borrado.`);
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}
