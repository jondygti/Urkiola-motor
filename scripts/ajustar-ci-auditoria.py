from pathlib import Path


def rep(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found != count:
        raise SystemExit(f'{path}: se esperaban {count} coincidencias y hay {found}')
    p.write_text(text.replace(old, new, count))

# Compatibilidad: versiones anteriores podían enviar zone.upsert sin `positions`.
rep('src/data/commands.ts',
"""    case 'zone.upsert': {
      if (!Number.isInteger(cmd.positions) || cmd.positions < 0) return state;
      const current = state.positions.filter((p) => p.zoneId === cmd.zone.id);""",
"""    case 'zone.upsert': {
      const positionsSolicitadas = cmd.positions ?? cmd.zone.capacity;
      if (!Number.isInteger(positionsSolicitadas) || positionsSolicitadas < 0) return state;
      const current = state.positions.filter((p) => p.zoneId === cmd.zone.id);""")
rep('src/data/commands.ts',
"""      if (cmd.positions < occupiedCount) return state;

      const normalizedZone = { ...cmd.zone, capacity: cmd.positions };""",
"""      if (positionsSolicitadas < occupiedCount) return state;

      const normalizedZone = { ...cmd.zone, capacity: positionsSolicitadas };""")
rep('src/data/commands.ts',
"""      if (cmd.positions > current.length) {
        for (let i = current.length; i < cmd.positions; i++) {""",
"""      if (positionsSolicitadas > current.length) {
        for (let i = current.length; i < positionsSolicitadas; i++) {""")
rep('src/data/commands.ts',
"""      } else if (cmd.positions < current.length) {
        const removable = current
          .slice()
          .reverse()
          .filter((p) => !occupied.has(p.id))
          .slice(0, current.length - cmd.positions)""",
"""      } else if (positionsSolicitadas < current.length) {
        const removable = current
          .slice()
          .reverse()
          .filter((p) => !occupied.has(p.id))
          .slice(0, current.length - positionsSolicitadas)""")

rep('server/src/validar.ts',
"""  if (c.type === 'zone.upsert' && (typeof c.positions !== 'number' || !Number.isInteger(c.positions) || c.positions < 0)) {
    throw malaPeticion('El número de plazas debe ser un entero igual o mayor que cero.');
  }""",
"""  if (c.type === 'zone.upsert') {
    const positions = c.positions ?? c.zone?.capacity;
    if (typeof positions !== 'number' || !Number.isInteger(positions) || positions < 0) {
      throw malaPeticion('El número de plazas debe ser un entero igual o mayor que cero.');
    }
  }""")

# La prueba de avisos necesita ahora un coche sin preparación equivalente en ninguna sede.
rep('server/pruebas/revision.test.ts',
"""  const v = s.vehicles.find((x) => x.logisticActive &&
    !s.requests.some(r => r.vehicleId === x.id && r.type === 'preparacion' && r.siteId === 'leioa' && r.status !== 'terminada' && r.status !== 'cancelada') &&
    !s.preparations.some(p => p.vehicleId === x.id && p.siteId === 'leioa' && p.runState !== 'terminado' && p.runState !== 'cancelado'))!;""",
"""  const v = s.vehicles.find((x) => x.logisticActive &&
    !s.requests.some(r => r.vehicleId === x.id && r.type === 'preparacion' && (r.prepTipo ?? 'entrada') === 'entrada' && r.status !== 'terminada' && r.status !== 'cancelada') &&
    !s.preparations.some(p => p.vehicleId === x.id && (p.tipo ?? 'entrada') === 'entrada' && p.runState !== 'terminado' && p.runState !== 'cancelado'))!;""")

Path('scripts/ajustar-ci-auditoria.py').unlink()
Path('.github/workflows/ajustar-ci-auditoria.yml').unlink()
