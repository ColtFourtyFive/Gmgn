"""Frame the launch-day captures (capture_launch2.mjs -> screens/live/l-*.png) into posts, LAUNCH_DAY §10:
launch-4 (T3), launch-5 (T4), launch-6 (T5), launch-7 (T6), launch-9 (T8) and launch-17 (L2-C). Same frame and helpers as
tools/stills/frame_posts2.py. Crops are CSS px of the 2x page shots; positions inside a panel were read off that capture.

Usage: python3 frame_launch.py scratch_dir [launch-4 launch-5 launch-6 launch-7 launch-9 launch-17]
"""
import importlib.util
import json
import os
import subprocess
import sys

M = "/home/user/Gmgn/marketing"
S = sys.argv[1]
refs = sys.argv[2:]
_spec = importlib.util.spec_from_file_location("frame_posts2", f"{M}/tools/stills/frame_posts2.py")
fp = importlib.util.module_from_spec(_spec)
sys.argv = [sys.argv[0], S]
_spec.loader.exec_module(fp)
cards, header, shot, rings, cut, note, foot, demo_label, AMBER = (fp.cards, fp.header, fp.shot, fp.rings, fp.cut, fp.note, fp.foot,
                                                                fp.demo_label, fp.AMBER)
L = json.load(open(f"{M}/screens/live/launch2.json"))


def pill(text, x, y, px=24):
    return (f'<div style="position:absolute;left:{x:.0f}px;top:{y:.0f}px;background:{AMBER};color:#0A0C10;font-weight:700;font-size:{px}px;'
            f'padding:6px 14px;border-radius:8px;white-space:nowrap">{text}</div>')


def launch4():
    # T3: the audit card above the Holders tab with the Funded by column (two slices of the same rows).
    w, h = 1080, 1350
    audit = cut("l-audit", "l4-audit", *L["audit"]["panel"])
    ty, th = 615, 290
    left = cut("l-holders", "l4-left", 16, ty, 314, th)
    right = cut("l-holders", "l4-right", 1316, ty, 240, th)
    ka, kt = 1.6, 1.42
    ax, ay = (w - 340 * ka) / 2, 222
    tx, tyy = 80, ay + 308 * ka + 64
    rx = tx + 314 * kt + 46
    shared = [[8, r - ty - 11, 80, 22] for r in (690, 729, 765, 840, 879)]   # rows first funded by the same wallet
    body = (header("stop 3: the audit.", "a reference, not a verdict.", 80, 66, "LAUNCH · STOP 3")
            + shot(audit, ax, ay, ka / 2) + rings(ax, ay, ka / 2, [[6, 84, 328, 166]])
            + pill("6 red rows", ax + 340 * ka - 150, ay - 46)
            + shot(left, tx, tyy, kt / 2)
            + f'<div class="mono" style="position:absolute;left:{rx - 38:.0f}px;top:{tyy + th * kt / 2 - 18:.0f}px;color:#5C6372;font-size:28px">···</div>'
            + shot(right, rx, tyy, kt / 2) + rings(rx, tyy, kt / 2, shared)
            + pill("who paid for whose gas", rx, tyy - 46)
            + foot(80))
    return cards.stage(w, h, body), w, h


def launch5():
    # T4: the dialog over the trade panel, the token's red audit card behind it.
    w, h = 1200, 1200
    r = L["risk"]
    dlg = cut("l-risk", "l5-dialog", *r["dialog"])
    aud = cut("l-risk", "l5-audit", *r["audit"])
    kd, ka = 1.7, 1.3
    dx, dy = 70, 250
    rs = r["reasons"]
    body = (header('the "you sure?" box.', "red flags first. buy anyway second.", 80, 70, "LAUNCH · STOP 4")
            + shot(aud, 700, 640, ka / 2)
            + shot(dlg, dx, dy, kd / 2) + rings(dx, dy, kd / 2, [[rs[0] - r["dialog"][0], rs[1] - r["dialog"][1], rs[2], rs[3]]])
            + pill('the "you sure?" box', 760, 300)
            + note('"buy anyway" stays locked<br>until you tick the box.', 760, 370, 28)
            + note("the token's audit, behind it.", 700, 640 + 308 * ka + 18, 22)
            + foot(80))
    return cards.stage(w, h, body), w, h


def launch6():
    # T5: the exit lines on the chart (right side, with their labels) above the Orders tab's open exits.
    w, h = 1200, 1200
    e = L["exits"]
    chart = cut("l-exits", "l6-chart", 1000, 300, 556, 230)
    oy = 840
    orders = cut("l-exits", "l6-orders", 16, oy, 760, 196)
    kc, ko = 1.9, 1.42
    cy = 240
    oyy = cy + 230 * kc + 60
    dev = e["devRow"]
    body = (header("stop 5: exits.", "set on the buy. a scope, not a time machine.", 80, 70, "LAUNCH · STOP 5")
            + shot(chart, 80, cy, kc / 2)
            + note("avg buy, trailing stop and stop loss, drawn on the chart.", 80, cy + 230 * kc + 12, 22)
            + shot(orders, 80, oyy, ko / 2) + rings(80, oyy, ko / 2, [[2, dev[1] - oy, 740, dev[3]]])
            + pill("dev-sell exit", 80 + 760 * ko - 190, oyy - 46)
            + foot(80))
    return cards.stage(w, h, body), w, h


def launch7():
    # T6: the full quote before confirming, impact in red; the Fees value blurred (simulator placeholder rate).
    w, h = 1200, 1200
    panel = cut("l-bill", "l7-panel", 1564, 64, 340, 430)
    k = 1.95
    px, py = w - 80 - 340 * k, 240
    body = (header("the bill, before the meal.", "", 80, 66, "LAUNCH · STOP 6")
            + shot(panel, px, py, k / 2, blurs=[(202, 297, 122, 20)]) + rings(px, py, k / 2, [[6, 254, 328, 22]])
            + pill("price impact", 80, py + 254 * k - 4)
            + note("amber past 3%.<br>red past 10%.", 80, py + 254 * k + 56, 30)
            + note("you receive, min received,<br>exec. price, fees, route:<br>all before you confirm.", 80, py + 120, 26)
            + note("your pnl counts the fees.<br>rude, but accurate.", 80, py + 254 * k + 190, 26)
            + foot(80))
    return cards.stage(w, h, body), w, h


def launch9():
    # T8: copy-trade task, migration sniper, Signals cards, Hot by smart money (task footers and the target's PnL cropped).
    w, h = 1600, 900
    copy = cut("l-copy", "l9-copy", 136, 185, 540, 262)
    snipe = cut("l-sniper", "l9-snipe", 136, 185, 540, 252)
    sig = cut("l-signals", "l9-signals", 77, 241, 876, 230)
    hot = cut("l-monitor", "l9-hot", 1505, 118, 338, 440)
    lab = lambda t, x, y: f'<div class="mono" style="position:absolute;left:{x:.0f}px;top:{y:.0f}px;color:#FFB547;font-weight:600;font-size:20px;letter-spacing:.12em">{t}</div>'
    body = (f'<div style="position:absolute;left:70px;top:44px">{cards.kicker("LAUNCH · STOP 8", 20)}'
            f'<div style="margin-top:14px;font-weight:800;font-size:54px;letter-spacing:-.035em;line-height:1">the surveillance wing.</div>'
            f'<div class="mono" style="margin-top:10px;font-size:22px;color:#C9CED8">copy · snipe · signals · monitor</div></div>'
            + lab("COPY", 70, 216) + shot(copy, 70, 244, 0.5)
            + lab("SNIPE", 660, 216) + shot(snipe, 660, 244, 0.5)
            + lab("SIGNALS", 70, 548) + shot(sig, 70, 576, 0.5)
            + lab("MONITOR", 1270, 216) + shot(hot, 1270, 244, 0.5 * 0.88)
            + f'<div style="position:absolute;right:70px;bottom:40px">{cards.wordmark(26)}</div>'
            + '<div class="mono" style="position:absolute;right:70px;top:48px;font-weight:500;font-size:20px;color:rgba(230,233,240,.85);'
              'background:rgba(10,12,16,.85);border:1px solid #222731;border-radius:6px;padding:.5em .9em">UI shown with demo data</div>'
            + '<div class="mono" style="position:absolute;left:1000px;bottom:44px;color:#8C94A3;font-size:20px">high risk · nfa</div>')
    return cards.stage(w, h, body), w, h


def launch17():
    # L2-C: the holder strip with Bundlers and Insiders red.
    w, h = 1200, 1200
    strip = cut("l-strip", "l17-strip", *L["strip"]["panel"])
    k = 2.8
    x, y = (w - 340 * k) / 2, 380
    body = (f'<div style="position:absolute;left:80px;right:80px;top:96px;font-weight:900;font-size:76px;letter-spacing:-.04em;line-height:1.04">'
            f'pov: you read the chart.<br><em>the bundlers read you.</em></div>'
            + shot(strip, x, y, k / 2) + rings(x, y, k / 2, [[13, 74, 90, 24], [195, 74, 95, 24]])
            + foot(80))
    return cards.stage(w, h, body), w, h


BUILD = {"launch-4": launch4, "launch-5": launch5, "launch-6": launch6, "launch-7": launch7, "launch-9": launch9, "launch-17": launch17}

if __name__ == "__main__":
    jobs = []
    for ref in (refs or list(BUILD)):
        html, w, h = BUILD[ref]()
        hp = f"{S}/{ref}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{M}/x/posts/launch/{ref}.png", "width": w, "height": h, "wait": 500})
    json.dump(jobs, open(f"{S}/jobs.json", "w"), indent=1)
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True, stdout=subprocess.DEVNULL)
    print("built", [j["out"].split("/")[-1] for j in jobs])
