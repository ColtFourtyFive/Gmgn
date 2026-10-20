// Settings → Security (live mode): TOTP two-factor authentication (enrol with
// a QR code or the manual secret, confirm with a code, recovery codes shown
// once), the withdrawal whitelist (new addresses wait out an activation
// delay), the password and recent security events.

import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { shortAddress, type ChainId, type SecurityEvent, type SecurityStatus, type TotpSetup, type WhitelistEntry } from '@trenchscope/shared';
import { Check, Download, History, KeyRound, ListChecks, LockKeyhole, Plus, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { Age, ExplorerLink } from '@/components/common';
import { fundsKeys, useSecurityStatus } from '@/components/funds/queries';
import { QrCode } from '@/components/funds/QrCode';
import { formatCountdown, isSolanaAddress, isTotpCode, isTotpOrRecoveryCode, normalizeCode } from '@/components/funds/model';
import { TotpInput } from '@/components/funds/TotpInput';
import { Badge, Button, Checkbox, CopyButton, EmptyState, ErrorState, Field, Input, Modal, Panel, SkeletonText } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { Note } from '../FormBits';

const CHAIN: ChainId = 'sol';

/** Pending/error state around one async action. */
function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { pending, error, setError, run };
}

function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="rounded border border-down/30 bg-down/10 px-2.5 py-1.5 text-sm text-down">
      {error}
    </p>
  ) : null;
}

/** Refresh everything that depends on the security status (and the account's twoFactorEnabled flag). */
function useSecurityRefresh(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: fundsKeys.security });
    void useSession.getState().refreshAccount().catch(() => undefined);
  };
}

export function SecuritySection() {
  const status = useSecurityStatus();
  if (status.isLoading) {
    return (
      <div className="grid gap-3 lg:grid-cols-2" aria-busy="true" aria-label="Loading security settings">
        <Panel>
          <SkeletonText lines={4} />
        </Panel>
        <Panel>
          <SkeletonText lines={4} />
        </Panel>
      </div>
    );
  }
  if (status.isError || !status.data) {
    return (
      <Panel>
        <ErrorState title="Couldn’t load your security settings" error={status.error} onRetry={() => void status.refetch()} retrying={status.isFetching} />
      </Panel>
    );
  }
  const s = status.data;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <TwoFactorPanel enabled={s.twoFactorEnabled} />
      <WhitelistPanel status={s} />
      <PasswordPanel twoFactor={s.twoFactorEnabled} />
      <EventsPanel events={s.recentEvents} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Two-factor authentication
// ---------------------------------------------------------------------------

function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const start = useAction();
  const refreshSecurity = useSecurityRefresh();

  return (
    <Panel
      title="Two-factor authentication"
      icon={<KeyRound size={14} />}
      actions={<Badge tone={enabled ? 'up' : 'warn'}>{enabled ? 'On' : 'Off'}</Badge>}
    >
      {enabled ? (
        <DisableTwoFactor />
      ) : setup ? (
        <EnrolTwoFactor
          setup={setup}
          onCancel={() => setSetup(null)}
          onEnabled={(codes) => {
            setSetup(null);
            setRecovery(codes);
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Protect sign-ins and withdrawals with a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…). Withdrawals and new withdrawal
            addresses need it.
          </p>
          <FormError error={start.error} />
          <Button
            variant="primary"
            icon={<ShieldCheck size={14} />}
            loading={start.pending}
            className="self-start"
            onClick={() => void start.run(async () => setSetup(await api.setupTotp()))}
          >
            Set up two-factor authentication
          </Button>
        </div>
      )}
      <RecoveryCodesDialog
        codes={recovery}
        onDone={() => {
          setRecovery(null);
          refreshSecurity();
        }}
      />
    </Panel>
  );
}

/** "ABCD EFGH IJKL ..." for reading a base32 secret aloud or typing it. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function EnrolTwoFactor({ setup, onCancel, onEnabled }: { setup: TotpSetup; onCancel: () => void; onEnabled: (recoveryCodes: string[]) => void }) {
  const ids = useId();
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const enable = useAction();
  const invalid = touched && !isTotpCode(code);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isTotpCode(code)) return;
    void enable.run(async () => {
      const res = await api.enableTotp(normalizeCode(code));
      onEnabled(res.recoveryCodes);
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
        <li>Scan the QR code with your authenticator app, or enter the key by hand.</li>
        <li>Type the 6-digit code the app shows to turn two-factor on.</li>
      </ol>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <QrCode value={setup.otpauthUrl} alt="QR code for your authenticator app" size={160} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium text-muted">Setup key</p>
          <div className="flex items-start gap-1.5">
            <code className="num break-all font-mono text-sm text-fg" data-testid="totp-secret">
              {groupSecret(setup.secret)}
            </code>
            <CopyButton text={setup.secret} label="Copy setup key" />
          </div>
          <p className="text-xs text-faint">Time-based, 6 digits, 30 seconds.</p>
        </div>
      </div>
      <Field label="Code from the app" htmlFor={`${ids}-code`} error={invalid ? 'Enter the 6-digit code from your authenticator app' : undefined}>
        <TotpInput id={`${ids}-code`} value={code} onChange={setCode} invalid={invalid} data-autofocus />
      </Field>
      <FormError error={enable.error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={enable.pending} icon={<ShieldCheck size={14} />}>
          Turn on
        </Button>
      </div>
    </form>
  );
}

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Recovery codes, shown exactly once right after 2FA is turned on. The dialog
 * stays open (no Escape / overlay close) until the user confirms they saved them.
 */
function RecoveryCodesDialog({ codes, onDone }: { codes: string[] | null; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = codes?.join('\n') ?? '';
  return (
    <Modal
      open={codes !== null}
      onClose={() => {
        if (saved) onDone();
      }}
      closeOnOverlay={false}
      hideClose
      size="sm"
      title="Save your recovery codes"
      description="Each code turns off two-factor authentication once if you lose your authenticator. They are shown only now."
      footer={
        <Button
          variant="primary"
          disabled={!saved}
          onClick={() => {
            setSaved(false);
            onDone();
          }}
        >
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <ul className="grid grid-cols-2 gap-1.5 rounded border border-line bg-panel-2 p-2.5" aria-label="Recovery codes">
          {codes?.map((c) => (
            <li key={c} className="num font-mono text-sm text-fg">
              {c}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={text} label="Copy codes" showLabel />
          <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={() => downloadText('trenchscope-recovery-codes.txt', `Trenchscope recovery codes\n\n${text}\n`)}>
            Download
          </Button>
        </div>
        <Note tone="warn">Store them somewhere safe and offline. Anyone with a code and your password can turn off two-factor authentication.</Note>
        <Checkbox checked={saved} onChange={setSaved} label="I saved my recovery codes" />
      </div>
    </Modal>
  );
}

/** Turn 2FA off with a TOTP or recovery code. The server then signs out every session, this one included. */
function DisableTwoFactor() {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const disable = useAction();
  const valid = isTotpOrRecoveryCode(code);

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Sign-ins, withdrawals and whitelist changes ask for a code from your authenticator app.</p>
        <Button variant="outline" icon={<ShieldOff size={14} />} className="self-start" onClick={() => setOpen(true)}>
          Turn off
        </Button>
      </div>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    void disable
      .run(async () => {
        await api.disableTotp(normalizeCode(code));
      })
      .then(async (ok) => {
        if (!ok) return;
        toast.success('Two-factor authentication is off', 'Every session was signed out: sign in again. Withdrawals stay disabled until you turn it back on.');
        await useSession.getState().logout();
        useSession.getState().promptAuth(true, 'login');
      });
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Note tone="warn">Without two-factor authentication you can’t withdraw or add withdrawal addresses. Turning it off signs you out everywhere.</Note>
      <Field
        label="Code from your app (or a recovery code)"
        htmlFor={`${ids}-code`}
        error={touched && !valid ? 'Enter the 6-digit code or a recovery code' : undefined}
      >
        <TotpInput id={`${ids}-code`} value={code} onChange={setCode} allowRecovery invalid={touched && !valid} data-autofocus />
      </Field>
      <FormError error={disable.error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={disable.pending} icon={<ShieldOff size={14} />}>
          Turn off two-factor
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Withdrawal whitelist
// ---------------------------------------------------------------------------

function WhitelistPanel({ status }: { status: SecurityStatus }) {
  const now = useNow();
  const entries = status.whitelist.filter((e) => e.chain === CHAIN).sort((a, b) => b.addedAt - a.addedAt);
  const delay = formatCountdown(status.whitelistDelayMs);
  return (
    <Panel title="Withdrawal addresses" icon={<ListChecks size={14} />} subtitle="Withdrawals only go to these">
      <div className="flex flex-col gap-3">
        {!status.twoFactorEnabled && <Note tone="warn">Turn on two-factor authentication to add or remove withdrawal addresses.</Note>}
        {entries.length === 0 ? (
          <p className="text-sm text-muted">No addresses yet. New addresses can receive withdrawals {delay} after you add them.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line" aria-label="Whitelisted addresses">
            {entries.map((e) => (
              <WhitelistRow key={e.address} entry={e} now={now} canEdit={status.twoFactorEnabled} />
            ))}
          </ul>
        )}
        {status.twoFactorEnabled && <AddAddressForm delay={delay} existing={entries} />}
      </div>
    </Panel>
  );
}

function WhitelistRow({ entry: e, now, canEdit }: { entry: WhitelistEntry; now: number; canEdit: boolean }) {
  const ids = useId();
  const [removing, setRemoving] = useState(false);
  const [code, setCode] = useState('');
  const remove = useAction();
  const refreshSecurity = useSecurityRefresh();
  const active = e.activeAt <= now;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!isTotpCode(code)) {
      remove.setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    void remove
      .run(async () => {
        await api.removeWhitelist({ chain: e.chain, address: e.address, code: normalizeCode(code) });
      })
      .then((ok) => {
        if (!ok) return;
        toast.success('Address removed', e.label || shortAddress(e.address, 4, 4));
        refreshSecurity();
      });
  };

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{e.label || 'Unnamed address'}</p>
          <p className="flex items-center gap-0.5 text-xs text-muted" title={e.address}>
            <span className="num font-mono">{shortAddress(e.address, 6, 6)}</span>
            <CopyButton text={e.address} label="Copy address" />
            <ExplorerLink chain={e.chain} kind="address" value={e.address} />
          </p>
        </div>
        {active ? (
          <Badge tone="up" icon={<Check size={11} />}>
            Active
          </Badge>
        ) : (
          <Badge tone="warn" title={`Can receive withdrawals from ${new Date(e.activeAt).toLocaleString()}`}>
            <span className="num">Activates in {formatCountdown(e.activeAt - now)}</span>
          </Badge>
        )}
        {canEdit && !removing && (
          <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setRemoving(true)} aria-label={`Remove ${e.label || shortAddress(e.address, 4, 4)}`}>
            <span className="hidden sm:inline">Remove</span>
          </Button>
        )}
      </div>
      {removing && (
        <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel-2 p-2">
          <Field label="Two-factor code" htmlFor={`${ids}-code`} className="min-w-[140px] flex-1">
            <TotpInput id={`${ids}-code`} value={code} onChange={setCode} size="sm" autoFocus />
          </Field>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(false)}>
            Cancel
          </Button>
          <Button size="sm" type="submit" variant="danger" loading={remove.pending}>
            Remove
          </Button>
          {remove.error && (
            <p role="alert" className="w-full text-xs text-down">
              {remove.error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

type AddErrors = Partial<Record<'label' | 'address' | 'code', string>>;

export function validateWhitelistAdd(f: { label: string; address: string; code: string }, existing: readonly Pick<WhitelistEntry, 'address'>[]): AddErrors {
  const errors: AddErrors = {};
  const address = f.address.trim();
  if (!f.label.trim()) errors.label = 'Name it, e.g. “Ledger” or “Exchange”';
  else if (f.label.trim().length > 32) errors.label = 'Keep the name under 32 characters';
  if (!address) errors.address = 'Paste a Solana address';
  else if (!isSolanaAddress(address)) errors.address = 'That isn’t a Solana address';
  else if (existing.some((e) => e.address === address)) errors.address = 'This address is already on the list';
  if (!isTotpCode(f.code)) errors.code = 'Enter the 6-digit code from your authenticator app';
  return errors;
}

function AddAddressForm({ delay, existing }: { delay: string; existing: WhitelistEntry[] }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const add = useAction();
  const refreshSecurity = useSecurityRefresh();
  const errors = validateWhitelistAdd({ label, address, code }, existing);
  const shown = touched ? errors : {};

  if (!open) {
    return (
      <Button variant="outline" size="sm" icon={<Plus size={13} />} className="self-start" onClick={() => setOpen(true)}>
        Add address
      </Button>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    void add
      .run(async () => {
        const entry = await api.addWhitelist({ chain: CHAIN, address: address.trim(), label: label.trim(), code: normalizeCode(code) });
        toast.success('Address added', `${entry.label || shortAddress(entry.address, 4, 4)} can receive withdrawals in ${delay}.`);
      })
      .then((ok) => {
        if (!ok) return;
        setOpen(false);
        setLabel('');
        setAddress('');
        setCode('');
        setTouched(false);
        refreshSecurity();
      });
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded border border-line bg-panel-2 p-3" aria-label="Add a withdrawal address">
      <Field label="Name" htmlFor={`${ids}-label`} error={shown.label}>
        <Input id={`${ids}-label`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} invalid={!!shown.label} autoComplete="off" autoFocus />
      </Field>
      <Field label="Solana address" htmlFor={`${ids}-address`} error={shown.address}>
        <Input
          id={`${ids}-address`}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          invalid={!!shown.address}
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-xs"
        />
      </Field>
      <Field label="Two-factor code" htmlFor={`${ids}-code`} error={shown.code}>
        <TotpInput id={`${ids}-code`} value={code} onChange={setCode} invalid={!!shown.code} />
      </Field>
      <Note>For your safety a new address can receive withdrawals only {delay} after you add it.</Note>
      <FormError error={add.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={add.pending} icon={<Plus size={14} />}>
          Add address
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/** Live passwords guard real funds (the server enforces the same minimum). */
const MIN_PASSWORD = 10;

type PasswordErrors = Partial<Record<'current' | 'next' | 'confirm' | 'code', string>>;

export function validatePasswordChange(f: { current: string; next: string; confirm: string; code: string }, twoFactor: boolean): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!f.current) errors.current = 'Enter your current password';
  if (f.next.length < MIN_PASSWORD) errors.next = `Use at least ${MIN_PASSWORD} characters`;
  else if (f.next === f.current) errors.next = 'Pick a password different from the current one';
  if (f.confirm !== f.next) errors.confirm = 'The passwords don’t match';
  if (twoFactor && !isTotpCode(f.code)) errors.code = 'Enter the 6-digit code from your authenticator app';
  return errors;
}

/** Change the password: every other session is signed out and this one continues on a fresh token. */
function PasswordPanel({ twoFactor }: { twoFactor: boolean }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const change = useAction();
  const errors = validatePasswordChange({ current, next, confirm, code }, twoFactor);
  const shown = touched ? errors : {};

  const reset = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    setCode('');
    setTouched(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    void change
      .run(async () => {
        const res = await api.changePassword({ currentPassword: current, newPassword: next, code: twoFactor ? normalizeCode(code) : undefined });
        await useSession.getState().applyAuth(res);
      })
      .then((ok) => {
        if (!ok) return;
        toast.success('Password changed', 'Every other session was signed out.');
        reset();
      });
  };

  return (
    <Panel title="Password" icon={<LockKeyhole size={14} />}>
      {!open ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Changing it signs out every other device.</p>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
            Change password
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-label="Change password">
          <Field label="Current password" htmlFor={`${ids}-cur`} error={shown.current}>
            <Input id={`${ids}-cur`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} invalid={!!shown.current} autoFocus />
          </Field>
          <Field label="New password" htmlFor={`${ids}-new`} error={shown.next} hint={`At least ${MIN_PASSWORD} characters.`}>
            <Input id={`${ids}-new`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} invalid={!!shown.next} minLength={MIN_PASSWORD} />
          </Field>
          <Field label="Repeat the new password" htmlFor={`${ids}-rep`} error={shown.confirm}>
            <Input id={`${ids}-rep`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!shown.confirm} />
          </Field>
          {twoFactor && (
            <Field label="Two-factor code" htmlFor={`${ids}-code`} error={shown.code}>
              <TotpInput id={`${ids}-code`} value={code} onChange={setCode} invalid={!!shown.code} />
            </Field>
          )}
          <FormError error={change.error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={change.pending}>
              Change password
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Recent security events
// ---------------------------------------------------------------------------

const EVENT_LABEL: Record<string, string> = {
  register: 'Account created',
  wallet_created: 'Wallet created',
  login: 'Signed in',
  login_failed: 'Failed sign-in',
  password_changed: 'Password changed',
  password_change_failed: 'Failed password change',
  '2fa_enabled': 'Two-factor turned on',
  '2fa_disabled': 'Two-factor turned off',
  '2fa_failed': 'Wrong two-factor code',
  '2fa_locked': 'Two-factor locked after wrong codes',
  recovery_code_used: 'Recovery code used',
  whitelist_add: 'Withdrawal address added',
  whitelist_label: 'Withdrawal address renamed',
  whitelist_remove: 'Withdrawal address removed',
  withdrawal: 'Withdrawal',
  withdrawal_requested: 'Withdrawal requested',
  withdrawal_rejected: 'Withdrawal rejected',
  withdrawal_sent: 'Withdrawal sent',
  withdrawal_confirmed: 'Withdrawal confirmed',
  withdrawal_failed: 'Withdrawal failed',
};

/** Readable name of a security event action ("whitelist_add" -> "Withdrawal address added"). */
export function eventLabel(action: string): string {
  return EVENT_LABEL[action] ?? (action.charAt(0).toUpperCase() + action.slice(1)).replace(/_/g, ' ');
}

/** Events worth a second look, shown in red. */
const ALERT_ACTIONS = new Set(['login_failed', 'password_change_failed', '2fa_disabled', '2fa_failed', '2fa_locked', 'recovery_code_used', 'withdrawal_rejected', 'withdrawal_failed']);

function EventsPanel({ events, className }: { events: SecurityEvent[]; className?: string }) {
  return (
    <Panel title="Recent security activity" icon={<History size={14} />} className={className}>
      {events.length === 0 ? (
        <EmptyState compact icon={<History size={16} />} title="Nothing yet" description="Sign-ins, two-factor changes, address changes and withdrawals show up here." />
      ) : (
        <ul className="flex flex-col divide-y divide-line" aria-label="Security events">
          {events.map((ev, i) => (
            <EventRow key={`${ev.at}-${ev.action}-${i}`} event={ev} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function EventRow({ event: ev }: { event: SecurityEvent }): ReactNode {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-sm">
      <span className={ALERT_ACTIONS.has(ev.action) ? 'font-medium text-down' : 'font-medium text-fg'}>{eventLabel(ev.action)}</span>
      {ev.detail && <span className="min-w-0 flex-1 truncate text-xs text-muted">{ev.detail}</span>}
      <span className="ml-auto flex items-center gap-2 text-xs text-faint">
        {ev.ip && <span className="num font-mono">{ev.ip}</span>}
        <Age ts={ev.at} suffix=" ago" />
      </span>
    </li>
  );
}
