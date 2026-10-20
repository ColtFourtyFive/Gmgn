"""Field-guide teasers (WARMUP_WEEK §9.1): an AI species clip with its card, then a TRENCH DICTIONARY card.

Usage: python3 fg.py scratch_dir [ref ...]      (default: all four)
Writes marketing/x/posts/fg-<species>.mp4 and keeps the overlay HTML/PNGs in scratch_dir.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
from chips import chip_html  # noqa: E402
from trailer_ovl import BAR, RETICLE, page, rich  # noqa: E402

M = "/home/user/Gmgn/marketing"
TOOLS = f"{M}/tools"
CL = f"{M}/video/clips"
OVT = f"{M}/video/overlays/trailer"
MARK = open(f"{M}/brand/logo/mark-dark.svg").read()
S = sys.argv[1]
os.makedirs(S, exist_ok=True)

# Species shots: clip windows (s), reticle centre in 1920x1080 output pixels, caption.
FG = {
    "sniper": {"shots": [("c04", 0.0, 5.0, (1000, 482), 200, "in before you *blinked.*")],
               "name": "THE SNIPER", "latin": "emptor primus",
               "def": ["bought within 3 blocks of launch."],
               "scale": ("on the audit", [("under 5", "#22D687"), ("5–20", "#FFC107"), ("over 20", "#FF5468")])},
    "bundler": {"shots": [("c05", 0.0, 5.0, (948, 560), 300, "six wallets, one *trench coat.*")],
                "name": "THE BUNDLER", "latin": "fasciculus unanimus",
                "def": ["bought in the same block the coin was created."],
                "scale": ("on the audit, share of volume", [("up to 10%", "#22D687"), ("up to 30%", "#FFC107"), ("over 30%", "#FF5468")]),
                "vo": (32.70, 34.95, 1.0)},
    "insider": {"shots": [("c06", 0.0, 5.0, (1488, 640), 220, "early. *suspiciously* early.")],
                "name": "THE INSIDER", "latin": "amicus devi",
                "def": ["funded by the dev", "funded by the dev's own funder", "one private funder, 3+ wallets, all in the first 10 minutes"]},
    "dev": {"shots": [("c07", 0.0, 5.0, (1286, 268), 180, "sets the *table.*"),
                      ("c11", 0.0, 5.0, None, 0, "then pulls the *rug.*")],
            "name": "THE DEV", "latin": "creator fugiens",
            "def": ["the wallet that made the coin.", "holding · sold part · sold all · bought more", "hover: coins launched · coins migrated"]},
}
CARD_S = 6.0


def kicker():
    return page(f'<div class="mono" style="position:absolute;left:200px;top:{(BAR - 30) // 2}px;color:#8C94A3;font-weight:500;'
                f'font-size:24px;letter-spacing:.16em">FIELD GUIDE TO THE TRENCHES</div>')


def ai_label():
    # BRAND_GUIDE §10 corner label, video: top-right, 48 px margin, exact case.
    return page('<div class="mono" style="position:absolute;right:48px;top:48px;font-weight:500;font-size:26px;color:rgba(230,233,240,.85);'
                'background:rgba(10,12,16,.8);border-radius:6px;padding:.5em .9em">AI-generated</div>')


def species_card(name, latin, tag):
    return page(f'<div style="position:absolute;left:200px;top:{BAR + 40}px">'
                f'<div class="mono" style="font-style:italic;font-weight:500;font-size:26px;color:#8C94A3;margin-bottom:12px">{latin}</div>'
                f'<div style="display:flex;align-items:center;gap:26px"><div style="font-weight:900;font-size:96px;letter-spacing:-.03em;line-height:1;'
                f'text-shadow:0 4px 30px rgba(0,0,0,.8)">{name}</div>{chip_html(tag, 40)}</div></div>')


def reticle(x, y, size):
    return page(f'<div style="position:absolute;left:{x - size / 2}px;top:{y - size / 2}px;width:{size}px;height:{size}px;'
                f'filter:drop-shadow(0 0 14px rgba(255,181,71,.6))">{RETICLE}</div>')


def caption(text):
    # BRAND_GUIDE §9.1 video captions: Inter 600, 56–64 px, bottom third, bg plate at ~65%.
    return page(f'<div style="position:absolute;left:0;right:0;bottom:{BAR + 44}px;display:flex;justify-content:center">'
                f'<div style="background:rgba(10,12,16,.68);border-radius:12px;padding:12px 28px;font-weight:600;font-size:60px;'
                f'letter-spacing:-.025em">{rich(text)}</div></div>')


def dict_card(tag, d):
    lines = "".join(f'<div style="margin-top:18px">{x}</div>' for x in d["def"])
    scale = ""
    if d.get("scale"):
        label, steps = d["scale"]
        pills = "".join(f'<span class="mono" style="color:{c};background:{c}1f;border:1.5px solid {c}55;border-radius:8px;padding:8px 18px">{t}</span>'
                        for t, c in steps)
        scale = (f'<div style="margin-top:44px;display:flex;align-items:center;gap:18px;font-size:34px;font-weight:600">'
                 f'<span style="color:#8C94A3;font-weight:500">{label}:</span>{pills}</div>')
    body = f"""
<div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 70% at 88% 8%,rgba(255,181,71,.14),transparent 60%),#0A0C10"></div>
<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(140,148,163,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(140,148,163,.06) 1px,transparent 1px);background-size:64px 64px"></div>
<div style="position:absolute;left:160px;right:160px;top:0;bottom:170px;display:flex;flex-direction:column;justify-content:center">
  <div class="mono" style="display:flex;align-items:center;gap:14px;color:#FFB547;font-weight:600;font-size:28px;letter-spacing:.14em">
    <span style="width:14px;height:14px;border-radius:50%;background:#FFB547;box-shadow:0 0 12px #FFB547"></span>TRENCH DICTIONARY</div>
  <div style="margin-top:46px;display:flex;align-items:center;gap:36px">{chip_html(tag, 84)}
    <div style="font-weight:800;font-size:120px;letter-spacing:-.04em;line-height:1">{tag}</div></div>
  <div style="margin-top:34px;font-weight:600;font-size:52px;letter-spacing:-.02em;line-height:1.2;color:#E6E9F0">{lines}</div>
  {scale}
</div>
<div style="position:absolute;left:160px;right:160px;bottom:80px;display:flex;justify-content:space-between;align-items:center">
  <span class="mono" style="color:#8C94A3;font-weight:500;font-size:28px">high risk · nfa</span>
  <span style="display:flex;align-items:center;gap:14px;font-weight:700;font-size:36px;letter-spacing:-.02em">
    <span style="width:52px;height:52px;display:inline-block">{MARK.replace('<svg ', '<svg style="width:100%;height:100%" ')}</span>
    <span>Trench<b style="color:#FFB547;font-weight:700">scope</b></span></span>
</div>"""
    return page(body, opaque=True)


def render(pages):
    jobs = []
    for name, html in pages.items():
        hp = f"{S}/{name}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{S}/{name}.png", "width": 1920, "height": 1080, "transparent": "card" not in name, "wait": 300})
    json.dump(jobs, open(f"{S}/jobs.json", "w"))
    subprocess.run(["node", f"{TOOLS}/render.mjs", f"{S}/jobs.json"], check=True, stdout=subprocess.DEVNULL)


def build(tag):
    d = FG[tag]
    pages = {"kicker": kicker(), "ai": ai_label(), f"{tag}-species": species_card(d["name"], d["latin"], tag), f"{tag}-card": dict_card(tag, d)}
    for i, (_, _, _, ret, size, cap) in enumerate(d["shots"]):
        pages[f"{tag}-cap{i}"] = caption(cap)
        if ret:
            pages[f"{tag}-ret{i}"] = reticle(ret[0], ret[1], size)
    render(pages)
    o = lambda n, t0, t1, fade=0.12: {"png": f"{S}/{n}.png" if "/" not in n else n, "t0": t0, "t1": t1, "fade": fade}
    segs, ovs, t = [], [], 0.0
    for i, (clip, a, b, ret, _, _) in enumerate(d["shots"]):
        segs.append({"src": f"{CL}/{clip}.mp4", "start": a, "end": b, "zoom": [1.0, 1.04]})
        ovs.append(o(f"{tag}-cap{i}", t + (0.0 if i == 0 else 0.15), t + (b - a) - 0.05, 0 if i == 0 else 0.12))
        if ret:
            ovs.append(o(f"{tag}-ret{i}", t + 0.2, t + (b - a) - 0.05, 0.1))
        t += b - a
    ai_end = t
    segs.append({"src": f"{S}/{tag}-card.png", "still": True, "dur": CARD_S})
    total = t + CARD_S
    ovs = [o(f"{OVT}/letterbox.png", 0, ai_end, 0), o("kicker", 0, ai_end, 0), o("ai", 0, ai_end, 0),
           o(f"{tag}-species", 0, min(5.0, ai_end) - 0.05, 0)] + ovs
    out = f"{M}/x/posts/fg-{tag}.mp4"
    music = f"{S}/{tag}-mix.wav"
    mix(tag, d, total, music)
    edit = {"out": out, "w": 1920, "h": 1080, "fps": 30, "segments": segs, "overlays": ovs, "audio": music}
    json.dump(edit, open(f"{S}/{tag}-edit.json", "w"), indent=1)
    subprocess.run(["python3", f"{TOOLS}/vedit.py", f"{S}/{tag}-edit.json"], check=True)


def mix(tag, d, total, out):
    """Score bed cut so the vidIQ track's hard stop (~41 s) lands on the end; optional VO line, ducked bed."""
    start = 41.0 - total
    score = f"{M}/video/audio/score-vidiq-trailer.wav"
    if d.get("vo"):
        a, b, at = d["vo"]
        fc = (f"[0:a]atrim={start}:{start + total},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[m];"
              f"[1:a]atrim={a}:{b},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=80,"
              f"afade=t=in:d=0.02,afade=t=out:st={b - a - 0.1}:d=0.1,adelay={int(at * 1000)}|{int(at * 1000)},apad=whole_dur={total}[v];"
              f"[v]asplit[vs][vm];[m][vs]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=250[d];"
              f"[d][vm]amix=inputs=2:normalize=0:weights=1 1.3,loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:{total},afade=t=out:st={total - 0.4}:d=0.4[o]")
        args = ["-i", score, "-i", f"{M}/video/audio/vo-take-v4.wav"]
    else:
        fc = (f"[0:a]atrim={start}:{start + total},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,"
              f"loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:{total},afade=t=out:st={total - 0.4}:d=0.4[o]")
        args = ["-i", score]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", fc, "-map", "[o]", "-ar", "48000", out], check=True)


if __name__ == "__main__":
    for tag in (sys.argv[2:] or list(FG)):
        build(tag)
