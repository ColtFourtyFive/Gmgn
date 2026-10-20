"""Cut list + timed overlays -> H.264/AAC MP4 with ffmpeg.

Usage: python3 vedit.py edit.json
edit.json:
{ "out": "x.mp4", "w": 1920, "h": 1080, "fps": 30,
  "segments": [ {"src": "clip.mp4", "start": 0, "end": 4.4, "crop": [x,y,w,h]|null, "zoom": 1.0->1.06 optional,
                 "still": false}  # a PNG still: set "still": true and "dur"
              ],
  "overlays": [ {"png": "cap.png", "t0": 0.2, "t1": 3.0, "fade": 0.12} ],  # full-frame PNGs, times on the output timeline
  "audio": "score.wav" | null }
"""
import json
import subprocess
import sys


def run(edit):
    W, H, FPS = edit.get("w", 1920), edit.get("h", 1080), edit.get("fps", 30)
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    filters = []
    labels = []
    idx = 0
    for i, s in enumerate(edit["segments"]):
        if s.get("still"):
            args += ["-loop", "1", "-t", str(s["dur"]), "-i", s["src"]]
            dur = s["dur"]
            chain = f"[{idx}:v]fps={FPS},"
        else:
            args += ["-ss", str(s["start"]), "-t", str(s["end"] - s["start"]), "-i", s["src"]]
            dur = s["end"] - s["start"]
            chain = f"[{idx}:v]fps={FPS},setpts=PTS-STARTPTS,"
        blurs = s.get("blur") or []
        if blurs:
            # Region blur in source pixels, applied before the crop.
            chain = chain.rstrip(",") + f",split={len(blurs) + 1}" + "".join(f"[b{i}_{k}]" for k in range(len(blurs) + 1)) + ";"
            base = f"[b{i}_0]"
            for k, (bx, by, bw, bh) in enumerate(blurs, start=1):
                chain += f"[b{i}_{k}]crop={bw}:{bh}:{bx}:{by},boxblur=luma_radius=10:luma_power=3:chroma_radius=5:chroma_power=3[bb{i}_{k}];"
            for k, (bx, by, bw, bh) in enumerate(blurs, start=1):
                out = f"[bo{i}_{k}]"
                chain += f"{base}[bb{i}_{k}]overlay={bx}:{by}{out};"
                base = out
            chain += base
        if s.get("crop"):
            x, y, w, h = s["crop"]
            chain += f"crop={w}:{h}:{x}:{y},"
        if chain.endswith("]"):
            chain += "null,"
        z = s.get("zoom")
        if z:
            # Slow push-in from z[0] to z[1] over the segment (centre crop).
            n = max(1, int(dur * FPS))
            chain += (f"scale={W*2}:{H*2}:flags=lanczos,"
                      f"crop=w='iw/({z[0]}+({z[1]}-{z[0]})*n/{n})':h='ih/({z[0]}+({z[1]}-{z[0]})*n/{n})':x='(iw-ow)/2':y='(ih-oh)/2',")
        chain += f"scale={W}:{H}:flags=lanczos,setsar=1,format=yuv420p,trim=duration={dur}[v{i}]"
        filters.append(chain)
        labels.append(f"[v{i}]")
        idx += 1
    filters.append("".join(labels) + f"concat=n={len(labels)}:v=1:a=0[base]")
    cur = "base"
    for j, o in enumerate(edit.get("overlays", [])):
        args += ["-loop", "1", "-i", o["png"]]
        fade = o.get("fade", 0.1)
        d = o["t1"] - o["t0"]
        filters.append(
            f"[{idx}:v]format=rgba,trim=duration={d + 0.05},setpts=PTS-STARTPTS+{o['t0']}/TB,"
            f"fade=t=in:st={o['t0']}:d={fade}:alpha=1,fade=t=out:st={max(o['t0'], o['t1'] - fade)}:d={fade}:alpha=1[o{j}]"
        )
        filters.append(f"[{cur}][o{j}]overlay=0:0:enable='between(t,{o['t0']},{o['t1']})':eof_action=pass[c{j}]")
        cur = f"c{j}"
        idx += 1
    total = sum(s["dur"] if s.get("still") else s["end"] - s["start"] for s in edit["segments"])
    if edit.get("audio"):
        args += ["-i", edit["audio"]]
        amap = ["-map", f"{idx}:a", "-c:a", "aac", "-b:a", "192k"]
    else:
        amap = ["-an"]
    args += ["-filter_complex", ";".join(filters), "-map", f"[{cur}]"] + amap + [
        "-t", f"{total:.3f}", "-r", str(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", edit["out"]]
    subprocess.run(args, check=True)
    print("wrote", edit["out"], f"{total:.2f}s")


if __name__ == "__main__":
    run(json.load(open(sys.argv[1])))
