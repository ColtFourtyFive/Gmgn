import { Link } from 'react-router-dom';
import { Keyboard } from 'lucide-react';
import clsx from 'clsx';
import { IconButton, Kbd, Popover, Toggle } from '@/components/ui';
import { routes } from '@/lib/chain';

export interface HotkeyRow {
  keys: string[];
  label: string;
  /** Places a trade: only works with trading hotkeys on. */
  trading?: boolean;
}

export interface HotkeysHintProps {
  rows: HotkeyRow[];
  /** settings.display.hotkeys (every single-key shortcut). */
  enabled: boolean;
  /** The trading-hotkeys opt-in, for pages with a key that trades. */
  trading?: { enabled: boolean; onChange: (on: boolean) => void };
  className?: string;
}

/**
 * Keyboard icon (accent while hotkeys are on) opening a cheat sheet of the
 * page's shortcuts. Keys that trade are opt-in (off by default): the sheet
 * carries the switch, next to the keys it arms.
 */
export function HotkeysHint({ rows, enabled, trading, className }: HotkeysHintProps) {
  return (
    <Popover
      placement="bottom-end"
      aria-label="Keyboard shortcuts"
      className="w-64 p-3"
      trigger={
        <IconButton
          label="Keyboard shortcuts"
          size="sm"
          variant="outline"
          icon={<Keyboard size={15} />}
          className={clsx(enabled && '!text-up', className)}
        />
      }
    >
      <div className="flex flex-col gap-2 text-sm">
        <p className="flex items-center justify-between font-semibold">
          Keyboard shortcuts
          <span className={clsx('chip', enabled ? 'bg-up/15 text-up' : 'bg-panel-3 text-muted')}>{enabled ? 'On' : 'Off'}</span>
        </p>
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const off = r.trading && trading && !trading.enabled;
            return (
              <li key={r.label} className="flex items-center justify-between gap-3">
                <span className="text-muted">
                  {r.label}
                  {off && <span className="text-faint"> (off)</span>}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {r.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        {trading && (
          <div className="border-t border-line pt-2">
            <Toggle
              size="sm"
              checked={trading.enabled}
              onChange={trading.onChange}
              label="Trading hotkeys"
              description="Let B buy the selected token. Off by default; saved on this device."
            />
          </div>
        )}
        <p className="border-t border-line pt-2 text-xs text-faint">
          {enabled ? 'Hovering or selecting in a column pauses its feed. ' : 'Hotkeys are turned off. '}
          <Link to={routes.settings('display')} className="text-accent hover:underline">
            Settings
          </Link>
        </p>
      </div>
    </Popover>
  );
}
