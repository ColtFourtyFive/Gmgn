"""Rebuild x/posts/d1-field-guide.png: trailer shot 1 at t=1.0 s (c01 at 1.4 s, 1.25% push) + the
trailer's shot-1 overlays + the AI corner label in exact case (BRAND_GUIDE §10, stills: bottom-right).

Usage: python3 build_d1.py scratch_dir
"""
import subprocess
import sys

from PIL import Image

M = "/home/user/Gmgn/marketing"
OV = f"{M}/video/overlays/trailer"
S = sys.argv[1]
z = 1.0 + 0.03 * (1.0 / 2.4)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1.4", "-i", f"{M}/video/clips/c01.mp4", "-frames:v", "1",
                "-vf", f"scale=3840:2160:flags=lanczos,crop=iw/{z}:ih/{z},scale=1920:1080:flags=lanczos", f"{S}/f.png"], check=True)
img = Image.open(f"{S}/f.png").convert("RGBA")
for n in ("letterbox", "s1-hook", "s1-label", "s1-reticle", "s1-chip"):
    img.alpha_composite(Image.open(f"{OV}/{n}.png").convert("RGBA"))
html = """<!doctype html><html><head><meta charset=utf-8><style>*{margin:0}html,body{width:1920px;height:1080px;background:transparent}
.l{position:absolute;right:48px;bottom:44px;font-family:'JetBrains Mono',monospace;font-weight:500;font-size:26px;color:rgba(230,233,240,.85);
background:rgba(10,12,16,.8);border-radius:6px;padding:.5em .9em}</style></head><body><div class=l>AI-generated</div></body></html>"""
open(f"{S}/label.html", "w").write(html)
open(f"{S}/jobs.json", "w").write(f'[{{"src":"{S}/label.html","out":"{S}/label.png","width":1920,"height":1080,"transparent":true,"wait":200}}]')
subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True)
img.alpha_composite(Image.open(f"{S}/label.png").convert("RGBA"))
img.convert("RGB").save(f"{M}/x/posts/d1-field-guide.png")
print("wrote d1-field-guide.png")
