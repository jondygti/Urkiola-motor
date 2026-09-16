from pathlib import Path

p = Path('src/features/prep/PrepPanel.tsx')
s = p.read_text()
old = ") : !finished ? ("
if old not in s:
    raise SystemExit('No se encontró la referencia pendiente a finished')
s = s.replace(old, ") : !cerrada ? (", 1)
if 'finished' in s:
    raise SystemExit('Queda alguna referencia inesperada a finished')
p.write_text(s)
