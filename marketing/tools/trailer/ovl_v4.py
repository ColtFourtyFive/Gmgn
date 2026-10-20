"""Trailer v4 overlay layer (video/SCRIPT.md §5): full-frame 1920x1080 PNGs. Reuses the v3 builders in
tools/trailer_ovl.py and replaces the simulator-era layers (SIM bug, faucet, paper lines) with the v4 set.

Usage: python3 ovl_v4.py out_dir html_dir   (renders with tools/render.mjs)
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
from chips import chip_html  # noqa: E402
from trailer_ovl import (BAR, big_caption, card, label, left_caption, letterbox, lower_third, page, red_word,  # noqa: E402
                         reticle, rich, species)

M = "/home/user/Gmgn/marketing"


def corner(text, side="right"):
    # BRAND_GUIDE §10 corner label, video: top corner, 48 px margin, exact case.
    return page(f'<div class="mono" style="position:absolute;{side}:48px;top:48px;font-weight:500;font-size:26px;color:rgba(230,233,240,.85);'
                f'background:rgba(10,12,16,.92);border-radius:6px;padding:.5em .9em">{text}</div>')


def species_v4(name, latin, tag):
    # §5.1: name 96 px top-left, real chip (rebuilt from the app's WalletTagBadge, tools/chips.py) 24 px right.
    return page(f'<div style="position:absolute;left:200px;top:{BAR + 40}px">'
                f'<div class="mono" style="font-style:italic;font-weight:500;font-size:26px;color:#8C94A3;margin-bottom:12px">{latin}</div>'
                f'<div style="display:flex;align-items:center;gap:24px"><div style="font-weight:900;font-size:96px;letter-spacing:-.03em;line-height:1;'
                f'text-shadow:0 4px 30px rgba(0,0,0,.8)">{name}</div>{chip_html(tag, 40)}</div></div>')


def species_left_v4():
    scrim = ('<div style="position:absolute;left:0;top:0;bottom:0;width:820px;background:linear-gradient(90deg,rgba(10,12,16,.9) 0,'
             'rgba(10,12,16,.75) 520px,rgba(10,12,16,0) 820px)"></div>')
    return page(f'{scrim}<div style="position:absolute;left:80px;top:{BAR + 30}px;max-width:640px">'
                f'<div class="mono" style="font-style:italic;font-weight:500;font-size:26px;color:#8C94A3;margin-bottom:12px">homo fomo</div>'
                f'<div style="font-weight:900;font-size:78px;letter-spacing:-.03em;line-height:.98;text-shadow:0 4px 30px rgba(0,0,0,.85)">THE MOST<br>ENDANGERED<br>SPECIES</div>'
                f'<div style="margin-top:18px">{chip_html("you", 36)}</div></div>')


def mono_note(text, bottom):
    return page(f'<div style="position:absolute;left:0;right:0;bottom:{bottom}px;display:flex;justify-content:center"><div class="mono" '
                f'style="background:rgba(10,12,16,.88);border-radius:6px;padding:4px 14px;color:#AEB4C0;font-weight:500;font-size:24px">{text}</div></div>')


OVERLAYS = {
    "letterbox": letterbox(),
    "ailabel": corner("AI-generated"),
    "demo": corner("UI shown with demo data"),
    "demo-l": corner("UI shown with demo data", "left"),
    "s1-hook": big_caption("everything out here\nwants your *bag.*", size=84),
    "s1-label": label("FIELD GUIDE TO THE TRENCHES · EP.01", y=(BAR - 30) // 2),
    "s1-reticle": reticle(885, 262, 240),
    "s1-chip": page(f'<div style="position:absolute;left:1025px;top:236px">{chip_html("whale", 30)}</div>'),
    "s2-cap": big_caption("so we built a *scope.*", size=88),
    "s3-a": lower_third("one habitat.", y_bottom=BAR + 40),
    "s3-b": lower_third("one habitat. *five chains.*", y_bottom=BAR + 40),
    "s3-b4": lower_third("one habitat. *four chains.*", y_bottom=BAR + 40),
    "s3-c": lower_third("one *terminal.*"),
    "s4-card": species_v4("THE SNIPER", "emptor primus", "sniper"),
    "s4-sub": lower_third("in before you blinked.", y_bottom=BAR + 40),
    "s5-card": species_v4("THE BUNDLER", "fasciculus unanimus", "bundler"),
    "s5-sub": lower_third("six wallets. one trench coat.", y_bottom=BAR + 40),
    "s6-card": species_v4("THE INSIDER", "amicus devi", "insider"),
    "s6-sub": lower_third('already inside. "just a believer."', y_bottom=BAR + 40),
    "s7-card": species_v4("THE DEV", "creator fugiens", "dev"),
    "s7-sub": lower_third("holding the rug.", y_bottom=BAR + 40),
    "s8-cap": lower_third("receipts. on every token."),
    "s9-card": card("so naturally, you…"),
    "s10-card": species_left_v4(),
    "s10-sub": left_caption("reads the warning.\n*buys anyway.*", 560, size=54),
    "s11-cap": big_caption("nature is not kind to late buyers.", size=72),
    "s12-red": red_word("DEV SELL."),
    "s12-cap": lower_third("your exit fired *right after.*"),
    "s12-note": mono_note("dev-sell exit · reacts after the dev sells", 50),
    "s13-a": left_caption("or.", 330),
    "s13-b": left_caption("look before you *ape.*", 450),
}

if __name__ == "__main__":
    out, html_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    os.makedirs(html_dir, exist_ok=True)
    jobs = []
    for k, v in OVERLAYS.items():
        hp = os.path.join(html_dir, f"{k}.html")
        open(hp, "w").write(v)
        jobs.append({"src": hp, "out": os.path.join(out, f"{k}.png"), "width": 1920, "height": 1080, "transparent": k != "s9-card", "wait": 250})
    json.dump(jobs, open(os.path.join(html_dir, "jobs.json"), "w"))
    subprocess.run(["node", f"{M}/tools/render.mjs", os.path.join(html_dir, "jobs.json")], check=True, stdout=subprocess.DEVNULL)
    print(len(jobs), "v4 overlays")
