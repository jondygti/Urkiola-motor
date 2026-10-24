"""
Genera los iconos de la app con el símbolo EM del Grupo Easo Motor.

El logotipo que tenemos (`assets/marca/em.png`) mide 228 px: ampliado a
1024 se ve borroso. El símbolo son cinco trazos rectos, así que aquí está
dibujado como polígonos medidos sobre esa imagen, y se pinta al tamaño que
haga falta, nítido. Se dibuja a cuatro veces el tamaño y se reduce, para
que los bordes inclinados no salgan dentados.

Uso: python3 scripts/marca/iconos.py   (necesita Pillow)
"""
from PIL import Image, ImageDraw

AZUL_EASO = (0, 122, 192, 255)
BLANCO = (255, 255, 255, 255)
OSCURO = (16, 38, 45, 255)  # BRAND_DARK de app.config.ts

# Coordenadas sobre el logotipo original (228 × 214).
ANCHO, ALTO = 228, 214
CUERPO = [(16, 3), (224, 3), (224, 58), (176, 106), (224, 154), (224, 210),
          (3, 210), (5, 171), (184, 171), (121, 106), (184, 42), (14, 42)]
BARRA = [(11, 87), (94, 87), (92, 126), (8, 126)]
# Caja que ocupa el símbolo, para centrarlo.
X0, Y0, X1, Y1 = 3, 3, 224, 210


def icono(lado, fondo, color, ancho_simbolo):
    """Un cuadrado de `lado` px con el símbolo centrado, `ancho_simbolo` px de ancho."""
    k = 4
    img = Image.new('RGBA', (lado * k, lado * k), fondo)
    d = ImageDraw.Draw(img)
    escala = ancho_simbolo * k / (X1 - X0)
    dx = (lado * k - (X1 - X0) * escala) / 2 - X0 * escala
    dy = (lado * k - (Y1 - Y0) * escala) / 2 - Y0 * escala
    for poligono in (CUERPO, BARRA):
        d.polygon([(x * escala + dx, y * escala + dy) for x, y in poligono], fill=color)
    return img.resize((lado, lado), Image.LANCZOS)


TRANSPARENTE = (0, 0, 0, 0)

# Icono general (iOS y la tienda): fondo blanco, símbolo azul.
icono(1024, BLANCO, AZUL_EASO, 600).save('assets/icon.png')
# Android adaptativo: el sistema recorta en círculo, cuadrado o «squircle», y
# solo garantiza el 66 % central. El símbolo cabe de sobra en ese círculo.
icono(1024, TRANSPARENTE, AZUL_EASO, 400).save('assets/android-icon-foreground.png')
Image.new('RGBA', (1024, 1024), BLANCO).save('assets/android-icon-background.png')
# Monocromo (iconos temáticos de Android 13+): solo cuenta la forma.
icono(1024, TRANSPARENTE, BLANCO, 400).save('assets/android-icon-monochrome.png')
# Pantalla de arranque: sobre el fondo oscuro de la app, en blanco para que
# se lea; el azul sobre ese fondo se pierde.
icono(1024, TRANSPARENTE, BLANCO, 520).save('assets/splash-icon.png')
# Pestaña del navegador.
icono(64, BLANCO, AZUL_EASO, 44).save('assets/favicon.png')
print('Iconos generados en assets/')
