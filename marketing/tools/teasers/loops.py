"""POV loops and the species montage (research/VIRAL_FORMATS.md patterns 1 and 5).

Usage: python3 loops.py scratch_dir [name ...]
Writes marketing/x/posts/pov-dev-woke.mp4, pov-exit.mp4, pov-larpers.mp4 and species-montage.mp4.
Music: video/audio/phonk-vidiq-loops.wav (vidIQ, 140 bpm; the track opens on a hit at 0.03 s and
re-enters on a hit at 41.198 s after a silence, so cuts are placed on that beat grid).
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
sys.path.insert(0, "/home/user/Gmgn/marketing/tools/teasers")
import fg  # noqa: E402
from chips import chip_html  # noqa: E402
from trailer_ovl import BAR, RETICLE, page, rich  # noqa: E402

M = "/home/user/Gmgn/marketing"
CL = f"{M}/video/clips"
S = sys.argv[1]
os.makedirs(S, exist_ok=True)
fg.S = S
PHONK = f"{M}/video/audio/phonk-vidiq-loops.wav"
SCORE = f"{M}/video/audio/score-vidiq-trailer.wav"
BEAT = 60 / 140
BAND = 250
MARK = open(f"{M}/brand/logo/mark-dark.svg").read()


def pov_band(text, where="top"):
    """Meme-format band: solid bg, big lowercase lines, one amber phrase. The opposite edge gets a letterbox bar,
    unless the band sits at the bottom (subjects high in frame, e.g. the exit shot)."""
    pos = "top:0" if where == "top" else "bottom:0"
    bar = (f'<div style="position:absolute;left:0;right:0;bottom:0;height:{BAR}px;background:#0A0C10"></div>' if where == "top" else "")
    return page(f'<div style="position:absolute;left:0;right:0;{pos};height:{BAND}px;background:#0A0C10;display:flex;align-items:center;'
                f'justify-content:center"><div style="max-width:1560px;text-align:center;font-weight:800;font-size:78px;letter-spacing:-.03em;'
                f'line-height:1.08">{rich(text)}</div></div>{bar}')


def ai_below_band():
    return page(f'<div class="mono" style="position:absolute;right:48px;top:{BAND + 24}px;font-weight:500;font-size:26px;color:rgba(230,233,240,.85);'
                'background:rgba(10,12,16,.8);border-radius:6px;padding:.5em .9em">AI-generated</div>')


def wordmark(size=40):
    return (f'<span style="display:inline-flex;align-items:center;gap:{size * 0.35:.0f}px;font-weight:700;font-size:{size}px;letter-spacing:-.02em">'
            f'<span style="width:{size * 1.4:.0f}px;height:{size * 1.4:.0f}px;display:inline-block">{MARK.replace("<svg ", "<svg style=\"width:100%;height:100%\" ")}</span>'
            f'<span>Trench<b style="color:#FFB547;font-weight:700">scope</b></span></span>')


def brand_card(inner):
    return page(f'<div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 70% at 50% 40%,rgba(255,181,71,.12),transparent 60%),#0A0C10"></div>'
                f'<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(140,148,163,.06) 1px,transparent 1px),linear-gradient(90deg,'
                f'rgba(140,148,163,.06) 1px,transparent 1px);background-size:64px 64px"></div>{inner}', opaque=True)


def name_tag(name, tag=None):
    chip = chip_html(tag, 46) if tag else ""
    return page(f'<div style="position:absolute;left:0;right:0;bottom:{BAR + 40}px;display:flex;justify-content:center;align-items:center;gap:26px">'
                f'<div style="font-weight:900;font-size:92px;letter-spacing:-.03em;line-height:1;text-shadow:0 4px 30px rgba(0,0,0,.85)">{rich(name)}</div>{chip}</div>')


def reticle(x, y, size):
    return page(f'<div style="position:absolute;left:{x - size / 2}px;top:{y - size / 2}px;width:{size}px;height:{size}px;'
                f'filter:drop-shadow(0 0 14px rgba(255,181,71,.6))">{RETICLE}</div>')


def mix(out, total, music_from, extra=None):
    """Phonk bed from `music_from` s; optional (src, start, end, at, gain) one-shots such as a score hit on a cut."""
    ins = ["-i", PHONK]
    fc = f"[0:a]atrim={music_from}:{music_from + total},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[m];"
    labels = "[m]"
    for k, (src, a, b, at, gain) in enumerate(extra or []):
        ins += ["-i", src]
        fc += (f"[{k + 1}:a]atrim={a}:{b},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume={gain},"
               f"afade=t=out:st={b - a - 0.4}:d=0.4,adelay={int(at * 1000)}|{int(at * 1000)}[x{k}];")
        labels += f"[x{k}]"
    n = 1 + len(extra or [])
    fc += (f"{labels}amix=inputs={n}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,apad=whole_dur={total},atrim=0:{total},"
           f"afade=t=out:st={total - 0.25}:d=0.25[o]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "[o]", "-ar", "48000", out], check=True)


def cut(name, segs, ovs, total, audio):
    o = [{"png": p if "/" in p else f"{S}/{p}.png", "t0": round(a, 3), "t1": round(b, 3), "fade": f} for p, a, b, f in ovs]
    edit = {"out": f"{M}/x/posts/{name}.mp4", "w": 1920, "h": 1080, "fps": 30, "segments": segs, "overlays": o, "audio": audio}
    json.dump(edit, open(f"{S}/{name}-edit.json", "w"), indent=1)
    subprocess.run(["python3", f"{M}/tools/vedit.py", f"{S}/{name}-edit.json"], check=True)


def slowed(clip, a, b, factor, out):
    """Slow-motion segment as its own file (vedit has no speed control); 30 fps, frame-blended."""
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-t", str(b - a), "-i", clip, "-an",
                    "-vf", f"setpts={factor}*PTS,minterpolate=fps=30:mi_mode=blend", "-c:v", "libx264", "-crf", "14", out], check=True)
    return out


def pov_dev_woke():
    t_cut = 7 * BEAT
    total = t_cut + 5.0
    fg.render({"pov1": pov_band("POV: you aped and\n*the dev wallet just woke up*"), "aiu": ai_below_band()})
    segs = [{"src": f"{CL}/c07.mp4", "start": 5.0 - t_cut, "end": 5.0, "zoom": [1.0, 1.06]},
            {"src": f"{CL}/c11.mp4", "start": 0.0, "end": 5.0}]
    au = f"{S}/pov1.wav"
    mix(au, total, 0.03, [(SCORE, 48.0, 50.0, t_cut - 0.05, 0.9)])
    cut("pov-dev-woke", segs, [("pov1", 0, total, 0), ("aiu", 0, total, 0)], total, au)


def pov_exit():
    clip = slowed(f"{CL}/n2-the-exit.mp4", 0.0, 2.6, 1.5, f"{S}/n2-slow.mp4")
    t_card = 9 * BEAT
    total = t_card + 6 * BEAT
    card = brand_card(f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px">'
                      f'{chip_html("dev", 64)}<div style="font-weight:800;font-size:96px;letter-spacing:-.04em">dev-sell exit</div>'
                      f'<div class="mono" style="font-weight:500;font-size:34px;color:#8C94A3">reacts after the dev sells</div>'
                      f'<div style="margin-top:30px">{wordmark(40)}</div></div>'
                      f'<div class="mono" style="position:absolute;left:0;right:0;bottom:56px;text-align:center;color:#8C94A3;font-size:26px">high risk · nfa</div>')
    fg.render({"pov2": pov_band("POV: the dev sold.\n*your exit fired right after.*", "bottom"), "ai": fg.ai_label(), "exit-card": card})
    segs = [{"src": clip, "start": 0.0, "end": t_card}, {"src": f"{S}/exit-card.png", "still": True, "dur": total - t_card}]
    au = f"{S}/pov2.wav"
    mix(au, total, 0.03)
    cut("pov-exit", segs, [("pov2", 0, t_card, 0), ("ai", 0, t_card, 0)], total, au)


def pov_larpers():
    t_card = 8 * BEAT
    total = t_card + 9 * BEAT
    chips = "".join(chip_html(t, 50) for t in ("sniper", "bundler", "insider", "dev"))
    card = brand_card(f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">'
                      f'<div style="display:flex;gap:22px">{chips}</div>'
                      f'<div style="font-weight:800;font-size:84px;letter-spacing:-.04em">see who\'s <span style="color:#FFB547">really</span> buying.</div>'
                      f'<div style="margin-top:10px">{wordmark(40)}</div></div>')
    fg.render({"pov3": pov_band("the timeline *vs.* the wallets"), "aiu": ai_below_band(), "larp-card": card})
    segs = [{"src": f"{M}/video/keyframes/n3-the-larpers.jpg", "still": True, "dur": t_card, "crop": [11, 0, 2730, 1536], "zoom": [1.0, 1.06]},
            {"src": f"{S}/larp-card.png", "still": True, "dur": total - t_card}]
    au = f"{S}/pov3.wav"
    mix(au, total, 0.03)
    cut("pov-larpers", segs, [("pov3", 0, t_card, 0), ("aiu", 0, t_card, 0)], total, au)


def montage():
    shots = [("c01", 0.6, "THE WHALE", "whale", (885, 262), 200), ("c04", 1.0, "THE SNIPER", "sniper", (1000, 482), 190),
             ("c05", 2.4, "THE BUNDLER", "bundler", (948, 560), 280), ("c06", 2.0, "THE INSIDER", "insider", (1488, 640), 200),
             ("c07", 3.2, "THE DEV", "dev", (1286, 268), 170), ("c11", 0.5, "THE *RUG.*", None, None, 0)]
    pages = {"aim": fg.ai_label()}
    segs, ovs, t = [], [], 0.0
    for i, (clip, a, name, tag, ret, size) in enumerate(shots):
        d = 3 * BEAT
        segs.append({"src": f"{CL}/{clip}.mp4", "start": a, "end": a + d, "zoom": [1.02, 1.08]})
        pages[f"mt{i}"] = name_tag(name, tag)
        ovs.append((f"mt{i}", t, t + d, 0))
        if ret:
            pages[f"mr{i}"] = reticle(ret[0], ret[1], size)
            ovs.append((f"mr{i}", t + 0.08, t + d, 0.08))
        t += d
    d = 4 * BEAT
    segs.append({"src": f"{CL}/n1-five-fronts.mp4", "start": 2.0, "end": 2.0 + d, "zoom": [1.0, 1.05]})
    pages["mt6"] = name_tag("*five chains.* one scope.")
    ovs.append(("mt6", t, t + d, 0))
    t += d
    ai_end = t
    d = 5 * BEAT
    pages["mcard"] = brand_card(f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">'
                                f'<div style="font-weight:800;font-size:96px;letter-spacing:-.04em">see who\'s <span style="color:#FFB547">really</span> buying.</div>'
                                f'{wordmark(44)}</div>'
                                f'<div class="mono" style="position:absolute;left:0;right:0;bottom:56px;text-align:center;color:#8C94A3;font-size:26px">'
                                f'sol · base · bsc · eth · robinhood chain</div>')
    segs.append({"src": f"{S}/mcard.png", "still": True, "dur": d})
    total = t + d
    fg.render(pages)
    ovs = [(f"{M}/video/overlays/trailer/letterbox.png", 0, ai_end, 0), ("aim", 0, ai_end, 0)] + ovs
    au = f"{S}/montage.wav"
    mix(au, total, 41.198)
    cut("species-montage", segs, ovs, total, au)


if __name__ == "__main__":
    todo = sys.argv[2:] or ["pov-dev-woke", "pov-exit", "pov-larpers", "montage"]
    for n in todo:
        {"pov-dev-woke": pov_dev_woke, "pov-exit": pov_exit, "pov-larpers": pov_larpers, "montage": montage}[n]()
