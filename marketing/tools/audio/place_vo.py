"""Place a narration take on a picture timeline, line by line.

The take is read once, naturally (one TTS generation or a few). faster-whisper word timestamps find where each script
line sits in the take; each line is cut out (with a little air) and dropped at its cue. A line longer than its window is
sped up with atempo, at most MAX_SPEED (beyond that it reports an overrun and leaves it long, so the script gets fixed,
not the voice mangled).

Usage: python3 place_vo.py script.json out.wav [report.json]
script.json: {"total": 36.6, "takes": ["take1.mp3", ...],
              "lines": [{"t_start": 0.1, "t_end": 2.4, "text": "Out here in the trenches..."}, ...]}
Lines are matched in order across the takes (a line never spans two takes).
"""
import json
import re
import subprocess
import sys

import numpy as np

SR = 48000
MAX_SPEED = 1.12
PAD = 0.06


def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower().replace("’", "'"))


def load(path, sr):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


_model = None


def words(path):
    global _model
    from faster_whisper import WhisperModel
    _model = _model or WhisperModel("small.en", device="cpu", compute_type="int8")
    segs, _ = _model.transcribe(load(path, 16000), word_timestamps=True)
    return [(w.start, w.end, norm(w.word)) for s in segs for w in s.words if norm(w.word)]


def match(line, ws, k0):
    """Find the line's words in ws starting near k0 (fuzzy: first and last word anchor the span)."""
    toks = [norm(t) for t in line.split() if norm(t)]
    n = len(toks)
    best = None
    for k in range(k0, max(k0 + 1, len(ws) - 1) + 1):
        seg = [w[2] for w in ws[k:k + n]]
        if not seg:
            break
        score = sum(a == b for a, b in zip(toks, seg)) / n
        if best is None or score > best[0]:
            best = (score, k)
        if score == 1:
            break
    score, k = best
    end = min(len(ws) - 1, k + n - 1)
    return score, k, end


def atempo(x, speed, tmp):
    if abs(speed - 1) < 0.005:
        return x
    a, b = f"{tmp}-in.f32", f"{tmp}-out.f32"
    x.astype(np.float32).tofile(a)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", a, "-af", f"atempo={speed:.4f}",
                    "-f", "f32le", "-ar", str(SR), "-ac", "1", b], check=True)
    return np.fromfile(b, np.float32)


def place(script, out, report=None):
    total = script["total"]
    lines = script["lines"]
    track = np.zeros(int(total * SR) + SR, np.float32)
    rep = []
    li = 0
    for take in script["takes"]:
        x = load(take, SR)
        ws = words(take)
        k = 0
        while li < len(lines) and k < len(ws):
            L = lines[li]
            score, a, b = match(L["text"], ws, k)
            if score < 0.5:
                break                     # this line isn't in this take; try the next take
            s0, s1 = max(0, ws[a][0] - PAD), ws[b][1] + PAD
            # Don't clip into the next word.
            if b + 1 < len(ws):
                s1 = min(s1, (ws[b][1] + ws[b + 1][0]) / 2)
            if a > 0:
                s0 = max(s0, (ws[a - 1][1] + ws[a][0]) / 2)
            clip = x[int(s0 * SR):int(s1 * SR)]
            win = L["t_end"] - L["t_start"]
            dur = len(clip) / SR
            speed = min(MAX_SPEED, max(1.0, dur / win)) if win > 0 else 1.0
            clip = atempo(clip, speed, f"/tmp/place_vo_{li}")
            fade = int(0.012 * SR)
            if len(clip) > 2 * fade:
                clip[:fade] *= np.linspace(0, 1, fade)
                clip[-fade:] *= np.linspace(1, 0, fade)
            at = int(L["t_start"] * SR)
            end = min(len(track), at + len(clip))
            track[at:end] += clip[:end - at]
            placed_end = L["t_start"] + len(clip) / SR
            rep.append({"line": L["text"], "match": round(score, 2), "src": [round(s0, 2), round(s1, 2)], "dur": round(dur, 2), "window": round(win, 2),
                        "speed": round(speed, 3), "ends_at": round(placed_end, 2), "overrun": round(max(0, placed_end - L["t_end"]), 2)})
            li += 1
            k = b + 1
    if li < len(lines):
        rep.append({"error": f"{len(lines) - li} line(s) not found in the takes", "missing": [l["text"] for l in lines[li:]]})
    track = track[:int(total * SR)]
    peak = np.max(np.abs(track)) or 1
    track = track / peak * 0.9
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "pcm_s16le", out],
                   input=track.astype(np.float32).tobytes(), check=True)
    if report:
        json.dump(rep, open(report, "w"), indent=1)
    return rep


if __name__ == "__main__":
    r = place(json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    for x in r:
        print(json.dumps(x))
