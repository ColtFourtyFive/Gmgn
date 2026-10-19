import { memo } from 'react';
import clsx from 'clsx';
import { hashString } from './color';

export interface WalletAvatarProps {
  /** WalletProfile.avatarSeed or the address itself. */
  seed: string;
  size?: number;
  className?: string;
  title?: string;
}

/** 5×5 mirrored identicon generated from a seed (crisp at any size). */
export const WalletAvatar = memo(function WalletAvatar({ seed, size = 20, className, title }: WalletAvatarProps) {
  const h = hashString(seed);
  const bits = hashString(`${seed}#cells`);
  const hue = h % 360;
  const color = `hsl(${hue} 68% 56%)`;
  const cells: [number, number][] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if ((bits >>> (row * 3 + col)) & 1) {
        cells.push([col, row]);
        if (col < 2) cells.push([4 - col, row]);
      }
    }
  }
  return (
    <span
      className={clsx('inline-flex shrink-0 overflow-hidden rounded-[4px]', className)}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      <svg width={size} height={size} viewBox="-0.5 -0.5 6 6" shapeRendering="crispEdges">
        <rect x={-0.5} y={-0.5} width={6} height={6} fill={color} fillOpacity={0.16} />
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
        ))}
      </svg>
    </span>
  );
});
