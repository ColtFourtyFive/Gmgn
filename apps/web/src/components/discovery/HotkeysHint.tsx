import { Link } from 'react-router-dom';
import { Keyboard } from 'lucide-react';
import clsx from 'clsx';
import { IconButton, Kbd, Popover } from '@/components/ui';
import { routes } from '@/lib/chain';

export interface HotkeyRow {
  keys: string[];
  label: string;
}

/** Keyboard icon (accent while hotkeys are on) opening a cheat sheet of the page's shortcuts. */
export function HotkeysHint({ rows, enabled, className }: { rows: HotkeyRow[]; enabled: boolean; className?: string }) {
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
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3">
              <span className="text-muted">{r.label}</span>
              <span className="flex shrink-0 items-center gap-0.5">
                {r.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line pt-2 text-xs text-faint">
          {enabled ? 'Hovering or selecting in a column pauses its feed. ' : 'Hotkeys are turned off. '}
          <Link to={routes.settings()} className="text-accent hover:underline">
            Settings
          </Link>
        </p>
      </div>
    </Popover>
  );
}
