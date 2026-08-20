#!/usr/bin/env python3
"""Regenerates the HabeshaHome mobile brand assets into assets/images/.

The single source of truth is the web app's apple-touch-icon.png — the real
logo (cream tile #F5EEE2 with the terracotta #E14C25 "sofa under a roof"
glyph). Every mobile asset is derived from it so the app icon, splash, adaptive
icons and the in-app logo all show the identical mark.

Run from anywhere:  python3 mobile/scripts/generate-icons.py
Requires Pillow.  Output:
    icon.png                    1024px launcher icon (full tile)
    splash-icon.png             1024px splash image (full tile)
    logo-mark.png                512px in-app logo (full tile)
    android-icon-foreground.png 1024px adaptive foreground (safe-zone inset)
    android-icon-background.png 1024px adaptive background (solid cream)
    android-icon-monochrome.png 1024px themed-icon glyph (white on clear)
    favicon.png                   48px favicon (full tile)
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]  # repo root
SRC = ROOT / "web" / "public" / "apple-touch-icon.png"
OUT = ROOT / "mobile" / "assets" / "images"

CREAM = (245, 238, 226, 255)  # #F5EEE2 tile
GLYPH = (225, 76, 37, 255)  #    #E14C25 sofa under roof


def load_master() -> Image.Image:
    if not SRC.exists():
        sys.exit(f"master logo not found: {SRC}")
    im = Image.open(SRC).convert("RGBA")
    if im.size != (180, 180):
        # Upstream source changed shape — trust it anyway, but say so.
        print(f"note: master is {im.size}, expected 180x180")
    return im


def upscale(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.LANCZOS)


def solid(size: int, color) -> Image.Image:
    return Image.new("RGBA", (size, size), color)


def paste_centered(canvas: Image.Image, tile: Image.Image) -> Image.Image:
    """Paste `tile` centered onto `canvas`, keeping canvas size."""
    x = (canvas.width - tile.width) // 2
    y = (canvas.height - tile.height) // 2
    canvas.paste(tile, (x, y), tile)
    return canvas


def glyph_alpha(im: Image.Image) -> Image.Image:
    """Alpha mask of the glyph: cream -> transparent, terracotta -> opaque.

    Antialiased edge pixels between the two flat colors get a proportional
    alpha, which keeps the silhouette crisp when composited over any color.
    """
    px = im.load()
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # distance to cream vs distance to glyph, in 0..1
            d_cream = abs(r - 245) + abs(g - 238) + abs(b - 226)
            d_glyph = abs(r - 225) + abs(g - 76) + abs(b - 37)
            if d_glyph <= d_cream:
                # glyph or edge: alpha fades as it approaches the cream side
                t = max(0.0, 1.0 - d_glyph / 90.0)
                mp[x, y] = int(255 * t)
            else:
                # cream or edge from the cream side — drop it
                mp[x, y] = 0
    return mask


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    master = load_master()

    # Full tile renders (launcher, splash, in-app, favicon)
    icon = upscale(master, 1024)
    icon.save(OUT / "icon.png")
    icon.save(OUT / "splash-icon.png")
    upscale(master, 512).save(OUT / "logo-mark.png")
    upscale(master, 48).save(OUT / "favicon.png")

    # Adaptive background: solid cream
    solid(1024, CREAM).save(OUT / "android-icon-background.png")

    # Adaptive foreground: the tile scaled into the safe zone. The glyph
    # already sits at ~65%x54% of the tile; scaling the tile to 85% of the
    # canvas keeps the glyph comfortably inside the 66% adaptive safe zone.
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    tile85 = upscale(master, int(1024 * 0.85))
    paste_centered(fg, tile85)
    fg.save(OUT / "android-icon-foreground.png")

    # Monochrome (Android themed icon): white glyph on transparent, safe-zone
    mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    white = Image.new("RGBA", tile85.size, (255, 255, 255, 255))
    alpha = glyph_alpha(tile85)
    mono.paste(white, ((1024 - tile85.width) // 2, (1024 - tile85.height) // 2), alpha)
    mono.save(OUT / "android-icon-monochrome.png")

    print("Generated brand assets into", OUT)


if __name__ == "__main__":
    main()
