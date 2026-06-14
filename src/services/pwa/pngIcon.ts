// [SCOPE] Dependency-free PNG icon generator (Phase 3) — produces a clean diagonal-gradient tile PNG (RGBA) at a
// given size, for the PWA's iOS home-screen icon (apple-touch-icon / manifest PNG). Uses Node's built-in zlib; no
// native deps. Text/initials on the PNG needs a font rasterizer (follow-up) — the SVG icon keeps the initials for
// Android/manifest. See docs/REDIVIVUS_ADD_TO_PHONE.md.
import * as zlib from 'zlib';

// '#rrggbb' -> [r,g,b]. Falls back to dark slate on a bad value.
function hex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((c || '').trim());
  if (!m) { return [15, 17, 23]; }
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// CRC-32 (PNG chunk checksum).
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) { c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// Encode an RGBA buffer (size*size*4) as a PNG.
function encodePng(size: number, rgba: Uint8Array): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) { raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// A full-bleed diagonal gradient tile (theme -> background). Full-bleed so iOS/Android masks/rounds it cleanly.
export function iconPng(themeColor: string, backgroundColor: string, size: number): Buffer {
  const [r1, g1, b1] = hex(themeColor);
  const [r2, g2, b2] = hex(backgroundColor);
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * (size - 1)); // 0..1 diagonal
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r1 + (r2 - r1) * t);
      rgba[i + 1] = Math.round(g1 + (g2 - g1) * t);
      rgba[i + 2] = Math.round(b1 + (b2 - b1) * t);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}
