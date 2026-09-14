import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Checkbox, ConfirmDialog, Field, Grid, Input, Modal, Muted, Notice, Panel, Pill, Segmented, Select, Toolbar, radius, useTheme, tipografia } from '@/ui';
import { useStore } from '@/data/store';
import { roleLabel } from '@/data/selectors';
import { NAV } from '@/features/shell/nav';
import {
  ALL_PERMISSIONS,
  PERMISSION_LABEL,
  type Permission,
  type RoleConfig,
  type User,
} from '@/data/types';

function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function UsersAdmin({ onDone }: { onDone: (m: string) => void }) {
  const { state, user: me } = useStore();
  const { c } = useTheme();
  const [tab, setTab] = useState<'usuarios' | 'roles'>('usuarios');
  const [userModal, setUserModal] = useState<User | null>(null);
  const [roleModal, setRoleModal] = useState<RoleConfig | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const users = state.users.filter((u) => showInactive || u.active);

  const newUser = (): User => ({
    id: '',
    name: '',
    email: '',
    role: state.config.roles[0]?.id ?? 'comercial',
    siteIds: [],
    active: true,
  });

  const newRole = (): RoleConfig => ({
    id: '',
    label: '',
    permissions: ['flota.ver'],
    mobileSections: ['/flota'],
    simple: false,
    builtin: false,
  });

  return (
    <>
      <Toolbar>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'usuarios', label: `Usuarios · ${state.users.filter((u) => u.active).length}` },
            { value: 'roles', label: `Roles · ${state.config.roles.length}` },
          ]}
        />
      </Toolbar>

      {tab === 'usuarios' ? (
        <Panel title="👥 Usuarios">
          <Toolbar>
            <Btn variant="primary" onPress={() => setUserModal(newUser())}>
              + Nuevo usuario
            </Btn>
            <Btn onPress={() => setShowInactive((v) => !v)}>
              {showInactive ? 'Ocultar dados de baja' : 'Ver dados de baja'}
            </Btn>
          </Toolbar>

          {users.map((u) => (
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
                opacity: u.active ? 1 : 0.5,
              }}
            >
              <View style={{ flex: 1, minWidth: 170 }}>
                <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: c.text }}>
                  {u.name}
                  {u.id === me?.id ? ' · tú' : ''}
                </Text>
                <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>{u.email}</Text>
              </View>
              <Pill tone={u.active ? 'blue' : 'neutral'}>{roleLabel(state, u.role)}</Pill>
              <Text style={{ fontSize: tipografia.micro, color: c.textMuted, minWidth: 90 }}>
                {u.siteIds.length ? u.siteIds.map((id) => state.sites.find((s) => s.id === id)?.name ?? id).join(', ') : 'Todas las sedes'}
              </Text>
              <Btn small onPress={() => setUserModal(u)}>
                Editar
              </Btn>
            </View>
          ))}
        </Panel>
      ) : (
        <Panel title="🔑 Roles y permisos">
          <Muted>
            Cada rol decide qué ve y qué puede hacer una persona, tanto en la web como en el móvil. Puedes
            crear roles nuevos si tu organización no encaja con los de serie.
          </Muted>
          <Toolbar>
            <Btn variant="primary" onPress={() => setRoleModal(newRole())}>
              + Nuevo rol
            </Btn>
          </Toolbar>

          <Grid cols={2} minWidth={280}>
            {state.config.roles.map((r) => {
              const count = state.users.filter((u) => u.active && u.role === r.id).length;
              const bajas = state.users.filter((u) => !u.active && u.role === r.id).length;
              return (
                <View
                  key={r.id}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: radius.md,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: c.text, flex: 1 }}>{r.label}</Text>
                    {r.simple ? <Pill tone="blue">Externo</Pill> : null}
                    {r.builtin ? <Pill tone="neutral">De serie</Pill> : null}
                  </View>
                  <Text style={{ fontSize: tipografia.micro, color: c.textMuted }}>
                    {r.permissions.length} permisos · {r.mobileSections.length} secciones en el móvil ·{' '}
                    {count} {count === 1 ? 'persona' : 'personas'}
                    {bajas ? ` · ${bajas} de baja` : ''}
                  </Text>
                  <Btn small onPress={() => setRoleModal(r)}>
                    Editar permisos
                  </Btn>
                </View>
              );
            })}
          </Grid>
        </Panel>
      )}

      {userModal ? <UserModal user={userModal} onClose={() => setUserModal(null)} onDone={onDone} /> : null}
      {roleModal ? <RoleModal role={roleModal} onClose={() => setRoleModal(null)} onDone={onDone} /> : null}
    </>
  );
}

/* --------------------------------------------------------------- usuario */

function UserModal({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: (m: string) => void }) {
  const { state, run, user: me, mode } = useStore();
  const isNew = user.id === '';
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [siteIds, setSiteIds] = useState<string[]>(user.siteIds);
  const [active, setActive] = useState(user.active);
  const [carrierId, setCarrierId] = useState<string | null>(user.carrierId ?? null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMe = user.id === me?.id;

  const save = () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) return setError('Falta el nombre.');
    if (!cleanEmail.includes('@')) return setError('El correo no parece válido.');
    if (state.users.some((u) => u.email.toLowerCase() === cleanEmail && u.id !== user.id)) {
      return setError('Ya hay otro usuario con ese correo.');
    }
    const id = isNew ? `u-${slug(cleanName)}-${Date.now().toString(36).slice(-4)}` : user.id;
    run({
      type: 'user.upsert',
      user: { id, name: cleanName, email: cleanEmail, role, siteIds, active, carrierId },
    });
    onDone(isNew ? `${cleanName} dado de alta.` : `${cleanName} actualizado.`);
    onClose();
  };

  const toggleSite = (id: string) =>
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <>
      <Modal
        visible
        onClose={onClose}
        title={isNew ? '👤 Nuevo usuario' : `Usuario · ${user.name}`}
        footer={
          <>
            <Btn variant="primary" full onPress={save}>
              {isNew ? 'Dar de alta' : 'Guardar cambios'}
            </Btn>
            {!isNew && user.active ? (
              <Btn variant="danger" full onPress={() => setConfirm(true)} disabled={isMe}>
                {isMe ? 'No puedes darte de baja a ti mismo' : 'Dar de baja'}
              </Btn>
            ) : null}
          </>
        }
      >
        {isNew && mode === 'api' ? (
          <Notice>Después de sincronizar el alta, esta persona puede crear su contraseña desde «Primer acceso o nueva contraseña». Recibirá el enlace en su correo.</Notice>
        ) : null}
        <Field label="Nombre y apellidos">
          <Input value={name} onChangeText={setName} placeholder="Ej.: Aitor Mendiola" />
        </Field>
        <Field label="Correo" hint="Es con lo que entra en la app.">
          <Input value={email} onChangeText={setEmail} placeholder="nombre@urkiolacarservice.com" autoCapitalize="none" keyboardType="email-address" />
        </Field>
        <Field label="Rol">
          <Select
            full
            value={role}
            onChange={setRole}
            options={state.config.roles.map((r) => ({
              value: r.id,
              label: r.label,
              hint: `${r.permissions.length} permisos`,
            }))}
            title="Rol"
          />
        </Field>
        {state.config.roles.find((r) => r.id === role)?.permissions.includes('traslados.propios') ? (
          <Field
            label="Empresa de transporte"
            hint="Verá en su móvil los traslados encargados a esta empresa."
          >
            <Select
              full
              value={carrierId}
              onChange={setCarrierId}
              placeholder="Sin empresa"
              options={state.carriers
                .filter((x) => x.active)
                .map((x) => ({ value: x.id, label: x.name }))}
              title="Empresa"
            />
          </Field>
        ) : null}

        <Field label="Sedes" hint="Sin marcar ninguna, ve todas las sedes.">
          {state.sites.map((s) => (
            <Checkbox
              key={s.id}
              checked={siteIds.includes(s.id)}
              onToggle={() => toggleSite(s.id)}
              label={s.name}
            />
          ))}
        </Field>
        {!isNew && !user.active ? (
          <Checkbox checked={active} onToggle={() => setActive((a) => !a)} label="Volver a dar de alta" />
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Modal>

      <ConfirmDialog
        visible={confirm}
        title="Dar de baja"
        message="No se borra: su nombre se conserva en el histórico de movimientos y recuentos, pero deja de poder entrar."
        confirmLabel="Dar de baja"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          run({ type: 'user.delete', targetUserId: user.id });
          onDone(`${user.name} dado de baja.`);
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ rol */

function RoleModal({ role, onClose, onDone }: { role: RoleConfig; onClose: () => void; onDone: (m: string) => void }) {
  const { state, run } = useStore();
  const isNew = role.id === '';
  const [label, setLabel] = useState(role.label);
  const [permissions, setPermissions] = useState<Permission[]>(role.permissions);
  const [mobileSections, setMobileSections] = useState<string[]>(role.mobileSections);
  const [simple, setSimple] = useState(role.simple === true);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cuenta también a los dados de baja: su ficha sigue guardando el rol y
  // por eso no se puede borrar. Si aquí se contaran solo los activos, el
  // botón diría «Borrar rol» y luego no pasaría nada.
  const inUse = state.users.filter((u) => u.role === role.id).length;
  const deBaja = state.users.filter((u) => u.role === role.id && !u.active).length;
  const allSections = NAV.flatMap((g) => g.items);

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const save = () => {
    const clean = label.trim();
    if (!clean) return setError('Ponle un nombre al rol.');
    const id = isNew ? slug(clean) : role.id;
    if (isNew && state.config.roles.some((r) => r.id === id)) {
      return setError('Ya existe un rol con ese nombre.');
    }
    run({
      type: 'role.upsert',
      role: { id, label: clean, permissions, mobileSections, simple, builtin: role.builtin },
    });
    onDone(isNew ? `Rol «${clean}» creado.` : `Rol «${clean}» actualizado.`);
    onClose();
  };

  return (
    <>
      <Modal
        visible
        onClose={onClose}
        title={isNew ? '🔑 Nuevo rol' : `Rol · ${role.label}`}
        footer={
          <>
            <Btn variant="primary" full onPress={save}>
              {isNew ? 'Crear rol' : 'Guardar cambios'}
            </Btn>
            {!isNew && !role.builtin ? (
              <Btn variant="danger" full onPress={() => setConfirm(true)} disabled={inUse > 0}>
                {inUse > 0
                  ? `No se puede borrar: ${inUse} lo tienen${deBaja ? ` (${deBaja} de baja)` : ''}`
                  : 'Borrar rol'}
              </Btn>
            ) : null}
          </>
        }
      >
        <Field label="Nombre del rol">
          <Input value={label} onChangeText={setLabel} placeholder="Ej.: Jefe de taller" />
        </Field>

        <Field label="Permisos" hint="Lo que esta gente puede hacer, en la web y en el móvil.">
          {ALL_PERMISSIONS.map((p) => (
            <Checkbox
              key={p}
              checked={permissions.includes(p)}
              onToggle={() => setPermissions((prev) => toggle(prev, p))}
              label={PERMISSION_LABEL[p]}
            />
          ))}
        </Field>

        <Checkbox
          checked={simple}
          onToggle={() => setSimple((v) => !v)}
          label="Interfaz reducida para colaboradores externos"
          hint="Una sola pantalla con su trabajo asignado, sin menú ni pestañas y sin poder salir de ahí. Pensado para transportistas y proveedores."
        />

        <Field
          label="Qué ve en el teléfono"
          hint="La app es más corta que la web a propósito: marca solo lo que este rol necesita en mano."
        >
          {allSections.map((item) => (
            <Checkbox
              key={item.href}
              checked={mobileSections.includes(item.href)}
              onToggle={() => setMobileSections((prev) => toggle(prev, item.href))}
              label={`${item.icon}  ${item.label}`}
            />
          ))}
        </Field>

        {role.builtin ? (
          <Notice>Este rol viene de serie: puedes cambiarle nombre y permisos, pero no borrarlo.</Notice>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Modal>

      <ConfirmDialog
        visible={confirm}
        title="Borrar rol"
        message="Nadie lo tiene asignado, así que se puede borrar sin afectar a ningún usuario."
        confirmLabel="Borrar"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          run({ type: 'role.delete', roleId: role.id });
          onDone(`Rol «${role.label}» borrado.`);
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}
