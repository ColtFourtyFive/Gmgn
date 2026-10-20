"""X profile assets: avatar (400x400) and header-alt (1500x500), per marketing/x/PROFILE.md §7."""
import json, os, sys
MARK = open("/home/user/Gmgn/marketing/brand/logo/mark-dark.svg").read()
OUT = "/home/user/Gmgn/marketing/x/profile"
H = sys.argv[1]
os.makedirs(H, exist_ok=True)
FONTS = "body{font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}.mono{font-family:'JetBrains Mono',monospace}"

avatar = f"""<!doctype html><html><head><meta charset=utf-8><style>*{{margin:0}}html,body{{width:400px;height:400px;overflow:hidden;background:#0A0C10}}{FONTS}</style></head><body>
<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(255,181,71,.16),transparent 58%),#0A0C10"></div>
<div style="position:absolute;left:50%;top:50%;width:372px;height:372px;transform:translate(-50%,-50%);filter:drop-shadow(0 0 10px rgba(255,181,71,.45))">{MARK.replace('<svg ','<svg style="width:100%;height:100%" ')}</div></body></html>"""

chips = [("SMART MONEY","#4ADE80"),("KOL","#C084FC"),("DEV","#FB923C"),("SNIPER","#F87171"),("INSIDER","#F472B6"),("BUNDLER","#FACC15"),("WHALE","#38BDF8"),("FRESH","#2DD4BF"),("BOT","#94A3B8")]
chip_html = "".join(f'<span class="mono" style="font-weight:600;font-size:15px;letter-spacing:.04em;color:{c};background:{c}1f;border:1px solid {c}40;border-radius:6px;padding:5px 9px">{t}</span>' for t,c in chips)
reticle = """<svg viewBox="0 0 32 32" style="width:100%;height:100%"><circle cx="16" cy="16" r="9" fill="none" stroke="#FFB547" stroke-width="2.4"/><path d="M16 3.5v4.5M16 24v4.5M3.5 16H8M24 16h4.5" stroke="#FFB547" stroke-width="2.4" stroke-linecap="round"/></svg>"""
header_alt = f"""<!doctype html><html><head><meta charset=utf-8><style>*{{margin:0;box-sizing:border-box}}html,body{{width:1500px;height:500px;overflow:hidden;background:#0A0C10;color:#E6E9F0}}{FONTS}</style></head><body>
<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(140,148,163,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(140,148,163,.07) 1px,transparent 1px);background-size:64px 64px"></div>
<div style="position:absolute;left:-140px;top:-130px;width:760px;height:760px;opacity:.11">{reticle}</div>
<div style="position:absolute;inset:0;background:radial-gradient(ellipse 30% 55% at 66% 45%,rgba(255,181,71,.26),transparent 100%)"></div>
<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px)"></div>
<div class="mono" style="position:absolute;right:200px;top:86px;font-weight:600;font-size:15px;letter-spacing:.1em;color:#FFB547;border:1.5px solid #FFB547;border-radius:999px;padding:6px 14px">SOLANA · BASE · ROBINHOOD CHAIN</div>
<div style="position:absolute;left:470px;right:200px;top:140px;display:flex;flex-direction:column;align-items:flex-end;text-align:right">
  <div style="font-weight:600;font-size:70px;letter-spacing:-.035em;line-height:1.02">see who's <span style="color:#FFB547">really</span> buying.</div>
  <div class="mono" style="margin-top:14px;font-weight:600;font-size:19px;color:#8C94A3;letter-spacing:.02em">every wallet tagged before you buy · self-custody</div>
  <div style="margin-top:22px;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;max-width:820px">{chip_html}</div>
</div></body></html>"""
jobs=[]
for name, html, w, h in (("avatar", avatar, 400, 400), ("header-alt", header_alt, 1500, 500)):
    p=os.path.join(H, name+".html"); open(p,"w").write(html)
    jobs.append({"src":p,"out":f"{OUT}/{name}.png","width":w,"height":h,"wait":300})
json.dump(jobs, open(os.path.join(H,"jobs.json"),"w"))
