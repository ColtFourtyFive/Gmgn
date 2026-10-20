#!/usr/bin/env bash
# Trailer audio: cut the one-take TTS voiceover into its six lines (pauses
# tightened to fit the shot windows), place them on the SCRIPT.md §10.1 cue
# times, duck the synthesized score under them, and master to -14 LUFS / -1 dBTP.
#
# Usage: trailer_mix.sh vo.wav trailer-score.wav out.wav
# Source windows come from a faster-whisper word-timestamp pass on vo.wav.
set -euo pipefail
VO="$1"; SCORE="$2"; OUT="$3"

ffmpeg -y -loglevel error -i "$VO" -i "$SCORE" -filter_complex "
[0:a]aformat=sample_rates=48000:channel_layouts=mono,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-2[vo];
[vo]asplit=9[a1][a2][a3][a4][a5][a6][a7][a8][a9];
[a1]atrim=0.00:2.10,asetpts=PTS-STARTPTS,afade=t=out:st=1.95:d=0.15,adelay=300|300[l1];
[a2]atrim=3.50:4.95,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=1.3:d=0.15,adelay=2500|2500[l2];
[a3]atrim=5.75:6.95,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=1.05:d=0.15,adelay=4350|4350[l3];
[a4]atrim=7.90:8.42,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=0.45:d=0.07[l4a];
[a5]atrim=9.88:10.55,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=0.55:d=0.12[l4b];
[l4a][l4b]concat=n=2:v=0:a=1,adelay=5650|5650[l4];
[a6]atrim=12.25:14.45,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=2.05:d=0.15,adelay=20000|20000[l5];
[a7]atrim=15.15:16.95,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=1.65:d=0.15,adelay=24050|24050[l6];
[a8]atrim=17.80:18.90,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=1.0:d=0.1[l7a];
[a9]atrim=19.40:20.30,asetpts=PTS-STARTPTS,afade=t=out:st=0.75:d=0.15[l7b];
[l7a][l7b]concat=n=2:v=0:a=1,adelay=32000|32000[l7];
[l1][l2][l3][l4][l5][l6][l7]amix=inputs=7:normalize=0:duration=longest,apad=whole_dur=36.6,atrim=0:36.6,aformat=channel_layouts=stereo[voice];
[voice]asplit=2[vside][vmix];
[1:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:36.6[score];
[score][vside]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300:makeup=1[ducked];
[ducked][vmix]amix=inputs=2:normalize=0:weights=1 1.15,loudnorm=I=-14:TP=-1:LRA=11,aresample=48000,apad=whole_dur=36.6,atrim=0:36.6[out]
" -map "[out]" -ar 48000 -c:a pcm_s16le "$OUT"
echo "wrote $OUT"
