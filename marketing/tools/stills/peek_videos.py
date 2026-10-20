"""Product-peek videos (WARMUP_WEEK §9.2): peek-board, peek-chains and peek-bundle-check, from capture-mode
recordings and stills (capture_videos.mjs), with captions, the DEMO corner label and an end slate.

Usage: python3 peek_videos.py scratch_dir [peek-board peek-chains peek-bundle-check]
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
from trailer_ovl import page, rich  # noqa: E402

M = "/home/user/Gmgn/marketing"
LIVE = f"{M}/screens/live"
APP = f"{M}/video/app-footage"
S = sys.argv[1]
os.makedirs(S, exist_ok=True)
V = json.load(open(f"{LIVE}/videos.json"))
MARK = open(f"{M}/brand/logo/mark-dark.svg").read()
STACK = open(f"{M}/brand/logo/lockup-stacked-dark.svg").read().replace("<svg ", '<svg style="height:220px;width:auto" ')
SCORE = f"{M}/video/audio/score-vidiq-trailer.wav"


def demo():
    return page('<div class="mono" style="position:absolute;right:48px;top:48px;font-weight:500;font-size:26px;color:rgba(230,233,240,.88);'
                'background:rgba(10,12,16,.85);border:1px solid #222731;border-radius:6px;padding:.5em .9em">UI shown with demo data</div>')


def cap(text, sub=None, pos="bottom"):
    s = f'<div style="margin-top:8px;font-weight:500;font-size:36px;color:#C9CED8">{rich(sub)}</div>' if sub else ""
    where = {"bottom": "left:0;right:0;bottom:70px;justify-content:center", "top": "left:0;right:0;top:140px;justify-content:center",
             "left": "left:80px;width:880px;top:0;bottom:0;align-items:center"}[pos]
    align = "left" if pos == "left" else "center"
    return page(f'<div style="position:absolute;{where};display:flex">'
                f'<div style="background:rgba(10,12,16,.86);border:1px solid #222731;border-radius:14px;padding:16px 34px;text-align:{align};max-width:1500px">'
                f'<div style="font-weight:700;font-size:58px;letter-spacing:-.025em;line-height:1.1">{rich(text)}</div>{s}</div></div>')


def hook(line1, line2):
    return page(f'<div style="position:absolute;inset:0;background:rgba(10,12,16,.72)"></div>'
                f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">'
                f'<div style="font-weight:900;font-size:110px;letter-spacing:-.04em;line-height:1">{rich(line1)}</div>'
                f'<div class="mono" style="margin-top:26px;font-weight:600;font-size:40px;color:#FFB547;letter-spacing:.06em">{line2}</div></div>')


def ring(x, y, w, h):
    return page(f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;border:5px solid #FFB547;border-radius:12px;'
                f'box-shadow:0 0 34px rgba(255,181,71,.45)"></div>')


def slate(line, sub=None):
    s = f'<div class="mono" style="margin-top:22px;font-size:28px;color:#8C94A3">{sub}</div>' if sub else ""
    return page(f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">{STACK}'
                f'<div style="margin-top:34px;font-weight:700;font-size:64px;letter-spacing:-.03em">{rich(line)}</div>{s}</div>', opaque=True)


def render(pages):
    jobs = []
    for n, html in pages.items():
        hp = f"{S}/{n}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{S}/{n}.png", "width": 1920, "height": 1080, "transparent": not n.startswith("slate"), "wait": 300})
    json.dump(jobs, open(f"{S}/jobs.json", "w"))
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True, stdout=subprocess.DEVNULL)


def bed(out, total, start=2.0):
    fc = (f"[0:a]atrim={start}:{start + total},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,"
          f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.4,afade=t=out:st={total - 0.8}:d=0.8[o]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", SCORE, "-filter_complex", fc, "-map", "[o]", "-ar", "48000", out], check=True)


def cut(name, segs, ovs, total, audio):
    o = [{"png": p if "/" in p else f"{S}/{p}.png", "t0": round(a, 3), "t1": round(b, 3), "fade": f} for p, a, b, f in ovs]
    edit = {"out": f"{M}/x/posts/{name}.mp4", "w": 1920, "h": 1080, "fps": 30, "segments": segs, "overlays": o, "audio": audio}
    json.dump(edit, open(f"{S}/{name}-edit.json", "w"), indent=1)
    subprocess.run(["python3", f"{M}/tools/vedit.py", f"{S}/{name}-edit.json"], check=True)


def board():
    paused = V["board"]["beats"][2]["t"]
    render({"demo": demo(), "b1": cap("new · near graduation · *migrated*"), "b2": cap("a curve ring and risk chips *on every card*"),
            "b3": cap("hover to *pause*"), "slate-board": slate("the *board.*", "high risk · nfa")})
    total = 11.0 + 1.6
    segs = [{"src": f"{APP}/live-board.mp4", "start": 0.0, "end": 11.0, "zoom": [1.0, 1.02]},
            {"src": f"{S}/slate-board.png", "still": True, "dur": 1.6}]
    ovs = [("demo", 0, 11.0, 0), ("b1", 0, 3.7, 0), ("b2", 3.9, 7.3, 0.12), ("b3", max(7.5, paused - 1.2), 11.0, 0.12)]
    au = f"{S}/board.wav"
    bed(au, total)
    cut("peek-board", segs, ovs, total, au)


def chains():
    b = {x["label"]: x["t"] for x in V["chains"]["beats"]}
    render({"demo": demo(), "c1": cap("pick the *chain.*"), "c2": cap("same *board.*"), "c3": cap("same *tags.*"), "c4": cap("same *hotkeys.*"),
            "slate-chains": slate("*one* scope.", "high risk · nfa")})
    total = 12.0 + 1.6
    segs = [{"src": f"{APP}/live-chains.mp4", "start": 0.0, "end": 12.0},
            {"src": f"{S}/slate-chains.png", "still": True, "dur": 1.6}]
    ovs = [("demo", 0, 12.0, 0), ("c1", 0, b["Base"] - 0.1, 0), ("c2", b["Base"] + 0.2, b["BNB Chain"] - 0.1, 0.1),
           ("c3", b["BNB Chain"] + 0.2, b["Ethereum"] - 0.1, 0.1), ("c4", b["Ethereum"] + 0.2, 12.0, 0.1)]
    au = f"{S}/chains.wav"
    bed(au, total)
    cut("peek-chains", segs, ovs, total, au)


def bundle():
    beats = {x["label"]: x for x in V["bundle"]["beats"]}
    hdr = V["bundleToken"]["header"]
    k = 2  # stills are 2x
    # Tickers still legible in the stills: the trade panel's quote rows and the Activity column header (CSS px).
    page_blur = [[1700 * k, 280 * k, 200 * k, 40 * k], [430 * k, 950 * k, 60 * k, 24 * k], [hdr[0] * k, hdr[1] * k, 360 * k, hdr[3] * k]]
    pr = beats["prompt"]
    dlg_blur = page_blur + [[(pr["title"][0] + 108) * k, (pr["title"][1] - 2) * k, 210 * k, (pr["title"][3] + 4) * k],
                            [(pr["receive"][0] + 180) * k, pr["receive"][1] * k, 150 * k, pr["receive"][3] * k]]

    def crop_for(cx, cy, w):
        h = w * 9 / 16
        x = min(max(0, cx - w / 2), 3840 - w)
        y = min(max(0, cy - h / 2), 2160 - h)
        return [round(x), round(y), round(w), round(h)]

    ap, cp = beats["audit"]["panel"], beats["chips"]["panel"]
    c_audit = crop_for((ap[0] + ap[2] / 2) * k, (ap[1] + ap[3] / 2) * k, 1280)
    c_chips = crop_for((cp[0] + cp[2] / 2) * k, (cp[1] + cp[3] / 2) * k, 1280)
    c_fund = [1680, 1440, 1280, 720]  # the bundler rows' value and "Funded by" columns, bottom of the 2x page
    db = pr["box"]
    # Dialog on the right two thirds, caption beside it on the left.
    c_dlg = crop_for((db[0] + db[2]) * k + 150 - 1200, (db[1] + db[3] / 2) * k, 2400)

    def ring_in(crop, b, pad=10):
        sx = 1920 / crop[2]
        return ring((b[0] * k - crop[0]) * sx - pad, (b[1] * k - crop[1]) * sx - pad, b[2] * k * sx + 2 * pad, b[3] * k * sx + 2 * pad)

    render({"demo": demo(), "hook": hook("is this launch *bundled?*", "THE 10-SECOND CHECK"),
            "s1": cap("1/5 · open the coin"),
            "s2": cap("2/5 · the audit", "bundlers: share of volume from wallets that bought *in the creation block*"),
            "s3": cap("3/5 · the holder chips", "red means over the line. *hover any chip* for what it measures."),
            "s4": cap("4/5 · funded by", "filter to bundlers. *both wallets, same funder.*", "top"),
            "s5": cap("5/5 · try to buy", "it lists the reasons\nand *asks first.*", "left"),
            "r2": ring_in(c_audit, beats["audit"]["box"]), "r3": ring_in(c_chips, beats["chips"]["box"]),
            "r4": ring_in(c_fund, beats["funded"]["box"]),
            "slate-bundle": slate("see who's *really* buying.", "UI shown with demo data · high risk · nfa")})
    st = lambda f, crop, dur, z, blur: {"src": f"{LIVE}/{f}.png", "still": True, "dur": dur, "crop": crop, "zoom": z, "blur": blur}
    segs = [st("bundle-1-open", [0, 0, 3840, 2160], 2.0, [1.0, 1.01], page_blur),
            st("bundle-1-open", [0, 0, 3840, 2160], 2.4, [1.01, 1.04], page_blur),
            st("bundle-2-audit", c_audit, 4.4, [1.0, 1.04], page_blur),
            st("bundle-3-chips", c_chips, 4.4, [1.0, 1.04], page_blur),
            st("bundle-4-funded", c_fund, 4.6, [1.0, 1.03], page_blur),
            st("bundle-5-prompt", c_dlg, 4.6, [1.0, 1.04], dlg_blur),
            {"src": f"{S}/slate-bundle.png", "still": True, "dur": 2.4}]
    t = [0.0]
    for sgm in segs:
        t.append(t[-1] + sgm["dur"])
    total = t[-1]
    ovs = [("hook", t[0], t[1], 0), ("demo", t[0], t[6], 0), ("s1", t[1], t[2], 0.12), ("s2", t[2], t[3], 0.12), ("r2", t[2] + 0.3, t[3], 0.15),
           ("s3", t[3], t[4], 0.12), ("r3", t[3] + 0.3, t[4], 0.15), ("s4", t[4], t[5], 0.12), ("r4", t[4] + 0.3, t[5], 0.15), ("s5", t[5], t[6], 0.12)]
    au = f"{S}/bundle.wav"
    bed(au, total, 4.0)
    cut("peek-bundle-check", segs, ovs, total, au)


if __name__ == "__main__":
    for n in (sys.argv[2:] or ["peek-board", "peek-chains", "peek-bundle-check"]):
        {"peek-board": board, "peek-chains": chains, "peek-bundle-check": bundle}[n]()
