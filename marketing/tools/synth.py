"""Procedural trailer score: original, royalty-free, rendered from code.

Usage: python3 synth.py timeline.json out.wav
timeline.json: {"duration": 40, "bpm": 96, "key_hz": 55,
  "events": [{"t": 0.0, "type": "drone", "dur": 40}, {"t": 4.8, "type": "braam"},
             {"t": 10, "type": "riser", "dur": 4}, {"t": 14, "type": "boom"},
             {"t": 14, "type": "pulse", "dur": 12}, {"t": 0, "type": "ticks", "dur": 8},
             {"t": 30, "type": "silence", "dur": 0.6}, {"t": 36, "type": "logo_hit"}]}
Types: drone, pulse (8th-note bass), ticks (hi-hat ticker), riser, boom (sub drop),
braam (brass-like stab), glitch, whoosh, logo_hit, silence (ducks everything).
"""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(1027)


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([np.linspace(0, 1, a_n, False), np.linspace(1, s, d_n, False), np.full(s_n, s), np.linspace(s, 0, r_n)])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def lp(x, hz, order=4):
    return sosfilt(butter(order, min(hz, SR / 2 - 100), "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    f = freq * (1 + detune)
    return 2 * ((t * f) % 1.0) - 1


def sweep_lp(x, f0, f1):
    """Block-wise time-varying lowpass (cheap filter sweep)."""
    out = np.zeros_like(x)
    blocks = 64
    edges = np.linspace(0, len(x), blocks + 1, dtype=int)
    for i in range(blocks):
        a, b = edges[i], edges[i + 1]
        f = f0 * (f1 / f0) ** (i / (blocks - 1))
        seg = x[max(0, a - 2048):b]
        out[a:b] = lp(seg, f, 2)[-(b - a):]
    return out


def reverb(x, seconds=2.5, mix=0.35):
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir = lp(ir, 6000, 2)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = fftconvolve(x, ir)[: len(x)]
    return (1 - mix) * x + mix * wet


def drone(n, f):
    x = sum(saw(f, n, d) for d in (-0.004, 0.0, 0.005)) / 3
    x += 0.5 * sum(saw(f * 1.5, n, d) for d in (-0.003, 0.004)) / 2  # fifth
    x = lp(x, 420)
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.11 * np.arange(n) / SR)
    sub = 0.6 * np.sin(2 * np.pi * f / 2 * np.arange(n) / SR)
    return (x * lfo + sub) * env_adsr(n, 2.5, 0.5, 1.0, 2.5) * 0.35


def pulse(n, f, bpm):
    step = int(SR * 60 / bpm / 2)
    out = np.zeros(n)
    notes = [1, 1, 1, 1.189, 1, 1, 0.891, 1]  # minor-ish movement
    for i, start in enumerate(range(0, n, step)):
        m = min(step, n - start)
        tone = saw(f * notes[i % len(notes)], m) + 0.5 * np.sin(2 * np.pi * f * notes[i % len(notes)] * np.arange(m) / SR)
        out[start:start + m] += lp(tone, 900) * env_adsr(m, 0.003, 0.08, 0.25, 0.05)
    return out * 0.35


def ticks(n, bpm):
    step = int(SR * 60 / bpm / 4)
    out = np.zeros(n)
    for i, start in enumerate(range(0, n, step)):
        m = min(int(0.03 * SR), n - start)
        click = hp(rng.standard_normal(m), 7000) * np.exp(-np.linspace(0, 9, m))
        out[start:start + m] += click * (0.9 if i % 4 == 0 else 0.45)
    return out * 0.18


def riser(n):
    noise = rng.standard_normal(n)
    x = sweep_lp(noise, 200, 9000) * np.linspace(0, 1, n) ** 2
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * (110 * t + (880 - 110) * t ** 2 / (2 * n / SR)))
    return (0.6 * x + 0.25 * tone * np.linspace(0, 1, n) ** 3) * 0.45


def boom(f=58):
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    freq = f * np.exp(-t * 1.4) + 28
    ph = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(ph) * np.exp(-t * 1.6)
    click = lp(rng.standard_normal(n), 2500) * np.exp(-t * 40) * 0.6
    return np.tanh((body + click) * 2.2) * 0.85


def braam(f):
    n = int(3.2 * SR)
    x = sum(saw(f * m, n, d) for m in (1, 2, 1.5) for d in (-0.006, 0.006)) / 6
    x = sweep_lp(x, 2200, 300)
    x = np.tanh(x * 3) * env_adsr(n, 0.02, 0.4, 0.55, 1.6)
    b = boom(f)
    x[:len(b)] += b[:n] * 0.6
    return reverb(x, 3.0, 0.4) * 0.8


def glitch():
    n = int(0.35 * SR)
    x = rng.standard_normal(n)
    x = bp(x, 1500, 6000) * (rng.random(n // 400 + 1).repeat(400)[:n] > 0.5)
    return x * np.exp(-np.linspace(0, 4, n)) * 0.35


def whoosh():
    n = int(0.9 * SR)
    x = sweep_lp(rng.standard_normal(n), 400, 7000) * np.sin(np.linspace(0, np.pi, n)) ** 2
    return x * 0.35


def logo_hit(f):
    n = int(4.0 * SR)
    t = np.arange(n) / SR
    bell = sum(np.sin(2 * np.pi * f * 8 * m * t) * np.exp(-t * (1.5 + m)) for m in (1, 2.01, 3.03)) / 3
    b = boom(f)
    x = np.pad(b, (0, max(0, n - len(b))))[:n]
    return reverb(x * 0.9 + bell * 0.25, 3.5, 0.45)


def place(buf, sig, t):
    i = int(t * SR)
    if i >= len(buf):
        return
    m = min(len(sig), len(buf) - i)
    buf[i:i + m] += sig[:m]


def render(tl):
    n = int(tl["duration"] * SR)
    buf = np.zeros(n)
    duck = np.ones(n)
    f, bpm = tl.get("key_hz", 55), tl.get("bpm", 96)
    for e in tl["events"]:
        t = e["t"]
        dur = e.get("dur", 1)
        m = int(dur * SR)
        ty = e["type"]
        g = e.get("gain", 1.0)
        if ty == "drone":
            place(buf, drone(m, f) * g, t)
        elif ty == "pulse":
            place(buf, pulse(m, f, bpm) * g, t)
        elif ty == "ticks":
            place(buf, ticks(m, bpm) * g, t)
        elif ty == "riser":
            place(buf, riser(m) * g, t)
        elif ty == "boom":
            place(buf, boom() * g, t)
        elif ty == "braam":
            place(buf, braam(f * e.get("ratio", 1)) * g, t)
        elif ty == "glitch":
            place(buf, glitch() * g, t)
        elif ty == "whoosh":
            place(buf, whoosh() * g, t)
        elif ty == "logo_hit":
            place(buf, logo_hit(f) * g, t)
        elif ty == "silence":
            i, k = int(t * SR), int(dur * SR)
            ramp = int(0.03 * SR)
            duck[i:i + k] = 0.04
            duck[max(0, i - ramp):i] = np.linspace(1, 0.04, min(ramp, i))
    buf *= duck
    buf = hp(buf, 25)
    peak = np.max(np.abs(buf)) or 1
    buf = np.tanh(buf / peak * 1.4) / np.tanh(1.4) * 0.89  # soft-clip master
    fade = int(0.05 * SR)
    buf[:fade] *= np.linspace(0, 1, fade)
    buf[-fade * 4:] *= np.linspace(1, 0, fade * 4)
    stereo = np.stack([buf, np.roll(buf, int(0.0007 * SR))], axis=1)
    return (stereo * 32767).astype(np.int16)


if __name__ == "__main__":
    tl = json.load(open(sys.argv[1]))
    wavfile.write(sys.argv[2], SR, render(tl))
    print("wrote", sys.argv[2])
