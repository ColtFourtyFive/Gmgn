// Short synthesized cues for fills and alerts (Settings → Display → Sounds).
// WebAudio oscillators, so there are no audio files to load. Browsers only
// allow audio once the user has interacted with the page; cues before that
// are skipped.

import { useSession } from '@/store/session';

export type Cue = 'fill' | 'alert' | 'error';

/** Tone sequence (Hz) per cue: rising for fills, single ping for alerts, falling for failures. */
const TONES: Record<Cue, number[]> = { fill: [660, 990], alert: [880], error: [392, 262] };
const STEP_S = 0.09;
const LENGTH_S = 0.12;
const VOLUME = 0.08;

let ctx: AudioContext | null = null;

/** Play `cue` if the signed-in user turned sounds on (no-op otherwise). */
export function playCue(cue: Cue): void {
  if (!useSession.getState().settings?.display.sounds) return;
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // autoplay policy
  try {
    ctx ??= new window.AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const audio = ctx;
    TONES[cue].forEach((freq, i) => {
      const start = audio.currentTime + i * STEP_S;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(VOLUME, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + LENGTH_S);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + LENGTH_S + 0.01);
    });
  } catch {
    /* audio unavailable */
  }
}
