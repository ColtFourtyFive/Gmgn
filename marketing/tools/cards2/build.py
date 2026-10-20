"""Warm-up and launch cards for the live-terminal kit (WARMUP_WEEK §9.2, BRAND_GUIDE §14, SCRIPT §9).

Usage: python3 build.py scratch_dir [ref ...]
Refs: stat-97, thread-lifecycle, dict-smart, dict-fresh-bot, dict-kol, dict-whale, og, header-main,
      trailer-endcard-16x9, trailer-endcard-9x16. Outputs go to x/posts/ (header-main to x/profile/).
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageFilter

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
from chips import chip_html  # noqa: E402

M = "/home/user/Gmgn/marketing"
S = sys.argv[1]
os.makedirs(S, exist_ok=True)
MARK = open(f"{M}/brand/logo/mark-dark.svg").read()
STACK = open(f"{M}/brand/logo/lockup-stacked-dark.svg").read()
HORIZ = open(f"{M}/brand/logo/lockup-horizontal-dark.svg").read()
RISK = "memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa."
CHAINS_LINE = "solana · base · bnb chain · ethereum · robinhood chain"
CHAINS_DIS = "not affiliated with any chain, launchpad or exchange named."

CSS = """*{margin:0;padding:0;box-sizing:border-box}html,body{width:%dpx;height:%dpx;overflow:hidden;background:#0A0C10;color:#E6E9F0}
body{font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:'tnum'}.mono{font-family:'JetBrains Mono',monospace}
em{font-style:normal;color:#FFB547}"""


def svg(src, style):
    return src.replace("<svg ", f'<svg style="{style}" ', 1)


def stage(w, h, body, glow="88% 8%"):
    g = max(32, int(min(w, h) / 16))
    return (f"<!doctype html><html><head><meta charset=utf-8><style>{CSS % (w, h)}</style></head><body>"
            f'<div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 70% at {glow},rgba(255,181,71,.14),transparent 60%),#0A0C10"></div>'
            f'<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(140,148,163,.06) 1px,transparent 1px),linear-gradient(90deg,'
            f'rgba(140,148,163,.06) 1px,transparent 1px);background-size:{g}px {g}px"></div>'
            f'<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px)"></div>'
            f"{body}</body></html>")


def kicker(text, px):
    return (f'<div class="mono" style="display:flex;align-items:center;gap:{px * 0.5:.0f}px;color:#FFB547;font-weight:600;font-size:{px}px;letter-spacing:.14em">'
            f'<span style="width:{px * 0.5:.0f}px;height:{px * 0.5:.0f}px;border-radius:50%;background:#FFB547;box-shadow:0 0 12px #FFB547"></span>{text}</div>')


def wordmark(px):
    return (f'<span style="display:inline-flex;align-items:center;gap:{px * 0.35:.0f}px;font-weight:700;font-size:{px}px;letter-spacing:-.02em">'
            f'{svg(MARK, f"width:{px * 1.35:.0f}px;height:{px * 1.35:.0f}px")}<span>Trench<b style="color:#FFB547;font-weight:700">scope</b></span></span>')


def foot(left, px, pad):
    return (f'<div style="position:absolute;left:{pad}px;right:{pad}px;bottom:{pad * 0.7:.0f}px;display:flex;justify-content:space-between;align-items:center">'
            f'<span class="mono" style="color:#8C94A3;font-weight:500;font-size:{px}px;max-width:68%">{left}</span>{wordmark(px * 1.25)}</div>')


def stat97():
    w = h = 1200
    dots = "".join(f'<span style="width:38px;height:38px;border-radius:50%;background:{"#FFB547" if i in (34, 57, 82) else "#2A303B"};'
                   f'{"box-shadow:0 0 18px rgba(255,181,71,.7)" if i in (34, 57, 82) else ""}"></span>' for i in range(100))
    body = (f'<div style="position:absolute;left:96px;right:96px;top:84px">{kicker("TRENCH DATA · REAL MARKET", 24)}'
            f'<div class="mono" style="margin-top:26px;font-weight:700;font-size:150px;letter-spacing:-.05em;line-height:1;color:#FFB547">~97 of 100</div>'
            f'<div style="margin-top:16px;font-weight:800;font-size:52px;letter-spacing:-.03em;line-height:1.1">launches never leave the curve.</div>'
            f'<div style="margin-top:12px;font-weight:500;font-size:30px;color:#8C94A3">lately, on the biggest solana launchpad. most go quiet.</div></div>'
            f'<div style="position:absolute;left:96px;top:520px;display:grid;grid-template-columns:repeat(10,38px);gap:13px">{dots}</div>'
            f'<div style="position:absolute;left:660px;top:600px;right:80px;font-weight:600;font-size:36px;line-height:1.35">'
            f'<div><span class="mono" style="color:#FFB547;font-weight:700">~3</span> graduate</div>'
            f'<div style="margin-top:14px"><span class="mono" style="color:#8C94A3;font-weight:700">~97</span> never leave the curve</div>'
            f'<div style="margin-top:14px;color:#8C94A3;font-weight:500">not graduating ≠ rugged</div></div>'
            + foot("source: launchpad lifecycle data (secondary) · approximate · high risk · nfa", 22, 96))
    return stage(w, h, body), w, h


def lifecycle():
    w, h = 1200, 675
    stops = [("NEW", 12), ("NEAR GRAD", 50), ("MIGRATED", 88)]
    labels = "".join(f'<div class="mono" style="position:absolute;left:{x}%;top:0;transform:translateX(-50%);font-weight:600;font-size:20px;'
                     f'letter-spacing:.1em;color:{"#22D687" if n == "MIGRATED" else "#E6E9F0"}">{n}</div>' for n, x in stops)
    ticks = "".join(f'<span style="position:absolute;left:{x}%;top:-7px;width:3px;height:32px;background:#0A0C10"></span>' for _, x in stops)
    body = f"""
<div style="position:absolute;left:72px;right:72px;top:56px">{kicker("THE MEMECOIN LIFECYCLE", 20)}
  <div style="margin-top:18px;font-weight:800;font-size:60px;letter-spacing:-.035em;line-height:1">launch, curve, migrate, <em>pray.</em></div></div>
<div style="position:absolute;left:72px;right:72px;top:262px;height:150px">
  <div style="position:absolute;left:0;right:0;top:0;height:30px">{labels}</div>
  <div style="position:absolute;left:0;right:0;top:48px;height:18px;border-radius:9px;background:#1A1E26;overflow:hidden">
    <div style="position:absolute;left:0;top:0;bottom:0;width:76%;background:linear-gradient(90deg,#FFB547 0%,#FFB547 80%,#22D687 100%)"></div>
    <div style="position:absolute;left:76%;top:0;bottom:0;right:0;background:#22D687"></div></div>
  <div style="position:absolute;left:0;right:0;top:48px">{ticks}</div>
  <div class="mono" style="position:absolute;left:0;top:80px;font-size:18px;color:#8C94A3">bonding curve 0%</div>
  <div class="mono" style="position:absolute;right:0;top:80px;font-size:18px;color:#22D687">100% · liquidity → dex pool</div>
</div>
<svg style="position:absolute;left:72px;top:384px" width="1056" height="150" viewBox="0 0 1056 150" fill="none">
  <path d="M 300 0 C 300 70, 200 96, 120 104" stroke="#5C6372" stroke-width="4" stroke-linecap="round"/>
  <path d="M 1000 0 C 1000 70, 940 96, 880 104" stroke="#FF5468" stroke-width="4" stroke-linecap="round"/></svg>
<div style="position:absolute;left:72px;top:500px;font-weight:700;font-size:38px;color:#8C94A3"><span class="mono" style="font-size:26px">most:</span> go quiet</div>
<div style="position:absolute;left:640px;top:500px;width:308px;text-align:right;font-weight:700;font-size:38px;color:#FF5468"><span class="mono" style="font-size:26px">some:</span> rug</div>
""" + foot("high risk · nfa", 18, 72)
    return stage(w, h, body), w, h


DICTS = {
    "dict-smart": (["smart"], [("smart money", ["7-day hit rate. 3+ entries. 60%+ later ran 2x. tested against the chain's base rate.",
                                                 "plus a 55%+ win rate and a 7-day pnl floor per chain.",
                                                 "bots, MEV bots and snipers never qualify."])],
                   "a description, not a tip · high risk · nfa"),
    "dict-fresh-bot": (["fresh", "bot"], [("fresh", ["first funded under 24h ago · in fewer than 15 coins"]),
                                          ("bot", ["200+ trades a day (or 5× the chain's median trader) · median hold under 2 min"])], "high risk · nfa"),
    "dict-kol": (["kol"], [("kol", ["a wallet labelled as belonging to someone with a following.", "the tag says who bought. not why they're posting."])],
                 "high risk · nfa"),
    "dict-whale": (["whale"], [("whale", ["$100k+ native balance or $10k+ average buy"])], "high risk · nfa"),
}


def dict_card(ref):
    w, h = 1080, 1350
    tags, entries, footer = DICTS[ref]
    blocks = ""
    for (name, lines), tag in zip(entries, tags):
        rows = "".join(f'<div style="margin-top:20px;padding-left:22px;border-left:3px solid #2A303B">{x}</div>' for x in lines)
        blocks += (f'<div style="margin-top:{60 if blocks else 0}px"><div style="display:flex;align-items:center;gap:30px">{chip_html(tag, 64)}'
                   f'<div style="font-weight:800;font-size:{(96 if len(name) < 10 else 80) if len(entries) == 1 else 84}px;letter-spacing:-.04em;line-height:1;white-space:nowrap">{name}</div></div>'
                   f'<div style="margin-top:22px;font-weight:600;font-size:{(42 if len(lines) > 1 else 46) if len(entries) > 1 or len(lines) > 2 else 54}px;letter-spacing:-.015em;line-height:1.22">{rows}</div></div>')
    body = (f'<div style="position:absolute;left:92px;right:92px;top:0;bottom:200px;display:flex;flex-direction:column;justify-content:center">'
            f'{kicker("TRENCH DICTIONARY", 26)}<div style="margin-top:56px">{blocks}</div></div>' + foot(footer, 24, 92))
    return stage(w, h, body), w, h


def og():
    w, h = 1200, 630
    body = (f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">'
            f'{svg(HORIZ, "height:96px;width:auto")}'
            f'<div style="margin-top:42px;font-weight:800;font-size:72px;letter-spacing:-.04em">see who\'s <em>really</em> buying.</div>'
            f'<div class="mono" style="margin-top:26px;font-weight:600;font-size:22px;letter-spacing:.08em;color:#E6E9F0;border:1.5px solid #5C6372;'
            f'border-radius:999px;padding:9px 22px">SOL · BASE · BSC · ETH · ROBINHOOD CHAIN</div></div>'
            f'<div class="mono" style="position:absolute;left:0;right:0;bottom:30px;text-align:center;color:#8C94A3;font-size:20px">memecoin trading terminal · self-custody · high risk · nfa</div>')
    return stage(w, h, body, glow="50% 30%"), w, h


def endcard(vertical):
    w, h = (1080, 1920) if vertical else (1920, 1080)
    if vertical:
        lock, tag, chain, dis = 300, 76, 38, (40, 40, 40)
        top, bottom_block = 330, 470
    else:
        lock, tag, chain, dis = 280, 60, 30, (28, 32, 28)
        top, bottom_block = 70, 44
    dis_html = (f'<div style="font-size:{dis[0]}px">AI-generated dramatization. UI shown with demo data.</div>'
                f'<div style="font-size:{dis[1]}px;margin-top:10px;color:#C9CED8">{RISK}</div>'
                f'<div style="font-size:{dis[2]}px;margin-top:10px">{CHAINS_DIS}</div>')
    pad = 72 if vertical else 0
    body = (f'<div style="position:absolute;left:0;right:0;top:{top}px;display:flex;flex-direction:column;align-items:center;text-align:center">'
            f'{svg(STACK, f"height:{lock}px;width:auto")}'
            f'<div style="margin-top:30px;font-weight:600;font-size:{tag}px;letter-spacing:-.02em;color:#FFB547">see who\'s really buying.</div>'
            f'<div class="mono" style="margin-top:22px;font-weight:500;font-size:{chain}px;letter-spacing:.04em;color:#E6E9F0;padding:0 {pad}px">{CHAINS_LINE}</div></div>'
            f'<div style="position:absolute;left:{pad}px;right:{pad + (68 if vertical else 0)}px;bottom:{bottom_block}px;text-align:center;'
            f'color:#8C94A3;font-weight:500;line-height:1.3">{dis_html}</div>')
    return stage(w, h, body, glow="50% 40%"), w, h


def header_main():
    """BRAND_GUIDE §14.4: retouch the glyph string, crop y 40–1096 to 3:1, grade, then the type layer."""
    src = Image.open(f"{M}/x/profile/art/header-art-candle-valley.jpg").convert("RGB")
    # Paint out the hallucinated glyph string (x 1520–1610, y 370–385) with the sky just above it, feathered.
    box = (1500, 360, 1630, 396)
    sky = src.crop((box[0], box[1] - 40, box[2], box[3] - 40))
    mask = Image.new("L", sky.size, 0)
    mask.paste(255, (10, 8, sky.size[0] - 10, sky.size[1] - 8))
    src.paste(sky, box[:2], mask.filter(ImageFilter.GaussianBlur(6)))
    art = src.crop((0, 40, 3168, 1096)).resize((1500, 500), Image.LANCZOS)
    art_path = f"{S}/header-main-art.jpg"
    art.save(art_path, quality=95)
    w, h = 1500, 500
    body = (f'<img src="file://{art_path}" style="position:absolute;inset:0;width:1500px;height:500px">'
            f'<div style="position:absolute;inset:0;background:radial-gradient(ellipse 34% 60% at 82% 46%,rgba(10,12,16,.62),transparent 75%)"></div>'
            f'<div style="position:absolute;left:0;bottom:0;width:420px;height:220px;background:radial-gradient(ellipse at 0% 100%,rgba(10,12,16,.75),transparent 70%)"></div>'
            f'<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px)"></div>'
            f'<div style="position:absolute;right:200px;top:92px;display:flex;flex-direction:column;align-items:flex-end;text-align:right">'
            f'<div class="mono" style="font-weight:600;font-size:20px;letter-spacing:.1em;color:#E6E9F0;border:1.5px solid #8C94A3;border-radius:999px;padding:7px 16px;'
            f'background:rgba(10,12,16,.5)">SOL · BASE · BSC · ETH · ROBINHOOD CHAIN</div>'
            f'<div style="margin-top:20px;font-weight:600;font-size:62px;letter-spacing:-.035em;line-height:1.02;text-shadow:0 4px 24px rgba(0,0,0,.8)">see who\'s<br><em>really</em> buying.</div>'
            f'<div class="mono" style="margin-top:16px;font-weight:600;font-size:22px;color:#C9CED8;text-shadow:0 2px 12px rgba(0,0,0,.9)">the trenches, with a scope.</div></div>'
            f'<div class="mono" style="position:absolute;right:200px;bottom:62px;font-weight:500;font-size:20px;color:rgba(230,233,240,.85);'
            f'background:rgba(10,12,16,.8);border-radius:6px;padding:.4em .8em">AI-generated</div>')
    return (f"<!doctype html><html><head><meta charset=utf-8><style>{CSS % (w, h)}</style></head><body>{body}</body></html>"), w, h


BUILD = {
    "stat-97": (stat97, "x/posts"), "thread-lifecycle": (lifecycle, "x/posts"), "og": (og, "x/posts"),
    "header-main": (header_main, "x/profile"),
    "trailer-endcard-16x9": (lambda: endcard(False), "x/posts"), "trailer-endcard-9x16": (lambda: endcard(True), "x/posts"),
    **{k: ((lambda k=k: dict_card(k)), "x/posts") for k in DICTS},
}

if __name__ == "__main__":
    jobs = []
    for ref in (sys.argv[2:] or list(BUILD)):
        fn, out_dir = BUILD[ref]
        html, w, h = fn()
        hp = f"{S}/{ref}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{M}/{out_dir}/{ref}.png", "width": w, "height": h, "wait": 400})
    json.dump(jobs, open(f"{S}/jobs.json", "w"), indent=1)
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True)
