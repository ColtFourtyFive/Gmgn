"""Frame demo-data captures (screens/live/) into warm-up post images: headline, panels, masks, blur, callouts,
the DEMO corner label and the mark (WARMUP_WEEK §9.2 rows, BRAND_GUIDE §10 corner label).

Usage: python3 frame_posts.py scratch_dir [ref ...]   refs: sr1-a sr1-b peek-audit peek-risk peek-funding peek-monitor
Boxes are CSS px of the captured element; captures are 2x, so images are placed at 1 image px per output px
(scale s multiplies both).
"""
import json
import os
import subprocess
import sys
import importlib.util

M = "/home/user/Gmgn/marketing"
LIVE = f"{M}/screens/live"
S = sys.argv[1]
os.makedirs(S, exist_ok=True)
_spec = importlib.util.spec_from_file_location("cards2", f"{M}/tools/cards2/build.py")
cards = importlib.util.module_from_spec(_spec)
sys.argv = [sys.argv[0], S] + sys.argv[2:]
_spec.loader.exec_module(cards)
BOX = json.load(open(f"{LIVE}/boxes.json"))
AMBER = "#FFB547"


def demo_label(px=22):
    return (f'<div class="mono" style="position:absolute;right:40px;bottom:34px;font-weight:500;font-size:{px}px;color:rgba(230,233,240,.85);'
            f'background:rgba(10,12,16,.85);border:1px solid #222731;border-radius:6px;padding:.5em .9em">UI shown with demo data</div>')


def header(title, sub, pad, tpx, kick=None):
    k = f'<div style="margin-bottom:16px">{cards.kicker(kick, 22)}</div>' if kick else ""
    return (f'<div style="position:absolute;left:{pad}px;right:{pad}px;top:{pad * 0.7:.0f}px">{k}'
            f'<div style="font-weight:800;font-size:{tpx}px;letter-spacing:-.035em;line-height:1">{title}</div>'
            f'<div style="margin-top:12px;font-weight:500;font-size:{tpx * 0.42:.0f}px;color:#C9CED8">{sub}</div></div>')


def shot(src, x, y, s=1.0, masks=(), blurs=(), outline=None, callouts=()):
    """A capture placed at (x, y), scaled by s. Boxes in CSS px of the capture (x2 = image px)."""
    from PIL import Image
    w, h = Image.open(src).size
    k = 2 * s
    el = (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w * s:.0f}px;height:{h * s:.0f}px;border-radius:10px;overflow:visible;'
          f'box-shadow:0 20px 60px rgba(0,0,0,.55)"><img src="file://{src}" style="width:100%;height:100%;border-radius:10px;display:block">')
    for bx, by, bw, bh in blurs:
        el += (f'<div style="position:absolute;left:{bx * k}px;top:{by * k}px;width:{bw * k}px;height:{bh * k}px;backdrop-filter:blur({6 * s:.0f}px);'
               f'-webkit-backdrop-filter:blur({6 * s:.0f}px);background:rgba(17,20,26,.35);border-radius:4px"></div>')
    for bx, by, bw, bh in masks:
        el += (f'<div class="mono" style="position:absolute;left:{bx * k - 2}px;top:{by * k - 2}px;width:{bw * k + 4}px;height:{bh * k + 4}px;background:{AMBER};'
               f'color:#0A0C10;font-weight:800;font-size:{min(bh * k * 0.7, 30):.0f}px;display:flex;align-items:center;justify-content:center;border-radius:5px">??</div>')
    if outline:
        el += f'<div style="position:absolute;inset:-10px;border:4px solid {AMBER};border-radius:16px;box-shadow:0 0 30px rgba(255,181,71,.35)"></div>'
    for (bx, by, bw, bh), label, side in callouts:
        el += f'<div style="position:absolute;left:{bx * k - 6}px;top:{by * k - 6}px;width:{bw * k + 12}px;height:{bh * k + 12}px;border:3px solid {AMBER};border-radius:8px"></div>'
        pos = {"above": f"left:{bx * k - 6}px;top:{by * k - 58}px", "below": f"left:{bx * k - 6}px;top:{(by + bh) * k + 14}px",
               "left": f"right:{w * s - bx * k + 18}px;top:{by * k}px", "right": f"left:{(bx + bw) * k + 18}px;top:{by * k}px"}[side]
        el += (f'<div style="position:absolute;{pos};white-space:nowrap;background:{AMBER};color:#0A0C10;font-weight:700;font-size:{24 * max(s, 1):.0f}px;'
               f'padding:6px 14px;border-radius:8px">{label}</div>')
    return el + "</div>"


def tag(text, x, y, px=64, color=AMBER):
    return f'<div style="position:absolute;left:{x}px;top:{y}px;font-weight:900;font-size:{px}px;color:{color};line-height:1">{text}</div>'


# Insider / bundler / sniper rows in the holder strip's tag grid (CSS px of the 340x236 panel).
ROWS = [(172, 146, 164, 25), (172, 172, 164, 25), (4, 172, 164, 25)]


def sr1(reveal):
    w, h = 1600, 900
    A, B = BOX["holders-A"], BOX["holders-B"]
    ma = [] if reveal else list(A["masks"][k] for k in ("Insiders", "Bundlers", "Snipers")) + ROWS
    mb = [] if reveal else list(B["masks"][k] for k in ("Insiders", "Bundlers", "Snipers")) + ROWS
    title, sub = (("it's B.", "the chips said it first.") if reveal else ("spot the rug #1", "one was bundled at launch. A or B?"))
    body = (header(title, sub, 100, 76, "SPOT THE RUG")
            + tag("A", 70, 318) + shot(f"{LIVE}/holders-A.png", 140, 300, 0.95, masks=ma)
            + tag("B", 820, 318) + shot(f"{LIVE}/holders-B.png", 890, 300, 0.95, masks=mb, outline=reveal)
            + (f'<div style="position:absolute;left:890px;top:236px;background:{AMBER};color:#0A0C10;font-weight:800;font-size:28px;padding:8px 18px;border-radius:8px">'
               f'bundled at launch</div>' if reveal else "")
            + f'<div style="position:absolute;left:100px;bottom:34px">{cards.wordmark(30)}</div>' + demo_label())
    return cards.stage(w, h, body), w, h


def peek_audit():
    w, h = 1080, 1350
    a = BOX["audit"]
    body = (header("the audit, row by row", "every flag explained. reference, not a guarantee.", 80, 64, "PRODUCT PEEK")
            + shot(f"{LIVE}/audit-audit.png", 234, 280, 0.9, callouts=[((236, 4, 100, 26), "reference, not a guarantee", "above")])
            + f'<div class="mono" style="position:absolute;left:80px;bottom:40px;color:#8C94A3;font-size:22px">high risk · nfa</div>'
            + f'<div style="position:absolute;left:80px;bottom:80px">{cards.wordmark(30)}</div>' + demo_label())
    return cards.stage(w, h, body), w, h


def peek_risk():
    w, h = 1200, 1200
    r = BOX["risk"]
    bx, by, bw, bh = r["buyAnyway"]
    body = (header("it asks first", 'reasons first. "buy anyway" second.', 90, 76, "PRODUCT PEEK")
            + shot(f"{LIVE}/risk-dialog.png", 216, 290, 1.0, blurs=[(124, 12, 160, 26), (236, 190, 126, 24)],
                   callouts=[((bx, by, bw, bh), "it asks first", "below")])
            + f'<div class="mono" style="position:absolute;left:90px;bottom:40px;color:#8C94A3;font-size:22px">high risk · nfa</div>'
            + f'<div style="position:absolute;left:90px;bottom:80px">{cards.wordmark(30)}</div>' + demo_label())
    return cards.stage(w, h, body), w, h


BUILD = {"sr1-a": lambda: sr1(False), "sr1-b": lambda: sr1(True), "peek-audit": peek_audit, "peek-risk": peek_risk}

if __name__ == "__main__":
    jobs = []
    for ref in (sys.argv[2:] or list(BUILD)):
        html, w, h = BUILD[ref]()
        hp = f"{S}/{ref}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{M}/x/posts/{ref}.png", "width": w, "height": h, "wait": 500})
    json.dump(jobs, open(f"{S}/jobs.json", "w"), indent=1)
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True)
