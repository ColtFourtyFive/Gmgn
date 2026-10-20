"""Build the trailer edit list (SCRIPT.md §4) for vedit.py.

Usage: python3 trailer_edit.py ROOT OUT.mp4 edit.json [rug_clip]
ROOT is the repo root (local checkout or the sandbox clone). AI clips are read
from ROOT/marketing/video/clips/cNN.mp4.
"""
import json
import sys

ROOT = sys.argv[1].rstrip("/")
M = f"{ROOT}/marketing/video"
OV = f"{M}/overlays/trailer"
APP = f"{M}/app-footage"
CL = f"{M}/clips"
rug_clip = sys.argv[4] if len(sys.argv) > 4 else "trailer-rug"

# Source windows (seconds) inside each 5 s AI clip.
AI = {1: (0.4, 2.4), 2: (0.8, 1.8), 4: (1.2, 1.8), 5: (0.3, 2.4), 6: (0.0, 1.8), 7: (2.0, 2.4), 11: (0.4, 1.8), 13: (0.5, 2.4)}


def ai(n):
    s, d = AI[n]
    return {"src": f"{CL}/c{n:02d}.mp4", "start": s, "end": s + d, "zoom": [1.0, 1.03]}


GATE = f"{APP}/trailer-gate.mp4"
gate_blur_dialog = [[1790, 286, 116, 48], [2040, 922, 220, 48]]
gate_blur_toast = [[3300, 128, 180, 44], [3200, 168, 700, 64], [3560, 600, 220, 90]]

segments = [
    ai(1),                                                                                     # 0.0  whale
    ai(2),                                                                                     # 2.4  periscope
    {"src": f"{APP}/trailer-habitat.mp4", "start": 5.0, "end": 8.0, "crop": [206, 232, 3428, 1928], "zoom": [1.0, 1.03]},  # 4.2 habitat
    ai(4),                                                                                     # 7.2  sniper
    ai(5),                                                                                     # 9.0  bundler
    ai(6),                                                                                     # 11.4 insider
    ai(7),                                                                                     # 13.2 dev
    {"src": GATE, "start": 0.05, "end": 2.25, "crop": [2700, 900, 1280, 720]},                 # 15.6 receipts: audit
    {"src": GATE, "start": 2.25, "end": 3.05, "crop": [2700, 1480, 1280, 720]},                # 17.8 receipts: holder chips
    {"src": f"{OV}/s9-card.png", "still": True, "dur": 1.2},                                   # 18.6 card
    {"src": GATE, "start": 1.1, "end": 1.6, "crop": [2600, 100, 1240, 698], "blur": [[3560, 548, 220, 80]]},                   # 19.8 quote preview
    {"src": GATE, "start": 3.75, "end": 6.05, "crop": [900, 200, 1600, 900], "blur": gate_blur_dialog},  # 20.3 dialog, tick, click
    {"src": GATE, "start": 6.35, "end": 7.75, "crop": [2600, 100, 1240, 698], "blur": gate_blur_toast},   # 22.6 fill toast
    ai(11),                                                                                    # 24.0 the rug
    {"src": f"{APP}/{rug_clip}.mp4", "start": 0.2, "end": 3.2, "crop": [0, 330, 2400, 1350], "zoom": [1.0, 1.05]},  # 25.8 rug in the sim
    ai(13),                                                                                    # 28.8 respawn
    {"src": f"{OV}/lock.png", "still": True, "dur": 1.8},                                      # 31.2 lock
    {"src": f"{OV}/end.png", "still": True, "dur": 3.6},                                       # 33.0 end card
]

t = 0.0
starts = []
for s in segments:
    starts.append(round(t, 3))
    t += s["dur"] if s.get("still") else s["end"] - s["start"]
total = round(t, 3)


def o(name, t0, t1, fade=0.12):
    return {"png": f"{OV}/{name}.png", "t0": round(t0, 3), "t1": round(t1, 3), "fade": fade}


AI_SPANS = [(0.0, 4.2), (7.2, 15.6), (24.0, 25.8), (28.8, 31.2)]
overlays = []
for a, b in AI_SPANS:
    overlays += [o("letterbox", a, b, 0.01), o("aitag", a, b, 0.01)]
overlays += [
    o("s1-hook", 0.0, 2.3, 0.01), o("s1-label", 0.8, 2.3), o("s1-reticle", 0.6, 2.3, 0.08), o("s1-chip", 0.7, 2.3, 0.08),
    o("s2-cap", 2.5, 4.1),
    o("simbug", 4.2, 7.2, 0.01), o("s3-a", 4.4, 5.35), o("s3-b", 5.4, 7.1),
    o("s4-card", 7.35, 8.9), o("s4-sub", 7.6, 8.9),
    o("s5-card", 9.15, 11.3), o("s5-sub", 9.4, 11.3),
    o("s6-card", 11.55, 13.1), o("s6-sub", 11.8, 13.1),
    o("s7-card", 13.35, 15.5), o("s7-sub", 13.6, 15.5),
    o("simbug", 15.6, 18.6, 0.01), o("s8-cap", 15.8, 18.5),
    o("simbug", 19.8, 24.0, 0.01), o("s10-card", 20.0, 23.9), o("s10-sub", 20.3, 23.9),
    o("s11-cap", 24.2, 25.7),
    o("simbug", 25.8, 28.8, 0.01), o("s12-red", 26.2, 27.0, 0.05), o("s12-cap", 27.1, 28.7),
    o("s13-a", 28.9, 31.1), o("s13-b", 30.0, 31.1), o("s13-note", 30.0, 31.1),
]
edit = {"out": sys.argv[2], "w": 1920, "h": 1080, "fps": 30, "segments": segments, "overlays": overlays,
        "audio": f"{M}/audio/trailer-mix.wav"}
json.dump(edit, open(sys.argv[3], "w"), indent=1)
print("total", total, "starts", starts)
