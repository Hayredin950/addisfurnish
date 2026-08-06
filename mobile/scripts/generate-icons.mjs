// Generates the AddisFurnish app icon set into assets/images/:
//   icon.png                    1024px launcher icon (full-bleed brand tile)
//   splash-icon.png             1024px splash image
//   android-icon-foreground.png 1024px adaptive foreground (safe-zone inset)
//   android-icon-background.png 1024px adaptive background (solid cream)
//   android-icon-monochrome.png 1024px themed-icon sofa glyph (white)
//   logo-mark.png                512px tile for in-app branding (home, auth)
//
// Pure Node — no image libraries. Same sofa glyph + palette as the web app's
// generate-brand-assets.mjs, so both apps ship the identical mark.
// Run:  node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "assets", "images");
mkdirSync(OUT, { recursive: true });

// ---- palette (matches web/src/styles.css + mobile theme) -------------------
const TERRACOTTA = [172, 69, 27]; // #AC451B
const CREAM = [245, 238, 226]; //   #F5EEE2

// ---- geometry in a normalized 0..64 box ------------------------------------
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

/** Sample the glyph at normalized (x, y): "tile" | "sofa" | null. */
function sample(x, y) {
  if (insideRoundedRect(x, y, 0, 0, 64, 64, TILE_RADIUS)) {
    for (const [, x0, y0, x1, y1, rad] of SOFA) {
      if (insideRoundedRect(x, y, x0, y0, x1, y1, rad)) return "sofa";
    }
    return "tile";
  }
  return null;
}

/**
 * Render a canvas. `mode`:
 *   "full"   — terracotta tile + cream sofa on transparent (launcher/splash)
 *   "fore"   — same as full but scaled to `inset` for the adaptive safe zone
 *   "mono"   — white sofa on transparent (Android themed icon)
 *   "bg"     — solid cream fill
 */
function render(size, mode, inset = 1) {
  const buf = Buffer.alloc(size * size * 4);
  const o = (size * (1 - inset)) / 2; // inset origin
  const s = size * inset; // inset scale
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      if (mode === "bg") {
        buf[i] = CREAM[0];
        buf[i + 1] = CREAM[1];
        buf[i + 2] = CREAM[2];
        buf[i + 3] = 255;
        continue;
      }
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
        const x = ((o + (px + sx) * s) / size) * 64;
        const y = ((o + (py + sy) * s) / size) * 64;
        const hit = sample(x, y);
        let cr = null;
        if (hit === "tile") cr = TERRACOTTA;
        else if (hit === "sofa") cr = mode === "mono" ? [255, 255, 255] : CREAM;
        if (cr) {
          r += cr[0];
          g += cr[1];
          b += cr[2];
          a += 255;
        }
      }
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- write -------------------------------------------------------------------
writeFileSync(join(OUT, "icon.png"), encodePng(1024, 1024, render(1024, "full")));
writeFileSync(join(OUT, "splash-icon.png"), encodePng(1024, 1024, render(1024, "full")));
writeFileSync(
  join(OUT, "android-icon-foreground.png"),
  encodePng(1024, 1024, render(1024, "fore", 0.62)),
);
writeFileSync(join(OUT, "android-icon-background.png"), encodePng(1024, 1024, render(1024, "bg")));
writeFileSync(join(OUT, "android-icon-monochrome.png"), encodePng(1024, 1024, render(1024, "mono", 0.62)));
writeFileSync(join(OUT, "logo-mark.png"), encodePng(512, 512, render(512, "full")));

console.log("Generated icons into assets/images/");
