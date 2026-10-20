"""Full-frame overlay and card PNGs for video edits (rendered by render.mjs).

Usage: python3 ovl.py overlays.json html_dir jobs.json
Item: {id, out, kind, text, sub, w=1920, h=1080}
kinds (transparent unless noted):
  simbug    top-right "SIM · PAPER TRADING" stamp
  caption   lower-centre caption pill (text may use *amber* emphasis)
  title     big top-left title with a kicker (sub)
  keycap    bottom-left key press (text = key label)
  card      OPAQUE typographic card, centred (text, optional sub)
  endslate  OPAQUE end card: stacked lockup, text line, sub disclaimer
  aitag     small bottom-left "AI-GENERATED · DRAMATIZED" tag
"""
import html
import json
import os
import sys

LOGO = "/home/user/Gmgn/marketing/brand/logo"
MARK = open(f"{LOGO}/mark-dark.svg").read()
STACK = open(f"{LOGO}/lockup-stacked-dark.svg").read()


def rich(s):
    out = html.escape(s or "")
    parts = out.split("*")
    out = "".join(p if i % 2 == 0 else f'<span style="color:#FFB547">{p}</span>' for i, p in enumerate(parts))
    return out.replace("\n", "<br>")


def page(w, h, body, opaque=False):
    bg = "#0A0C10" if opaque else "transparent"
    extra = ""
    if opaque:
        extra = ('<div style="position:absolute;inset:0;background:radial-gradient(ellipse 50% 60% at 50% 45%,rgba(255,181,71,.10),transparent 70%)"></div>'
                 '<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px)"></div>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box}}'
            f'html,body{{width:{w}px;height:{h}px;overflow:hidden;background:{bg}}}'
            f'body{{font-family:Inter,sans-serif;color:#E6E9F0;-webkit-font-smoothing:antialiased}}.mono{{font-family:"JetBrains Mono",monospace}}</style></head>'
            f'<body>{extra}{body}</body></html>')


def build(item):
    w, h = item.get("w", 1920), item.get("h", 1080)
    k = item["kind"]
    u = min(w, h)
    t, sub = item.get("text", ""), item.get("sub", "")
    if k == "simbug":
        body = (f'<div class="mono" style="position:absolute;right:{int(u*0.035)}px;top:{int(u*0.035)}px;background:rgba(10,12,16,.78);border:2px solid #FFB547;'
                f'color:#FFB547;font-weight:700;font-size:{int(u*0.024)}px;letter-spacing:.1em;padding:.45em .8em;border-radius:8px">SIM · PAPER TRADING</div>')
        return page(w, h, body), False
    if k == "aitag":
        body = (f'<div class="mono" style="position:absolute;left:{int(u*0.035)}px;bottom:{int(u*0.035)}px;color:rgba(230,233,240,.72);font-weight:600;'
                f'font-size:{int(u*0.02)}px;letter-spacing:.1em">{html.escape(t or "AI-GENERATED · DRAMATIZED")}</div>')
        return page(w, h, body), False
    if k == "caption":
        pos = item.get("pos", "bottom")
        y = f"bottom:{int(h*0.09)}px" if pos == "bottom" else f"top:{int(h*0.12)}px"
        body = (f'<div style="position:absolute;left:0;right:0;{y};display:flex;justify-content:center">'
                f'<div style="max-width:{int(w*0.86)}px;text-align:center;background:rgba(10,12,16,.84);border:1px solid rgba(255,181,71,.35);border-radius:14px;'
                f'padding:.35em .7em;font-weight:800;font-size:{int(u*0.058)}px;letter-spacing:-.03em;line-height:1.1">{rich(t)}</div></div>')
        return page(w, h, body), False
    if k == "title":
        body = (f'<div style="position:absolute;left:{int(w*0.05)}px;top:{int(h*0.08)}px;background:rgba(10,12,16,.86);border-left:6px solid #FFB547;padding:.5em .8em;border-radius:6px">'
                f'<div class="mono" style="color:#FFB547;font-weight:700;font-size:{int(u*0.024)}px;letter-spacing:.14em;text-transform:uppercase">{html.escape(sub)}</div>'
                f'<div style="font-weight:800;font-size:{int(u*0.085)}px;letter-spacing:-.035em;line-height:1.05;margin-top:.15em">{rich(t)}</div></div>')
        return page(w, h, body), False
    if k == "keycap":
        body = (f'<div class="mono" style="position:absolute;left:{int(w*0.05)}px;bottom:{int(h*0.1)}px;min-width:{int(u*0.11)}px;text-align:center;'
                f'background:#11141A;border:3px solid #FFB547;border-bottom-width:8px;border-radius:14px;padding:.25em .5em;color:#FFB547;font-weight:800;'
                f'font-size:{int(u*0.07)}px;box-shadow:0 0 40px rgba(255,181,71,.45)">{html.escape(t)}</div>')
        return page(w, h, body), False
    if k == "card":
        size = item.get("size", 0.1)
        color = item.get("color", "#F4F6FA")
        body = (f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 {int(w*0.08)}px">'
                f'<div style="font-weight:900;font-size:{int(u*size)}px;letter-spacing:-.04em;line-height:1.02;color:{color}">{rich(t)}</div>'
                + (f'<div class="mono" style="margin-top:{int(u*0.03)}px;color:#8C94A3;font-weight:600;font-size:{int(u*0.028)}px;letter-spacing:.08em">{rich(sub)}</div>' if sub else "")
                + "</div>")
        return page(w, h, body, opaque=True), True
    if k == "endslate":
        lock = STACK.replace("<svg ", f'<svg style="height:{int(u*0.3)}px;width:auto" ')
        body = (f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">{lock}'
                f'<div style="margin-top:{int(u*0.04)}px;font-weight:600;font-size:{int(u*0.05)}px;letter-spacing:-.02em;color:#FFB547">{rich(t)}</div>'
                f'<div class="mono" style="margin-top:{int(u*0.035)}px;max-width:{int(w*0.8)}px;color:#8C94A3;font-weight:500;font-size:{int(u*0.021)}px;line-height:1.5;letter-spacing:.02em">{rich(sub)}</div></div>')
        return page(w, h, body, opaque=True), True
    raise SystemExit(f"unknown kind {k}")


if __name__ == "__main__":
    items = json.load(open(sys.argv[1]))
    hd = sys.argv[2]
    os.makedirs(hd, exist_ok=True)
    jobs = []
    for it in items:
        html_s, opaque = build(it)
        p = os.path.join(hd, it["id"] + ".html")
        open(p, "w").write(html_s)
        jobs.append({"src": p, "out": it["out"], "width": it.get("w", 1920), "height": it.get("h", 1080), "transparent": not opaque, "wait": 200})
    json.dump(jobs, open(sys.argv[3], "w"), indent=1)
    print(len(jobs), "overlays")
