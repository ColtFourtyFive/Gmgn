"""Trailer overlay layer (SCRIPT.md §5, §9): full-frame 1920x1080 PNGs.

Usage: python3 trailer_ovl.py out_dir html_dir jobs.json
"""
import html
import json
import os
import sys

ROOT = "/home/user/Gmgn/marketing"
LOGO = f"{ROOT}/brand/logo"
CHIPS = f"{ROOT}/video/overlays/chips"
STACK = open(f"{LOGO}/lockup-stacked-dark.svg").read()
W, H = 1920, 1080
BAR = 138  # 2.39:1 letterbox inside 16:9
RETICLE = ('<svg viewBox="0 0 32 32" style="width:100%;height:100%;overflow:visible">'
           '<circle cx="16" cy="16" r="9" fill="none" stroke="#FFB547" stroke-width="1.6" opacity=".85"/>'
           '<path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5" stroke="#FFB547" stroke-width="1.6" stroke-linecap="round" opacity=".85"/></svg>')


def rich(s, color="#FFB547"):
    out = html.escape(s or "")
    parts = out.split("*")
    return "".join(p if i % 2 == 0 else f'<span style="color:{color}">{p}</span>' for i, p in enumerate(parts)).replace("\n", "<br>")


def page(body, opaque=False):
    bg = "#0A0C10" if opaque else "transparent"
    grain = ('<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.022) 0 1px,transparent 1px 3px)"></div>' if opaque else "")
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box}}'
            f'html,body{{width:{W}px;height:{H}px;overflow:hidden;background:{bg}}}body{{font-family:Inter,sans-serif;color:#E6E9F0;-webkit-font-smoothing:antialiased}}'
            f'.mono{{font-family:"JetBrains Mono",monospace}}</style></head><body>{grain}{body}</body></html>')


def letterbox():
    return page(f'<div style="position:absolute;left:0;right:0;top:0;height:{BAR}px;background:#050608"></div>'
                f'<div style="position:absolute;left:0;right:0;bottom:0;height:{BAR}px;background:#050608"></div>')


def simbug():
    return page('<div class="mono" style="position:absolute;right:48px;top:44px;background:rgba(10,12,16,.8);border:1.5px solid #FFB547;color:#FFB547;'
                'font-weight:600;font-size:26px;letter-spacing:.08em;padding:10px 18px;border-radius:999px">SIM · PAPER TRADING</div>')


def label(text, y=BAR + 34):
    return page(f'<div class="mono" style="position:absolute;left:200px;top:{y}px;color:#8C94A3;font-weight:500;font-size:24px;letter-spacing:.16em">{html.escape(text)}</div>')


def big_caption(text, y_bottom=BAR + 70, size=78):
    return page(f'<div style="position:absolute;left:0;right:0;bottom:{y_bottom}px;text-align:center;font-weight:900;font-size:{size}px;letter-spacing:-.035em;'
                f'line-height:1.02;text-shadow:0 4px 30px rgba(0,0,0,.85)">{rich(text)}</div>')


def lower_third(text, y_bottom=96, size=52):
    return page(f'<div style="position:absolute;left:0;right:0;bottom:{y_bottom}px;display:flex;justify-content:center">'
                f'<div style="background:rgba(10,12,16,.78);border-radius:12px;padding:12px 26px;font-weight:700;font-size:{size}px;letter-spacing:-.025em">{rich(text)}</div></div>')


def reticle(x, y, size=220):
    return page(f'<div style="position:absolute;left:{x - size/2}px;top:{y - size/2}px;width:{size}px;height:{size}px;filter:drop-shadow(0 0 14px rgba(255,181,71,.6))">{RETICLE}</div>')


def chip_at(tag, x, y, h=76):
    return page(f'<img src="file://{CHIPS}/{tag}.png" style="position:absolute;left:{x}px;top:{y}px;height:{h}px">')


def species(name, latin, tag, top=BAR + 40, left=200):
    return page(f'<div style="position:absolute;left:{left}px;top:{top}px">'
                f'<div class="mono" style="font-style:italic;font-weight:500;font-size:26px;color:#8C94A3;margin-bottom:12px">{html.escape(latin)}</div>'
                f'<div style="display:flex;align-items:center;gap:24px"><div style="font-weight:900;font-size:96px;letter-spacing:-.03em;line-height:1;text-shadow:0 4px 30px rgba(0,0,0,.8)">{html.escape(name)}</div>'
                f'<img src="file://{CHIPS}/{tag}.png" style="height:76px"></div></div>')


def species_left(lines, latin, tag, top=BAR + 30, left=80, size=78):
    name = "<br>".join(html.escape(l) for l in lines)
    return page(f'<div style="position:absolute;left:{left}px;top:{top}px;max-width:640px">'
                f'<div class="mono" style="font-style:italic;font-weight:500;font-size:26px;color:#8C94A3;margin-bottom:12px">{html.escape(latin)}</div>'
                f'<div style="font-weight:900;font-size:{size}px;letter-spacing:-.03em;line-height:.98;text-shadow:0 4px 30px rgba(0,0,0,.85)">{name}</div>'
                f'<img src="file://{CHIPS}/{tag}.png" style="height:76px;margin-top:18px"></div>')


def left_caption(text, top, size=92, color=None):
    c = f"color:{color};" if color else ""
    return page(f'<div style="position:absolute;left:150px;top:{top}px;font-weight:900;font-size:{size}px;letter-spacing:-.035em;line-height:1.02;{c}text-shadow:0 4px 30px rgba(0,0,0,.85)">{rich(text)}</div>')


def left_note(text, top):
    return page(f'<div class="mono" style="position:absolute;left:154px;top:{top}px;color:#8C94A3;font-weight:600;font-size:24px;letter-spacing:.05em">{html.escape(text)}</div>')


def card(text, size=110):
    return page(f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:900;font-size:{size}px;letter-spacing:-.04em">{rich(text)}</div>', opaque=True)


def red_word(text, x=None):
    return page(f'<div style="position:absolute;left:0;right:0;top:300px;text-align:center;font-weight:900;font-size:150px;letter-spacing:-.03em;color:#FF5468;text-shadow:0 6px 40px rgba(0,0,0,.85)">{html.escape(text)}</div>')


def mono_note(text, y_bottom=BAR + 30):
    return page(f'<div class="mono" style="position:absolute;left:0;right:0;bottom:{y_bottom}px;text-align:center;color:#8C94A3;font-weight:600;font-size:26px;letter-spacing:.06em">{html.escape(text)}</div>')


def lock(end=False):
    lock_svg = STACK.replace("<svg ", '<svg style="height:300px;width:auto" ')
    extra = ""
    if end:
        extra = ('<div style="margin-top:26px;font-weight:500;font-size:34px;color:#E6E9F0">no real bags were harmed in the making of this film.</div>'
                 '<div class="mono" style="margin-top:14px;font-weight:500;font-size:30px;color:#FFB547">@trenchscope</div>')
    dis = ('<div style="position:absolute;left:0;right:0;bottom:44px;text-align:center;color:#8C94A3;font-weight:500;font-size:26px;line-height:1.45">'
           'AI-generated dramatization. Fictional people, tokens and events.<br>'
           'Trenchscope is a simulated market with paper trading only. No real funds. No token. Not financial advice.'
           + ('<div style="font-size:22px;margin-top:6px;color:#5C6372">not affiliated with any chain, launchpad or trading platform.</div>' if end else '')
           + '</div>')
    body = (f'<div style="position:absolute;left:0;right:0;top:{90 if end else 130}px;display:flex;flex-direction:column;align-items:center;text-align:center">{lock_svg}'
            '<div style="margin-top:22px;font-weight:600;font-size:56px;letter-spacing:-.02em;color:#FFB547">larp the trenches.</div>'
            '<div class="mono" style="margin-top:22px;border:1.5px solid #FFB547;border-radius:999px;padding:10px 22px;font-weight:600;font-size:24px;letter-spacing:.06em;color:#E6E9F0">PAPER TRADING · SIMULATED MARKET · NO TOKEN · NFA</div>'
            f'{extra}</div>{dis}')
    return page(body, opaque=True)


def ai_tag():
    return page(f'<div class="mono" style="position:absolute;right:48px;bottom:{BAR + 22}px;color:rgba(230,233,240,.55);font-weight:600;font-size:18px;letter-spacing:.12em">AI-GENERATED · DRAMATIZED</div>')


def blur_box(x, y, w, h):
    # A frosted plate to hide a generated ticker (ffmpeg can't blur per-region here).
    return page(f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:rgba(17,20,26,.92);border-radius:6px;'
                f'box-shadow:0 0 0 1px rgba(255,181,71,.25)"></div>')


OVERLAYS = {
    "letterbox": letterbox(),
    "simbug": simbug(),
    "aitag": ai_tag(),
    "s1-hook": big_caption("everything out here\nwants your *bag.*", size=84),
    "s1-label": label("FIELD GUIDE TO THE TRENCHES · EP.01"),
    "s1-reticle": reticle(810, 250, 240),
    "s1-chip": chip_at("whale", 950, 214),
    "s2-cap": big_caption("so we built a *scope.*", size=88),
    "s3-a": lower_third("filmed on location."),
    "s3-b": lower_third("the location is a *simulator.*"),
    "s4-card": species("THE SNIPER", "emptor primus", "sniper"),
    "s4-sub": lower_third("in before you blinked.", y_bottom=BAR + 40),
    "s5-card": species("THE BUNDLER", "fasciculus unanimus", "bundler"),
    "s5-sub": lower_third("one guy. six wallets. same block.", y_bottom=BAR + 40),
    "s6-card": species("THE INSIDER", "amicus devi", "insider"),
    "s6-sub": lower_third('already inside. "just a believer."', y_bottom=BAR + 40),
    "s7-card": species("THE DEV", "creator fugiens", "dev"),
    "s7-sub": lower_third("holding the rug.", y_bottom=BAR + 40),
    "s8-cap": lower_third("receipts. on every token."),
    "s9-card": card("so naturally, you…"),
    "s10-card": species_left(["THE MOST", "ENDANGERED", "SPECIES"], "homo fomo", "you"),
    "s10-sub": lower_third("reads the warning. *buys anyway.*"),
    "s11-cap": big_caption("nature is not kind to late buyers.", size=72),
    "s12-red": red_word("DEV SELL."),
    "s12-cap": lower_third("rug: real-feeling. money: *fake.*"),
    "s13-a": left_caption("relax.\nit's *paper.*", 330),
    "s13-b": left_caption("*respawn.*", 540),
    "s13-note": left_note("paper faucet · refills once a minute per chain", 650),
    "lock": lock(False),
    "end": lock(True),
}


def build(out_dir, html_dir, jobs_path, extra=None):
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(html_dir, exist_ok=True)
    items = dict(OVERLAYS)
    items.update(extra or {})
    jobs = []
    for k, v in items.items():
        hp = os.path.join(html_dir, f"{k}.html")
        open(hp, "w").write(v)
        opaque = k in ("s9-card", "lock", "end")
        jobs.append({"src": hp, "out": os.path.join(out_dir, f"{k}.png"), "width": W, "height": H, "transparent": not opaque, "wait": 250})
    json.dump(jobs, open(jobs_path, "w"), indent=1)
    print(len(jobs), "trailer overlays")


if __name__ == "__main__":
    extra = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
    build(sys.argv[1], sys.argv[2], sys.argv[3], extra)
