"""Trailer v4 (video/SCRIPT.md §4): edit list, audio mix, master, captions and poster.

Inputs: the AI clips (video/clips), the v4 overlays (ovl_v4.py -> video/overlays/trailer-v4), the two capture-mode app
takes and stills from capture_v4.mjs (beats in screens/live/trailer-v4.json), the v4 voice take and the vidIQ score.
Every app shot carries the DEMO corner label; every AI shot carries the letterbox and the AI-generated label.

Usage: python3 edit_v4.py scratch_dir
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
from trailer_ovl import page  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mix_v4  # noqa: E402

M = "/home/user/Gmgn/marketing"
V = f"{M}/video"
OV = f"{V}/overlays/trailer-v4"
CL = f"{V}/clips"
APP = f"{V}/app-footage"
LIVE = f"{M}/screens/live"
S = sys.argv[1]
os.makedirs(S, exist_ok=True)
OUT = f"{V}/trenchscope-trailer-16x9.mp4"
TOTAL = 36.6

meta = json.load(open(f"{LIVE}/trailer-v4.json"))
A = {k: meta[k]["t"] for k in ("autoForm", "buyClick", "dialog", "tick", "buyAnyway", "fillToast")}
B_DEV = meta["devSell"][0]["createdAt"] / 1000 - meta["takeB"]["start"]
TAKE_A, TAKE_B = f"{APP}/v4-token-a.mp4", f"{APP}/v4-token-b.mp4"

# Demo tickers left legible in the takes (1920x1080 source px): dialog title, "Migration snipe" copy, fill toast title
# and body, the inline fill notice, the Activity column header. The exit-toast still is 2x.
BLUR_DIALOG = [[897, 145, 57, 22]]
BLUR_FORM = [[1662, 654, 46, 18]]
BLUR_FILL = [[1646, 66, 52, 20], [1639, 87, 46, 18], [1677, 632, 46, 18]]
BLUR_DUMP = [[419, 950, 46, 20]]
BLUR_EXIT = [[3442, 134, 112, 34], [3332, 176, 100, 28]]

C_FORM = [600, 330, 1320, 742]  # the empty chart on the left, under the s10 card
C_DIALOG = [228, 62, 1152, 648]
C_FILL = [768, 0, 1152, 648]
C_DUMP = [0, 216, 1536, 864]
C_EXIT = [2560, 0, 1280, 720]


def render(pages, transparent=True):
    jobs = []
    for n, html in pages.items():
        hp = f"{S}/{n}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{S}/{n}.png", "width": 1920, "height": 1080, "transparent": transparent, "wait": 300})
    json.dump(jobs, open(f"{S}/jobs.json", "w"))
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True, stdout=subprocess.DEVNULL)


def plate(img, h, cx=960, top=None):
    # Shot 8: a sharp DPR-3 panel still on the brand background.
    return page(f'<img src="file://{img}" style="position:absolute;left:{cx}px;top:{top}px;height:{h}px;transform:translateX(-50%);'
                f'border-radius:16px;box-shadow:0 0 0 1px #222731,0 40px 90px rgba(0,0,0,.65)">', opaque=True)


def ring(crop, b, pad=10):
    s = 1920 / crop[2]
    x, y, w, h = (b[0] - crop[0]) * s - pad, (b[1] - crop[1]) * s - pad, b[2] * s + 2 * pad, b[3] * s + 2 * pad
    return page(f'<div style="position:absolute;left:{x:.0f}px;top:{y:.0f}px;width:{w:.0f}px;height:{h:.0f}px;border:5px solid #FFB547;'
                f'border-radius:12px;box-shadow:0 0 34px rgba(255,181,71,.45)"></div>')


render({"p-audit": plate(f"{LIVE}/v4-audit.png", 800, 960, 64), "p-holders": plate(f"{LIVE}/v4-holders.png", 740, 960, 90)}, False)
render({"r-exitrow": ring(C_DIALOG, meta["dialog"]["exitRow"], 8), "r-fill": ring(C_FILL, [1566, 58, 336, 72], 8)})


def ai(name, start, dur):
    return {"src": f"{CL}/{name}.mp4", "start": start, "end": start + dur, "zoom": [1.0, 1.03]}


def take(src, start, dur, crop, blur, zoom=None):
    seg = {"src": src, "start": round(start, 3), "end": round(start + dur, 3), "crop": crop, "blur": blur}
    if zoom:
        seg["zoom"] = zoom
    return seg


def still(src, dur, crop=None, zoom=None, blur=None):
    return {"src": src, "still": True, "dur": dur, "crop": crop, "zoom": zoom, "blur": blur or []}


segments = [
    ai("c01", 0.4, 2.4),                                                                       # 0.0  whale
    ai("c02", 0.8, 1.8),                                                                       # 2.4  periscope
    ai("n1-five-fronts", 2.0, 1.8),                                                            # 4.2  one habitat, five chains
    {"src": f"{APP}/live-board.mp4", "start": 2.0, "end": 3.2, "crop": [96, 54, 1728, 972]},   # 6.0  the board
    ai("c04", 1.2, 1.8),                                                                       # 7.2  sniper
    ai("c05", 0.3, 2.4),                                                                       # 9.0  bundler
    ai("c06", 0.0, 1.8),                                                                       # 11.4 insider
    ai("c07", 2.0, 2.4),                                                                       # 13.2 dev
    still(f"{S}/p-audit.png", 2.2, zoom=[1.0, 1.05]),                                          # 15.6 receipts: audit
    still(f"{S}/p-holders.png", 0.8, zoom=[1.02, 1.05]),                                       # 17.8 receipts: holders
    still(f"{OV}/s9-card.png", 1.2),                                                           # 18.6 so naturally, you…
    take(TAKE_A, A["buyClick"] - 0.4, 0.5, C_FORM, BLUR_FORM),                                 # 19.8 dev-sell exit armed, Buy
    take(TAKE_A, A["dialog"] + 0.25, 0.8, C_DIALOG, BLUR_DIALOG),                              # 20.3 the warning
    take(TAKE_A, A["buyAnyway"] - 1.28, 1.5, C_DIALOG, BLUR_DIALOG),                           # 21.1 tick, Buy anyway
    take(TAKE_A, A["fillToast"] + 0.1, 1.4, C_FILL, BLUR_FILL),                                # 22.6 filled, 1 exit order
    ai("c11", 0.4, 1.8),                                                                       # 24.0 late buyers
    take(TAKE_B, B_DEV - 0.4, 1.1, C_DUMP, BLUR_DUMP, [1.0, 1.04]),                            # 25.8 DEV SELL
    still(f"{LIVE}/v4-exit-toast.png", 1.0, C_EXIT, [1.0, 1.05], BLUR_EXIT),                   # 26.9 the exit fills
    ai("n2-the-exit", 0.0, 1.2),                                                               # 27.9 walking away
    ai("c13", 0.5, 2.1),                                                                       # 29.1 or. look before you ape.
    still(f"{M}/x/posts/trailer-endcard-16x9.png", 5.4),                                       # 31.2 end card
]
t, starts = 0.0, []
for s in segments:
    starts.append(round(t, 3))
    t += s["dur"] if s.get("still") else s["end"] - s["start"]
assert abs(t - TOTAL) < 0.01, t
T_BUY = starts[11] + 0.4                       # Buy click
T_TICK = starts[13] + (A["tick"] - (A["buyAnyway"] - 1.28))
T_ANYWAY = starts[13] + 1.28                    # Buy anyway click
T_DEV = starts[16] + 0.4                        # the dev's sell lands


def o(name, t0, t1, fade=0.12, d=OV):
    return {"png": f"{d}/{name}.png", "t0": round(t0, 3), "t1": round(t1, 3), "fade": fade}


overlays = []
for a, b in [(0.0, 6.0), (7.2, 15.6), (24.0, 25.8), (27.9, 31.2)]:
    overlays += [o("letterbox", a, b, 0), o("ailabel", a, b, 0)]
for name, a, b in [("demo", 6.0, 7.2), ("demo-l", 15.6, 18.6), ("demo", 19.8, 22.6), ("demo-l", 22.6, 24.0), ("demo", 25.8, 26.9),
                   ("demo-l", 26.9, 27.9)]:
    overlays.append(o(name, a, b, 0))
overlays += [
    o("s1-hook", 0.0, 2.4, 0), o("s1-label", 0.8, 2.35), o("s1-reticle", 0.6, 2.35, 0.08), o("s1-chip", 0.7, 2.35, 0.08),
    o("s2-cap", 2.55, 4.15),
    o("s3-a", 4.4, 5.35), o("s3-b", 5.4, 5.95, 0.06), o("s3-c", 6.1, 7.1),
    o("s4-card", 7.35, 8.9), o("s4-sub", 7.6, 8.9),
    o("s5-card", 9.15, 11.3), o("s5-sub", 9.4, 11.3),
    o("s6-card", 11.55, 13.1), o("s6-sub", 11.8, 13.1),
    o("s7-card", 13.35, 15.5), o("s7-sub", 13.6, 15.5),
    o("s8-cap", 15.8, 18.5),
    o("s10-card", 20.0, 22.55), o("s10-sub", 20.3, 22.55), o("r-exitrow", 20.45, 21.1, 0.1, S),
    o("r-fill", 22.8, 24.0, 0.1, S),
    o("s11-cap", 24.2, 25.7),
    o("s12-red", T_DEV, 26.9, 0.04),
    o("s12-cap", 27.0, 29.0), o("s12-note", 27.0, 29.0),
    o("s13-a", 29.2, 31.1), o("s13-b", 29.9, 31.1),
]

# ---- audio -----------------------------------------------------------------------------------------------------------
mix = f"{V}/audio/trailer-v4-mix.wav"
mix_v4.build(mix, S, [T_BUY, T_TICK, T_ANYWAY], T_ANYWAY)

edit = {"out": OUT, "w": 1920, "h": 1080, "fps": 30, "segments": segments, "overlays": overlays, "audio": mix}
json.dump(edit, open(f"{S}/trailer-v4-edit.json", "w"), indent=1)
subprocess.run(["python3", f"{M}/tools/vedit.py", f"{S}/trailer-v4-edit.json"], check=True)

# ---- captions and poster ---------------------------------------------------------------------------------------------
SRT = [(0.15, 2.85, "everything out here wants your bag."), (2.95, 4.00, "so we built a scope."), (4.50, 6.45, "one habitat, five chains."),
       (20.00, 22.15, "the most endangered species of all."), (24.05, 26.25, "nature is not kind to late buyers."),
       (29.20, 31.15, "or. look before you ape."), (32.00, 34.00, "trenchscope. see who's really buying.")]


def ts(x):
    return f"{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{int(x % 60):02d},{int(round(x % 1 * 1000)):03d}"


open(OUT.replace(".mp4", ".srt"), "w").write("\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{txt}\n" for i, (a, b, txt) in enumerate(SRT, 1)))
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "10.2", "-i", OUT, "-frames:v", "1", OUT.replace(".mp4", "-poster.jpg")], check=True)
print("starts", starts, "buy", round(T_BUY, 2), "tick", round(T_TICK, 2), "anyway", round(T_ANYWAY, 2), "dev", round(T_DEV, 2))
