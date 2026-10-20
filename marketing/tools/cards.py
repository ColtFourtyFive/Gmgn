"""Build branded social cards (HTML) from the graphics spec, then render to PNG.

Usage: python3 cards.py spec.json out_html_dir jobs.json
Each spec item: ref, file, width, height, template, headline, subhead, body,
data[{label,value,tone}], footer, used_in, art (optional local bg image path).
"""
import html
import json
import os
import sys

LOGO = "/home/user/Gmgn/marketing/brand/logo"
MARK = open(f"{LOGO}/mark-dark.svg").read()
TONES = {
    "up": "#22D687", "down": "#FF5468", "warn": "#FFC107", "accent": "#FFB547", "info": "#5CA4FF",
    "smart": "#4ADE80", "kol": "#C084FC", "dev": "#FB923C", "sniper": "#F87171", "insider": "#F472B6",
    "bundler": "#FACC15", "whale": "#38BDF8", "fresh": "#2DD4BF", "bot": "#94A3B8", "muted": "#8C94A3",
}

BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:%(w)dpx;height:%(h)dpx;overflow:hidden;background:#0A0C10}
body{font-family:'Inter','Inter Display',system-ui,sans-serif;color:#E6E9F0;-webkit-font-smoothing:antialiased;font-feature-settings:'cv11','ss01','tnum'}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.stage{position:relative;width:100%%;height:100%%;overflow:hidden;background:
  radial-gradient(ellipse 60%% 70%% at 88%% 8%%, rgba(255,181,71,.16), transparent 60%%),
  radial-gradient(ellipse 50%% 60%% at 5%% 105%%, rgba(255,181,71,.07), transparent 60%%),
  #0A0C10}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(140,148,163,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(140,148,163,.07) 1px,transparent 1px);background-size:%(g)dpx %(g)dpx;mask-image:radial-gradient(ellipse 80%% 80%% at 50%% 40%%,#000 40%%,transparent 100%%)}
.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px);pointer-events:none}
.art{position:absolute;inset:0;background-size:cover;background-position:center}
.art::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,12,16,.92) 0%%,rgba(10,12,16,.55) 55%%,rgba(10,12,16,.25) 100%%)}
.corner{position:absolute;width:%(c)dpx;height:%(c)dpx;border-color:#FFB547;border-style:solid;opacity:.9}
.tl{top:%(m)dpx;left:%(m)dpx;border-width:3px 0 0 3px}.tr{top:%(m)dpx;right:%(m)dpx;border-width:3px 3px 0 0}
.bl{bottom:%(m)dpx;left:%(m)dpx;border-width:0 0 3px 3px}.br{bottom:%(m)dpx;right:%(m)dpx;border-width:0 3px 3px 0}
.content{position:absolute;inset:%(p)dpx;display:flex;flex-direction:column}
.kicker{font-family:'JetBrains Mono',monospace;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#FFB547;font-size:%(k)dpx;display:flex;align-items:center;gap:.6em}
.kicker .dot{width:.55em;height:.55em;border-radius:50%%;background:#FFB547;box-shadow:0 0 12px #FFB547}
.headline{font-weight:800;letter-spacing:-.035em;line-height:1.02;color:#F4F6FA}
.headline em{font-style:normal;color:#FFB547}
.sub{color:#8C94A3;font-weight:500;line-height:1.35}
.foot{position:absolute;left:%(p)dpx;right:%(p)dpx;bottom:%(fb)dpx;display:flex;align-items:center;justify-content:space-between;gap:24px;font-family:'JetBrains Mono',monospace;color:#5C6372;font-size:%(f)dpx}
.brand{display:flex;align-items:center;gap:.5em;color:#E6E9F0;font-family:'Inter',sans-serif;font-weight:700;letter-spacing:-.02em;font-size:%(bf)dpx;white-space:nowrap}
.brand svg{width:1.45em;height:1.45em}
.brand b{color:#FFB547;font-weight:700}
.chip{display:inline-flex;align-items:center;gap:.4em;border-radius:8px;padding:.28em .6em;font-family:'JetBrains Mono',monospace;font-weight:600}
.rows{display:flex;flex-direction:column;gap:%(rg)dpx}
.row{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #222731;padding-bottom:%(rp)dpx}
.row .l{color:#8C94A3}.row .v{font-family:'JetBrains Mono',monospace;font-weight:600}
.sim{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.sim span{transform:rotate(-18deg);font-family:'JetBrains Mono',monospace;font-weight:800;letter-spacing:.2em;color:rgba(255,181,71,.10);font-size:%(simf)dpx;white-space:nowrap}
.fit{display:block}
em{font-style:normal;color:#FFB547}
"""

FIT_JS = """
<script>
// Shrink any .fit element until it fits its box (max 40 steps).
function fit(){document.querySelectorAll('[data-fit]').forEach(el=>{
  const box=el.closest('[data-box]')||el.parentElement; let s=parseFloat(getComputedStyle(el).fontSize);
  for(let i=0;i<60&&(el.scrollWidth>el.clientWidth+1||box.scrollHeight>box.clientHeight+1);i++){s*=0.96;el.style.fontSize=s+'px'}
});}
document.fonts.ready.then(fit);
</script>
"""


def esc(s):
    return html.escape(s or "")


def rich(s):
    """*word* -> amber emphasis; newlines -> <br>."""
    out = esc(s)
    parts = out.split("*")
    out = "".join(p if i % 2 == 0 else f"<em>{p}</em>" for i, p in enumerate(parts))
    return out.replace("\n", "<br>")


def tone(t):
    return TONES.get((t or "").lower(), "#E6E9F0")


def frame(g, body, w, h, art=None, sim=False):
    u = min(w, h)
    p = max(40, int(u * 0.085))
    vars_ = dict(w=w, h=h, g=max(24, int(u / 14)), c=max(18, int(u * 0.045)), m=max(16, int(u * 0.035)), p=p,
                 k=max(14, int(u * 0.03)), f=max(13, int(u * 0.024)), bf=max(16, int(u * 0.034)), fb=max(22, int(u * 0.05)),
                 rg=max(8, int(u * 0.018)), rp=max(6, int(u * 0.012)), simf=int(u * 0.11))
    css = BASE_CSS % vars_
    art_div = f'<div class="art" style="background-image:url(\'file://{art}\')"></div>' if art else ""
    sim_div = '<div class="sim"><span>SIMULATED · PAPER</span></div>' if sim else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body><div class="stage">{art_div}<div class="grid"></div><div class="scan"></div>{sim_div}
<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
{body}</div>{FIT_JS}</body></html>"""


def brand_html():
    return f'<div class="brand">{MARK}<span>Trench<b>scope</b></span></div>'


def foot(g, w, h):
    text = esc(g.get("footer") or "")
    return f'<div class="foot"><span style="max-width:62%">{text}</span>{brand_html()}</div>'


def t_stat(g, w, h):
    u = min(w, h)
    big = esc(g["headline"])
    rows = "".join(
        f'<div class="row" style="font-size:{int(u*0.036)}px"><span class="l">{esc(d["label"])}</span><span class="v" style="color:{tone(d.get("tone"))}">{esc(d["value"])}</span></div>'
        for d in g.get("data") or []
    )
    body = f"""<div class="content" data-box style="bottom:{int(u*0.16)}px">
<div class="kicker"><span class="dot"></span>{esc(g.get('subhead') or 'TRENCH DATA')}</div>
<div class="headline mono fit" data-fit style="font-size:{int(u*0.24)}px;margin-top:{int(u*0.03)}px;color:#FFB547;letter-spacing:-.04em;white-space:nowrap">{big}</div>
<div class="headline fit" data-fit style="font-size:{int(u*0.062)}px;margin-top:{int(u*0.02)}px;max-width:92%">{rich(g.get('body'))}</div>
<div class="rows" style="margin-top:auto">{rows}</div></div>{foot(g, w, h)}"""
    return body


def t_quote(g, w, h):
    u = min(w, h)
    body = f"""<div class="content" data-box style="bottom:{int(u*0.16)}px;justify-content:center">
<div class="kicker"><span class="dot"></span>{esc(g.get('subhead') or '')}</div>
<div class="headline fit" data-fit style="font-size:{int(u*0.11)}px;margin-top:{int(u*0.04)}px">{rich(g['headline'])}</div>
<div class="sub fit" data-fit style="font-size:{int(u*0.045)}px;margin-top:{int(u*0.035)}px;max-width:90%">{rich(g.get('body'))}</div>
</div>{foot(g, w, h)}"""
    return body


def t_chip(g, w, h):
    u = min(w, h)
    data = g.get("data") or []
    first = tone(data[0].get("tone")) if data else "#FFB547"
    chip = f'<span class="chip" style="font-size:{int(u*0.05)}px;background:{first}1f;color:{first};border:1px solid {first}55">● {esc(g["headline"])}</span>'
    rows = "".join(
        f'<div class="row" style="font-size:{int(u*0.034)}px"><span class="l">{esc(d["label"])}</span><span class="v" style="color:{tone(d.get("tone"))}">{esc(d["value"])}</span></div>'
        for d in data
    )
    body = f"""<div class="content" data-box style="bottom:{int(u*0.16)}px">
<div class="kicker"><span class="dot"></span>CHIP EXPLAINED</div>
<div style="margin-top:{int(u*0.035)}px">{chip}</div>
<div class="headline fit" data-fit style="font-size:{int(u*0.072)}px;margin-top:{int(u*0.035)}px">{rich(g.get('subhead'))}</div>
<div class="sub fit" data-fit style="font-size:{int(u*0.038)}px;margin-top:{int(u*0.025)}px;max-width:94%">{rich(g.get('body'))}</div>
<div class="rows" style="margin-top:auto">{rows}</div></div>{foot(g, w, h)}"""
    return body


def t_meme(g, w, h):
    u = min(w, h)
    lines = (g.get("body") or "").split("\n")
    items = "".join(
        f'<span class="mono" style="color:#FFB547">{esc(l.split(":",1)[0])}:</span><span>{rich(l.split(":",1)[1].strip())}</span>'
        if ":" in l and len(l.split(":", 1)[0]) <= 14 else f'<span style="grid-column:1 / -1">{rich(l)}</span>'
        for l in lines if l.strip()
    )
    body = f"""<div class="content" data-box style="bottom:{int(u*0.16)}px;justify-content:center">
<div class="kicker"><span class="dot"></span>{esc(g.get('subhead') or 'FIELD NOTES FROM THE TRENCHES')}</div>
<div class="headline fit" data-fit style="font-size:{int(u*0.085)}px;margin-top:{int(u*0.035)}px">{rich(g['headline'])}</div>
<div class="fit" data-fit style="font-size:{int(u*0.05)}px;margin-top:{int(u*0.04)}px;display:grid;grid-template-columns:max-content 1fr;column-gap:.7em;row-gap:.45em;align-items:baseline;font-weight:600;line-height:1.25">{items}</div>
</div>{foot(g, w, h)}"""
    return body


def t_pnl(g, w, h):
    u = min(w, h)
    data = g.get("data") or []
    rows = "".join(
        f'<div class="row" style="font-size:{int(u*0.036)}px"><span class="l">{esc(d["label"])}</span><span class="v" style="color:{tone(d.get("tone"))}">{esc(d["value"])}</span></div>'
        for d in data
    )
    head = esc(g["headline"])
    color = "#FF5468" if head.strip().startswith("-") or head.strip().startswith("−") else "#22D687"
    body = f"""<div class="content" data-box style="bottom:{int(u*0.16)}px">
<div class="kicker"><span class="dot"></span>{esc(g.get('subhead') or 'PAPER PNL')}</div>
<div class="headline mono fit" data-fit style="font-size:{int(u*0.2)}px;margin-top:{int(u*0.03)}px;color:{color};white-space:nowrap">{head}</div>
<div class="sub fit" data-fit style="font-size:{int(u*0.042)}px;margin-top:{int(u*0.015)}px">{rich(g.get('body'))}</div>
<div class="rows" style="margin-top:auto">{rows}</div></div>{foot(g, w, h)}"""
    return body


def t_poll(g, w, h):
    u = min(w, h)
    opts = "".join(
        f'<div style="border:1px solid #303744;border-radius:12px;padding:.55em .8em;display:flex;justify-content:space-between;background:#11141A"><span>{esc(d["label"])}</span><span class="mono" style="color:{tone(d.get("tone") or "muted")}">{esc(d.get("value") or "")}</span></div>'
        for d in g.get("data") or []
    )
    body = f"""<div class="content" data-box style="bottom:{int(u*0.16)}px">
<div class="kicker"><span class="dot"></span>{esc(g.get('subhead') or 'POLL')}</div>
<div class="headline fit" data-fit style="font-size:{int(u*0.085)}px;margin-top:{int(u*0.035)}px">{rich(g['headline'])}</div>
<div style="font-size:{int(u*0.042)}px;margin-top:auto;display:flex;flex-direction:column;gap:{int(u*0.018)}px;font-weight:600">{opts}</div>
</div>{foot(g, w, h)}"""
    return body


def t_teaser(g, w, h):
    u = min(w, h)
    ring = int(u * 0.5)
    body = f"""<div style="position:absolute;left:50%;top:39%;width:{ring}px;height:{ring}px;transform:translate(-50%,-50%);opacity:.95">
<svg viewBox="0 0 32 32" style="width:100%;height:100%;filter:drop-shadow(0 0 {int(u*0.03)}px rgba(255,181,71,.55))">
<circle cx="16" cy="16" r="9" fill="none" stroke="#FFB547" stroke-width="0.35"/>
<circle cx="16" cy="16" r="12.5" fill="none" stroke="#FFB547" stroke-width="0.12" stroke-dasharray="0.6 0.9" opacity=".6"/>
<path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5" stroke="#FFB547" stroke-width="0.35" stroke-linecap="round"/>
<path d="M10.6 18.6l3-3.1 2.6 2.4 5.2-5.3" fill="none" stroke="#E6E9F0" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<div class="content" data-box style="justify-content:flex-end;align-items:center;text-align:center;bottom:{int(u*0.16)}px">
<div class="headline fit" data-fit style="font-size:{int(u*0.085)}px;max-width:100%">{rich(g['headline'])}</div>
<div class="kicker" style="margin-top:{int(u*0.025)}px;justify-content:center">{esc(g.get('subhead') or '')}</div>
</div>{foot(g, w, h)}"""
    return body


def t_header(g, w, h):
    # X header: avatar covers bottom-left on desktop; mobile crops top/bottom.
    body = f"""<div style="position:absolute;left:{int(w*0.30)}px;right:{int(w*0.06)}px;top:{int(h*0.2)}px;bottom:{int(h*0.2)}px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;text-align:right" data-box>
<div class="kicker" style="font-size:20px">{esc(g.get('subhead') or '')}</div>
<div class="headline fit" data-fit style="font-size:76px;margin-top:14px;white-space:nowrap">{rich(g['headline'])}</div>
<div class="sub" style="font-size:24px;margin-top:14px">{rich(g.get('body'))}</div>
</div>
<div style="position:absolute;right:{int(w*0.06)}px;bottom:28px;font-family:'JetBrains Mono',monospace;font-size:15px;color:#5C6372">{esc(g.get('footer') or '')}</div>"""
    return body


def t_og(g, w, h):
    u = min(w, h)
    lock = open(f"{LOGO}/lockup-horizontal-dark.svg").read().replace("<svg ", f'<svg style="height:{int(u*0.17)}px;width:auto" ')
    body = f"""<div class="content" data-box style="justify-content:center;bottom:{int(u*0.16)}px">
{lock}
<div class="headline fit" data-fit style="font-size:{int(u*0.1)}px;margin-top:{int(u*0.06)}px">{rich(g['headline'])}</div>
<div class="sub" style="font-size:{int(u*0.045)}px;margin-top:{int(u*0.03)}px">{rich(g.get('body') or g.get('subhead'))}</div>
</div><div class="foot"><span>{esc(g.get('footer') or '')}</span><span></span></div>"""
    return body


def t_avatar(g, w, h):
    return f"""<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(255,181,71,.18),transparent 62%),#0D1016"></div>
<div style="position:absolute;left:50%;top:50%;width:{int(w*0.74)}px;height:{int(w*0.74)}px;transform:translate(-50%,-50%);filter:drop-shadow(0 0 {int(w*0.03)}px rgba(255,181,71,.45))">{MARK.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>"""


TEMPLATES = {"stat": t_stat, "quote": t_quote, "chip-explainer": t_chip, "meme": t_meme, "pnl-card": t_pnl,
             "poll-card": t_poll, "teaser": t_teaser, "header": t_header, "og": t_og, "avatar": t_avatar}


def build(spec_path, html_dir, jobs_path):
    spec = json.load(open(spec_path))
    os.makedirs(html_dir, exist_ok=True)
    jobs = []
    for g in spec:
        w, h = int(g["width"]), int(g["height"])
        fn = TEMPLATES.get(g["template"], t_quote)
        sim = g["template"] == "pnl-card"
        body = fn(g, w, h)
        if g["template"] == "avatar":
            page = f"<!doctype html><html><head><meta charset='utf-8'><style>*{{margin:0}}html,body{{width:{w}px;height:{h}px;overflow:hidden;background:#0D1016}}</style></head><body>{body}</body></html>"
        else:
            page = frame(g, body, w, h, art=g.get("art"), sim=sim)
        hp = os.path.join(html_dir, g["ref"] + ".html")
        open(hp, "w").write(page)
        jobs.append({"src": hp, "out": g["file"], "width": w, "height": h, "scale": g.get("scale", 1), "wait": 250})
    json.dump(jobs, open(jobs_path, "w"), indent=1)
    print(len(jobs), "cards")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], sys.argv[3])
