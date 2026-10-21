"""Prosody numbers (pYIN pitch via librosa; pip install librosa) for a voice take, as a stand-in for listening: how much the pitch moves (monotone vs expressive),
how much the loudness moves, how fast it talks and how it pauses.

  pitch_st_sd   standard deviation of voiced pitch, in semitones. Flat/robotic reads sit around 1.5-2.5; lively
                narration usually 3-5+.
  pitch_range   5th-95th percentile pitch spread, semitones.
  energy_db_sd  standard deviation of voiced frame loudness, dB.
  wps           words per second (faster-whisper word timestamps); ~2.5-3 is punchy narration.
  pauses        gaps between words longer than 0.25 s.

Usage: python3 prosody.py take.wav [take2.mp3 ...]   (prints one JSON line per file)
"""
import json
import subprocess
import sys

import numpy as np

SR = 16000


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def f0_track(x, hop=0.01, fmin=65, fmax=420):
    """pYIN pitch per 10 ms frame (librosa), 0 where unvoiced; plus frame loudness in dB."""
    import librosa
    h = int(hop * SR)
    f0, voiced, _ = librosa.pyin(x, fmin=fmin, fmax=fmax, sr=SR, frame_length=1024, hop_length=h)
    f0 = np.where(voiced, np.nan_to_num(f0), 0.0)
    rms = librosa.feature.rms(y=x, frame_length=1024, hop_length=h)[0][:len(f0)]
    return f0, 20 * np.log10(rms + 1e-9)


def words(x):
    from faster_whisper import WhisperModel
    m = WhisperModel("small.en", device="cpu", compute_type="int8")
    segs, _ = m.transcribe(x, word_timestamps=True)
    return [(w.start, w.end, w.word.strip()) for s in segs for w in s.words]


def analyse(path):
    x = load(path)
    f0, en = f0_track(x)
    loud = en > (en.max() - 35)
    v = (f0 > 0) & loud
    st = 12 * np.log2(f0[v] / np.median(f0[v])) if v.sum() > 10 else np.array([0.0])
    ws = words(x)
    gaps = [b[0] - a[1] for a, b in zip(ws, ws[1:]) if b[0] - a[1] > 0.25]
    speech = (ws[-1][1] - ws[0][0]) if ws else 0
    return {"file": path.split("/")[-1], "dur": round(len(x) / SR, 2), "pitch_st_sd": round(float(np.std(st)), 2),
            "pitch_range": round(float(np.percentile(st, 95) - np.percentile(st, 5)), 2),
            "median_f0": round(float(np.median(f0[v])) if v.any() else 0, 1), "energy_db_sd": round(float(np.std(en[loud])), 2),
            "words": len(ws), "wps": round(len(ws) / speech, 2) if speech else 0, "pauses": len(gaps),
            "text": " ".join(w for _, _, w in ws)}


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps(analyse(p)))
