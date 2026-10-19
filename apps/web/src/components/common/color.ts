// Deterministic visuals from seeds + small color helpers.

/** FNV-1a 32-bit hash: same seed, same avatar, on every client. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Black or white text, whichever reads better on a #rrggbb background. */
export function contrastText(hex: string): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#141008' : '#fff';
}

/**
 * Tinted chip colors for an arbitrary color (hex or rgb()). The text is
 * pulled toward the theme foreground so pale brand colors stay legible in
 * the light theme and saturated ones in the dark theme.
 */
export function tint(color: string, alpha = 16): { color: string; backgroundColor: string } {
  return { color: `color-mix(in srgb, ${color} 72%, rgb(var(--fg)))`, backgroundColor: `color-mix(in srgb, ${color} ${alpha}%, transparent)` };
}

/** Resolve a theme token ("up", "accent") to an rgb() string with alpha, for canvas/WAAPI. */
export function tokenColor(token: string, alpha = 1): string {
  const triplet = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  return triplet ? `rgb(${triplet} / ${alpha})` : 'transparent';
}
