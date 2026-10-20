"""Framed product screenshots for X posts: crop + window chrome + amber callouts
+ blur boxes + a permanent "SIM · PAPER TRADING" corner bug.

Usage: python3 screens.py screens.json html_dir jobs.json
Item: {ref, src, out, width, height, crop:[x,y,w,h], callouts:[{box:[x,y,w,h], label, side}],
       blur:[[x,y,w,h]], caption}
All boxes are in source-image pixels.
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
        cx, cy, cw, ch = it["crop"]
        pad = int(min(W, H) * 0.06)
        cap = it.get("caption")
        cap_h = int(min(W, H) * 0.075) if cap else 0
        # Fit the crop inside the available box, keeping aspect.
        aw, ah = W - 2 * pad, H - 2 * pad - cap_h
        s = min(aw / cw, ah / ch)
        ww, wh = int(cw * s), int(ch * s)
        wx, wy = (W - ww) // 2, pad + cap_h + (ah - wh) // 2
        src = it["src"]
        img = f'<img src="file://{src}" style="position:absolute;left:{-cx*s}px;top:{-cy*s}px;width:{it.get("src_w",3840)*s}px;height:{it.get("src_h",2160)*s}px">'
        blurs = "".join(
            f'<div style="position:absolute;left:{(b[0]-cx)*s}px;top:{(b[1]-cy)*s}px;width:{b[2]*s}px;height:{b[3]*s}px;backdrop-filter:blur({max(4,int(8*s*2))}px);background:rgba(17,20,26,.35);border-radius:4px"></div>'
            for b in it.get("blur", [])
        )
        calls = ""
        for c in it.get("callouts", []):
            x, y, w, h = c["box"]
            lx, ly = (x - cx) * s, (y - cy) * s
            side = c.get("side", "top")
            lab_pos = {"top": "bottom:100%;left:-3px;margin-bottom:8px", "bottom": "top:100%;left:-3px;margin-top:8px",
                       "left": "right:100%;top:-3px;margin-right:10px", "right": "left:100%;top:-3px;margin-left:10px",
                       "inside": "left:8px;top:8px"}[side]
            calls += (
                f'<div style="position:absolute;left:{lx}px;top:{ly}px;width:{w*s}px;height:{h*s}px;border:3px solid #FFB547;border-radius:10px;'
                f'box-shadow:0 0 0 4000px rgba(10,12,16,{it.get("dim",0.0)}),0 0 28px rgba(255,181,71,.55)">'
                f'<div style="position:absolute;{lab_pos};white-space:nowrap;background:#FFB547;color:#140E02;font:700 {int(min(W,H)*0.028)}px/1.2 \'JetBrains Mono\',monospace;padding:.35em .6em;border-radius:6px;letter-spacing:.02em">{html.escape(c["label"])}</div></div>'
            )
        cap_html = (
            f'<div style="position:absolute;left:{pad}px;right:{pad}px;top:{pad - int(cap_h*0.1)}px;height:{cap_h}px;display:flex;align-items:center;gap:.6em;'
            f'font:800 {int(cap_h*0.62)}px/1 Inter,sans-serif;letter-spacing:-.03em;color:#F4F6FA">{cap}</div>'
            if cap else ""
        )
        wm = (f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;border-radius:14px">'
              f'<span style="transform:rotate(-16deg);font:800 {int(ww*0.075)}px/1 \'JetBrains Mono\',monospace;letter-spacing:.18em;color:rgba(255,181,71,.16);white-space:nowrap">SIMULATED · PAPER TRADE</span></div>'
              if it.get("watermark") else "")
        page = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}} html,body{{width:{W}px;height:{H}px;overflow:hidden}}
body{{background:radial-gradient(ellipse 60% 70% at 85% 0%,rgba(255,181,71,.18),transparent 60%),#0A0C10;font-family:Inter,sans-serif}}
em{{font-style:normal;color:#FFB547}}
.grid{{position:absolute;inset:0;background-image:linear-gradient(rgba(140,148,163,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(140,148,163,.06) 1px,transparent 1px);background-size:48px 48px}}
</style></head><body><div class="grid"></div>{cap_html}
<div style="position:absolute;left:{wx}px;top:{wy}px;width:{ww}px;height:{wh}px;border-radius:14px;overflow:visible;box-shadow:0 30px 80px -20px rgba(0,0,0,.8),0 0 0 1px #303744">
 <div style="position:absolute;inset:0;border-radius:14px;overflow:hidden">{img}{blurs}</div>{wm}{calls}
 <div style="position:absolute;right:0;bottom:calc(100% + 10px);background:rgba(10,12,16,.82);border:1px solid #FFB54788;color:#FFB547;font:700 {max(12,int(min(W,H)*0.02))}px/1 'JetBrains Mono',monospace;padding:.45em .7em;border-radius:6px;letter-spacing:.08em">SIM · PAPER TRADING</div>
</div>
<div style="position:absolute;right:{pad}px;bottom:{int(pad*0.32)}px;display:flex;align-items:center;gap:.5em;font:700 {max(14,int(min(W,H)*0.026))}px Inter,sans-serif;color:#E6E9F0;letter-spacing:-.02em">
 <span style="width:1.4em;height:1.4em;display:inline-block">{MARK.replace('<svg ', '<svg style="width:100%;height:100%" ')}</span><span>Trench<span style="color:#FFB547">scope</span></span></div>
</body></html>"""
        hp = os.path.join(html_dir, it["ref"] + ".html")
        open(hp, "w").write(page)
        jobs.append({"src": hp, "out": it["out"], "width": W, "height": H, "wait": 400})
    return jobs


if __name__ == "__main__":
    items = json.load(open(sys.argv[1]))
    jobs = build(items, sys.argv[2])
    json.dump(jobs, open(sys.argv[3], "w"), indent=1)
    print(len(jobs), "screens")
