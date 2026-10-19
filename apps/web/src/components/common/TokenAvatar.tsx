import { memo, useId } from 'react';
import clsx from 'clsx';
import { hashString } from './color';

export interface TokenAvatarProps {
  /** TokenSummary.logoSeed — drives the gradient. */
  seed: string;
  /** TokenSummary.logoGlyph — emoji centered on the avatar. */
  glyph?: string;
  /** Diameter in px. */
  size?: number;
  /** Launchpad color for the small corner dot (LaunchpadConfig.color). */
  launchpadColor?: string;
  /** Bonding-curve progress 0..1 drawn as a ring; omit for no ring. Full ring turns green. */
  progress?: number | null;
  className?: string;
  title?: string;
}

/**
 * Generated token logo: seeded two-tone gradient with the meme glyph,
 * optional curve-progress ring and launchpad dot. Pure SVG, memoized.
 */
export const TokenAvatar = memo(function TokenAvatar({ seed, glyph, size = 32, launchpadColor, progress, className, title }: TokenAvatarProps) {
  const uid = useId().replace(/:/g, '');
  const h = hashString(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 35 + ((h >>> 9) % 100)) % 360;
  const angle = (h >>> 17) % 360;
  const ring = progress !== undefined && progress !== null;
  const p = Math.min(1, Math.max(0, progress ?? 0));
  const r = size / 2;
  const stroke = Math.max(1.5, size / 18);
  const ringR = r - stroke / 2;
  const inner = ring ? r - stroke - Math.max(1, size / 32) : r;
  const circumference = 2 * Math.PI * ringR;
  // A soft highlight blob whose position varies by seed.
  const bx = r + ((((h >>> 3) % 100) / 100) * 2 - 1) * inner * 0.5;
  const by = r + ((((h >>> 11) % 100) / 100) * 2 - 1) * inner * 0.5;
  const dot = Math.max(6, Math.round(size * 0.28));

  return (
    <span className={clsx('relative inline-flex shrink-0', className)} style={{ width: size, height: size }} title={title} aria-hidden={title ? undefined : true}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`tg${uid}`} gradientTransform={`rotate(${angle} 0.5 0.5)`}>
            <stop offset="0" stopColor={`hsl(${hue1} 72% 56%)`} />
            <stop offset="1" stopColor={`hsl(${hue2} 70% 32%)`} />
          </linearGradient>
          <clipPath id={`tc${uid}`}>
            <circle cx={r} cy={r} r={inner} />
          </clipPath>
        </defs>
        <circle cx={r} cy={r} r={inner} fill={`url(#tg${uid})`} />
        <circle cx={bx} cy={by} r={inner * 0.75} fill="#fff" fillOpacity={0.12} clipPath={`url(#tc${uid})`} />
        {glyph && (
          <text x={r} y={r} textAnchor="middle" dominantBaseline="central" fontSize={inner * 1.05} style={{ userSelect: 'none' }}>
            {glyph}
          </text>
        )}
        {ring && (
          <>
            <circle cx={r} cy={r} r={ringR} fill="none" strokeWidth={stroke} style={{ stroke: 'rgb(var(--line-strong))' }} />
            {p > 0 && (
              <circle
                cx={r}
                cy={r}
                r={ringR}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circumference * p} ${circumference}`}
                transform={`rotate(-90 ${r} ${r})`}
                style={{ stroke: p >= 1 ? 'rgb(var(--up))' : 'rgb(var(--accent))' }}
              />
            )}
          </>
        )}
      </svg>
      {launchpadColor && (
        <span className="absolute -bottom-px -right-px rounded-full border-2 border-panel" style={{ width: dot, height: dot, background: launchpadColor }} />
      )}
    </span>
  );
});
