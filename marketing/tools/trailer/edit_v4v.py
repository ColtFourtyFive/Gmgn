"""Trailer v4, vertical 9:16 cut (1080x1920) on the 16:9 cut's timeline, voice and score (mix_v4.py).

Layout: captions in a top band; AI shots in a 4:5 window (cropped around each clip's subject); app shots are the native
phone-layout takes from capture_v4m.mjs in a rounded screen; the disclosure label (AI-generated / UI shown with demo data)
sits in a bottom band on every shot. Taps get an amber ring. Demo tickers are blurred.

Usage: python3 edit_v4v.py scratch_dir
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mix_v4  # noqa: E402
from chips import chip_html  # noqa: E402
from trailer_ovl import RETICLE, rich  # noqa: E402

M = "/home/user/Gmgn/marketing"
V = f"{M}/video"
CL = f"{V}/clips"
APP = f"{V}/app-footage"
S = sys.argv[1]
os.makedirs(S, exist_ok=True)
OUT = f"{V}/trenchscope-trailer-9x16.mp4"
W, H = 1080, 1920
AIW = [0, 420, 1080, 1350]            # 4:5
APPW = [160, 420, 760, 1351]          # the 1080x1920 phone take at 0.7037
K = APPW[2] / 432                      # CSS px -> output px
LABEL_Y = 1820

meta = json.load(open(f"{M}/screens/live/trailer-v4m.json"))
A = {k: v["t"] for k, v in meta["v4m-token-a"].items()}
TB = meta["takeB"]["start"]
B_DEV = meta["devSell"][0]["createdAt"] / 1000 - TB
B_TOAST = meta["exitToast"]["at"] - TB
TAKE_A, TAKE_B = f"{APP}/v4m-token-a.mp4", f"{APP}/v4m-token-b.mp4"

# Demo tickers in the phone takes (1080x1920 device px).
SNIPE = [282, 1590, 70, 34]          # "Buy the moment XXX graduates" before the fill
SNIPE_AFTER = [282, 1730, 70, 34]    # the same line after the inline fill notice pushes it down
TITLE = [384, 196, 78, 40]           # "High-risk token: XXX"
FILL = [[240, 170, 66, 38], [221, 220, 60, 34], [316, 1532, 62, 36], SNIPE_AFTER]
EXIT = [[420, 172, 86, 36], [270, 212, 76, 34]]

# 4:5 crops (573x716 of the 1284x716 clips) centred on each clip's subject.
X0 = {"c01": 355, "c02": 356, "n1-five-fronts": 356, "c04": 510, "c05": 356, "c06": 709, "c07": 574, "c11": 292,
      "n2-the-exit": 651, "c13": 356}


def page(body, opaque=False):
    bg = "#0A0C10" if opaque else "transparent"
    grain = ('<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.022) 0 1px,transparent 1px 3px)"></div>'
             if opaque else "")
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box}}'
            f'html,body{{width:{W}px;height:{H}px;overflow:hidden;background:{bg}}}body{{font-family:Inter,sans-serif;color:#E6E9F0;-webkit-font-smoothing:antialiased}}'
            f'.mono{{font-family:"JetBrains Mono",monospace}}</style></head><body>{grain}{body}</body></html>')


def band(html, top=0, height=420):
    return page(f'<div style="position:absolute;left:60px;right:60px;top:{top}px;height:{height}px;display:flex;flex-direction:column;'
                f'align-items:center;justify-content:center;text-align:center">{html}</div>')


def big(text, size=84):
    return f'<div style="font-weight:900;font-size:{size}px;letter-spacing:-.035em;line-height:1.04">{rich(text)}</div>'


def label(text):
    return page(f'<div class="mono" style="position:absolute;left:0;right:0;top:{LABEL_Y - 22}px;text-align:center;font-weight:500;font-size:28px;'
                f'color:rgba(230,233,240,.78)">{text}</div>')


def species(name, latin, tag):
    return band(f'<div class="mono" style="font-style:italic;font-weight:500;font-size:28px;color:#8C94A3;margin-bottom:14px">{latin}</div>'
                f'<div style="display:flex;align-items:center;gap:22px"><div style="font-weight:900;font-size:96px;letter-spacing:-.03em;line-height:1">{name}</div>'
                f'{chip_html(tag, 40)}</div>', 30, 260)


def sub(text):
    return band(f'<div style="font-weight:700;font-size:52px;letter-spacing:-.025em;line-height:1.1">{rich(text)}</div>', 280, 120)


def appframe():
    x, y, w, h = APPW
    return page(f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;border-radius:34px;'
                f'box-shadow:0 0 0 2px #222731,0 0 0 3000px #0A0C10"></div>')


def ring_css(b, pad=8):
    x, y = APPW[0] + b[0] * K - pad, APPW[1] + b[1] * K - pad
    return page(f'<div style="position:absolute;left:{x:.0f}px;top:{y:.0f}px;width:{b[2] * K + 2 * pad:.0f}px;height:{b[3] * K + 2 * pad:.0f}px;'
                f'border:5px solid #FFB547;border-radius:14px;box-shadow:0 0 30px rgba(255,181,71,.45)"></div>')


def tap(pt, r=46):
    x, y = APPW[0] + pt[0] * K, APPW[1] + pt[1] * K
    return page(f'<div style="position:absolute;left:{x - r:.0f}px;top:{y - r:.0f}px;width:{2 * r}px;height:{2 * r}px;border-radius:50%;'
                f'border:5px solid #FFB547;background:rgba(255,181,71,.18);box-shadow:0 0 26px rgba(255,181,71,.5)"></div>')


# The whale in c01: the 16:9 reticle point (source px 592,175) mapped into the 4:5 window.
s_ai = AIW[2] / 573
WX, WY = (592 - X0["c01"]) * s_ai, AIW[1] + 175 * s_ai
OVL = {
    "appframe": appframe(),
    "lab-ai": label("AI-generated"),
    "lab-demo": label("UI shown with demo data"),
    "s1-label": page('<div class="mono" style="position:absolute;left:0;right:0;top:56px;text-align:center;color:#8C94A3;font-weight:500;'
                     'font-size:24px;letter-spacing:.16em">FIELD GUIDE TO THE TRENCHES · EP.01</div>'),
    "s1-hook": band(big("everything out here\nwants your *bag.*", 86), 70, 350),
    "s1-reticle": page(f'<div style="position:absolute;left:{WX - 110:.0f}px;top:{WY - 110:.0f}px;width:220px;height:220px;'
                       f'filter:drop-shadow(0 0 14px rgba(255,181,71,.6))">{RETICLE}</div>'),
    "s1-chip": page(f'<div style="position:absolute;left:{WX + 120:.0f}px;top:{WY - 26:.0f}px">{chip_html("whale", 34)}</div>'),
    "s2-cap": band(big("so we built\na *scope.*", 96)),
    "s3-a": band(big("one habitat.", 92)),
    "s3-b": band(big("one habitat.\n*five chains.*", 92)),
    "s3-c": band(big("one *terminal.*", 92)),
    "s4-card": species("THE SNIPER", "emptor primus", "sniper"), "s4-sub": sub("in before you blinked."),
    "s5-card": species("THE BUNDLER", "fasciculus unanimus", "bundler"), "s5-sub": sub("six wallets. one trench coat."),
    "s6-card": species("THE INSIDER", "amicus devi", "insider"), "s6-sub": sub('already inside. "just a believer."'),
    "s7-card": species("THE DEV", "creator fugiens", "dev"), "s7-sub": sub("holding the rug."),
    "s8-cap": band(big("receipts.\n*on every token.*", 88)),
    "s9-card": page(f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center">'
                    f'{big("so naturally,\nyou…", 124)}</div>', opaque=True),
    "s10-card": band('<div class="mono" style="font-style:italic;font-weight:500;font-size:26px;color:#8C94A3;margin-bottom:12px">homo fomo</div>'
                     '<div style="font-weight:900;font-size:72px;letter-spacing:-.03em;line-height:1">THE MOST ENDANGERED</div>'
                     f'<div style="display:flex;align-items:center;gap:20px;margin-top:6px"><div style="font-weight:900;font-size:72px;letter-spacing:-.03em;'
                     f'line-height:1">SPECIES</div>{chip_html("you", 36)}</div>', 20, 250),
    "s10-sub": sub("reads the warning. *buys anyway.*"),
    "s11-cap": band(big("nature is not kind\nto *late buyers.*", 80)),
    "s12-red": band('<div style="font-weight:900;font-size:150px;letter-spacing:-.03em;color:#FF5468">DEV SELL.</div>'),
    "s12-cap": band(big("your exit fired\n*right after.*", 84) + '<div class="mono" style="margin-top:22px;font-weight:500;font-size:26px;color:#AEB4C0">'
                    'dev-sell exit · reacts after the dev sells</div>'),
    "s13-a": band(big("or.", 96), 30, 160),
    "s13-b": band(big("look before\nyou *ape.*", 96), 170, 250),
    "r-exitrow": ring_css([40, 333, 350, 24]),
    "r-fill": ring_css([12, 58, 408, 62]),
}
for k in ("buy", "tick", "anyway"):
    OVL[f"tap-{k}"] = tap(meta["v4m-token-a"][k]["tap"])

jobs = []
for k, html in OVL.items():
    hp = f"{S}/{k}.html"
    open(hp, "w").write(html)
    jobs.append({"src": hp, "out": f"{S}/{k}.png", "width": W, "height": H, "transparent": k != "s9-card", "wait": 250})
json.dump(jobs, open(f"{S}/jobs.json", "w"))
subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True, stdout=subprocess.DEVNULL)


def ai(name, start, dur):
    return {"src": f"{CL}/{name}.mp4", "start": start, "end": start + dur, "crop": [X0[name], 0, 573, 716], "zoom": [1.0, 1.03], "window": AIW}


def app(src, start, dur, blur=None, zoom=None):
    seg = {"src": src, "start": round(start, 3), "end": round(start + dur, 3), "window": APPW, "blur": blur or []}
    if zoom:
        seg["zoom"] = zoom
    return seg


segments = [
    ai("c01", 0.4, 2.4), ai("c02", 0.8, 1.8), ai("n1-five-fronts", 2.0, 1.8),
    app(f"{APP}/v4m-board.mp4", 1.4, 1.2),
    ai("c04", 1.2, 1.8), ai("c05", 0.3, 2.4), ai("c06", 0.0, 1.8), ai("c07", 2.0, 2.4),
    app(f"{APP}/v4m-info.mp4", 0.5, 3.0),
    {"src": f"{S}/s9-card.png", "still": True, "dur": 1.2},
    app(TAKE_A, A["buy"] - 0.4, 0.5, [SNIPE]),
    app(TAKE_A, A["dialog"] + 0.2, 0.8, [TITLE, SNIPE]),
    app(TAKE_A, A["anyway"] - 1.28, 1.5, [TITLE, SNIPE]),
    app(TAKE_A, A["fill"] - 0.1, 1.4, FILL),
    ai("c11", 0.4, 1.8),
    app(TAKE_B, B_DEV - 0.4, 1.1, zoom=[1.0, 1.04]),
    app(TAKE_B, B_TOAST + 0.05, 1.0, EXIT, [1.0, 1.04]),
    ai("n2-the-exit", 0.0, 1.2), ai("c13", 0.5, 2.1),
    {"src": f"{M}/x/posts/trailer-endcard-9x16.png", "still": True, "dur": 5.4},
]
t, starts = 0.0, []
for sg in segments:
    starts.append(round(t, 3))
    t += sg["dur"] if sg.get("still") else sg["end"] - sg["start"]
assert abs(t - mix_v4.TOTAL) < 0.01, t
T_BUY = starts[10] + 0.4
T_ANYWAY = starts[12] + 1.28
T_TICK = T_ANYWAY - (A["anyway"] - A["tick"])
T_DEV = starts[15] + 0.4


def o(name, t0, t1, fade=0.12):
    return {"png": f"{S}/{name}.png", "t0": round(t0, 3), "t1": round(t1, 3), "fade": fade}


APP_SPANS = [(6.0, 7.2), (15.6, 18.6), (19.8, 24.0), (25.8, 27.9)]
overlays = []
for a, b in [(0.0, 6.0), (7.2, 15.6), (24.0, 25.8), (27.9, 31.2)]:
    overlays.append(o("lab-ai", a, b, 0))
for a, b in APP_SPANS:
    overlays += [o("appframe", a, b, 0), o("lab-demo", a, b, 0)]
overlays += [
    o("s1-label", 0.0, 2.35, 0), o("s1-hook", 0.0, 2.4, 0), o("s1-reticle", 0.6, 2.35, 0.08), o("s1-chip", 0.7, 2.35, 0.08),
    o("s2-cap", 2.55, 4.15),
    o("s3-a", 4.4, 5.35), o("s3-b", 5.4, 5.95, 0.06), o("s3-c", 6.1, 7.1),
    o("s4-card", 7.35, 8.9), o("s4-sub", 7.6, 8.9),
    o("s5-card", 9.15, 11.3), o("s5-sub", 9.4, 11.3),
    o("s6-card", 11.55, 13.1), o("s6-sub", 11.8, 13.1),
    o("s7-card", 13.35, 15.5), o("s7-sub", 13.6, 15.5),
    o("s8-cap", 15.8, 18.5),
    o("s10-card", 20.0, 22.55), o("s10-sub", 21.0, 22.55),
    o("tap-buy", T_BUY - 0.05, 20.3, 0.05), o("r-exitrow", 20.45, 21.1, 0.1),
    o("tap-tick", T_TICK - 0.05, T_TICK + 0.3, 0.05), o("tap-anyway", T_ANYWAY - 0.05, 22.6, 0.05),
    o("r-fill", 22.8, 24.0, 0.1),
    o("s11-cap", 24.2, 25.7),
    o("s12-red", T_DEV, 26.9, 0.04),
    o("s12-cap", 27.0, 29.0),
    o("s13-a", 29.2, 31.1), o("s13-b", 29.9, 31.1),
]

mix = f"{V}/audio/trailer-v4v-mix.wav"
mix_v4.build(mix, S, [T_BUY, T_TICK, T_ANYWAY], T_ANYWAY)
edit = {"out": OUT, "w": W, "h": H, "fps": 30, "segments": segments, "overlays": overlays, "audio": mix}
json.dump(edit, open(f"{S}/trailer-v4v-edit.json", "w"), indent=1)
subprocess.run(["python3", f"{M}/tools/vedit.py", f"{S}/trailer-v4v-edit.json"], check=True)
subprocess.run(["cp", f"{V}/trenchscope-trailer-16x9.srt", OUT.replace(".mp4", ".srt")], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "10.2", "-i", OUT, "-frames:v", "1", OUT.replace(".mp4", "-poster.jpg")], check=True)
print("starts", starts, "buy", round(T_BUY, 2), "tick", round(T_TICK, 2), "anyway", round(T_ANYWAY, 2), "dev", round(T_DEV, 2))
