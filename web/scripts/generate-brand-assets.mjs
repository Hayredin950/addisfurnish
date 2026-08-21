// Generates AddisHome brand assets into public/:
//   favicon.svg          crisp vector mark
//   favicon.ico          legacy fallback (16px + 32px PNG-in-ICO)
//   apple-touch-icon.png 180px iOS home-screen icon
//   og-image.png         1200x630 social share banner
//
// Pure Node — no image libraries. Run:  node scripts/generate-brand-assets.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
mkdirSync(PUBLIC_DIR, { recursive: true });

// ---- palette (matches src/styles.css --primary / --background) --------------
const TERRACOTTA = [172, 69, 27]; // #AC451B  oklch(0.523 0.146 40)
const RUST_DARK = [124, 45, 18]; //  #7C2D12  gradient end
const CREAM = [245, 238, 226]; //   #F5EEE2  warm background

// ---- geometry in a normalized 0..64 box ------------------------------------
// Sofa glyph: backrest, two arms, seat, two legs — drawn on a rounded tile.
const TILE_RADIUS = 14;
const SOFA = [
  ["rect", 16, 16, 48, 30, 4], // backrest
  ["rect", 10, 25, 19, 44, 3], // left arm
  ["rect", 45, 25, 54, 44, 3], // right arm
  ["rect", 14, 36, 50, 44, 3], // seat
  ["rect", 19, 44, 24, 50, 1.5], // left leg
  ["rect", 40, 44, 45, 50, 1.5], // right leg
];

function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  const qx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const qy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return qx * qx + qy * qy <= r * r;
}

// Render the brand tile (rounded square + sofa) into an RGBA buffer.
function renderTile(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      // 2x2 supersampling for antialiased edges
      for (const [sy, sx] of [
        [0.25, 0.25],
        [0.25, 0.75],
        [0.75, 0.25],
        [0.75, 0.75],
      ]) {
        const x = ((px + sx) / size) * 64;
        const y = ((py + sy) / size) * 64;
        let cr = null;
        if (insideRoundedRect(x, y, 0, 0, 64, 64, TILE_RADIUS)) {
          cr = TERRACOTTA;
          for (const [, x0, y0, x1, y1, rad] of SOFA) {
            if (insideRoundedRect(x, y, x0, y0, x1, y1, rad)) {
              cr = CREAM;
              break;
            }
          }
        }
        if (cr) {
          r += cr[0];
          g += cr[1];
          b += cr[2];
          a += 255;
        }
      }
      const i = (py * size + px) * 4;
      buf[i] = r / 4;
      buf[i + 1] = g / 4;
      buf[i + 2] = b / 4;
      buf[i + 3] = a / 4;
    }
  }
  return buf;
}

// ---- PNG encoding -----------------------------------------------------------
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
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- ICO wrapping (PNG-in-ICO, supported by Vista+ browsers) ----------------
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const entryBufs = [];
  let offset = 6 + entries.length * 16;
  for (const { width, height, png } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = width >= 256 ? 0 : width;
    entry[1] = height >= 256 ? 0 : height;
    entry[2] = 0; // color count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entryBufs.push(entry);
  }
  return Buffer.concat([header, ...entryBufs, ...entries.map((e) => e.png)]);
}

// ---- og-image: gradient banner + brand tile ----------------------------------
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function renderOgImage() {
  const W = 1200,
    H = 630;
  const TILE = 512,
    OX = (W - TILE) / 2,
    OY = (H - TILE) / 2;
  const tile = renderTile(TILE);
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const [r, g, b] = lerp(TERRACOTTA, RUST_DARK, t);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  // Composite tile (alpha blend)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const ti = (y * TILE + x) * 4;
      const a = tile[ti + 3] / 255;
      if (a === 0) continue;
      const di = ((OY + y) * W + (OX + x)) * 4;
      for (let c = 0; c < 3; c++) {
        out[di + c] = Math.round(tile[ti + c] * a + out[di + c] * (1 - a));
      }
      out[di + 3] = 255;
    }
  }
  return encodePng(W, H, out);
}

// ---- favicon.svg ------------------------------------------------------------
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="geometricPrecision">
  <rect width="64" height="64" rx="14" fill="#AC451B"/>
  <g fill="#F5EEE2">
    <rect x="16" y="16" width="32" height="14" rx="4"/>
    <rect x="10" y="25" width="9" height="19" rx="3"/>
    <rect x="45" y="25" width="9" height="19" rx="3"/>
    <rect x="14" y="36" width="36" height="8" rx="3"/>
    <rect x="19" y="44" width="5" height="6" rx="1.5"/>
    <rect x="40" y="44" width="5" height="6" rx="1.5"/>
  </g>
</svg>
`;

const ico = encodeIco([
  { width: 16, height: 16, png: encodePng(16, 16, renderTile(16)) },
  { width: 32, height: 32, png: encodePng(32, 32, renderTile(32)) },
]);
const appleTouch = encodePng(180, 180, renderTile(180));

writeFileSync(join(PUBLIC_DIR, "favicon.svg"), faviconSvg.trim() + "\n");
writeFileSync(join(PUBLIC_DIR, "favicon.ico"), ico);
writeFileSync(join(PUBLIC_DIR, "apple-touch-icon.png"), appleTouch);
writeFileSync(join(PUBLIC_DIR, "og-image.png"), renderOgImage());

console.log("Generated:");
console.log("  public/favicon.svg");
console.log("  public/favicon.ico  (" + ico.length + " bytes)");
console.log("  public/apple-touch-icon.png  (" + appleTouch.length + " bytes)");
console.log("  public/og-image.png");
