"""Frame the second batch of demo-data captures (capture_peeks2.mjs -> screens/live/) into warm-up posts:
peek-funding (D4-P2), peek-exits (D5-P2) and peek-monitor (R6), WARMUP_WEEK §9.2. Same frame as frame_posts.py:
headline, panels, blurred demo tickers, amber callouts, the DEMO corner label and the wordmark.

The page captures are full 3840x2160 screenshots (2x); each panel is cut out here first, so boxes are CSS px relative to
that cut, as frame_posts.shot expects.

Usage: python3 frame_posts2.py scratch_dir [peek-funding peek-exits peek-monitor]
"""
import importlib.util
import json
import os
import subprocess
import sys

from PIL import Image

M = "/home/user/Gmgn/marketing"
LIVE = f"{M}/screens/live"
S = sys.argv[1]
refs = sys.argv[2:]
_spec = importlib.util.spec_from_file_location("frame_posts", f"{M}/tools/stills/frame_posts.py")
fp = importlib.util.module_from_spec(_spec)
sys.argv = [sys.argv[0], S]
_spec.loader.exec_module(fp)
cards, header, shot, demo_label, AMBER = fp.cards, fp.header, fp.shot, fp.demo_label, fp.AMBER
P = json.load(open(f"{LIVE}/peeks2.json"))


def cut(page, name, x, y, w, h):
    """Cut a CSS-px box out of a 2x page capture into the scratch dir."""
    out = f"{S}/{name}.png"
    Image.open(f"{LIVE}/{page}.png").crop((x * 2, y * 2, (x + w) * 2, (y + h) * 2)).save(out)
    return out


def foot(pad):
    return (f'<div class="mono" style="position:absolute;left:{pad}px;bottom:40px;color:#8C94A3;font-size:22px">high risk · nfa</div>'
            f'<div style="position:absolute;left:{pad}px;bottom:80px">{cards.wordmark(30)}</div>' + demo_label())


def note(text, x, y, px=26):
    return f'<div style="position:absolute;left:{x}px;top:{y}px;font-weight:600;font-size:{px}px;color:#C9CED8;line-height:1.3">{text}</div>'


def rings(x, y, s, boxes):
    """Amber outlines on CSS-px boxes of a cut placed by shot(x, y, s)."""
    k = 2 * s
    return "".join(f'<div style="position:absolute;left:{x + bx * k - 5:.0f}px;top:{y + by * k - 5:.0f}px;width:{bw * k + 10:.0f}px;'
                   f'height:{bh * k + 10:.0f}px;border:3px solid {AMBER};border-radius:8px"></div>' for bx, by, bw, bh in boxes)


def peek_funding():
    w, h = 1600, 900
    f = P["funding"]
    tx, ty = f["table"][0], f["table"][1] + 42           # from the filter row (Insider selected) down
    th = f["table"][1] + f["table"][3] - ty
    rx = f["fundedBy"][0] - 2
    # Two slices of the same rows: the holder column (with its insider tags) and the Funded by column.
    left = cut("peek-funding-page", "fund-left", tx, ty, 300, th)
    right = cut("peek-funding-page", "fund-right", rx, ty, 1556 - rx, th)
    strip = cut("peek-funding-page", "fund-strip", *f["strip"])
    s, y0 = 0.62, 300
    xl, xr = 80, 80 + 2 * 300 * 0.62 + 70
    same = [[1322 - rx, r - ty - 11, 78, 22] for r in (862, 901, 940, 1015)]   # rows funded by the shared wallet
    body = (header("who funded whom.", "follow the money one hop back.", 80, 72, "PRODUCT PEEK")
            + shot(left, xl, y0, s)
            + f'<div class="mono" style="position:absolute;left:{xr - 52:.0f}px;top:{y0 + th * s - 18:.0f}px;color:#5C6372;font-size:30px">···</div>'
            + shot(right, xr, y0, s) + rings(xr, y0, s, same)
            + f'<div style="position:absolute;left:{xr:.0f}px;top:{y0 - 50}px;background:{AMBER};color:#0A0C10;font-weight:700;font-size:24px;'
              f'padding:6px 14px;border-radius:8px">who funded whom</div>'
            + note("4 of these 5 insiders were first<br>funded by the same wallet.", 80, y0 + 2 * th * s + 30)
            + shot(strip, 1040, y0, 0.7) + rings(1040, y0, 0.7, [[4, 42, 332, 72]])
            + f'<div style="position:absolute;left:1040px;top:{y0 - 50}px;background:{AMBER};color:#0A0C10;font-weight:700;font-size:24px;'
              f'padding:6px 14px;border-radius:8px">supply by tag</div>'
            + note("insiders, snipers, bundlers, the dev:<br>what each tag still holds.", 1040, y0 + 2 * 236 * 0.7 + 30)
            + foot(80))
    return cards.stage(w, h, body), w, h


def peek_exits():
    w, h = 1200, 1200
    e = P["exits"]
    form = cut("peek-exits-form", "exits-form", 1566, 270, 336, 522)
    toast = cut("peek-exits-toast", "exits-toast", 1565, 56, 340, 74)
    d = e["dev"]
    fs, fx, fy = 0.7, 80, 290
    dev = [d[0] - 1566, d[1] - 270, d[2], d[3]]
    k = 2 * fs
    row_y = fy + (dev[1] + dev[3] / 2) * k
    rx = 600
    body = (header("the dev wrote an exit.", "now so can you.", 80, 72, "PRODUCT PEEK")
            + shot(form, fx, fy, fs) + rings(fx, fy, fs, [dev])
            + f'<div style="position:absolute;left:{rx}px;top:{row_y - 22:.0f}px;background:{AMBER};color:#0A0C10;font-weight:700;font-size:26px;'
              f'padding:6px 14px;border-radius:8px">dev-sell exit</div>'
            + note("take-profit ladder, stop-loss,<br>trailing stop and a dev-sell exit,<br>attached to the buy itself.", rx, 300)
            + shot(toast, rx, 470, 0.76, blurs=[(82, 4, 48, 26), (58, 26, 48, 22)])
            + note("one buy, five exit orders.", rx, 470 + 2 * 74 * 0.76 + 22, 24)
            + note('fires <span style="color:#FFB547">after</span> the dev sells 20%+ of<br>their bag in one trade. after, not before.',
                   rx, row_y + 40, 24)
            + foot(80))
    return cards.stage(w, h, body), w, h


def peek_monitor():
    w, h = 1600, 900
    table = cut("peek-monitor-page", "mon-table", 140, 205, 800, 380)
    hot = cut("peek-monitor-page", "mon-hot", 1505, 118, 338, 442)
    names = [[868 - 140, 0, 72, 380]]                          # the TOKEN column's names
    hot_names = [[1562 - 1505, y - 118 - 11, 76, 22] for y in (180, 247, 315, 381, 448, 514)]
    body = (header("the monitor.", "smart-money trades as they land. what's hot, and why.", 80, 72, "PRODUCT PEEK")
            + shot(table, 80, 290, 0.6, blurs=names)
            + shot(hot, 1100, 290, 0.56, blurs=hot_names) + rings(1100, 290, 0.56, [[8, 4, 322, 26]])
            + f'<div style="position:absolute;right:40px;top:236px;background:{AMBER};color:#0A0C10;font-weight:700;font-size:24px;'
              f'padding:6px 14px;border-radius:8px">hot = 2+ smart wallets in 30 minutes</div>'
            + foot(80))
    return cards.stage(w, h, body), w, h


BUILD = {"peek-funding": peek_funding, "peek-exits": peek_exits, "peek-monitor": peek_monitor}

if __name__ == "__main__":
    jobs = []
    for ref in (refs or list(BUILD)):
        html, w, h = BUILD[ref]()
        hp = f"{S}/{ref}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{M}/x/posts/{ref}.png", "width": w, "height": h, "wait": 500})
    json.dump(jobs, open(f"{S}/jobs.json", "w"), indent=1)
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True, stdout=subprocess.DEVNULL)
    print("built", [j["out"].split("/")[-1] for j in jobs])
