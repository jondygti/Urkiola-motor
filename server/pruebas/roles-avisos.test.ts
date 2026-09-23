import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedState } from '../../src/data/seed';
import { applyCommand } from '../../src/data/commands';
import { cmd, servidorDePruebas } from './ayuda';

const role = { id: 'rol-avisos', label: 'Destinatarios', builtin: false, permissions: [], mobileSections: [] };
for (const active of [true, false]) {
  test(`no borrar un rol destinatario de una regla ${active ? 'activa' : 'inactiva'}`, () => {
    let s = buildSeedState();
    s = applyCommand(s, cmd('role.upsert', { role }));
    const { id: _id, createdAt: _at, ...base } = s.rules[0];
    const rule = { ...base, active, audience: { kind: 'rol', roleId: role.id } };
    s = applyCommand(s, cmd('rule.create', { rule }));
    const t = applyCommand(s, cmd('role.delete', { roleId: role.id }));
    assert.ok(t.config.roles.some(r => r.id === role.id));
    assert.deepEqual(t.rules, s.rules);
  });
}

test('backend rechaza borrar un rol con avisos y permite borrarlo al retirar la regla', async () => {
  const p = await servidorDePruebas();
  try {
    const s = p.servicio;
    const admin = s.estado.users.find(u => u.id === 'u-admin')!;
    await s.ejecutar(cmd('role.upsert', { role }), admin);
    const { id: _id, createdAt: _at, ...base } = s.estado.rules[0];
    const regla = cmd('rule.create', { rule: { ...base, audience: { kind: 'rol', roleId: role.id } } });
    await s.ejecutar(regla, admin);
    await assert.rejects(() => s.ejecutar(cmd('role.delete', { roleId: role.id }), admin), { codigo: 400 });
    assert.ok(s.estado.config.roles.some(r => r.id === role.id));
    await s.ejecutar(cmd('rule.delete', { ruleId: `rule-${regla.id}` }), admin);
    const borrar = cmd('role.delete', { roleId: role.id });
    await s.ejecutar(borrar, admin);
    assert.ok(!s.estado.config.roles.some(r => r.id === role.id));
    assert.equal((await s.ejecutar(borrar, admin)).repetido, true);
  } finally { await p.limpiar(); }
});
