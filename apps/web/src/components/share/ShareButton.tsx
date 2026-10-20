import { useState, type MouseEvent, type SyntheticEvent } from 'react';
import { Share2 } from 'lucide-react';
import clsx from 'clsx';
import { Button, IconButton, type ButtonSize } from '@/components/ui';
import type { PnlShareData } from './model';
import { ShareCardModal } from './ShareCardModal';

// The dialog is portaled but still bubbles through React: keep its clicks away
// from clickable table rows around the button. Keys are left alone: rows only
// react to their own Enter, and the dialog's Escape / focus trap listen on document.
const stop = (e: SyntheticEvent) => e.stopPropagation();

export interface SharePnlButtonProps {
  /** Card numbers, read when the button is clicked (the card freezes them). */
  getData: () => PnlShareData;
  /** Icon-only (table rows) or a labelled button. */
  variant?: 'icon' | 'button';
  size?: ButtonSize;
  /** On the wrapper, so layout classes (ml-auto, ...) apply in the parent's flex row. */
  className?: string;
}

/** Opens the PnL share card for a position. */
export function SharePnlButton({ getData, variant = 'icon', size = 'xs', className }: SharePnlButtonProps) {
  const [data, setData] = useState<PnlShareData | null>(null);
  const open = (e: MouseEvent) => {
    e.stopPropagation();
    setData(getData());
  };
  return (
    <span className={clsx('inline-flex', className)} data-row-ignore onClick={stop}>
      {variant === 'icon' ? (
        <IconButton size={size} label="Share PnL card" icon={<Share2 size={13} />} onClick={open} />
      ) : (
        <Button size={size} variant="outline" icon={<Share2 size={13} />} onClick={open}>
          Share PnL
        </Button>
      )}
      {data && <ShareCardModal open onClose={() => setData(null)} data={data} />}
    </span>
  );
}
