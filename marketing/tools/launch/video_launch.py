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


# ---- launch-10 / launch-13: real dev dumps from capture_watch.mjs ----------------------------------------------------
W = json.load(open(f"{LIVE}/watch.json")) if os.path.exists(f"{LIVE}/watch.json") else {"takes": []}
AUDIT = [1565, 475, 338, 305]          # the audit card on the 1920x1080 token page (CSS px = video px)
MAKERS = [915, 975, 200, 80]           # Activity "maker" column: demo KOL display names are blurred here


def take(i):
    t = W["takes"][i]
    tr = sorted(t["trades"], key=lambda x: x["t"])
    c = t["createdAt"]
    dump = t["dumpAt"] or t["devSellAt"]
    first = lambda f: next((x for x in tr if f(x)), None)
    ev = {"bundlers": first(lambda x: x["side"] == "buy" and "bundler" in (x["tags"] or [])),
          "snipers": first(lambda x: x["side"] == "buy" and "sniper" in (x["tags"] or [])),
          "bundler_sell": first(lambda x: x["side"] == "sell" and "bundler" in (x["tags"] or []) and not x["isDev"]),
          "dev_sell": first(lambda x: x["side"] == "sell" and x["isDev"])}
    after = [x for x in tr if dump <= x["t"] <= t["end"]]
    floor = min(after, key=lambda x: x["mc"]) if after else None
    return t, c, dump, ev, floor


def mmss(sec):
    sec = max(0, int(round(sec)))
    return f"{sec // 60}:{sec % 60:02d}"


def ring_px(b, crop=None, pad=10, out_w=1920):
    if crop:
        k = out_w / crop[2]
        b = [(b[0] - crop[0]) * k, (b[1] - crop[1]) * k, b[2] * k, b[3] * k]
    x, y, w, h = b
    return page(f'<div style="position:absolute;left:{x - pad:.0f}px;top:{y - pad:.0f}px;width:{w + 2 * pad:.0f}px;height:{h + 2 * pad:.0f}px;'
                f'border:5px solid #FFB547;border-radius:12px;box-shadow:0 0 34px rgba(255,181,71,.45)"></div>')


def launch10(i=0):
    """QT-1: one real dev dump at real speed (jump cuts only), the audit beside the chart, captions per moment."""
    t, c, dump, ev, floor = take(i)
    src = f"{APP}/{t['file']}-rt.mp4"
    d = dump - t["rtStart"]                       # the dump, in the ring-buffer clip
    full = [27, 0, 1866, 1050]                    # 16:9 without the status bar
    tight = [16, 190, 1540, 866]                  # stats, chart and the first Activity rows
    a0, a1 = max(0.0, d - 12), max(0.0, d - 4)
    b1 = min(t["end"] - t["rtStart"] - 0.2, d + 9.5)
    render({"demo": demo(), "hook10": hook("SCREEN RECORDING. *NOT AI.*", "DEMO DATA · REAL SPEED"),
            "c-audit": cap("the audit: *red*", "rows over the line, before anything moves", "top"),
            "r-audit": ring_px(AUDIT, full),
            "c-dev": cap("dev *sells.*", None, "top"), "c-floor": cap("the *floor.*", None, "top"),
            "slate10": slate("the trailer is AI. *the terminal isn't.*", "UI shown with demo data · high risk · nfa")})
    segs = [{"src": src, "start": round(a0, 3), "end": round(a1, 3), "crop": full, "blur": [MAKERS]},
            {"src": src, "start": round(a1, 3), "end": round(b1, 3), "crop": tight, "blur": [MAKERS]},
            {"src": f"{S}/slate10.png", "still": True, "dur": 2.4}]
    la, lb = a1 - a0, b1 - a1
    tdump = la + (d - a1)
    ovs = [("hook10", 0, 2.2, 0), ("demo", 0, la + lb, 0), ("c-audit", 2.3, la, 0.1), ("r-audit", 2.5, la, 0.1),
           ("c-dev", max(la, tdump - 0.2), tdump + 3.2, 0.08), ("c-floor", tdump + 4.5, la + lb, 0.1)]
    total = la + lb + 2.4
    au = f"{S}/rt.wav"
    bed(au, total, 30.0)
    vedit("launch-10", segs, ovs, au)
    json.dump({"token": t["symbol"], "dump_at_s": round(dump - c, 1), "clip_dump_t": round(tdump, 2)}, open(f"{S}/launch-10.json", "w"))
    print("launch-10", t["symbol"], "dump", round(dump - c, 1), "s after mint")


def launch13(i=1):
    """L1-A: rug autopsy, 4:5. The chart (life from mint on 1 s candles) above the audit card, sped up and labelled,
    with timestamped lines from the token's own trades."""
    t, c, dump, ev, floor = take(i)
    src = f"{APP}/{t['file']}-lapse.mp4"
    dur = t["end"] - t["lapseStart"]
    speed = max(2, int(round(dur / 18)))
    out_d = dur / speed
    lines = []
    if ev["bundlers"]: lines.append((ev["bundlers"]["t"] - c, "bundlers: creation block"))
    if ev["snipers"]: lines.append((ev["snipers"]["t"] - c, "snipers: blocks 1–3"))
    # Written from this token's own trades, in the order they happened (LAUNCH_DAY L1-A: never staged).
    bs = ev["bundler_sell"]
    if bs and abs(bs["t"] - dump) <= 1.0:
        lines.append((dump - c, "dev + bundlers sell, same second"))
    else:
        if bs: lines.append((bs["t"] - c, "bundler sell"))
        lines.append((dump - c, "dev sell"))
    if floor and floor["t"] - dump > 1.0: lines.append((floor["t"] - c, "floor"))
    lines.sort()
    # Output time at which each line appears (events before the recording started show from the first frame).
    t_out = [max(0.0, (x - (t["lapseStart"] - c)) / speed) for x, _ in lines]
    W_, H_ = 1080, 1350

    def frame_html(k):
        rows = "".join(f'<div class="mono" style="margin-top:14px;font-size:30px;font-weight:{700 if j == k else 500};'
                       f'color:{"#FFB547" if j == k else ("#E6E9F0" if j < k else "#3A404C")}">[{mmss(x)}] {txt}</div>'
                       for j, (x, txt) in enumerate(lines))
        return (f'<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:{W_}px;height:{H_}px;'
                f'overflow:hidden;background:transparent;color:#E6E9F0;font-family:Inter,sans-serif}}.mono{{font-family:"JetBrains Mono",monospace}}</style></head><body>'
                f'<div style="position:absolute;left:60px;top:52px"><div class="mono" style="color:#FFB547;font-weight:600;font-size:24px;letter-spacing:.14em">RUG AUTOPSY #1</div>'
                f'<div style="margin-top:12px;font-weight:800;font-size:54px;letter-spacing:-.03em">demo data, mint to floor.</div></div>'
                f'<div class="mono" style="position:absolute;right:60px;top:60px;border:2px solid #FFB547;color:#FFB547;font-weight:700;font-size:28px;padding:6px 14px;border-radius:8px">{speed}× speed</div>'
                f'<div style="position:absolute;left:60px;top:1010px;width:960px">{rows}'
                f'<div class="mono" style="margin-top:16px;font-size:20px;color:#8C94A3">times since mint</div></div>'
                f'<div class="mono" style="position:absolute;left:60px;bottom:40px;color:#8C94A3;font-size:22px">high risk · nfa</div>'
                f'<div class="mono" style="position:absolute;right:60px;bottom:34px;font-weight:500;font-size:22px;color:rgba(230,233,240,.85);'
                f'background:rgba(10,12,16,.85);border:1px solid #222731;border-radius:6px;padding:.5em .9em">UI shown with demo data</div></body></html>')
    jobs = []
    for k in range(-1, len(lines)):
        hp = f"{S}/a13-{k + 1}.html"
        open(hp, "w").write(frame_html(k))
        jobs.append({"src": hp, "out": f"{S}/a13-{k + 1}.png", "width": W_, "height": H_, "transparent": True, "wait": 250})
    json.dump(jobs, open(f"{S}/a13.json", "w"))
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/a13.json"], check=True, stdout=subprocess.DEVNULL)
    # On 1 s candles the whole life sits in the chart's first ~250 px, so: the stats row (market cap, ATH and its drop,
    # the bonding-curve bar) on top, a zoomed strip of the candles beside the audit card, then the timeline.
    stats = [16, 48, 1000, 206]
    chart = [14, 300, 250, 320]
    st_w, st_h = 1080, round(1080 * stats[3] / stats[2])
    ch_w, ch_h = 470, round(470 * chart[3] / chart[2])
    au_w, au_h = 520, round(520 * AUDIT[3] / AUDIT[2])
    fc = [f"color=c=0x0A0C10:s={W_}x{H_}:d={out_d:.3f}:r=30[bg]",
          f"[0:v]setpts=PTS/{speed},fps=30,split=3[s0][s1][s2]",
          f"[s0]crop={stats[2]}:{stats[3]}:{stats[0]}:{stats[1]},scale={st_w}:{st_h}:flags=lanczos[st]",
          f"[s1]crop={chart[2]}:{chart[3]}:{chart[0]}:{chart[1]},scale={ch_w}:{ch_h}:flags=lanczos[ch]",
          f"[s2]crop={AUDIT[2]}:{AUDIT[3]}:{AUDIT[0]}:{AUDIT[1]},scale={au_w}:{au_h}:flags=lanczos[au]",
          "[bg][st]overlay=0:150:shortest=1[v0]", f"[v0][ch]overlay=40:{150 + st_h + 24}[v1]", f"[v1][au]overlay=520:{150 + st_h + 30}[v2]"]
    cur, args = "v2", ["ffmpeg", "-y", "-loglevel", "error", "-i", src]
    for k in range(len(lines) + 1):
        args += ["-loop", "1", "-t", f"{out_d:.3f}", "-i", f"{S}/a13-{k}.png"]
    # Overlay k shows lines[0..k-1] lit; it holds from the time line k-1 appears until line k appears.
    bounds = [0.0] + t_out + [out_d]
    for k in range(len(lines) + 1):
        a, b = bounds[k], bounds[k + 1]
        if b - a <= 0.01:
            continue
        fc.append(f"[{cur}][{k + 1}:v]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'[o{k}]")
        cur = f"o{k}"
    hold = 2.0
    au = f"{S}/autopsy.wav"
    bed(au, out_d + hold, 52.0)
    out = f"{OUTD}/launch-13.mp4"
    args += ["-i", au, "-filter_complex", ";".join(fc) + f";[{cur}]tpad=stop_mode=clone:stop_duration={hold},format=yuv420p[vout]",
             "-map", "[vout]", "-map", f"{len(lines) + 2}:a", "-t", f"{out_d + hold:.3f}", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
             "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]
    subprocess.run(args, check=True)
    json.dump({"token": t["symbol"], "speed": speed, "lines": [[mmss(x), txt] for x, txt in lines]}, open(f"{S}/launch-13.json", "w"), indent=1)
    print("launch-13", t["symbol"], f"{speed}x", [(mmss(x), txt) for x, txt in lines])


BUILD = {"launch-8": launch8, "launch-10": launch10, "launch-13": launch13}

if __name__ == "__main__":
    for r in (refs or list(BUILD)):
        BUILD[r]()
