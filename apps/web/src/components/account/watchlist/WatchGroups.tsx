// Watchlist group and note editing: the star with its group picker (token
// pages, watchlist rows), the note editor and the group name / colour form.

import { useState, type FormEvent } from 'react';
import { WATCHLIST_LIMITS, type WatchlistGroup } from '@trenchscope/shared';
import { Check, Plus, Star, StarOff } from 'lucide-react';
import clsx from 'clsx';
import { Button, Checkbox, IconButton, Input, Popover, type IconButtonProps } from '@/components/ui';
import { useSession } from '@/store/session';
import { GROUP_COLORS, groupNameError, useWatchItem, useWatchlist, useWatchlistActions, type WatchRef } from '../watchlist';

/** Colour dot of a group (hollow when it has no colour). */
export function GroupDot({ color, className }: { color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', !color && 'border border-line-strong', className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/** Swatch row; `null` = no colour. */
export function ColorSwatches({ value, onChange }: { value: string | null; onChange: (color: string | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Group colour" className="flex flex-wrap gap-1.5">
      {[null, ...GROUP_COLORS].map((c) => (
        <button
          key={c ?? 'none'}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c ?? 'No colour'}
          title={c ?? 'No colour'}
          onClick={() => onChange(c)}
          className={clsx(
            'flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-110',
            c ? 'border-transparent' : 'border-line-strong bg-panel-2',
            value === c && 'ring-2 ring-fg/70 ring-offset-1 ring-offset-panel',
          )}
          style={c ? { backgroundColor: c } : undefined}
        >
          {value === c && <Check size={11} strokeWidth={3} className={c ? 'text-black/70' : 'text-muted'} aria-hidden />}
        </button>
      ))}
    </div>
  );
}

export interface GroupFormProps {
  groups: WatchlistGroup[];
  /** Editing this group (rename / recolour); creating otherwise. */
  group?: WatchlistGroup;
  onSubmit: (name: string, color: string | null) => Promise<unknown>;
  onCancel: () => void;
}

/** Name + colour form for a new or existing group. */
export function GroupForm({ groups, group, onSubmit, onCancel }: GroupFormProps) {
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState<string | null>(group ? (group.color ?? null) : GROUP_COLORS[groups.length % GROUP_COLORS.length]);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const error = groupNameError(name, groups, group?.id);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    setSaving(true);
    await onSubmit(name.trim(), color);
    setSaving(false);
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <Input
          size="sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={WATCHLIST_LIMITS.groupNameMaxLength}
          placeholder="e.g. Majors, Degen plays"
          invalid={touched && !!error}
          autoFocus
        />
        {touched && error && <span className="text-down">{error}</span>}
      </label>
      <ColorSwatches value={color} onChange={setColor} />
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" variant="primary" type="submit" loading={saving}>
          {group ? 'Save' : 'Create group'}
        </Button>
      </div>
    </form>
  );
}

/** Private note field: saves on Enter (then `onEnter`) or when it loses focus; a blank note removes it. */
export function NoteField({ token, note, disabled, onEnter }: { token: WatchRef; note: string; disabled?: boolean; onEnter?: () => void }) {
  const { update } = useWatchlistActions();
  const [draft, setDraft] = useState(note);
  const save = () => {
    if (draft.trim() !== note) void update(token, { note: draft });
  };
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span className="flex justify-between">
        Note
        <span className="num text-faint">
          {draft.length}/{WATCHLIST_LIMITS.noteMaxLength}
        </span>
      </span>
      <Input
        size="sm"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
            onEnter?.();
          }
        }}
        maxLength={WATCHLIST_LIMITS.noteMaxLength}
        placeholder="Why you’re watching it (only you see this)"
      />
    </label>
  );
}

/**
 * Group checkboxes, a quick "new group" form, the note and removal for one
 * watched token. `pending` while the token is still being added.
 */
export function GroupPicker({ token, pending, onDone }: { token: WatchRef; pending?: boolean; onDone: () => void }) {
  const groups = useWatchlist().data?.groups ?? [];
  const item = useWatchItem(token.chain, token.address);
  const actions = useWatchlistActions();
  const [creating, setCreating] = useState(false);
  const selected = item?.groupIds ?? [];
  const busy = pending || !item;

  const toggle = (id: string) => void actions.update(token, { groupIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <Star size={14} className="fill-accent text-accent" aria-hidden />
        {token.symbol}
        <span className="font-normal text-muted">{item ? 'is on your watchlist' : 'adding…'}</span>
      </p>
      <div className="flex flex-col gap-1.5">
        <p className="table-head">Groups</p>
        {groups.length === 0 && !creating && <p className="text-xs text-muted">No groups yet. Create one to sort your watchlist into tabs.</p>}
        {groups.length > 0 && (
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto" aria-label="Watchlist groups">
            {groups.map((g) => (
              <li key={g.id}>
                <Checkbox
                  checked={selected.includes(g.id)}
                  disabled={busy}
                  onChange={() => toggle(g.id)}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <GroupDot color={g.color} />
                      {g.name}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {creating ? (
          <div className="rounded border border-line bg-panel-2 p-2">
            <GroupForm
              groups={groups}
              onCancel={() => setCreating(false)}
              onSubmit={async (name, color) => {
                const g = await actions.createGroup(name, color ?? undefined);
                if (!g) return;
                setCreating(false);
                if (item) void actions.update(token, { groupIds: [...selected, g.id] });
              }}
            />
          </div>
        ) : (
          groups.length < WATCHLIST_LIMITS.maxGroups && (
            <button type="button" className="inline-flex items-center gap-1 self-start text-xs text-accent hover:underline disabled:opacity-50" disabled={busy} onClick={() => setCreating(true)}>
              <Plus size={12} aria-hidden /> New group
            </button>
          )
        )}
      </div>
      {/* Keyed by the saved note so a server-side change resets the draft. */}
      <NoteField key={item?.note ?? ''} token={token} note={item?.note ?? ''} disabled={busy} />
      <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <Button
          size="xs"
          variant="danger"
          icon={<StarOff size={12} />}
          disabled={busy}
          onClick={() => {
            onDone();
            void actions.remove(token);
          }}
        >
          Remove
        </Button>
        <Button size="xs" variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/**
 * Watchlist star: a click on an unwatched token adds it and opens the group
 * picker (file it under groups, add a note); on a watched token it opens the
 * picker. Signed out, it asks to sign in.
 */
export function WatchStar({ token, size = 'md', className }: { token: WatchRef; size?: IconButtonProps['size']; className?: string }) {
  const signedIn = useSession((s) => !!s.token);
  const item = useWatchItem(token.chain, token.address);
  const { add } = useWatchlistActions();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const watched = signedIn && !!item;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && !signedIn) {
          useSession.getState().promptAuth(true);
          return;
        }
        if (next && !item && !adding) {
          setAdding(true);
          // A failed add (already toasted) leaves nothing to edit.
          void add(token).then((res) => {
            setAdding(false);
            if (!res) setOpen(false);
          });
        }
        setOpen(next);
      }}
      placement="bottom-end"
      aria-label={`${token.symbol} watchlist groups`}
      className="w-72 p-3"
      trigger={
        <IconButton
          size={size}
          label={watched ? `${token.symbol} on watchlist: groups and note` : `Add ${token.symbol} to watchlist`}
          icon={<Star size={size === 'xs' ? 13 : 16} className={clsx(watched && 'fill-accent text-accent')} />}
          active={watched}
          className={className}
        />
      }
    >
      {(close) => <GroupPicker token={token} pending={adding} onDone={close} />}
    </Popover>
  );
}
