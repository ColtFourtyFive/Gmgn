"""teaser-soon (WARMUP_WEEK D7-P4, SCRIPT §13.2 as rebuilt): the larpers still, then the periscope, then the lockup.

Usage: python3 soon.py scratch_dir
Writes marketing/x/posts/teaser-soon.mp4 and teaser-soon-nosoon.mp4 (for when the launch gate passes first).
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
sys.path.insert(0, "/home/user/Gmgn/marketing/tools/teasers")
from fg import ai_label, caption, render  # noqa: E402
from trailer_ovl import page  # noqa: E402

M = "/home/user/Gmgn/marketing"
S = sys.argv[1]
os.makedirs(S, exist_ok=True)
import fg  # noqa: E402
fg.S = S
STACK = open(f"{M}/brand/logo/lockup-stacked-dark.svg").read().replace("<svg ", '<svg style="height:300px;width:auto" ')
TOTAL = 13.5


def slate(soon):
    soon_div = '<div style="margin-top:26px;font-weight:700;font-size:64px;letter-spacing:-.02em;color:#FFB547">soon.</div>' if soon else ""
    return page(f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">{STACK}'
                f'<div style="margin-top:34px;font-weight:600;font-size:58px;letter-spacing:-.02em;color:#E6E9F0">see who\'s <span style="color:#FFB547">really</span> buying.</div>'
                f'{soon_div}</div>', opaque=True)


def mix(out):
    score, vo = f"{M}/video/audio/score-vidiq-trailer.wav", f"{M}/video/audio/vo-take-v4.wav"
    fc = ("[0:a]atrim=2:12,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=out:st=9.7:d=0.3[a];"
          "[0:a]atrim=48:51.5,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=out:st=2.3:d=1.2[b];"
          "[a][b]concat=n=2:v=0:a=1[m];"
          "[1:a]atrim=28.55:30.75,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=2.1:d=0.1,adelay=500|500[v1];"
          "[1:a]atrim=31.20:32.30,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=1.0:d=0.1,adelay=5400|5400[v2];"
          f"[v1][v2]amix=inputs=2:normalize=0,aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=80,apad=whole_dur={TOTAL}[v];"
          "[v]asplit[vs][vm];[m][vs]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=250[d];"
          f"[d][vm]amix=inputs=2:normalize=0:weights=1 1.4,loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:{TOTAL}[o]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", score, "-i", vo, "-filter_complex", fc, "-map", "[o]", "-ar", "48000", out], check=True)


def build(soon):
    name = "teaser-soon" if soon else "teaser-soon-nosoon"
    render({"ai": ai_label(), "cap1": caption("everyone in the trenches is *larping.*"), "cap2": caption("the wallets *aren't.*"),
            f"slate-card-{int(soon)}": slate(soon)})
    o = lambda n, t0, t1, fade=0.12: {"png": n if "/" in n else f"{S}/{n}.png", "t0": t0, "t1": t1, "fade": fade}
    segs = [{"src": f"{M}/video/keyframes/n3-the-larpers.jpg", "still": True, "dur": 5.0, "crop": [11, 0, 2730, 1536], "zoom": [1.0, 1.08]},
            {"src": f"{M}/video/clips/c02.mp4", "start": 0.0, "end": 5.0, "zoom": [1.04, 1.1]},
            {"src": f"{S}/slate-card-{int(soon)}.png", "still": True, "dur": TOTAL - 10.0}]
    ovs = [o(f"{M}/video/overlays/trailer/letterbox.png", 0, 10.0, 0), o("ai", 0, 10.0, 0),
           o("cap1", 0, 4.95, 0), o("cap2", 5.1, 9.95, 0.1)]
    audio = f"{S}/soon-mix.wav"
    mix(audio)
    edit = {"out": f"{M}/x/posts/{name}.mp4", "w": 1920, "h": 1080, "fps": 30, "segments": segs, "overlays": ovs, "audio": audio}
    json.dump(edit, open(f"{S}/{name}-edit.json", "w"), indent=1)
    subprocess.run(["python3", f"{M}/tools/vedit.py", f"{S}/{name}-edit.json"], check=True)


if __name__ == "__main__":
    build(True)
    build(False)
