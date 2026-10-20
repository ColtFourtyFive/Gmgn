"""Launch-day and L+2 cards (LAUNCH_DAY §10): launch-3 (the tags, by rule), launch-11 (the making-of), launch-12 (worst
rug, from c11) and launch-16 (the life of a launch, by the clock). Same card system as tools/cards2/build.py.

Usage: python3 cards_launch.py scratch_dir [launch-3 launch-11 launch-12 launch-16]
"""
import importlib.util
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
from chips import chip_html  # noqa: E402

M = "/home/user/Gmgn/marketing"
S = sys.argv[1]
refs = sys.argv[2:]
os.makedirs(S, exist_ok=True)
_spec = importlib.util.spec_from_file_location("cards2", f"{M}/tools/cards2/build.py")
cards = importlib.util.module_from_spec(_spec)
sys.argv = [sys.argv[0], S]
_spec.loader.exec_module(cards)
stage, kicker, foot, wordmark = cards.stage, cards.kicker, cards.foot, cards.wordmark


def ai_plate(right=28, bottom=24, px=22):
    # BRAND_GUIDE §10 corner label (stills: bottom-right), exact case.
    return (f'<div class="mono" style="position:absolute;right:{right}px;bottom:{bottom}px;font-weight:500;font-size:{px}px;color:rgba(230,233,240,.88);'
            f'background:rgba(10,12,16,.82);border-radius:6px;padding:.45em .8em">AI-generated</div>')


def grab(src, t, name):
    out = f"{S}/{name}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", src, "-frames:v", "1", out], check=True)
    return out


# launch-3 · T2: one row per tag, the rule in substance (ledger §2.2, LAUNCH_DAY T2 alt text). KOL only if F-2 passes.
TAGS = [
    ("sniper", "bought within 3 blocks of launch."),
    ("bundler", "bought in the block the coin was created."),
    ("insider", "first funded by the dev or the dev's funder. or one of 3+ wallets with the same funder, all buying in the first 10 minutes."),
    ("dev", "the wallet that created the coin."),
    ("smart", "a 7-day hit rate on entries that later ran 2x, tested against the chain's base rate."),
    ("whale", "$100k+ native balance or $10k+ average buys."),
    ("fresh", "first funded under 24h ago, in fewer than 15 coins."),
    ("bot", "200+ trades a day and 5× the chain's median trader, median hold under 2 min."),
]


def tags_card():
    w, h = 1080, 1350
    rows = "".join(f'<div style="display:grid;grid-template-columns:230px 1fr;align-items:center;gap:26px;padding:20px 0;border-top:1px solid #1B2029">'
                   f'<div>{chip_html(tag, 40)}</div><div style="font-weight:600;font-size:29px;line-height:1.25;color:#D5D9E2">{rule}</div></div>'
                   for tag, rule in TAGS)
    body = (f'<div style="position:absolute;left:84px;right:84px;top:76px">{kicker("STOP 2 · THE CHEAT SHEET", 24)}'
            f'<div style="margin-top:26px;font-weight:800;font-size:84px;letter-spacing:-.04em;line-height:1">the tags, <em>by rule.</em></div>'
            f'<div style="margin-top:40px">{rows}</div></div>' + foot("most wallets match no rule · high risk · nfa", 22, 84))
    return stage(w, h, body), w, h


def making_of():
    w, h = 1600, 900
    key = f"{M}/video/keyframes/s05.jpg"
    clip = grab(f"{M}/video/clips/c05.mp4", 2.2, "mo-clip")
    final = grab(f"{M}/video/trenchscope-trailer-16x9.mp4", 10.2, "mo-final")
    panel = lambda src, label: (f'<div style="width:404px"><div style="position:relative;width:404px;height:227px;border-radius:12px;overflow:hidden;'
                                f'box-shadow:0 0 0 1px #222731,0 24px 60px rgba(0,0,0,.55)"><img src="file://{src}" style="width:100%;height:100%;object-fit:cover">'
                                f'{ai_plate(10, 10, 15)}</div><div class="mono" style="margin-top:16px;font-weight:600;font-size:22px;color:#8C94A3;letter-spacing:.06em">{label}</div></div>')
    arrow = '<div style="font-weight:300;font-size:56px;color:#FFB547;padding-bottom:40px">→</div>'
    stat = lambda n, lab: (f'<div><div class="mono" style="font-weight:700;font-size:54px;color:#E6E9F0">{n}</div>'
                           f'<div style="margin-top:4px;font-weight:600;font-size:24px;color:#8C94A3">{lab}</div></div>')
    body = (f'<div style="position:absolute;left:80px;right:80px;top:64px">{kicker("THE MAKING-OF", 24)}'
            f'<div style="margin-top:22px;font-weight:800;font-size:68px;letter-spacing:-.035em;line-height:1">how the trailer <em>got made.</em></div>'
            f'<div style="margin-top:46px;display:flex;align-items:center;gap:20px">{panel(key, "1 · STILL")}{arrow}{panel(clip, "2 · CLIP")}{arrow}'
            f'{panel(final, "3 · CUT + REAL TAG CHIP")}</div>'
            f'<div style="margin-top:40px;display:flex;gap:64px">{stat("10", "stills")}{stat("10", "clips")}{stat("10", "kept")}{stat("2", "voice takes")}'
            f'{stat("1", "score")}</div></div>'
            f'<div style="position:absolute;right:80px;bottom:60px;text-align:right;font-weight:600;font-size:24px;color:#C9CED8;line-height:1.4">'
            f'the species: AI.<br>the UI: screen recordings on demo data.<br>the terminal: <em>no AI.</em></div>'
            f'<div style="position:absolute;left:80px;bottom:56px">{wordmark(30)}</div>')
    return stage(w, h, body), w, h


def worst_rug():
    w, h = 1600, 900
    still = grab(f"{M}/video/clips/c11.mp4", 0.9, "rug")
    body = (f'<img src="file://{still}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">'
            '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,16,0) 40%,rgba(10,12,16,.92) 88%)"></div>'
            '<div style="position:absolute;left:80px;right:80px;bottom:118px;font-weight:900;font-size:92px;letter-spacing:-.04em;line-height:1;'
            'text-shadow:0 6px 40px rgba(0,0,0,.8)">reply with your <em>worst rug.</em></div>'
            f'<div style="position:absolute;left:80px;bottom:40px">{wordmark(26)}</div>' + ai_plate(32, 32, 24))
    return stage(w, h, body), w, h


def clock():
    w, h = 1600, 900
    marks = [("0:00", "mint", "somewhere between <b>27k and 50k</b> new coins a day, on one launchpad."),
             ("~5 min", "graduation", "the median graduate fills its curve in <b>~5 minutes</b>, in one dataset."),
             ("~9 h", "the quiet", "the average coin that doesn't graduate goes quiet in <b>about 9 hours</b>."),
             ("24 h", "the survivors", "<b>~1 in 5</b> graduates still has $5k+ liquidity a day later.")]
    xs = [80, 450, 820, 1190]
    line = '<div style="position:absolute;left:96px;right:96px;top:438px;height:3px;background:linear-gradient(90deg,#FFB547,#2A303B)"></div>'
    nodes = "".join(
        f'<div style="position:absolute;left:{x}px;top:300px;width:330px">'
        f'<div class="mono" style="font-weight:700;font-size:48px;color:{"#FFB547" if i == 0 else "#E6E9F0"}">{t}</div>'
        f'<div style="margin-top:6px;font-weight:700;font-size:26px;color:#8C94A3;letter-spacing:.02em">{lab}</div>'
        f'<div style="position:absolute;left:8px;top:129px;width:18px;height:18px;border-radius:50%;background:{"#FFB547" if i == 0 else "#0A0C10"};'
        f'border:3px solid #FFB547"></div>'
        f'<div style="margin-top:92px;font-weight:500;font-size:27px;line-height:1.32;color:#C9CED8">{txt}</div></div>'
        for i, ((t, lab, txt), x) in enumerate(zip(marks, xs)))
    body = (f'<div style="position:absolute;left:80px;right:80px;top:70px">{kicker("BY THE CLOCK", 24)}'
            f'<div style="margin-top:22px;font-weight:800;font-size:72px;letter-spacing:-.035em;line-height:1">the life of a launch, <em>by the clock.</em></div></div>'
            + line + nodes + foot("real-market figures: secondary lifecycle data, approximate · high risk · nfa", 20, 80))
    return stage(w, h, body.replace("<b>", '<b style="color:#E6E9F0;font-weight:700">')), w, h


BUILD = {"launch-3": tags_card, "launch-11": making_of, "launch-12": worst_rug, "launch-16": clock}

if __name__ == "__main__":
    jobs = []
    for ref in (refs or list(BUILD)):
        html, w, h = BUILD[ref]()
        hp = f"{S}/{ref}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{M}/x/posts/launch/{ref}.png", "width": w, "height": h, "wait": 500})
    os.makedirs(f"{M}/x/posts/launch", exist_ok=True)
    json.dump(jobs, open(f"{S}/jobs.json", "w"), indent=1)
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True, stdout=subprocess.DEVNULL)
    print("built", [j["out"].split("/")[-1] for j in jobs])
