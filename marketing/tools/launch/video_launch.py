"""Launch-day videos (LAUNCH_DAY §10) from capture-mode recordings:
  launch-8  (T7)   keyboard only, from capture_launch2.mjs keys2: keycaps, frame-0 hook, end slate
  launch-10 (QT-1) a real dev dump at real speed, from capture_watch.mjs (the 40 s ring buffer)
  launch-13 (L1-A) rug autopsy, mint to floor, 4:5, sped up and labelled, timestamped from the token's trades
Same look as tools/stills/peek_videos.py (its helpers are reused). DEMO on every frame; tickers were blurred at capture.

Usage: python3 video_launch.py scratch_dir [launch-8 launch-10 launch-13]
"""
import importlib.util
import json
import os
import subprocess
import sys

M = "/home/user/Gmgn/marketing"
LIVE = f"{M}/screens/live"
APP = f"{M}/video/app-footage"
OUTD = f"{M}/x/posts/launch"
S = sys.argv[1]
refs = sys.argv[2:]
os.makedirs(S, exist_ok=True)
_spec = importlib.util.spec_from_file_location("peek_videos", f"{M}/tools/stills/peek_videos.py")
pv = importlib.util.module_from_spec(_spec)
sys.argv = [sys.argv[0], S]
_spec.loader.exec_module(pv)
page, rich, demo, cap, hook, slate, render, bed, keycap = pv.page, pv.rich, pv.demo, pv.cap, pv.hook, pv.slate, pv.render, pv.bed, pv.keycap


def vedit(name, segs, ovs, audio, w=1920, h=1080):
    o = [{"png": p if "/" in p else f"{S}/{p}.png", "t0": round(a, 3), "t1": round(b, 3), "fade": f} for p, a, b, f in ovs]
    edit = {"out": f"{OUTD}/{name}.mp4", "w": w, "h": h, "fps": 30, "segments": segs, "overlays": o, "audio": audio}
    json.dump(edit, open(f"{S}/{name}-edit.json", "w"), indent=1)
    subprocess.run(["python3", f"{M}/tools/vedit.py", f"{S}/{name}-edit.json"], check=True)


def launch8():
    b = json.load(open(f"{LIVE}/launch2.json"))["keys2"]["beats"]
    seq = [x["t"] for x in b]                      # / paste enter b s back 3 j j k
    end = seq[-1] + 1.0
    # The paste is a paste (no key drawn for it) and "back" is the browser's own Back, not a Trenchscope hotkey.
    caps = [("/", "search", seq[0], seq[1]), ("paste", "an address", seq[1], seq[2]), ("enter", "open it", seq[2], seq[3]),
            ("b", "buy panel", seq[3], seq[4]), ("s", "*sell* panel", seq[4], seq[5]), ("←", "browser back", seq[5], seq[6]),
            ("3", "migrated", seq[6], seq[7]), ("j / k", "pick a coin", seq[7], end)]
    pages = {"demo": demo(), "hook8": hook("hands off the *mouse.*", "KEYBOARD ONLY"),
             "slate8": slate("your mouse can finally *retire.*", "UI shown with demo data · high risk · nfa")}
    for i, (k, lab, _, _) in enumerate(caps):
        pages[f"k8-{i}"] = keycap(k, lab)
    render(pages)
    total = end + 2.2
    segs = [{"src": f"{APP}/live-keys2.mp4", "start": 0.0, "end": round(end, 3), "crop": [27, 0, 1866, 1050]},
            {"src": f"{S}/slate8.png", "still": True, "dur": 2.2}]
    ovs = [("hook8", 0, min(1.15, seq[0]), 0), ("demo", 0, end, 0)] + [(f"k8-{i}", a, bb, 0.06) for i, (_, _, a, bb) in enumerate(caps)]
    au = f"{S}/keys2.wav"
    bed(au, total, 14.0)
    vedit("launch-8", segs, ovs, au)


BUILD = {"launch-8": launch8}

if __name__ == "__main__":
    for r in (refs or list(BUILD)):
        BUILD[r]()
