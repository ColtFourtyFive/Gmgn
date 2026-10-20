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
VO = f"{V}/audio/vo-take-v4.wav"
SCORE = f"{V}/audio/score-vidiq-trailer.wav"
# (source window in the voice take, cue on the timeline); windows from the faster-whisper pass in vo-take-v4.words.txt.
LINES = [((0.00, 2.75), 0.15), ((3.50, 4.60), 2.95), ((5.58, 6.20), 4.50), ((6.66, 7.65), 5.45), ((8.36, 10.50), 20.00),
         ((11.24, 13.45), 24.05), ((14.10, 14.46), 29.20), ((14.46, 16.30), 29.90), ((17.12, 17.68), 32.00), ((18.40, 19.70), 32.70)]
# (score window start, timeline start, duration): build to the receipts, cut to silence for "so naturally, you…",
# drop back in on the late-buyer shot, cut out for the empty desk, last hit and ring-out under the end card.
MUSIC = [(0.5, 0.0, 18.6), (48.0, 24.0, 5.1), (55.0, 31.2, 5.4)]
CLICKS = [T_BUY, T_TICK, T_ANYWAY]


def ms(x):
    return int(round(x * 1000))


fc = [f"[0:a]aformat=sample_rates=48000:channel_layouts=mono,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,"
      f"loudnorm=I=-16:TP=-2,asplit={len(LINES)}" + "".join(f"[v{i}]" for i in range(len(LINES)))]
for i, ((a, b), at) in enumerate(LINES):
    d = b - a
    fc.append(f"[v{i}]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={d - 0.08:.3f}:d=0.08,adelay={ms(at)}|{ms(at)}[l{i}]")
fc.append("".join(f"[l{i}]" for i in range(len(LINES))) + f"amix=inputs={len(LINES)}:normalize=0,apad=whole_dur={TOTAL},atrim=0:{TOTAL},"
          "aformat=channel_layouts=stereo,asplit=2[vside][vmix]")
fc.append(f"[1:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit={len(MUSIC)}" + "".join(f"[s{i}]" for i in range(len(MUSIC))))
for i, (src, at, d) in enumerate(MUSIC):
    fade_in = "afade=t=in:d=0.02," if i else ""
    fc.append(f"[s{i}]atrim={src}:{src + d},asetpts=PTS-STARTPTS,{fade_in}afade=t=out:st={d - (0.6 if i == 2 else 0.12):.3f}:d={0.6 if i == 2 else 0.12},"
              f"adelay={ms(at)}|{ms(at)}[m{i}]")
# Room tone under the silent stretch, a riser into the drop, a sub boom on "Buy anyway", UI clicks.
fc.append(f"anoisesrc=d=5.4:c=brown:a=0.02:r=48000,lowpass=f=300,afade=t=in:d=0.2,afade=t=out:st=5.2:d=0.2,aformat=channel_layouts=stereo,"
          f"adelay=18600|18600[room]")
fc.append(f"anoisesrc=d=1.5:c=pink:a=0.25:r=48000,highpass=f=1200,afade=t=in:d=1.5:curve=exp,aformat=channel_layouts=stereo,"
          f"adelay={ms(24.0 - 1.5)}|{ms(24.0 - 1.5)}[riser]")
fc.append(f"aevalsrc='0.9*sin(2*PI*(62*t-9*t*t))*exp(-2.6*t)':d=1.6:s=48000,aformat=channel_layouts=stereo,"
          f"adelay={ms(T_ANYWAY)}|{ms(T_ANYWAY)}[boom]")
for i, c in enumerate(CLICKS):
    fc.append(f"aevalsrc='0.5*sin(2*PI*2400*t)*exp(-180*t)':d=0.05:s=48000,aformat=channel_layouts=stereo,adelay={ms(c)}|{ms(c)}[k{i}]")
beds = "".join(f"[m{i}]" for i in range(len(MUSIC))) + "[room][riser]"
fc.append(f"{beds}amix=inputs={len(MUSIC) + 2}:normalize=0,apad=whole_dur={TOTAL},atrim=0:{TOTAL}[bed]")
fc.append("[bed][vside]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300[ducked]")
fx = "[boom]" + "".join(f"[k{i}]" for i in range(len(CLICKS)))
fc.append(f"[ducked][vmix]{fx}amix=inputs={3 + len(CLICKS)}:normalize=0:weights=1 1.15 1 {' '.join(['1'] * len(CLICKS))},"
          f"apad=whole_dur={TOTAL},atrim=0:{TOTAL},loudnorm=I=-14:TP=-1:LRA=11,aresample=48000,apad=whole_dur={TOTAL},atrim=0:{TOTAL}[out]")
mix = f"{V}/audio/trailer-v4-mix.wav"
raw = f"{S}/mix-raw.wav"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", VO, "-i", SCORE, "-filter_complex", ";".join(fc), "-map", "[out]",
                "-ar", "48000", "-c:a", "pcm_s16le", raw], check=True)


def lufs(path):
    log = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float([ln for ln in log.splitlines() if ln.strip().startswith("I:")][-1].split()[1])


# Single-pass loudnorm lands about a dB hot on this material: trim to -14 LUFS, then limit true peak to -1.5 dBTP so the
# AAC encode stays under -1.
gain = -14.0 - lufs(raw)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.84:level=false",
                "-ar", "48000", "-c:a", "pcm_s16le", mix], check=True)

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
