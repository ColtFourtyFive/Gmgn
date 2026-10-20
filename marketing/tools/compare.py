"""A/B "spot the rug" composites: two real panel screenshots side by side with
amber "??" masks, a headline, and the SIM bug. A reveal variant drops the
masks and rings the answer.

Usage: python3 compare.py spec.json html_dir jobs.json
Item: {ref, out, width, height, headline, subhead, panels:[{src, size:[w,h] (css px), scale:2,
       label:'A', masks:[[x,y,w,h]...] (css px), ring:bool, ring_label}]}
"""
import html
import json
import os
import sys

MARK = open("/home/user/Gmgn/marketing/brand/logo/mark-dark.svg").read()


def build(items, html_dir):
    os.makedirs(html_dir, exist_ok=True)
    jobs = []
    for it in items:
        W, H = it["width"], it["height"]
        pad = int(min(W, H) * 0.07)
        head_h = int(H * 0.24)
        n = len(it["panels"])
        gap = int(W * 0.035)
        avail_w = (W - 2 * pad - gap * (n - 1)) / n
        avail_h = H - pad - head_h - int(H * 0.12)
        panels = ""
        for i, p in enumerate(it["panels"]):
            pw, ph = p["size"]
            s = min(avail_w / pw, avail_h / ph)
            w, h = pw * s, ph * s
            x = pad + i * (avail_w + gap) + (avail_w - w) / 2
            y = head_h + (avail_h - h) / 2 + int(H * 0.02)
            masks = "".join(
                f'<div style="position:absolute;left:{m[0]*s}px;top:{m[1]*s}px;width:{m[2]*s}px;height:{m[3]*s}px;background:#FFB547;border-radius:{6*s/2}px;'
                f'display:flex;align-items:center;justify-content:center;color:#140E02;font:800 {m[3]*s*0.62}px/1 \'JetBrains Mono\',monospace">??</div>'
                for m in p.get("masks", [])
            )
            ring = ""
            if p.get("ring"):
                ring = (f'<div style="position:absolute;inset:-10px;border:4px solid #FFB547;border-radius:18px;box-shadow:0 0 36px rgba(255,181,71,.6)"></div>'
                        f'<div style="position:absolute;left:-6px;bottom:calc(100% + 14px);background:#FFB547;color:#140E02;font:800 {int(H*0.034)}px/1.2 \'JetBrains Mono\',monospace;padding:.3em .6em;border-radius:6px;white-space:nowrap">{html.escape(p.get("ring_label",""))}</div>')
            panels += (
                f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px">'
                f'<div style="position:absolute;inset:0;border-radius:12px;overflow:hidden;box-shadow:0 24px 60px -20px rgba(0,0,0,.8),0 0 0 1px #303744">'
                f'<img src="file://{p["src"]}" style="width:100%;height:100%;display:block">{masks}</div>{ring}'
                f'<div style="position:absolute;left:50%;top:calc(100% + {int(H*0.025)}px);transform:translateX(-50%);font:800 {int(H*0.06)}px/1 \'JetBrains Mono\',monospace;color:#FFB547">{html.escape(p["label"])}</div></div>'
            )
        page = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}} html,body{{width:{W}px;height:{H}px;overflow:hidden}}
body{{background:radial-gradient(ellipse 60% 70% at 85% 0%,rgba(255,181,71,.16),transparent 60%),#0A0C10;font-family:Inter,sans-serif;color:#F4F6FA;-webkit-font-smoothing:antialiased}}
em{{font-style:normal;color:#FFB547}}
.grid{{position:absolute;inset:0;background-image:linear-gradient(rgba(140,148,163,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(140,148,163,.06) 1px,transparent 1px);background-size:48px 48px}}
</style></head><body><div class="grid"></div>
<div style="position:absolute;left:{pad}px;right:{pad}px;top:{int(pad*0.8)}px">
 <div style="font:800 {int(H*0.075)}px/1.05 Inter,sans-serif;letter-spacing:-.035em">{it["headline"]}</div>
 <div style="margin-top:{int(H*0.015)}px;font:500 {int(H*0.036)}px/1.3 Inter,sans-serif;color:#8C94A3">{it.get("subhead","")}</div>
</div>
<div style="position:absolute;right:{pad}px;top:{int(pad*0.8)}px;border:1.5px solid #FFB547;color:#FFB547;font:700 {int(H*0.022)}px/1 'JetBrains Mono',monospace;padding:.5em .8em;border-radius:6px;letter-spacing:.08em">SIM · PAPER TRADING</div>
{panels}
<div style="position:absolute;right:{pad}px;bottom:{int(pad*0.4)}px;display:flex;align-items:center;gap:.5em;font:700 {int(H*0.03)}px Inter,sans-serif;letter-spacing:-.02em">
 <span style="width:1.4em;height:1.4em;display:inline-block">{MARK.replace('<svg ', '<svg style="width:100%;height:100%" ')}</span><span>Trench<span style="color:#FFB547">scope</span></span></div>
<div style="position:absolute;left:{pad}px;bottom:{int(pad*0.45)}px;font:500 {int(H*0.02)}px 'JetBrains Mono',monospace;color:#5C6372">{html.escape(it.get("footer","fictional sim tokens · simulated audit"))}</div>
</body></html>"""
        hp = os.path.join(html_dir, it["ref"] + ".html")
        open(hp, "w").write(page)
        jobs.append({"src": hp, "out": it["out"], "width": W, "height": H, "wait": 400})
    return jobs


if __name__ == "__main__":
    jobs = build(json.load(open(sys.argv[1])), sys.argv[2])
    json.dump(jobs, open(sys.argv[3], "w"), indent=1)
    print(len(jobs), "composites")
