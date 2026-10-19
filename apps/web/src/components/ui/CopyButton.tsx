import { Check, Copy } from 'lucide-react';
import clsx from 'clsx';
import { useClipboard } from '@/hooks/useClipboard';

export interface CopyButtonProps {
  text: string;
  /** Accessible label (default "Copy"); also the visible text when `showLabel`. */
  label?: string;
  showLabel?: boolean;
  /** Icon size in px. */
  size?: number;
  className?: string;
}

/**
 * Copies `text`, then shows a check for ~1s. Stops click propagation so it
 * is safe inside clickable rows and links.
 */
export function CopyButton({ text, label = 'Copy', showLabel, size = 12, className }: CopyButtonProps) {
  const { copied, copy } = useClipboard();
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copy(text);
      }}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded text-faint transition-colors hover:text-fg',
        showLabel ? 'h-6 px-1.5 text-xs hover:bg-panel-3' : 'p-0.5',
        copied && '!text-up',
        className,
      )}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
      {showLabel && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}
