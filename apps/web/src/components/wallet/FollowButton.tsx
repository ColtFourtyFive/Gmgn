import { useId, useState, type FormEvent } from 'react';
import { shortAddress, type ChainId, type FollowedWallet } from '@trenchscope/shared';
import { Bell, Star, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Button, IconButton, Input, Popover, Spinner, Toggle } from '@/components/ui';
import { requireAuth, useSession } from '@/store/session';
import { DEFAULT_GROUP, GROUP_MAX, REMARK_MAX, useFollowActions, useFollowGroups, useFollowRecord } from './follows';

export interface FollowEditorProps {
  chain: ChainId;
  follow: FollowedWallet;
  /** Display name for toasts. */
  name?: string | null;
  onDone: () => void;
}

/** Remark / group / notify form for a followed wallet, with Unfollow. */
export function FollowEditor({ chain, follow, name, onDone }: FollowEditorProps) {
  const groups = useFollowGroups();
  const { update, unfollow, busy } = useFollowActions();
  const [remark, setRemark] = useState(follow.remark);
  const [group, setGroup] = useState(follow.group || DEFAULT_GROUP);
  const [notify, setNotify] = useState(follow.notify);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const g = group.trim() || DEFAULT_GROUP;
    const ok = await update(chain, follow.address, { remark: remark.trim(), group: g, notify });
    if (ok) onDone();
  };

  return (
    // Portaled content still bubbles React events: keep clicks away from clickable table rows.
    <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="flex w-[min(300px,calc(100vw-32px))] flex-col gap-3 p-3" aria-label="Edit followed wallet">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-remark`} className="text-xs font-medium text-muted">
          Remark <span className="text-faint">(only you see it)</span>
        </label>
        <Input
          id={`${id}-remark`}
          data-autofocus
          value={remark}
          maxLength={REMARK_MAX}
          placeholder={name || 'e.g. Early sniper'}
          onChange={(e) => setRemark(e.target.value)}
          suffix={<span className="num text-faint">{remark.length}/{REMARK_MAX}</span>}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-group`} className="text-xs font-medium text-muted">
          Group
        </label>
        <Input id={`${id}-group`} value={group} maxLength={GROUP_MAX} onChange={(e) => setGroup(e.target.value)} list={`${id}-groups`} />
        <datalist id={`${id}-groups`}>
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        {groups.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className={clsx('chip border transition-colors', g === group ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>
      <Toggle checked={notify} onChange={setNotify} label="Notify on every trade" description="Bell notification when this wallet buys or sells" size="sm" />
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 size={13} />}
          disabled={busy}
          onClick={async () => {
            if (await unfollow(chain, follow.address, { name })) onDone();
          }}
        >
          Unfollow
        </Button>
        <Button size="sm" variant="primary" type="submit" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

export interface FollowButtonProps {
  chain: ChainId;
  address: string;
  /** Name for toasts and labels (KOL handle). */
  name?: string | null;
  /** Server-side isFollowed, used until the follows list is loaded. */
  isFollowed?: boolean;
  /** `button` = labelled button (headers); `icon` = star icon (dense rows). */
  variant?: 'button' | 'icon';
  size?: 'xs' | 'sm' | 'md';
  /** Open the remark/group editor right after following. */
  editAfterFollow?: boolean;
  className?: string;
}

/**
 * Follow toggle. Not following: one click follows (sign-in prompt when signed
 * out). Following: opens the remark / group / notify editor with Unfollow.
 * Both states render the same button element (only its label, icon and popup
 * wiring change), and it is never natively disabled, so keyboard focus stays
 * on it when the state flips (follow, or unfollow from the editor).
 */
export function FollowButton({ chain, address, name, isFollowed, variant = 'button', size = 'sm', editAfterFollow, className }: FollowButtonProps) {
  const signedIn = useSession((s) => !!s.token);
  const record = useFollowRecord(chain, address);
  const { follow, busy } = useFollowActions();
  const [open, setOpen] = useState(false);
  const followed = record !== undefined ? record !== null : signedIn && !!isFollowed;
  const editable = followed && !!record;
  const who = name || shortAddress(address);

  const onFollow = () => {
    if (busy || followed) return;
    requireAuth(() => {
      void follow(chain, address, {}, { name }).then((f) => {
        if (f && editAfterFollow) setOpen(true);
      });
    });
  };

  const iconSize = size === 'md' ? 'md' : size === 'sm' ? 'sm' : 'xs';
  const trigger =
    variant === 'icon' ? (
      <IconButton
        label={editable ? `Following ${who} — edit` : followed ? `Following ${who}` : `Follow ${who}`}
        size={iconSize}
        icon={busy ? <Spinner size={12} label="" /> : <Star size={14} className={clsx(followed && 'fill-current text-accent')} />}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        onClick={
          editable
            ? undefined
            : (e) => {
                e.stopPropagation();
                onFollow();
              }
        }
        className={className}
      />
    ) : editable ? (
      <Button size={size} variant="soft" icon={<Star size={size === 'xs' ? 12 : 14} className="fill-current text-accent" />} className={className}>
        Following
        {record.notify && <Bell size={11} className="text-muted" aria-label="notifications on" />}
      </Button>
    ) : (
      <Button size={size} variant="outline" icon={<Star size={size === 'xs' ? 12 : 14} />} loading={busy} onClick={onFollow} className={className} aria-label={`Follow ${who}`}>
        Follow
      </Button>
    );

  // Always a Popover (disabled until there is a follow to edit), so the trigger is the same element in both states.
  return (
    <Popover trigger={trigger} open={open && editable} onOpenChange={setOpen} disabled={!editable} placement="bottom-end" aria-label="Edit followed wallet">
      {(close) => (record ? <FollowEditor chain={chain} follow={record} name={name} onDone={close} /> : null)}
    </Popover>
  );
}
