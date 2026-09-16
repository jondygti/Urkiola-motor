from pathlib import Path

p = Path('server/pruebas/llaves-traslados.test.ts')
s = p.read_text()
old = """      targetSiteId: null,
      deliveredAt: null,
      deliveredBy: null,"""
new = """      targetSiteId: null,
      locationObservedAt: null,
      lastCheckAt: null,
      lastMovementAt: null,
      deliveredAt: null,
      deliveredBy: null,"""
if old not in s:
    raise SystemExit('No se encontró el escenario temporal de llaves')
p.write_text(s.replace(old, new, 1))
