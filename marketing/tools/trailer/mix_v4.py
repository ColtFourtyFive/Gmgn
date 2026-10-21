"""Trailer v4 audio (video/SCRIPT.md §10): the v4 voice take cut into its lines on the cue times, the vidIQ score in three
windows, room tone, a riser into the drop, a sub boom on "Buy anyway" and UI clicks; score ducked under the voice,
mastered to -14 LUFS / -1.5 dBTP. Shared by the 16:9 and 9:16 cuts, which keep the same timeline (only the click times
come from each cut's own app take).

build(out_wav, scratch_dir, clicks, boom_at, voice=None, music=None)
"""
import subprocess

V = "/home/user/Gmgn/marketing/video"
VO = f"{V}/audio/vo-take-v4.wav"
SCORE = f"{V}/audio/score-vidiq-trailer.wav"
TOTAL = 36.6
# (source window in the voice take, cue on the timeline); windows from the faster-whisper pass in vo-take-v4.words.txt.
LINES = [((0.00, 2.75), 0.15), ((3.50, 4.60), 2.95), ((5.58, 6.20), 4.50), ((6.66, 7.65), 5.45), ((8.36, 10.50), 20.00),
         ((11.24, 13.45), 24.05), ((14.10, 14.46), 29.20), ((14.46, 16.30), 29.90), ((17.12, 17.68), 32.00), ((18.40, 19.70), 32.70)]
# (score window start, timeline start, duration): build to the receipts, cut to silence for "so naturally, you…",
# drop back in on the late-buyer shot, cut out for the empty desk, last hit and ring-out under the end card.
MUSIC = [(0.5, 0.0, 18.6), (48.0, 24.0, 5.1), (55.0, 31.2, 5.4)]


def ms(x):
    return int(round(x * 1000))


def lufs(path):
    log = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float([ln for ln in log.splitlines() if ln.strip().startswith("I:")][-1].split()[1])


def build(out, scratch, clicks, boom_at, voice=None, music=None, duck=0.02):
    """voice: a narration track already placed on the timeline (tools/audio/place_vo.py); without it the v4 take is cut
    into LINES. music: (score window start, timeline start, duration) list, default MUSIC."""
    music = music or MUSIC
    vo_chain = "aformat=sample_rates=48000:channel_layouts=mono,highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-2"
    if voice:
        fc = [f"[0:a]{vo_chain},apad=whole_dur={TOTAL},atrim=0:{TOTAL},aformat=channel_layouts=stereo,asplit=2[vside][vmix]"]
    else:
        n = len(LINES)
        fc = [f"[0:a]{vo_chain},asplit={n}" + "".join(f"[v{i}]" for i in range(n))]
        for i, ((a, b), at) in enumerate(LINES):
            fc.append(f"[v{i}]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b - a - 0.08:.3f}:d=0.08,adelay={ms(at)}|{ms(at)}[l{i}]")
        fc.append("".join(f"[l{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,apad=whole_dur={TOTAL},atrim=0:{TOTAL},"
                  "aformat=channel_layouts=stereo,asplit=2[vside][vmix]")
    fc.append(f"[1:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit={len(music)}" + "".join(f"[s{i}]" for i in range(len(music))))
    for i, (src, at, d) in enumerate(music):
        fade_in = "afade=t=in:d=0.02," if i else ""
        tail = 0.6 if i == len(music) - 1 else 0.12
        fc.append(f"[s{i}]atrim={src}:{src + d},asetpts=PTS-STARTPTS,{fade_in}afade=t=out:st={d - tail:.3f}:d={tail},adelay={ms(at)}|{ms(at)}[m{i}]")
    # Room tone under the silent stretch, a riser into the drop, a sub boom on "Buy anyway", UI clicks.
    fc.append("anoisesrc=d=5.4:c=brown:a=0.02:r=48000,lowpass=f=300,afade=t=in:d=0.2,afade=t=out:st=5.2:d=0.2,aformat=channel_layouts=stereo,"
              "adelay=18600|18600[room]")
    fc.append("anoisesrc=d=1.5:c=pink:a=0.25:r=48000,highpass=f=1200,afade=t=in:d=1.5:curve=exp,aformat=channel_layouts=stereo,"
              f"adelay={ms(24.0 - 1.5)}|{ms(24.0 - 1.5)}[riser]")
    fc.append(f"aevalsrc='0.9*sin(2*PI*(62*t-9*t*t))*exp(-2.6*t)':d=1.6:s=48000,aformat=channel_layouts=stereo,adelay={ms(boom_at)}|{ms(boom_at)}[boom]")
    for i, c in enumerate(clicks):
        fc.append(f"aevalsrc='0.5*sin(2*PI*2400*t)*exp(-180*t)':d=0.05:s=48000,aformat=channel_layouts=stereo,adelay={ms(c)}|{ms(c)}[k{i}]")
    beds = "".join(f"[m{i}]" for i in range(len(music))) + "[room][riser]"
    fc.append(f"{beds}amix=inputs={len(music) + 2}:normalize=0,apad=whole_dur={TOTAL},atrim=0:{TOTAL}[bed]")
    fc.append(f"[bed][vside]sidechaincompress=threshold={duck}:ratio=8:attack=20:release=300[ducked]")
    fx = "[boom]" + "".join(f"[k{i}]" for i in range(len(clicks)))
    fc.append(f"[ducked][vmix]{fx}amix=inputs={3 + len(clicks)}:normalize=0:weights=1 1.15 1 {' '.join(['1'] * len(clicks))},"
              f"apad=whole_dur={TOTAL},atrim=0:{TOTAL},loudnorm=I=-14:TP=-1:LRA=11,aresample=48000,apad=whole_dur={TOTAL},atrim=0:{TOTAL}[out]")
    raw = f"{scratch}/mix-raw.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", voice or VO, "-i", SCORE, "-filter_complex", ";".join(fc), "-map", "[out]",
                    "-ar", "48000", "-c:a", "pcm_s16le", raw], check=True)
    # Single-pass loudnorm lands about a dB hot on this material: trim to -14 LUFS, then limit true peak to -1.5 dBTP so
    # the AAC encode stays under -1.
    gain = -14.0 - lufs(raw)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.84:level=false",
                    "-ar", "48000", "-c:a", "pcm_s16le", out], check=True)
