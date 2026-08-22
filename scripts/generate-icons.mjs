/**
 * Genera los iconos de marca de Urkiola Car Service.
 *
 *   node scripts/generate-icons.mjs
 *
 * No usa dependencias externas: escribe los PNG a mano con zlib.
 * Si más adelante Urkiola facilita su logotipo oficial en vectorial, basta
 * con sustituir los PNG de `assets/` manteniendo los mismos nombres.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');

const DARK = [0x10, 0x26, 0x2d, 255]; // #10262d
const ACCENT = [0x2f, 0xb8, 0x99, 255]; // #2fb899
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

/* ------------------------------------------------------------------ PNG */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- dibujo */

/** Máscara de la "U" de Urkiola, con coordenadas normalizadas 0..1. */
function inMark(nx, ny, scale) {
  // Centrado en (0.5, 0.5) y escalado.
  const x = (nx - 0.5) / scale;
  const y = (ny - 0.5) / scale;

  const top = -0.34;
  const bottomCenter = 0.1;
  const R = 0.3; // radio exterior
  const r = 0.155; // radio interior

  const inRegion = (halfWidth) => {
    if (y < top) return false;
    if (y <= bottomCenter) return Math.abs(x) <= halfWidth;
    const dy = y - bottomCenter;
    return Math.hypot(x, dy) <= halfWidth;
  };

  if (!inRegion(R)) return false;
  if (inRegion(r) && y >= top) return false;
  return true;
}

/** Punto sobre la "carretera" bajo la U: una banda con perspectiva. */
function inRoad(nx, ny, scale) {
  const x = (nx - 0.5) / scale;
  const y = (ny - 0.5) / scale;
  if (y < 0.42 || y > 0.5) return false;
  return Math.abs(x) <= 0.34;
}

/**
 * Dibuja el icono con antialias 3×3.
 * `bg` puede ser null para dejar el fondo transparente.
 */
function render(size, { bg, mark, road, scale = 1 }) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 3; // muestras por eje

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      let roadHits = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const nx = (x + (sx + 0.5) / S) / size;
          const ny = (y + (sy + 0.5) / S) / size;
          if (inMark(nx, ny, scale)) hits++;
          else if (road && inRoad(nx, ny, scale)) roadHits++;
        }
      }
      const total = S * S;
      const base = bg ?? CLEAR;
      let [r, g, b, a] = base;

      if (roadHits > 0) {
        const t = roadHits / total;
        const c = road;
        r = Math.round(r * (1 - t) + c[0] * t);
        g = Math.round(g * (1 - t) + c[1] * t);
        b = Math.round(b * (1 - t) + c[2] * t);
        a = Math.round(a * (1 - t) + c[3] * t);
      }
      if (hits > 0) {
        const t = hits / total;
        r = Math.round(r * (1 - t) + mark[0] * t);
        g = Math.round(g * (1 - t) + mark[1] * t);
        b = Math.round(b * (1 - t) + mark[2] * t);
        a = Math.round(a * (1 - t) + mark[3] * t);
      }

      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

function solid(size, color) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = color[0];
    buf[i * 4 + 1] = color[1];
    buf[i * 4 + 2] = color[2];
    buf[i * 4 + 3] = color[3];
  }
  return buf;
}

function write(name, size, pixels) {
  const path = join(ASSETS, name);
  writeFileSync(path, encodePng(size, size, pixels));
  console.log(`✔ ${name} (${size}×${size})`);
}

/* ------------------------------------------------------------- salida */

mkdirSync(ASSETS, { recursive: true });

// Icono principal (App Store / Play Store / web).
write('icon.png', 1024, render(1024, { bg: DARK, mark: ACCENT, road: null, scale: 0.72 }));

// Android adaptativo: capas separadas y logotipo dentro de la zona segura.
write('android-icon-background.png', 1024, solid(1024, DARK));
write('android-icon-foreground.png', 1024, render(1024, { bg: null, mark: ACCENT, road: null, scale: 0.58 }));
write('android-icon-monochrome.png', 1024, render(1024, { bg: null, mark: WHITE, road: null, scale: 0.58 }));

// Pantalla de arranque: solo la marca, el color de fondo lo pone app.config.ts.
write('splash-icon.png', 1024, render(1024, { bg: null, mark: ACCENT, road: null, scale: 0.8 }));

// Favicon de la web.
write('favicon.png', 64, render(64, { bg: DARK, mark: ACCENT, road: null, scale: 0.78 }));

console.log('\nIconos generados en assets/.');
