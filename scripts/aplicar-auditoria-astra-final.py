from pathlib import Path


def rep(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found != count:
        raise SystemExit(f'{path}: se esperaban {count} coincidencias y hay {found}')
    p.write_text(text.replace(old, new, count))


# Dominio: cancelaciones, duplicados, llaves offline y ubicaciones.
rep('src/data/commands.ts',
    "if (r.type !== 'traslado' || r.status === 'terminada' || r.pickedUpAt) continue;",
    "if (r.type !== 'traslado' || r.status === 'terminada' || r.status === 'cancelada' || r.pickedUpAt) continue;")

rep('src/data/commands.ts',
    "if (r.vehicleId !== cmd.vehicleId || r.status === 'terminada') continue;",
    "if (r.vehicleId !== cmd.vehicleId || r.status === 'terminada' || r.status === 'cancelada') continue;")

rep('src/data/commands.ts',
    """  if (c.requestType === 'preparacion' && (abiertas.some(r => r.type === 'preparacion' && r.siteId === c.siteId && (r.prepTipo ?? 'entrada') === (c.prepTipo ?? 'entrada')) ||
    s.preparations.some(p => p.vehicleId === c.vehicleId && p.siteId === c.siteId && (p.tipo ?? 'entrada') === (c.prepTipo ?? 'entrada') && p.runState !== 'terminado' && p.runState !== 'cancelado'))) return 'Ya existe una solicitud o preparación equivalente abierta.';""",
    """  if (c.requestType === 'preparacion' && (abiertas.some(r => r.type === 'preparacion' && (r.prepTipo ?? 'entrada') === (c.prepTipo ?? 'entrada')) ||
    s.preparations.some(p => p.vehicleId === c.vehicleId && (p.tipo ?? 'entrada') === (c.prepTipo ?? 'entrada') && p.runState !== 'terminado' && p.runState !== 'cancelado'))) return 'Ya existe una solicitud o preparación equivalente abierta.';""")

rep('src/data/commands.ts',
    """    case 'vehicle.setKeys': {
      if (!vehicle || (vehicle.keysUpdatedAt && cmd.at < vehicle.keysUpdatedAt)) return state;
      const patch: Partial<Vehicle> = {};
      if (cmd.primary !== undefined) patch.primaryKeyLocation = cmd.primary?.trim() || null;
      if (cmd.secondary !== undefined) patch.secondaryKeyLocation = cmd.secondary?.trim() || null;
      const changed = Object.entries(patch).some(([k, val]) => (vehicle[k as keyof Vehicle] ?? null) !== val);
      if (!changed) return state;
      const next = { ...state, vehicles: replace(state.vehicles, vehicle.id, { ...patch, keysUpdatedAt: cmd.at, keysUpdatedBy: cmd.userId }) };
      return addEvent(next, { vehicleId: vehicle.id, kind: 'solicitud', title: 'Ubicación de llaves actualizada',
        detail: `${cmd.primary !== undefined ? `Principal: ${patch.primaryKeyLocation ?? 'sin indicar'}. ` : ''}${cmd.secondary !== undefined ? `Segunda: ${patch.secondaryKeyLocation ?? 'sin indicar'}. ` : ''}${userName(state, cmd.userId)}`,
        at: cmd.at, userId: cmd.userId });
    }""",
    """    case 'vehicle.setKeys': {
      if (!vehicle) return state;
      const patch: Partial<Vehicle> = {};
      const primaryAt = vehicle.primaryKeyUpdatedAt ?? (vehicle.primaryKeyLocation != null ? vehicle.keysUpdatedAt : null);
      const secondaryAt = vehicle.secondaryKeyUpdatedAt ?? (vehicle.secondaryKeyLocation != null ? vehicle.keysUpdatedAt : null);
      let primaryChanged = false;
      let secondaryChanged = false;

      if (cmd.primary !== undefined && (!primaryAt || cmd.at >= primaryAt)) {
        const value = cmd.primary?.trim() || null;
        if ((vehicle.primaryKeyLocation ?? null) !== value) {
          primaryChanged = true;
          patch.primaryKeyLocation = value;
          patch.primaryKeyUpdatedAt = cmd.at;
          patch.primaryKeyUpdatedBy = cmd.userId;
        }
      }
      if (cmd.secondary !== undefined && (!secondaryAt || cmd.at >= secondaryAt)) {
        const value = cmd.secondary?.trim() || null;
        if ((vehicle.secondaryKeyLocation ?? null) !== value) {
          secondaryChanged = true;
          patch.secondaryKeyLocation = value;
          patch.secondaryKeyUpdatedAt = cmd.at;
          patch.secondaryKeyUpdatedBy = cmd.userId;
        }
      }
      if (!primaryChanged && !secondaryChanged) return state;
      if (!vehicle.keysUpdatedAt || cmd.at >= vehicle.keysUpdatedAt) {
        patch.keysUpdatedAt = cmd.at;
        patch.keysUpdatedBy = cmd.userId;
      }
      const next = { ...state, vehicles: replace(state.vehicles, vehicle.id, patch) };
      return addEvent(next, { vehicleId: vehicle.id, kind: 'solicitud', title: 'Ubicación de llaves actualizada',
        detail: `${primaryChanged ? `Principal: ${patch.primaryKeyLocation ?? 'sin indicar'}. ` : ''}${secondaryChanged ? `Segunda: ${patch.secondaryKeyLocation ?? 'sin indicar'}. ` : ''}${userName(state, cmd.userId)}`,
        at: cmd.at, userId: cmd.userId });
    }""")

rep('src/data/commands.ts',
    """    case 'zone.upsert': {
      const exists = state.zones.some((z) => z.id === cmd.zone.id);
      const zones = exists
        ? state.zones.map((z) => (z.id === cmd.zone.id ? cmd.zone : z))
        : [...state.zones, cmd.zone];

      const current = state.positions.filter((p) => p.zoneId === cmd.zone.id);
      let positions = [...state.positions];

      if (cmd.positions > current.length) {
        // Se añaden plazas al final, sin tocar las existentes.
        for (let i = current.length; i < cmd.positions; i++) {
          const n = String(i + 1).padStart(2, '0');
          positions.push({ id: `${cmd.zone.id}-p${n}`, zoneId: cmd.zone.id, code: `P${n}` });
        }
      } else if (cmd.positions < current.length) {
        // Al reducir, solo se quitan las plazas vacías, empezando por el final.
        const occupied = new Set(
          state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as string[]
        );
        const removable = current
          .slice()
          .reverse()
          .filter((p) => !occupied.has(p.id))
          .slice(0, current.length - cmd.positions)
          .map((p) => p.id);
        positions = positions.filter((p) => !removable.includes(p.id));
      }

      return { ...state, zones, positions };
    }""",
    """    case 'zone.upsert': {
      if (!Number.isInteger(cmd.positions) || cmd.positions < 0) return state;
      const current = state.positions.filter((p) => p.zoneId === cmd.zone.id);
      const occupied = new Set(
        state.vehicles.map((v) => v.location?.positionId).filter(Boolean) as string[]
      );
      const occupiedCount = current.filter((p) => occupied.has(p.id)).length;
      if (cmd.positions < occupiedCount) return state;

      const normalizedZone = { ...cmd.zone, capacity: cmd.positions };
      const exists = state.zones.some((z) => z.id === cmd.zone.id);
      const zones = exists
        ? state.zones.map((z) => (z.id === cmd.zone.id ? normalizedZone : z))
        : [...state.zones, normalizedZone];
      let positions = [...state.positions];

      if (cmd.positions > current.length) {
        for (let i = current.length; i < cmd.positions; i++) {
          const n = String(i + 1).padStart(2, '0');
          positions.push({ id: `${cmd.zone.id}-p${n}`, zoneId: cmd.zone.id, code: `P${n}` });
        }
      } else if (cmd.positions < current.length) {
        const removable = current
          .slice()
          .reverse()
          .filter((p) => !occupied.has(p.id))
          .slice(0, current.length - cmd.positions)
          .map((p) => p.id);
        positions = positions.filter((p) => !removable.includes(p.id));
      }

      return { ...state, zones, positions };
    }""")

rep('src/data/commands.ts',
    """    case 'position.add': {
      const code = cmd.code.trim().toUpperCase();
      if (!code) return state;
      if (state.positions.some((p) => p.zoneId === cmd.zoneId && p.code === code)) return state;
      return {
        ...state,
        positions: [
          ...state.positions,
          { id: `${cmd.zoneId}-${code.toLowerCase()}`, zoneId: cmd.zoneId, code },
        ],
      };
    }

    case 'position.delete': {
      const occupied = state.vehicles.some((v) => v.location?.positionId === cmd.positionId);
      if (occupied) return state;
      return { ...state, positions: state.positions.filter((p) => p.id !== cmd.positionId) };
    }""",
    """    case 'position.add': {
      const code = cmd.code.trim().toUpperCase();
      const zone = state.zones.find((z) => z.id === cmd.zoneId);
      if (!zone || !code) return state;
      if (state.positions.some((p) => p.zoneId === cmd.zoneId && p.code === code)) return state;
      const positions = [
        ...state.positions,
        { id: `${cmd.zoneId}-${code.toLowerCase()}`, zoneId: cmd.zoneId, code },
      ];
      const capacity = positions.filter((p) => p.zoneId === cmd.zoneId).length;
      return { ...state, positions, zones: replace(state.zones, zone.id, { capacity }) };
    }

    case 'position.delete': {
      const position = state.positions.find((p) => p.id === cmd.positionId);
      if (!position) return state;
      const occupied = state.vehicles.some((v) => v.location?.positionId === cmd.positionId);
      if (occupied) return state;
      const positions = state.positions.filter((p) => p.id !== cmd.positionId);
      const capacity = positions.filter((p) => p.zoneId === position.zoneId).length;
      return { ...state, positions, zones: replace(state.zones, position.zoneId, { capacity }) };
    }""")

# Modelo: reloj independiente para cada llave, manteniendo metadato agregado compatible.
rep('src/data/types.ts',
    """  primaryKeyLocation?: string | null;
  secondaryKeyLocation?: string | null;
  keysUpdatedAt?: ISODate | null;
  keysUpdatedBy?: Id | null;""",
    """  primaryKeyLocation?: string | null;
  secondaryKeyLocation?: string | null;
  primaryKeyUpdatedAt?: ISODate | null;
  primaryKeyUpdatedBy?: Id | null;
  secondaryKeyUpdatedAt?: ISODate | null;
  secondaryKeyUpdatedBy?: Id | null;
  /** Último cambio de cualquiera de las dos, para compatibilidad e interfaz. */
  keysUpdatedAt?: ISODate | null;
  keysUpdatedBy?: Id | null;""")

# Seguridad: ninguna ubicación/metadato de llaves sale al proveedor externo.
rep('server/src/recorte.ts',
    "primaryKeyLocation: 'se-borra', secondaryKeyLocation: 'se-borra', keysUpdatedAt: 'se-borra', keysUpdatedBy: 'se-borra',",
    "primaryKeyLocation: 'se-borra', secondaryKeyLocation: 'se-borra', primaryKeyUpdatedAt: 'se-borra', primaryKeyUpdatedBy: 'se-borra', secondaryKeyUpdatedAt: 'se-borra', secondaryKeyUpdatedBy: 'se-borra', keysUpdatedAt: 'se-borra', keysUpdatedBy: 'se-borra',")
rep('server/src/recorte.ts',
    """  return {
    ...v,
    salesRep: null,""",
    """  return {
    ...v,
    primaryKeyLocation: null,
    secondaryKeyLocation: null,
    primaryKeyUpdatedAt: null,
    primaryKeyUpdatedBy: null,
    secondaryKeyUpdatedAt: null,
    secondaryKeyUpdatedBy: null,
    keysUpdatedAt: null,
    keysUpdatedBy: null,
    salesRep: null,""")

# API: una zona siempre recibe un número de plazas válido.
rep('server/src/validar.ts',
    """  if (c.type === 'request.create' && !['traslado','preparacion'].includes(String(c.requestType))) throw malaPeticion('Tipo de solicitud no válido.');
  if (c.type === 'config.update') comprobarConfig(c.patch);""",
    """  if (c.type === 'request.create' && !['traslado','preparacion'].includes(String(c.requestType))) throw malaPeticion('Tipo de solicitud no válido.');
  if (c.type === 'zone.upsert' && (typeof c.positions !== 'number' || !Number.isInteger(c.positions) || c.positions < 0)) {
    throw malaPeticion('El número de plazas debe ser un entero igual o mayor que cero.');
  }
  if (c.type === 'config.update') comprobarConfig(c.patch);""")

# Solicitud de preparación: nunca iniciar seleccionando Sondika/otra sede que no prepara.
rep('src/features/actions/VehicleActions.tsx',
    """  const prepSites = state.sites.filter((s) => s.prepares);
  const [siteId, setSiteId] = useState(vehicle.targetSiteId ?? prepSites[0].id);""",
    """  const prepSites = state.sites.filter((s) => s.prepares);
  const destinoInicial = type === 'preparacion'
    ? (prepSites.some((s) => s.id === vehicle.targetSiteId) ? vehicle.targetSiteId! : (prepSites[0]?.id ?? ''))
    : (vehicle.targetSiteId ?? state.sites[0]?.id ?? '');
  const [siteId, setSiteId] = useState(destinoInicial);""")
rep('src/features/actions/VehicleActions.tsx',
    """  const submit = () => {
    const conflicto = conflictoSolicitud(state, { requestType: type, vehicleId: vehicle.id, siteId, prepTipo });""",
    """  const submit = () => {
    if (!siteId) {
      setAviso(type === 'preparacion' ? 'No hay ninguna sede de preparación configurada.' : 'No hay ninguna sede configurada.');
      return;
    }
    const conflicto = conflictoSolicitud(state, { requestType: type, vehicleId: vehicle.id, siteId, prepTipo });""")
rep('src/features/actions/VehicleActions.tsx',
    """      footer={
        <Btn variant="primary" full onPress={submit}>
          {aviso ? 'Pedir igualmente' : 'Crear solicitud'}""",
    """      footer={
        <Btn variant="primary" full disabled={!siteId} onPress={submit}>
          {aviso ? 'Pedir igualmente' : 'Crear solicitud'}""")

# Cancelar desde Gestión cierra ese modal para que no pueda abrirse una preparación ya cancelada.
rep('src/features/actions/CancelarSolicitud.tsx',
    "export function CancelarSolicitud({ request }: { request: ServiceRequest }) {",
    "export function CancelarSolicitud({ request, onCancelled }: { request: ServiceRequest; onCancelled?: () => void }) {")
rep('src/features/actions/CancelarSolicitud.tsx',
    """        run({ type: 'request.cancel', requestId: request.id, reason: reason.trim() });
        setOpen(false);""",
    """        run({ type: 'request.cancel', requestId: request.id, reason: reason.trim() });
        setOpen(false);
        onCancelled?.();""")
rep('app/(shell)/solicitudes.tsx',
    "<CancelarSolicitud request={state.requests.find(r => r.id === request.id) ?? request} />",
    "<CancelarSolicitud request={state.requests.find(r => r.id === request.id) ?? request} onCancelled={() => onDone('Solicitud cancelada.')} />")

# Administración de ubicaciones: 0 plazas significa zona libre, sin porcentajes falsos.
rep('src/features/admin/LocationsAdmin.tsx',
    "{occ.occupied}/{plazas} plazas",
    "{occ.hasCapacity ? `${occ.occupied}/${plazas} plazas` : `${occ.occupied} coches`}")
rep('src/features/admin/LocationsAdmin.tsx',
    """  const occupied = vehiclesInZone(state, zone.id).length;
  const current = state.positions.filter((p) => p.zoneId === zone.id).length;
  const wanted = Number(capacity.replace(/\D/g, '')) || 0;""",
    """  const occupied = vehiclesInZone(state, zone.id).length;
  const currentPositions = state.positions.filter((p) => p.zoneId === zone.id);
  const current = currentPositions.length;
  const occupiedPositions = currentPositions.filter((p) => state.vehicles.some((v) => v.location?.positionId === p.id)).length;
  const wanted = Number(capacity.replace(/\D/g, '')) || 0;""")
rep('src/features/admin/LocationsAdmin.tsx',
    """    if (!isNew && wanted > 0 && wanted < occupied) {
      return setError(`No puedes bajar de ${occupied} plazas: hay coches ocupándolas.`);
    }""",
    """    if (!isNew && wanted < occupiedPositions) {
      return setError(`No puedes bajar de ${occupiedPositions} plazas: hay coches ocupándolas.`);
    }""")
rep('src/features/admin/LocationsAdmin.tsx',
    """          <Notice>
            {occupied} de las {current} plazas están ocupadas ahora mismo.
          </Notice>""",
    """          <Notice>
            {occupied} coches en esta zona{current ? ` · ${current} plazas numeradas` : ' · sin plazas individuales'}.
          </Notice>""")

# Recepción: las zonas sin plazas también cuentan como hueco válido y se muestran por nombre.
rep('app/(shell)/mi-recepcion.tsx',
    """    const conHueco = delSitio.find((z) =>
      state.positions.some((pos) => pos.zoneId === z.id && !ocupadasIni.has(pos.id))
    );""",
    """    const conHueco = delSitio.find((z) => {
      const plazas = state.positions.filter((pos) => pos.zoneId === z.id);
      return plazas.length === 0 || plazas.some((pos) => !ocupadasIni.has(pos.id));
    });""")
rep('app/(shell)/mi-recepcion.tsx',
    """  const librasDe = (id: string) =>
    state.positions.filter((pos) => pos.zoneId === id && !ocupadas.has(pos.id)).length;
  const siguienteConHueco = zones.find((z) => z.id !== zoneId && librasDe(z.id) > 0);""",
    """  const plazasDe = (id: string) => state.positions.filter((pos) => pos.zoneId === id);
  const librasDe = (id: string) => plazasDe(id).filter((pos) => !ocupadas.has(pos.id)).length;
  const sinPlazas = (id: string) => plazasDe(id).length === 0;
  const siguienteConHueco = zones.find((z) => z.id !== zoneId && (sinPlazas(z.id) || librasDe(z.id) > 0));""")
rep('app/(shell)/mi-recepcion.tsx',
    "hint: `${state.positions.filter((p) => p.zoneId === z.id && !ocupadas.has(p.id)).length} libres`,",
    "hint: state.positions.some((p) => p.zoneId === z.id) ? `${state.positions.filter((p) => p.zoneId === z.id && !ocupadas.has(p.id)).length} libres` : 'Sin plazas individuales',")
rep('app/(shell)/mi-recepcion.tsx',
    "Ir a {siguienteConHueco.name} · {librasDe(siguienteConHueco.id)} libres",
    "Ir a {siguienteConHueco.name} · {sinPlazas(siguienteConHueco.id) ? 'sin plazas individuales' : `${librasDe(siguienteConHueco.id)} libres`}")
rep('app/(shell)/mi-recepcion.tsx',
    """              const pos = state.positions.find((p) => p.id === l.positionId);
              return (""",
    """              const pos = state.positions.find((p) => p.id === l.positionId);
              const zone = state.zones.find((z) => z.id === l.zoneId || z.id === pos?.zoneId);
              return (""")
rep('app/(shell)/mi-recepcion.tsx',
    "<Text style={{ fontSize: campo.small, color: c.textMuted }}>{pos?.code ?? '—'}</Text>",
    "<Text style={{ fontSize: campo.small, color: c.textMuted }}>{pos?.code ?? zone?.name ?? '—'}</Text>")

rep('src/features/reception/ReceptionDetails.tsx',
    "value: (l) => (l.positionId ? locationLabel(state, { siteId: reception!.siteId, positionId: l.positionId }, true) : '—'),",
    "value: (l) => (l.positionId || l.zoneId ? locationLabel(state, { siteId: reception!.siteId, zoneId: l.zoneId ?? undefined, positionId: l.positionId ?? undefined }, true) : '—'),")
rep('src/features/reception/ReceptionDetails.tsx',
    "Al marcar el vehículo como descargado con una plaza asignada, queda aparcado en esa plaza y",
    "Al marcar el vehículo como descargado con una zona o plaza asignada, queda ubicado allí y")

# Recuentos de sede: resolver las plazas por relación zona→sede, no por prefijo del id.
rep('app/(shell)/recuentos.tsx',
    """  const positions = useMemo(
    () => state.positions.filter((p) => (count.zoneId ? p.zoneId === count.zoneId : p.zoneId.startsWith(count.siteId))),
    [state.positions, count]
  );""",
    """  const positions = useMemo(() => {
    const zoneIds = new Set(state.zones.filter((z) => z.siteId === count.siteId).map((z) => z.id));
    return state.positions.filter((p) => (count.zoneId ? p.zoneId === count.zoneId : zoneIds.has(p.zoneId)));
  }, [state.positions, state.zones, count]);""")

# Refuerza la prueba de privacidad para los metadatos nuevos de cada llave.
rep('server/pruebas/auditoria-astra-final.test.ts',
    """  v.keysUpdatedAt = t(14);
  v.keysUpdatedBy = 'u-log';""",
    """  v.primaryKeyUpdatedAt = t(14);
  v.primaryKeyUpdatedBy = 'u-log';
  v.secondaryKeyUpdatedAt = t(14);
  v.secondaryKeyUpdatedBy = 'u-log';
  v.keysUpdatedAt = t(14);
  v.keysUpdatedBy = 'u-log';""")
rep('server/pruebas/auditoria-astra-final.test.ts',
    """  assert.equal(visto.keysUpdatedAt ?? null, null);
  assert.equal(visto.keysUpdatedBy ?? null, null);""",
    """  assert.equal(visto.primaryKeyUpdatedAt ?? null, null);
  assert.equal(visto.primaryKeyUpdatedBy ?? null, null);
  assert.equal(visto.secondaryKeyUpdatedAt ?? null, null);
  assert.equal(visto.secondaryKeyUpdatedBy ?? null, null);
  assert.equal(visto.keysUpdatedAt ?? null, null);
  assert.equal(visto.keysUpdatedBy ?? null, null);""")

# Autodestrucción del mecanismo temporal: no se integra en main.
Path('scripts/aplicar-auditoria-astra-final.py').unlink()
Path('.github/workflows/aplicar-auditoria-astra-final.yml').unlink()
