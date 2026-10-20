"""Generate the Trenchscope logo set as outlined SVGs (no font dependency).

Mark geometry comes from apps/web/src/components/layout/Logo.tsx (32-unit grid).
Wordmark: Inter SemiBold, shaped with HarfBuzz (kerning), tracking -0.025em,
"Trench" in fg and "scope" in accent, exactly like the in-app logo.
"""
import os
import sys

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

FONT = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
DARK = {"bg": "#0A0C10", "tile": "#0D1016", "fg": "#E6E9F0", "accent": "#FFB547"}
LIGHT = {"bg": "#F4F5F8", "tile": "#FFFFFF", "fg": "#14171F", "accent": "#D97D00"}


def mark_paths(c_ring, c_line, x=0.0, y=0.0, s=1.0):
    """The reticle mark on the 32-unit grid, translated/scaled."""
    return (
        f'<g transform="translate({x:.3f} {y:.3f}) scale({s:.5f})">'
        f'<circle cx="16" cy="16" r="9" fill="none" stroke="{c_ring}" stroke-width="2.4"/>'
        f'<path d="M16 3.5v4.5M16 24v4.5M3.5 16H8M24 16h4.5" stroke="{c_ring}" stroke-width="2.4" stroke-linecap="round" fill="none"/>'
        f'<path d="M10.6 18.6l3-3.1 2.6 2.4 5.2-5.3" fill="none" stroke="{c_line}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        "</g>"
    )


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{rect}{body}</svg>\n'


# ---- wordmark outlines ----
blob = hb.Blob.from_file_path(FONT)
face = hb.Face(blob)
font = hb.Font(face)
upem = face.upem
tt = TTFont(FONT)
glyphset = tt.getGlyphSet()
order = tt.getGlyphOrder()
TRACK = -0.025 * upem


def shape(text):
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    return buf.glyph_infos, buf.glyph_positions


def word_paths(parts, size, x0, baseline):
    """parts: [(text, color)]. Returns (svg, advance_px)."""
    scale = size / upem
    x = 0.0
    out = []
    for text, color in parts:
        infos, poss = shape(text)
        d_all = []
        for info, pos in zip(infos, poss):
            name = order[info.codepoint]
            pen = SVGPathPen(glyphset)
            tp = TransformPen(pen, (scale, 0, 0, -scale, x0 + (x + pos.x_offset) * scale, baseline - pos.y_offset * scale))
            glyphset[name].draw(tp)
            d_all.append(pen.getCommands())
            x += pos.x_advance + TRACK
        out.append(f'<path fill="{color}" d="{" ".join(d_all)}"/>')
    return "".join(out), (x - TRACK) * scale


# Cap height / metrics for vertical centring.
os2 = tt["OS/2"]
cap = os2.sCapHeight / upem
desc = 0.0  # no descenders in "Trenchscope" except none; "p" has one.
p_desc = abs(tt["hhea"].descent) / upem


def write(name, content):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)


for theme, C in (("dark", DARK), ("light", LIGHT)):
    # 1) App-icon mark (rounded tile) — the avatar / favicon form.
    write(f"mark-tile-{theme}.svg", svg(512, 512, f'<rect width="512" height="512" rx="128" fill="{C["tile"]}"/>' + mark_paths(C["accent"], C["fg"], 0, 0, 16)))
    # 2) Bare glyph mark (transparent background).
    write(f"mark-{theme}.svg", svg(512, 512, mark_paths(C["accent"], C["fg"], 0, 0, 16)))
    # 3) Horizontal lockup: mark + wordmark.
    size = 200
    mark_h = 260
    gap = 40
    base = mark_h / 2 + cap * size / 2
    wsvg, wadv = word_paths([("Trench", C["fg"]), ("scope", C["accent"])], size, mark_h + gap, base)
    W = int(mark_h + gap + wadv + 8)
    H = int(mark_h)
    body = mark_paths(C["accent"], C["fg"], 0, 0, mark_h / 32) + wsvg
    write(f"lockup-horizontal-{theme}.svg", svg(W, H, body))
    write(f"lockup-horizontal-{theme}-bg.svg", svg(W + 160, H + 160, f'<g transform="translate(80 80)">{body}</g>', C["bg"]))
    # 4) Wordmark only.
    wsvg2, wadv2 = word_paths([("Trench", C["fg"]), ("scope", C["accent"])], size, 0, cap * size)
    write(f"wordmark-{theme}.svg", svg(int(wadv2 + 4), int(cap * size + p_desc * size * 0.75 + 4), wsvg2))
    # 5) Stacked lockup.
    sw, sadv = word_paths([("Trench", C["fg"]), ("scope", C["accent"])], 160, 0, 0)
    SW = int(max(sadv, 360) + 120)
    mark_s = 360
    mx = (SW - mark_s) / 2
    sw_svg, _ = word_paths([("Trench", C["fg"]), ("scope", C["accent"])], 160, (SW - sadv) / 2, mark_s + 60 + cap * 160)
    SH = int(mark_s + 60 + cap * 160 + p_desc * 160 + 40)
    write(f"lockup-stacked-{theme}.svg", svg(SW, SH, mark_paths(C["accent"], C["fg"], mx, 0, mark_s / 32) + sw_svg))

# Mono versions for overlays/watermarks.
write("mark-mono-amber.svg", svg(512, 512, mark_paths("#FFB547", "#FFB547", 0, 0, 16)))
write("mark-mono-white.svg", svg(512, 512, mark_paths("#FFFFFF", "#FFFFFF", 0, 0, 16)))
write("mark-mono-black.svg", svg(512, 512, mark_paths("#0A0C10", "#0A0C10", 0, 0, 16)))
print("ok", sorted(os.listdir(OUT)))
