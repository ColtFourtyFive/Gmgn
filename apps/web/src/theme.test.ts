// Contrast of the design tokens in index.css (WCAG 2.x): text >= 4.5:1,
// non-text indicators (focus ring, active-option bar, checkbox border) >= 3:1.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAUNCHPADS } from '@trenchscope/shared';

// Vitest runs from apps/web (or the repo root).
const CSS_PATH = ['src/index.css', 'apps/web/src/index.css'].map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p))!;
const css = readFileSync(CSS_PATH, 'utf8');

type Rgb = [number, number, number];

function blockOf(selector: string): string {
  const start = css.indexOf(selector);
  return css.slice(start, css.indexOf('}', start));
}

function tokens(selector: string): Record<string, Rgb> {
  const block = blockOf(selector);
  const out: Record<string, Rgb> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return out;
}

const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: Rgb, b: Rgb) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const mix = (fg: Rgb, bg: Rgb, alpha: number): Rgb => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;

const THEMES = { dark: tokens("[data-theme='dark']"), light: tokens("[data-theme='light']") };
const COLORED = ['accent', 'up', 'down', 'warn', 'info', 'smart', 'kol', 'dev', 'sniper', 'insider', 'bundler', 'whale', 'fresh', 'bot'];
const SURFACES = ['bg', 'panel', 'panel-2', 'panel-3'];

describe('theme contrast', () => {
  it('light theme: colored text reads at >= 4.5:1 on every surface and on its own 10-15% tint', () => {
    const t = THEMES.light;
    const failures: string[] = [];
    for (const name of COLORED) {
      for (const s of SURFACES) {
        if (ratio(t[name], t[s]) < 4.5) failures.push(`${name} on ${s}: ${ratio(t[name], t[s]).toFixed(2)}`);
        for (const a of [0.1, 0.15]) {
          const tint = mix(t[name], t[s], a);
          if (s !== 'panel-3' && ratio(t[name], tint) < 4.5) failures.push(`${name} on ${name}/${a * 100} over ${s}: ${ratio(t[name], tint).toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('launchpad chips (tint(): brand color mixed into --fg, on a 14-16% tint) read at >= 4.5:1 in both themes', () => {
    const failures: string[] = [];
    for (const [theme, sel] of [['dark', "[data-theme='dark']"], ['light', "[data-theme='light']"]] as const) {
      const t = THEMES[theme];
      const share = Number(/--tint-text:\s*(\d+)%/.exec(blockOf(sel))![1]) / 100;
      for (const lp of LAUNCHPADS) {
        const brand = [1, 3, 5].map((i) => parseInt(lp.color.slice(i, i + 2), 16)) as Rgb;
        const text = mix(brand, t.fg, share);
        for (const s of SURFACES)
          for (const a of [0.14, 0.16]) if (ratio(text, mix(brand, t[s], a)) < 4.5) failures.push(`${theme} ${lp.id} on ${s}: ${ratio(text, mix(brand, t[s], a)).toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('button text on accent / up / down fills reads at >= 4.5:1 in both themes', () => {
    for (const t of Object.values(THEMES)) {
      expect(ratio(t['accent-fg'], t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['up-fg'], t.up)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['down-fg'], t.down)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('secondary text: muted reads at >= 4.5:1 on every surface (panel-3 included); faint is only promised on bg / panel / panel-2', () => {
    for (const t of Object.values(THEMES)) {
      for (const s of SURFACES) expect(ratio(t.muted, t[s])).toBeGreaterThanOrEqual(4.5);
      for (const s of ['bg', 'panel', 'panel-2']) expect(ratio(t.faint, t[s])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('focus ring / active-option bar (accent) and checkbox border (muted) reach 3:1 on the panels', () => {
    for (const t of Object.values(THEMES)) {
      for (const s of SURFACES) {
        expect(ratio(t.accent, t[s])).toBeGreaterThanOrEqual(3);
        expect(ratio(t.muted, t[s])).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('touch targets', () => {
  it('coarse pointers grow .touch-target hit areas to at least 24x24px', () => {
    const block = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(block).toMatch(/\.touch-target::after\s*{[^}]*width:\s*max\(100%,\s*24px\)[^}]*height:\s*max\(100%,\s*24px\)/);
  });
});
